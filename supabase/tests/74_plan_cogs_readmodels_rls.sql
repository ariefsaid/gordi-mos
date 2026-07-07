-- pgTAP: reporting.ingredient_cost_lines + reporting.bom_lines RLS (ADR-0022 D2/D6, AC-PB-009).
-- Mirrors 61_reporting_sales_margin_rls.sql. Proves: RLS enabled+forced; finance/admin read same-org;
-- member reads zero; cross-org finance reads zero; authenticated cannot write; reporting_writer can
-- write under FORCE RLS (the future warehouse->Supabase snapshot job).
begin;
create extension if not exists pgtap with schema extensions;

-- Test-only grants, rolled back with this transaction (mirrors 61): PG17 separates the per-membership
-- SET option from INHERIT, so `postgres` needs an explicit SET grant to `set local role reporting_writer`;
-- and reporting_writer needs USAGE on `extensions` only because pgTAP's assertion functions live there.
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;

select plan(11);

select mos._test_seed_role_tree();

-- Seed representative rows in TWO orgs (org A = ...0a1, foreign org B = ...0b1).
insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1', 'ING-MILK',  'Fresh Milk', 18000.00, 'L',  now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000a1', 'ING-ESP',   'Espresso',  320000.00,'kg', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000b1', 'ING-FOREIGN','Foreign',    1000.00, 'kg', now());

insert into reporting.bom_lines (org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty, qty_unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1', 'MENU-CAPPUC', 'ING-MILK', 0.18,  'L',  now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000a1', 'MENU-CAPPUC', 'ING-ESP',  0.018, 'kg', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000b1', 'MENU-FOREIGN','ING-FOREIGN',1,    'kg', now());

-- RLS enabled + forced on both tables.
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and c.relname = 'ingredient_cost_lines'),
  'AC-PB-009: reporting.ingredient_cost_lines has RLS enabled and forced');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and c.relname = 'bom_lines'),
  'AC-PB-009: reporting.bom_lines has RLS enabled and forced');

set local role authenticated;

-- finance reads same-org cost lines (2) + BOM (2).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select is((select count(*)::int from reporting.ingredient_cost_lines), 2,
  'AC-PB-009: finance reads same-org ingredient cost lines');
select is((select count(*)::int from reporting.bom_lines), 2,
  'AC-PB-009: finance reads same-org BOM lines');

-- admin reads same-org rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from reporting.ingredient_cost_lines), 2,
  'AC-PB-009: admin reads same-org ingredient cost lines');

-- member-only reads ZERO financial reference rows (finance/admin-gated this slice).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from reporting.ingredient_cost_lines), 0,
  'AC-PB-009: member-only reads zero cost lines (finance/admin gate)');
select is((select count(*)::int from reporting.bom_lines), 0,
  'AC-PB-009: member-only reads zero BOM rows');

-- cross-org finance cannot see org-A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}';
select is((select count(*)::int from reporting.ingredient_cost_lines where ingredient_esb_code = 'ING-MILK'), 0,
  'AC-PB-009: cross-org finance reads zero org-A cost lines');

-- authenticated users have NO write path into reporting.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select throws_ok($$
  insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','ING-NEW','New',1.00,'kg',now())
$$, '42501', null, 'AC-PB-009: authenticated insert into cost lines denied');
select throws_ok($$
  delete from reporting.bom_lines where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, 'AC-PB-009: authenticated delete on BOM denied');

reset role;

-- reporting_writer can write under FORCE RLS (the future snapshot job).
set local role reporting_writer;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
select lives_ok($$
  insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','ING-WRITER','Writer',2.00,'kg',now())
  on conflict do nothing
$$, 'reporting_writer insert ok under FORCE RLS (snapshot job)');
reset role;

select * from finish();
rollback;
