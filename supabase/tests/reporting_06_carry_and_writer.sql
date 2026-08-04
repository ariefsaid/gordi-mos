-- reporting, squashed baseline — the carried-in objects, the snapshot writer, and the picker.
--
-- Three things this file exists to prove, none of which is about a policy:
--
--   1. reporting.esb_ar_reduction was VERIFIED, NOT RE-CREATED. The `mos` pass authored it because
--      mos.follow_up_recon_drift is a view over it and Postgres validates a view's references at
--      creation time; re-creating it here would have dropped that view. "I did not re-create it" is
--      a claim about an absence, and an absence proves nothing on its own — so what is asserted is
--      that the table is still the ONE the view is bound to, by reading through the view.
--
--   2. reporting.ingredient_cost_lines is shaped for the consumer that needed it. mos.capture_budget
--      recomputes every budget total by joining this table, which is why its happy path could not be
--      exercised until this pass landed (mos_10_money.sql says so in its own header). One end-to-end
--      capture is run here, because "the table is shaped right" is only checkable by using it. The
--      union-of-both-suites green is still #186's.
--
--   3. The snapshot writer can actually write under FORCE RLS, and reaches nothing else.
begin;
create extension if not exists pgtap with schema extensions;

-- Test-only grants, rolled back with this transaction and deliberately never in a migration: PG17
-- separates a membership's SET option from INHERIT, so `postgres` needs an explicit SET grant to
-- assume reporting_writer at all; and the role needs USAGE on `extensions` only because pgTAP's own
-- assertion functions live there. Neither belongs to the production credential.
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;

select plan(13);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();

-- ══ 1. The AR bridge's landing zone, verified through the view that binds it ════════════════
select has_table('reporting','esb_ar_reduction',
  'reporting.esb_ar_reduction exists — authored by the mos pass, and this pass left it alone');
select col_is_pk('reporting','esb_ar_reduction', array['org_id','counterparty','period'],
  'its grain is org/counterparty/period — the aggregate the ERP journals, not an invoice');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and c.relname = 'esb_ar_reduction'),
  '...with the same RLS posture as everything else in the schema, even though a different ticket wrote it');

insert into reporting.esb_ar_reduction (org_id, counterparty, period, esb_reduction_amount, snapshot_as_of)
values ('00000000-0000-0000-0000-0000000000a1','PT Big Buyer','2026-07',750000.00,'2026-08-01 04:00:00+07');

-- The load-bearing one. mos.follow_up_recon_drift full-outer-joins this table; if the reporting pass
-- had re-created it, the create would have needed a CASCADE that silently dropped the view, and this
-- read would fail rather than return the row. Reading a value THROUGH the view is what makes the
-- verification real instead of a promise in a comment.
select is(
  (select esb_amount from mos.follow_up_recon_drift
    where counterparty = 'PT Big Buyer' and period = '2026-07'),
  750000.00::numeric,
  'the mos drift view still resolves over this exact table — the proof that it was verified rather than dropped and re-made');

-- ══ 2. The consumer that needed this schema: budget capture, end to end ═════════════════════
insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of) values
  ('00000000-0000-0000-0000-0000000000a1','ING-MILK','Fresh Milk', 18000.0000,'L', now()),
  ('00000000-0000-0000-0000-0000000000a1','ING-ESP', 'Espresso',  320000.0000,'kg',now());

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';

-- The capture runs in its own statement, deliberately. Calling the RPC inside the SELECT that reads
-- the row back returns NULL every time: the outer statement's snapshot is taken before the function
-- inserts, so the new row is not visible to the scan that is looking for it. It reads as a broken
-- RPC and is not one.
select set_config('app.test_budget_id', mos.capture_budget(
   'MENU-CAPPUC','Cappuccino','baseline','baseline',
   '00000000-0000-0000-0000-0000000000a2', now(), 'cogs.budgeted', true, null,
   array[('ING-MILK',0.1800,'L'),('ING-ESP',0.0180,'kg')]::mos.budget_line_input[])::text, true);

