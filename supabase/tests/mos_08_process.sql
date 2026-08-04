-- mos, squashed baseline — Processes: definitions, occurrences, and the never-guess-a-PIC rule.
--
-- A Process is a work_line of type='process' carrying one cadence and a set of generated-Task
-- templates. Starting it mints an OCCURRENCE (a process_run) which generates Tasks. The rule that
-- shapes the whole design: when a template's PIC cannot be resolved to exactly ONE person, the run
-- produces a pending human-choice row rather than a guessed assignee. A wrongly-assigned task is
-- worse than an unassigned one, because nobody checks a task that already has a name on it.
--
-- Two gates always travel together — shared.can('process.start') says you may start processes at
-- all, and mos.can_start_process_for_team says you may start THIS one. `member` holds the
-- capability (the person who runs the floor starts the day), so the Team check is the entire reason
-- that does not let any member start any Team's process.
--
-- Fixture (mos._test_seed_process_tree) — a daily Café Opening on OwnTeam with three templates,
-- one per PIC-resolution path:
--   TdSolo   ...d001  role Opener, ONE holder (Solo ...f001), 2 checklist items -> a Task
--   TdVacant ...d002  role Vacant Station, ZERO holders                         -> pending, 'none'
--   TdTwin   ...d003  role Twin Station, TWO holders                            -> pending, 'multiple'
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

set local role authenticated;
-- Author ...0d1 is an active OwnTeam member and holds `member`, which carries process.start.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

-- ── The existence oracle is closed ───────────────────────────────────────────────────────────
-- A nonexistent process and a process in ANOTHER org must be indistinguishable from outside.
-- Distinguishing them would let a caller probe another tenant's catalog by reading which error came
-- back, even though they could never start either one.
reset role;
insert into shared.orgs (id, name, slug) values ('00000000-0000-0000-0000-0000000000c9','Probe Org','probe-org');
insert into mos.work_lines (id, org_id, name, type)
values ('00000000-0000-0000-0000-000000009001','00000000-0000-0000-0000-0000000000c9','Foreign Process','process');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select throws_ok($$
  select mos.spawn_process_run('00000000-0000-0000-0000-000000009999',
                               '00000000-0000-0000-0000-000000005b01', date '2026-03-02')
$$, 'P0002', 'process not found', 'a NONEXISTENT process id raises "process not found"');
select throws_ok($$
  select mos.spawn_process_run('00000000-0000-0000-0000-000000009001',
                               '00000000-0000-0000-0000-000000005b01', date '2026-03-02')
$$, 'P0002', 'process not found',
  'a process in ANOTHER org raises the IDENTICAL message and code — no existence oracle for a catalog the caller cannot see');

select throws_ok($$
  select mos.spawn_process_run('00000000-0000-0000-0000-000000005b01',
                               '00000000-0000-0000-0000-000000005b01', date '2026-03-02')
$$, 'P0002', null, 'an id that is not a work_line at all is refused the same way');

-- ── The spawn ────────────────────────────────────────────────────────────────────────────────
select is(
  (mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                         '00000000-0000-0000-0000-000000005b01', date '2026-03-02') ->> 'created')::int,
  1, 'spawn generates a Task for the ONE template whose PIC resolves to a single holder');
select is(
  (select (spec ->> 'pending')::int from (
     select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                                  '00000000-0000-0000-0000-000000005b01', date '2026-03-03') as spec) s),
  2, 'spawn produces a pending human-choice row for BOTH unresolvable templates — the vacant one and the ambiguous one');

select is(
  (select count(*)::int from mos.process_run_pending_tasks p
    join mos.process_runs r on r.id = p.process_run_id
   where r.period_key = '2026-03-02' and p.reason = 'none'),
  1, 'the template whose role has NO holder is recorded as reason=''none'' — a vacancy, stated rather than filled by guesswork');
select is(
  (select count(*)::int from mos.process_run_pending_tasks p
    join mos.process_runs r on r.id = p.process_run_id
   where r.period_key = '2026-03-02' and p.reason = 'multiple'),
  1, 'the template whose role has TWO holders is recorded as reason=''multiple''');
select is(
  (select array_length(p.candidate_person_ids, 1) from mos.process_run_pending_tasks p
    join mos.process_runs r on r.id = p.process_run_id
   where r.period_key = '2026-03-02' and p.reason = 'multiple'),
  2, '...and carries BOTH candidates, so the human choosing is shown the actual options');

