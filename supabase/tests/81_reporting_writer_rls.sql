-- pgTAP: Tightened reporting_writer RLS policies (audit finding A4 — Sec Med).
--
-- This test verifies that the tightened reporting_writer policies:
-- 1. Allow writes with a valid org_id (org exists in shared.orgs)
-- 2. Deny writes with NULL org_id
-- 3. Deny writes with a bogus/non-existent org_id
--
-- Tagged: A4
-- See: supabase/migrations/20260712000002_reporting_writer_rls_tighten.sql

begin;

-- pgTAP setup (test harness needs extensions)
set client_min_messages to warning;

-- Grant SET option and USAGE on extensions (test scaffolding, per ADR-0010 D11 Sec-M2 pattern)
-- NOTE: these grants are for pgTAP only; prod reporting_writer must not have extensions reach.
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;

select plan(12);  -- 3 tables × 4 tests each (valid-org INSERT, valid-org UPDATE, null-org DENY, bogus-org DENY)

-- ── Helper: seed a test org ───────────────────────────────────────────────────────
insert into shared.orgs (id, name, slug)
values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Test Org for A4',
  'test-org-a4'
)
on conflict (id) do nothing;

-- ── reporting.ingredient_cost_lines ────────────────────────────────────────────────

-- Test 1: Valid org INSERT should pass
set local role reporting_writer;
insert into reporting.ingredient_cost_lines (
  org_id,
  ingredient_esb_code,
  name,
  unit_cost,
  unit,
  as_of
) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'ING001',
  'Test Ingredient',
  100.50,
  'kg',
  now()
)
on conflict (org_id, ingredient_esb_code) do update set
  unit_cost = excluded.unit_cost,
  loaded_at = now();

set local role postgres;
select results_eq(
  $$
    select org_id, ingredient_esb_code, name, unit_cost
    from reporting.ingredient_cost_lines
    where ingredient_esb_code = 'ING001'
  $$,
  $$
    select '00000000-0000-0000-0000-000000000001'::uuid,
           'ING001',
           'Test Ingredient',
           100.50
  $$,
  'AC-A4-01: ingredient_cost_lines allows INSERT/UPDATE with valid org_id'
);

-- Clean up
delete from reporting.ingredient_cost_lines where ingredient_esb_code = 'ING001';

-- Test 2: NULL org_id should be DENIED
set local role reporting_writer;
select throws_ok(
  $$
    insert into reporting.ingredient_cost_lines (
      org_id,
      ingredient_esb_code,
      name,
      unit_cost,
      unit,
      as_of
    ) values (
      null,
      'ING002',
      'Test Ingredient NULL org',
      100.50,
      'kg',
      now()
    )
  $$,
  42501,  -- insufficient_privilege (RLS violation)
  'new row violates row-level security policy',
  'AC-A4-02: ingredient_cost_lines DENIES INSERT with NULL org_id'
);

-- Test 3: Bogus org_id should be DENIED
set local role reporting_writer;
select throws_ok(
  $$
    insert into reporting.ingredient_cost_lines (
      org_id,
      ingredient_esb_code,
      name,
      unit_cost,
      unit,
      as_of
    ) values (
      '99999999-9999-9999-9999-999999999999'::uuid,
      'ING003',
      'Test Ingredient Bogus org',
      100.50,
      'kg',
      now()
    )
  $$,
  42501,  -- insufficient_privilege (RLS violation)
  'new row violates row-level security policy',
  'AC-A4-03: ingredient_cost_lines DENIES INSERT with bogus org_id'
);

-- ── reporting.bom_lines ────────────────────────────────────────────────────────────

-- Test 4: Valid org INSERT should pass
set local role reporting_writer;
insert into reporting.bom_lines (
  org_id,
  menu_item_esb_code,
  ingredient_esb_code,
  recipe_qty,
  qty_unit,
  as_of
) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'MENU001',
  'ING001',
  0.5,
  'kg',
  now()
)
on conflict (org_id, menu_item_esb_code, ingredient_esb_code) do update set
  recipe_qty = excluded.recipe_qty,
  loaded_at = now();

