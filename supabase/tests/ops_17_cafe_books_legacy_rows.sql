-- Café books legacy rows (#832), P1.
-- ops._guard_kitchen_log / ops._guard_kitchen_plan re-check "producing stream" and "allowed
-- destination" on INSERT and on a coordinate-changing UPDATE only — never on deciding, annotating
-- or amending a row whose stream or destination has since left the catalog.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-0000000000a1','gordi_hq','Gordi HQ'),
  ('00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
  ('00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-0000000000a1','radiant','Radiant'),
  ('00000000-0000-0000-0000-00000000bf04','00000000-0000-0000-0000-0000000000a1','cikal','Cikal');
insert into shared.business_units (id, org_id, name, code) values
  ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar','retail_ops');
select shared.seed_stream_teams();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

insert into shared.team_memberships (org_id, person_id, team_id, is_primary) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5',(select id from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'rumah_rames_kitchen'),true);

-- Two Submitted logs and one plan, all on RRS kitchen (a producing stream) — this is the state a
-- legacy row is left in once the stream later stops producing.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}';
insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000c101','00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1);
insert into ops.kitchen_logs (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000c102','00000000-0000-0000-0000-00000000bb01','2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',2);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["ops_lead"]}';
insert into ops.kitchen_plans (id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000c103','2026-06-25','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',3);
-- A second plan on GHQ kitchen, a stream that stays producing for the rest of this test — isolates
-- the destination arm's re-check from the producing-stream arm's.
insert into ops.kitchen_plans (id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000c104','2026-06-25','00000000-0000-0000-0000-00000000bf01','kitchen','produce','00000000-0000-0000-0000-00000000ab01',5);
reset role;

-- The stream stops producing (a catalog edit, done outside any session's own writes).
update shared.teams set produces = false
 where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'rumah_rames_kitchen';
select is((select produces from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'rumah_rames_kitchen'), false,
  '#832 setup: RRS kitchen no longer produces');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["ops_lead"]}';

-- Deciding a row already on the (now non-producing) stream never re-checks the stream: approve
-- and reject both proceed exactly as they would have before the catalog changed.
select lives_ok($$ select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000c101','fine') $$,
  '#832 AC: approving a Submitted log on a stream that has since stopped producing still succeeds');
select lives_ok($$ update ops.kitchen_logs set status = 'Rejected', review_note = 'no longer needed' where id = '00000000-0000-0000-0000-00000000c102' $$,
  '#832 AC: rejecting a Submitted log on a stream that has since stopped producing still succeeds');

-- Annotating a decided row, or amending a plan, without touching branch/activity/action/
-- destination never re-checks the stream either.
select lives_ok($$ update ops.kitchen_logs set notes = 'amended after the fact' where id = '00000000-0000-0000-0000-00000000c101' $$,
  '#832 AC: editing a non-coordinate field on an already-decided log never re-checks the stream');
select lives_ok($$ update ops.kitchen_plans set qty_porsi = 4, notes = 'revised' where id = '00000000-0000-0000-0000-00000000c103' $$,
  '#832 AC: editing a non-coordinate field on a plan never re-checks the stream');

-- A brand-new row on that stream is still refused: the guard binds on INSERT regardless of who or
-- what is deciding other rows.
select throws_ok($$ insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi) values ('00000000-0000-0000-0000-00000000bb01','2026-06-26','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1) $$,
  '42501', null, '#832 AC: a new kitchen log on a stream that stopped producing is still refused');
select throws_ok($$ insert into ops.kitchen_plans (log_date,branch_id,activity,action,wip_item_id,qty_porsi) values ('2026-06-26','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1) $$,
  '42501', null, '#832 AC: a new kitchen plan on a stream that stopped producing is still refused');

-- Re-targeting an existing plan onto that same (now non-producing) stream's movement is refused
-- too: the guard binds on a coordinate-changing UPDATE, not only on INSERT.
select throws_ok($$ update ops.kitchen_plans set action = 'transfer', destination_branch_id = '00000000-0000-0000-0000-00000000bf04' where id = '00000000-0000-0000-0000-00000000c103' $$,
  '42501', null, '#832 AC: moving a plan''s movement on a stream that stopped producing is still refused');
-- A kitchen log can never move its coordinates at all once written (the pre-existing immutable-
-- facts freeze) — the same attempt on a decided log is refused there too, by construction.
select throws_ok($$ update ops.kitchen_logs set action = 'transfer', destination_branch_id = '00000000-0000-0000-0000-00000000bf04' where id = '00000000-0000-0000-0000-00000000c102' $$,
  '42501', null, '#832 AC: moving a decided kitchen log''s coordinates is still refused');

-- GHQ kitchen still produces throughout: moving its plan's destination outside the allowed set is
-- refused by the destination arm specifically, not by the producing-stream arm.
select throws_ok($$ update ops.kitchen_plans set action = 'transfer', destination_branch_id = '00000000-0000-0000-0000-00000000bf01' where id = '00000000-0000-0000-0000-00000000c104' $$,
  '42501', null, '#832 AC: moving a plan onto a disallowed destination is refused even on a producing stream');

reset role;
select * from finish();
rollback;
