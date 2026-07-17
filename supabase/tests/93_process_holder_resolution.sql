-- AC-604 (FR-604): a def whose job function has exactly one current holder materializes a Task with
--   that holder as PIC.
-- AC-605 (FR-605/OD-41): a def whose function has zero or many holders creates NO Task and a pending
--   human-choice row (reason none / multiple, candidates listed) — never a guess.
-- AC-612 (NFR-603/FR-614): a cross-org caller is rejected, and an out-of-org Role resolves no holder.
-- Fixture: 20260716000015_mos_process_test_seed.sql. Starter = Boss (…f004) acting as admin, org WU-A.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f004","access_roles":["admin"]}';

select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', current_date);

-- AC-604: the single-holder def (d001 → Opener held only by Solo …f001) materializes a Task PIC'd to Solo.
select is((select t.responsible_person_id from mos.tasks t
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d001'),
          '00000000-0000-0000-0000-00000000f001'::uuid,
          'AC-604: single-holder def materializes a Task with that holder as PIC');

-- AC-605 (zero holders): the vacant def (d002 → Vacant Station, no holders) creates NO Task + a pending 'none'.
select is((select count(*)::int from mos.tasks t
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d002'),
          0, 'AC-605: a vacant (0-holder) def creates no Task');
select is((select p.reason from mos.process_run_pending_tasks p
             where p.task_def_id='00000000-0000-0000-0000-00000000d002'),
          'none', 'AC-605: a vacant (0-holder) def records a pending row with reason=none');

-- AC-605 (many holders): the twin def (d003 → Twin Station held by …f002 + …f003) creates NO Task +
-- a pending 'multiple' whose candidate list holds both twins.
select is((select count(*)::int from mos.tasks t
             where t.generated_from_task_def_id='00000000-0000-0000-0000-00000000d003'),
          0, 'AC-605: an ambiguous (2-holder) def creates no Task');
select is((select p.reason from mos.process_run_pending_tasks p
             where p.task_def_id='00000000-0000-0000-0000-00000000d003'),
          'multiple', 'AC-605: an ambiguous (2-holder) def records a pending row with reason=multiple');
select ok((select p.candidate_person_ids @> array['00000000-0000-0000-0000-00000000f002',
                                                   '00000000-0000-0000-0000-00000000f003']::uuid[]
             from mos.process_run_pending_tasks p
             where p.task_def_id='00000000-0000-0000-0000-00000000d003'),
          'AC-605: the pending row lists both candidate holders');

-- AC-612 (cross-org): a caller whose org is WU-B cannot spawn an org WU-A process/team.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select throws_ok($$
  select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                               '00000000-0000-0000-0000-000000005b01', current_date)
$$, '42501', null, 'AC-612: a cross-org caller cannot start an org WU-A process (fails closed)');

-- AC-612 (org-walled resolver): the vacant Role resolves ZERO holders — the resolver never invents a PIC.
reset role;
select is((select count(*)::int from mos._function_holders(
             '00000000-0000-0000-0000-0000000000a1',
             '00000000-0000-0000-0000-00000000e003',
             '00000000-0000-0000-0000-000000005b01')),
          0, 'AC-612: an org-walled job function with no holder resolves zero (never a wrong person)');

select * from finish();
rollback;
