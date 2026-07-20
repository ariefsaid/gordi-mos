-- V3 Issue 8 (AC-801/802/803 — lower-level proofs of FR-V3-003 / NFR-V3-008/009). Proves the
-- deterministic BU->Team re-home against the one local Supabase: the migration's mos._rehome_task_teams()
-- applies EXACTLY the rules in mos-app/src/lib/team-context/task-team-rehome.ts, fills team_id on
-- deterministic rows without touching identity/provenance, leaves ambiguous rows unresolved with the
-- right reason category, and keeps the audit report invisible to application roles. It also proves the
-- Team/BU same-org invariant guard on writes.
--
-- Fixtures build on mos._test_seed_role_tree (org WU-A = ...0a1, Unit-1 BU = ...0a2, Unit-2 BU = ...0a3,
-- Author = ...0d1). Reachable classifier cases only: the DB's FKs + cascade guard make missing-run /
-- missing-run-team / cross-org-run structurally unreachable for live rows (they are covered by the
-- classifier unit test and retained as defensive branches in the function).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select mos._test_seed_role_tree();

-- Extra BU with zero Teams (no-bu-candidate case).
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000a1','Unit-3');

-- Teams: Unit-1 has exactly one active Team (T1); Unit-2 has two (T2a, T2b) -> ambiguous.
insert into shared.teams (id, org_id, business_unit_id, site_id, name, code) values
  ('00000000-0000-0000-0000-000000007b01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2',null,'Unit-1 Team','u1_team'),
  ('00000000-0000-0000-0000-000000007b02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3',null,'Unit-2 Team A','u2_team_a'),
  ('00000000-0000-0000-0000-000000007b03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a3',null,'Unit-2 Team B','u2_team_b');

-- A process work-line + two runs: RUN1 owns the Unit-1 Team (BU-equal); RUN2 owns a Unit-2 Team.
insert into mos.work_lines (id, org_id, name, type) values
  ('00000000-0000-0000-0000-000000007c01','00000000-0000-0000-0000-0000000000a1','Café Opening','process');
insert into mos.process_runs (id, org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date, definition_version, spec_snapshot) values
  ('00000000-0000-0000-0000-000000007e01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000007c01','00000000-0000-0000-0000-000000007b01','p1','Café Opening · p1', current_date, 1, '{}'::jsonb),
  ('00000000-0000-0000-0000-000000007e02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000007c01','00000000-0000-0000-0000-000000007b02','p1','Café Opening · p1', current_date, 1, '{}'::jsonb);

-- Five legacy Tasks (team_id null), all owned by Author, spanning every reachable classifier outcome.
insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, process_run_id) values
  ('00000000-0000-0000-0000-000000008a01','00000000-0000-0000-0000-0000000000a1','via-run',      '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000007e01'),
  ('00000000-0000-0000-0000-000000008a02','00000000-0000-0000-0000-0000000000a1','run-bu-mismatch','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000007e02'),
  ('00000000-0000-0000-0000-000000008a03','00000000-0000-0000-0000-0000000000a1','unique-bu',    '00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1',null),
  ('00000000-0000-0000-0000-000000008a04','00000000-0000-0000-0000-0000000000a1','multi-bu',     '00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1',null),
  ('00000000-0000-0000-0000-000000008a05','00000000-0000-0000-0000-0000000000a1','zero-bu',      '00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1',null);

-- ── Reversible window: team_id exists and is NULLABLE (enforcement is the held migration) ─────────
select ok(
  (select is_nullable = 'YES' from information_schema.columns
    where table_schema = 'mos' and table_name = 'tasks' and column_name = 'team_id'),
  'AC-803: mos.tasks.team_id exists and is nullable during the reversible re-home window');

-- ── Run the deterministic re-home (idempotent upsert of the ambiguity report) ────────────────────
select lives_ok($$ select mos._rehome_task_teams() $$,
  'AC-801: mos._rehome_task_teams() runs the deterministic classifier');

