-- Transfer-route administration protects new plans/captures while preserving submitted history.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

-- A real second-org route proves that callers cannot address another org's configuration.
insert into shared.branches (id, org_id, code, name) values
  ('00000000-0000-0000-0000-00000000bf10','00000000-0000-0000-0000-0000000000b1','b_transfer_destination','B Transfer Destination');
insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity, produces)
values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb09',
  'B Transfer Destination Kitchen','b_transfer_destination_kitchen','00000000-0000-0000-0000-00000000bf10','kitchen',false);
insert into ops.cafe_destinations (org_id, origin_branch_id, origin_activity, destination_branch_id)
values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bf09','kitchen',
  '00000000-0000-0000-0000-00000000bf10');

select ok((select relrowsecurity and relforcerowsecurity
  from pg_class where oid = 'ops.cafe_transfer_route_audit'::regclass),
  'route audit has RLS enabled and forced');
select ok(not has_table_privilege('authenticated', 'ops.cafe_destinations', 'INSERT')
  and not has_table_privilege('authenticated', 'ops.cafe_destinations', 'UPDATE')
  and not has_table_privilege('authenticated', 'ops.cafe_destinations', 'DELETE'),
  'browser sessions have no direct route-table DML');
select ok(not has_table_privilege('authenticated', 'ops.cafe_transfer_route_audit', 'INSERT')
  and not has_table_privilege('authenticated', 'ops.cafe_transfer_route_audit', 'UPDATE')
  and not has_table_privilege('authenticated', 'ops.cafe_transfer_route_audit', 'DELETE'),
  'browser sessions cannot write route audit history');
select ok(exists (select 1 from shared.role_capabilities
  where role = 'admin' and capability = 'cafe.transfer_routes.manage')
  and not exists (select 1 from shared.role_capabilities
    where role <> 'admin' and capability = 'cafe.transfer_routes.manage'),
  'only admin receives transfer-route management capability');
select ok(not has_function_privilege('anon', 'ops._check_cafe_transfer_route_conflict(uuid,uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'ops._check_cafe_transfer_route_conflict(uuid,uuid,text,uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'ops._check_cafe_transfer_route_conflict(uuid,uuid,text,uuid)', 'EXECUTE'),
  'the shared conflict check is callable only inside the route RPCs');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}');

select is((select r.row_version from ops.create_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  '40000000-0000-0000-8000-000000000001') r), 1::bigint,
  'admin creates an eligible route at version 1');
select is((select r.updated_by from ops.list_cafe_transfer_routes() r
  where r.origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
    and r.origin_activity = 'kitchen' and r.destination_branch_id = '00000000-0000-0000-0000-00000000bf02'),
  '00000000-0000-0000-0000-0000000000d3'::uuid,
  'route provenance is stamped from the signed-in admin');
select is((select r.row_version from ops.create_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  '40000000-0000-0000-8000-000000000001') r), 1::bigint,
  'a retry of the same request returns its original version');
select is((select count(*)::int from ops.cafe_transfer_route_audit
  where request_id = '40000000-0000-0000-8000-000000000001'), 1,
  'an idempotent retry creates no second audit event');
select throws_ok($$select * from ops.create_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  '40000000-0000-0000-8000-000000000002')$$,
  '22023', 'transfer route already exists', 'duplicate route creation is refused');

savepoint route_conflict;
select is((select r.row_version from ops.create_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}'::jsonb,
  '40000000-0000-0000-8000-000000000011') r), 1::bigint,
  'admin can create a different route for the same origin stream');
select throws_ok($$select * from ops.update_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  1,
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}'::jsonb,
  '40000000-0000-0000-8000-000000000012')$$,
  '22023', 'transfer route already exists', 'updating a route to an existing route is refused');
select is((select r.row_version from ops.list_cafe_transfer_routes() r
  where r.origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
    and r.origin_activity = 'kitchen' and r.destination_branch_id = '00000000-0000-0000-0000-00000000bf02'),
  1::bigint, 'a conflicting update preserves the original route and version');
select is((select count(*)::int from ops.cafe_transfer_route_audit
  where request_id in ('40000000-0000-0000-8000-000000000002','40000000-0000-0000-8000-000000000012')),
  0, 'refused create and update conflicts leave no audit events');
select is((select r.row_version from ops.update_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  1,
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  '40000000-0000-0000-8000-000000000013') r), 2::bigint,
  'updating a route without changing its key does not conflict with itself');
select is((select r.row_version from ops.update_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  1,
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  '40000000-0000-0000-8000-000000000013') r), 2::bigint,
  'retrying the unchanged-key update returns its original version');
select is((select count(*)::int from ops.cafe_transfer_route_audit
  where request_id = '40000000-0000-0000-8000-000000000013'),
  1, 'retrying the unchanged-key update adds no audit event');
rollback to savepoint route_conflict;
release savepoint route_conflict;

select throws_ok($$select * from ops.create_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf01"}'::jsonb,
  '40000000-0000-0000-8000-000000000003')$$,
  '22023', 'origin and destination must be different branches', 'same-branch routes are refused');
