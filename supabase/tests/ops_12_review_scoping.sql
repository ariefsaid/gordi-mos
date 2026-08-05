-- ops — per-stream review with ops-lead fallback (#236: FR-040..043, AC-009, AC-010, NFR-002).
--
-- The stream reviewer is a SERVER-SIDE fact: supervisor access role + live primary membership of
-- the row's stream Team, or ops_lead/admin as the cross-stream fallback (OD-WAY-48). This file
-- proves that predicate on every path a decision can travel — the approval RPC, the plain guarded
-- reject UPDATE, and the direct status UPDATE an ops_lead also holds — plus the per-stream
-- ordering gate (FR-043): a stream/day's transfer approvals lock while any of ITS production rows
-- is still Submitted, a decided row (Approved OR Rejected) clears the lock, and no other stream's
-- backlog ever locks this one.
--
-- The guard and the RPC were RE-AUTHORED for this slice, so nothing here leans on ops_08's history:
-- every refusal is proven fresh, and each one is paired with a positive on the same path so a
-- frozen table cannot masquerade as a working gate (prove-the-check-can-fail).
--
-- Personas (shared/ops fixtures + this file's stream teams):
--   Peer     ...0d4  supervisor whose live primary Team IS (Gordi HQ, bar)   — the stream reviewer
--   Report   ...0d5  supervisor with NO team membership at all               — fallback-only world
--   DualHat  ...0d6  supervisor whose (Rumah Rames, kitchen) primary carries a FUTURE END DATE —
--                    on the team today, NOT live under the default_stream() liveness rule
--   DirectMgr ...0d2 ops_lead, GrandMgr ...0d3 admin                         — the fallback pair
--   Author   ...0d1  member — submitted most fixture rows
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- ── Stream teams + memberships (the substrate the reviewer predicate rides — OD-WAY-49) ──────
-- The migration-time seeder skips the test orgs (created long after it ran), so the stream teams
-- are authored here, exactly as shared_11 does.
insert into shared.teams (id, org_id, business_unit_id, name, code, branch_id, activity) values
  ('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','T GHQ Bar','t_ghq_bar','00000000-0000-0000-0000-00000000bf01','bar'),
  ('00000000-0000-0000-0000-00000000cc02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','T RRS Kitchen','t_rrs_kitchen','00000000-0000-0000-0000-00000000bf02','kitchen');

-- Peer ...0d4: live primary on (GHQ, bar) — started, open-ended: THE stream reviewer.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-00000000cc01', true, current_date - 30);
-- DualHat ...0d6: primary on (RRS, kitchen) with a FUTURE end date — still on the team today, but
-- NOT live under the deliberate default_stream() rule the reviewer predicate mirrors.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from, effective_to) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-00000000cc02', true, current_date - 30, current_date + 7);

-- Grant rows mirroring the claims below (claims drive the policies; the rows keep the directory
-- consistent with the source those claims are hook-injected from).
insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','supervisor'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','supervisor'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','supervisor')
on conflict do nothing;

-- ── Extra (GHQ, bar) rows: the reviewer's own queue, 2026-06-20 ──────────────────────────────
-- ac12 (produce, seeded) + ac13/ac14 (produce) + ac15 (transfer to Radiant). Same day as the
-- seeded (RRS, kitchen) queue on purpose: cross-STREAM isolation must be proven on one day.
insert into ops.kitchen_logs
  (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
   wip_item_id, qty_porsi, status, submitted_by) values
  ('00000000-0000-0000-0000-00000000ac13','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','bar','produce',null,'00000000-0000-0000-0000-00000000ab03',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000ac14','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','bar','produce',null,'00000000-0000-0000-0000-00000000ab03',5,'Submitted','00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000ac15','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','bar','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab03',2,'Submitted','00000000-0000-0000-0000-0000000000d1');

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. AC-009 — the stream reviewer decides their OWN stream and nothing else
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';

-- The predicate itself, pinned directly on both sides.
select ok(ops.is_stream_reviewer('00000000-0000-0000-0000-00000000bf01','bar'),
  'AC-009: supervisor + live primary (GHQ, bar) Team IS that stream''s reviewer');
select ok(not ops.is_stream_reviewer('00000000-0000-0000-0000-00000000bf02','kitchen'),
  'AC-009: ...and is NOT another stream''s reviewer — the membership names ONE stream');

-- Cross-stream approval refused, on the RPC path (AC-009's refusal, 42501).
select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01','looks fine')
  $$, '42501', 'only the stream''s supervisor or ops_lead/admin may approve',
  'AC-009: a (GHQ, bar) supervisor cannot approve a (Rumah Rames, kitchen) row');

-- Cross-stream reject: the plain UPDATE path. RLS admits none of another stream's rows to this
-- persona's UPDATE, so the write matches ZERO rows — asserted by the row being untouched, read as
-- the owner, because a silent no-op looks like success to the caller.
select lives_ok($$
  update ops.kitchen_logs set status = 'Rejected', review_note = 'not mine to decide'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, 'AC-009: a cross-stream reject UPDATE executes...');
reset role;
select is((select status from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac01'),
  'Submitted', 'AC-009: ...but matches zero rows — the other stream''s row is untouched');
set local role authenticated;

-- Both halves of the predicate are required: the SAME person with the SAME live membership but no
-- supervisor claim reviews nothing.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select ok(not ops.is_stream_reviewer('00000000-0000-0000-0000-00000000bf01','bar'),
  'fail-closed: the membership alone is NOT authority — without the supervisor role the predicate is false');
select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac12','mine tho')
  $$, '42501', 'only the stream''s supervisor or ops_lead/admin may approve',
  'fail-closed: a member on the stream team still cannot approve — role and membership are BOTH required');

-- Approval must travel through the RPC even for the stream's own reviewer: the policy's WITH CHECK
-- admits Submitted and Rejected for the supervisor arm, never Approved — a direct flip would skip
-- the batch mint and the outbox.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
select throws_ok($$
  update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ac12'
  $$, '42501', null,
  'fail-closed: even the stream''s own reviewer cannot flip to Approved by direct UPDATE — approval is the RPC''s');

-- The positive, own stream, RPC path. '-001' is also the no-trace proof: had any refusal above
-- consumed a sequence number, this would mint -002.
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac12', null),
  'PR-20260620-001',
  'AC-009 (positive): the stream reviewer approves their OWN stream''s row, and nothing before it consumed a mint');
reset role;
select is((select reviewed_by from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac12'),
  '00000000-0000-0000-0000-0000000000d4'::uuid,
  'AC-009: ...with the supervisor stamped as the reviewer');
set local role authenticated;

-- The positive reject, own stream, plain guarded UPDATE path.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
select lives_ok($$
  update ops.kitchen_logs set status = 'Rejected', review_note = 'over-counted'
   where id = '00000000-0000-0000-0000-00000000ac13'
  $$, 'AC-009 (positive): the stream reviewer rejects their own stream''s row through the guarded UPDATE');
reset role;
select is((select status || '|' || reviewed_by::text from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac13'),
  'Rejected|00000000-0000-0000-0000-0000000000d4',
  'AC-009: ...and the reject lands with server-stamped reviewer provenance');
set local role authenticated;

-- ── The two supervisors who review NOTHING ───────────────────────────────────────────────────
-- No team at all: the world before a stream is provisioned — the ops-lead fallback's whole reason.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member","supervisor"]}';
select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac11','sure')
  $$, '42501', 'only the stream''s supervisor or ops_lead/admin may approve',
  'AC-009: a supervisor with NO stream team approves nothing — the role alone names no stream');

-- Future-dated end: on the team today, NOT live — the same deliberate liveness rule as
-- shared.default_stream() (20260806000001), mirrored so the reviewer and the default cannot drift.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}';
select ok(not ops.is_stream_reviewer('00000000-0000-0000-0000-00000000bf02','kitchen'),
  'liveness: a primary membership with a FUTURE end date is not live — same rule as default_stream()');
select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac02','still here this week')
  $$, '42501', 'only the stream''s supervisor or ops_lead/admin may approve',
  'liveness: ...so a hand-over-week supervisor reviews via the ops lead, never via a stale default');

