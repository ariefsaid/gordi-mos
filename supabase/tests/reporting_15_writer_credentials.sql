-- A login's database assignment and each run's declaration both constrain writes.
begin;
create extension if not exists pgtap with schema extensions;
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;
select plan(7);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
set local role reporting_writer;
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000a1', true);
select throws_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-03','POS','GKI','RRS','Test',1,1,now())
$$, '42501', null, 'an unmapped login cannot write by declaring an org');
reset role;
insert into reporting_private.writer_orgs (login_oid, login_name, org_id)
select oid, rolname, '00000000-0000-0000-0000-0000000000a1'::uuid
from pg_catalog.pg_roles where rolname = session_user;
insert into reporting.sales_daily_revenue
  (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
values ('00000000-0000-0000-0000-0000000000b1','2026-08-03','POS','GKI','RRS','Other',1,10,now());
set local role reporting_writer;
select throws_ok($$
  insert into reporting_private.writer_orgs (login_oid, login_name, org_id)
  values (0, 'reporting_writer', '00000000-0000-0000-0000-0000000000b1')
$$, '42501', null, 'writer cannot alter assignments');
select lives_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-03','POS','GKI','RRS','Test',1,1,now())
  on conflict (org_id, revenue_date, channel, esb_code, branch_code)
  do update set clean_revenue = excluded.clean_revenue
$$, 'mapped login writes its declared org');
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000b1', true);
select is((select count(*)::int from reporting.sales_daily_revenue where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'changing the declaration cannot read another org');
select throws_ok($$
  insert into reporting.sales_daily_revenue
    (org_id, revenue_date, channel, esb_code, branch_code, branch_name, transactions, clean_revenue, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000b1','2026-08-04','POS','GKI','RRS','Other',1,1,now())
$$, '42501', null, 'changing the declaration cannot write another org');
with changed as (update reporting.sales_daily_revenue set clean_revenue = 0
  where org_id = '00000000-0000-0000-0000-0000000000b1' returning 1)
select is(count(*)::int, 0, 'changing the declaration cannot update another org') from changed;
select set_config('app.reporting_org', '', true);
select is((select count(*)::int from reporting.sales_daily_revenue where org_id = '00000000-0000-0000-0000-0000000000a1'), 0,
  'a mapped login still needs a declaration for each transaction');
reset role;
select * from finish();
rollback;
