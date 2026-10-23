-- Café locations first: production Locations are one Branch and one Activity, plans point at
-- Locations, moves inside a Branch need no route, and a route's "Record in ESB" switch is off and
-- admin-only. Each acceptance check is named AC<number> after the 2026-10-23 plan.
begin;
create extension if not exists pgtap with schema extensions;
select plan(78);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

-- Fixed ids: Gordi HQ bf01, Rumah Rames bf02, Radiant bf03 (org A); org B has bf09.
insert into shared.sites (id, org_id, name, code) values
  ('43000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'Gordi HQ', 'ghq43'),
  ('43000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Rumah Rames', 'rr43'),
  ('43000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'B Site', 'b43');

create function pg_temp.approve(p_id uuid) returns text language sql as $$
  select ops.approve_kitchen_log(p_id, 'checked', (select updated_at from ops.kitchen_logs where id = p_id))
$$;
create function pg_temp.loc(p_name text) returns uuid language sql as $$
  select id from ops.locations where org_id = '00000000-0000-0000-0000-0000000000a1' and name = p_name and archived_at is null
$$;
create function pg_temp.endpoints(p_batch text) returns text language sql as $$
  select coalesce(string_agg(endpoint, ',' order by endpoint), '-') from integrations.esb_push where source_ref = p_batch
$$;

-- ── Locations carry a Site and Activities (admin RPCs) ──────────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select set_config('app.central', ops.create_cafe_location(
  '{"name":"RRS Central","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen"],"site_id":"43000000-0000-0000-0000-0000000000a1"}',
  '43000000-0000-0000-8000-000000000001')::text, true);
select is(current_setting('app.central')::jsonb ->> 'site_id', '43000000-0000-0000-0000-0000000000a1',
  'a Location is created physically at a Site');
select is(current_setting('app.central')::jsonb -> 'activities', '["kitchen"]'::jsonb,
  'a Location carries its Activities in the RPC result');
select set_config('app.outlet', ops.create_cafe_location(
  '{"name":"RRS Outlet","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen","bar"],"site_id":"43000000-0000-0000-0000-0000000000a2"}',
  '43000000-0000-0000-8000-000000000002')::text, true);
select set_config('app.radiant', ops.create_cafe_location(
  '{"name":"Radiant Counter","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf03"]}',
  '43000000-0000-0000-8000-000000000003')::text, true);
select set_config('app.ghq_kitchen', ops.create_cafe_location(
  '{"name":"GHQ Kitchen","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf01"],"activities":["kitchen"]}',
  '43000000-0000-0000-8000-000000000004')::text, true);
select set_config('app.ghq_bar', ops.create_cafe_location(
  '{"name":"GHQ Bar","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf01"],"activities":["bar"]}',
  '43000000-0000-0000-8000-000000000005')::text, true);
select is((select activities from ops.list_cafe_locations('{}') where name = 'RRS Outlet'), array['bar', 'kitchen'],
  'the location list carries Activities');
select is((select site_id from ops.list_cafe_locations('{}') where name = 'RRS Outlet'), '43000000-0000-0000-0000-0000000000a2'::uuid,
  'the location list carries the Site');
select is(ops.update_cafe_location(
    (current_setting('app.outlet')::jsonb ->> 'id')::uuid, 1,
    '{"name":"RRS Outlet","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf02"]}',
    '43000000-0000-0000-8000-000000000006') -> 'activities',
  '["bar", "kitchen"]'::jsonb, 'an update that names no Activities keeps them');
select throws_ok($$select ops.create_cafe_location(
  '{"name":"Cross-org site","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"site_id":"43000000-0000-0000-0000-0000000000b1"}',
  '43000000-0000-0000-8000-000000000007')$$, '22023', null, 'a Location cannot sit at another organisation''s Site');

-- ── AC6: a production Location is exactly one Branch and one Activity ───────────────────────
select throws_ok($$select ops.create_cafe_location(
  '{"name":"Two branches","use":"production","branch_ids":["00000000-0000-0000-0000-00000000bf01","00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen"]}',
  '43000000-0000-0000-8000-000000000008')$$, '22023', 'CAFE_LOCATION_PRODUCTION_SHAPE',
  'AC6 a production location with two branches is refused');
select throws_ok($$select ops.create_cafe_location(
  '{"name":"Two activities","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen","bar"]}',
  '43000000-0000-0000-8000-000000000009')$$, '22023', 'CAFE_LOCATION_PRODUCTION_SHAPE',
  'AC6 a production location with two activities is refused');
select throws_ok($$select ops.create_cafe_location(
  '{"name":"No activity","use":"production","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":[]}',
  '43000000-0000-0000-8000-00000000000a')$$, '22023', 'CAFE_LOCATION_PRODUCTION_SHAPE',
  'AC6 a production location with no activity is refused');
select throws_ok($$select ops.update_cafe_location(
  (current_setting('app.central')::jsonb ->> 'id')::uuid, 1,
  '{"name":"RRS Central","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen","bar"]}',
  '43000000-0000-0000-8000-00000000000b')$$, '22023', 'CAFE_LOCATION_PRODUCTION_SHAPE',
  'AC6 an update cannot give a production location a second activity');
select lives_ok($$select ops.create_cafe_location(
  '{"name":"Shared cold room","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf01","00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen","bar"]}',
  '43000000-0000-0000-8000-00000000000c')$$, 'a storage location may span branches and activities');
reset role;
-- The database itself refuses the shape, not only the RPC: a direct write is checked at commit,
-- which SET CONSTRAINTS IMMEDIATE brings forward.
select throws_ok($$
  do $x$ begin
    insert into ops.locations (id, org_id, name, use) values
      ('43000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1', 'Direct bad', 'both');
    set constraints all immediate;
  end $x$ $$, '23514', 'CAFE_LOCATION_PRODUCTION_SHAPE',
  'AC6 the database refuses a production location with no branch or activity');
select lives_ok($$
  do $x$ begin
    insert into ops.locations (id, org_id, name, use) values
      ('43000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'Direct good', 'both');
    insert into ops.location_branches (org_id, location_id, branch_id) values
      ('00000000-0000-0000-0000-0000000000a1', '43000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000bf03');
    insert into ops.location_activities (org_id, location_id, activity) values
      ('00000000-0000-0000-0000-0000000000a1', '43000000-0000-0000-0000-0000000000c2', 'bar');
    set constraints all immediate;
  end $x$ $$, 'a direct write that ends as one branch and one activity passes');
select throws_ok($$
  do $x$ begin
    insert into ops.location_activities (org_id, location_id, activity) values
      ('00000000-0000-0000-0000-0000000000a1', '43000000-0000-0000-0000-0000000000c2', 'kitchen');
    set constraints all immediate;
  end $x$ $$, '23514', 'CAFE_LOCATION_PRODUCTION_SHAPE',
  'AC6 the database refuses a second activity on an existing production location');
delete from ops.locations where id in ('43000000-0000-0000-0000-0000000000c1', '43000000-0000-0000-0000-0000000000c2');
set constraints all deferred;

-- ── AC8: RLS and organisation isolation ─────────────────────────────────────────────────────
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'ops.location_activities'::regclass),
  'AC8 location_activities has RLS enabled and forced');
select ok(not has_table_privilege('authenticated', 'ops.location_activities', 'INSERT')
  and not has_table_privilege('authenticated', 'ops.location_activities', 'UPDATE')
  and not has_table_privilege('authenticated', 'ops.location_activities', 'DELETE'),
  'AC8 browser sessions have no direct write to location_activities');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select cmp_ok((select count(*)::int from ops.location_activities), '>=', 5, 'AC8 an org member reads its own location activities');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000e1","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.location_activities where location_id = pg_temp.loc('RRS Central')), 0,
  'AC8 another org cannot read these location activities');
