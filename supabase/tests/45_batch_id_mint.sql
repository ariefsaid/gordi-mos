begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01'::uuid, null), 'PR-20260620-001', 'AC-010: first PR → 001');
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac02'::uuid, null), 'PR-20260620-002', 'AC-010: second PR → 002');
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac03'::uuid, null), 'PR-20260620-003', 'AC-010: third PR → 003');
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac04'::uuid, null), 'TR-20260620-001', 'AC-013: first TR → TR-001');
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac05'::uuid, null), 'TB-20260620-001', 'AC-013: first TB → TB-001');
-- AC-012: reject does NOT mint.
update ops.kitchen_logs set status='Rejected', reviewed_by='00000000-0000-0000-0000-0000000000d3', reviewed_at=now()
 where id='00000000-0000-0000-0000-00000000ac06'::uuid;
select is((select batch_id from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac06'::uuid), null,
  'AC-012: rejected log has no batch_id');

reset role;
select * from finish();
rollback;
