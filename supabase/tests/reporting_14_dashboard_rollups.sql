begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-10-01','POS','G1','RRS','Rames',1,100.00,'2026-10-02 00:00:00+00'),
  ('00000000-0000-0000-0000-0000000000a1','2026-10-01','POS','G2','RRS','Rames',2,200.00,'2026-10-02 00:00:00+00'),
  ('00000000-0000-0000-0000-0000000000b1','2026-10-01','POS','GB','RRS','Other org',9,999.00,'2026-10-02 00:00:00+00');

insert into reporting.sales_margin_daily
  (org_id, margin_date, esb_code, branch_code, branch_name, revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, bom_coverage_pct, snapshot_as_of) values
  ('00000000-0000-0000-0000-0000000000a1','2026-10-01','G1','RRS','Rames',100.00,10.00,20.00,90.00,0.9000,'2026-10-02 00:00:00+00'),
  ('00000000-0000-0000-0000-0000000000a1','2026-10-01','G2','RRS','Rames',200.00,20.00,40.00,180.00,0.8000,'2026-10-02 00:00:00+00');

select ok(to_regclass('reporting.sales_daily_revenue_rollup') is not null, 'revenue dashboard rollup exists');
select ok(to_regclass('reporting.sales_margin_daily_rollup') is not null, 'margin dashboard rollup exists');
select ok((select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'reporting.sales_daily_revenue_rollup'::regclass), 'revenue rollup evaluates source RLS as its caller');
select ok((select 'security_invoker=true' = any(reloptions) from pg_class where oid = 'reporting.sales_margin_daily_rollup'::regclass), 'margin rollup evaluates source RLS as its caller');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'reporting.sales_daily_revenue'::regclass), 'revenue source keeps forced RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'reporting.sales_margin_daily'::regclass), 'margin source keeps forced RLS');
select ok(has_table_privilege('authenticated', 'reporting.sales_daily_revenue_rollup', 'SELECT'), 'authenticated can read revenue rollups through source RLS');
select ok(has_table_privilege('authenticated', 'reporting.sales_margin_daily_rollup', 'SELECT'), 'authenticated can read margin rollups through source RLS');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}');
select is((select count(*)::int from reporting.sales_daily_revenue_rollup where revenue_date = '2026-10-01'), 1, 'same-day revenue rows at multiple ESB codes collapse to the dashboard branch grain');
select is((select clean_revenue from reporting.sales_daily_revenue_rollup where revenue_date = '2026-10-01'), 300.00::numeric, 'revenue rollup preserves the sum');
select is((select esb_codes from reporting.sales_daily_revenue_rollup where revenue_date = '2026-10-01'), array['G1','G2']::text[], 'rollup retains every contributing ESB code');
select is((select count(*)::int from reporting.sales_margin_daily_rollup where margin_date = '2026-10-01'), 1, 'same-day margin rows at multiple ESB codes collapse to the dashboard branch grain');
select is((select cogs_interim_sm from reporting.sales_margin_daily_rollup where margin_date = '2026-10-01'), 30.00::numeric, 'margin rollup preserves COGS totals');
select is((select bom_coverage_pct from reporting.sales_margin_daily_rollup where margin_date = '2026-10-01'), 0.8500::numeric, 'coverage rollup averages the ratio instead of summing it');
select is((select bom_coverage_pct_sum from reporting.sales_margin_daily_rollup where margin_date = '2026-10-01'), 1.7000::numeric, 'coverage rollup retains the source ratio sum for date-window means');
select is((select bom_coverage_count from reporting.sales_margin_daily_rollup where margin_date = '2026-10-01'), 2, 'coverage rollup retains the source ratio count for date-window means');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["manager"]}');
select is((select clean_revenue from reporting.sales_daily_revenue_rollup where revenue_date = '2026-10-01'), 999.00::numeric, 'rollup aggregates only rows visible in the caller org');
select is((select count(*)::int from reporting.sales_margin_daily_rollup), 0, 'rollup does not expose another org margin rows');

reset role;
select * from finish();
rollback;