select is((select count(*)::int from ops.list_cafe_locations('{}') where name = 'RRS Central'), 0,
  'AC8 another org cannot list these locations');
select throws_ok(format($f$insert into ops.kitchen_plans (log_date, wip_item_id, action, qty_porsi, from_location_id)
  values ('2026-07-01', '00000000-0000-0000-0000-00000000ab09', 'produce', 1, %L)$f$, current_setting('app.central')::jsonb ->> 'id'),
  '23514', null, 'AC8 another org cannot use these locations in a plan');
select throws_ok($$select ops.update_cafe_location(
  (current_setting('app.central')::jsonb ->> 'id')::uuid, 1,
  '{"name":"Hijacked","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"],"activities":["kitchen"]}',
  '43000000-0000-0000-8000-00000000000d')$$, '42501', null, 'AC8 another org cannot change these locations');
reset role;

-- ── Plans point at Locations; Branch, Activity and destination Branch are filled ─────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
insert into ops.kitchen_plans (id, log_date, wip_item_id, action, qty_porsi, from_location_id, to_location_id) values
  ('43000000-0000-0000-0000-0000000000f1', '2026-07-01', '00000000-0000-0000-0000-00000000ab01', 'transfer', 4,
   pg_temp.loc('RRS Central'), pg_temp.loc('RRS Outlet'));
