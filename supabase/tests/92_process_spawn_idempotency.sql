-- AC-602 (FR-602/NFR-602): spawn is idempotent — a repeat Start of the same (process, team, period)
-- returns the existing run and generates no duplicate Tasks.
-- AC-603 (FR-603/FR-613): a later definition edit never alters a spawned run's snapshot or its Tasks.
-- Fixture: 20260716000015_mos_process_test_seed.sql. Starter = Boss (…f004) acting as admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';

-- First Start: 1 single-holder Task (Solo/d001), 2 ambiguous defs deferred to pending (d002 vacant, d003 twin).
select is((mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                                 '00000000-0000-0000-0000-000000005b01', current_date)->>'created')::int,
          1, 'AC-602: first spawn creates exactly one Task (the single-holder def)');
select is((select (spec_snapshot->>'process_name') from mos.process_runs
             where work_line_id='00000000-0000-0000-0000-00000000c001'
               and owning_team_id='00000000-0000-0000-0000-000000005b01'),
          'Café Opening', 'AC-603: run snapshot captured the process name at spawn');

-- Exactly one run for the occurrence key, and exactly one materialized Task on it.
select is((select count(*)::int from mos.process_runs
             where work_line_id='00000000-0000-0000-0000-00000000c001'
               and owning_team_id='00000000-0000-0000-0000-000000005b01'),
          1, 'AC-602: exactly one process_runs row after the first Start');
select is((select count(*)::int from mos.tasks t
             join mos.process_runs r on r.id = t.process_run_id
             where r.work_line_id='00000000-0000-0000-0000-00000000c001'
               and r.owning_team_id='00000000-0000-0000-0000-000000005b01'),
          1, 'AC-602: exactly one generated Task after the first Start');

-- Second Start of the same occurrence: idempotent, generates nothing.
select is((mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                                 '00000000-0000-0000-0000-000000005b01', current_date)->>'idempotent')::boolean,
          true, 'AC-602: a repeat Start of the same occurrence is idempotent');
select is((select count(*)::int from mos.process_runs
             where work_line_id='00000000-0000-0000-0000-00000000c001'
               and owning_team_id='00000000-0000-0000-0000-000000005b01'),
          1, 'AC-602: still exactly one process_runs row after the repeat Start');
select is((select count(*)::int from mos.tasks t
             join mos.process_runs r on r.id = t.process_run_id
             where r.work_line_id='00000000-0000-0000-0000-00000000c001'
               and r.owning_team_id='00000000-0000-0000-0000-000000005b01'),
          1, 'AC-602: no duplicate Tasks after the repeat Start');

-- AC-603: edit the definition AFTER spawn (as postgres → bypass authoring RLS), then prove history is frozen.
reset role;
update mos.process_task_defs set title='CHANGED' where id='00000000-0000-0000-0000-00000000d001';

select is((select r.spec_snapshot->'task_defs'->0->>'title' from mos.process_runs r
             where r.work_line_id='00000000-0000-0000-0000-00000000c001'
               and r.owning_team_id='00000000-0000-0000-0000-000000005b01'),
          'Open the café', 'AC-603: the run snapshot title is unchanged by a later definition edit');
select is((select t.title from mos.tasks t
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          'Open the café', 'AC-603: the generated Task title is unchanged by a later definition edit');

select * from finish();
rollback;
