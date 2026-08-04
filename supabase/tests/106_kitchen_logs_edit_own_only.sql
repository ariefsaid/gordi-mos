-- Pre-approval tampering: a member may edit their OWN pending kitchen log, and may not edit
-- anyone else's. ops_lead keeps review-edit. Covers 20260804000001.
--
-- The seed submits every kitchen log as person …00d1, so …00d2 is a genuine second member with no
-- claim on those rows — the exact shape of the hole: two ordinary staff, one queue.
--
-- RLS refuses an UPDATE by matching no row, not by raising — so the refusal is asserted as
-- "the statement ran and the value did not move", which is what a caller actually observes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;

----------------------------------------------------------------------
-- A member editing ANOTHER member's pending row: refused.
----------------------------------------------------------------------
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';

select lives_ok($$
  update ops.kitchen_logs set qty_porsi = 999
   where id = '00000000-0000-0000-0000-00000000ac01'
$$, 'SEC: the tampering attempt is refused silently by RLS, not by an error');

select is(
  (select qty_porsi from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  12::numeric,
  'SEC: a member cannot edit another member''s Submitted log — qty unmoved'
);

----------------------------------------------------------------------
-- The submitter editing their OWN pending row: allowed.
-- Without this the suite would pass on a fix that simply denied all member
-- updates, which would break ordinary correction of one's own entry.
----------------------------------------------------------------------
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok($$
  update ops.kitchen_logs set qty_porsi = 13
   where id = '00000000-0000-0000-0000-00000000ac01'
$$, 'SEC: the submitter''s own edit is allowed');

select is(
  (select qty_porsi from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  13::numeric,
  'SEC: the submitter''s own edit actually landed'
);

----------------------------------------------------------------------
-- A member cannot re-attribute a row to get around the policy.
-- Refused by ops._guard_kitchen_log (submitted_by immutable), not by the
-- policy — asserted so the two stay honest about which is load-bearing.
----------------------------------------------------------------------
select throws_ok($$
  update ops.kitchen_logs
     set submitted_by = '00000000-0000-0000-0000-0000000000d2'
   where id = '00000000-0000-0000-0000-00000000ac01'
$$, '42501', null, 'SEC: submitted_by stays immutable, so a row cannot be re-attributed');

----------------------------------------------------------------------
-- ops_lead retains review-edit over a row they did not submit.
-- Without this the fix would break approvals.
----------------------------------------------------------------------
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';

select lives_ok($$
  update ops.kitchen_logs set qty_porsi = 14
   where id = '00000000-0000-0000-0000-00000000ac02'
$$, 'SEC: ops_lead keeps review-edit on a log they did not submit');

select * from finish();
rollback;