-- ── AC-801: occurrence Task -> its run's owning Team (BU-equal) ───────────────────────────────────
select is(
  (select team_id::text from mos.tasks where id = '00000000-0000-0000-0000-000000008a01'),
  '00000000-0000-0000-0000-000000007b01',
  'AC-801: run-backed Task resolves to its run''s owning Team (via-run)');

-- identity/provenance preserved on the resolved row (only team_id was filled).
select ok(
  (select business_unit_id = '00000000-0000-0000-0000-0000000000a2'
      and responsible_person_id = '00000000-0000-0000-0000-0000000000d1'
      and accountable_person_id = '00000000-0000-0000-0000-0000000000d1'
      and process_run_id = '00000000-0000-0000-0000-000000007e01'
     from mos.tasks where id = '00000000-0000-0000-0000-000000008a01'),
  'AC-801: the resolved Task keeps its BU, R/A, and process-run provenance unchanged');

-- ── AC-802: ad-hoc Task -> the sole active same-org Team in its BU ────────────────────────────────
select is(
  (select team_id::text from mos.tasks where id = '00000000-0000-0000-0000-000000008a03'),
  '00000000-0000-0000-0000-000000007b01',
  'AC-802: ad-hoc Task with a unique BU Team resolves (via-unique-bu)');

-- ── AC-803: ambiguous/invalid stays UNRESOLVED (team_id null) with the right reason ───────────────
select ok(
  (select team_id is null from mos.tasks where id = '00000000-0000-0000-0000-000000008a02'),
  'AC-803: run-team-BU-mismatch Task stays unresolved (never falls back to BU)');
select is(
  (select reason from mos.task_team_rehome_ambiguities where task_id = '00000000-0000-0000-0000-000000008a02'),
  'run-team-bu-mismatch', 'AC-803: mismatch row is reported with reason run-team-bu-mismatch');
select is(
  (select candidate_team_ids::text from mos.task_team_rehome_ambiguities where task_id = '00000000-0000-0000-0000-000000008a02'),
  '{00000000-0000-0000-0000-000000007b02}',
  'AC-803: mismatch row records the run''s owning Team as the sole candidate');

select ok(
  (select team_id is null from mos.tasks where id = '00000000-0000-0000-0000-000000008a04'),
  'AC-803: multi-candidate Task stays unresolved');
select is(
  (select reason from mos.task_team_rehome_ambiguities where task_id = '00000000-0000-0000-0000-000000008a04'),
  'multiple-bu-candidates', 'AC-803: multi row reports every candidate, never picks the first');
select is(
  (select candidate_team_ids::text from mos.task_team_rehome_ambiguities where task_id = '00000000-0000-0000-0000-000000008a04'),
  '{00000000-0000-0000-0000-000000007b02,00000000-0000-0000-0000-000000007b03}',
  'AC-803: multi row records both Unit-2 Teams as candidates (sorted)');

select is(
  (select reason from mos.task_team_rehome_ambiguities where task_id = '00000000-0000-0000-0000-000000008a05'),
  'no-bu-candidate', 'AC-803: zero-candidate BU Task is reported no-bu-candidate');

-- ── AC-804: the Team/BU same-org invariant guard on writes ────────────────────────────────────────
-- Assigning a Team whose BU diverges from the Task BU is rejected (Unit-2 Team on a Unit-1 Task).
select throws_ok($$
  update mos.tasks set team_id = '00000000-0000-0000-0000-000000007b02'
   where id = '00000000-0000-0000-0000-000000008a03'
$$, '23514', null,
  'AC-804: assigning a Team whose BU diverges from the Task BU is rejected by the guard');

-- ── The ambiguity audit table is invisible to every application role (no grant) ───────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["admin"]}';
select throws_ok($$
  select 1 from mos.task_team_rehome_ambiguities
$$, '42501', null,
  'AC-803: the migration audit report is not readable by an application role (permission denied)');
reset role;

select * from finish();
rollback;
