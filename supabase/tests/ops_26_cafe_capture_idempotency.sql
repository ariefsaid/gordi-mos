-- Café capture is append-only in kitchen_logs, but retries share one org-scoped client identity.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(case when current_setting('is_superuser') = 'on' then 17 else 14 end);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

-- Give org B a real allowed kitchen destination so the same transfer key can be independently used.
insert into shared.branches (id, org_id, code, name)
values ('00000000-0000-0000-0000-00000000bf10','00000000-0000-0000-0000-0000000000b1','b_capture_destination','B Capture Destination');
insert into shared.teams (org_id, business_unit_id, name, code, branch_id, activity, produces)
values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb09',
  'B Capture Destination Kitchen','b_capture_destination_kitchen','00000000-0000-0000-0000-00000000bf10','kitchen',false);
insert into ops.cafe_destinations (org_id, origin_branch_id, origin_activity, destination_branch_id)
values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bf09','kitchen',
  '00000000-0000-0000-0000-00000000bf10');

create function pg_temp.capture_once(
  p_request_id uuid,
  p_action text,
  p_org_b boolean default false,
  p_qty numeric default 2.5
)
returns table(id uuid, client_request_id uuid, status text, qty_porsi numeric)
language sql
security invoker
set search_path = ''
as $$
  select captured.id, captured.client_request_id, captured.status, captured.qty_porsi
  from ops.insert_cafe_capture_logs(jsonb_build_array(jsonb_build_object(
    'client_request_id', p_request_id,
    'business_unit_id', case when p_org_b then '00000000-0000-0000-0000-00000000bb09'::uuid
                             else '00000000-0000-0000-0000-00000000bb01'::uuid end,
    'log_date', '2026-10-06',
    'branch_id', case when p_org_b then '00000000-0000-0000-0000-00000000bf09'::uuid
                      else '00000000-0000-0000-0000-00000000bf02'::uuid end,
    'activity', 'kitchen',
    'action', p_action,
    'destination_branch_id', case when p_action <> 'transfer' then null
                                  when p_org_b then '00000000-0000-0000-0000-00000000bf10'::uuid
                                  else '00000000-0000-0000-0000-00000000bf03'::uuid end,
    'wip_item_id', case when p_org_b then '00000000-0000-0000-0000-00000000ab09'::uuid
                        else '00000000-0000-0000-0000-00000000ab01'::uuid end,
    'item_unit_id', case when p_action <> 'waste' then null
                         when p_org_b then '00000000-0000-0000-0000-00000000de09'::uuid
                         else '00000000-0000-0000-0000-00000000de01'::uuid end,
    'qty_porsi', p_qty,
    'notes', null
  ))) as captured;
$$;

select has_column('ops', 'kitchen_logs', 'client_request_id', 'capture request identity is stored on the existing log table');
select is((select is_nullable = 'YES' from information_schema.columns
  where table_schema = 'ops' and table_name = 'kitchen_logs' and column_name = 'client_request_id'), true,
  'legacy and imported rows may keep a NULL request identity');
select has_index('ops', 'kitchen_logs', 'kitchen_logs_org_client_request_id_key', 'request identity is unique within an organization');

-- Hold the same org/request advisory key on a second backend to prove a competing first attempt
-- waits while a different org's identical request id remains independent. This optional backend
-- test runs when the local test connection is superuser-capable; the deterministic capture/replay
-- contract below always runs under the normal authenticated role.
select current_setting('is_superuser') = 'on' as can_test_capture_race \gset
\if :can_test_capture_race
select extensions.dblink_connect('cafe_capture_race',
  'host=127.0.0.1 port=5432 dbname=postgres user=supabase_admin password=postgres');
select extensions.dblink_exec('cafe_capture_race', 'begin');
select * from extensions.dblink('cafe_capture_race',
  $$select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    '00000000-0000-0000-0000-0000000000a1:40000000-0000-0000-0000-000000000001', 0))::text$$
) as held_lock(held text);
select is(pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
  '00000000-0000-0000-0000-0000000000a1:40000000-0000-0000-0000-000000000001', 0)), false,
  'a concurrent first attempt on the same org/request key is serialized');
select is(pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
  '00000000-0000-0000-0000-0000000000b1:40000000-0000-0000-0000-000000000001', 0)), true,
  'the same request id under another org does not share the lock');
