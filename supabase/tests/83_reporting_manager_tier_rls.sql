begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select mos._test_seed_role_tree();  -- orgs a1 (WU-A) + b1 (WU-B)

insert into reporting.sales_daily_revenue (
  org_id, revenue_date, channel, esb_code, branch_code, branch_name,
  transactions, clean_revenue, snapshot_as_of, source_contract_version
) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','POS','GKI','BGR','Bungur',10,1250000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','B2B','GRI','GRI','Gordi Roastery',7,3500000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','POS','GKI','BGR','Bungur foreign',99,9900000.00,'2026-07-01 04:00:00+07','v_daily_revenue_unified.v1');

insert into reporting.sales_margin_daily (
  org_id, margin_date, esb_code, branch_code, branch_name,
  revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, margin_interim_pct,
  bom_coverage_pct, snapshot_as_of, source_contract_version
) values
  ('00000000-0000-0000-0000-0000000000a1','2026-07-01','GKI','BGR','Bungur',1250000.00,750000.00,700000.00,500000.00,0.4000,0.9500,'2026-07-01 04:00:00+07','pos_margin_interim.v1'),
  ('00000000-0000-0000-0000-0000000000a1','2026-07-02','GRI','GRI','Gordi Roastery',3500000.00,2100000.00,2000000.00,1400000.00,0.4000,1.0000,'2026-07-02 04:00:00+07','pos_margin_interim.v1'),
  ('00000000-0000-0000-0000-0000000000b1','2026-07-01','GKI','BGR','Bungur foreign',9900000.00,5900000.00,5500000.00,4000000.00,0.4040,0.9000,'2026-07-01 04:00:00+07','pos_margin_interim.v1');

set local role authenticated;

-- AC-103 / AC-104: manager reads same-org revenue + margin.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2, 'AC-103: manager reads org-A revenue rows');
select is((select count(*)::int from reporting.sales_margin_daily), 2, 'AC-104: manager reads org-A margin rows');

-- AC-105: coexistence ops_lead+manager still reads (independent axes).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead","manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2, 'AC-105: ops_lead+manager reads revenue');
select is((select count(*)::int from reporting.sales_margin_daily), 2, 'AC-105: ops_lead+manager reads margin');

-- AC-106: ops_lead/member-only reads zero (no financial arm).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead","member"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0, 'AC-106: ops_lead/member reads zero revenue');
select is((select count(*)::int from reporting.sales_margin_daily), 0, 'AC-106: ops_lead/member reads zero margin');

-- AC-109: finance arm not weakened.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2, 'AC-109: finance still reads revenue (policy not weakened)');

-- AC-107: cross-org manager reads zero org-A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["manager"]}';
select is((select count(*)::int from reporting.sales_daily_revenue where branch_name = 'Bungur'), 0, 'AC-107: cross-org manager reads zero org-A revenue');
select is((select count(*)::int from reporting.sales_margin_daily where branch_name = 'Bungur'), 0, 'AC-107: cross-org manager reads zero org-A margin');

-- AC-108: manager has NO write path.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select throws_ok($$
  insert into reporting.sales_daily_revenue (org_id, revenue_date, channel, esb_code, branch_code, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','POS','GKI','BGR',1,1.00,now())
$$, '42501', null, 'AC-108: manager insert denied (revenue)');
select throws_ok($$
  insert into reporting.sales_margin_daily (org_id, margin_date, esb_code, branch_code, revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-09','GKI','BGR',1.00,1.00,1.00,0.00,now())
$$, '42501', null, 'AC-108: manager insert denied (margin)');

reset role;
select * from finish();
rollback;
