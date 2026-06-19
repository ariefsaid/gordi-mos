begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local app.esb_target_env = 'goo';  -- GUC, not a JWT claim (M1/KQ-6)
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01'::uuid, null);
select is((select status from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac01'::uuid),
          'Approved', 'AC-034: log Approved');
select is((select usable_qty from ops.kitchen_stock where wip_item_id='00000000-0000-0000-0000-00000000ab01' and log_date='2026-06-20'),
          12::numeric, 'AC-034: stock recomputed to the approved net');
select is((select count(*)::int from integrations.esb_push where source_ref like 'PR-20260620-%' and status='pending' and target_env='goo'),
          1, 'AC-060: outbox row enqueued (pending, target_env from GUC)');
select is((select count(*)::int from ops.log_entries where origin='kitchen'),
          1, 'AC-060/I4: one Daily Log mirror row (the insert passed log_entries_guard)');
-- AC-061: the mirror is a faithful Daily Log entry — Kitchen-and-Bar BU, NO owner/RACI/status fields.
select is((select business_unit_id from ops.log_entries where origin='kitchen'),
          (select id from shared.business_units where org_id='00000000-0000-0000-0000-0000000000a1' and name='Kitchen and Bar'),
          'AC-061: mirror carries the Kitchen-and-Bar BU');
select ok(
  (select (detail::jsonb) ?| array['owner','responsible','accountable','status','reviewed_by'] = false
     from ops.log_entries where origin='kitchen'),
  'AC-061: mirror detail carries NO owner/RACI/status fields (faithful Daily Log entry)');
select throws_ok($$ select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01'::uuid, null) $$,
  'P0003', null, 'FR-092: re-approve same log raises (idempotency is per-batch, not per-log)');

reset role;
select * from finish();
rollback;