select is(
  (select total_budgeted_cogs from mos.budgets
    where id = current_setting('app.test_budget_id')::uuid),
  9000.0000::numeric,
  'a budget total is recomputed server-side from these cost lines — 0.18 L of milk plus 0.018 kg of espresso, priced from the table and not from anything the client sent');

select throws_ok($$
  select mos.capture_budget('MENU-X','Mystery','baseline','baseline',
    '00000000-0000-0000-0000-0000000000a2', now(), 'cogs.budgeted', true, null,
    array[('ING-UNKNOWN',1.0,'kg')]::mos.budget_line_input[])
$$, 'P0003', null,
  'and an ingredient with no cost line FAILS LOUD — treating it as zero would produce a budget that looks certified and is wrong');

-- ══ 3. The admin picker ═════════════════════════════════════════════════════════════════════
reset role;
insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','RRS','Rumah Rames',10,1250000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-02','POS','GKI','RRS','Rumah Rames', 9,1150000.00,'2026-07-02 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GRI','GRI','Gordi Roastery',7,3500000.00,'2026-07-01 04:00:00+07'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','POS','GKI','RRS','B''s own RRS',99,9900000.00,'2026-07-01 04:00:00+07');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select set_eq($$ select branch_code from reporting.list_revenue_branches() $$,
  array['RRS','GRI'],
  'the picker lists each branch ONCE however many days it has billed, and only the caller''s org — two days of Rumah Rames is one option');

-- SECURITY INVOKER is the whole design of this function: it holds no privilege of its own, so the
-- caller's RLS on the fact table decides what is enumerable. A member sees an empty picker rather
-- than the org's branch list.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from reporting.list_revenue_branches()), 0,
  'a member calling the picker gets nothing — the function runs as its caller, so it cannot be used as a side door around the read policy');

-- ══ 4. The snapshot writer ══════════════════════════════════════════════════════════════════
reset role;
set local role reporting_writer;
select lives_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-03','POS','GKI','RRS','Rumah Rames',11,1300000.00,now())
$$, 'the snapshot writer inserts under FORCE RLS — FORCE applies policies to the owner too, so without its own policy the nightly job would silently write nothing');

select lives_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-03','POS','GKI','RRS','Rumah Rames',12,1400000.00,now())
  on conflict (org_id, revenue_date, channel, esb_code, branch_code)
  do update set clean_revenue = excluded.clean_revenue, transactions = excluded.transactions
$$, 'and UPSERTS, which is how a snapshot re-runs a day. This is why the writer policy is FOR ALL rather than INSERT+UPDATE: ON CONFLICT DO UPDATE consults the SELECT policies of the row it collides with');

select lives_ok($$
  insert into reporting.ingredient_cost_lines (org_id, ingredient_esb_code, name, unit_cost, unit, as_of)
  values ('00000000-0000-0000-0000-0000000000a1','ING-SUGAR','Sugar',12000.0000,'kg',now())
  on conflict do nothing
$$, '...on the reference tables too — one credential feeds all four snapshot tables');

reset role;

-- What it cannot reach. Who holds financial visibility is not a thing a warehouse feed has any
-- business touching, and the absence of a grant is the control — no policy is consulted at all.
select ok(
  not has_table_privilege('reporting_writer','reporting.supervisor_revenue_scope','SELECT')
  and not has_table_privilege('reporting_writer','reporting.supervisor_revenue_scope','INSERT')
  and not has_table_privilege('reporting_writer','reporting.supervisor_revenue_scope','UPDATE')
  and not has_table_privilege('reporting_writer','reporting.supervisor_revenue_scope','DELETE'),
  'the snapshot credential holds no privilege of any kind on the revenue-scope table — it feeds figures, it does not decide who may read them');

select ok(
  not has_table_privilege('reporting_writer','reporting.sales_daily_revenue','DELETE')
  and not has_table_privilege('reporting_writer','reporting.sales_margin_daily','DELETE'),
  'and it cannot delete a fact row on any table it does feed — a snapshot corrects by upsert, never by removal');

select * from finish();
rollback;
