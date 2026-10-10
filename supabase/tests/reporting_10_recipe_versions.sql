-- Recipe history: real writer grants, tenant reads, immutability and date lookup.
begin;
create extension if not exists pgtap with schema extensions;
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;
select plan(42);

select has_table('reporting', 'recipe_versions', 'MOS retains recipe versions');
select has_function('reporting', 'recipe_version_on_date', array['uuid','text','integer','date'],
  'MOS can read the recipe in force on a date');
select ok((select relrowsecurity and relforcerowsecurity from pg_class
  where oid = 'reporting.recipe_versions'::regclass), 'recipe history enables and forces RLS');
select col_is_pk('reporting', 'recipe_versions', array['org_id','esb_code','menu_id','version'],
  'history identity includes tenant, company, menu and version');
select ok(not has_table_privilege('anon', 'reporting.recipe_versions', 'SELECT'),
  'anonymous sessions cannot read history');
select is((select count(*)::int from unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p
  where has_table_privilege('authenticated', 'reporting.recipe_versions', p)
     or has_table_privilege('service_role', 'reporting.recipe_versions', p)), 0,
  'app and service sessions have no mutation privileges');
select ok(not has_table_privilege('reporting_writer', 'reporting.recipe_versions', 'UPDATE')
  and not has_table_privilege('reporting_writer', 'reporting.recipe_versions', 'DELETE')
  and not has_table_privilege('reporting_writer', 'reporting.recipe_versions', 'TRUNCATE'),
  'nightly writer only appends');
select ok(not has_function_privilege('anon',
  'reporting.recipe_version_on_date(uuid,text,integer,date)', 'EXECUTE'),
  'anonymous sessions cannot execute the date lookup');
select ok(not has_function_privilege('authenticated',
  'reporting._reject_recipe_version_mutation()', 'EXECUTE'),
  'the trigger function is not an app RPC');

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();

set local role reporting_writer;
select throws_ok($$
  insert into reporting.recipe_versions
    (org_id, esb_code, menu_id, bom_id, version, warehouse_version_hash, recipe, first_seen, source_observed_at)
  values ('00000000-0000-0000-0000-0000000000a1','TEST',101,201,1,'hash-a',
    '{"lines":[{"detail_id":301,"qty":25,"unit":"Batch @10porsi","detail_active":true}]}',
    '2026-10-10','2026-10-09T20:00:00Z')
$$, '42501', null, 'undeclared writer cannot append history');
reset role;
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000b1', true);
set local role reporting_writer;
select throws_ok($$
  insert into reporting.recipe_versions
    (org_id, esb_code, menu_id, bom_id, version, warehouse_version_hash, recipe, first_seen, source_observed_at)
  values ('00000000-0000-0000-0000-0000000000a1','TEST',101,201,1,'hash-a','{"lines":[]}',
    '2026-10-10','2026-10-09T20:00:00Z')
$$, '42501', null, 'writer declared for B cannot append A history');
select lives_ok($$
  insert into reporting.recipe_versions
    (org_id, esb_code, menu_id, bom_id, version, warehouse_version_hash, recipe, first_seen, source_observed_at)
  values ('00000000-0000-0000-0000-0000000000b1','TEST',101,201,1,'hash-b','{"lines":[]}',
    '2026-10-10','2026-10-09T20:00:00Z')
$$, 'declared writer appends B history');
reset role;
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000a1', true);
set local role reporting_writer;
select is((select count(*)::int from reporting.recipe_versions), 0,
  'writer for A cannot read the existing B version');
select lives_ok($$
  insert into reporting.recipe_versions
    (org_id, esb_code, menu_id, bom_id, version, warehouse_version_hash, recipe, first_seen, source_observed_at)
  values
    ('00000000-0000-0000-0000-0000000000a1','TEST',101,201,1,'hash-a',
     '{"lines":[{"detail_id":301,"qty":25,"unit":"Batch @10porsi","detail_active":true}]}',
     '2026-10-10','2026-10-09T20:00:00Z'),
    ('00000000-0000-0000-0000-0000000000a1','TEST',101,201,2,'hash-b',
     '{"lines":[{"detail_id":301,"qty":30,"unit":"Batch @10porsi","detail_active":true}]}',
     '2026-10-12','2026-10-11T20:00:00Z'),
    ('00000000-0000-0000-0000-0000000000a1','TEST',101,202,3,'hash-c',
     '{"lines":[{"detail_id":302,"qty":1,"unit":"Porsi","detail_active":false}]}',
     '2026-10-12','2026-10-12T01:00:00Z'),
    ('00000000-0000-0000-0000-0000000000a1','TEST',101,null,4,'hash-d','{"lines":[]}',
     '2026-10-14','2026-10-13T20:00:00Z'),
    ('00000000-0000-0000-0000-0000000000a1','OTHER',101,301,1,'other-hash','{"lines":[]}',
     '2026-10-10','2026-10-09T20:00:00Z')
$$, 'writer inserts the exact nightly column contract, retaining all versions and BOM mappings');
select is((select count(*)::int from reporting.recipe_versions), 5,
  'writer reads its own newly appended versions');
select throws_ok($$
  insert into reporting.recipe_versions
    (org_id, esb_code, menu_id, version, warehouse_version_hash, recipe, first_seen, source_observed_at)
  values ('00000000-0000-0000-0000-0000000000a1','TEST',101,1,'new-hash','{"lines":[]}',
    '2026-10-10','2026-10-09T20:00:00Z')
$$, '23505', null, 'duplicate version identity cannot replace history');
select throws_ok($$ update reporting.recipe_versions set recipe = '{"lines":[]}' $$,
  '42501', null, 'writer cannot edit history');
