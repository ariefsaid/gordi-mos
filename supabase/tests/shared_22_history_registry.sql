-- shared — the change-history read registry (#983 DA-3): shared.record_history_readers is the
-- ONE place a table's history read rule is named. No row = unreadable, a reader answering NULL
-- or false = unreadable, a reader answering true = readable, and no application role can write
-- the registry. Per-table reader behaviour lives in each batch's own file (mos_24/25/27/28,
-- shared_18, ops_19); this file is the mechanism's contract.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select shared._test_seed_directory();

-- ── shape ────────────────────────────────────────────────────────────────────────────────────
select has_table('shared', 'record_history_readers', 'the registry table exists');
select col_is_pk('shared', 'record_history_readers', ARRAY['schema_name', 'table_name'],
  'one reader per (schema, table)');
select col_type_is('shared', 'record_history_readers', 'reader', 'text',
  'the reader is the function''s schema-qualified signature as text (a reg* column would block pg_upgrade)');
select throws_ok(
  $$ insert into shared.record_history_readers (schema_name, table_name, reader)
     values ('mos', 'bogus', 'shared._history_reader_does_not_exist(text, text, jsonb)') $$,
  '23514', null, 'a reader that names no function cannot be registered');
select is_empty(
  $$ select n.nspname || '.' || c.relname || '.' || a.attname
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_type t on t.oid = a.atttypid
      where n.nspname in ('shared', 'mos', 'ops', 'reporting', 'integrations')
        and c.relkind in ('r', 'p', 'm')
        and a.attnum > 0 and not a.attisdropped
        and ltrim(t.typname, '_') ~ '^reg'
        and ltrim(t.typname, '_') not in ('regclass', 'regtype', 'regrole') $$,
  'no application table carries a reg* column other than regclass/regtype/regrole (pg_upgrade refuses them)');
select is((select c.relrowsecurity and c.relforcerowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'shared' and c.relname = 'record_history_readers'),
  true, 'RLS is enabled and forced on the registry');

-- ── nobody but a migration writes it ─────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok(
  $$ insert into shared.record_history_readers (schema_name, table_name, reader)
     values ('mos', 'forged', 'shared.can_read_history_record(text,text,text,text,jsonb)') $$,
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
  ('mos', 'stub_null',  'public._t_reader_null(text,text,jsonb)'),
  ('mos', 'stub_false', 'public._t_reader_false(text,text,jsonb)'),
  ('mos', 'stub_true',  'public._t_reader_true(text,text,jsonb)');
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
values ('mos', 'stub_echo', 'public._t_reader_echo(text,text,jsonb)');
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

-- ── a registered reader that no longer resolves fails closed ─────────────────────────────────
reset role;
create function public._t_reader_gone(text, text, jsonb) returns boolean
  language sql stable set search_path = '' as $$ select true $$;
insert into shared.record_history_readers (schema_name, table_name, reader)
values ('mos', 'stub_gone', 'public._t_reader_gone(text,text,jsonb)');
insert into shared.record_history (org_id, schema_name, table_name, record_key, action)
values ('00000000-0000-0000-0000-0000000000a1', 'mos', 'stub_gone', 'k1', 'insert');
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history where table_name = 'stub_gone'),
  1, 'a registered reader that resolves answers the read');
reset role;
drop function public._t_reader_gone(text, text, jsonb);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select is((select count(*)::int from shared.record_history where table_name = 'stub_gone'),
  0, 'once the named reader no longer resolves, the read denies instead of erroring');

-- ── the dispatch keeps its signature and stays invoker ───────────────────────────────────────
reset role;
select is((select p.prosecdef from pg_proc p where p.oid = 'shared.can_read_history_record(text,text,text,text,jsonb)'::regprocedure),
  false, 'the dispatch is SECURITY INVOKER (the reader''s own RLS runs as the caller)');
select is((select coalesce(p.proconfig, '{}') from pg_proc p where p.oid = 'shared.can_read_history_record(text,text,text,text,jsonb)'::regprocedure),
  ARRAY['search_path=""'], 'the dispatch pins an empty search_path');

select * from finish();
rollback;
