-- SEC-1: kitchen-logs write hardening. Proves the BU-membership INSERT gate (queue-pollution close)
-- and the own-row-or-lead UPDATE gate (pre-approval-tampering close) at the RLS layer, plus that the
-- approval transition is unchanged. Fixtures: _test_seed_kitchen() (…000011 redefined by 20260723000001)
-- seeds a Kitchen team under BU …bb01 with Author (…0d1) and Peer (…0d4) as effective-dated members.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;

-- 1. Member of the kitchen BU (Author …0d1, member) CAN insert a Submitted log. qty 77 is unused by
--    any seeded (item, date) so the readback resolves one row.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',77)
$$, 'SEC-1: BU member inserts own Submitted log');

-- 2. Non-member finance persona (DirectMgr …0d2, finance, NO kitchen-team membership) CANNOT insert:
--    finance is neither ops_lead/admin nor a BU member -> WITH CHECK fails (42501).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["finance"]}';
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, action_type, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',66)
$$, '42501', null, 'SEC-1: non-member (finance) insert denied (queue-pollution close)');

-- Member B (Peer …0d4, also a kitchen-team member) submits their own row (notes = a known baseline).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
insert into ops.kitchen_logs (id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, notes)
values ('00000000-0000-0000-0000-00000000ac07','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab02',9,'original');

-- 3. Member A (Author …0d1) CANNOT update member B's Submitted row: the UPDATE matches no USING row
--    (not lead/admin, submitted_by <> self) -> silent 0-row no-op. Proof: B's notes stay 'original'.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
update ops.kitchen_logs set notes='tampered' where id='00000000-0000-0000-0000-00000000ac07';
select is(
  (select notes from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac07'),
  'original',
  'SEC-1: member A cannot edit member B''s Submitted row (pre-approval-tampering close)');

-- 4. ops_lead (GrandMgr …0d3, ops_lead) CAN review-edit member B's row (own-row-or-lead: lead branch).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select lives_ok($$
  update ops.kitchen_logs set notes='reviewed by lead' where id='00000000-0000-0000-0000-00000000ac07'
$$, 'SEC-1: ops_lead retains review-edit of any member row');
select is(
  (select notes from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac07'),
  'reviewed by lead',
  'SEC-1: ops_lead edit took effect');

-- 5. Approval path unchanged: ops_lead flips a Submitted row to Approved (guard allows; UPDATE policy's
--    lead branch satisfies USING/WITH CHECK). Proves the hardening did not regress the review gate.
select lives_ok($$
  update ops.kitchen_logs
     set status='Approved', reviewed_by='00000000-0000-0000-0000-0000000000d3', reviewed_at=now()
   where id='00000000-0000-0000-0000-00000000ac01'
$$, 'SEC-1: ops_lead approval transition unchanged');

reset role;
select * from finish();
rollback;
