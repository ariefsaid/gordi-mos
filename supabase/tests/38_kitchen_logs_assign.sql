begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
-- AC-001: member inserts a Submitted log; org_id + submitted_by server-stamped. qty_porsi 7 is a
-- value not used by any seeded log on this (item, date) so the readback subquery resolves one row.
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',7)
$$, 'AC-001: member inserts own Submitted log');
select is((select status from ops.kitchen_logs where wip_item_id='00000000-0000-0000-0000-00000000ab01' and log_date='2026-06-20' and submitted_by='00000000-0000-0000-0000-0000000000d1' and qty_porsi=7),
          'Submitted', 'AC-001: default status Submitted');
select is((select org_id from ops.kitchen_logs where wip_item_id='00000000-0000-0000-0000-00000000ab01' and log_date='2026-06-20' and submitted_by='00000000-0000-0000-0000-0000000000d1' and qty_porsi=7),
          '00000000-0000-0000-0000-0000000000a1'::uuid, 'AC-001: org_id server-stamped');

reset role;
select * from finish();
rollback;
