-- pgTAP: mos.budgets + mos.budget_lines RLS + LINK INTEGRITY + M1 write-path narrowing
-- (ADR-0022 D1/D6, AC-PB-009/010/013, anchor A5; M1 = security audit 2026-07-08).
-- Proves: RLS enabled+forced; finance/admin read; member reads zero; cross-org isolation;
-- can('cogs.write') gates writes (finance/admin can; member cannot); the org_id seam; the
-- link-never-copy invariant (AC-PB-010): budget_lines has NO unit-cost column AND a budget_line's
-- ingredient_esb_code resolves to a real reporting.ingredient_cost_lines row (the consumer reads the
-- LINKED record, not a copy); and M1 (AC-PB-013): the tables are NO LONGER directly writable — the
-- direct INSERT is REFUSED (42501) and the SOLE write path is the mos.capture_budget SECURITY DEFINER
-- RPC. begin;...rollback; — nothing ships to prod.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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

-- AC-PB-013 (M1 closure, security audit 2026-07-08): the mos.budgets / mos.budget_lines tables are NO
-- LONGER directly writable by `authenticated` — the grant was revoked (20260731000001). The SOLE write path
-- is the mos.capture_budget SECURITY DEFINER RPC. A direct INSERT — even by a cogs.write holder — is now
-- REFUSED with 42501. These two assertions are what proves M1 is closed.
select throws_ok($$
  insert into mos.budgets (
    org_id, menu_item_esb_code, menu_item_name, scenario_label, scenario_type,
    owning_bu_id, total_budgeted_cogs, cost_basis_as_of, certified_metric_key, is_complete, created_by
  ) values (
    '00000000-0000-0000-0000-0000000000a1', 'MENU-CROISS', 'Croissant', 'Promo', 'promo',
    '00000000-0000-0000-0000-0000000000a2', 12000.00, now(), 'cogs.budgeted', true,
    '00000000-0000-0000-0000-0000000000d1'
  )
$$, '42501', null, 'AC-PB-013: direct INSERT into mos.budgets is refused — capture_budget RPC is the sole write path (M1)');
select throws_ok($$
  insert into mos.budget_lines (org_id, budget_id, ingredient_esb_code, recipe_qty, qty_unit)
  select '00000000-0000-0000-0000-0000000000a1', id, 'ING-MILK', 0.18, 'L'
    from mos.budgets where scenario_label = 'Baseline' limit 1
$$, '42501', null, 'AC-PB-013: direct INSERT into mos.budget_lines is refused — capture_budget RPC is the sole write path (M1)');

-- AC-PB-009 (can('cogs.write')): finance CAN STILL capture a budget — expressed through the intended path,
-- mos.capture_budget (which server-recomputes total_budgeted_cogs from the linked cost lines and rejects a
-- cross-org owning_bu_id). The GOAL ("finance can capture a budget; a member cannot") is preserved; only
-- the JOURNEY moved from the table to the RPC. (Direct writes were the pre-M1 journey — now refused above.)
select lives_ok($$
  select mos.capture_budget(
    'MENU-CROISS', 'Croissant', 'Promo', 'promo',
    '00000000-0000-0000-0000-0000000000a2',
    now(),
    'cogs.budgeted', true, null,
    array[('ING-MILK', 0.18::numeric, 'L')::mos.budget_line_input]
  )
$$, 'AC-PB-009: finance (cogs.write) can capture a budget via the capture_budget RPC');

-- AC-PB-009: a member (no cogs.write) CANNOT capture a budget — via the RPC the capability gate refuses.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  select mos.capture_budget(
    'MENU-X', 'X', 'B', 'baseline',
    '00000000-0000-0000-0000-0000000000a2',
    now(),
    'cogs.budgeted', true, null,
    array[('ING-MILK', 0.2::numeric, 'L')::mos.budget_line_input]
  )
$$, '42501', null, 'AC-PB-009: member (no cogs.write) cannot capture a budget via the capture_budget RPC');
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
