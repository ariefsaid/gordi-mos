-- shared — the record_history mechanism (#983, ADR-0059): append-only grant posture, the
-- server-captured actor, the per-column diff shape, the inert-until-registered DELETE branch,
-- and the write/read registry drift guard. Per-record READ gating against the wired tables is
-- mos_24_objective_worklines_history's file.
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

select shared._test_seed_directory();

-- Fixed keys for the two records this file drives, in org A (...0a1) from the directory fixture.
-- No JWT claims are set on this connection yet: every write below is a service/seed write until
-- a persona is set explicitly, which is exactly what AC-005 asserts.

-- ── schema posture ───────────────────────────────────────────────────────────────────────────
select has_table('shared', 'record_history', 'the one history table exists');
select has_column('shared', 'record_history', 'record_key', 'the source key rides a text column (DA-1)');
select has_column('shared', 'record_history', 'actor_person_id', 'history carries a server-captured actor');
select has_column('shared', 'record_history', 'old_row_snapshot', 'delete rows carry the whole pre-delete row');
select has_column('shared', 'record_history', 'occurred_at', 'history carries when');
select is((select c.relrowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'shared' and c.relname = 'record_history'),
  true, 'RLS is enabled on the history table');
select is((select c.relforcerowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'shared' and c.relname = 'record_history'),
  true, 'RLS is forced on the history table — even the owner answers the one SELECT policy');
select has_index('shared', 'record_history', 'record_history_record_idx',
  'the per-record read path is indexed');

-- ── AC-001: an INSERT appends exactly one summary row ────────────────────────────────────────
insert into mos.objectives (id, org_id, name)
values ('00000000-0000-0000-0000-000000009901', '00000000-0000-0000-0000-0000000000a1', 'Alpha Objective');

select is((select count(*)::int from shared.record_history
           where schema_name = 'mos' and table_name = 'objectives'
             and record_key = '00000000-0000-0000-0000-000000009901'),
  1, 'FR-001: an INSERT appends exactly one history row — no per-field rows');
select is((select action from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'),
  'insert', 'the row is an insert summary');
select is((select field_name from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'),
  null, 'an insert row names no field');
select is((select org_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'),
  '00000000-0000-0000-0000-0000000000a1', 'the history row carries the record''s own org (NFR-001)');

-- ── AC-002: one UPDATE changing two columns appends exactly two rows ─────────────────────────
update mos.objectives set name = 'Beta', period_year = 2027
where id = '00000000-0000-0000-0000-000000009901';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'),
  3, 'FR-002: a two-column UPDATE appends exactly two rows (insert + 2)');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901' and field_name = 'name'),
  'Alpha Objective', 'the changed field records the old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'
             and field_name = 'name' and old_value = 'Alpha Objective'),
  'Beta', 'the changed field records the new value');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901' and field_name = 'period_year'),
  null, 'a column set from NULL records a NULL old value');
select is((select new_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901' and field_name = 'period_year'),
  '2027', 'the new value is text-cast from the source column');

-- ── AC-003: a no-op write appends nothing ────────────────────────────────────────────────────
update mos.objectives set name = 'Beta'
where id = '00000000-0000-0000-0000-000000009901';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'),
  3, 'FR-003: an UPDATE that changes no column appends no row');

-- ── AC-005: a service/seed write succeeds and carries no actor ───────────────────────────────
select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'
             and actor_person_id is not null),
  0, 'FR-005: a no-claim write records actor_person_id IS NULL and still succeeds');

-- ── the DELETE branch (present but inert in Slice 1: no authenticated role can reach it) ────
insert into mos.objectives (id, org_id, name)
values ('00000000-0000-0000-0000-000000009903', '00000000-0000-0000-0000-0000000000a1', 'Doomed Objective');
delete from mos.objectives where id = '00000000-0000-0000-0000-000000009903';

select is((select count(*)::int from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009903' and action = 'delete'),
  1, 'FR-011: a hard DELETE appends exactly one delete row');
select is((select (field_name is null and old_value is null and new_value is null
                   and old_row_snapshot is not null)
             from shared.record_history
            where record_key = '00000000-0000-0000-0000-000000009903' and action = 'delete'),
  true, 'the delete row names no field and carries the whole-row snapshot');
select is((select old_row_snapshot ->> 'name' from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009903' and action = 'delete'),
  'Doomed Objective', 'the snapshot round-trips a non-key column');

-- ── AC-004: the actor is the session claim, unspoofable by field values ──────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
update mos.objectives set name = '00000000-0000-0000-0000-0000000000d1'
where id = '00000000-0000-0000-0000-000000009901';

select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'
             and field_name = 'name' and new_value = '00000000-0000-0000-0000-0000000000d1'),
  '00000000-0000-0000-0000-0000000000d3',
  'FR-004: the actor is the writing session''s person claim, never a row value');
select is((select old_value from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009901'
             and field_name = 'name' and new_value = '00000000-0000-0000-0000-0000000000d1'),
  'Beta', 'the person-id-shaped value rode the changed field, not the actor column');