select throws_ok($$select * from ops.create_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf10"}'::jsonb,
  '40000000-0000-0000-8000-000000000004')$$,
  '22023', 'destination is not eligible for this origin stream', 'a destination from another org is refused');
select is((select r.row_version from ops.update_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  1,
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}'::jsonb,
  '40000000-0000-0000-8000-000000000005') r), 2::bigint,
  'admin updates a route using its expected version');
select is((select count(*)::int from ops.cafe_destinations
  where org_id = '00000000-0000-0000-0000-0000000000a1'
    and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
    and origin_activity = 'kitchen' and destination_branch_id in (
      '00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000bf03')),
  1, 'editing a route replaces its key rather than leaving the old allowlist row');
select throws_ok($$select * from ops.update_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}'::jsonb,
  1,
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}'::jsonb,
  '40000000-0000-0000-8000-000000000006')$$,
  '40001', 'transfer route changed since it was loaded', 'a stale edit returns a conflict');
select throws_ok($$select * from ops.update_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf09","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf10"}'::jsonb,
  1,
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf09","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf10"}'::jsonb,
  '40000000-0000-0000-8000-000000000007')$$,
  'P0002', 'transfer route not found', 'an admin cannot update another organization''s route');
select lives_ok($$insert into ops.kitchen_logs
  (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-10-10','00000000-0000-0000-0000-00000000bf01',
    'kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',1)$$,
  'a submitted transfer can use an enabled route');
select ok(exists (select 1 from ops.allowed_kitchen_destinations(
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','kitchen') d
  where d.destination_branch_id = '00000000-0000-0000-0000-00000000bf03'),
  'the capture destination read includes the enabled route');
select lives_ok($$select ops.remove_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}'::jsonb,
  2, '40000000-0000-0000-8000-000000000008')$$,
  'admin disables a route at its current version');
select is((select count(*)::int from ops.cafe_destinations
  where org_id = '00000000-0000-0000-0000-0000000000a1'
    and origin_branch_id = '00000000-0000-0000-0000-00000000bf01'
    and origin_activity = 'kitchen' and destination_branch_id = '00000000-0000-0000-0000-00000000bf03'), 0,
  'a disabled route is removed from the active allowlist');
select ok(not exists (select 1 from ops.allowed_kitchen_destinations(
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','kitchen') d
  where d.destination_branch_id = '00000000-0000-0000-0000-00000000bf03'),
  'the capture destination read stops offering a disabled route');
select is((select count(*)::int from ops.kitchen_logs
  where org_id = '00000000-0000-0000-0000-0000000000a1'
    and branch_id = '00000000-0000-0000-0000-00000000bf01'
    and destination_branch_id = '00000000-0000-0000-0000-00000000bf03'
    and status = 'Submitted'), 1,
  'disabling a route preserves an already submitted transfer');
select throws_ok($$insert into ops.kitchen_logs
  (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-10-10','00000000-0000-0000-0000-00000000bf01',
    'kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',1)$$,
  '42501', 'the destination is outside the production stream''s allowed books',
  'a new transfer cannot submit on a disabled route');
select is((select r.row_version from ops.create_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf03"}'::jsonb,
  '40000000-0000-0000-8000-000000000009') r), 4::bigint,
  're-enabling a route continues its audited version');
select ok(exists (select 1 from ops.allowed_kitchen_destinations(
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','kitchen') d
  where d.destination_branch_id = '00000000-0000-0000-0000-00000000bf03'),
  'the capture destination read offers the route again after re-enable');
select is((select count(*)::int from ops.cafe_transfer_route_audit
  where request_id in ('40000000-0000-0000-8000-000000000001','40000000-0000-0000-8000-000000000005',
    '40000000-0000-0000-8000-000000000008','40000000-0000-0000-8000-000000000009')),
  4, 'create, update, disable and re-enable each have one durable audit event');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}');
select ok((select count(*) > 0 from ops.list_cafe_transfer_routes()),
  'same-org members can read configured routes');
select is((select count(*)::int from ops.cafe_destinations
  where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'a member reads no other organization''s route rows');
select is((select count(*)::int from ops.cafe_transfer_route_audit), 0,
  'route audit history is admin-only');
select ok(not shared.can('cafe.transfer_routes.manage'), 'finance and member roles cannot manage routes');
select throws_ok($$select * from ops.create_cafe_transfer_route(
  '{"origin_branch_id":"00000000-0000-0000-0000-00000000bf01","origin_activity":"kitchen","destination_branch_id":"00000000-0000-0000-0000-00000000bf02"}'::jsonb,
  '40000000-0000-0000-8000-000000000010')$$,
  '42501', 'transfer route management is admin-only', 'non-admin route mutation is denied');
select throws_ok($$insert into ops.cafe_destinations
  (org_id,origin_branch_id,origin_activity,destination_branch_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01',
    'kitchen','00000000-0000-0000-0000-00000000bf03')$$,
  '42501', null, 'authenticated direct DML cannot bypass route RPCs');

reset role;
select * from finish();
rollback;
