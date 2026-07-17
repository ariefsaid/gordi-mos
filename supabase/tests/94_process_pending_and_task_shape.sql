-- AC-606 (FR-606): an authorized human resolves a pending item by choosing a candidate → the Task
--   materializes and the item is marked resolved; a non-candidate is rejected; re-resolving is rejected.
-- AC-607 (FR-607): a materialized Task carries the owning Team's BU, the process A as Supervisor,
--   status Open, its provenance links, and due_date = scheduled_date + offset.
-- AC-608 (FR-608/OD-12): a def's checklist steps become the Task's checklist items — no extra Task.
-- Fixture: 20260716000015_mos_process_test_seed.sql. Starter = Boss (…f004) acting as admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';

select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', current_date);

-- AC-606 (non-candidate rejected): Boss (…f004) is a valid org person but NOT a candidate for the twin
-- def (d003), so choosing them for a reason='multiple' item is rejected (P0003) — before resolution.
select throws_ok($$
  select mos.resolve_pending_task(
    (select id from mos.process_run_pending_tasks where task_def_id='00000000-0000-0000-0000-00000000d003'),
    '00000000-0000-0000-0000-00000000f004')
$$, 'P0003', null, 'AC-606: choosing a non-candidate for an ambiguous item is rejected');

-- AC-606 (resolve): choosing candidate Twin A (…f002) materializes the Task.
select lives_ok($$
  select mos.resolve_pending_task(
    (select id from mos.process_run_pending_tasks where task_def_id='00000000-0000-0000-0000-00000000d003' and resolved_at is null),
    '00000000-0000-0000-0000-00000000f002')
$$, 'AC-606: resolving with a candidate materializes the Task');

select is((select t.responsible_person_id from mos.tasks t
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d003'),
          '00000000-0000-0000-0000-00000000f002'::uuid,
          'AC-606: the materialized Task is PIC''d to the chosen candidate');
select ok((select t.process_run_id is not null from mos.tasks t
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d003'),
          'AC-606: the materialized Task links to the Process Run');
select ok((select resolved_at is not null and materialized_task_id is not null
             from mos.process_run_pending_tasks where task_def_id='00000000-0000-0000-0000-00000000d003'),
          'AC-606: the pending item is marked resolved with its materialized Task');

-- AC-606 (re-resolve rejected): the same item cannot be resolved twice.
select throws_ok($$
  select mos.resolve_pending_task(
    (select id from mos.process_run_pending_tasks where task_def_id='00000000-0000-0000-0000-00000000d003'),
    '00000000-0000-0000-0000-00000000f002')
$$, 'P0003', null, 'AC-606: re-resolving an already-resolved item is rejected');

-- AC-607: the single-holder Task (d001) shape.
select is((select t.business_unit_id from mos.tasks t where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          '00000000-0000-0000-0000-0000000000a2'::uuid, 'AC-607: generated Task BU = owning Team''s BU (Unit-1)');
select is((select t.accountable_person_id from mos.tasks t where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          '00000000-0000-0000-0000-00000000f004'::uuid, 'AC-607: generated Task Supervisor = process A (Boss)');
select is((select t.status from mos.tasks t where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          'Open', 'AC-607: generated Task status = Open');
select ok((select t.process_run_id is not null from mos.tasks t where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          'AC-607: generated Task links to its Process Run');
select is((select t.due_date from mos.tasks t where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          current_date, 'AC-607: generated Task due_date = scheduled_date + offset (0)');

-- AC-608: the def's checklist steps become the Task's checklist items — and no extra Task was created.
select is((select count(*)::int from mos.task_checklist_items ci
             join mos.tasks t on t.id = ci.task_id
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          2, 'AC-608: the two checklist steps materialize as the Task''s checklist items');
select is((select count(*)::int from mos.tasks t where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          1, 'AC-608: checklist steps stay inside one Task — no extra Task spawned');

select * from finish();
rollback;
