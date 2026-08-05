-- ops — per-stream completeness confirmation (#238: FR-031, OD-WAY-47).
--
-- The stream's supervisor/lead records that their stream's item list is COMPLETE — a fact with a
-- stream, a name and a date on it. Distinct from and after the per-item-unit COORDINATE
-- confirmation (FR-030, ops_11): two roles, neither sufficient alone.
--
-- What this file proves, and the shape of each proof:
--   * the confirmation is RECORDED per stream by an authorised role — and the who/when are the
--     SERVER's, not the client's (a write that lies about both is the positive subject, so the
--     stamp cannot pass by the client happening to send the truth);
--   * every unauthorised person is REFUSED — the wrong stream's supervisor, a member of the right
--     stream, a supervisor with no team, and a supervisor whose membership is not live. Each is
--     paired with the positive it is the negative of, so a table nobody can write to cannot pass
--     this file (prove-the-check-can-fail);
--   * the new table is FAIL-CLOSED: a claimless session confirms nothing and reads nothing, and
--     another org reads nothing;
--   * FR-031's central claim — IT GATES NOTHING — is asserted over the catalog, not by argument.
--
-- ops.stream_completeness' RLS-enabled/FORCED posture, its org seam and the absence of a DELETE
-- grant are owned by ops_01_rls_posture's catch-alls over the whole schema; they are deliberately
-- not restated here.
--
-- Personas (shared/ops fixtures + this file's stream teams — the ops_12 cast, same ids):
--   Peer      ...0d4  supervisor, live primary Team IS (Gordi HQ, bar)  — that stream's lead
--   Report    ...0d5  supervisor with NO team membership at all         — fallback-only world
--   DualHat   ...0d6  supervisor whose (Rumah Rames, kitchen) primary carries a FUTURE END DATE
--   DirectMgr ...0d2  ops_lead   — the cross-stream fallback (FR-041)
--   Author    ...0d1  member     — on the stream, with no standing to confirm it
--   ForeignMgr ...0b4 org B      — the cross-tenant negative
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- ── Stream teams (the substrate both the write predicate and the live-stream check ride) ─────
-- The migration-time seeder skips the test orgs (created long after it ran), so the stream teams
-- are authored here, exactly as shared_11/ops_12 do. (Radiant, bar) is DELIBERATELY left without
-- a team: it is this file's stand-in for a (branch, activity) pair that is not a production
-- stream — the roastery's permanent case (OD-WAY-42) with the fixture's own branches.
insert into shared.teams (id, org_id, business_unit_id, name, code, branch_id, activity) values
  ('00000000-0000-0000-0000-00000000cc01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','T GHQ Bar','t_ghq_bar','00000000-0000-0000-0000-00000000bf01','bar'),
  ('00000000-0000-0000-0000-00000000cc02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','T RRS Kitchen','t_rrs_kitchen','00000000-0000-0000-0000-00000000bf02','kitchen');

-- Peer ...0d4: live primary on (GHQ, bar) — started, open-ended: THE stream's lead.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-00000000cc01', true, current_date - 30);
-- DualHat ...0d6: primary on (RRS, kitchen) with a FUTURE end date — on the team today, NOT live.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from, effective_to) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','00000000-0000-0000-0000-00000000cc02', true, current_date - 30, current_date + 7);

insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d4','supervisor'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5','supervisor'),
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d6','supervisor')
on conflict do nothing;

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. FR-031 — the stream's lead confirms their own stream, and the event is the SERVER's
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}';

-- The positive write LIES about both halves of the event: it claims Author (...0d1) confirmed the
-- list, six years ago. Both must come back as the session's own. Written this way on purpose — a
-- stamp asserted against a write that sent the truth proves nothing about the stamp.
select lives_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity, confirmed_by, confirmed_at)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','bar',
          '00000000-0000-0000-0000-0000000000d1','2020-01-01T00:00:00Z')
  $$, 'FR-031 (positive): the (GHQ, bar) supervisor confirms THEIR OWN stream''s item list is complete');

