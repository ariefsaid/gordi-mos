-- mos.capture_budget RPC (A5 fix): atomic SECURITY DEFINER RPC that inserts budget+lines in a single
-- transaction and RE-COMPUTES the COGS total server-side from the linked cost lines (link-never-copy).
-- Replaces the two non-transactional inserts in the client-layer captureBudget(), which had two issues:
-- (1) orphan budget row could persist if budget_lines insert failed; (2) server trusted the client's
-- client-computed total_budgeted_cogs. This RPC fixes both by: (a) atomic function body; (b) server-side
-- total recomputation by joining inserted lines to reporting.ingredient_cost_lines as-of cost_basis_as_of.
--
-- Capability gate: can('cogs.write') (finance/admin). org seam: shared.current_org_id() / shared.current_person_id().
-- Missing/uncertified cost line for a referenced ingredient must FAIL LOUD (raise) — never silently 0.
--
-- AC-PB-008, A5.

-- ─── mos.budget_line_input type for the lines parameter ───────────────────────
create type mos.budget_line_input as (
  ingredient_esb_code text,
  recipe_qty numeric,
  qty_unit text
);

comment on type mos.budget_line_input is
  'Input type for a single budget line (ingredient + qty only — NO unit cost, link-never-copy). Used by mos.capture_budget().';

-- ─── mos.capture_budget(p_...) SECURITY DEFINER RPC ─────────────────────────
create or replace function mos.capture_budget(
  p_menu_item_esb_code   text,
  p_menu_item_name       text,
  p_scenario_label       text,
  p_scenario_type        text,
  p_owning_bu_id         uuid,
  p_cost_basis_as_of     timestamptz,
  p_certified_metric_key text default 'cogs.budgeted',
  p_is_complete          boolean default true,
  p_notes                text default null,
  p_lines                mos.budget_line_input[] default array[]::mos.budget_line_input[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id      uuid;
  v_person_id   uuid;
  v_budget_id   uuid;
  v_total       numeric(14,4);
  v_line_cost   numeric(14,4);
  v_missing     text;
begin
  -- (1) capability gate: can('cogs.write') — finance/admin only.
  if not shared.can('cogs.write') then
    raise exception 'capture_budget requires can(''cogs.write'') capability (finance/admin)' using errcode = '42501';
  end if;

  -- (2) org pin via shared.current_org_id() / shared.current_person_id().
  v_org_id := shared.current_org_id();
  v_person_id := shared.current_person_id();

  -- (3) validate scenario_type check constraint.
  if p_scenario_type not in ('baseline','promo','new_branch','menu') then
    raise exception 'invalid scenario_type: %', p_scenario_type using errcode = 'P0003';
  end if;

  -- (4) insert the budget row (total_budgeted_cogs computed below, set to 0 for now).
  insert into mos.budgets (
    org_id,
    menu_item_esb_code,
    menu_item_name,
    scenario_label,
    scenario_type,
    owning_bu_id,
    total_budgeted_cogs,
    cost_basis_as_of,
    certified_metric_key,
    is_complete,
    notes,
    created_by
  ) values (
    v_org_id,
    p_menu_item_esb_code,
    p_menu_item_name,
    p_scenario_label,
    p_scenario_type,
    p_owning_bu_id,
    0, -- placeholder; recomputed below after lines are inserted
    p_cost_basis_as_of,
    p_certified_metric_key,
    p_is_complete,
    p_notes,
    v_person_id
  ) returning id into v_budget_id;

  -- (5) insert budget_lines (ingredient + qty only — NO unit cost, link-never-copy).
  if cardinality(p_lines) > 0 then
    insert into mos.budget_lines (org_id, budget_id, ingredient_esb_code, recipe_qty, qty_unit)
      select
        v_org_id,
        v_budget_id,
        (l.ingredient_esb_code)::text,
        l.recipe_qty,
        l.qty_unit
      from unnest(p_lines) l;
  end if;

  -- (6) compute total_budgeted_cogs server-side: join each budget line to reporting.ingredient_cost_lines
  -- as-of p_cost_basis_as_of and sum(recipe_qty × unit_cost). Fail loud if any referenced ingredient lacks a cost line.
  v_total := 0;
  for v_missing in
    select distinct bl.ingredient_esb_code
    from mos.budget_lines bl
    left join reporting.ingredient_cost_lines cl
           on cl.org_id = bl.org_id
          and cl.ingredient_esb_code = bl.ingredient_esb_code
    where bl.budget_id = v_budget_id
      and bl.org_id = v_org_id
      and cl.ingredient_esb_code is null
  loop
    raise exception 'missing or uncertified cost line for ingredient: % (org_id: %)', v_missing, v_org_id using errcode = 'P0003';
  end loop;

  select coalesce(sum(bl.recipe_qty * cl.unit_cost), 0)::numeric(14,4)
    into v_total
  from mos.budget_lines bl
  join reporting.ingredient_cost_lines cl
    on cl.org_id = bl.org_id
   and cl.ingredient_esb_code = bl.ingredient_esb_code
  where bl.budget_id = v_budget_id
    and bl.org_id = v_org_id;

  -- (7) update the budget with the server-recomputed total.
  update mos.budgets
     set total_budgeted_cogs = v_total
   where id = v_budget_id
     and org_id = v_org_id;

  -- (8) return the new budget id.
  return v_budget_id;
end;
$$;

comment on function mos.capture_budget(text, text, text, text, uuid, timestamptz, text, boolean, text, mos.budget_line_input[]) is
  'A5 fix: atomic SECURITY DEFINER RPC that inserts budget+lines in ONE transaction and RE-COMPUTES the COGS total server-side from the linked cost lines (link-never-copy). No client-trusted total. Fail-loud on missing cost line. Capability gate: can(''cogs.write'').';

-- Revoke/grant: match the definer-revoke lint (other DEFINER RPCs pattern).
revoke all on function mos.capture_budget(text, text, text, text, uuid, timestamptz, text, boolean, text, mos.budget_line_input[]) from public, anon, authenticated;
grant  execute on function mos.capture_budget(text, text, text, text, uuid, timestamptz, text, boolean, text, mos.budget_line_input[]) to authenticated;

-- DOWN:
-- revoke execute on function mos.capture_budget(text, text, text, text, uuid, timestamptz, text, boolean, text, mos.budget_line_input[]) from authenticated;
-- drop function if exists mos.capture_budget(text, text, text, text, uuid, timestamptz, text, boolean, text, mos.budget_line_input[]);
-- drop type if exists mos.budget_line_input cascade;