select row_eq($$select branch_id, activity, destination_branch_id from ops.kitchen_plans where id = '43000000-0000-0000-0000-0000000000f1'$$,
  row('00000000-0000-0000-0000-00000000bf02'::uuid, 'kitchen'::text, '00000000-0000-0000-0000-00000000bf02'::uuid),
  'AC2 RRS Central to RRS Outlet saves, with Branch, Activity and destination Branch filled from the Locations');
-- A second Location of the same Branch is its own plan row; the same Location twice is not.
insert into ops.kitchen_plans (id, log_date, wip_item_id, action, destination_branch_id, qty_porsi, from_location_id, to_location_id) values
  ('43000000-0000-0000-0000-0000000000f2', '2026-07-01', '00000000-0000-0000-0000-00000000ab01', 'transfer',
   '00000000-0000-0000-0000-00000000bf02', 2, pg_temp.loc('RRS Central'), pg_temp.loc('Shared cold room'));
select is((select count(*)::int from ops.kitchen_plans where log_date = '2026-07-01' and wip_item_id = '00000000-0000-0000-0000-00000000ab01'
             and destination_branch_id = '00000000-0000-0000-0000-00000000bf02'), 2,
  'two destination Locations in one Branch are two plan rows');
select throws_ok($$insert into ops.kitchen_plans (log_date, wip_item_id, action, qty_porsi, from_location_id, to_location_id)
  values ('2026-07-01', '00000000-0000-0000-0000-00000000ab01', 'transfer', 9, pg_temp.loc('RRS Central'), pg_temp.loc('RRS Outlet'))$$,
  '23505', null, 'the same destination Location twice on one day and item is one plan row');
select throws_ok($$insert into ops.kitchen_plans (log_date, wip_item_id, action, qty_porsi, from_location_id, to_location_id)
  values ('2026-07-02', '00000000-0000-0000-0000-00000000ab01', 'transfer', 1, pg_temp.loc('RRS Central'), pg_temp.loc('RRS Central'))$$,
  '23514', null, 'a plan cannot send a Location to itself');
select throws_ok($$insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, qty_porsi, from_location_id)
  values ('2026-07-02', '00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce', 1, pg_temp.loc('RRS Central'))$$,
  '22023', 'CAFE_LOCATION_STREAM_MISMATCH', 'a plan cannot name a stream that is not its production Location''s');
-- AC10: two GHQ Locations of different Activities, no route, saves.
insert into ops.kitchen_plans (id, log_date, wip_item_id, action, qty_porsi, from_location_id, to_location_id) values
  ('43000000-0000-0000-0000-0000000000f3', '2026-07-01', '00000000-0000-0000-0000-00000000ab01', 'transfer', 3,
   pg_temp.loc('GHQ Kitchen'), pg_temp.loc('GHQ Bar'));
select row_eq($$select branch_id, activity, destination_branch_id from ops.kitchen_plans where id = '43000000-0000-0000-0000-0000000000f3'$$,
  row('00000000-0000-0000-0000-00000000bf01'::uuid, 'kitchen'::text, '00000000-0000-0000-0000-00000000bf01'::uuid),
  'AC10 a transfer between two GHQ locations of different activities saves with no route');
