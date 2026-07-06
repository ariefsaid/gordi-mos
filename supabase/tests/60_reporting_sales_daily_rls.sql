begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();

insert into reporting.sales_daily_revenue (
  org_id, revenue_date, channel, esb_code, branch_code, branch_name,
  transactions, clean_revenue, snapshot_as_of, source_contract_version
) values
  (
    '00000000-0000-0000-0000-0000000000a1', '2026-07-01', 'POS', 'GKI', 'BGR',
    'Bungur', 10, 1250000.00, '2026-07-01 04:00:00+07', 'v_daily_revenue_unified.v1'
  ),
  (
    '00000000-0000-0000-0000-0000000000b1', '2026-07-01', 'POS', 'GKI', 'BGR',
    'Bungur foreign', 99, 9900000.00, '2026-07-01 04:00:00+07', 'v_daily_revenue_unified.v1'
  ),
  (
    '00000000-0000-0000-0000-0000000000a1', '2026-07-01', 'B2B', 'GRI', 'GRI',
    'Gordi Roastery', 7, 3500000.00, '2026-07-01 04:00:00+07', 'v_daily_revenue_unified.v1'
  );

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and c.relname = 'sales_daily_revenue'),
  'AC-001: reporting.sales_daily_revenue has RLS enabled and forced');

set local role authenticated;

-- AC-002: finance can read same-org rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2,
  'AC-002: finance reads same-org reporting rows');
select is(
  (select clean_revenue from reporting.sales_daily_revenue where channel = 'B2B' and branch_code = 'GRI'),
  3500000.00::numeric,
  'AC-011: B2B null-source branch rows are representable with ESB-code branch key');

-- AC-003: admin can read same-org rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 2,
  'AC-003: admin reads same-org reporting rows');

-- AC-004: member-only can resolve the table but sees no financial rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from reporting.sales_daily_revenue), 0,
  'AC-004: member-only reads zero reporting rows');

-- AC-005: finance in another org cannot see org A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}';
select is((select count(*)::int from reporting.sales_daily_revenue where branch_name = 'Bungur'), 0,
  'AC-005: cross-org finance reads zero org-A reporting rows');

-- AC-006: authenticated users have no write path into reporting.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select throws_ok($$
  insert into reporting.sales_daily_revenue (
    org_id, revenue_date, channel, esb_code, branch_code, transactions,
    clean_revenue, snapshot_as_of
  ) values (
    '00000000-0000-0000-0000-0000000000a1', '2026-07-02', 'POS', 'GKI', 'BGR',
    1, 1.00, now()
  )
$$, '42501', null, 'AC-006: authenticated insert denied');
select throws_ok($$
  update reporting.sales_daily_revenue set clean_revenue = 2.00
   where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, 'AC-006: authenticated update denied');
select throws_ok($$
  delete from reporting.sales_daily_revenue
   where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, 'AC-006: authenticated delete denied');

reset role;

select col_is_pk('reporting', 'sales_daily_revenue',
  array['org_id', 'revenue_date', 'channel', 'esb_code', 'branch_code'],
  'AC-008: daily sales reporting upsert key is the table primary key');

select * from finish();
rollback;
