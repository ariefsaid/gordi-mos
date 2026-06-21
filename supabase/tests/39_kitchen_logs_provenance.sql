begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
-- AC-002: forging submitted_by to another person is rejected (the WITH CHECK forces session person).
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi, submitted_by)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5,'00000000-0000-0000-0000-0000000000d2')
$$, '42501', null, 'AC-002: forged submitted_by rejected');
-- AC-002: a forged foreign org_id is rejected — the org is unspoofable from a member session. For an
-- org-A session, a forged org_id=B can never reach the RLS WITH CHECK: the same-org FK guard fires
-- first (the org-A BU/WIP refs are org A, distinct from the forged B → 23514; and an org-B ref is
-- invisible under INVOKER RLS → NULL → still distinct from B). Either way the cross-org write is
-- rejected — here by the same-org FK seam (the guard is the first authority a forged-org insert hits).
select throws_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5)
$$, '23514', null, 'AC-002: forged foreign org_id rejected (same-org FK seam — org unspoofable)');

reset role;
select * from finish();
rollback;
