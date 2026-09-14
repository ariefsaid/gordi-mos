-- Generated Tasks inherit the canonical process-run Team and cannot diverge from it.
-- This exercises the actual spawn and pending-resolution RPCs, including the current final spawn
-- definition (the Café override is also protected by the same Task trigger), not a test-only insert.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select is(
  (mos.spawn_process_run(
    '00000000-0000-0000-0000-00000000c001',
    '00000000-0000-0000-0000-000000005b01',
    date '2026-12-01'
  ) ->> 'created')::int,
  1,
  'actual Process spawn materialises the resolvable generated Task');
select is(
  (select count(*)::int from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01'),
  1,
  'spawn creates one occurrence Task before pending resolution');
select is(
  (select t.team_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01'),
  '00000000-0000-0000-0000-000000005b01'::uuid,
  'spawn propagates process_runs.owning_team_id into the generated Task');
select is(
  (select t.org_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01'),
  (select r.org_id from mos.process_runs r where r.period_key = '2026-12-01'),
  'spawned Task and process run share the same org');
select is(
  (select t.work_line_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01'),
  (select r.work_line_id from mos.process_runs r where r.period_key = '2026-12-01'),
  'spawned Task and process run share the same work line');
select is(
  (select t.business_unit_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01'),
  (select tm.business_unit_id
     from mos.process_runs r join shared.teams tm on tm.id = r.owning_team_id
    where r.period_key = '2026-12-01'),
  'spawned Task BU equals the canonical owning Team BU');
select is(
  (select count(*)::int from mos.process_run_pending_tasks p join mos.process_runs r on r.id = p.process_run_id
    where r.period_key = '2026-12-01' and p.resolved_at is null),
  2,
  'spawn leaves both ambiguous definitions in the pending queue');

select isnt(
  mos.resolve_pending_task(
    (select p.id from mos.process_run_pending_tasks p join mos.process_runs r on r.id = p.process_run_id
      where r.period_key = '2026-12-01' and p.reason = 'multiple'),
    '00000000-0000-0000-0000-00000000f002'
  ),
  null,
  'actual pending resolution materialises the selected generated Task');
select is(
  (select t.team_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01' and t.generated_from_task_def_id = '00000000-0000-0000-0000-00000000d003'),
  '00000000-0000-0000-0000-000000005b01'::uuid,
  'pending resolution propagates the same canonical owning Team');
select is(
  (select t.org_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01' and t.generated_from_task_def_id = '00000000-0000-0000-0000-00000000d003'),
  (select r.org_id from mos.process_runs r where r.period_key = '2026-12-01'),
  'resolved Task remains in the process run org');
select is(
  (select t.business_unit_id from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01' and t.generated_from_task_def_id = '00000000-0000-0000-0000-00000000d003'),
  (select tm.business_unit_id
     from mos.process_runs r join shared.teams tm on tm.id = r.owning_team_id
    where r.period_key = '2026-12-01'),
  'resolved Task BU remains equal to the owning Team BU');
select is(
  (select count(*)::int from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-12-01' and t.team_id = r.owning_team_id),
  2,
  'every generated Task in the occurrence has the run Team');

reset role;
select throws_ok($$
  insert into mos.tasks
    (id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by,
     work_line_id, process_run_id, team_id)
  values
    ('00000000-0000-0000-0000-00000000f901', 'Wrong process Team',
     '00000000-0000-0000-0000-0000000000a2',
     '00000000-0000-0000-0000-00000000f001',
     '00000000-0000-0000-0000-00000000f004',
     '00000000-0000-0000-0000-0000000000d1',
     '00000000-0000-0000-0000-00000000c001',
     (select id from mos.process_runs where period_key = '2026-12-01'),
     '00000000-0000-0000-0000-000000005b02')
$$, '23514', 'team_id must equal process_run.owning_team_id',
  'a generated Task cannot name a same-BU Team different from the process run');
select throws_ok($$
  insert into mos.tasks
    (id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by,
     work_line_id, process_run_id, team_id)
  values
    ('00000000-0000-0000-0000-00000000f902', 'Missing process work line',
     '00000000-0000-0000-0000-0000000000a2',
     '00000000-0000-0000-0000-00000000f001',
     '00000000-0000-0000-0000-00000000f004',
     '00000000-0000-0000-0000-0000000000d1',
     null,
     (select id from mos.process_runs where period_key = '2026-12-01'),
     '00000000-0000-0000-0000-000000005b01')
$$, '23514', 'work_line_id must equal process_run.work_line_id',
  'a generated Task cannot omit the process run work line');

select * from finish();
rollback;
