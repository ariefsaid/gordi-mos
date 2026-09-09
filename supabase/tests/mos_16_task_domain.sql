-- Task domain ratification checks: canonical Team column/ledger posture and DB-managed completion
-- clock. Legacy Done rows with an unknown completion date are intentionally not backfilled by the
-- migration; the seven-day selector treats NULL as stale.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select shared._test_seed_directory();
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select ok(has_column('mos', 'tasks', 'team_id'),
  'Task ownership uses the canonical nullable team_id column from the squashed baseline');
select ok(has_column('mos', 'tasks', 'completed_at'),
  'Task completion clock is present');
select ok(not (select attnotnull from pg_attribute
                where attrelid = 'mos.tasks'::regclass and attname = 'completed_at'),
  'completed_at remains nullable so legacy Done rows can retain an honest unknown date');
select ok(has_table('mos', 'task_team_rehome_ledger'),
  'Team rehome produces an auditable owner-resolution ledger');
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'mos' and c.relname = 'task_team_rehome_ledger'),
  'the rehome ledger is RLS-enabled and forced');
select ok(not has_table_privilege('authenticated', 'mos.task_team_rehome_ledger', 'SELECT'),
  'the maintenance ledger is not exposed as a new authenticated cross-person read surface');

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
