-- shared, Activity is one canonical vocabulary for every production stream surface.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

select has_table('shared', 'activities', 'Activity has a canonical shared catalog');
select is((select array_agg(code order by code) from shared.activities), array['bar','kitchen']::text[],
  'the catalog owns the current vocabulary exactly once');
select fk_ok('shared','teams','activity','shared','activities','code','Teams resolve Activity through the catalog');
select fk_ok('ops','kitchen_logs','activity','shared','activities','code','logs resolve Activity through the catalog');
select fk_ok('ops','kitchen_plans','activity','shared','activities','code','plans resolve Activity through the catalog');
select fk_ok('ops','kitchen_stock','activity','shared','activities','code','stock resolves Activity through the catalog');
select fk_ok('ops','stream_completeness','activity','shared','activities','code','completeness resolves Activity through the catalog');
-- The sweep that would have caught the duplication. Scoped to the five activity-bearing tables,
-- and matched against what Postgres actually RENDERS: `check (activity in ('kitchen','bar'))`
-- comes back as `CHECK ((activity = ANY (ARRAY['kitchen'::text, 'bar'::text])))`, and a
-- single-valued allow-list as `CHECK ((activity = 'kitchen'::text))` — both are `activity = `.
-- teams_stream_pair_check reads `activity IS NULL` and is correctly left alone. Names, not a
-- count, so a red says which constraint came back.
select is((select coalesce(string_agg(conname, ', ' order by conname), '')
  from pg_constraint where contype = 'c'
  and conrelid in ('shared.teams'::regclass, 'ops.kitchen_plans'::regclass,
                   'ops.kitchen_logs'::regclass, 'ops.kitchen_stock'::regclass,
                   'ops.stream_completeness'::regclass)
  and pg_get_constraintdef(oid) ilike '%activity = %'), '',
  'no activity allow-list CHECK remains outside the catalog');

insert into shared.activities (code, name) values ('prep', 'Prep');
select lives_ok($$ select shared.seed_stream_teams() $$,
  'the stream seeder consumes every catalog Activity without another vocabulary edit');
select is((select count(*)::int from shared.teams
  where org_id = '10000000-0000-0000-0000-000000000001'
    and activity = 'prep' and archived_at is null), 3,
  'the catalog Activity is seeded for every production branch');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}';
select lives_ok($$ insert into ops.stream_completeness
  (org_id, branch_id, activity, confirmed_by)
  values ('00000000-0000-0000-0000-0000000000a1',
    '00000000-0000-0000-0000-00000000bf03','prep',
    '00000000-0000-0000-0000-0000000000d2') $$,
  'one catalog edit accepts a new activity on stream completeness');
select lives_ok($$ insert into ops.kitchen_plans
  (org_id, log_date, wip_item_id, branch_id, activity, action, qty_porsi)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-14',
    '00000000-0000-0000-0000-00000000ab01',
    '00000000-0000-0000-0000-00000000bf03','prep','produce',1) $$,
  'one catalog edit accepts a new activity on plans');
select lives_ok($$ insert into ops.kitchen_stock
  (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-14',
    '00000000-0000-0000-0000-00000000ab01',
    '00000000-0000-0000-0000-00000000bf03','prep',1) $$,
  'one catalog edit accepts a new activity on stock');
select lives_ok($$ insert into ops.kitchen_logs
  (org_id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01','2026-08-14',
    '00000000-0000-0000-0000-00000000bf03','prep','produce',
    '00000000-0000-0000-0000-00000000ab01',1,'00000000-0000-0000-0000-0000000000d1') $$,
  'one catalog edit accepts a new activity on logs');
select throws_ok($$ insert into ops.kitchen_stock
  (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
  values ('00000000-0000-0000-0000-0000000000a1','2026-08-14',
    '00000000-0000-0000-0000-00000000ab01',
    '00000000-0000-0000-0000-00000000bf03','not_in_catalog',1) $$,
  '23503', null, 'an activity absent from the catalog is rejected by the FK');
select ok(has_table_privilege('authenticated','shared.activities','SELECT'), 'authenticated can read Activities');
select ok(not has_table_privilege('authenticated','shared.activities','INSERT')
  and not has_table_privilege('authenticated','shared.activities','UPDATE')
  and not has_table_privilege('authenticated','shared.activities','DELETE'), 'Activities are read-only to the app');
select * from finish();
rollback;
