-- AC-609 (FR-609): the derived roll-up reports live per-occurrence counts (no stored counts).
-- AC-610 (FR-610): an authorized human completes a run (Tasks persist); an unauthorized caller cannot.
-- AC-611 (FR-614/NFR-601): runs/pending are RPC-only — a direct INSERT is denied; a spawn without
--   process.start (or owning-Team auth) is rejected.
-- AC-613 (FR-612): due_process_runs lists a daily occurrence with no today-run, and omits it once spawned.
-- Fixture: 20260716000015_mos_process_test_seed.sql. Starter = Boss (…f004) acting as admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', current_date);

-- ── AC-609: roll-up over one materialized (then Done) Task + two unresolved pending items ──
reset role;
update mos.tasks set status='Done' where generated_from_task_def_id='00000000-0000-0000-0000-00000000d001';

select is((select total::int from mos.process_run_rollup
             where process_run_id=(select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01')),
          1, 'AC-609: rollup total counts only the one materialized Task');
select is((select done::int from mos.process_run_rollup
             where process_run_id=(select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01')),
          1, 'AC-609: rollup done counts the Done Task');
select is((select completion_pct from mos.process_run_rollup
             where process_run_id=(select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01')),
          100.0, 'AC-609: rollup completion_pct = 100.0 (1 of 1 Done)');
select is((select pending_unresolved::int from mos.process_run_rollup
             where process_run_id=(select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01')),
          2, 'AC-609: rollup pending_unresolved counts the two ambiguous defs');

-- Resolve one pending (as admin) → a second Task; make it overdue and prove overdue counts it.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';
select mos.resolve_pending_task(
  (select id from mos.process_run_pending_tasks where task_def_id='00000000-0000-0000-0000-00000000d003' and resolved_at is null),
  '00000000-0000-0000-0000-00000000f002');
reset role;
update mos.tasks set due_date = current_date - 1, status='Open' where generated_from_task_def_id='00000000-0000-0000-0000-00000000d003';
select is((select overdue::int from mos.process_run_rollup
             where process_run_id=(select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01')),
          1, 'AC-609: rollup overdue counts a past-due, not-Done Task');

-- ── AC-610: completion is an authorized human act; Tasks persist; a non-capable caller is rejected ──
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';
select mos.complete_process_run((select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01'));

-- A member (…f001, own_team member but no process.start) cannot complete.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';
select throws_ok($$
  select mos.complete_process_run((select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01'))
$$, '42501', null, 'AC-610: a caller without process.start cannot complete a run');

reset role;
select is((select status from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01'),
          'completed', 'AC-610: the run is marked completed');
select ok((select completed_at is not null from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01'),
          'AC-610: completed_at is set');
select ok((select count(*) > 0 from mos.tasks where process_run_id=(select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01')),
          'AC-610: a completed run retains its Tasks');

-- ── AC-611: runs/pending are RPC-only; spawn needs process.start ──
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';
select throws_ok($$
  insert into mos.process_runs (org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date, definition_version, spec_snapshot)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000005b01','2099-01-01','x','2099-01-01',1,'{}'::jsonb)
$$, '42501', null, 'AC-611: a direct INSERT into mos.process_runs is denied (RPC-only)');
select throws_ok($$
  insert into mos.process_run_pending_tasks (org_id, process_run_id, task_def_id, reason)
  values ('00000000-0000-0000-0000-0000000000a1',
          (select id from mos.process_runs where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b01'),
          '00000000-0000-0000-0000-00000000d002','none')
$$, '42501', null, 'AC-611: a direct INSERT into mos.process_run_pending_tasks is denied (RPC-only)');
select throws_ok($$
  select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-000000005b01', current_date + 5)
$$, '42501', null, 'AC-611: spawn without process.start is rejected');

-- ── AC-613: the scheduler-free due surface lists then omits a spawned occurrence ──
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';
select ok(exists (select 1 from mos.due_process_runs()
            where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b02'),
          'AC-613: due_process_runs lists a daily occurrence with no today-run (SiblingTeam)');
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b02', (now() at time zone 'Asia/Jakarta')::date);
select ok(not exists (select 1 from mos.due_process_runs()
            where work_line_id='00000000-0000-0000-0000-00000000c001' and owning_team_id='00000000-0000-0000-0000-000000005b02'),
          'AC-613: once spawned, that occurrence is omitted from due_process_runs');

reset role;
select * from finish();
rollback;
