begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

insert into mos.user_views (id, org_id, owner_id, name, scope) values
  ('00000000-0000-0000-0000-000000007901','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','Owner private view','private'),
  ('00000000-0000-0000-0000-000000007902','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','Peer private view','private'),
  ('00000000-0000-0000-0000-000000007903','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b4','Other org private view','private');

select ok(exists (
  select 1 from pg_index index_metadata
    join pg_class relation on relation.oid = index_metadata.indrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_attribute column_metadata on column_metadata.attrelid = relation.oid
   where namespace.nspname = 'mos' and relation.relname = 'follow_ups'
     and column_metadata.attname = 'assigned_to'
     and column_metadata.attnum = any(index_metadata.indkey)
     and index_metadata.indisvalid and index_metadata.indisready
), 'follow-up assignment lookups have an index');
select ok(exists (
  select 1 from pg_index index_metadata
    join pg_class relation on relation.oid = index_metadata.indrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_attribute column_metadata on column_metadata.attrelid = relation.oid
   where namespace.nspname = 'mos' and relation.relname = 'process_run_pending_tasks'
     and column_metadata.attname = 'process_run_id'
     and column_metadata.attnum = any(index_metadata.indkey)
     and index_metadata.indisvalid and index_metadata.indisready
), 'pending process-run lookups retain their existing index');
select ok(exists (
  select 1 from pg_index index_metadata
    join pg_class relation on relation.oid = index_metadata.indrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_attribute column_metadata on column_metadata.attrelid = relation.oid
   where namespace.nspname = 'mos' and relation.relname = 'tasks'
     and column_metadata.attname = 'generated_from_task_def_id'
     and column_metadata.attnum = any(index_metadata.indkey)
     and index_metadata.indisvalid and index_metadata.indisready
), 'generated-task definition lookups have an index');
select ok(exists (
  select 1 from pg_index index_metadata
    join pg_class relation on relation.oid = index_metadata.indrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_attribute column_metadata on column_metadata.attrelid = relation.oid
   where namespace.nspname = 'ops' and relation.relname = 'cafe_receipts'
     and column_metadata.attname = 'branch_id'
     and column_metadata.attnum = any(index_metadata.indkey)
     and index_metadata.indisvalid and index_metadata.indisready
), 'receipt branch lookups retain their existing composite index');
select ok(exists (
  select 1 from pg_index index_metadata
    join pg_class relation on relation.oid = index_metadata.indrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_attribute column_metadata on column_metadata.attrelid = relation.oid
   where namespace.nspname = 'ops' and relation.relname = 'cafe_count_lines'
     and column_metadata.attname = 'branch_id'
     and column_metadata.attnum = any(index_metadata.indkey)
     and index_metadata.indisvalid and index_metadata.indisready
), 'count branch lookups retain their existing composite index');
select ok(exists (
  select 1 from pg_index index_metadata
    join pg_class relation on relation.oid = index_metadata.indrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_attribute column_metadata on column_metadata.attrelid = relation.oid
   where namespace.nspname = 'ops' and relation.relname = 'location_movements'
     and column_metadata.attname = 'branch_id'
     and column_metadata.attnum = any(index_metadata.indkey)
     and index_metadata.indisvalid and index_metadata.indisready
), 'movement branch lookups retain their existing composite index');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select set_eq($$select id::text from mos.user_views$$,
  array['00000000-0000-0000-0000-000000007901'],
  'member sees only their own private view / anggota hanya melihat tampilan pribadinya');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["supervisor"]}');
select set_eq($$select id::text from mos.user_views$$,
  array['00000000-0000-0000-0000-000000007901'],
  'supervisor sees only their own private view / supervisor hanya melihat tampilan pribadinya');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead"]}');
select set_eq($$select id::text from mos.user_views$$,
  array['00000000-0000-0000-0000-000000007901'],
  'ops lead sees only their own private view / ops lead hanya melihat tampilan pribadinya');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["finance"]}');
select set_eq($$select id::text from mos.user_views$$,
  array['00000000-0000-0000-0000-000000007901'],
  'finance sees only their own private view / finance hanya melihat tampilan pribadinya');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["admin"]}');
select set_eq($$select id::text from mos.user_views$$,
  array['00000000-0000-0000-0000-000000007901'],
  'admin sees only their own private view / admin hanya melihat tampilan pribadinya');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}');
select set_eq($$select id::text from mos.user_views$$,
  array['00000000-0000-0000-0000-000000007903'],
  'another organization sees only its own view / organisasi lain hanya melihat tampilannya sendiri');

select * from finish();
rollback;
