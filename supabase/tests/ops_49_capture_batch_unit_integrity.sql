begin;
create extension if not exists pgtap with schema extensions;
select plan(3);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- The seeded captured unit is referenced by kitchen logs.
select throws_ok($$
  update ops.item_units set wip_item_id = '00000000-0000-0000-0000-00000000ab02',
    is_default = false, unit_name = 'reassigned'
  where id = '00000000-0000-0000-0000-00000000de01'
$$, '23503', null, 'a captured unit cannot be reassigned to another item');

insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
select '00000000-0000-0000-0000-0000000000a1',
       ops.kitchen_batch_prefix('produce', '00000000-0000-0000-0000-00000000bf02', null),
       '2026-06-20', 998;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select matches(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01', 'reviewed',
  (select updated_at from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01')),
  '-999$', 'sequence 999 approves with its full number');
select matches(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac02', 'reviewed',
  (select updated_at from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac02')),
  '-1000$', 'sequence 1000 approves with its full distinct number');
select * from finish();
rollback;
