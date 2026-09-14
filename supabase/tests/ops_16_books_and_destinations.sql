-- Café books and destinations (#777): prove the write boundary, not only the picker mirror.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
insert into shared.business_units (id, org_id, name, code) values
  ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Retail Ops','retail_ops');
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-0000000000a1','gordi_hq','Gordi HQ'),
  ('00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
  ('00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-0000000000a1','radiant','Radiant'),
  ('00000000-0000-0000-0000-00000000bf04','00000000-0000-0000-0000-0000000000a1','cikal','Cikal'),
  ('00000000-0000-0000-0000-00000000bf05','00000000-0000-0000-0000-0000000000a1','roastery','Roastery');
insert into ops.wip_items (id, org_id, name, flag_active) values
  ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000a1','Nasi Goreng',true);
select shared.seed_stream_teams();
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-00000000ba18','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','Back Office','fixture_back_office');
-- The positive capture persona needs the same real Café affiliation required by the live INSERT
-- policy. It is deliberately only an affiliation, not an origin-stream permission: #744 keeps
-- stream selection open for help-out while the row's own stream drives the books guard.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', t.id, false, current_date
from shared.teams t
where t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'rumah_rames_kitchen';
select set_config('app.allow_test_seeds', 'off', true);

select is((select produces from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'radiant_kitchen'), false,
  'AC-001: Radiant kitchen is explicitly receive-only');
select is((select produces from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'rumah_rames_kitchen'), true,
  'AC-001: RRS kitchen explicitly produces');
select is((select produces from shared.teams where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'fixture_back_office'), null::boolean,
  'AC-001: a non-stream Team carries no produces fact');
select throws_ok($$ update shared.teams set produces = true
                  where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'fixture_back_office' $$,
  '23514', null, 'AC-001: a non-stream Team cannot be marked producing');

select results_eq($$
  select destination_branch_id from ops.allowed_kitchen_destinations(
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', 'kitchen')
  $$, $$ values
    ('00000000-0000-0000-0000-00000000bf04'::uuid),
    ('00000000-0000-0000-0000-00000000bf01'::uuid),
    ('00000000-0000-0000-0000-00000000bf03'::uuid) $$,
  'AC-003: RRS kitchen sends to each other stream branch, never itself');
select results_eq($$
  select destination_branch_id from ops.allowed_kitchen_destinations(
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf03', 'kitchen')
  $$, $$ select null::uuid where false $$,
  'AC-003: receive-only Radiant kitchen sends nowhere');
select results_eq($$
  select destination_branch_id from ops.allowed_kitchen_destinations(
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf04', 'bar')
  $$, $$ values
    ('00000000-0000-0000-0000-00000000bf01'::uuid),
    ('00000000-0000-0000-0000-00000000bf03'::uuid),
    ('00000000-0000-0000-0000-00000000bf02'::uuid) $$,
  'AC-003: Cikal bar has no intra-branch arm without a kitchen stream');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf03','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the production stream does not produce',
  'AC-002: Radiant kitchen cannot produce');
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf03','kitchen','transfer','00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the production stream does not produce',
  'AC-002: Radiant kitchen cannot transfer');
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, 'AC-002: producing RRS kitchen may log production');
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf05','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the destination is outside the production stream''s allowed books',
  'AC-004: RRS kitchen cannot transfer to Roastery');
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf01','bar','transfer','00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-00000000ab01',1)
  $$, 'AC-004: GHQ bar preserves the held intra-branch movement');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select throws_ok($$
  insert into ops.kitchen_plans (log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('2026-09-14','00000000-0000-0000-0000-00000000bf03','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the production stream does not produce',
  'AC-001: plan writes use the same receive-only refusal');
select throws_ok($$
  insert into ops.kitchen_plans (log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf05','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the destination is outside the production stream''s allowed books',
  'AC-003: plan writes use the same destination refusal');

-- Activity alone never grants a future stream production. Create this after every Roastery
-- destination refusal: the catalog intentionally considers live stream Teams regardless of whether
-- they produce, so adding this Team earlier would make Roastery a legal destination by design.
reset role;
insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01',
        'Future Roastery Kitchen','future_roastery_kitchen','00000000-0000-0000-0000-00000000bf05','kitchen');
select is((select produces from shared.teams
           where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'future_roastery_kitchen'), false,
  'AC-001: a newly added stream Team defaults receive-only; activity never infers producing');

-- Same-org validation predates and must run before the books guard. The z-prefixed trigger name
-- preserves this 23514 contract instead of masking a foreign origin as a producer refusal.
reset role;
insert into shared.business_units (id, org_id, name, code)
values ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B Retail Ops','retail_ops');
insert into shared.branches (id, org_id, code, name)
values ('00000000-0000-0000-0000-00000000bf09','00000000-0000-0000-0000-0000000000b1','b_branch','B Branch');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf09','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, '23514', 'branch_id must belong to the same org as the kitchen log',
  'AC-005: a foreign stream cannot be selected; the same-org guard keeps its contract');

-- A Team can outlive its branch record. That archived branch is not a live production stream,
-- so it must fail closed even while its Team remains unarchived and marked producing.
reset role;
update shared.branches set archived_at = now()
where id = '00000000-0000-0000-0000-00000000bf02'
  and org_id = '00000000-0000-0000-0000-0000000000a1';
select is((select archived_at from shared.teams
           where org_id = '00000000-0000-0000-0000-0000000000a1' and code = 'rumah_rames_kitchen'), null::timestamptz,
  'AC-002 fixture: the archived origin branch retains its live producing stream Team');
select results_eq($$
  select destination_branch_id from ops.allowed_kitchen_destinations(
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', 'kitchen')
  $$, $$ select null::uuid where false $$,
  'AC-003: an archived origin branch has no destination catalog');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the production stream does not produce',
  'AC-002: an archived origin branch cannot write even when its stream Team remains live');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select throws_ok($$
  insert into ops.kitchen_plans (log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the production stream does not produce',
  'AC-002: an archived origin branch cannot create a plan even when its stream Team remains live');

reset role;
select * from finish();
rollback;