-- ── authenticated CREATE and ARCHIVE (the seed path alone is not the contract) ───────────────
insert into mos.objectives (id, org_id, name)
values ('00000000-0000-0000-0000-000000009904', '00000000-0000-0000-0000-0000000000a1', 'Made By Admin');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904' and action = 'insert'),
  '00000000-0000-0000-0000-0000000000d3',
  'an authenticated CREATE stamps the session''s person claim as the actor');
insert into mos.work_lines (id, org_id, name, type, objective_id)
values ('00000000-0000-0000-0000-000000009908', '00000000-0000-0000-0000-0000000000a1', 'Made By Admin Line', 'project',
        '00000000-0000-0000-0000-000000009901');
select is((select actor_person_id::text from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908' and action = 'insert'),
  '00000000-0000-0000-0000-0000000000d3',
  'an authenticated Project/Process CREATE stamps the same claim');
update mos.objectives set archived_at = now()
where id = '00000000-0000-0000-0000-000000009904';
select is((select (old_value is null and new_value is not null) from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009904' and field_name = 'archived_at'),
  true, 'archiving an Objective appends one archived_at row, null → timestamp');
update mos.work_lines set archived_at = now()
where id = '00000000-0000-0000-0000-000000009908';
select is((select (old_value is null and new_value is not null) from shared.record_history
           where record_key = '00000000-0000-0000-0000-000000009908' and field_name = 'archived_at'),
  true, 'archiving a Project/Process appends the same archived_at row');

-- ── FR-006/NFR-003: append-only by grant shape — no role writes history directly ─────────────
select throws_ok($$
  insert into shared.record_history (org_id, schema_name, table_name, record_key, action)
  values ('00000000-0000-0000-0000-0000000000a1', 'mos', 'objectives',
          '00000000-0000-0000-0000-000000009901', 'insert')
$$, '42501', null, 'no authenticated role can INSERT history directly — the trigger is the only writer');

select is((select count(*)::int from (
             select x.grantee, x.privilege_type
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
             cross join lateral aclexplode(c.relacl) as x
            where n.nspname = 'shared' and c.relname = 'record_history'
              and x.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
              and x.grantee <> c.relowner) w),
  0, 'NFR-003: no write grant exists for any role but the owner the definer trigger writes as');
select is((select count(*)::int from pg_policies
           where schemaname = 'shared' and tablename = 'record_history'),
  1, 'exactly one policy exists on the history table');
select is((select cmd from pg_policies
           where schemaname = 'shared' and tablename = 'record_history'),
  'SELECT', 'the one policy is a SELECT policy');

-- ── AC-006: every access role is refused UPDATE and DELETE on history, admin included ────────
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'member cannot update history');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'member cannot delete history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["team_lead"]}';
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'team_lead cannot update history');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'team_lead cannot delete history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["bu_head"]}';
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'bu_head cannot update history');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'bu_head cannot delete history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead"]}';
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'ops_lead cannot update history');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'ops_lead cannot delete history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'admin cannot update history — history is evidence against its own admins');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'admin cannot delete history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}';
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'finance cannot update history');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'finance cannot delete history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["manager"]}';
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'manager cannot update history');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'manager cannot delete history');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["supervisor"]}';
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'supervisor cannot update history');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'supervisor cannot delete history');
set local role anon;
select throws_ok($$ update shared.record_history set old_value = 'forged'
                    where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'anon cannot update history');
select throws_ok($$ delete from shared.record_history
                   where record_key = '00000000-0000-0000-0000-000000009901' $$,
  '42501', null, 'anon cannot delete history');

-- ── AC-009: the write registry (triggers) and the read registry (dispatch arms) agree ────────
set local role authenticated;
select set_eq(
  $$ select n2.nspname || '.' || c2.relname
       from pg_trigger t
       join pg_proc p  on p.oid = t.tgfoid
       join pg_namespace pn on pn.oid = p.pronamespace
       join pg_class c2 on c2.oid = t.tgrelid
       join pg_namespace n2 on n2.oid = c2.relnamespace
      where pn.nspname = 'shared' and p.proname = '_record_history_write'
        and not t.tgisinternal
       union all
       values ('mos.tasks'), ('mos.task_checklist_items'), ('mos.process_cadences'), ('mos.process_task_defs'), ('mos.process_runs'), ('mos.process_run_pending_tasks'), ('mos.signals'), ('mos.signal_mentions'), ('mos.signal_acknowledgements'), ('mos.signal_tasks'), ('mos.weekly_updates'), ('mos.weekly_update_items'), ('mos.events'), ('mos.follow_ups'), ('mos.budgets'), ('mos.budget_lines'), ('mos.certified_metrics'), ('reporting.supervisor_revenue_scope') $$,
  $$ select (arms.x)[1] || '.' || (arms.x)[2]
       from (select regexp_matches(
                     pg_get_functiondef('shared.can_read_history_record(text,text,text,text,jsonb)'::regprocedure),
                     $r$p_schema = '([a-z_]+)'\s+and p_table = '([a-z_]+)'$r$, 'g') as x) arms $$,
  'AC-009: every trigger-wired table is registered for reads, and the only extra arms are the earlier batches'' restated ones (the renumbered stack applies all batch migrations in order on a fresh database)');

select * from finish();
rollback;
