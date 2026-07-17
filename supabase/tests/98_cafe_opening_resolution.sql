-- AC-703 (FR-705/OD-41): the ambiguous "Brew station handover" barista def (ca03, 2 holders) spawns
-- NO Task and a pending 'multiple' human-choice row; resolving it materializes the Task under the
-- same run. Fixture: 20260717000004_mos_cafe_opening_test_seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_cafe_opening();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';

select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', current_date);

-- No Task exists for ca03 (the ambiguous barista step).
select is((select count(*)::int from mos.tasks
             where generated_from_task_def_id='00000000-0000-0000-0000-00000000ca03'),
          0, 'AC-703: the ambiguous ca03 def creates no Task at spawn');

-- A pending row (reason=multiple) lists both twin candidates.
select is((select p.reason from mos.process_run_pending_tasks p
             where p.task_def_id='00000000-0000-0000-0000-00000000ca03'),
          'multiple', 'AC-703: a pending row with reason=multiple exists for ca03');
select ok((select candidate_person_ids @> array['00000000-0000-0000-0000-00000000f002',
                                                 '00000000-0000-0000-0000-00000000f003']::uuid[]
             from mos.process_run_pending_tasks
             where task_def_id='00000000-0000-0000-0000-00000000ca03'),
          'AC-703: the pending row lists both twin candidates (f002, f003)');

-- Resolve it to Twin A (f002): a lives_ok call, then a materialized Task under the same run.
select lives_ok($$
  select mos.resolve_pending_task(
    (select id from mos.process_run_pending_tasks where task_def_id='00000000-0000-0000-0000-00000000ca03' and resolved_at is null),
    '00000000-0000-0000-0000-00000000f002')
$$, 'AC-703: resolve_pending_task succeeds for the ca03 pending item');

select is((select responsible_person_id from mos.tasks
             where generated_from_task_def_id='00000000-0000-0000-0000-00000000ca03'),
          '00000000-0000-0000-0000-00000000f002'::uuid,
          'AC-703: the materialized ca03 Task is PIC''d to the chosen candidate (Twin A)');
select ok((select resolved_at is not null and materialized_task_id is not null
             from mos.process_run_pending_tasks
             where task_def_id='00000000-0000-0000-0000-00000000ca03'),
          'AC-703: the pending row is marked resolved with its materialized_task_id set');

select * from finish();
rollback;
