-- shared — the change-history read registry (#983 DA-3): shared.record_history_readers is the
-- ONE place a table's history read rule is named. No row = unreadable, a reader answering NULL
-- or false = unreadable, a reader answering true = readable, and no application role can write
-- the registry. Per-table reader behaviour lives in each batch's own file (mos_24/25/27/28,
-- shared_18, ops_19); this file is the mechanism's contract.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select shared._test_seed_directory();

-- ── shape ────────────────────────────────────────────────────────────────────────────────────
select has_table('shared', 'record_history_readers', 'the registry table exists');
select col_is_pk('shared', 'record_history_readers', ARRAY['schema_name', 'table_name'],
  'one reader per (schema, table)');
select col_type_is('shared', 'record_history_readers', 'reader', 'regprocedure',
  'the reader is a regprocedure — a dangling function name cannot be registered');
select is((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'shared' and c.relname = 'record_history_readers'),
  true, 'RLS is enabled and forced on the registry');

-- ── nobody but a migration writes it ─────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok(
  $$ insert into shared.record_history_readers (schema_name, table_name, reader)
     values ('mos', 'forged', 'shared.can_read_history_record(text,text,text,text,jsonb)'::regprocedure) $$,
  '42501', null, 'an authenticated admin cannot register a reader');
select throws_ok(
  $$ update shared.record_history_readers set table_name = 'forged' $$,
  '42501', null, 'an authenticated admin cannot repoint a registry row');
select throws_ok(
  $$ delete from shared.record_history_readers $$,
  '42501', null, 'an authenticated admin cannot delete a registry row (which would blind the history)');
select cmp_ok((select count(*)::int from shared.record_history_readers), '>=', 2,
  'authenticated can read the registry (the invoker dispatch needs it)');
reset role;
set local role anon;
select is(has_table_privilege('anon', 'shared.record_history_readers', 'select'), false,
  'anon cannot even read the registry');
reset role;

-- ── the dispatch: no row, NULL, false, true ──────────────────────────────────────────────────
-- Three stub readers and three history rows for stub tables that exist nowhere else. The rows
-- are written as the owner (service write), then read as an org-A member.
create function public._t_reader_null(text, text, jsonb) returns boolean
  language sql stable set search_path = '' as $$ select null::boolean $$;
create function public._t_reader_false(text, text, jsonb) returns boolean
  language sql stable set search_path = '' as $$ select false $$;
create function public._t_reader_true(text, text, jsonb) returns boolean
  language sql stable set search_path = '' as $$ select true $$;
insert into shared.record_history_readers (schema_name, table_name, reader) values
  ('mos', 'stub_null',  'public._t_reader_null(text,text,jsonb)'::regprocedure),
  ('mos', 'stub_false', 'public._t_reader_false(text,text,jsonb)'::regprocedure),
  ('mos', 'stub_true',  'public._t_reader_true(text,text,jsonb)'::regprocedure);
insert into shared.record_history (org_id, schema_name, table_name, record_key, action) values
  ('00000000-0000-0000-0000-0000000000a1', 'mos', 'stub_unregistered', 'k1', 'insert'),
  ('00000000-0000-0000-0000-0000000000a1', 'mos', 'stub_null',         'k1', 'insert'),
  ('00000000-0000-0000-0000-0000000000a1', 'mos', 'stub_false',        'k1', 'insert'),
  ('00000000-0000-0000-0000-0000000000a1', 'mos', 'stub_true',         'k1', 'insert');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history where table_name = 'stub_unregistered'),
  0, 'an unregistered table''s history is unreadable, even for an admin (fail closed)');
select is((select count(*)::int from shared.record_history where table_name = 'stub_null'),
  0, 'a reader answering NULL is a denial');
select is((select count(*)::int from shared.record_history where table_name = 'stub_false'),
  0, 'a reader answering false is a denial');
select is((select count(*)::int from shared.record_history where table_name = 'stub_true'),
  1, 'a reader answering true is what makes the row readable — the registry row is the rule');

-- The dispatch hands the reader the row's own key, action and snapshot, unmodified.
reset role;
create function public._t_reader_echo(p_key text, p_action text, p_snap jsonb) returns boolean
  language sql stable set search_path = '' as
  $$ select p_key = 'k-echo' and p_action = 'insert' and p_snap is null $$;
insert into shared.record_history_readers (schema_name, table_name, reader)
values ('mos', 'stub_echo', 'public._t_reader_echo(text,text,jsonb)'::regprocedure);
insert into shared.record_history (org_id, schema_name, table_name, record_key, action)
values ('00000000-0000-0000-0000-0000000000a1', 'mos', 'stub_echo', 'k-echo', 'insert'),
       ('00000000-0000-0000-0000-0000000000a1', 'mos', 'stub_echo', 'k-other', 'insert');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select array_agg(record_key order by record_key) from shared.record_history where table_name = 'stub_echo'),
  ARRAY['k-echo'], 'the reader receives (record_key, action, snapshot) exactly as stored');

-- ── de-registering a table blinds its history at once ────────────────────────────────────────
reset role;
insert into mos.objectives (id, org_id, name)
values ('00000000-0000-0000-0000-000000009922', '00000000-0000-0000-0000-0000000000a1', 'Registry Objective');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where table_name = 'objectives' and record_key = '00000000-0000-0000-0000-000000009922'),
  1, 'a registered table''s history is readable by a member of its org');
reset role;
delete from shared.record_history_readers where schema_name = 'mos' and table_name = 'objectives';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';
select is((select count(*)::int from shared.record_history
           where table_name = 'objectives' and record_key = '00000000-0000-0000-0000-000000009922'),
  0, 'with its registry row gone, the same history is unreadable — no code change, no fallback');

-- ── the dispatch keeps its signature and stays invoker ───────────────────────────────────────
reset role;
select is((select p.prosecdef from pg_proc p where p.oid = 'shared.can_read_history_record(text,text,text,text,jsonb)'::regprocedure),
  false, 'the dispatch is SECURITY INVOKER (the reader''s own RLS runs as the caller)');
select is((select coalesce(p.proconfig, '{}') from pg_proc p where p.oid = 'shared.can_read_history_record(text,text,text,text,jsonb)'::regprocedure),
  ARRAY['search_path=""'], 'the dispatch pins an empty search_path');

select * from finish();
rollback;
