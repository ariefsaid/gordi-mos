begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select lives_ok($$
  insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','Production',10)
$$, 'FR-031: ops_lead inserts a plan row');
select throws_ok($$
  insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','Production',12)
$$, '23505', null, 'FR-031: duplicate key forces the UPDATE path (no second row)');
select lives_ok($$
  update ops.kitchen_plans set qty_porsi = 12
   where org_id='00000000-0000-0000-0000-0000000000a1' and log_date='2026-06-20'
     and wip_item_id='00000000-0000-0000-0000-00000000ab01' and action_type='Production'
$$, 'FR-031: ops_lead patches the plan qty (upsert UPDATE)');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  insert into ops.kitchen_plans (org_id, log_date, wip_item_id, action_type, qty_porsi)
  values ('00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','Production',5)
$$, '42501', null, 'AC-006-shape: member cannot write plans');

reset role;
select * from finish();
rollback;