-- ── The fallback: ops_lead and admin decide ANY stream (FR-041) ──────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac02','ok')
  $$, 'FR-041: ops_lead approves a (RRS, kitchen) row with no membership anywhere — cross-stream fallback');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}';
select lives_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac03','ok')
  $$, 'FR-041: and so does admin — no stream is ever stranded on an unprovisioned reviewer');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. AC-010 — the ordering gate is PER STREAM AND DAY
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- (RRS, kitchen) 2026-06-20 still has Submitted production (ac01, ac06). Its transfer ac04 is
-- locked — on BOTH approval paths — while another stream's transfer and another day's transfer
-- both sail through.
--
-- The outbox is snapshotted HERE, after section A's legitimate approvals, so "the refusal wrote
-- nothing" is measured against the state the refusal actually saw.
reset role;
create temp table _outbox_prelock as select count(*)::int as n from integrations.esb_push;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac04','ship it')
  $$, 'P0004', 'transfer approval is locked while the stream''s production is still Submitted for the day',
  'AC-010: a transfer approval is refused while the SAME stream/day has Submitted production');
select throws_ok($$
  update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ac04'
  $$, 'P0004', 'transfer approval is locked while the stream''s production is still Submitted for the day',
  'AC-010: ...and the direct-UPDATE path an ops_lead also holds is refused by the guard, not only the RPC');