select extensions.dblink_exec('cafe_capture_race', 'commit');
select is(pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
  '00000000-0000-0000-0000-0000000000a1:40000000-0000-0000-0000-000000000001', 0)), true,
  'the waiting request key is available when the competing transaction commits');
select extensions.dblink_disconnect('cafe_capture_race');
\endif

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');

with first_write as materialized (
  select * from pg_temp.capture_once('40000000-0000-0000-0000-000000000001', 'produce')
), retry_write as materialized (
  select retried.* from first_write, lateral pg_temp.capture_once('40000000-0000-0000-0000-000000000001', 'produce', false, 99) retried
)
select is((select row(retry_write.id, retry_write.qty_porsi)::text from retry_write),
  (select row(first_write.id, first_write.qty_porsi)::text from first_write),
  'a production retry returns the original row and captured quantity');
select is((select count(*)::int from ops.kitchen_logs
  where org_id = (select shared.current_org_id())
    and client_request_id = '40000000-0000-0000-0000-000000000001'), 1,
  'production retry leaves one row for the request key');
select ok(exists (
  select 1 from pg_catalog.pg_locks held
  where held.pid = pg_catalog.pg_backend_pid()
    and held.locktype = 'advisory'
    and held.objsubid = 1
    and ((held.classid::bigint << 32) | held.objid::bigint) = pg_catalog.hashtextextended(
      '00000000-0000-0000-0000-0000000000a1:40000000-0000-0000-0000-000000000001', 0)
), 'the capture RPC holds the transaction lock for its request key');

with first_write as materialized (
  select * from pg_temp.capture_once('40000000-0000-0000-0000-000000000002', 'transfer')
), retry_write as materialized (
  select retried.* from first_write, lateral pg_temp.capture_once('40000000-0000-0000-0000-000000000002', 'transfer', false, 99) retried
)
select is((select row(retry_write.id, retry_write.qty_porsi)::text from retry_write),
  (select row(first_write.id, first_write.qty_porsi)::text from first_write),
  'a transfer retry returns the original row and captured quantity');
select is((select count(*)::int from ops.kitchen_logs
  where org_id = (select shared.current_org_id())
    and client_request_id = '40000000-0000-0000-0000-000000000002'), 1,
  'transfer retry leaves one row for the request key');

with first_write as materialized (
  select * from pg_temp.capture_once('40000000-0000-0000-0000-000000000003', 'waste')
), retry_write as materialized (
  select retried.* from first_write, lateral pg_temp.capture_once('40000000-0000-0000-0000-000000000003', 'waste', false, 99) retried
)
select is((select row(retry_write.id, retry_write.qty_porsi)::text from retry_write),
  (select row(first_write.id, first_write.qty_porsi)::text from first_write),
  'a waste retry returns the original row and captured quantity');
select is((select count(*)::int from ops.kitchen_logs
  where org_id = (select shared.current_org_id())
    and client_request_id = '40000000-0000-0000-0000-000000000003'), 1,
  'waste retry leaves one row for the request key');
select is((select status from pg_temp.capture_once('40000000-0000-0000-0000-000000000003', 'waste')), 'Draft',
  'the original waste capture remains an evidence-gated Draft on retry');

select throws_ok($$select * from ops.insert_cafe_capture_logs(
  '[{"business_unit_id":"00000000-0000-0000-0000-00000000bb01"}]'::jsonb)$$,
  '22023', 'client_request_id is required for each café capture row',
  'the app capture RPC refuses any new row without an identity');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select * from pg_temp.capture_once('40000000-0000-0000-0000-000000000001', 'produce', true);
select * from pg_temp.capture_once('40000000-0000-0000-0000-000000000002', 'transfer', true);
select * from pg_temp.capture_once('40000000-0000-0000-0000-000000000003', 'waste', true);
reset role;

select is((select count(*)::int from ops.kitchen_logs
  where client_request_id in (
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000003'
  ) and org_id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1')),
  6, 'another organization may reuse all three request ids without colliding with original rows');
select is((select count(distinct org_id)::int from ops.kitchen_logs
  where client_request_id in (
    '40000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000003'
  )), 2, 'the same request ids independently occupy both organizations');

select * from finish();
rollback;
