begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select mos._test_seed_role_tree();  -- orgs a1 + b1; people d1,d5,d6,d7 (a1) + b4 (b1)

-- Revenue: org a1 has 2 POS branches (BGR, SKC) + 2 B2B branches (GRI, JKT); org b1 has 1 POS (BGR).
insert into reporting.sales_daily_revenue (
  org_id, revenue_date, channel, esb_code, branch_code, branch_name,
  transactions, clean_revenue, snapshot_as_of, source_contract_version
) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','BGR','Bungur',       10,1250000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GSK','SKC','Sunter Kec',    8, 900000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GRI','GRI','Gordi Roastery', 7,3500000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GJK','JKT','B2B Jakarta',    5,2200000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','POS','GKI','BGR','Bungur foreign',99,9900000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1');

-- Margin (POS-only, no channel) — org a1 BGR, for the supervisor-denied-margin test.
insert into reporting.sales_margin_daily (
  org_id, margin_date, esb_code, branch_code, branch_name,
  revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, margin_interim_pct,
  bom_coverage_pct, snapshot_as_of, source_contract_version
) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','BGR','Bungur',1250000.00,750000.00,700000.00,500000.00,0.4000,0.9500,'2026-07-01 04:00:00+07','pos_margin_interim.v1');

-- Scope rows. The scope table has a guard reading current_org_id(), so set claims before each seed insert
-- (session role is still the superuser here → RLS bypassed, but the BEFORE-INSERT guard still runs).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','POS','BGR'),   -- Ipul analog: one POS branch
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','B2B',null),    -- Epoy analog: whole B2B channel
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','POS','BGR'),   -- multi-row: POS/BGR
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d7','B2B',null);    -- multi-row: whole B2B
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1"}';
insert into reporting.supervisor_revenue_scope (org_id, person_id, channel, branch_code) values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','POS','BGR');   -- cross-org supervisor

set local role authenticated;

-- AC-310: POS/BGR supervisor (Report ...d5) reads ONLY the POS/BGR row (not POS/SKC, not any B2B).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 1,
  'AC-310: POS/BGR supervisor reads exactly one row');
select is((select branch_code from reporting.sales_daily_revenue), 'BGR',
  'AC-310: the visible row is POS/BGR (not SKC, not any B2B)');

-- AC-311: whole-channel B2B supervisor (DualHat ...d6) reads all B2B (2), zero POS.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue where channel='B2B'), 2,
  'AC-311: whole-channel B2B supervisor reads all B2B rows');
select is((select count(*)::int from reporting.sales_daily_revenue where channel='POS'), 0,
  'AC-311: whole-channel B2B supervisor reads zero POS rows');

-- AC-316: multi-row supervisor (Lead2Holder ...d7) reads POS/BGR + all B2B (3), not POS/SKC.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 3,
  'AC-316: multi-row supervisor reads POS/BGR + all B2B (3 rows)');
select is((select count(*)::int from reporting.sales_daily_revenue where branch_code='SKC'), 0,
  'AC-316: multi-row supervisor does not read the other POS branch (SKC)');

-- AC-312: supervisor denied the margin table (zero rows).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_margin_daily), 0,
  'AC-312: supervisor reads zero margin rows (revenue-only)');

-- AC-317: supervisor with NO scope rows (Author ...d1) reads zero revenue (fail-closed).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0,
  'AC-317: supervisor with no scope rows reads zero revenue (fail-closed)');

-- AC-313: cross-org supervisor (ForeignMgr ...b4, scoped POS/BGR in org b1) reads zero org-A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["supervisor"]}';
select is((select count(*)::int from reporting.sales_daily_revenue where branch_name='Bungur'), 0,
  'AC-313: cross-org supervisor reads zero org-A revenue rows');

-- AC-314: supervisor has NO revenue write path.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["supervisor"]}';
select throws_ok($$
  insert into reporting.sales_daily_revenue (org_id, revenue_date, channel, esb_code, branch_code, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','POS','GKI','BGR',1,1.00,now())
$$, '42501', null, 'AC-314: supervisor insert denied (revenue)');

-- AC-315: finance + manager arms not weakened (each reads all 4 org-A rows).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 4,
  'AC-315: finance still reads all org-A revenue rows (arm not weakened)');

reset role;
select * from finish();
rollback;