reset role;
select is((select batch_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac04'),
  null, 'AC-010: the refused transfer minted no batch id');
select is((select count(*)::int from integrations.esb_push), (select n from _outbox_prelock),
  'AC-010: ...and created no outbox row — the refusal leaves no trace, read as the owner');
set local role authenticated;

-- Cross-stream isolation: (GHQ, bar)'s transfer approves fine once ITS OWN production is decided,
-- even though (RRS, kitchen)'s production is still Submitted on the very same day. Done by the
-- stream's own reviewer, so the two features are proven composed.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
select lives_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac14', null)
  $$, 'setup: the (GHQ, bar) reviewer decides the last of their own stream''s production');
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac15', null),
  'TR-20260620-001',
  'AC-010: another stream''s Submitted production does NOT lock this stream''s transfer — same day, approved by its own reviewer');

-- Day isolation: the same locked stream's OTHER day has no pending production, and its transfer
-- approves — the gate keys on (stream, day), not on the stream's whole backlog.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad05', null)
  $$, 'AC-010: the SAME stream''s transfer on a DIFFERENT day is not locked — the gate is per stream AND day');

-- Release: one pending row decided by APPROVE, the other by REJECT — both count as decided
-- (FR-043: "decided", not "approved"), and the lock lifts.
select lives_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac01', null)
  $$, 'AC-010 release setup: one pending production row is Approved...');
select lives_ok($$
  update ops.kitchen_logs set status = 'Rejected', review_note = 'double-entered'
   where id = '00000000-0000-0000-0000-00000000ac06'
  $$, 'AC-010 release setup: ...and the other is Rejected — a decided row, not an approved one');
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac04','clear now'),
  'TR-20260620-002',
  'AC-010: with the stream/day''s production decided (both ways), the transfer approval succeeds');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. The re-authored policy stays closed everywhere it was closed before
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The supervisor arm reaches only SUBMITTED rows: a decided row in their own stream is out of
-- their hands again (ops_lead/admin keep review-edit; the reviewer does not).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';
select lives_ok($$
  update ops.kitchen_logs set qty_porsi = 99 where id = '00000000-0000-0000-0000-00000000ac12'
  $$, 'fail-closed: an edit of an already-Approved own-stream row executes...');
