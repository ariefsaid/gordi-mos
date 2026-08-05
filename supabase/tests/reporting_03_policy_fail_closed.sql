-- reporting, squashed baseline — one fail-closed negative per authored policy.
--
-- ⚠ THE POINT OF THIS FILE. The eleven policies in ...0015 are RE-AUTHORED, not moved. The suites
-- that proved the originals were proving statements that no longer exist — four migrations of
-- ALTER POLICY amendments collapsed into single CREATE POLICY statements. A re-authored policy
-- inherits none of its predecessor's proof, so each one gets its own negative here: a session that
-- must read or write nothing, and does.
--
-- Every negative is paired with a positive on the same table in the same run. A zero from a session
-- that should see nothing means isolation only if some other session sees something; on its own it
-- is equally consistent with an empty table, a missing grant, or a policy that denies everyone.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','RRS','Rumah Rames',10,1250000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GRI','GRI','Gordi Roastery',7,3500000.00,'2026-07-01 04:00:00+07');

insert into reporting.sales_margin_daily
  (org_id, margin_date, esb_code, branch_code, branch_name, revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, margin_interim_pct, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','RRS','Rumah Rames',1250000.00,750000.00,700000.00,500000.00,0.4000,'2026-07-01 04:00:00+07');

insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1','ING-MILK','Fresh Milk',18000.0000,'L',now());

insert into reporting.bom_lines (org_id, menu_item_esb_code, ingredient_esb_code, recipe_qty, qty_unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1','MENU-LATTE','ING-MILK',0.1800,'L',now());

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','POS','RRS');

set local role authenticated;

-- ══ sales_daily_revenue_select ══════════════════════════════════════════════════════════════
-- POSITIVE first, so every zero below is measured against a table that is demonstrably readable.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2,
  'finance reads both revenue rows — the control the negatives below are measured against');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0,
  'sales_daily_revenue_select: a plain member reads zero revenue rows');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["ops_lead","member"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0,
  'sales_daily_revenue_select: ops_lead is an operational role, not a financial one — zero revenue rows');

-- ══ sales_margin_daily_select ═══════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from reporting.sales_margin_daily), 1,
  'finance reads the margin row — the control for the margin negatives');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from reporting.sales_margin_daily), 1,
  'and so does admin — the two widest arms are checked on every table, because a policy that admits only one of them is a plausible-looking mistake');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from reporting.sales_margin_daily), 0,
  'sales_margin_daily_select: member and ops_lead read zero margin rows');

-- ══ ingredient_cost_lines_select and bom_lines_select ═══════════════════════════════════════
-- The sharpest negative in this file: MANAGER. The manager tier is company-wide revenue and margin,
-- and margin is where it meets COGS — as an already-aggregated figure. It was never granted the
-- underlying cost and recipe reference data, and the two policies here are narrower than the two
-- above precisely because of that. A manager reading these rows would be a silent widening.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from reporting.ingredient_cost_lines), 1,
  'finance reads the ingredient cost line — the control for the reference-data negatives');
select is((select count(*)::int from reporting.bom_lines), 1,
  'finance reads the recipe line');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from reporting.ingredient_cost_lines), 1,
  'and admin reads the cost line too');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select is((select count(*)::int from reporting.ingredient_cost_lines), 0,
  'ingredient_cost_lines_select: a manager reads ZERO cost lines — the tier gets aggregated margin, never the underlying unit costs');
select is((select count(*)::int from reporting.bom_lines), 0,
  'bom_lines_select: a manager reads zero recipe lines for the same reason');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from reporting.ingredient_cost_lines)
        + (select count(*)::int from reporting.bom_lines), 0,
  'and a plain member reads neither');

-- ══ supervisor_revenue_scope_select ═════════════════════════════════════════════════════════
-- Who holds financial visibility is itself sensitive: the grant list is a map of whom to target.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from reporting.supervisor_revenue_scope), 1,
  'admin reads the grant list — the control for the scope negatives');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","finance"]}';
select is((select count(*)::int from reporting.supervisor_revenue_scope), 0,
  'supervisor_revenue_scope_select: a non-admin who is named on no grant reads zero — even holding finance, because the self-read arm is by person, not by role');

-- ══ supervisor_revenue_scope_insert_admin / _delete_admin ═══════════════════════════════════
select throws_ok($$
  insert into reporting.supervisor_revenue_scope (person_id, channel, branch_code)
  values ('00000000-0000-0000-0000-0000000000d4','B2B',null)
$$, '42501', null,
  'supervisor_revenue_scope_insert_admin: a finance user cannot grant revenue scope — granting visibility is admin-only, and finance is not admin');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select lives_ok($$
  delete from reporting.supervisor_revenue_scope
   where person_id = '00000000-0000-0000-0000-0000000000d5'
$$, 'supervisor_revenue_scope_delete_admin: a supervisor deleting their OWN grant raises nothing — a USING clause filters, it does not throw');
select is((select count(*)::int from reporting.supervisor_revenue_scope), 1,
  '...and the grant is still there: the delete matched zero rows, so a supervisor cannot widen their own scope by removing its bounds');

-- ══ The four *_write_reporting_writer policies ══════════════════════════════════════════════
-- Their fail-closed proof is that they admit nobody an app session can be. Asserted two ways: the
-- catalog says each is restricted to the reporting_writer role and to no other, and an authenticated
-- session's write is refused outright.
reset role;
select is(
  (select count(*)::int from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting'
      and p.polname like '%_write_reporting_writer'
      and (p.polroles = '{0}'::oid[]                                   -- PUBLIC
           or p.polroles <> array[(select oid from pg_roles where rolname = 'reporting_writer')])),
  0, 'every writer policy is restricted to the reporting_writer role alone — none is PUBLIC, and none names a role an app session can hold');

select is(
  (select count(*)::int from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting'
      and 'anon' = any (select rolname from pg_roles where oid = any(p.polroles))),
  0, 'no policy in the schema names `anon` — an unauthenticated caller is refused before RLS is even consulted');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","admin"]}';
select throws_ok($$
  insert into reporting.sales_daily_revenue (org_id, revenue_date, channel, esb_code, branch_code, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','POS','GKI','RRS',1,1.00,now())
$$, '42501', null,
  'even a finance+admin session cannot insert a revenue figure — a number nobody can type is a number nobody can fake');
select throws_ok($$
  update reporting.sales_daily_revenue set clean_revenue = 1.00
   where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, '...nor edit one');
select throws_ok($$
  delete from reporting.sales_margin_daily where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, '...nor delete a margin row');
select throws_ok($$
  insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','ING-NEW','Invented',1.0000,'kg',now())
$$, '42501', null, '...nor invent an ingredient cost, which is what every budget total is recomputed from');
select throws_ok($$
  delete from reporting.bom_lines where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, '...nor drop a recipe line the ERP owns');

reset role;
select * from finish();
rollback;