reset role;
select is((select confirmed_by from ops.stream_completeness
            where branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'bar'),
  '00000000-0000-0000-0000-0000000000d4'::uuid,
  'FR-031: confirmed_by is the SESSION''s person — the claimed confirmer is overridden, never stored');
select ok((select confirmed_at from ops.stream_completeness
            where branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'bar')
          > now() - interval '1 minute',
  'FR-031: ...and confirmed_at is stamped now(), not the back-date the write asked for');
set local role authenticated;

-- ── The refusals, each paired with the positive above ────────────────────────────────────────
-- Another stream's list is not this supervisor's to confirm. INSERT with no permitting policy
-- raises 42501 (unlike an UPDATE, which would silently match zero rows — see section C).
select throws_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf02','kitchen')
  $$, '42501', null,
  'FR-031: a (GHQ, bar) supervisor cannot confirm (Rumah Rames, kitchen) — the confirmation is per stream');

-- Both halves of the predicate are required. The SAME person with the SAME live membership, minus
-- the supervisor claim, confirms nothing: being on the stream is not standing to speak for it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','bar')
  $$, '42501', null,
  'fail-closed: a member of the stream cannot confirm its list — role and membership are BOTH required');

-- A supervisor with no team at all: the world before a stream is provisioned. Nothing to lead,
-- nothing to confirm — the ops-lead fallback below is the honest path.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member","supervisor"]}';
select throws_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','bar')
  $$, '42501', null,
  'fail-closed: a supervisor with no stream Team confirms nothing');

-- A supervisor whose membership is NOT LIVE (future end date). The write predicate is
-- ops.can_review_stream, so the deliberate liveness rule (…0811000001) governs here too — one
-- predicate, one answer, in both slices.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}';
select throws_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf02','kitchen')
  $$, '42501', null,
  'fail-closed: a supervisor whose primary membership is not LIVE confirms nothing (the FR-040 liveness rule, reused)');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. FR-041's fallback — ops_lead confirms any stream, so an unprovisioned one never stalls
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf02','kitchen')
  $$, 'FR-041 (positive): the ops lead confirms a stream whose own supervisor is not live — the fallback');

reset role;
select is((select confirmed_by from ops.stream_completeness
            where branch_id = '00000000-0000-0000-0000-00000000bf02' and activity = 'kitchen'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'FR-041: ...stamped as the ops lead, so a fallback confirmation is never mistaken for the stream''s own');
set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. Re-confirmation, and what a re-confirmation may NOT carry
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The record is a CURRENT state ("complete as of when"), so confirming again overwrites who/when.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  update ops.stream_completeness
     set confirmed_by = '00000000-0000-0000-0000-0000000000d1', confirmed_at = '2020-01-01T00:00:00Z'
   where branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'bar'
  $$, 'FR-031: a stream''s list can be re-confirmed later — the record is a current state, not an archive');

reset role;
select is((select confirmed_by from ops.stream_completeness
            where branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'bar'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'FR-031: ...and the re-confirmation re-stamps who/when from the session, lie and all');
set local role authenticated;

-- A confirmation belongs to the stream it was made about. Re-pointing one would move a lead's
-- assertion onto a stream they never looked at — and the write was authorised against the OLD
-- stream, so USING and WITH CHECK would have judged different rows.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select throws_ok($$
  update ops.stream_completeness set branch_id = '00000000-0000-0000-0000-00000000bf02'
   where branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'bar'
  $$, '42501', null,
  'fail-closed: a confirmation''s stream is immutable — even for an ops_lead who may write both streams');

-- The UPDATE path's refusal has the OTHER shape: RLS excludes the row from USING, so the write
-- affects zero rows and reports success. Read the state back as the owner — a silent no-op looks
-- exactly like a successful write to the caller.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select lives_ok($$
  update ops.stream_completeness set confirmed_by = '00000000-0000-0000-0000-0000000000d1'
   where branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'bar'
  $$, 'a member''s re-confirmation UPDATE executes...');
reset role;
select is((select confirmed_by from ops.stream_completeness
            where branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'bar'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  '...but matches zero rows — the confirmation is untouched');
set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. Structural refusals — one row per stream, and only for a stream that exists
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';

-- (Radiant, bar) has no stream Team in this fixture — the roastery's permanent case in miniature
-- (OD-WAY-42): a branch that runs no such stream. Confirming its list would record a fact about
-- nothing. The composite FK cannot catch this — Radiant IS a branch of this org.
select throws_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf03','bar')
  $$, '23514', null,
  'FR-005: a (branch, activity) that is not a live production stream cannot be confirmed complete');

select throws_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','bar')
  $$, '23505', null,
  'one confirmation row per stream — a second is a re-confirmation of the first, never a rival record');