-- The generated Task, and everything that had to be inherited to make it usable.
select is(
  (select responsible_person_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-03-02'),
  '00000000-0000-0000-0000-00000000f001'::uuid,
  'the generated Task''s Responsible is the sole role holder');
select is(
  (select accountable_person_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-03-02'),
  '00000000-0000-0000-0000-00000000f004'::uuid,
  'its Accountable falls back to the Process''s own Accountable — a generated Task never lands without an A');
select is(
  (select count(*)::int from mos.task_checklist_items c
    join mos.tasks t on t.id = c.task_id
    join mos.process_runs r on r.id = t.process_run_id
   where r.period_key = '2026-03-02'),
  2, 'the template''s checklist items are materialised onto the Task — one operator, several steps, ONE task');
select is(
  (select business_unit_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-03-02'),
  '00000000-0000-0000-0000-0000000000a2'::uuid,
  'the Task takes its business unit from the adopting Team, not from the definition');
select isnt(
  (select generated_from_task_def_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-03-02'),
  null, 'the Task carries its provenance back to the template it came from');

-- The snapshot is what stops a later definition edit rewriting what a past occurrence asked for.
select is(
  (select jsonb_array_length(spec_snapshot -> 'task_defs') from mos.process_runs where period_key = '2026-03-02'),
  3, 'the run freezes the three active definitions, so editing one later cannot rewrite history');

-- ── Idempotency ──────────────────────────────────────────────────────────────────────────────
-- A double-tap on a slow connection must not double a day's tasks. The UNIQUE key does the work;
-- the RPC returns the run that already exists and generates nothing.
select is(
  (mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                         '00000000-0000-0000-0000-000000005b01', date '2026-03-02') ->> 'idempotent')::boolean,
  true, 'spawning the SAME occurrence twice returns the existing run');
select is(
  (mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                         '00000000-0000-0000-0000-000000005b01', date '2026-03-02') ->> 'created')::int,
  0, '...and generates nothing the second time');
select is(
  (select count(*)::int from mos.process_runs where period_key = '2026-03-02'),
  1, '...so exactly one occurrence exists for that day and Team');

-- ── The gates ────────────────────────────────────────────────────────────────────────────────
-- Peer is a member of SiblingTeam, so she holds process.start and fails the Team half. That is the
-- pair working as designed: the capability is broad on purpose, the Team check is what narrows it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}';
select throws_ok($$
  select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                               '00000000-0000-0000-0000-000000005b01', date '2026-03-04')
$$, '42501', null,
  'a member of a DIFFERENT Team cannot start this Team''s process — holding process.start is not enough on its own');
select throws_ok($$
  select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                               '00000000-0000-0000-0000-000000005b01', date '2026-03-04')
$$, '42501', null, '...and the refusal is the same on a retry, so nothing is created on the way to failing');

-- ── Resolving a pending item ─────────────────────────────────────────────────────────────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$
  select mos.resolve_pending_task(
    (select p.id from mos.process_run_pending_tasks p
      join mos.process_runs r on r.id = p.process_run_id
     where r.period_key = '2026-03-02' and p.reason = 'multiple'),
    '00000000-0000-0000-0000-00000000f001')
$$, 'P0003', null,
  'resolving an AMBIGUOUS item to someone outside the candidate list is refused — the choice is between the actual holders');
select throws_ok($$
  select mos.resolve_pending_task(
    (select p.id from mos.process_run_pending_tasks p
      join mos.process_runs r on r.id = p.process_run_id
     where r.period_key = '2026-03-02' and p.reason = 'multiple'),
    '00000000-0000-0000-0000-0000000000b4')
$$, '42501', null, 'resolving to a person in another org is refused');

select isnt(
  mos.resolve_pending_task(
    (select p.id from mos.process_run_pending_tasks p
      join mos.process_runs r on r.id = p.process_run_id
     where r.period_key = '2026-03-02' and p.reason = 'multiple'),
    '00000000-0000-0000-0000-00000000f002'),
  null, 'resolving to one of the candidates materialises the Task');
select is(
  (select count(*)::int from mos.process_run_pending_tasks p
    join mos.process_runs r on r.id = p.process_run_id
   where r.period_key = '2026-03-02' and p.resolved_at is null),
  1, '...and the queue drops to the one still-vacant item');
select throws_ok($$
  select mos.resolve_pending_task(
    (select p.id from mos.process_run_pending_tasks p
      join mos.process_runs r on r.id = p.process_run_id
     where r.period_key = '2026-03-02' and p.reason = 'multiple'),
    '00000000-0000-0000-0000-00000000f003')
$$, 'P0003', null, 'resolving the SAME item twice is refused — two people cannot both materialise it');

-- ── Completion and the derived roll-up ───────────────────────────────────────────────────────
select is(
  (select total from mos.process_run_rollup where scheduled_date = date '2026-03-02'),
  2::bigint, 'the roll-up counts both Tasks the occurrence has produced so far');
select is(
  (select pending_unresolved from mos.process_run_rollup where scheduled_date = date '2026-03-02'),
  1::bigint, '...and reports the item still awaiting a human choice, rather than quietly omitting it');
select is(
  (select completion_pct from mos.process_run_rollup where scheduled_date = date '2026-03-02'),
  0.0::numeric, '...and completion is derived at query time from the child Tasks — nothing is stored to go stale');

select is(
  (select status from mos.complete_process_run(
     (select id from mos.process_runs where period_key = '2026-03-02'))),
  'completed', 'a human can mark the occurrence complete');

-- ── Occurrences are RPC-write-only ───────────────────────────────────────────────────────────
select ok(not has_table_privilege('authenticated','mos.process_runs','INSERT')
      and not has_table_privilege('authenticated','mos.process_run_pending_tasks','UPDATE'),
  'runs and the pending queue hold no write privilege for authenticated — the RPCs are the only way in, so the gates and the idempotency key cannot be sidestepped');

reset role;
select * from finish();
rollback;
