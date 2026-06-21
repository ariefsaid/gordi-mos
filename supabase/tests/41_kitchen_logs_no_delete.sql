begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select throws_ok($$ delete from ops.wip_items where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on wip_items');
select throws_ok($$ delete from ops.kitchen_plans where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on kitchen_plans');
select throws_ok($$ delete from ops.kitchen_logs where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on kitchen_logs');
select throws_ok($$ delete from ops.kitchen_stock where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on kitchen_stock');
select throws_ok($$ delete from integrations.esb_push where org_id='00000000-0000-0000-0000-0000000000a1' $$, '42501', null, 'AC-005: no DELETE on esb_push');

reset role;
select * from finish();
rollback;
