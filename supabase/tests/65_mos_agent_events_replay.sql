-- mos.agent_events replay-field widening (P3a §3.1, migration 20260706000001).
-- AC-P3-RP-004: mos.agent_events.type accepts 'user' (and 'artifact' for journal completeness);
--   an owner can SELECT their own run's 'user' events; a cross-org caller reads 0 rows (mirrors
--   64_mos_agent_persistence_rls). RLS posture is unchanged by the widening (a 'user'/'artifact'
--   row is fully immutable like tool/status/system — the append-only + feedback-only trigger is
--   untouched; only the type CHECK constraint widens).
-- Deputy invariant: caller-JWT only; no service_role site is introduced.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select mos._test_seed_role_tree();

-- Role tree recap (mos._test_seed_role_tree, org WU-A = ...0a1, org WU-B = ...0b1):
--   Author      ...0d1 [Staff R]  -- the owner under test (org A)
--   ForeignMgr  ...0b4 [B-Lead]   -- cross-org (org B)

-- Fixed test-only ids for the thread/run/events under test (not part of the shared seed fixture).
-- Thread  e011 ; Run  e111 ; user-event e211 ; artifact-event e212

set local role authenticated;

-- ── build a thread + run as Author (the owner under test) ───────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

insert into mos.agent_threads (id, title) values
  ('00000000-0000-0000-0000-0000000000f1', 'Replay thread');
insert into mos.agent_runs (id, thread_id, status, route) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 'running', '{"route":"/tasks"}'::jsonb);

-- ── AC-P3-RP-004: 'user' type accepted by the owner (the P3a check-widening) ────────────────
select lives_ok(
  $$insert into mos.agent_events (id, run_id, seq, type, text, payload) values
    ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', 1, 'user', 'how many objectives?', '{}'::jsonb)$$,
  'AC-P3-RP-004: owner can INSERT a type=''user'' event (check constraint widened by 20260706000001)');

select is(
  (select type from mos.agent_events where id = '00000000-0000-0000-0000-0000000000f3'),
  'user', 'AC-P3-RP-004: the ''user'' event row is persisted with type=''user'' and readable by the owner');

-- ── 'artifact' type also accepted (journal completeness, plan §3.1 #1) ───────────────────────
select lives_ok(
  $$insert into mos.agent_events (id, run_id, seq, type, payload) values
    ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f2', 2, 'artifact', '{"kind":"compose_view"}'::jsonb)$$,
  'AC-P3-RP-004: owner can INSERT a type=''artifact'' event (check constraint widened for both replay types)');

-- ── cross-org caller reads 0 rows of the owner's 'user' event (RLS unchanged) ───────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.agent_events where id = '00000000-0000-0000-0000-0000000000f3'),
  0, 'AC-P3-RP-004: cross-org caller (ForeignMgr) sees 0 rows of the owner''s ''user'' event (RLS unchanged by the widening)');

-- back to Author for the immutability re-assertion on the new types.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- ── a 'user'/'artifact' row is fully immutable (append-only guard unchanged by the widening) ─
select throws_ok(
  $$update mos.agent_events set text = 'edited' where id = '00000000-0000-0000-0000-0000000000f3'$$,
  '42501', null, 'AC-P3-RP-004: a ''user'' event is append-only (feedback trigger unchanged — text drift raises 42501)');

-- ── RLS posture unchanged: agent_events still has RLS enabled + forced ───────────────────────
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'agent_events'),
  'AC-P3-RP-004: mos.agent_events RLS still enabled + forced (widening added no policy bypass)');

reset role;

select * from finish();
rollback;
