-- pgTAP: mos.capture_budget RPC (A5 fix) — atomic transaction + server-side COGS recompute.
-- Proves: (a) a budgets row + its budget_lines exist; (b) total_budgeted_cogs equals the
-- SERVER-recomputed sum (NOT a client value — there's no param); (c) budget_lines have NO unit_cost.
-- As a non-holder: RPC raises/denies. Atomicity: a line referencing a bogus ingredient makes the
-- WHOLE call raise and leaves NO orphan budget row (assert count=0 after the failed call).
-- Tag: A5 / AC-PB-008.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select mos._test_seed_role_tree();

-- Seed org A (WU-A).
-- Seed two ingredients with certified cost lines.
insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1', 'ING-MILK', 'Fresh Milk', 18000.00, 'L', '2026-07-01T00:00:00Z'::timestamptz),
  ('00000000-0000-0000-0000-0000000000a1', 'ING-COFFEE', 'Coffee Beans', 120000.00, 'kg', '2026-07-01T00:00:00Z'::timestamptz);

-- Seed a bogus ingredient code (for atomicity test — this has NO cost line).
-- No insert needed; we just reference a non-existent ingredient_esb_code in the test.

set local role authenticated;

-- Test 1: finance (cogs.write holder) CAN call the RPC and it creates budget + lines.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select lives_ok($$
  select mos.capture_budget(
    'MENU-CAPPUC', 'Cappuccino', 'Baseline', 'baseline',
    '00000000-0000-0000-0000-0000000000a2',
    '2026-07-01T00:00:00Z'::timestamptz,
    'cogs.budgeted',
    true,
    null,
    array[
      ('ING-MILK', 0.18::numeric, 'L')::mos.budget_line_input,
      ('ING-COFFEE', 0.02::numeric, 'kg')::mos.budget_line_input
    ]
  )
$$, 'A5/AC-PB-008: finance (cogs.write) can call capture_budget RPC');

-- Test 2: a budgets row exists.
select is((select count(*)::int from mos.budgets where menu_item_esb_code = 'MENU-CAPPUC' and scenario_label = 'Baseline'), 1,
  'A5/AC-PB-008: a budgets row exists after RPC call');

-- Test 3: budget_lines exist with NO unit_cost (link-never-copy).
select is((select count(*)::int from mos.budget_lines bl join mos.budgets b on b.id = bl.budget_id
    where b.menu_item_esb_code = 'MENU-CAPPUC'), 2,
  'A5/AC-PB-008: two budget_lines exist');
select ok(
  not exists (
    select 1 from information_schema.columns
     where table_schema = 'mos' and table_name = 'budget_lines'
       and column_name in ('unit_cost','cost','unit_price')
  ),
  'A5/AC-PB-008: budget_lines has NO unit_cost column (link-never-copy)');

-- Test 4: total_budgeted_cogs equals the SERVER-recomputed sum (NOT a client value).
-- Expected: (0.18 L * 18000.00 Rp/L) + (0.02 kg * 120000.00 Rp/kg) = 3240 + 2400 = 5640.
select is(
  (select total_budgeted_cogs::numeric from mos.budgets where menu_item_esb_code = 'MENU-CAPPUC' and scenario_label = 'Baseline'),
  5640::numeric(14,4),
  'A5/AC-PB-008: total_budgeted_cogs equals the server-recomputed sum (5640 = 0.18*18000 + 0.02*120000)'
);

-- Test 5: budget_lines have ingredient_esb_code, recipe_qty, qty_unit (link keys), NO unit_cost.
select is(
  (select ingredient_esb_code from mos.budget_lines bl join mos.budgets b on b.id = bl.budget_id
    where b.menu_item_esb_code = 'MENU-CAPPUC' limit 1),
  'ING-MILK',
  'A5/AC-PB-008: budget_lines carry ingredient_esb_code (link key)'
);
select is(
  (select recipe_qty from mos.budget_lines bl join mos.budgets b on b.id = bl.budget_id
    where b.menu_item_esb_code = 'MENU-CAPPUC' and ingredient_esb_code = 'ING-MILK'),
  0.18::numeric,
  'A5/AC-PB-008: budget_lines carry recipe_qty'
);

-- Test 6: member (no cogs.write) CANNOT call the RPC — raises/denies.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  select mos.capture_budget(
    'MENU-CROISS', 'Croissant', 'Promo', 'promo',
    '00000000-0000-0000-0000-0000000000a2',
    '2026-07-01T00:00:00Z'::timestamptz,
    'cogs.budgeted',
    true,
    null,
    array[('ING-MILK', 0.2::numeric, 'L')::mos.budget_line_input]
  )
$$, '42501', null, 'A5/AC-PB-008: member (no cogs.write) cannot call capture_budget — raises/denies');

