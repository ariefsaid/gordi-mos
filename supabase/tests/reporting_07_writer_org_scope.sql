-- reporting: the snapshot writer is scoped to ONE org per run.
--
-- OWNS the acceptance for 20260821000001_reporting_writer_org_scope.sql. Every assertion here is a
-- pair, and the pair is the point: a write that must succeed and does, next to the same write that
-- must be refused and is. A green that only ever shows the allow half proves the writer still
-- works, not that anything is enforced — the refusals below are what could have come out otherwise.
--
-- ORDER MATTERS IN THIS FILE. `app.reporting_org` can be absent only until the first time it is
-- set; set_config(...,'') makes it empty, never absent again. So the undeclared case is asserted
-- FIRST, before any declaration exists in this session, and the file then walks
-- undeclared -> empty -> unparseable -> wrong org -> right org. Reordering it silently weakens it.
begin;
create extension if not exists pgtap with schema extensions;

-- Test-only grants, rolled back with this transaction and deliberately never in a migration: PG17
-- separates a membership's SET option from INHERIT, so `postgres` needs an explicit SET grant to
-- assume reporting_writer at all; and the role needs USAGE on `extensions` only because pgTAP's own
-- assertion functions live there. Neither belongs to the production credential.
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;

select plan(21);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();

-- A row of ORG B, planted by the migration runner (BYPASSRLS), so the cross-org UPDATE assertion
-- later has something real to fail to reach rather than passing on an empty table.
insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
values ('00000000-0000-0000-0000-0000000000b1','2026-08-01','POS','GKI','RRS','B''s own RRS',99,9900000.00,now());

-- ══ 1. Undeclared: the state a run is in before it declares anything ════════════════════════
-- ALL FOUR fed tables are asserted here, not just the first: "no declaration, no writes" is a
-- claim about every reporting write, and the undeclared state is the one the deploy sequencing
-- rests on. It is also the only state this file gets one shot at — see the ordering note above.
select is(reporting.current_writer_org(), null,
  'with no declaration in the session the writer org is NULL — and NULL is what no row''s org_id can equal');

set local role reporting_writer;
select throws_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-02','POS','GKI','RRS','Rumah Rames',1,1.00,now())
$$, '42501', null,
  'sales_daily_revenue: a run that has declared no org writes nothing — this is the fail-closed half, and it is why the job must be redeployed before this migration reaches an environment');
select throws_ok($$
  insert into reporting.sales_margin_daily
    (org_id, margin_date, esb_code, branch_code, revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-02','GKI','RRS',1.00,1.00,1.00,0.00,now())
$$, '42501', null, 'sales_margin_daily: undeclared writes nothing either — the margin half of the same nightly run');
select throws_ok($$
  insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','ING-SALT','Salt',9000.0000,'kg',now())
$$, '42501', null, 'ingredient_cost_lines: undeclared writes nothing either');
select throws_ok($$
  insert into reporting.bom_lines (org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty, qty_unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','MENU-X','ING-SALT',1.0000,'kg',now())
$$, '42501', null, 'bom_lines: undeclared writes nothing either — all four fed tables refuse what they must');
reset role;

-- ══ 2. Empty and unparseable declarations are refusals, not cast errors ═════════════════════
-- The distinction is not pedantry: a policy that raises 22P02 from inside a WITH CHECK produces a
-- refusal nobody can read in a log, and tempts the next reader to "fix" the cast by widening it.
select set_config('app.reporting_org', '', true);
select is(reporting.current_writer_org(), null, 'an empty declaration reads as no declaration');
set local role reporting_writer;
select throws_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-02','POS','GKI','RRS','Rumah Rames',1,1.00,now())
$$, '42501', null, '...and is refused as a policy denial, not as a cast error');
reset role;

select set_config('app.reporting_org', 'not-a-uuid', true);
select is(reporting.current_writer_org(), null, 'an unparseable declaration reads as no declaration');
set local role reporting_writer;
select throws_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-02','POS','GKI','RRS','Rumah Rames',1,1.00,now())
$$, '42501', null, '...and is refused with 42501 rather than surfacing 22P02 from inside the policy');
reset role;

