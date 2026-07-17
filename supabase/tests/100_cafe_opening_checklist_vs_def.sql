-- AC-705 (FR-706/FR-708/OD-12): single-operator opening steps materialize as ONE Task's checklist
-- items (never extra Tasks); an independently-owned step (production log) is its own separate Task;
-- the spawn writes zero ops.kitchen_logs facts (map, not merge — RATIFY-7B).
-- Fixture: 20260717000004_mos_cafe_opening_test_seed.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_cafe_opening();

-- Capture the pre-spawn ops.kitchen_logs row count (RLS-scoped read as admin below).
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';
select set_config('cafe.pre_spawn_kitchen_logs',
  (select count(*)::text from ops.kitchen_logs where org_id = '00000000-0000-0000-0000-0000000000a1'), true);

select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', current_date);

-- ca01 (Open the café floor) has exactly 4 checklist items and is the ONLY Task for those steps.
select is((select count(*)::int from mos.task_checklist_items ci
             join mos.tasks t on t.id = ci.task_id
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000ca01'),
          4, 'AC-705: the Open-the-café-floor Task carries exactly 4 checklist items');
select is((select count(*)::int from mos.tasks
             where generated_from_task_def_id='00000000-0000-0000-0000-00000000ca01'),
          1, 'AC-705: no extra Task was created for the 4 single-operator checklist steps');

-- ca02 (Log today's production) is a SEPARATE Task.
select is((select count(*)::int from mos.tasks
             where generated_from_task_def_id='00000000-0000-0000-0000-00000000ca02'),
          1, 'AC-705: Log today''s production is materialized as its own separate Task');
select isnt((select id from mos.tasks where generated_from_task_def_id='00000000-0000-0000-0000-00000000ca02'),
            (select id from mos.tasks where generated_from_task_def_id='00000000-0000-0000-0000-00000000ca01'),
          'AC-705: the production-log Task is NOT the same row as the checklist Task');

-- ops.kitchen_logs is untouched by the spawn — zero kitchen facts written (RATIFY-7B, FR-708).
select is((select count(*)::text from ops.kitchen_logs where org_id = '00000000-0000-0000-0000-0000000000a1'),
          current_setting('cafe.pre_spawn_kitchen_logs'),
          'AC-705: ops.kitchen_logs row count is unchanged by the opening spawn');

select * from finish();
rollback;
