-- Café books and destinations (#777): prove the write boundary, not only the picker mirror.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

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
select results_eq($$
  select activity from shared.teams
  where org_id = '00000000-0000-0000-0000-0000000000a1'
    and branch_id = '00000000-0000-0000-0000-00000000bf01'
    and archived_at is null
  order by activity
  $$, $$ values ('bar'::text), ('kitchen'::text) $$,
  'Gordi HQ has both bar and kitchen stream Teams');
select ok((select relrowsecurity and relforcerowsecurity
           from pg_class where oid = 'ops.cafe_destinations'::regclass),
  'destination reference rows enable and force RLS');
select ok(exists (select 1 from pg_policies
                  where schemaname = 'ops' and tablename = 'cafe_destinations'
                    and policyname = 'cafe_destinations_select_org'
                    and qual like '%current_org_id%'),
  'destination reference reads are scoped to the current org');
select ok(not has_table_privilege('authenticated', 'ops.cafe_destinations', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_destinations', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_destinations', 'DELETE'),
  'destination reference data has no authenticated write grant');
-- The item is on every stream's list (#222), so each refusal below is the books guard's own.
insert into ops.stream_items (org_id,branch_id,activity,wip_item_id,source)
select '00000000-0000-0000-0000-0000000000a1', t.branch_id, t.activity,
       '00000000-0000-0000-0000-00000000ab01', 'manual'
from shared.teams t
where t.org_id='00000000-0000-0000-0000-0000000000a1'
  and t.branch_id is not null and t.archived_at is null;
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
    ('00000000-0000-0000-0000-00000000bf03'::uuid) $$,
  'AC-003: RRS kitchen sends to Cikal and Radiant, not GHQ or itself');
select results_eq($$
  select destination_branch_id from ops.allowed_kitchen_destinations(
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', 'kitchen')
  order by destination_branch_id
  $$, $$ select destination_branch_id from ops.cafe_destinations
       where org_id = '00000000-0000-0000-0000-0000000000a1'
         and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
         and origin_activity = 'kitchen'
       order by destination_branch_id $$,
  'AC-003: GHQ kitchen destination behavior follows its route rows');
select ok(exists (select 1 from ops.cafe_destinations
                  where org_id = '00000000-0000-0000-0000-0000000000a1'
                    and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
                    and origin_activity = 'kitchen'
                    and destination_branch_id = '00000000-0000-0000-0000-00000000bf04')
          and not exists (select 1 from ops.cafe_destinations
                          where org_id = '00000000-0000-0000-0000-0000000000a1'
                            and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
                            and origin_activity = 'kitchen'
                            and destination_branch_id in ('00000000-0000-0000-0000-00000000bf02',
                                                          '00000000-0000-0000-0000-00000000bf03')),
  'AC-003: current GHQ kitchen data includes Cikal and excludes RRS/Radiant, without pinning future destinations');
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
select results_eq($$
  select destination_branch_id from ops.allowed_kitchen_destinations(
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', 'bar')
  order by destination_branch_id
  $$, $$ select destination_branch_id from ops.cafe_destinations
       where org_id = '00000000-0000-0000-0000-0000000000a1'
         and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
         and origin_activity = 'bar'
       union all
       select '00000000-0000-0000-0000-00000000bf01'::uuid
       where exists (select 1 from shared.teams
                     where org_id = '00000000-0000-0000-0000-0000000000a1'
                       and branch_id = '00000000-0000-0000-0000-00000000bf01'
                       and activity = 'kitchen' and archived_at is null)
       order by destination_branch_id $$,
  'AC-003: GHQ bar destination behavior follows its route rows plus its held intra-branch arm');
select ok(exists (select 1 from ops.cafe_destinations
                  where org_id = '00000000-0000-0000-0000-0000000000a1'
                    and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
                    and origin_activity = 'bar'
                    and destination_branch_id = '00000000-0000-0000-0000-00000000bf04')
          and not exists (select 1 from ops.cafe_destinations
                          where org_id = '00000000-0000-0000-0000-0000000000a1'
                            and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
                            and origin_activity = 'bar'
                            and destination_branch_id in ('00000000-0000-0000-0000-00000000bf02',
                                                          '00000000-0000-0000-0000-00000000bf03')),
  'AC-003: current GHQ bar data includes Cikal and excludes RRS/Radiant, apart from its held arm');
select results_eq($$
  select destination_branch_id from ops.allowed_kitchen_destinations(
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', 'bar')
  $$, $$ values
    ('00000000-0000-0000-0000-00000000bf04'::uuid),
    ('00000000-0000-0000-0000-00000000bf01'::uuid),
    ('00000000-0000-0000-0000-00000000bf03'::uuid),
    ('00000000-0000-0000-0000-00000000bf02'::uuid) $$,
  'AC-003: RRS bar includes its held intra-branch arm and every other bar branch');
select results_eq($$
  select destination_branch_id from ops.allowed_kitchen_destinations(
    '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf03', 'bar')
  $$, $$ values
    ('00000000-0000-0000-0000-00000000bf04'::uuid),
    ('00000000-0000-0000-0000-00000000bf01'::uuid),
    ('00000000-0000-0000-0000-00000000bf03'::uuid),
    ('00000000-0000-0000-0000-00000000bf02'::uuid) $$,
  'AC-003: Radiant bar includes its held intra-branch arm and every other bar branch');

-- A future HQ destination is enabled by inserting route data, without changing derivation code.
insert into ops.cafe_destinations (org_id, origin_branch_id, origin_activity, destination_branch_id)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01',
        'kitchen', '00000000-0000-0000-0000-00000000bf03');
select ok(exists (select 1 from ops.allowed_kitchen_destinations(
                    '00000000-0000-0000-0000-0000000000a1',
                    '00000000-0000-0000-0000-00000000bf01', 'kitchen')
                  where destination_branch_id = '00000000-0000-0000-0000-00000000bf03'),
  'OD-CAFE-MVP-7: adding an HQ route row makes the new destination available');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select ok(exists (select 1 from ops.cafe_destinations
                  where org_id = '00000000-0000-0000-0000-0000000000a1'
                    and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
                    and origin_activity = 'kitchen'),
  'authenticated org members can read their destination routes');
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
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf01','bar','produce','00000000-0000-0000-0000-00000000ab01',2)
  $$, 'AC-005: an RRS kitchen member may write GHQ bar; the books guard reads the row stream, never the caller membership');
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',1)
  $$, 'AC-004: RRS kitchen may transfer to Radiant');
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf05','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the destination is outside the production stream''s allowed books',
  'AC-004: RRS kitchen cannot transfer to Roastery');
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf01','bar','transfer','00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-00000000ab01',1)
  $$, 'AC-004: GHQ bar preserves the held intra-branch movement');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
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
select throws_ok($$ insert into ops.cafe_destinations
  (org_id, origin_branch_id, origin_activity, destination_branch_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01',
          'bar', '00000000-0000-0000-0000-00000000bf09') $$,
  '23503', null, 'destination route foreign keys enforce the org seam');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
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
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the production stream does not produce',
  'AC-002: an archived origin branch cannot write even when its stream Team remains live');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$
  insert into ops.kitchen_plans (log_date,branch_id,activity,action,wip_item_id,qty_porsi)
  values ('2026-09-14','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',1)
  $$, '42501', 'the production stream does not produce',
  'AC-002: an archived origin branch cannot create a plan even when its stream Team remains live');

reset role;
select * from finish();
rollback;
