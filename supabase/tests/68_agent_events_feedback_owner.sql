-- mos.agent_events feedback-only guard — the P3a client rating path (T22, AC-P3-FB-001).
-- Re-asserts the P2 trigger (agent_events_feedback_only / mos._guard_agent_event_update,
-- migration 20260705000003) permits an owner UPDATE of {rating, downvote_reason} on their own
-- type='assistant' row, and rejects it on tool/status/system rows — the SAME trigger, exercised
-- here via the client-shape write useAssistantPanel.rate() issues (T22: both rating AND
-- downvote_reason in one UPDATE, mirroring the hook's actual payload shape). 64_mos_agent_
-- persistence_rls.sql already covers rating-only on assistant vs tool (AC-P2-PS-003); this file
-- adds the downvote_reason column (untested there) and a status/system-row rejection.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select mos._test_seed_role_tree();

-- Role tree recap (org WU-A = ...0a1):
--   Author  ...0d1 [Staff R]  -- the owner under test

-- Fixed test-only ids (not part of the shared seed fixture).
-- Thread  f001 ; Run  f101 ; assistant-event f201 ; status-event f202

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

insert into mos.agent_threads (id, title) values
  ('00000000-0000-0000-0000-0000000000f1', 'Author thread (feedback)');

insert into mos.agent_runs (id, thread_id, status, route) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'running', '{}'::jsonb);

insert into mos.agent_events (id, run_id, seq, type, text, payload) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', 1, 'assistant', 'here is your answer', '{}'::jsonb);

insert into mos.agent_events (id, run_id, seq, type, payload) values
  ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 2, 'status', '{"status":"completed"}'::jsonb);

-- ── AC-P3-FB-001: rating + downvote_reason together on the owner's assistant row -> allowed ────
select lives_ok(
  $$update mos.agent_events set rating = 'down', downvote_reason = 'inaccurate' where id = '00000000-0000-0000-0000-0000000000f3'$$,
  'AC-P3-FB-001: owner UPDATE of {rating, downvote_reason} on their own assistant event is allowed');

select is(
  (select rating from mos.agent_events where id = '00000000-0000-0000-0000-0000000000f3'),
  'down', 'AC-P3-FB-001: the rating was persisted');

select is(
  (select downvote_reason from mos.agent_events where id = '00000000-0000-0000-0000-0000000000f3'),
  'inaccurate', 'AC-P3-FB-001: the downvote_reason was persisted');

-- clearing downvote_reason back to null (e.g. switching up<->down) is also a feedback-only drift.
select lives_ok(
  $$update mos.agent_events set rating = 'up', downvote_reason = null where id = '00000000-0000-0000-0000-0000000000f3'$$,
  'AC-P3-FB-001: switching rating up + clearing downvote_reason is allowed (still feedback-only)');

-- ── AC-P3-FB-001: the SAME feedback UPDATE on a status row -> rejected (42501) ──────────────────
select throws_ok(
  $$update mos.agent_events set rating = 'up', downvote_reason = null where id = '00000000-0000-0000-0000-0000000000f4'$$,
  '42501', null, 'AC-P3-FB-001: feedback (rating/downvote_reason) on a status row raises 42501');

-- ── AC-P3-FB-001: a non-feedback column drift alongside a valid rating is STILL rejected ───────
select throws_ok(
  $$update mos.agent_events set rating = 'up', text = 'edited' where id = '00000000-0000-0000-0000-0000000000f3'$$,
  '42501', null, 'AC-P3-FB-001: a rating update bundled with a text drift still raises 42501 (append-only wins)');

reset role;

select * from finish();
rollback;
