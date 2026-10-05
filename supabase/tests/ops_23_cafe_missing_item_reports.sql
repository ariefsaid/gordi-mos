-- #1286 — missing Café items land in the relevant stream's item-settings queue.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- d4 is an affiliated Café capturer; d1 is the Retail Ops manager; d5 is a manager outside Café.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
select '00000000-0000-0000-0000-0000000000a1',
       '00000000-0000-0000-0000-0000000000d4', team.id, true
  from shared.teams team
 where team.org_id = '00000000-0000-0000-0000-0000000000a1'
   and team.code = 'gordi_hq_kitchen';
insert into shared.business_units (id, org_id, name, code)
values ('00000000-0000-0000-0000-00000000bb52',
        '00000000-0000-0000-0000-0000000000a1', 'Other unit', 'reports_test_other');
insert into shared.roles (id, org_id, business_unit_id, name) values
  ('00000000-0000-0000-0000-00000000c521', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000bb01', 'Retail Ops report manager'),
  ('00000000-0000-0000-0000-00000000c522', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000bb52', 'Other BU report manager');
update shared.roles set cafe_item_settings_scope='kitchen' where id='00000000-0000-0000-0000-00000000c521';
insert into shared.person_roles (org_id, person_id, role_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-00000000c521'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d5',
   '00000000-0000-0000-0000-00000000c522');
select set_config('app.allow_test_seeds', 'off', true);

select has_table('ops', 'cafe_missing_item_reports', 'the missing-item queue is stored separately from the Daily Log');
select ok((select relrowsecurity and relforcerowsecurity
             from pg_class where oid = 'ops.cafe_missing_item_reports'::regclass),
  'the queue has enabled and forced RLS');
select ok(not has_table_privilege('authenticated', 'ops.cafe_missing_item_reports', 'DELETE'),
  'the app cannot delete reports');
select ok(not has_table_privilege('authenticated', 'ops.cafe_missing_item_reports', 'UPDATE'),
  'the app has no table-wide update grant');
select ok(has_column_privilege('authenticated', 'ops.cafe_missing_item_reports', 'needs_attention', 'UPDATE'),
  'the app can request a one-way resolution');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select lives_ok($$
  insert into ops.cafe_missing_item_reports (branch_id, activity, item_name)
  values ('00000000-0000-0000-0000-00000000bf01', 'kitchen', 'Oat milk')
$$, 'an affiliated Café member can report a missing item on a live stream');
select is((select count(*)::int from ops.cafe_missing_item_reports), 0,
  'capturers cannot read the managers'' needs-attention queue');
select throws_ok($$
  insert into ops.cafe_missing_item_reports (branch_id, activity, item_name)
  values ('00000000-0000-0000-0000-00000000bf01', 'not-a-stream', 'Wrong stream')
$$, '23514', 'Café missing-item report requires a live stream',
  'a report cannot name a stream without a live Café team');
select throws_ok($$
  insert into ops.cafe_missing_item_reports (branch_id, activity, item_name)
  values ('00000000-0000-0000-0000-00000000bf01', 'kitchen', '   ')
$$, '23514', null,
  'an empty missing-item name is rejected');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","manager"]}';
select is(ops.can_manage_cafe_item_settings('kitchen'), true, 'the existing item-settings manager authority governs the queue');
select is((select reported_by::text from ops.cafe_missing_item_reports limit 1),
          '00000000-0000-0000-0000-0000000000d4',
  'reporter attribution is stamped from the authenticated session');
select is((select count(*)::int from ops.cafe_missing_item_reports), 1,
  'a Kitchen manager can see the newly reported item');
select lives_ok($$
  update ops.cafe_missing_item_reports set needs_attention = false
   where item_name = 'Oat milk'
$$, 'an authorized stream manager can resolve the report from item settings');
select is((select needs_attention from ops.cafe_missing_item_reports where item_name = 'Oat milk'), false,
  'resolution clears needs_attention');
select is((select resolved_by::text from ops.cafe_missing_item_reports where item_name = 'Oat milk'),
          '00000000-0000-0000-0000-0000000000d1',
  'resolution attribution is server-stamped to the resolving manager');
select ok((select resolved_at is not null from ops.cafe_missing_item_reports where item_name = 'Oat milk'),
  'resolution time is server-stamped');
select lives_ok($$
  update ops.cafe_missing_item_reports set needs_attention = true
   where item_name = 'Oat milk'
$$, 'a resolved report cannot be reopened');
select is((select needs_attention from ops.cafe_missing_item_reports where item_name = 'Oat milk'), false,
  'the RLS update predicate leaves a resolved report closed');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member","manager"]}';
select is(ops.can_manage_cafe_item_settings('kitchen'), false, 'a manager outside Retail Ops is not a Café item-settings manager');
select is((select count(*)::int from ops.cafe_missing_item_reports), 0,
  'a manager outside Café cannot read another stream''s queue');

reset role;
select * from finish();
rollback;