select is((select count(*)::int from ops.cafe_destinations where origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
             and destination_branch_id = '00000000-0000-0000-0000-00000000bf01'), 0, 'AC10 and there is no route for it');
-- A kitchen with a legacy plan (no Location ids) keeps working: it points at its Stream's production Location.
insert into ops.kitchen_plans (id, log_date, wip_item_id, branch_id, activity, action, qty_porsi) values
  ('43000000-0000-0000-0000-0000000000f4', '2026-07-01', '00000000-0000-0000-0000-00000000ab02',
   '00000000-0000-0000-0000-00000000bf02', 'kitchen', 'produce', 5);
select is((select from_location_id from ops.kitchen_plans where id = '43000000-0000-0000-0000-0000000000f4'), pg_temp.loc('RRS Central'),
  'a plan written the old way (stream only) is pointed at the stream''s only production Location');
-- A same-branch kitchen move with no Location ids is still refused: nothing says where it goes.
select throws_ok($$insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi)
  values ('2026-07-03', '00000000-0000-0000-0000-00000000ab01', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'transfer',
          '00000000-0000-0000-0000-00000000bf01', 1)$$, '42501', null,
  'a kitchen move inside its branch needs a destination Location');
reset role;

-- ── Rule 2: where a Location may send ───────────────────────────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select results_eq($$select name from ops.list_cafe_destination_locations(pg_temp.loc('RRS Central')) order by same_branch desc, name$$,
  $$values ('RRS Outlet'), ('Shared cold room'), ('Radiant Counter')$$,
  'a Location sends to every other storage Location of its Branch, then to Branches it has a route to');
select ok(not exists (select 1 from ops.list_cafe_destination_locations(pg_temp.loc('RRS Central')) where name in ('GHQ Bar', 'GHQ Kitchen', 'RRS Central')),
  'and not to another Branch without a route, nor to itself');
select results_eq($$select name from ops.list_cafe_destination_locations(pg_temp.loc('GHQ Kitchen')) order by name$$,
  $$values ('GHQ Bar'), ('Shared cold room')$$,
  'a Branch''s Locations reach each other with no route (GHQ kitchen to GHQ bar)');
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.create_cafe_location(
  '{"name":"Radiant Fridge","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf03"]}',
  '43000000-0000-0000-8000-00000000000e');
select ok(exists (select 1 from ops.list_cafe_destination_locations(pg_temp.loc('RRS Central')) where name = 'Radiant Fridge'),
  'a new storage Location in a routed Branch is a destination with no code change');
reset role;

-- ── AC4: production at RRS Central books to RRS ─────────────────────────────────────────────
-- An imported, approved production row leaves stock unplaced, which is what lets later moves be placed.
insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, status, source)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', '2026-06-30',
        '00000000-0000-0000-0000-00000000bf02', 'kitchen', 'produce', '00000000-0000-0000-0000-00000000ab02', 1, 'Approved', 'teable_import');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
insert into ops.kitchen_logs (id, business_unit_id, log_date, action, wip_item_id, qty_porsi, production_location_id) values
  ('43000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', '2026-07-03', 'produce',
   '00000000-0000-0000-0000-00000000ab01', 10, pg_temp.loc('RRS Central'));
select row_eq($$select branch_id, activity from ops.kitchen_logs where id = '43000000-0000-0000-0000-0000000000a1'$$,
  row('00000000-0000-0000-0000-00000000bf02'::uuid, 'kitchen'::text),
  'AC4 production at RRS Central is recorded against RRS and its kitchen stream');
select ok(pg_temp.approve('43000000-0000-0000-0000-0000000000a1') like 'PR-20260703-%', 'AC4 the stream reviewer approves it as a production batch');
select is((select payload ->> 'branch_code' from integrations.esb_push where source_module = 'kitchen' and source_ref like 'PR-20260703-%'),
  'rumah_rames', 'AC4 and its assembly posts against RRS');
