-- Café books and destinations (#777), P1.
-- Owns AC-001..AC-005: row-stream producer and destination rules, including actor negatives.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-0000000000a1','gordi_hq','Gordi HQ'),
  ('00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
  ('00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-0000000000a1','radiant','Radiant'),
  ('00000000-0000-0000-0000-00000000bf04','00000000-0000-0000-0000-0000000000a1','cikal','Cikal'),
  ('00000000-0000-0000-0000-00000000bf05','00000000-0000-0000-0000-0000000000a1','roastery','Roastery');
insert into shared.business_units (id, org_id, name, code) values
  ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar','retail_ops'),
  ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B Kitchen','retail_ops');
insert into shared.branches (org_id, code, name) values
  ('00000000-0000-0000-0000-0000000000b1','gordi_hq','B GHQ'),
  ('00000000-0000-0000-0000-0000000000b1','rumah_rames','B RRS'),
  ('00000000-0000-0000-0000-0000000000b1','radiant','B Radiant'),
  ('00000000-0000-0000-0000-0000000000b1','cikal','B Cikal');
select shared.seed_stream_teams();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);
insert into shared.teams (id, org_id, business_unit_id, name, code)
  values ('00000000-0000-0000-0000-00000000ba18','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','Back Office','fixture_back_office');

select is((select produces from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'radiant_kitchen'), false,
  'AC-001: Radiant kitchen is a receive-only stream');
select is((select produces from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'rumah_rames_kitchen'), true,
  'AC-001: RRS kitchen produces');
select is((select produces from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'fixture_back_office'), null::boolean,
  'AC-001: a non-stream Team carries no produces fact');
select throws_ok($$ update shared.teams set produces = true where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'fixture_back_office' $$,
  '23514', null, 'AC-001: setting produces on a non-stream Team is refused');

select results_eq($$ select destination_branch_id from ops.allowed_kitchen_destinations(
  '00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-00000000bf02'::uuid, 'kitchen'::text) $$,
  $$ values
    ('00000000-0000-0000-0000-00000000bf04'::uuid),
    ('00000000-0000-0000-0000-00000000bf01'::uuid),
    ('00000000-0000-0000-0000-00000000bf03'::uuid) $$,
  'AC-003: RRS kitchen sends to GHQ, Radiant and Cikal, never itself');
select results_eq($$ select destination_branch_id from ops.allowed_kitchen_destinations(
  '00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-00000000bf01'::uuid, 'bar'::text) $$,
  $$ values
    ('00000000-0000-0000-0000-00000000bf04'::uuid),
    ('00000000-0000-0000-0000-00000000bf01'::uuid),
    ('00000000-0000-0000-0000-00000000bf03'::uuid),
    ('00000000-0000-0000-0000-00000000bf02'::uuid) $$,
  'AC-003: GHQ bar includes its own kitchen-backed arm and every other bar branch');
select results_eq($$ select destination_branch_id from ops.allowed_kitchen_destinations(
  '00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-00000000bf03'::uuid, 'kitchen'::text) $$,
  $$ select null::uuid where false $$,
  'AC-003: Radiant kitchen sends nowhere');
select is((select count(*)::int from ops.allowed_kitchen_destinations(
  '00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-00000000bf05'::uuid, 'kitchen'::text)),
  0, 'AC-003: Roastery is never a destination');

insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4',(select id from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'radiant_kitchen'),true),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5',(select id from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'rumah_rames_kitchen'),true);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$ insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi) values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf03','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1) $$,
  '42501', null, 'AC-002: Radiant kitchen member cannot produce');
select throws_ok($$ insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi) values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf03','kitchen','transfer','00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-00000000ab01',1) $$,
  '42501', null, 'AC-002: Radiant kitchen member cannot transfer');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
select lives_ok($$ insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi) values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1) $$,
  'AC-002: RRS kitchen member can produce');
select throws_ok($$ insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi) values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf05','00000000-0000-0000-0000-00000000ab01',1) $$,
  '42501', null, 'AC-004: RRS kitchen cannot transfer to Roastery');
select lives_ok($$ insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi) values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',1) $$,
  'AC-004: RRS kitchen can transfer to Radiant');
select lives_ok($$ insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi) values ('00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf01','bar','transfer','00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-00000000ab01',1) $$,
  'AC-004: GHQ bar may use the held intra-branch no-document arm');

reset role;
select ok(
  (select count(*) from pg_policies where schemaname = 'ops' and tablename = 'kitchen_logs') > 0,
  'AC-005: the existing member policy surface remains present while guards read the row stream');
select * from finish();
rollback;
