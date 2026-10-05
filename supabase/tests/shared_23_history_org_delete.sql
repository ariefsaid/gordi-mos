-- shared — deleting an org removes that org's history in the same statement (#1113). The writer
-- skips a row whose org is already gone (the cascade), so a tenant delete succeeds and leaves no
-- orphan; another org's history and the live-org DELETE snapshot are untouched; the append-only
-- grant posture still holds.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Two fresh orgs, each with history-registered children (an objective and a work line).
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-00000000c1a1', 'Cascade org X', 'cascade-x'),
  ('00000000-0000-0000-0000-00000000c1b1', 'Cascade org Y', 'cascade-y');
insert into shared.business_units (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000c1a2', '00000000-0000-0000-0000-00000000c1a1', 'X unit'),
  ('00000000-0000-0000-0000-00000000c1b2', '00000000-0000-0000-0000-00000000c1b1', 'Y unit');
insert into mos.objectives (id, org_id, name) values
  ('00000000-0000-0000-0000-00000000c1a3', '00000000-0000-0000-0000-00000000c1a1', 'X objective'),
  ('00000000-0000-0000-0000-00000000c1b3', '00000000-0000-0000-0000-00000000c1b1', 'Y objective');
insert into mos.work_lines (id, org_id, name, type, business_unit_id) values
  ('00000000-0000-0000-0000-00000000c1a4', '00000000-0000-0000-0000-00000000c1a1', 'X project', 'project', '00000000-0000-0000-0000-00000000c1a2'),
  ('00000000-0000-0000-0000-00000000c1b4', '00000000-0000-0000-0000-00000000c1b1', 'Y project', 'project', '00000000-0000-0000-0000-00000000c1b2');

select cmp_ok((select count(*)::int from shared.record_history where org_id = '00000000-0000-0000-0000-00000000c1a1'),
  '>=', 2, 'org X has history rows from its registered children');

-- A live-org hard delete still records its snapshot: the guard only skips a vanished org.
delete from mos.work_lines where id = '00000000-0000-0000-0000-00000000c1a4';
select is((select count(*)::int from shared.record_history
           where org_id = '00000000-0000-0000-0000-00000000c1a1' and table_name = 'work_lines' and action = 'delete'),
  1, 'a work-line delete under a live org records its delete snapshot');
insert into mos.work_lines (id, org_id, name, type, business_unit_id)
values ('00000000-0000-0000-0000-00000000c1a4', '00000000-0000-0000-0000-00000000c1a1', 'X project', 'project', '00000000-0000-0000-0000-00000000c1a2');

-- A live-org UPDATE records its change: the guard never skips an org that still exists.
update mos.objectives set name = 'X objective renamed' where id = '00000000-0000-0000-0000-00000000c1a3';
select is((select count(*)::int from shared.record_history
           where org_id = '00000000-0000-0000-0000-00000000c1a1' and table_name = 'objectives'
             and action = 'update' and field_name = 'name' and new_value = 'X objective renamed'),
  1, 'an objective update under a live org records its change');

-- The guard leans on one invariant: every history-wired table's org column has a foreign key to
-- shared.orgs, so a dangling org can never be written by a table the writer would skip. The
-- organisation table itself is the root and takes its org from its own id.
select is_empty(
  $$ select n.nspname || '.' || c.relname
       from pg_trigger t
       join pg_proc p  on p.oid = t.tgfoid
       join pg_namespace pn on pn.oid = p.pronamespace
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where pn.nspname = 'shared' and p.proname = '_record_history_write' and not t.tgisinternal
        and n.nspname || '.' || c.relname <> 'shared.orgs'
        and not exists (
          select 1 from pg_constraint k
            join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
           where k.contype = 'f' and k.conrelid = c.oid and k.confrelid = 'shared.orgs'::regclass
             and array_length(k.conkey, 1) = 1 and a.attname = 'org_id') $$,
  'every history-wired table (bar the organisation table) has a foreign key from org_id to shared.orgs');

create temp table y_before as
  select * from shared.record_history where org_id = '00000000-0000-0000-0000-00000000c1b1';

select lives_ok($$ delete from shared.orgs where id = '00000000-0000-0000-0000-00000000c1a1' $$,
  'deleting an org with history-registered children succeeds');
select is((select count(*)::int from shared.record_history where org_id = '00000000-0000-0000-0000-00000000c1a1'),
  0, 'the deleted org leaves no history rows');
select is((select count(*)::int from mos.work_lines where org_id = '00000000-0000-0000-0000-00000000c1a1')
        + (select count(*)::int from mos.objectives where org_id = '00000000-0000-0000-0000-00000000c1a1'),
  0, 'the deleted org leaves none of its audited records');
select is((select count(*)::int from shared.record_history where org_id = '00000000-0000-0000-0000-00000000c1b1'),
  (select count(*)::int from y_before), 'another org''s history row count is unchanged');
select is((select count(*)::int from (
    (select * from shared.record_history where org_id = '00000000-0000-0000-0000-00000000c1b1'
     except select * from y_before)
    union all
    (select * from y_before
     except select * from shared.record_history where org_id = '00000000-0000-0000-0000-00000000c1b1')) d),
  0, 'another org''s history rows are identical, field for field, to the ones it had before');

-- Append-only for every application role: the cascade is the only removal path.
select is((select count(*)::int from information_schema.role_table_grants
           where table_schema = 'shared' and table_name = 'record_history'
             and grantee in ('anon', 'authenticated', 'public') and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')),
  0, 'no application role holds a write privilege on history');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-00000000c1b1","access_roles":["admin"]}');
select throws_ok($$ delete from shared.record_history $$, '42501', null, 'an admin cannot delete history');
set local role anon;
select throws_ok($$ delete from shared.record_history $$, '42501', null, 'anon cannot delete history');

select * from finish();
rollback;