select is((select usable_qty from ops.kitchen_stock where log_date = '2026-07-03' and branch_id = '00000000-0000-0000-0000-00000000bf02'
             and activity = 'kitchen' and wip_item_id = '00000000-0000-0000-0000-00000000ab01'), 10::numeric,
  'AC4 the stock lands in the RRS kitchen stream');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$insert into ops.kitchen_logs (business_unit_id, log_date, action, wip_item_id, qty_porsi, production_location_id)
  values ('00000000-0000-0000-0000-00000000bb01', '2026-07-03', 'produce', '00000000-0000-0000-0000-00000000ab01', 1, pg_temp.loc('RRS Central'))$$,
  '42501', null, 'AC8 a member with no Café role still cannot record production, location or not');
reset role;

-- ── AC2: RRS Central to RRS Outlet, in MOS and nothing to ESB ───────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ok((ops.place_cafe_unassigned_stock(jsonb_build_object('stream', jsonb_build_object('branch_id', '00000000-0000-0000-0000-00000000bf02', 'activity', 'kitchen'),
  'to_location_id', pg_temp.loc('RRS Central'), 'as_of', '2026-07-03'), '43000000-0000-0000-8000-000000000f01')) is not null,
  'unplaced stock is placed at RRS Central so a move can leave it');
select set_config('app.stock_before', (select coalesce(sum(usable_qty), 0)::text from ops.kitchen_stock_for_date('2026-07-03', '00000000-0000-0000-0000-00000000bf02', 'kitchen')), true);
insert into ops.kitchen_logs (id, business_unit_id, log_date, action, wip_item_id, qty_porsi, from_storage_location_id, to_storage_location_id) values
  ('43000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000bb01', '2026-07-03', 'transfer',
   '00000000-0000-0000-0000-00000000ab01', 4, pg_temp.loc('RRS Central'), pg_temp.loc('RRS Outlet'));
select row_eq($$select branch_id, activity, destination_branch_id from ops.kitchen_logs where id = '43000000-0000-0000-0000-0000000000a2'$$,
  row('00000000-0000-0000-0000-00000000bf02'::uuid, 'kitchen'::text, '00000000-0000-0000-0000-00000000bf02'::uuid),
  'AC2 a transfer log between the two RRS Locations is recorded inside RRS');
select set_config('app.batch2', pg_temp.approve('43000000-0000-0000-0000-0000000000a2'), true);
select is(pg_temp.endpoints(current_setting('app.batch2')), 'noop',
  'AC2 approving it sends nothing to ESB (the outbox row is the no-op the worker skips)');
select is((select count(*)::int from integrations.esb_push where source_ref = current_setting('app.batch2') and endpoint <> 'noop'), 0,
  'AC2 and nothing is waiting for ESB');
select is((select coalesce(sum(usable_qty), 0)::text from ops.kitchen_stock_for_date('2026-07-03', '00000000-0000-0000-0000-00000000bf02', 'kitchen')),
  current_setting('app.stock_before'), 'AC2 the stream''s stock is unchanged by a move between its own Locations');
select is((select count(*)::int from ops.location_movements where source_id = '43000000-0000-0000-0000-0000000000a2' and kind = 'move'
             and to_location_id = pg_temp.loc('RRS Outlet')), 1, 'AC2 the stock moves from RRS Central to RRS Outlet');
select is(ops.action_label(l), 'Transfer to RRS Outlet', 'the record reads "Transfer to <location name>"')
  from ops.kitchen_logs l where l.id = '43000000-0000-0000-0000-0000000000a2';
reset role;

-- ── AC10: two GHQ Locations of different Activities, nothing to ESB ─────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
insert into ops.kitchen_logs (id, business_unit_id, log_date, action, wip_item_id, qty_porsi, production_location_id) values
  ('43000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000bb01', '2026-07-04', 'produce',
   '00000000-0000-0000-0000-00000000ab01', 6, pg_temp.loc('GHQ Kitchen'));