reset role;
select is((select qty_porsi::int from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac12'),
  6, 'fail-closed: ...but matches zero rows — the supervisor arm ends at the decision');
set local role authenticated;

-- A member's world is unchanged (OD-WAY-49: the stream is never a wall for members): the submitter
-- still edits their own pending row, and still cannot decide it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select lives_ok($$
  update ops.kitchen_logs set qty_porsi = 8, notes = 'recounted'
   where id = '00000000-0000-0000-0000-00000000ad01'
  $$, 'OD-WAY-49: the submitter still corrects their own pending line — no member write grew a stream term');
select throws_ok($$
  update ops.kitchen_logs set status = 'Approved' where id = '00000000-0000-0000-0000-00000000ad01'
  $$, '42501', 'only the stream''s supervisor or ops_lead/admin may approve or reject a kitchen log',
  'fail-closed: a member still cannot decide their own row — the re-authored transition arm refuses fresh');

-- Cross-tenant stays shut on the new predicate: org B's supervisor claims never reach org A's
-- teams or rows. The RPC's org guard fires before the authority check, exactly as carried.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","supervisor"]}';
select ok(not ops.is_stream_reviewer('00000000-0000-0000-0000-00000000bf01','bar'),
  'fail-closed: another tenant''s supervisor is nobody''s stream reviewer here — the predicate is org-scoped explicitly');
select throws_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ad02','mine now')
  $$, '42501', 'cannot approve a log outside your org',
  'fail-closed: the cross-tenant refusal still precedes every authority question');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. The decide freeze — a decision changes the status and the review fields, nothing else
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- #236 review finding: the Submitted→Submitted freeze alone left a decide free to re-home the
-- row's facts in the same statement — the transition was authorised against the OLD stream while
-- WITH CHECK validated the NEW one. Now ANY identity/qty/note change riding a status transition
-- is refused, on the direct-UPDATE path here and therefore on the RPC path too (the RPC's own
-- UPDATE fires this same guard, and its signature — a log id and a note — can carry no field).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

select throws_ok($$
  update ops.kitchen_logs
     set status = 'Rejected', review_note = 'and moved',
         branch_id = '00000000-0000-0000-0000-00000000bf01'
   where id = '00000000-0000-0000-0000-00000000ad04'
  $$, '42501', 'a decision changes only the status and the review fields; the log''s facts are frozen',
  'decide freeze: a reject cannot re-home the row into another branch''s books in the same statement');

select throws_ok($$
  update ops.kitchen_logs
     set status = 'Rejected', review_note = 'and shrunk', qty_porsi = 1
   where id = '00000000-0000-0000-0000-00000000ad04'
  $$, '42501', 'a decision changes only the status and the review fields; the log''s facts are frozen',
  'decide freeze: a reviewer cannot "correct" the quantity as a side effect of deciding — a correction is a new log');

select throws_ok($$
  update ops.kitchen_logs
     set status = 'Approved', wip_item_id = '00000000-0000-0000-0000-00000000ab02'
   where id = '00000000-0000-0000-0000-00000000ac05'
  $$, '42501', 'a decision changes only the status and the review fields; the log''s facts are frozen',
  'decide freeze: the →Approved side is frozen too — the write path the RPC rides refuses identity changes');

select lives_ok($$
  update ops.kitchen_logs set status = 'Rejected', review_note = 'legitimate decide'
   where id = '00000000-0000-0000-0000-00000000ad04'
  $$, 'decide freeze (positive): status + review note alone still decides — the freeze refuses riders, not reviews');
reset role;
select is((select status || '|' || reviewed_by::text from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ad04'),
  'Rejected|00000000-0000-0000-0000-0000000000d2',
  'decide freeze: ...and the legitimate decide landed with its provenance stamped');

select * from finish();
rollback;
