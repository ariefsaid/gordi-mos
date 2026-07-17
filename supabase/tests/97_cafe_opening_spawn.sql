-- AC-702 (FR-703): a café-lead's Start today's opening spawns exactly one occurrence and its
-- single-holder Task(s); a repeat Start is idempotent (no second run, no duplicate Tasks).
-- Fixture: 20260717000004_mos_cafe_opening_test_seed.sql (mos._test_seed_cafe_opening()).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_cafe_opening();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';

-- First Start: exactly one process_runs row for the (process, team, today) key.
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', current_date);
select is((select count(*)::int from mos.process_runs
             where work_line_id='00000000-0000-0000-0000-00000000c001'
               and owning_team_id='00000000-0000-0000-0000-000000005b01'),
          1, 'AC-702: exactly one process_runs row after the first Start');

-- The single-holder opening Task (ca01, Open the café floor) carries process_run_id = the run.
select ok((select count(*) > 0 from mos.tasks t
             join mos.process_runs r on r.id = t.process_run_id
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000ca01'
               and r.work_line_id='00000000-0000-0000-0000-00000000c001'
               and r.owning_team_id='00000000-0000-0000-0000-000000005b01'),
          'AC-702: the ca01 (Open the café floor) Task carries process_run_id = the spawned run');
select is((select count(*)::int from mos.tasks
             where generated_from_task_def_id='00000000-0000-0000-0000-00000000ca01'),
          1, 'AC-702: exactly one ca01 Task was materialized');

-- Repeat Start of the same occurrence: idempotent.
select is((mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                                 '00000000-0000-0000-0000-000000005b01', current_date)->>'idempotent')::boolean,
          true, 'AC-702: a repeat Start of the same opening is idempotent');
select is((select count(*)::int from mos.process_runs
             where work_line_id='00000000-0000-0000-0000-00000000c001'
               and owning_team_id='00000000-0000-0000-0000-000000005b01'),
          1, 'AC-702: still exactly one run after the repeat Start');
select is((select count(*)::int from mos.tasks
             where generated_from_task_def_id='00000000-0000-0000-0000-00000000ca01'),
          1, 'AC-702: no duplicate ca01 Task after the repeat Start');

select * from finish();
rollback;