-- Test 7: no orphan budget row after member's failed call (cross-org guard also prevents, but verify).
select is((select count(*)::int from mos.budgets where menu_item_esb_code = 'MENU-CROISS'), 0,
  'A5/AC-PB-008: no orphan budget row after member''s failed call');

-- Test 8: atomicity — a line referencing a bogus ingredient makes the WHOLE call raise.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select throws_ok($$
  select mos.capture_budget(
    'MENU-LATTE', 'Latte', 'New', 'new_branch',
    '00000000-0000-0000-0000-0000000000a2',
    '2026-07-01T00:00:00Z'::timestamptz,
    'cogs.budgeted',
    true,
    null,
    array[('ING-BOGUS-NO-COST-LINE', 1.0::numeric, 'kg')::mos.budget_line_input]
  )
$$, 'P0003', null, 'A5/AC-PB-008: atomicity — bogus ingredient raises (missing cost line)');

-- Test 9: verify NO orphan budget row after the atomicity-failure call.
select is((select count(*)::int from mos.budgets where menu_item_esb_code = 'MENU-LATTE'), 0,
  'A5/AC-PB-008: atomicity — NO orphan budget row after failed call (budget insert rolled back)');

-- Test 10: empty lines array is allowed (budget with no ingredients — total = 0).
select lives_ok($$
  select mos.capture_budget(
    'MENU-EMPTY', 'Empty Budget', 'Empty', 'baseline',
    '00000000-0000-0000-0000-0000000000a2',
    '2026-07-01T00:00:00Z'::timestamptz,
    'cogs.budgeted',
    true,
    'No ingredients',
    array[]::mos.budget_line_input[]
  )
$$, 'A5/AC-PB-008: empty lines array is allowed (budget with no ingredients)');

-- Test 11: empty-lines budget has total_budgeted_cogs = 0.
select is(
  (select total_budgeted_cogs::numeric from mos.budgets where menu_item_esb_code = 'MENU-EMPTY'),
  0::numeric(14,4),
  'A5/AC-PB-008: empty-lines budget has total_budgeted_cogs = 0'
);

-- Test 12: org_id is server-stamped (NOT from client — no org_id param).
select is(
  (select org_id::text from mos.budgets where menu_item_esb_code = 'MENU-CAPPUC' and scenario_label = 'Baseline'),
  '00000000-0000-0000-0000-0000000000a1',
  'A5/AC-PB-008: org_id is server-stamped from current_org_id()'
);

-- Test 13: created_by is server-stamped (NOT from client).
select is(
  (select created_by::text from mos.budgets where menu_item_esb_code = 'MENU-CAPPUC' and scenario_label = 'Baseline'),
  '00000000-0000-0000-0000-0000000000d1',
  'A5/AC-PB-008: created_by is server-stamped from current_person_id()'
);

-- Test 14: cross-org guard prevents finance in org-B from writing to org-A.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}';
-- This should fail because the org_id is pinned to current_org_id() (org-B), but the cost lines exist in org-A.
-- The RPC will attempt to resolve cost lines in org-B context, find none for the requested ingredients, and raise.
select throws_ok($$
  select mos.capture_budget(
    'MENU-CROSSORG', 'Cross-org Test', 'Test', 'baseline',
    '00000000-0000-0000-0000-0000000000b2',
    '2026-07-01T00:00:00Z'::timestamptz,
    'cogs.budgeted',
    true,
    null,
    array[('ING-MILK', 0.1::numeric, 'L')::mos.budget_line_input]
  )
$$, 'P0003', null, 'A5/AC-PB-008: cross-org guard prevents finance in org-B from writing to org-A (missing cost line in org-B)');

reset role;
select * from finish();
rollback;