select pg_temp.approve('43000000-0000-0000-0000-0000000000a3');
insert into ops.kitchen_logs (id, business_unit_id, log_date, action, wip_item_id, qty_porsi, from_storage_location_id, to_storage_location_id) values
  ('43000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000bb01', '2026-07-04', 'transfer',
   '00000000-0000-0000-0000-00000000ab01', 2, pg_temp.loc('GHQ Kitchen'), pg_temp.loc('GHQ Bar'));
select set_config('app.batch10', pg_temp.approve('43000000-0000-0000-0000-0000000000a4'), true);
select is(pg_temp.endpoints(current_setting('app.batch10')), 'noop',
  'AC10 a transfer between two GHQ locations of different activities sends nothing to ESB');
select is((select count(*)::int from integrations.esb_push where source_ref = current_setting('app.batch10') and endpoint <> 'noop'), 0,
  'AC10 and queues nothing');
reset role;

-- ── AC11 and AC3: the route switch ──────────────────────────────────────────────────────────
-- Rumah Rames kitchen to Radiant is a seeded route; its switch starts off.
select is((select record_in_esb from ops.cafe_destinations where origin_branch_id = '00000000-0000-0000-0000-00000000bf02'
             and origin_activity = 'kitchen' and destination_branch_id = '00000000-0000-0000-0000-00000000bf03'), false,
  'AC11 a route starts with Record in ESB off');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select record_in_esb from ops.cafe_destinations$$, '42501', null,
  'AC11 a non-admin cannot read the switch from the table');
select lives_ok($$select origin_branch_id, destination_branch_id, row_version from ops.cafe_destinations$$,
  'AC11 a non-admin still reads the route itself');
select throws_ok($$select * from ops.list_cafe_route_esb_switches()$$, '42501', 'CAFE_ROUTE_ESB_ADMIN_ONLY',
  'AC11 a non-admin cannot read the switches through the RPC');
select throws_ok($$select ops.set_cafe_route_record_in_esb(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf02","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}', true)$$,
  '42501', 'CAFE_ROUTE_ESB_ADMIN_ONLY', 'AC11 a non-admin cannot change the switch');
insert into ops.kitchen_logs (id, business_unit_id, log_date, action, wip_item_id, qty_porsi, production_location_id) values
  ('43000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000bb01', '2026-07-05', 'produce',
   '00000000-0000-0000-0000-00000000ab01', 8, pg_temp.loc('RRS Central'));
select pg_temp.approve('43000000-0000-0000-0000-0000000000a5');
insert into ops.kitchen_logs (id, business_unit_id, log_date, action, wip_item_id, qty_porsi, from_storage_location_id, to_storage_location_id) values
  ('43000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000bb01', '2026-07-05', 'transfer',
   '00000000-0000-0000-0000-00000000ab01', 3, pg_temp.loc('RRS Central'), pg_temp.loc('Radiant Counter'));
select set_config('app.batch11', pg_temp.approve('43000000-0000-0000-0000-0000000000a6'), true);
select is(pg_temp.endpoints(current_setting('app.batch11')), 'noop',
  'AC11 a cross-branch transfer on a route whose switch is off is recorded in MOS and never queued for ESB');
select is((select count(*)::int from integrations.esb_push where source_ref = current_setting('app.batch11') and endpoint <> 'noop'), 0,
  'AC11 no ESB work is waiting for it');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is((select record_in_esb from ops.list_cafe_route_esb_switches() where origin_branch_id = '00000000-0000-0000-0000-00000000bf02'
             and origin_activity = 'kitchen' and destination_branch_id = '00000000-0000-0000-0000-00000000bf03'), false,
  'AC11 an admin sees the switch');
