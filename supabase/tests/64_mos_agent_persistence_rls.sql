-- mos.agent_threads / agent_runs / agent_events RLS (ADR-0018 D6 P2 / ADR-0017 D2/D10).
-- Adapted from the sibling internal project's agent-persistence pgTAP suite; MOS deltas: mos schema,
-- owner_id (person, no profiles), org-gate on every SELECT branch, NO admin cross-owner read
-- (P2 has no manager-share for the deputy transcript — FR-P2-PS-004).
-- AC-P2-PS-001: INSERT into mos.agent_threads without sending org_id/owner_id -> stamped from JWT;
--   cross-org caller SELECT -> 0 rows.
-- AC-P2-PS-002: owner's agent_events row -> same-org non-owner (incl. admin) SELECT -> 0 rows.
-- AC-P2-PS-003: owner UPDATE of text/payload/seq on their assistant event -> 42501; rating-only -> ok.
-- AC-P2-PS-004: two inserts same (run_id, seq) -> second fails (unique).
-- AC-P2-DI-001: caller-JWT bound to org X querying mos.agent_events for an org-Y row -> 0 rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select mos._test_seed_role_tree();

-- Role tree recap (mos._test_seed_role_tree, org WU-A = ...0a1, org WU-B = ...0b1):
--   Author      ...0d1 [Staff R]  -- the owner under test (org A)
--   DirectMgr   ...0d2 [Lead R]   -- same-org manager of Author (NOT a manager-share target in P2)
--   ForeignMgr  ...0b4 [B-Lead]   -- cross-org (org B)

-- Fixed test-only ids for the thread/run/events under test (not part of the shared seed fixture).
-- Thread  e001 ; Run  e101 ; assistant-event e201 ; tool-event e202

set local role authenticated;

-- ── AC-P2-PS-001: INSERT stamped from JWT; cross-org SELECT -> 0 rows ─────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'agent_threads'),
  'AC-P2-PS-001: mos.agent_threads has RLS enabled and forced');

select ok(
  (select with_check is not null
     from pg_policies
    where schemaname = 'mos' and tablename = 'agent_threads' and policyname = 'agent_threads_insert'),
  'AC-P2-PS-001: agent_threads INSERT policy carries a WITH CHECK');

-- caller sends neither org_id nor owner_id -- both must default from the JWT claims.
insert into mos.agent_threads (id, title) values
  ('00000000-0000-0000-0000-0000000000e1', 'Author thread');

select is(
  (select owner_id::text from mos.agent_threads where id = '00000000-0000-0000-0000-0000000000e1'),
  '00000000-0000-0000-0000-0000000000d1',
  'AC-P2-PS-001: owner_id stamped from the JWT person_id claim (client sent none)');

select is(
  (select org_id::text from mos.agent_threads where id = '00000000-0000-0000-0000-0000000000e1'),
  '00000000-0000-0000-0000-0000000000a1',
  'AC-P2-PS-001: org_id stamped from the JWT org_id claim (client sent none)');

-- cross-org caller cannot see it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.agent_threads where id = '00000000-0000-0000-0000-0000000000e1'),
  0, 'AC-P2-PS-001: cross-org caller (ForeignMgr) sees 0 rows of Author''s thread');

-- ── build a run + events as Author, to exercise PS-002/003/004 and DI-001 ─────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

insert into mos.agent_runs (id, thread_id, status, route) values
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e1', 'running', '{"route":"/tasks"}'::jsonb);

insert into mos.agent_events (id, run_id, seq, type, text, payload) values
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000e2', 1, 'assistant', 'hello', '{}'::jsonb);

-- ── AC-P2-PS-002: owner's agent_events row -> same-org non-owner (incl. admin) sees 0 rows ────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.agent_events where id = '00000000-0000-0000-0000-0000000000e3'),
  0, 'AC-P2-PS-002: same-org non-owner (DirectMgr) sees 0 rows of Author''s event');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["admin"]}';
select is(
  (select count(*)::int from mos.agent_events where id = '00000000-0000-0000-0000-0000000000e3'),
  0, 'AC-P2-PS-002: same-org admin (DirectMgr as admin) STILL sees 0 rows -- no manager-share/admin bypass');

-- ── AC-P2-DI-001: cross-org caller (org Y) querying an org-X event row -> 0 rows ──────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is(
  (select count(*)::int from mos.agent_events where id = '00000000-0000-0000-0000-0000000000e3'),
  0, 'AC-P2-DI-001: cross-org caller (ForeignMgr, org B) sees 0 rows of an org-A event');

-- back to Author for the update-guard + unique-constraint checks.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select is(
  (select count(*)::int from mos.agent_events where id = '00000000-0000-0000-0000-0000000000e3'),
  1, 'AC-P2-PS-002 (sanity): the owner (Author) sees their own event');

-- ── AC-P2-PS-003: append-only guard -- text/payload/seq drift -> 42501; rating-only -> ok ─────
select throws_ok(
  $$update mos.agent_events set text = 'edited' where id = '00000000-0000-0000-0000-0000000000e3'$$,
  '42501', null, 'AC-P2-PS-003: UPDATE of text on an assistant event raises 42501 (append-only)');

select throws_ok(
  $$update mos.agent_events set payload = '{"x":1}'::jsonb where id = '00000000-0000-0000-0000-0000000000e3'$$,
  '42501', null, 'AC-P2-PS-003: UPDATE of payload on an assistant event raises 42501 (append-only)');

select throws_ok(
  $$update mos.agent_events set seq = 99 where id = '00000000-0000-0000-0000-0000000000e3'$$,
  '42501', null, 'AC-P2-PS-003: UPDATE of seq on an assistant event raises 42501 (append-only)');

select lives_ok(
  $$update mos.agent_events set rating = 'up' where id = '00000000-0000-0000-0000-0000000000e3'$$,
  'AC-P2-PS-003: UPDATE of rating ONLY on the owner''s own assistant event is allowed');

select is(
  (select rating from mos.agent_events where id = '00000000-0000-0000-0000-0000000000e3'),
  'up', 'AC-P2-PS-003: the rating update was actually persisted');

-- feedback on a NON-assistant event (e.g. a tool row) is rejected even for rating.
insert into mos.agent_events (id, run_id, seq, type, tool_name, tool_args_hash, tool_status) values
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000e2', 2, 'tool', 'query_entity', 'deadbeef', 'completed');

select throws_ok(
  $$update mos.agent_events set rating = 'up' where id = '00000000-0000-0000-0000-0000000000e4'$$,
  '42501', null, 'AC-P2-PS-003: rating on a NON-assistant (tool) event still raises 42501');

-- ── AC-P2-PS-004: two inserts with the same (run_id, seq) -> second fails (unique) ────────────
select throws_ok(
  $$insert into mos.agent_events (run_id, seq, type, text) values ('00000000-0000-0000-0000-0000000000e2', 1, 'assistant', 'dup')$$,
  '23505', null, 'AC-P2-PS-004: duplicate (run_id, seq) violates the unique constraint');

reset role;

select * from finish();
rollback;