set local role postgres;
select results_eq(
  $$
    select org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty
    from reporting.bom_lines
    where menu_item_esb_code = 'MENU001' and ingredient_esb_code = 'ING001'
  $$,
  $$
    select '00000000-0000-0000-0000-000000000001'::uuid,
           'MENU001',
           'ING001',
           0.5
  $$,
  'AC-A4-04: bom_lines allows INSERT/UPDATE with valid org_id'
);

-- Clean up
delete from reporting.bom_lines where menu_item_esb_code = 'MENU001';

-- Test 5: NULL org_id should be DENIED
set local role reporting_writer;
select throws_ok(
  $$
    insert into reporting.bom_lines (
      org_id,
      menu_item_esb_code,
      ingredient_esb_code,
      recipe_qty,
      qty_unit,
      as_of
    ) values (
      null,
      'MENU002',
      'ING002',
      0.5,
      'kg',
      now()
    )
  $$,
  42501,  -- insufficient_privilege (RLS violation)
  'new row violates row-level security policy',
  'AC-A4-05: bom_lines DENIES INSERT with NULL org_id'
);

-- Test 6: Bogus org_id should be DENIED
set local role reporting_writer;
select throws_ok(
  $$
    insert into reporting.bom_lines (
      org_id,
      menu_item_esb_code,
      ingredient_esb_code,
      recipe_qty,
      qty_unit,
      as_of
    ) values (
      '99999999-9999-9999-9999-999999999999'::uuid,
      'MENU003',
      'ING003',
      0.5,
      'kg',
      now()
    )
  $$,
  42501,  -- insufficient_privilege (RLS violation)
  'new row violates row-level security policy',
  'AC-A4-06: bom_lines DENIES INSERT with bogus org_id'
);

-- ── reporting.sales_margin_daily ────────────────────────────────────────────────────

-- Test 7: Valid org INSERT should pass
set local role reporting_writer;
insert into reporting.sales_margin_daily (
  org_id,
  margin_date,
  esb_code,
  branch_code,
  branch_name,
  revenue,
  cogs_interim_sm,
  snapshot_as_of
) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  current_date,
  'ESB001',
  'BR001',
  'Test Branch',
  1000.00,
  600.00,
  now()
)
on conflict (org_id, margin_date, esb_code, branch_code) do update set
  revenue = excluded.revenue,
  cogs_interim_sm = excluded.cogs_interim_sm,
  loaded_at = now();

set local role postgres;
select results_eq(
  $$
    select org_id, margin_date, esb_code, revenue, cogs_interim_sm
    from reporting.sales_margin_daily
    where org_id = '00000000-0000-0000-0000-000000000001'::uuid
      and margin_date = current_date
      and esb_code = 'ESB001'
      and branch_code = 'BR001'
  $$,
  $$
    select '00000000-0000-0000-0000-000000000001'::uuid,
           current_date,
           'ESB001',
           1000.00,
           600.00
  $$,
  'AC-A4-07: sales_margin_daily allows INSERT/UPDATE with valid org_id'
);

-- Clean up
delete from reporting.sales_margin_daily
where org_id = '00000000-0000-0000-0000-000000000001'::uuid
  and margin_date = current_date
  and esb_code = 'ESB001'
  and branch_code = 'BR001';

-- Test 8: NULL org_id should be DENIED
set local role reporting_writer;
select throws_ok(
  $$
    insert into reporting.sales_margin_daily (
      org_id,
      margin_date,
      esb_code,
      branch_code,
      branch_name,
      revenue,
      cogs_interim_sm,
      snapshot_as_of
    ) values (
      null,
      current_date,
      'ESB002',
      'BR002',
      'Test Branch NULL org',
      1000.00,
      600.00,
      now()
    )
  $$,
  42501,  -- insufficient_privilege (RLS violation)
  'new row violates row-level security policy',
  'AC-A4-08: sales_margin_daily DENIES INSERT with NULL org_id'
);