-- The UPSERT the client actually emits, pinned in its real shape. The surface sends the STREAM and
-- nothing else and lets ON CONFLICT decide between a first confirmation and a re-confirmation, so
-- org_id arrives from its column DEFAULT — including in the conflict target. Neither the plain
-- INSERT nor the plain UPDATE above exercises that combination, and it is the one statement the
-- app depends on working.
select lives_ok($$
  insert into ops.stream_completeness (branch_id, activity)
  values ('00000000-0000-0000-0000-00000000bf01','bar')
  on conflict (org_id, branch_id, activity)
  do update set branch_id = excluded.branch_id, activity = excluded.activity
  $$, 'the client''s upsert resolves to a re-confirmation — org_id comes from its DEFAULT, conflict target included');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- E. Fail-closed: the new table's read policy, and the org seam
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The POSITIVE first, so "reads nothing" below is a scoping result and not an empty table.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from ops.stream_completeness), 2,
  'stream_completeness_select_org (positive): read is ORG-WIDE — a member sees both streams'' state, because a gap that is private is the tribal knowledge FR-031 ends');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}';
select is((select count(*)::int from ops.stream_completeness), 0,
  'org seam: another org''s admin reads none of org A''s confirmations');

set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.stream_completeness), 0,
  'fail-closed: a claimless session reads no confirmation');

-- A claimless INSERT is refused, and the refusal that arrives FIRST is the live-stream check's
-- (23514), not the policy's: a BEFORE ROW trigger runs before RLS evaluates WITH CHECK, and a
-- claimless session cannot see any team, so there is no stream to confirm before there is a
-- policy to fail. Both controls hold; this asserts the one that fires, then confirms nothing landed.
select throws_ok($$
  insert into ops.stream_completeness (org_id, branch_id, activity)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','bar')
  $$, '23514', null,
  'fail-closed: a claimless session confirms nothing — it cannot even see a stream to confirm');
reset role;
select is((select count(*)::int from ops.stream_completeness), 2,
  'fail-closed: ...and nothing landed — still exactly the two authorised confirmations');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- F. FR-031's central claim: THE CONFIRMATION GATES NOTHING
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DD-WAY-29's coordinate gate already decides which rows reach a capture form, and NFR-004 wants
-- it to stay a query predicate with nothing to bypass. Completeness is a tracked state, not a
-- control — so no policy anywhere may consult it. Asserted over the catalog rather than by
-- reading the diff, because the failure this guards against is a LATER ticket quietly wiring the
-- record into an authorization path and turning a visible gap into a silent refusal.
select is(
  (select coalesce(array_agg(p.schemaname || '.' || p.tablename || '.' || p.policyname order by p.policyname), '{}')
     from pg_policies p
    where (coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'')) like '%stream_completeness%'
      and not (p.schemaname = 'ops' and p.tablename = 'stream_completeness')),
  '{}'::text[],
  'FR-031: the completeness record gates NOTHING — no policy in any schema consults it');

select * from finish();
rollback;