-- ══ 3. A declared run cannot write outside what it declared — all four fed tables ═══════════
-- Declared as ORG B; every attempted write below is an ORG A row.
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000b1', true);
set local role reporting_writer;

select throws_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-02','POS','GKI','RRS','Rumah Rames',1,1.00,now())
$$, '42501', null,
  'sales_daily_revenue: a run declared for one org cannot write a revenue figure into another');
select throws_ok($$
  insert into reporting.sales_margin_daily
    (org_id, margin_date, esb_code, branch_code, revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-02','GKI','RRS',1.00,1.00,1.00,0.00,now())
$$, '42501', null, 'sales_margin_daily: same refusal on the margin table');
select throws_ok($$
  insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','ING-SALT','Salt',9000.0000,'kg',now())
$$, '42501', null, 'ingredient_cost_lines: same refusal on the cost reference table');
select throws_ok($$
  insert into reporting.bom_lines (org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty, qty_unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','MENU-X','ING-SALT',1.0000,'kg',now())
$$, '42501', null, 'bom_lines: same refusal on the recipe reference table');

reset role;

-- ══ 4. USING is scoped too, not just WITH CHECK ═════════════════════════════════════════════
-- A scoped WITH CHECK alone would still let a declared run reach an out-of-scope row and rewrite it
-- INTO scope. USING is what stops the reach. A USING clause filters rather than raises, so the
-- assertion is that the org-B row is untouched — a silently-zero UPDATE is the correct outcome and
-- the only way to see it is to read the row back.
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000a1', true);
set local role reporting_writer;
select lives_ok($$
  update reporting.sales_daily_revenue
     set clean_revenue = 1.00, org_id = '00000000-0000-0000-0000-0000000000a1'
   where org_id = '00000000-0000-0000-0000-0000000000b1'
$$, 'an update aimed outside the declared org raises nothing — USING filters, it does not throw');
reset role;
select is(
  (select clean_revenue from reporting.sales_daily_revenue
    where org_id = '00000000-0000-0000-0000-0000000000b1' and revenue_date = '2026-08-01'),
  9900000.00::numeric,
  '...and it changed nothing: the other org''s figure is still its own, so the reach is closed and not merely the write');

-- ══ 5. The declared org writes — the job still does its job ════════════════════════════════
set local role reporting_writer;
select lives_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-03','POS','GKI','RRS','Rumah Rames',11,1300000.00,now())
$$, 'sales_daily_revenue: the declared org''s insert succeeds');

-- The upsert is the shape the nightly run actually uses, and it is the one a scoped USING could
-- plausibly have broken: ON CONFLICT DO UPDATE has to reach the conflicting row. It works because
-- org_id is part of the conflict target, so a run only ever collides with its own org's rows.
select lives_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-03','POS','GKI','RRS','Rumah Rames',12,1400000.00,now())
  on conflict (org_id, revenue_date, channel, esb_code, branch_code)
  do update set clean_revenue = excluded.clean_revenue, transactions = excluded.transactions
$$, '...and so does the re-run upsert, which is how a snapshot corrects a day it has already written');

select lives_ok($$
  insert into reporting.sales_margin_daily
    (org_id, margin_date, esb_code, branch_code, revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-03','GKI','RRS',1000000,600000,550000,400000,now())
$$, 'sales_margin_daily: the declared org''s insert succeeds');
select lives_ok($$
  insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','ING-SALT','Salt',9000.0000,'kg',now())
$$, 'ingredient_cost_lines: the declared org''s insert succeeds');
select lives_ok($$
  insert into reporting.bom_lines (org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty, qty_unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','MENU-X','ING-SALT',1.0000,'kg',now())
$$, 'bom_lines: the declared org''s insert succeeds — all four fed tables allow what they must');
reset role;

select is(
  (select clean_revenue from reporting.sales_daily_revenue
    where org_id = '00000000-0000-0000-0000-0000000000a1' and revenue_date = '2026-08-03'),
  1400000.00::numeric,
  'and the row the writer actually left behind carries the re-run''s figure — the allow half is a write, not just an absent exception');

select * from finish();
rollback;
