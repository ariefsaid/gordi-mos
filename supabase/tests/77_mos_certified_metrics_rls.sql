-- pgTAP: mos.certified_metrics registry (ADR-0022 D6 / anchor A7, AC-PB-011). Proves: the registry is
-- seeded (cogs.budgeted certified); finance/admin read; member reads zero; authenticated users have NO
-- runtime write path (migration-seeded only — same discipline as shared.role_capabilities); cross-org
-- isolation. begin;...rollback; — nothing ships to prod.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select mos._test_seed_role_tree();

-- The migration seed (cogs.budgeted + margin.gross_pct) carries the GORDI org id (10000000-...001),
-- which is NOT in the WU-A/B test orgs. Add an org-A-scoped row here to prove read + isolation.
insert into mos.certified_metrics (key, org_id, name, meaning, unit, grain, certified, certified_at) values
  ('test.cogs.a', '00000000-0000-0000-0000-0000000000a1', 'Test COGS A', 'test meaning', 'IDR', 'item', true, now()),
  ('test.cogs.b', '00000000-0000-0000-0000-0000000000b1', 'Test COGS B', 'test meaning', 'IDR', 'item', false, null)
on conflict (org_id, key) do nothing;

-- The migration seed is present + certified (the canonical blessed definition for this slice).
select is(
  (select certified from mos.certified_metrics where key = 'cogs.budgeted' and org_id = '10000000-0000-0000-0000-000000000001'),
  true,
  'AC-PB-011: the cogs.budgeted metric is seeded and certified');

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'certified_metrics'),
  'AC-PB-011: mos.certified_metrics has RLS enabled and forced');

set local role authenticated;

-- finance reads same-org registry rows (org A: 1 org-A test row; the seeded cogs.budgeted is org Gordi).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select is((select count(*)::int from mos.certified_metrics where org_id = '00000000-0000-0000-0000-0000000000a1'), 1,
  'AC-PB-011: finance reads same-org certified-metric rows');

-- admin reads same-org.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from mos.certified_metrics where key = 'test.cogs.a'), 1,
  'AC-PB-011: admin reads same-org certified-metric row');

-- member reads zero.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select is((select count(*)::int from mos.certified_metrics), 0,
  'AC-PB-011: member reads zero certified-metric rows');

-- cross-org finance cannot see org-A rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["finance"]}';
select is((select count(*)::int from mos.certified_metrics where key = 'test.cogs.a'), 0,
  'AC-PB-011: cross-org finance reads zero org-A certified-metric rows');

-- AC-PB-011: NO runtime CRUD — an authenticated user (even finance/admin) CANNOT insert/update/delete.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance","member"]}';
select throws_ok($$
  insert into mos.certified_metrics (key, org_id, name, meaning, unit, grain)
  values ('runtime.attempt','00000000-0000-0000-0000-0000000000a1','x','y','IDR','item')
$$, '42501', null, 'AC-PB-011: authenticated insert into registry denied (migration-seeded only)');
select throws_ok($$
  update mos.certified_metrics set certified = false where key = 'test.cogs.a'
$$, '42501', null, 'AC-PB-011: authenticated update on registry denied');

reset role;
select * from finish();
rollback;
