begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
-- I2: a foreign-org business_unit_id is rejected by the same-org guard (23514).
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb09','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5)
$$, '23514', null, 'I2/AC-002: foreign-org business_unit_id rejected (same-org FK seam)');
-- I2: a foreign-org wip_item_id is rejected by the same-org guard (23514).
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab09',5)
$$, '23514', null, 'I2/AC-002: foreign-org wip_item_id rejected (same-org FK seam)');

reset role;
select * from finish();
rollback;