select is((ops.set_cafe_route_record_in_esb(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf02","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}', true)) ->> 'record_in_esb',
  'true', 'AC11 an admin turns the switch on');
select is((select count(*)::int from ops.cafe_transfer_route_audit where after_route ->> 'record_in_esb' = 'true'), 1,
  'and the change is in the route audit');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
insert into ops.kitchen_logs (id, business_unit_id, log_date, action, wip_item_id, qty_porsi, from_storage_location_id, to_storage_location_id) values
  ('43000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000bb01', '2026-07-05', 'transfer',
   '00000000-0000-0000-0000-00000000ab01', 2, pg_temp.loc('RRS Central'), pg_temp.loc('Radiant Counter'));
select set_config('app.batch3', pg_temp.approve('43000000-0000-0000-0000-0000000000a7'), true);
select is(pg_temp.endpoints(current_setting('app.batch3')), 'simple-transfer',
  'AC3 RRS Central to Radiant posts a Simple Transfer once the route is switched on');
select row_eq($$select payload ->> 'branch_code', payload ->> 'destination_branch_code' from integrations.esb_push where source_ref = current_setting('app.batch3')$$,
  row('rumah_rames'::text, 'radiant'::text), 'AC3 from RRS to the destination branch, which the worker maps to its ESB branch');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000e1","access_roles":["member","admin"]}');
select throws_ok($$select ops.set_cafe_route_record_in_esb(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf02","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}', false)$$,
  '42501', 'CAFE_ROUTE_ESB_ADMIN_ONLY', 'AC8 and AC11 another org''s admin cannot touch this route''s switch');
reset role;

-- ── Phase 3: labels come from Location names ────────────────────────────────────────────────
select is(ops.kitchen_action_label('transfer', '00000000-0000-0000-0000-00000000bf02'), 'Transfer to Rumah Rames',
  'a Branch with no Location reads its own name, with no alias');
insert into ops.locations (id, org_id, name, use) values
  ('43000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1', 'Bungur', 'storage');
insert into ops.location_branches (org_id, location_id, branch_id) values
  ('00000000-0000-0000-0000-0000000000a1', '43000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-00000000bf02');
select is(ops.kitchen_action_label('transfer', '00000000-0000-0000-0000-00000000bf02', '43000000-0000-0000-0000-0000000000d1'), 'Transfer to Bungur',
  'a Location named Bungur shows as Transfer to Bungur');

-- ── AC7: plans and logs from before still show and edit correctly ───────────────────────────
-- Build a legacy-shaped database slice, then run the backfill again over it.
alter table ops.kitchen_plans disable trigger user;
alter table ops.kitchen_logs disable trigger user;
delete from ops.cafe_destinations where org_id = '00000000-0000-0000-0000-0000000000b1';
insert into ops.locations (id, org_id, name, use) values
  ('43000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'B Old Kitchen', 'both'),
  ('43000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b1', 'B Old Outlet', 'storage'),
  ('43000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b1', 'B Shared Kitchen', 'production');
insert into ops.location_branches (org_id, location_id, branch_id) values
  ('00000000-0000-0000-0000-0000000000b1', '43000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000bf09'),
  ('00000000-0000-0000-0000-0000000000b1', '43000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000bf09');
insert into ops.stream_location_defaults (org_id, branch_id, activity, production_location_id, storage_location_id) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000bf09', 'kitchen',
   '43000000-0000-0000-0000-0000000000e1', '43000000-0000-0000-0000-0000000000e1');
insert into ops.kitchen_plans (id, org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by) values
  ('43000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', '2026-07-10', '00000000-0000-0000-0000-00000000ab09',
   '00000000-0000-0000-0000-00000000bf09', 'kitchen', 'outlet_send', null, 7, null);
insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id, wip_item_id, qty_porsi,
                              status, source, submitted_by, from_storage_location_id, to_storage_location_id) values
  ('43000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000bb09', '2026-07-10',
   '00000000-0000-0000-0000-00000000bf09', 'kitchen', 'outlet_send', null, '00000000-0000-0000-0000-00000000ab09', 2, 'Approved', 'teable_import', null,
   '43000000-0000-0000-0000-0000000000e1', '43000000-0000-0000-0000-0000000000e2');
alter table ops.kitchen_plans enable trigger user;
alter table ops.kitchen_logs enable trigger user;
select ops._backfill_cafe_locations_first();
select is((select array_agg(activity) from ops.location_activities where location_id = '43000000-0000-0000-0000-0000000000e1'), array['kitchen'],
  'AC7 a stream''s default production Location now works in that stream''s Activity');
