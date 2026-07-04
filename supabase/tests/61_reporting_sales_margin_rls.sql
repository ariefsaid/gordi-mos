begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();

-- §7a corrected contract: POS-only, no channel column.
insert into reporting.sales_margin_daily (
  org_id, margin_date, esb_code, branch_code, branch_name,
  revenue, cogs_interim_sm, cogs_budget_bom, margin_interim, margin_interim_pct,
  bom_coverage_pct, snapshot_as_of, source_contract_version
) values
  (
    '00000000-0000-0000-0000-0000000000a1', '2026-07-01', 'GKI', 'BGR',
    'Bungur', 1250000.00, 750000.00, 700000.00, 500000.00, 0.4000,
    0.9500, '2026-07-01 04:00:00+07', 'pos_margin_interim.v1'
  ),
  (
    '00000000-0000-0000-0000-0000000000b1', '2026-07-01', 'GKI', 'BGR',
    'Bungur foreign', 9900000.00, 5900000.00, 5500000.00, 4000000.00, 0.4040,
    0.9000, '2026-07-01 04:00:00+07', 'pos_margin_interim.v1'
  ),
  (
    '00000000-0000-0000-0000-0000000000a1', '2026-07-02', 'GRI', 'GRI',
    'Gordi Roastery', 3500000.00, 2100000.00, 2000000.00, 1400000.00, 0.4000,
    1.0000, '2026-07-02 04:00:00+07', 'pos_margin_interim.v1'
  );

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'reporting' and c.relname = 'sales_margin_daily'),
  'AC-M01: reporting.sales_margin_daily has RLS enabled and forced');

select col_is_pk('reporting', 'sales_margin_daily',
  array['org_id', 'margin_date', 'esb_code', 'branch_code'],
  'AC-M01: margin upsert key is the table primary key (no channel column, §7a)');

set local role authenticated;

-- AC-M02: finance can read same-org rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select is((select count(*)::int from reporting.sales_margin_daily), 2,
  'AC-M02: finance reads same-org margin rows');

-- AC-M03: admin can read same-org rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from reporting.sales_margin_daily), 2,
  'AC-M03: admin reads same-org margin rows');

-- AC-M04: member-only can resolve the table but sees no financial rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from reporting.sales_margin_daily), 0,
  'AC-M04: member-only reads zero margin rows');

-- AC-M05: finance in another org cannot see org A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}';
select is((select count(*)::int from reporting.sales_margin_daily where branch_name = 'Bungur'), 0,
  'AC-M05: cross-org finance reads zero org-A margin rows');

-- AC-M06: authenticated users have no write path into reporting.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select throws_ok($$
  insert into reporting.sales_margin_daily (
    org_id, margin_date, esb_code, branch_code, revenue, cogs_interim_sm,
    cogs_budget_bom, margin_interim, snapshot_as_of
  ) values (
    '00000000-0000-0000-0000-0000000000a1', '2026-07-03', 'GKI', 'BGR',
    1.00, 1.00, 1.00, 0.00, now()
  )
$$, '42501', null, 'AC-M06: authenticated insert denied');
select throws_ok($$
  update reporting.sales_margin_daily set margin_interim = 2.00
   where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, 'AC-M06: authenticated update denied');
select throws_ok($$
  delete from reporting.sales_margin_daily
   where org_id = '00000000-0000-0000-0000-0000000000a1'
$$, '42501', null, 'AC-M06: authenticated delete denied');

reset role;

-- AC-M07: reporting_writer can write under FORCE RLS (scoped FOR-ALL bypass).
set local role reporting_writer;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
select lives_ok($$
  insert into reporting.sales_margin_daily
    (org_id, margin_date, esb_code, branch_code, revenue, cogs_interim_sm,
     cogs_budget_bom, margin_interim, margin_interim_pct, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-03','GKI','BGR',
          1000000,600000,550000,400000,0.4000, now())
  on conflict do nothing
$$, 'AC-M07: reporting_writer insert ok under FORCE RLS');
reset role;

select * from finish();
rollback;
