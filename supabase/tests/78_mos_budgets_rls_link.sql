-- pgTAP: mos.budgets + mos.budget_lines RLS + LINK INTEGRITY (ADR-0022 D1/D6, AC-PB-009/010, anchor A5).
-- Proves: RLS enabled+forced; finance/admin read; member reads zero; cross-org isolation;
-- can('cogs.write') gates writes (finance/admin can; member cannot); the org_id seam; and the
-- link-never-copy invariant (AC-PB-010): budget_lines has NO unit-cost column AND a budget_line's
-- ingredient_esb_code resolves to a real reporting.ingredient_cost_lines row (the consumer reads the
-- LINKED record, not a copy). begin;...rollback; — nothing ships to prod.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select mos._test_seed_role_tree();

-- Seed a cost line (org A) so a budget_line's ingredient_esb_code resolves to a real linked record.
insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1', 'ING-MILK', 'Fresh Milk', 18000.00, 'L', now() - interval '5 days');

-- AC-PB-010 (structural link-never-copy): budget_lines has NO unit-cost / cost column.
select ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'mos' and table_name = 'budget_lines'
       and column_name in ('unit_cost','cost','unit_price')
  ),
  'AC-PB-010: mos.budget_lines has NO unit-cost column (link-never-copy — A5)');
-- And it DOES carry the link key + qty.
select ok(
  exists (select 1 from information_schema.columns
     where table_schema = 'mos' and table_name = 'budget_lines' and column_name = 'ingredient_esb_code')
  and exists (select 1 from information_schema.columns
     where table_schema = 'mos' and table_name = 'budget_lines' and column_name = 'recipe_qty'),
  'AC-PB-010: mos.budget_lines carries ingredient_esb_code (the link key) + recipe_qty');

-- RLS enabled + forced on both tables.
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'budgets'),
  'AC-PB-009: mos.budgets has RLS enabled and forced');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'budget_lines'),
  'AC-PB-009: mos.budget_lines has RLS enabled and forced');

-- Seed a budget + line AS SERVICE_ROLE (RLS-bypass) for the read assertions.
insert into mos.budgets (
  org_id, menu_item_esb_code, menu_item_name, scenario_label, scenario_type,
  owning_bu_id, total_budgeted_cogs, cost_basis_as_of, certified_metric_key, is_complete, created_by
) values (
  '00000000-0000-0000-0000-0000000000a1', 'MENU-CAPPUC', 'Cappuccino', 'Baseline', 'baseline',
  '00000000-0000-0000-0000-0000000000a2', 9000.00, now() - interval '5 days', 'cogs.budgeted', true,
  '00000000-0000-0000-0000-0000000000d1'
);

set local role authenticated;

-- finance reads same-org budgets.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select is((select count(*)::int from mos.budgets), 1,
  'AC-PB-009: finance reads same-org budgets');

-- AC-PB-009 (can('cogs.write')): finance CAN capture a budget + its lines (ingredient + qty, NO unit cost).
select lives_ok($$
  insert into mos.budgets (
    org_id, menu_item_esb_code, menu_item_name, scenario_label, scenario_type,
    owning_bu_id, total_budgeted_cogs, cost_basis_as_of, certified_metric_key, is_complete, created_by
  ) values (
    '00000000-0000-0000-0000-0000000000a1', 'MENU-CROISS', 'Croissant', 'Promo', 'promo',
    '00000000-0000-0000-0000-0000000000a2', 12000.00, now(), 'cogs.budgeted', true,
    '00000000-0000-0000-0000-0000000000d1'
  )
$$, 'AC-PB-009: finance (cogs.write) can capture a budget');
select lives_ok($$
  insert into mos.budget_lines (org_id, budget_id, ingredient_esb_code, recipe_qty, qty_unit)
  select '00000000-0000-0000-0000-0000000000a1', id, 'ING-MILK', 0.18, 'L'
    from mos.budgets where scenario_label = 'Promo' limit 1
$$, 'AC-PB-009: finance (cogs.write) can write a budget line (ingredient + qty, NO unit cost)');

-- AC-PB-009: a member (no cogs.write) CANNOT capture a budget.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  insert into mos.budgets (
    org_id, menu_item_esb_code, menu_item_name, scenario_label, scenario_type,
    owning_bu_id, total_budgeted_cogs, cost_basis_as_of, created_by
  ) values (
    '00000000-0000-0000-0000-0000000000a1', 'MENU-X', 'X', 'B', 'baseline',
    '00000000-0000-0000-0000-0000000000a2', 1.00, now(),
    '00000000-0000-0000-0000-0000000000d4'
  )
$$, '42501', null, 'AC-PB-009: member (no cogs.write) cannot capture a budget');
select is((select count(*)::int from mos.budgets), 0,
  'AC-PB-009: member reads zero budgets');

-- cross-org finance cannot see org-A budgets.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}';
select is((select count(*)::int from mos.budgets where menu_item_esb_code = 'MENU-CAPPUC'), 0,
  'AC-PB-009: cross-org finance reads zero org-A budgets');

-- AC-PB-010 (link integrity): a budget_line's ingredient_esb_code resolves to a real cost line
-- (the consumer reads the LINKED record, not a copy). Read as finance.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select is(
  (select count(*)::int
     from mos.budget_lines bl
     join reporting.ingredient_cost_lines cl
       on cl.org_id = bl.org_id and cl.ingredient_esb_code = bl.ingredient_esb_code
    where bl.org_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'AC-PB-010: a budget_line ingredient_esb_code resolves to a real linked cost line (the consumer reads the linked record)');

reset role;
select * from finish();
rollback;
