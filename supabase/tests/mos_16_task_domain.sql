-- Task domain ratification checks: canonical Team column/ledger posture and DB-managed completion
-- clock. The Team rehome preserves existing completion timestamps; the seven-day selector treats
-- a NULL completion timestamp as stale.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select has_column('mos', 'tasks', 'team_id',
  'Task ownership uses the canonical nullable team_id column from the squashed baseline');
select has_column('mos', 'tasks', 'completed_at',
  'Task completion clock is present');
select ok(not (select attnotnull from pg_attribute
                where attrelid = 'mos.tasks'::regclass and attname = 'completed_at'),
  'completed_at remains nullable so legacy Done rows can retain an honest unknown date');
select has_table('mos', 'task_team_rehome_ledger',
  'Team rehome produces an auditable owner-resolution ledger');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'task_team_rehome_ledger'),
  'the rehome ledger is RLS-enabled and forced');
select ok(not has_table_privilege('authenticated', 'mos.task_team_rehome_ledger', 'SELECT'),
  'the maintenance ledger is not exposed as a new authenticated cross-person read surface');

-- ── DB-bound rehome classifier + safe rollback proof ─────────────────────────────────────────
-- OwnTeam and SiblingTeam are both active in Unit-1, so the ad-hoc row must remain unresolved;
-- the two occurrence rows carry direct process-run ownership and may auto-resolve. This exercises
-- the SQL migration itself rather than only the DB-free classifier mirror.
reset role;
-- Replay the Team-rehome migration and its DOWN against the earlier schema. Later migrations
-- must be undone before this DOWN: the current Process boundary intentionally forbids NULL Team
-- and divergent ownership. This transactional DDL is restored before the current contract cases;
-- mos_17_process_task_team_boundary.sql independently exercises that boundary while enabled.
alter table mos.tasks disable trigger tasks_process_run_team_guard;
select set_config('app.allow_test_seeds', 'on', true);
insert into mos.process_runs
  (id, org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date, definition_version, spec_snapshot, started_by)
values
  ('00000000-0000-0000-0000-00000000c901', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000005b01',
   '2026-09-09-a', 'Rehome proof A', date '2026-09-09', 1, '{}'::jsonb,
   '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-00000000c902', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-000000005b01',
   '2026-09-09-b', 'Rehome proof B', date '2026-09-09', 1, '{}'::jsonb,
   '00000000-0000-0000-0000-0000000000d1');
insert into mos.tasks
  (id, org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by, process_run_id)
values
  ('00000000-0000-0000-0000-00000000f701', '00000000-0000-0000-0000-0000000000a1', 'Ad hoc ambiguous',
   '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000f001',
   '00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000d1', null),
  ('00000000-0000-0000-0000-00000000f702', '00000000-0000-0000-0000-0000000000a1', 'Occurrence untouched',
   '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000f001',
   '00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-00000000c901'),
  ('00000000-0000-0000-0000-00000000f703', '00000000-0000-0000-0000-0000000000a1', 'Occurrence later edited',
   '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000f001',
   '00000000-0000-0000-0000-00000000f004', '00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-00000000c902');

select is((select auto_resolved from mos._rehome_task_teams('00000000-0000-0000-0000-00000000ba01')), 2,
  'the SQL rehome auto-resolves both run-backed Tasks');
select is((select unresolved from mos._rehome_task_teams('00000000-0000-0000-0000-00000000ba01')), 1,
  'the SQL rehome leaves the ad-hoc ambiguous Task unresolved');
select is((select team_id from mos.tasks where id = '00000000-0000-0000-0000-00000000f702'),
  '00000000-0000-0000-0000-000000005b01'::uuid,
  'a run-backed Task receives its process-run owning Team');
select is((select team_id from mos.tasks where id = '00000000-0000-0000-0000-00000000f701'), null,
  'an ad-hoc Task does not infer a Team from multiple current BU candidates');
select is((select resolution_method from mos.task_team_rehome_ledger
            where batch_id = '00000000-0000-0000-0000-00000000ba01' and task_id = '00000000-0000-0000-0000-00000000f702'),
  'via-run', 'the ledger records direct process-run evidence');
select is((select unresolved_reason from mos.task_team_rehome_ledger
            where batch_id = '00000000-0000-0000-0000-00000000ba01' and task_id = '00000000-0000-0000-0000-00000000f701'),
  'multiple-bu-candidates', 'the ledger records the ambiguous ad-hoc classifier reason');

update mos.tasks
   set team_id = '00000000-0000-0000-0000-000000005b02'
 where id = '00000000-0000-0000-0000-00000000f703';
create temporary table rollback_result as
select * from mos._rollback_task_team_rehome('00000000-0000-0000-0000-00000000ba01');
select is((select restored from rollback_result), 1,
  'safe rollback restores the untouched run-backed row');
select is((select skipped from rollback_result), 1,
  'safe rollback skips a row edited after the migration');
select is((select team_id from mos.tasks where id = '00000000-0000-0000-0000-00000000f702'), null,
  'safe rollback restores the untouched Task to its original NULL Team');
select is((select team_id from mos.tasks where id = '00000000-0000-0000-0000-00000000f703'),
  '00000000-0000-0000-0000-000000005b02'::uuid,
  'safe rollback preserves the later owner edit');
select ok(exists (select 1 from mos.task_team_rehome_ledger
                  where batch_id = '00000000-0000-0000-0000-00000000ba01'),
  'the ledger remains available for audit until the explicit DOWN cleanup');

alter table mos.tasks enable trigger tasks_process_run_team_guard;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select lives_ok($$
  insert into mos.tasks (id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('00000000-0000-0000-0000-00000000f601','Completion open',
          '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1')
$$, 'a new non-Done Task is accepted');
select is((select completed_at from mos.tasks where id = '00000000-0000-0000-0000-00000000f601'), null,
  'a non-Done Task has no completion timestamp');
select lives_ok($$
  update mos.tasks set status = 'Done' where id = '00000000-0000-0000-0000-00000000f601'
$$, 'entering Done is an ordinary authorized status transition');
select ok((select completed_at is not null from mos.tasks where id = '00000000-0000-0000-0000-00000000f601'),
  'the DB stamps completed_at when status enters Done');
select lives_ok($$
  update mos.tasks set completed_at = '2000-01-01T00:00:00Z' where id = '00000000-0000-0000-0000-00000000f601'
$$, 'a generic client update remains writable at the row-policy layer');
select ok((select completed_at > now() - interval '1 minute' from mos.tasks where id = '00000000-0000-0000-0000-00000000f601'),
  'the DB ignores a client-supplied historical completed_at');
select lives_ok($$
  update mos.tasks set status = 'In Progress' where id = '00000000-0000-0000-0000-00000000f601'
$$, 'leaving Done is an ordinary authorized status transition');
select is((select completed_at from mos.tasks where id = '00000000-0000-0000-0000-00000000f601'), null,
  'leaving Done clears the completion timestamp');
select lives_ok($$
  insert into mos.tasks (id, title, status, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('00000000-0000-0000-0000-00000000f602','Completion inserted Done','Done',
          '00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000d1')
$$, 'a new Done Task is accepted');
select ok((select completed_at is not null from mos.tasks where id = '00000000-0000-0000-0000-00000000f602'),
  'the DB stamps completed_at for a new Done Task too');

reset role;
select * from finish();
rollback;
