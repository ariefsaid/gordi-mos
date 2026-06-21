begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- FR-044: a reject (Submitted->Rejected) is a plain guarded UPDATE — the client may send only
-- status + review_note (it must NOT forge reviewed_by/reviewed_at). The guard stamps reviewer
-- provenance server-side, symmetric with the approve RPC. Without the stamp a rejected log would
-- carry a review_note but no reviewer attribution.

select mos._test_seed_role_tree();
select mos._test_seed_access_roles();
select mos._test_seed_kitchen();

set local role authenticated;

-- A member may NOT reject (the Submitted-> role gate still holds).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  update ops.kitchen_logs set status='Rejected', review_note='no good'
   where id='00000000-0000-0000-0000-00000000ac06'
$$, '42501', null, 'FR-044: member reject denied (guard role gate intact)');

-- An ops_lead rejects, sending ONLY status + review_note (no reviewed_by / reviewed_at).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["ops_lead"]}';
select lives_ok($$
  update ops.kitchen_logs set status='Rejected', review_note='portion mismatch'
   where id='00000000-0000-0000-0000-00000000ac06'
$$, 'FR-044: ops_lead reject allowed (status + review_note only)');

-- The guard stamped reviewed_by = the rejecting lead's person id (server-side, not client-sent).
select is(
  (select reviewed_by from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac06'),
  '00000000-0000-0000-0000-0000000000d3'::uuid,
  'FR-044: reject stamps reviewed_by = session person id (server-side)');

-- reviewed_at is stamped (not null).
select isnt(
  (select reviewed_at from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac06'),
  null,
  'FR-044: reject stamps reviewed_at');

-- review_note is preserved (what the client sent).
select is(
  (select review_note from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac06'),
  'portion mismatch',
  'FR-044: reject preserves the client review_note');

reset role;
select * from finish();
rollback;