-- Test 9: Bogus org_id should be DENIED
set local role reporting_writer;
select throws_ok(
  $$
    insert into reporting.sales_margin_daily (
      org_id,
      margin_date,
      esb_code,
      branch_code,
      branch_name,
      revenue,
      cogs_interim_sm,
      snapshot_as_of
    ) values (
      '99999999-9999-9999-9999-999999999999'::uuid,
      current_date,
      'ESB003',
      'BR003',
      'Test Branch Bogus org',
      1000.00,
      600.00,
      now()
    )
  $$,
  42501,  -- insufficient_privilege (RLS violation)
  'new row violates row-level security policy',
  'AC-A4-09: sales_margin_daily DENIES INSERT with bogus org_id'
);

-- ── Additional verification: UPDATE path respects with check too ───────────────────

-- Test 10: UPDATE to NULL org_id should be DENIED
set local role postgres;
insert into reporting.ingredient_cost_lines (
  org_id,
  ingredient_esb_code,
  name,
  unit_cost,
  unit,
  as_of
) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'ING010',
  'Test Ingredient for UPDATE',
  100.50,
  'kg',
  now()
);

set local role reporting_writer;
select throws_ok(
  $$
    update reporting.ingredient_cost_lines
    set org_id = null
    where ingredient_esb_code = 'ING010'
  $$,
  42501,  -- insufficient_privilege (RLS violation)
  'new row violates row-level security policy',
  'AC-A4-10: ingredient_cost_lines DENIES UPDATE to NULL org_id'
);

-- Clean up
set local role postgres;
delete from reporting.ingredient_cost_lines where ingredient_esb_code = 'ING010';

-- Test 11: UPDATE to bogus org_id should be DENIED
set local role postgres;
insert into reporting.bom_lines (
  org_id,
  menu_item_esb_code,
  ingredient_esb_code,
  recipe_qty,
  qty_unit,
  as_of
) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'MENU010',
  'ING010',
  0.5,
  'kg',
  now()
);

set local role reporting_writer;
select throws_ok(
  $$
    update reporting.bom_lines
    set org_id = '99999999-9999-9999-9999-999999999999'::uuid
    where menu_item_esb_code = 'MENU010'
  $$,
  42501,  -- insufficient_privilege (RLS violation)
  'new row violates row-level security policy',
  'AC-A4-11: bom_lines DENIES UPDATE to bogus org_id'
);

-- Clean up
set local role postgres;
delete from reporting.bom_lines where menu_item_esb_code = 'MENU010';

-- Test 12: UPDATE within same org (legitimate case) should pass
set local role postgres;
insert into reporting.sales_margin_daily (
  org_id,
  margin_date,
  esb_code,
  branch_code,
  branch_name,
  revenue,
  cogs_interim_sm,
  snapshot_as_of
) values (
  '00000000-0000-0000-0000-000000000001'::uuid,
  current_date,
  'ESB010',
  'BR010',
  'Test Branch for UPDATE',
  1000.00,
  600.00,
  now()
);

set local role reporting_writer;
update reporting.sales_margin_daily
set revenue = 1200.00,
    cogs_interim_sm = 720.00,
    loaded_at = now()
where org_id = '00000000-0000-0000-0000-000000000001'::uuid
  and margin_date = current_date
  and esb_code = 'ESB010'
  and branch_code = 'BR010';

set local role postgres;
select results_eq(
  $$
    select revenue, cogs_interim_sm
    from reporting.sales_margin_daily
    where org_id = '00000000-0000-0000-0000-000000000001'::uuid
      and margin_date = current_date
      and esb_code = 'ESB010'
      and branch_code = 'BR010'
  $$,
  $$
    select 1200.00, 720.00
  $$,
  'AC-A4-12: sales_margin_daily allows UPDATE within same org (legitimate ON CONFLICT path)'
);

-- Clean up
delete from reporting.sales_margin_daily
where org_id = '00000000-0000-0000-0000-000000000001'::uuid
  and margin_date = current_date
  and esb_code = 'ESB010'
  and branch_code = 'BR010';

-- ── Teardown ───────────────────────────────────────────────────────────────────────
-- Revoke test scaffolding grants (prod reporting_writer must not have extensions reach)
revoke usage on schema extensions from reporting_writer;
revoke reporting_writer from postgres;

select finish();

rollback;  -- Test harness: clean up the test org row