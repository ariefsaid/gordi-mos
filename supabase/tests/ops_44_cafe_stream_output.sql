-- A stream's designated output place remains its own place among several production Locations.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);
create function pg_temp.loc(p_name text) returns uuid language sql as $$
  select id from ops.locations where org_id = '00000000-0000-0000-0000-0000000000a1' and name = p_name
$$;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.create_cafe_location(
  '{"name":"RRS Central","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen"]}',
  '44000000-0000-0000-8000-000000000001');
select ops.create_cafe_location(
  '{"name":"RRS Outlet Kitchen","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen"]}',
  '44000000-0000-0000-8000-000000000002');
select ops.create_cafe_location(
  '{"name":"Shelf","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf02"]}',
  '44000000-0000-0000-8000-000000000003');
reset role;
insert into ops.locations(id, org_id, name, use, is_stream_output) values
  ('44000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'Other org output', 'both', true);
insert into ops.location_branches(org_id, location_id, branch_id) values
  ('00000000-0000-0000-0000-0000000000b1', '44000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000bf09');
insert into ops.location_activities(org_id, location_id, activity) values
  ('00000000-0000-0000-0000-0000000000b1', '44000000-0000-0000-0000-0000000000b1', 'kitchen');
select is(ops._cafe_stream_output_location('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000bf09', 'kitchen'),
  '44000000-0000-0000-0000-0000000000b1'::uuid, 'the foreign-org fixture has a valid own output place before checking isolation');
update ops.locations set is_stream_output = true where id = pg_temp.loc('RRS Central');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is(ops._cafe_stream_output_location('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', 'kitchen'),
  pg_temp.loc('RRS Central'), 'Central is the own output place when the outlet shares its Branch and Activity');
select results_eq($$select name from ops.list_cafe_destination_locations('00000000-0000-0000-0000-00000000bf02', 'kitchen') order by name$$,
  $$values ('RRS Outlet Kitchen'), ('Shelf')$$, 'the own output place is excluded while the other own-Branch storage places remain');
select is((select is_stream_output from ops.list_cafe_locations('{}') where name = 'RRS Central'), true,
  'the member catalog carries the designation used by Production');
select throws_ok($$update ops.locations set is_stream_output = false where id = pg_temp.loc('RRS Central')$$,
  '42501', null, 'a member cannot change the output designation by writing the Location table');
select is(ops._cafe_stream_output_location('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000bf09', 'kitchen'),
  null::uuid, 'the own-place lookup reveals nothing from another organisation');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is(ops.update_cafe_location(pg_temp.loc('RRS Central'), (select row_version::integer from ops.list_cafe_locations('{}') where name = 'RRS Central'),
  '{"name":"Renamed Central","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen"]}',
  '44000000-0000-0000-8000-000000000004') -> 'is_stream_output', 'true'::jsonb,
  'renaming the own place preserves its designation in the write response');
reset role;
update ops.locations set is_stream_output = true where id = pg_temp.loc('RRS Outlet Kitchen');
set local role authenticated;
select is(ops._cafe_stream_output_location('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', 'kitchen'),
  null::uuid, 'conflicting designations never guess an own place');
reset role;
update ops.locations set archived_at = now() where id = pg_temp.loc('RRS Outlet Kitchen');
set local role authenticated;
select is(ops._cafe_stream_output_location('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', 'kitchen'),
  pg_temp.loc('Renamed Central'), 'an archived designation does not displace the active own place');
select * from finish();
rollback;