select throws_ok($$ delete from reporting.recipe_versions $$,
  '42501', null, 'writer cannot delete history');
select throws_ok($$
  insert into reporting.recipe_versions
    (org_id, esb_code, menu_id, version, warehouse_version_hash, recipe, first_seen, source_observed_at)
  values ('00000000-0000-0000-0000-0000000000a1','TEST',102,0,'hash','{"lines":[]}',
    '2026-10-10','2026-10-09T20:00:00Z')
$$, '23514', null, 'version numbers are positive');
select throws_ok($$
  insert into reporting.recipe_versions
    (org_id, esb_code, menu_id, version, warehouse_version_hash, recipe, first_seen, source_observed_at)
  values ('00000000-0000-0000-0000-0000000000a1','TEST',102,1,'hash','{}',
    '2026-10-10','2026-10-09T20:00:00Z')
$$, '23514', null, 'every envelope holds a line set, including an empty set');
reset role;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from reporting.recipe_versions), 5, 'Cafe member reads own-org history');
select is((select count(*)::int from reporting.recipe_versions
  where org_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'member cannot read B history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["ops_lead"]}');
select is((select count(*)::int from reporting.recipe_versions), 5, 'ops lead reads Cafe recipe history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["finance"]}');
select is((select count(*)::int from reporting.recipe_versions), 5, 'finance reads Cafe recipe history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["admin"]}');
select is((select count(*)::int from reporting.recipe_versions), 5, 'admin reads Cafe recipe history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["manager"]}');
select is((select count(*)::int from reporting.recipe_versions), 5, 'manager reads Cafe recipe history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["supervisor"]}');
select is((select count(*)::int from reporting.recipe_versions), 5, 'supervisor reads Cafe recipe history');
select throws_ok($$
  insert into reporting.recipe_versions
    (org_id, esb_code, menu_id, version, warehouse_version_hash, recipe, first_seen, source_observed_at)
  values ('00000000-0000-0000-0000-0000000000a1','TEST',102,1,'hash','{"lines":[]}',
    '2026-10-10','2026-10-09T20:00:00Z')
$$, '42501', null, 'an authenticated reader cannot append history');

select is((select count(*)::int from reporting.recipe_version_on_date(
  '00000000-0000-0000-0000-0000000000a1','TEST',101,'2026-10-09')), 0,
  'date before MOS history returns no invented recipe');
select is((select version from reporting.recipe_version_on_date(
  '00000000-0000-0000-0000-0000000000a1','TEST',101,'2026-10-10')), 1,
  'first-seen date is inclusive');
select is((select recipe from reporting.recipe_version_on_date(
  '00000000-0000-0000-0000-0000000000a1','TEST',101,'2026-10-11')),
  '{"lines":[{"detail_id":301,"qty":25,"unit":"Batch @10porsi","detail_active":true}]}'::jsonb,
  'a date between changes returns the original unaltered line set');
select results_eq($$
  select version, bom_id, recipe from reporting.recipe_version_on_date(
    '00000000-0000-0000-0000-0000000000a1','TEST',101,'2026-10-12')
$$, $$ values (3,202,'{"lines":[{"detail_id":302,"qty":1,"unit":"Porsi","detail_active":false}]}'::jsonb) $$,
  'last same-day version wins, including a changed BOM mapping and inactive line');
select results_eq($$
  select version, bom_id, recipe from reporting.recipe_version_on_date(
    '00000000-0000-0000-0000-0000000000a1','TEST',101,'2026-11-01')
$$, $$ values (4,null::integer,'{"lines":[]}'::jsonb) $$,
  'latest version retains removed BOM and empty line set');
select is((select bom_id from reporting.recipe_version_on_date(
  '00000000-0000-0000-0000-0000000000a1','OTHER',101,'2026-10-10')), 301,
  'same menu id in a different company has separate history');
select is((select count(*)::int from reporting.recipe_version_on_date(
  '00000000-0000-0000-0000-0000000000b1','TEST',101,'2026-10-10')), 0,
  'date lookup cannot bypass tenant RLS');
select is((select count(*)::int from reporting.recipe_version_on_date(
  '00000000-0000-0000-0000-0000000000a1','TEST',999,'2026-10-10')), 0,
  'unknown menu has no invented history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
select is((select warehouse_version_hash from reporting.recipe_version_on_date(
  '00000000-0000-0000-0000-0000000000b1','TEST',101,'2026-10-10')), 'hash-b',
  'B reader can retrieve its own recipe through the same lookup');
select set_config('request.jwt.claims', '{}', true);
select is((select count(*)::int from reporting.recipe_versions), 0, 'claimless reader sees no history');
reset role;

-- Privileged maintenance cannot silently rewrite or clear retained history either.
select throws_ok($$ update reporting.recipe_versions set first_seen = '2026-01-01' $$,
  '55000', 'Recipe versions are append-only', 'privileged UPDATE is rejected');
select throws_ok($$ delete from reporting.recipe_versions $$,
  '55000', 'Recipe versions are append-only', 'privileged DELETE is rejected');
select throws_ok($$ truncate reporting.recipe_versions $$,
  '55000', 'Recipe versions are append-only', 'privileged TRUNCATE is rejected');
select is((select count(*)::int from reporting.recipe_versions
  where org_id in ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1')), 6,
  'all original history survives refused mutations');

select * from finish();
rollback;