select is((select use from ops.locations where id = '43000000-0000-0000-0000-0000000000e3'), 'storage',
  'AC7 a production Location that was not one Branch and one Activity became storage, not deleted');
select is((select count(*)::int from ops.locations l where l.use in ('production', 'both') and l.archived_at is null
             and ((select count(*) from ops.location_branches b where b.location_id = l.id) <> 1
               or (select count(*) from ops.location_activities a where a.location_id = l.id) <> 1)), 0,
  'AC7 after the backfill every active production Location is one Branch and one Activity');
select ok(not exists (
  select 1 from shared.teams t where t.produces and t.archived_at is null and t.branch_id is not null
   and (select count(*) from ops.locations l
          join ops.location_branches lb on lb.location_id = l.id and lb.branch_id = t.branch_id
          join ops.location_activities la on la.location_id = l.id and la.activity = t.activity
         where l.org_id = t.org_id and l.archived_at is null and l.use in ('production', 'both')) = 0),
  'AC7 every producing stream has a production Location');
select row_eq($$select use, (select array_agg(activity) from ops.location_activities a where a.location_id = l.id)
    from ops.locations l where org_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Radiant Bar' and archived_at is null$$,
  row('both'::text, array['bar']),
  'AC7 a stream without a Location gets "<Branch> <Activity>", use both, that Branch''s Activity');
select is((select site_id from ops.locations where org_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Rumah Rames Bar'),
  '43000000-0000-0000-0000-0000000000a2'::uuid, 'AC7 a created Location sits at the Site that matches its Branch by name');
select is((select count(*)::int from ops.locations where org_id = '00000000-0000-0000-0000-0000000000a1' and name = 'Radiant Bar' and site_id is null), 1,
  'AC7 and has no Site when none matches');
select is((select from_location_id from ops.kitchen_plans where id = '00000000-0000-0000-0000-00000000ae01'), pg_temp.loc('RRS Central'),
  'AC7 an old plan row now points at its stream''s production Location');
select row_eq($$select action, destination_branch_id, from_location_id, to_location_id from ops.kitchen_plans where id = '43000000-0000-0000-0000-0000000000b1'$$,
  row('transfer'::text, '00000000-0000-0000-0000-00000000bf09'::uuid, '43000000-0000-0000-0000-0000000000e1'::uuid, '43000000-0000-0000-0000-0000000000e2'::uuid),
  'AC7 an old outlet-send plan is now a transfer inside the Branch to the outlet Location');
select row_eq($$select action, destination_branch_id, from_storage_location_id, to_storage_location_id from ops.kitchen_logs where id = '43000000-0000-0000-0000-0000000000b2'$$,
  row('transfer'::text, '00000000-0000-0000-0000-00000000bf09'::uuid, '43000000-0000-0000-0000-0000000000e1'::uuid, '43000000-0000-0000-0000-0000000000e2'::uuid),
  'AC7 an old outlet-send log is now a transfer inside the Branch, between the same Locations');
select is((select count(*)::int from ops.location_activities where location_id = '43000000-0000-0000-0000-0000000000e2' and activity = 'kitchen'), 1,
  'AC7 the outlet works in the sending stream''s Activity, so the converted send still leaves the stream''s stock alone');
select is((select production_location_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'), pg_temp.loc('RRS Central'),
  'AC7 an old production log now points at its stream''s production Location');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok($$update ops.kitchen_plans set qty_porsi = qty_porsi + 1 where id = '00000000-0000-0000-0000-00000000ae01'$$,
  'AC7 an old plan edits correctly');
select lives_ok($$update ops.kitchen_logs set notes = 'edited' where id = '00000000-0000-0000-0000-00000000ac01'$$,
  'AC7 an old log edits correctly');
select is((select count(*)::int from ops.kitchen_plans where action = 'outlet_send') + (select count(*)::int from ops.kitchen_logs where action = 'outlet_send'), 0,
  'AC7 no outlet-send rows remain, and outlet_send is still a valid value for history');

select * from finish();
rollback;
