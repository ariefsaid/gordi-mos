-- Process-run close authority, lifecycle, and cancellation audit.
--
-- Team-lead authorization is intentionally not asserted here until the owner chooses the existing
-- Team-specific identity for `mos.is_team_lead` (#767). These tests cover the unambiguous actors:
-- the run starter, ops_lead, and admin. A same-Team non-starter must not inherit the start gate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

-- A service-created/legacy run can have no starter. Ordinary members must not inherit authority
-- from SQL NULL semantics: NULL is never an admitting actor.
reset role;
insert into mos.process_runs
  (id, org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
   definition_version, spec_snapshot, started_by)
values
  ('00000000-0000-0000-0000-00000000a018',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c001',
   '00000000-0000-0000-0000-000000005b01',
   '2026-03-09', 'Null starter control', date '2026-03-09', 1, '{}'::jsonb, null);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f002","access_roles":["member"]}';
select throws_ok($$
  select mos.complete_process_run('00000000-0000-0000-0000-00000000a018')
$$, '42501', null, 'an ordinary member cannot close a run with no starter');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';

-- Starter completion is admitted and stamped server-side.
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', date '2026-03-10');
select is(
  (select status from mos.complete_process_run(
    (select id from mos.process_runs where period_key = '2026-03-10'))),
  'completed', 'the run starter can complete an open run');
select is(
  (select completed_by from mos.process_runs where period_key = '2026-03-10'),
  '00000000-0000-0000-0000-00000000f001'::uuid,
  'completion records the authenticated person, not a client-supplied actor');
select ok(
  (select completed_at is not null from mos.process_runs where period_key = '2026-03-10'),
  'completion records a server timestamp');

-- A same-Team member can start, but cannot complete another person''s run.
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', date '2026-03-11');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f002","access_roles":["member"]}';
select throws_ok($$
  select mos.complete_process_run((select id from mos.process_runs where period_key = '2026-03-11'))
$$, '42501', null, 'a same-Team non-starter cannot complete the run');
select is(
  (select status from mos.process_runs where period_key = '2026-03-11'),
  'open', 'a denied completion leaves the run open');

-- The operational lead and admin paths are organization-wide role gates.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f002","access_roles":["ops_lead"]}';
select is(
  (select status from mos.complete_process_run((select id from mos.process_runs where period_key = '2026-03-11'))),
  'completed', 'ops_lead can complete an open run');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', date '2026-03-12');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f002","access_roles":["admin"]}';
select is(
  (select status from mos.complete_process_run((select id from mos.process_runs where period_key = '2026-03-12'))),
  'completed', 'admin can complete an open run');
select throws_ok($$
  select mos.complete_process_run((select id from mos.process_runs where period_key = '2026-03-10'))
$$, 'P0003', null, 'a completed run cannot be completed again');

-- Cancellation records an actor, time, and required reason, and leaves generated Tasks alone.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', date '2026-03-13');
select is(
  (select count(*)::int from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-03-13'),
  1, 'the open run has one generated Task before cancellation');
select is(
  (select status from mos.cancel_process_run(
    (select id from mos.process_runs where period_key = '2026-03-13'),
    'The opening was merged into the public event.')),
  'cancelled', 'the run starter can cancel with a reason');
select is(
  (select cancelled_by from mos.process_runs where period_key = '2026-03-13'),
  '00000000-0000-0000-0000-00000000f001'::uuid,
  'cancellation records the authenticated person');
select ok(
  (select cancelled_at is not null from mos.process_runs where period_key = '2026-03-13'),
  'cancellation records a server timestamp');
select is(
  (select cancel_reason from mos.process_runs where period_key = '2026-03-13'),
  'The opening was merged into the public event.',
  'cancellation stores the trimmed reason');
select is(
  (select count(*)::int from mos.tasks t join mos.process_runs r on r.id = t.process_run_id
    where r.period_key = '2026-03-13'),
  1, 'cancellation leaves generated Tasks unchanged');

select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', date '2026-03-14');
select throws_ok($$
  select mos.cancel_process_run((select id from mos.process_runs where period_key = '2026-03-14'), '   ')
$$, 'P0003', 'cancellation reason is required', 'a blank cancellation reason is refused');
select throws_ok($$
  select mos.cancel_process_run((select id from mos.process_runs where period_key = '2026-03-14'), null::text)
$$, 'P0003', 'cancellation reason is required', 'a null cancellation reason is refused');
select throws_ok($$
  select mos.cancel_process_run((select id from mos.process_runs where period_key = '2026-03-10'), 'too late')
$$, 'P0003', null, 'a completed run cannot be cancelled');

-- Same-Team non-starters remain denied for cancellation; role gates may cancel.
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', date '2026-03-15');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f002","access_roles":["member"]}';
select throws_ok($$
  select mos.cancel_process_run((select id from mos.process_runs where period_key = '2026-03-15'), 'not my run')
$$, '42501', null, 'a same-Team non-starter cannot cancel the run');
select is(
  (select status from mos.process_runs where period_key = '2026-03-15'),
  'open', 'a denied cancellation leaves the run open');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', date '2026-03-16');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f002","access_roles":["ops_lead"]}';
select is(
  (select status from mos.cancel_process_run(
    (select id from mos.process_runs where period_key = '2026-03-16'), 'Ops stopped this occurrence.')),
  'cancelled', 'ops_lead can cancel an open run');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';
select mos.spawn_process_run('00000000-0000-0000-0000-00000000c001',
                             '00000000-0000-0000-0000-000000005b01', date '2026-03-17');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f002","access_roles":["admin"]}';
select is(
  (select status from mos.cancel_process_run(
    (select id from mos.process_runs where period_key = '2026-03-17'), 'Admin stopped this occurrence.')),
  'cancelled', 'admin can cancel an open run');

-- Foreign-org rows remain indistinguishable from inaccessible data at the close seam.
reset role;
select ok(
  (select not convalidated
     from pg_constraint c
     join pg_class r on r.oid = c.conrelid
     join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'mos'
      and r.relname = 'process_runs'
      and c.conname = 'process_runs_cancelled_audit_check'),
  'the cancellation audit check stays NOT VALID so unknown legacy cancellations are preserved');
select throws_ok($$
  insert into mos.process_runs
    (id, org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date,
     status, definition_version, spec_snapshot)
  values
    ('00000000-0000-0000-0000-00000000a019',
     '00000000-0000-0000-0000-0000000000a1',
     '00000000-0000-0000-0000-00000000c001',
     '00000000-0000-0000-0000-000000005b01',
     '2026-03-18', 'Invalid cancelled control', date '2026-03-18',
     'cancelled', 1, '{}'::jsonb)
$$, '23514', null, 'new cancelled rows still require complete cancellation audit');
select mos._test_seed_rows();
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000f001","access_roles":["member"]}';
select throws_ok($$
  select mos.complete_process_run('00000000-0000-0000-0000-000000071007')
$$, 'P0002', 'run not found', 'a run in another org has the same close result as a missing run');
select throws_ok($$
  select mos.cancel_process_run('00000000-0000-0000-0000-000000071007', 'cross-org probe')
$$, 'P0002', 'run not found', 'a run in another org has the same cancel result as a missing run');
select throws_ok($$
  select mos.complete_process_run('00000000-0000-0000-0000-00000000ffff')
$$, 'P0002', 'run not found', 'a nonexistent run cannot be completed');
select throws_ok($$
  select mos.cancel_process_run('00000000-0000-0000-0000-00000000ffff', 'missing probe')
$$, 'P0002', 'run not found', 'a nonexistent run cannot be cancelled');

select * from finish();
rollback;
