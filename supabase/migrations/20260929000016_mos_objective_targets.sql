-- Objective targets/write-up (#992, OD-OBJ-1): the structural-vs-content authority split.
--
-- An Objective gains an explicit Company-wide choice (distinct from unset), an optional quarter
-- beside its year, a JSONB write-up validated for shape and size, and a key-result child table
-- (what/target/current/unit/due/owner). Authority narrows to three tiers, all at the database
-- layer:
--   structural  (name, business_unit_id, is_company_wide, period_year, period_quarter,
--                archived_at; key-result add/remove and every target field) — admin only,
--                `shared.can('objective.manage')`. The ops_lead grant OD-V4-1 widened is revoked
--                (one shared.role_capabilities row); the tenant-local matrix no longer gates
--                Objectives at all, so `mos.can_manage_objective_definition` loses every caller.
--   content     (objectives.write_up; key-result current_value) — ops_lead org-wide via the new
--                `objective.edit_content` capability, plus the apex head of the Objective's OWN
--                Business Unit via `mos.can_edit_objective_content(objective id)`. Company-wide
--                and unset Objectives have no unit to head, so the BU arm excludes them.
-- The RLS UPDATE policy stays org-row-level on both tables; the BEFORE guard raises 42501 on any
-- column outside the writer's tier, so a write-up-only ops_lead save succeeds while their
-- rename on the same row fails loudly (never a silent no-op — mos_03 pins that shape).
--
-- Change history (#983): the objectives trigger is re-registered so `write_up` records
-- summary-only ("the write-up changed", never a content copy — change-history DA-2); the generic
-- trigger attaches to the new table; the read dispatch gains its org-read arm.
--
-- DOWN (ordered):
--   drop policy objective_key_results_select_org on mos.objective_key_results;
--   drop policy objective_key_results_insert_admin on mos.objective_key_results;
--   drop policy objective_key_results_update_org_row on mos.objective_key_results;
--   drop policy objective_key_results_delete_org_row on mos.objective_key_results;
--   drop trigger record_history_objective_key_results on mos.objective_key_results;
--   drop trigger objective_key_results_guard on mos.objective_key_results;
--   drop trigger objective_key_results_set_updated_at on mos.objective_key_results;
--   drop table mos.objective_key_results;
--   drop function mos._guard_objective_key_results();
--   drop policy objectives_insert_admin on mos.objectives;
--   drop policy objectives_update_org_row on mos.objectives;
--   create policy objectives_insert_can_manage_or_unit_lead on mos.objectives
--     for insert to authenticated
--     with check (org_id = shared.current_org_id()
--                 and mos.can_manage_objective_definition(business_unit_id));
--   create policy objectives_update_can_manage_or_unit_lead on mos.objectives
--     for update to authenticated
--     using  (org_id = shared.current_org_id())
--     with check (org_id = shared.current_org_id()
--                 and mos.can_manage_objective_definition(business_unit_id));
--     -- the pre-#992 bodies exactly as 20260909000006_mos_authority_settings.sql left them
--   re-insert ('ops_lead', 'objective.manage', 'org') into shared.role_capabilities;
--   delete the ('admin'/'ops_lead', 'objective.edit_content', 'org') rows;
--   restore mos._guard_objectives() to its 20260909000006 body (same-org refs + the OLD-unit
--     move arm through mos.can_manage_objective_definition — no structural/content split);
--   drop function mos.can_edit_objective_content(uuid);
--   drop function mos.get_work_write_scopes();  -- return type changes both ways; create or
--   -- replace is refused, so the 4-column pre-slice body is recreated after the drop
--   create function mos.get_work_write_scopes()
--   returns table(workline_org boolean, objective_org boolean,
--                 workline_bu_ids uuid[], objective_bu_ids uuid[])
--   language sql stable security definer set search_path = ''
--   as $$
--     with authority as (
--       select shared.role_authority_allows('workline.manage', null, null, null) as workline_org,
--              shared.role_authority_allows('objective.manage', null, null, null) as objective_org
--     ),
--     active_bu as (
--       select bu.id from shared.business_units bu
--        where bu.org_id = shared.current_org_id() and bu.archived_at is null
--     )
--     select a.workline_org, a.objective_org,
--            case when a.workline_org then '{}'::uuid[] else coalesce(
--              (select array_agg(b.id order by b.id) from active_bu b
--                where shared.role_authority_allows('workline.manage', b.id, null, null)),
--              '{}'::uuid[]) end,
--            case when a.objective_org then '{}'::uuid[] else coalesce(
--              (select array_agg(b.id order by b.id) from active_bu b
--                where shared.role_authority_allows('objective.manage', b.id, null, null)),
--              '{}'::uuid[]) end
--       from authority a
--   $$;
--   -- then the 20260909000006 revoke/grant pair: revoke execute from public, anon, authenticated;
--   -- grant execute to authenticated;
--   drop trigger record_history_objectives on mos.objectives;
--   create trigger record_history_objectives after insert or update or delete on mos.objectives
--     for each row execute function shared._record_history_write();
--   restore shared.can_read_history_record(text,text,text,text,jsonb) to its 20260929000010
--     body (drop the objective_key_results arm);
--   alter table mos.objectives
--     drop constraint objectives_write_up_size_limit,
--     drop constraint objectives_write_up_is_array,
--     drop constraint objectives_period_quarter_needs_year,
--     drop constraint objectives_period_quarter_range,
--     drop constraint objectives_company_wide_exclusive,
--     drop column write_up, drop column period_quarter, drop column is_company_wide;
--
--   (objectives_period_quarter_needs_year must go before `drop column period_quarter`: Postgres
--   refuses to drop a column a CHECK still references.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. New Objective columns — Company-wide, quarter, write-up
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
alter table mos.objectives
  add column is_company_wide boolean not null default false,
  add column period_quarter  smallint,
  add column write_up        jsonb;

comment on column mos.objectives.is_company_wide is
  'Explicit Company-wide Business Unit choice (#992). True only with a null business_unit_id '
  '(CHECK). Distinguishes "deliberately no single unit" from "not chosen yet" (both false, null).';
comment on column mos.objectives.period_quarter is
  'Optional quarter beside period_year (#992): 1-4 or null for the whole year. CHECK-bounded, '
  'never free text.';
comment on column mos.objectives.write_up is
  'The Notion-style write-up page (#992): one BlockNote document — a top-level JSON array of '
  'blocks — validated for shape and size only. Summary-only in change history (DA-2): the '
  'mechanism records THAT it changed, never its content.';

alter table mos.objectives add constraint objectives_company_wide_exclusive
  check ((is_company_wide = false) or (business_unit_id is null));
alter table mos.objectives add constraint objectives_period_quarter_range
  check (period_quarter is null or period_quarter between 1 and 4);
-- A quarter is "alongside its year" (OD-OBJ-1): a quarter without a year is an ambiguous period.
alter table mos.objectives add constraint objectives_period_quarter_needs_year
  check (period_quarter is null or period_year is not null);
alter table mos.objectives add constraint objectives_write_up_is_array
  check (write_up is null or jsonb_typeof(write_up) = 'array');
alter table mos.objectives add constraint objectives_write_up_size_limit
  check (write_up is null or pg_column_size(write_up) <= 262144);

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The capability rows — ops_lead trades objective.manage for objective.edit_content
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
insert into shared.role_capabilities (role, capability, scope) values
  ('admin',    'objective.edit_content', 'org'),
  ('ops_lead', 'objective.edit_content', 'org')
on conflict (role, capability) do nothing;

delete from shared.role_capabilities
 where role = 'ops_lead' and capability = 'objective.manage';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The content-authority predicate — the shape the guards share
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Takes the OBJECTIVE's id (not its business_unit_id): every caller — the objectives guard on
-- write_up, the key-result guard on current_value — holds a row whose parent objective is the
-- thing being edited, and the BU-head arm must read THAT row's unit (key results carry none).
create or replace function mos.can_edit_objective_content(p_objective_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select shared.can('objective.manage')
      or shared.can('objective.edit_content')
      or exists (
        select 1
          from mos.objectives o
         where o.id = p_objective_id
           and o.org_id = shared.current_org_id()
           and o.business_unit_id is not null
           and shared.is_business_unit_head(o.business_unit_id, shared.current_person_id()))
$$;
comment on function mos.can_edit_objective_content(uuid) is
  'Content authority over one Objective (#992): objective.manage, the org-wide '
  'objective.edit_content capability, or the apex head of the Objective''s own Business Unit '
  '(shared.is_business_unit_head — the same apex-head predicate the work authority shipped). '
  'Company-wide and unset Objectives have no unit to head, so the BU arm excludes them. '
  'SECURITY INVOKER.';
revoke execute on function mos.can_edit_objective_content(uuid) from public, anon;
grant  execute on function mos.can_edit_objective_content(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 4. The objectives guard — ONE guard per table: the old body re-pasted, then split
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Re-pasted in full from 20260909000006 (the last definition — rebuilding from an earlier body
-- silently reverts fixes), then extended: the OLD-unit move arm is subsumed by the structural
-- set, which now requires org-wide admin authority. Scoped to current_user = 'authenticated'
-- as before: seeds and SECURITY DEFINER RPCs run as the owner and are not the writer this gates.
create or replace function mos._guard_objectives()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bu_org  uuid;
  v_acc_org uuid;
begin
  if new.business_unit_id is not null then
    select bu.org_id into v_bu_org from shared.business_units bu where bu.id = new.business_unit_id;
    if v_bu_org is distinct from new.org_id then
      raise exception 'business_unit_id belongs to a different org' using errcode = '42501';
    end if;
  end if;
  if new.accountable_person_id is not null then
    select p.org_id into v_acc_org from shared.people p where p.id = new.accountable_person_id;
    if v_acc_org is distinct from new.org_id then
      raise exception 'accountable_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and current_user = 'authenticated' then
    -- A write that changes no column is refused for a writer with no tier here: this guard runs
    -- before the clock trigger (name order), so a value-identical UPDATE cannot quietly advance
    -- updated_at under member authority (review round 3 of #992). A writer holding structural or
    -- content authority may re-save identical content — a deliberate idle save must not fail.
    if new is not distinct from old
       and not shared.can('objective.manage')
       and not mos.can_edit_objective_content(new.id) then
      raise exception 'the update changes no column the writer has authority for'
        using errcode = '42501';
    end if;
    -- Default-deny column split (review round 1 of #992): the row policy admits any org member,
    -- so this guard — not the policy — is what makes every column answer to a tier. A column no
    -- tier owns (the org seam, the row identity, creation metadata) is refused outright, so a
    -- change outside both tiers is a loud 42501, never a silent pass-through.
    if new.org_id      is distinct from old.org_id
       or new.id       is distinct from old.id
       or new.created_at is distinct from old.created_at
       -- The clock is server-owned: a caller-supplied updated_at would otherwise ride past the
       -- value-identical check below (it differs, so no tier fires) and still advance the clock.
       or new.updated_at is distinct from old.updated_at then
      raise exception 'the objective''s org, identity, creation metadata and clock are not editable in place'
        using errcode = '42501';
    end if;
    -- Structural tier: admin alone renames, re-homes, flips Company-wide, re-periods, archives,
    -- and re-points the Accountable owner.
    if (new.name            is distinct from old.name
        or new.business_unit_id is distinct from old.business_unit_id
        or new.is_company_wide  is distinct from old.is_company_wide
        or new.period_year      is distinct from old.period_year
        or new.period_quarter   is distinct from old.period_quarter
        or new.archived_at      is distinct from old.archived_at
        or new.accountable_person_id is distinct from old.accountable_person_id)
       and not shared.can('objective.manage') then
      raise exception 'objective structural fields require the objective.manage authority'
        using errcode = '42501';
    end if;
    -- Content tier: ops leads and the Objective's own BU apex head keep the write-up.
    if new.write_up is distinct from old.write_up
       and not mos.can_edit_objective_content(old.id) then
      raise exception 'the objective write_up requires objective content authority'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function mos._guard_objectives() is
  'The ONE guard on mos.objectives (#992): references stay same-org (42501), and a direct UPDATE '
  'splits by tier, default-deny — org/identity/creation columns are not editable in place at all; '
  'structural fields (name, unit/Company-wide, period, archive, the Accountable owner) require '
  'the org-wide objective.manage authority; write_up requires mos.can_edit_objective_content. '
  'SECURITY INVOKER.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 5. Key results — the optional child table, same seam, same split
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
create table mos.objective_key_results (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid        not null default shared.current_org_id()
                                references shared.orgs(id) on delete cascade,
  objective_id    uuid        not null references mos.objectives(id) on delete cascade,
  what            text        not null check (btrim(what) <> ''),
  target_value    numeric,
  current_value   numeric,
  unit            text,
  due_date        date,
  owner_person_id uuid references shared.people(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table mos.objective_key_results is
  'An Objective''s optional key results (#992): what success means (what/target/unit/due/owner) '
  'and where it stands (current_value). Rows are optional and carry no check-in cadence. The '
  'org seam is enforced by mos._guard_objective_key_results exactly like mos._guard_work_lines; '
  'the structural-vs-content split is enforced there too — admin owns every target field and '
  'add/remove, content writers move current_value alone.';
comment on column mos.objective_key_results.what is
  'The measured statement. Required and non-blank; the row''s identity of record.';
comment on column mos.objective_key_results.unit is
  'Free label ("orders", "%") — deliberately not a controlled vocabulary; key results carry '
  'heterogeneous units, so no combined attainment figure is derived from them.';

create index objective_key_results_org_obj_idx
  on mos.objective_key_results (org_id, objective_id);

create or replace function mos._guard_objective_key_results()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_own_org uuid;
begin
  -- Removal is admin authority. It lives in the guard, not the DELETE policy, because a policy
  -- USING denial is a silent no-op and this write must fail loudly (mos_26 pins the 42501).
  if tg_op = 'DELETE' then
    if current_user = 'authenticated' and not shared.can('objective.manage') then
      raise exception 'adding or removing a key result requires the objective.manage authority'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if not exists (
    select 1 from mos.objectives o
     where o.id = new.objective_id and o.org_id = new.org_id
  ) then
    raise exception 'objective_id belongs to a different org' using errcode = '42501';
  end if;
  if new.owner_person_id is not null then
    select p.org_id into v_own_org from shared.people p where p.id = new.owner_person_id;
    if v_own_org is distinct from new.org_id then
      raise exception 'owner_person_id belongs to a different org' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and current_user = 'authenticated' then
    -- Value-identical UPDATEs are refused for a writer with no tier here, same shape and reason
    -- as the parent Objective's guard (review round 3 of #992).
    if new is not distinct from old
       and not shared.can('objective.manage')
       and not mos.can_edit_objective_content(old.objective_id) then
      raise exception 'the update changes no column the writer has authority for'
        using errcode = '42501';
    end if;
    -- Default-deny, same shape as the parent Objective's guard: columns no tier owns are not
    -- editable in place (review round 1 of #992).
    if new.org_id      is distinct from old.org_id
       or new.id       is distinct from old.id
       or new.created_at is distinct from old.created_at
       or new.updated_at is distinct from old.updated_at then
      raise exception 'a key result''s org, identity, creation metadata and clock are not editable in place'
        using errcode = '42501';
    end if;
    -- Structural tier: what, the target fields, the owner, and which Objective carries the row.
    if (new.what            is distinct from old.what
        or new.target_value    is distinct from old.target_value
        or new.unit            is distinct from old.unit
        or new.due_date        is distinct from old.due_date
        or new.owner_person_id is distinct from old.owner_person_id
        or new.objective_id    is distinct from old.objective_id)
       and not shared.can('objective.manage') then
      raise exception 'key-result target fields require the objective.manage authority'
        using errcode = '42501';
    end if;
    -- Content tier: progress only, and only over a key result of an Objective the writer
    -- holds content authority for.
    if new.current_value is distinct from old.current_value
       and not mos.can_edit_objective_content(old.objective_id) then
      raise exception 'a key result current_value requires objective content authority'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
comment on function mos._guard_objective_key_results() is
  'The ONE guard on mos.objective_key_results (#995): objective_id and owner_person_id stay '
  'same-org (42501); add/remove requires the org-wide objective.manage authority; on UPDATE the '
  'target fields require objective.manage while current_value requires '
  'mos.can_edit_objective_content of the parent Objective. SECURITY INVOKER.';

create trigger objective_key_results_guard
  before insert or update or delete on mos.objective_key_results
  for each row execute function mos._guard_objective_key_results();
create trigger objective_key_results_set_updated_at
  before update on mos.objective_key_results
  for each row execute function shared.set_updated_at();

alter table mos.objective_key_results enable row level security;
alter table mos.objective_key_results force  row level security;

-- The delete grant is deliberate: the authority gate is the guard's DELETE arm (loud 42501 for a
-- non-admin), while the policy carries only the org seam.
revoke all on mos.objective_key_results from public, anon;
grant select, insert, update, delete on mos.objective_key_results to authenticated;

create policy objective_key_results_select_org on mos.objective_key_results
  for select to authenticated
  using (org_id = shared.current_org_id());
comment on policy objective_key_results_select_org on mos.objective_key_results is
  'Org-wide read, matching mos.objectives'' own objectives_select_org — every org member reads '
  'the key results beside the work-progress roll-up.';

create policy objective_key_results_insert_admin on mos.objective_key_results
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('objective.manage'));
comment on policy objective_key_results_insert_admin on mos.objective_key_results is
  'Adding a key result is structural authority: admin alone (FR-009).';

create policy objective_key_results_update_org_row on mos.objective_key_results
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id());
comment on policy objective_key_results_update_org_row on mos.objective_key_results is
  'Org-row-level admission for either tier; mos._guard_objective_key_results splits the columns, '
  'so an out-of-tier edit is a loud 42501, never a silent no-op.';

create policy objective_key_results_delete_org_row on mos.objective_key_results
  for delete to authenticated
  using (org_id = shared.current_org_id());
comment on policy objective_key_results_delete_org_row on mos.objective_key_results is
  'Org seam only; the admin-only authority gate is the guard''s DELETE arm so a non-admin '
  'removal raises 42501 instead of deleting nothing quietly.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 6. Objective policies — insert admin-only; update org-row-level with the guard splitting tiers
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The replaced policies (20260909000006 bodies, restored verbatim in the DOWN above) gated every
-- write through the tenant matrix: org-wide for ops_lead, own_bu for a BU head. OD-OBJ-1 takes
-- that away for Objectives — the matrix no longer consults here at all, which is the intended
-- narrowing (can_manage_objective_definition keeps its definition for settings surfaces only).
drop policy objectives_insert_can_manage_or_unit_lead on mos.objectives;
drop policy objectives_update_can_manage_or_unit_lead on mos.objectives;

create policy objectives_insert_admin on mos.objectives
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.can('objective.manage'));
comment on policy objectives_insert_admin on mos.objectives is
  'Creating an Objective is structural authority: admin alone (#992, FR-005). Same-org '
  'references stay in mos._guard_objectives.';

create policy objectives_update_org_row on mos.objectives
  for update to authenticated
  using  (org_id = shared.current_org_id())
  with check (org_id = shared.current_org_id());
comment on policy objectives_update_org_row on mos.objectives is
  'Org-row-level admission for either tier (#992): the row-level WITH CHECK stays out of the '
  'column split so mos._guard_objectives can raise 42501 per tier — an ops_lead write-up-only '
  'save passes, their rename on the same row fails loudly.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 7. The one RPC source of mutation affordances — extended and re-based
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- objective_org/objective_bu_ids keep their names and shape but move onto the authority the
-- INSERT/UPDATE policies now enforce: objective_org is the capability row (admin after #992),
-- and the BU arm is structurally empty because structural authority has no per-BU tier anymore —
-- returning matrix BU ids here would promise writes the policies refuse. The two new content
-- fields mirror that shape under mos.can_edit_objective_content's logic.
-- DROP, not CREATE OR REPLACE: the two new OUT columns change the function's return type, which
-- PostgreSQL refuses to replace in place (42P13). The grant statements below re-establish the ACL.
drop function mos.get_work_write_scopes();
create function mos.get_work_write_scopes()
returns table(
  workline_org            boolean,
  objective_org           boolean,
  workline_bu_ids         uuid[],
  objective_bu_ids        uuid[],
  objective_content_org   boolean,
  objective_content_bu_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with authority as (
    select shared.role_authority_allows('workline.manage', null, null, null) as workline_org,
           shared.can('objective.manage') as objective_org,
           (shared.can('objective.manage') or shared.can('objective.edit_content'))
             as objective_content_org
  ),
  active_bu as (
    select bu.id
      from shared.business_units bu
     where bu.org_id = shared.current_org_id()
       and bu.archived_at is null
  )
  select a.workline_org,
         a.objective_org,
         case when a.workline_org then '{}'::uuid[] else coalesce(
           (select array_agg(b.id order by b.id)
              from active_bu b
             where shared.role_authority_allows('workline.manage', b.id, null, null)),
           '{}'::uuid[])
         end,
         '{}'::uuid[],
         a.objective_content_org,
         case when a.objective_content_org then '{}'::uuid[] else coalesce(
           (select array_agg(b.id order by b.id)
              from active_bu b
             where shared.is_business_unit_head(b.id, shared.current_person_id())),
           '{}'::uuid[])
         end
    from authority a
$$;
comment on function mos.get_work_write_scopes() is
  'Narrow viewer affordance for Project/Process/Objective mutation affordances (#992): org-wide '
  'booleans plus only accessible active BU ids, per tier. workline_* still resolves the tenant '
  'matrix; objective_org is the structural capability (admin after #992) and objective_bu_ids is '
  'structurally empty — no per-BU structural tier exists; objective_content_org/_bu_ids mirror '
  'the shape for the write-up/current-value tier (ops_lead org-wide, a BU head their own unit). '
  'It never enumerates work rows or directory data.';
revoke execute on function mos.get_work_write_scopes() from public, anon, authenticated;
grant  execute on function mos.get_work_write_scopes() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 8. Change history (#983) — write_up summary-only; the new table attached; read arm added
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
drop trigger record_history_objectives on mos.objectives;
create trigger record_history_objectives
  after insert or update or delete on mos.objectives
  for each row execute function shared._record_history_write('~write_up');

create trigger record_history_objective_key_results
  after insert or update or delete on mos.objective_key_results
  for each row execute function shared._record_history_write();

-- Restated in full from 20260929000010 plus the objective_key_results arm (create or replace
-- keeps the function's grants). Same-org live-row read, exactly the objectives arm's shape.
create or replace function shared.can_read_history_record(
  p_schema     text,
  p_table      text,
  p_record_key text,
  p_action     text,
  p_snapshot   jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('insert', 'update') then
    case
      -- UUID-key arms cast the stored key back to uuid against the PK — index-preserving and
      -- shape-guarded so a malformed stored key fails closed (the 808aa13b arm shape).
      when p_schema = 'mos' and p_table = 'objectives' then
        return exists (
          select 1 from mos.objectives o
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and o.id = p_record_key::uuid
            and o.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'objective_key_results' then
        return exists (
          select 1 from mos.objective_key_results k
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and k.id = p_record_key::uuid
            and k.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'work_lines' then
        return exists (
          select 1 from mos.work_lines w
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and w.id = p_record_key::uuid
            and w.org_id = shared.current_org_id());
      -- ── the earlier batches' live arms (…0011 task-cascade, …0012 signal-worklog,
      -- …0013 money, …0014 directory, …0015 cafe), restated verbatim: the renumbered
      -- stack applies 11..16 in order on a fresh database, so this create-or-replace
      -- must carry them or those tables write history nobody can read.
      -- ── 20260929000011 (batch 2a) task-cascade arms, restated: the renumbered stack applies
      -- 11 then 12 then 13 then 14 on a fresh database, so this create-or-replace must carry
      -- them or the earlier batches' tables write history nobody can read.
      when p_schema = 'mos' and p_table = 'tasks' then
        return exists (
          select 1 from mos.tasks t
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and t.id = p_record_key::uuid
            and t.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'task_checklist_items' then
        return exists (
          select 1 from mos.task_checklist_items c
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and c.id = p_record_key::uuid
            and c.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'process_cadences' then
        return exists (
          select 1 from mos.process_cadences pc
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and pc.id = p_record_key::uuid
            and pc.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'process_task_defs' then
        return exists (
          select 1 from mos.process_task_defs pd
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and pd.id = p_record_key::uuid
            and pd.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'process_runs' then
        return exists (
          select 1 from mos.process_runs pr
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and pr.id = p_record_key::uuid
            and pr.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'process_run_pending_tasks' then
        return exists (
          select 1 from mos.process_run_pending_tasks pp
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and pp.id = p_record_key::uuid
            and pp.org_id = shared.current_org_id());
      -- ── 20260929000012 (batch 2b) signal-worklog arms, restated for the same reason ──────────
      when p_schema = 'mos' and p_table = 'signals' then
        return exists (
          select 1 from mos.signals s
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and s.id = p_record_key::uuid
            and s.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'signal_mentions' then
        return exists (
          select 1 from mos.signal_mentions m
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and m.id = p_record_key::uuid
            and m.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'signal_acknowledgements' then
        return exists (
          select 1 from mos.signal_acknowledgements a
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and a.id = p_record_key::uuid
            and a.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'signal_tasks' then
        return exists (
          select 1 from mos.signal_tasks st
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and st.id = p_record_key::uuid
            and st.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'weekly_updates' then
        return exists (
          select 1 from mos.weekly_updates wu
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and wu.id = p_record_key::uuid
            and wu.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'weekly_update_items' then
        return exists (
          select 1 from mos.weekly_update_items wi
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and wi.id = p_record_key::uuid
            and wi.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'events' then
        return exists (
          select 1 from mos.events e
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and e.id = p_record_key::uuid
            and e.org_id = shared.current_org_id());
      when p_schema = 'mos' and p_table = 'follow_ups' then
        return exists (
          select 1 from mos.follow_ups fu
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and fu.id = p_record_key::uuid
            and fu.org_id = shared.current_org_id());
      -- ── 20260929000013 (batch 2c) money arms, restated for the same reason ───────────────────
      when p_schema = 'mos' and p_table = 'budgets' then
        return exists (
          select 1 from mos.budgets b
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and b.id = p_record_key::uuid
            and b.org_id = shared.current_org_id()
            and (shared.has_access_role('finance') or shared.has_access_role('admin')));
      when p_schema = 'mos' and p_table = 'budget_lines' then
        return exists (
          select 1 from mos.budget_lines bl
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and bl.id = p_record_key::uuid
            and bl.org_id = shared.current_org_id()
            and (shared.has_access_role('finance') or shared.has_access_role('admin')));
      when p_schema = 'mos' and p_table = 'certified_metrics' then
        return exists (
          select 1 from mos.certified_metrics cm
          where (cm.org_id::text || ':' || cm.key) = p_record_key
            and cm.org_id = shared.current_org_id()
            and (shared.has_access_role('finance') or shared.has_access_role('admin')));
      when p_schema = 'reporting' and p_table = 'supervisor_revenue_scope' then
        return exists (
          select 1 from reporting.supervisor_revenue_scope srs
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and srs.id = p_record_key::uuid
            and srs.org_id = shared.current_org_id()
            and (shared.has_access_role('admin') or srs.person_id = shared.current_person_id()));
      when p_schema = 'shared' and p_table = 'business_units' then
        return exists (
          select 1 from shared.business_units bu
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and bu.id = p_record_key::uuid
            and bu.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'people' then
        -- people's own SELECT policy is org-wide OR self (the self half is what still resolves
        -- while the password-rotation gate holds current_org_id() at NULL) — the history arm
        -- reuses both halves, so a person reads their own row's history exactly when they read
        -- the row.
        return exists (
          select 1 from shared.people pe
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and pe.id = p_record_key::uuid
            and (pe.org_id = shared.current_org_id()
                 or pe.id = shared.current_person_id()));
      when p_schema = 'shared' and p_table = 'person_access_roles' then
        return exists (
          select 1 from shared.person_access_roles par
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and par.id = p_record_key::uuid
            and par.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'person_roles' then
        return exists (
          select 1 from shared.person_roles pr
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and pr.id = p_record_key::uuid
            and pr.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'roles' then
        return exists (
          select 1 from shared.roles ro
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and ro.id = p_record_key::uuid
            and ro.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'sites' then
        return exists (
          select 1 from shared.sites si
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and si.id = p_record_key::uuid
            and si.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'team_memberships' then
        return exists (
          select 1 from shared.team_memberships tm
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and tm.id = p_record_key::uuid
            and tm.org_id = shared.current_org_id());
      when p_schema = 'shared' and p_table = 'teams' then
        return exists (
          select 1 from shared.teams te
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and te.id = p_record_key::uuid
            and te.org_id = shared.current_org_id());
      -- Batch 2d, composite-keyed (DA-1): role_authority and team_lead_assignments are RPC-only
      -- tables — no SELECT grant, no SELECT policy — so the arm cannot consult the live row (it
      -- would error the policy query, not return false). It restates the settings RPCs'
      -- admin-only read authority over the record_key's own first component, which is org_id in
      -- both registered PK orders.
      when p_schema = 'shared' and p_table = 'role_authority' then
        return split_part(p_record_key, ':', 1)
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and split_part(p_record_key, ':', 1)::uuid = shared.current_org_id()
           and shared.has_access_role('admin');
      when p_schema = 'shared' and p_table = 'team_lead_assignments' then
        return split_part(p_record_key, ':', 1)
                 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and split_part(p_record_key, ':', 1)::uuid = shared.current_org_id()
           and shared.has_access_role('admin');
when p_schema = 'ops' and p_table = 'log_entries' then
        return exists (
          select 1 from ops.log_entries le
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and le.id = p_record_key::uuid
            and le.org_id = shared.current_org_id());
      when p_schema = 'ops' and p_table = 'kitchen_logs' then
        return exists (
          select 1 from ops.kitchen_logs kl
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and kl.id = p_record_key::uuid
            and kl.org_id = shared.current_org_id());
      when p_schema = 'ops' and p_table = 'kitchen_plans' then
        return exists (
          select 1 from ops.kitchen_plans kp
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and kp.id = p_record_key::uuid
            and kp.org_id = shared.current_org_id());
      when p_schema = 'ops' and p_table = 'wip_items' then
        return exists (
          select 1 from ops.wip_items wi
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and wi.id = p_record_key::uuid
            and wi.org_id = shared.current_org_id());
      when p_schema = 'ops' and p_table = 'item_units' then
        return exists (
          select 1 from ops.item_units iu
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and iu.id = p_record_key::uuid
            and iu.org_id = shared.current_org_id());
      when p_schema = 'ops' and p_table = 'stream_completeness' then
        return exists (
          select 1 from ops.stream_completeness sc
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and sc.id = p_record_key::uuid
            and sc.org_id = shared.current_org_id());
      when p_schema = 'ops' and p_table = 'stream_items' then
        return exists (
          select 1 from ops.stream_items si
          where p_record_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and si.id = p_record_key::uuid
            and si.org_id = shared.current_org_id());
      else
        return false;
    end case;
  end if;
  -- p_action = 'delete' (or anything unrecognized): only hard-deleting audited tables get a
  -- snapshot arm, evaluated over the captured columns because the row is gone. The earlier
  -- batches' delete arms are restated beside this slice's own (objective_key_results).
  if p_action = 'delete' then
    case
      -- 20260929000012 (batch 2b): the weekly_update_items snapshot arm
      when p_schema = 'mos' and p_table = 'weekly_update_items' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
          and exists (
            select 1 from mos.weekly_updates w
            where w.id = (p_snapshot ->> 'weekly_update_id')::uuid
              and mos.can_read_weekly_update(w.person_id));
      -- 20260929000013 (batch 2c): the supervisor_revenue_scope snapshot arm
      when p_schema = 'reporting' and p_table = 'supervisor_revenue_scope' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
          and (
            shared.has_access_role('admin')
            or (p_snapshot ->> 'person_id')::uuid = shared.current_person_id());
      -- 20260929000014 (batch 2d): the person_roles and team_lead_assignments snapshot arms
      when p_schema = 'shared' and p_table = 'person_roles' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id();
      when p_schema = 'shared' and p_table = 'team_lead_assignments' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
           and shared.has_access_role('admin');
      -- 20260929000015 (batch 2e): the stream_items snapshot arm
      when p_schema = 'ops' and p_table = 'stream_items' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id()
           and shared.is_org_member();
      -- this slice: objective_key_results — an admin's removal stays readable through the
      -- table's own org-wide read predicate over the snapshot (FR-011/FR-013).
      when p_schema = 'mos' and p_table = 'objective_key_results' then
        return (p_snapshot ->> 'org_id')::uuid = shared.current_org_id();
      else
        return false;
    end case;
  end if;
  return false;
end;
$$;
comment on function shared.can_read_history_record(text, text, text, text, jsonb) is
  'Read dispatch for shared.record_history (#983 FR-007/008/013, NFR-007; +mos_26): each audited '
  'table is named explicitly and read through its own predicate — live row for insert/update, '
  'captured snapshot columns for delete. Anything unnamed returns false, so a trigger wired '
  'without a matching arm exposes nothing.';
