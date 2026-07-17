-- AC-601 (FR-601/NFR-601): the occurrence substrate exists with RLS enabled+forced on every new
-- business table, the run idempotency UNIQUE and the process_task_defs PIC-binding CHECK hold, the
-- tasks provenance columns exist, and no new table grants DELETE to authenticated.
-- Fixture: 20260716000015_mos_process_test_seed.sql (+ the signal + role trees it extends).
-- SECURITY LOW-3 (Step 6 fix wave): PUBLIC has no EXECUTE on the process helper functions —
--   they take an org/team/role uuid and are meant to be called from inside a policy/RPC as the
--   authenticated app role, not probed anonymously.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- LOW-3: the TEST-ONLY fixture refuses to run unless app.allow_test_seeds='on' (fail-closed in prod).
select throws_ok($$ select mos._test_seed_process_tree() $$, '42501', null,
  'AC-601: _test_seed_process_tree refuses to run without app.allow_test_seeds=on (fail-closed in prod)');

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_process_tree();

-- RLS enabled AND forced on every new business table (NFR-601).
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='process_cadences'),
  'AC-601: mos.process_cadences has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='process_task_defs'),
  'AC-601: mos.process_task_defs has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='process_runs'),
  'AC-601: mos.process_runs has RLS enabled and forced');
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace where n.nspname='mos' and c.relname='process_run_pending_tasks'),
  'AC-601: mos.process_run_pending_tasks has RLS enabled and forced');

-- Run idempotency UNIQUE(org_id, work_line_id, owning_team_id, period_key) (column-robust, not name-coupled).
select ok((select count(*) > 0 from pg_indexes
   where schemaname='mos' and tablename='process_runs'
     and indexdef ilike '%unique%'
     and indexdef ilike '%org_id%' and indexdef ilike '%work_line_id%'
     and indexdef ilike '%owning_team_id%' and indexdef ilike '%period_key%'),
  'AC-601: process_runs has the UNIQUE(org_id, work_line_id, owning_team_id, period_key) idempotency index');

-- PIC-binding CHECK: a def with BOTH pic columns NULL is rejected (23514). Run as postgres so only the
-- table CHECK fires (RLS bypassed) — isolates the constraint under test.
select throws_ok($$
  insert into mos.process_task_defs (org_id, work_line_id, title)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000c001','ownerless')
$$, '23514', null, 'AC-601: process_task_defs PIC-binding CHECK rejects a row with no PIC binding');

-- Tasks provenance columns exist (both nullable — shipped tasks unaffected).
select has_column('mos','tasks','process_run_id',             'AC-601: mos.tasks has process_run_id');
select has_column('mos','tasks','generated_from_task_def_id', 'AC-601: mos.tasks has generated_from_task_def_id');

-- No DELETE grant to authenticated on any new occurrence table (NFR-601 — soft states only).
select ok(not has_table_privilege('authenticated','mos.process_cadences','DELETE'),
  'AC-601: authenticated has no DELETE on mos.process_cadences');
select ok(not has_table_privilege('authenticated','mos.process_task_defs','DELETE'),
  'AC-601: authenticated has no DELETE on mos.process_task_defs');
select ok(not has_table_privilege('authenticated','mos.process_runs','DELETE'),
  'AC-601: authenticated has no DELETE on mos.process_runs');
select ok(not has_table_privilege('authenticated','mos.process_run_pending_tasks','DELETE'),
  'AC-601: authenticated has no DELETE on mos.process_run_pending_tasks');

-- SECURITY LOW-3: PUBLIC has no EXECUTE on the process helpers; authenticated does (the RLS
-- policies / RPCs that call them run as authenticated).
select ok(not has_function_privilege('public','mos._function_holders(uuid,uuid,uuid)','execute'),
  'LOW-3: PUBLIC has no EXECUTE on mos._function_holders');
select ok(has_function_privilege('authenticated','mos._function_holders(uuid,uuid,uuid)','execute'),
  'LOW-3: authenticated has EXECUTE on mos._function_holders');
select ok(not has_function_privilege('public','mos.can_start_process_for_team(uuid)','execute'),
  'LOW-3: PUBLIC has no EXECUTE on mos.can_start_process_for_team');
select ok(has_function_privilege('authenticated','mos.can_start_process_for_team(uuid)','execute'),
  'LOW-3: authenticated has EXECUTE on mos.can_start_process_for_team');
select ok(not has_function_privilege('public','mos.due_process_runs()','execute'),
  'LOW-3: PUBLIC has no EXECUTE on mos.due_process_runs');
select ok(has_function_privilege('authenticated','mos.due_process_runs()','execute'),
  'LOW-3: authenticated has EXECUTE on mos.due_process_runs');

select * from finish();
rollback;
