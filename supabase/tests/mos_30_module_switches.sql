-- Missing Assistant settings are off; other module defaults remain on, and only admins can manage them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select set_config('test.org_a', (select id::text from shared.orgs where slug = 'org-a'), true);
select set_config('test.org_b', (select id::text from shared.orgs where slug = 'org-b'), true);
select set_config('test.person_a_member', (select id::text from shared.people where full_name = 'Author'), true);
select set_config('test.person_a_admin', (select id::text from shared.people where full_name = 'GrandMgr'), true);
select set_config('test.person_b', (select id::text from shared.people where full_name = 'ForeignMgr'), true);

insert into mos.org_module_settings (org_id, module_id, enabled, updated_by)
values (current_setting('test.org_b')::uuid, 'cafe', false, current_setting('test.person_b')::uuid);

set local role authenticated;
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_member'),
  'access_roles', jsonb_build_array('member'))::text);
select throws_ok($$select * from mos.list_org_module_settings()$$,
  '42501', null, 'a non-admin member cannot list module settings');
select throws_ok($$select * from mos.save_org_module_settings('[]'::jsonb, gen_random_uuid())$$,
  '42501', null, 'a non-admin member cannot save module settings');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select count(*)::int from mos.list_org_module_settings()), 7,
  'an admin lists all seven catalog modules');
select results_eq($$
  select module_id from mos.list_org_module_settings()
$$, $$
  values ('work'::text), ('money'), ('cafe'), ('roastery'), ('ecommerce'), ('assistant'), ('staff')
$$, 'the admin list follows the fixed catalog order');
select ok((select bool_and(enabled) from mos.list_org_module_settings() where module_id <> 'assistant'),
  'other missing settings rows default to enabled');
select is((select enabled from mos.list_org_module_settings() where module_id = 'assistant'),
  false, 'a missing Assistant row defaults to off in the admin list');
select ok((select bool_and(row_version = 0) from mos.list_org_module_settings()),
  'every missing settings row defaults to version zero');

select set_config('test.module_request_id', gen_random_uuid()::text, true);
select is((select enabled from mos.save_org_module_settings(
  '[{"module_id":"money","enabled":false,"expected_version":0}]'::jsonb,
  current_setting('test.module_request_id')::uuid) where module_id = 'money'),
  false, 'saving money off returns the saved value');
select is((select enabled from mos.save_org_module_settings(
  '[{"module_id":"money","enabled":false,"expected_version":0}]'::jsonb,
  current_setting('test.module_request_id')::uuid) where module_id = 'assistant'),
  false, 'a save response defaults a missing Assistant row to off');
select is((select row_version from mos.save_org_module_settings(
  '[{"module_id":"money","enabled":false,"expected_version":0}]'::jsonb,
  current_setting('test.module_request_id')::uuid) where module_id = 'money'),
  1::bigint, 'the first save returns version one');
select is((select count(*)::int from mos.module_settings_audit
  where org_id = current_setting('test.org_a')::uuid
    and client_request_id = current_setting('test.module_request_id')::uuid),
  1, 'the save writes one audit row');

select throws_ok($$select * from mos.save_org_module_settings(
  '[{"module_id":"money","enabled":true,"expected_version":0}]'::jsonb,
  gen_random_uuid())$$,
  '40001', 'module settings changed, reload', 'a stale expected version raises a conflict');
select throws_ok($$select * from mos.save_org_module_settings(
  '[{"module_id":"unknown","enabled":false,"expected_version":0}]'::jsonb,
  gen_random_uuid())$$,
  '22023', null, 'an unknown module id is rejected');
select throws_ok($$select * from mos.save_org_module_settings(
  '[{"module_id":"work","enabled":false,"expected_version":0},
    {"module_id":"work","enabled":true,"expected_version":0}]'::jsonb,
  gen_random_uuid())$$,
  '22023', null, 'duplicate module ids in one save are rejected');

select is((select row_version from mos.save_org_module_settings(
  '[{"module_id":"money","enabled":false,"expected_version":0}]'::jsonb,
  current_setting('test.module_request_id')::uuid) where module_id = 'money'),
  1::bigint, 'a repeated client request returns the current version');
select is((select row_version from mos.list_org_module_settings() where module_id = 'money'),
  1::bigint, 'a repeated client request does not change the settings row');
select is((select count(*)::int from mos.module_settings_audit
  where org_id = current_setting('test.org_a')::uuid
    and client_request_id = current_setting('test.module_request_id')::uuid),
  1, 'a repeated client request adds no audit row');
select is((select enabled from mos.save_org_module_settings(
  '[{"module_id":"money","enabled":false,"expected_version":0}]'::jsonb,
  current_setting('test.module_request_id')::uuid) where module_id = 'assistant'),
  false, 'an idempotent save response defaults a missing Assistant row to off');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_member'),
  'access_roles', jsonb_build_array('member'))::text);
select is((select count(*)::int from mos.viewer_module_availability()), 7,
  'a signed-in member sees availability for all seven modules');
select is((select enabled from mos.viewer_module_availability() where module_id = 'money'),
  false, 'availability includes the saved money value');
select is((select enabled from mos.viewer_module_availability() where module_id = 'cafe'),
  true, 'availability materializes an enabled default for an unsaved module');
select is((select enabled from mos.viewer_module_availability() where module_id = 'assistant'),
  false, 'viewer availability defaults a missing Assistant row to off');
select is((select count(distinct revision)::int from mos.viewer_module_availability()), 1,
  'all availability rows share one org revision');
select set_config('test.module_revision_before',
  (select revision from mos.viewer_module_availability() where module_id = 'money'), true);

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select set_config('test.assistant_request_id', gen_random_uuid()::text, true);
select is((select enabled from mos.save_org_module_settings(
  '[{"module_id":"assistant","enabled":true,"expected_version":0}]'::jsonb,
  current_setting('test.assistant_request_id')::uuid) where module_id = 'assistant'),
  true, 'an admin explicitly enables Assistant through the save RPC');
select is((select enabled from mos.save_org_module_settings(
  '[{"module_id":"assistant","enabled":true,"expected_version":0}]'::jsonb,
  current_setting('test.assistant_request_id')::uuid) where module_id = 'assistant'),
  true, 'an idempotent save response preserves explicit Assistant on');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_member'),
  'access_roles', jsonb_build_array('member'))::text);
select is((select enabled from mos.viewer_module_availability() where module_id = 'assistant'),
  true, 'viewer availability reflects explicit Assistant on');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select enabled from mos.save_org_module_settings(
  '[{"module_id":"assistant","enabled":false,"expected_version":1}]'::jsonb,
  gen_random_uuid()) where module_id = 'assistant'),
  false, 'an admin explicitly disables Assistant through the save RPC');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_member'),
  'access_roles', jsonb_build_array('member'))::text);
select is((select enabled from mos.viewer_module_availability() where module_id = 'assistant'),
  false, 'viewer availability reflects explicit Assistant off');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select row_version from mos.save_org_module_settings(
  '[{"module_id":"money","enabled":false,"expected_version":1}]'::jsonb,
  gen_random_uuid()) where module_id = 'money'),
  2::bigint, 'an explicit save of the same value advances the version');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_member'),
  'access_roles', jsonb_build_array('member'))::text);
select ok((select revision <> current_setting('test.module_revision_before')
  from mos.viewer_module_availability() where module_id = 'money'),
  'availability revision changes after a save');
select is((select enabled from mos.viewer_module_availability() where module_id = 'cafe'),
  true, 'org A does not see org B''s disabled Café setting');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_b'),
  'person_id', current_setting('test.person_b'),
  'access_roles', jsonb_build_array('member'))::text);
select is((select count(*)::int from mos.viewer_module_availability()), 7,
  'a member of another org sees seven rows for that org');
select is((select enabled from mos.viewer_module_availability() where module_id = 'cafe'),
  false, 'the other org sees its own disabled Café setting');
select is((select enabled from mos.viewer_module_availability() where module_id = 'money'),
  true, 'the other org does not see org A''s disabled Money setting');
select is((select enabled from mos.viewer_module_availability() where module_id = 'assistant'),
  false, 'the other org receives its own Assistant default off');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select count(*)::int from mos.module_settings_audit
  where org_id = current_setting('test.org_a')::uuid),
  4, 'an org admin reads that org''s audit rows');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_member'),
  'access_roles', jsonb_build_array('member'))::text);
select is((select count(*)::int from mos.module_settings_audit), 0,
  'a non-admin member reads no audit rows');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_b'),
  'person_id', current_setting('test.person_b'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select count(*)::int from mos.module_settings_audit), 0,
  'an admin in another org reads no audit rows');

set local role service_role;
select is((select enabled from mos.org_module_settings
  where org_id = current_setting('test.org_a')::uuid and module_id = 'money'),
  false, 'service_role can read the assistant gate settings table');

set local role authenticated;
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_member'),
  'access_roles', jsonb_build_array('member'))::text);
select throws_ok(format($$insert into mos.org_module_settings (org_id, module_id, enabled)
  values (%L, 'assistant', true)$$,
  current_setting('test.org_a')),
  '42501', null, 'authenticated cannot insert org module settings');
select throws_ok(format($$update mos.org_module_settings set enabled = true
  where org_id = %L and module_id = 'money'$$,
  current_setting('test.org_a')),
  '42501', null, 'authenticated cannot update org module settings');
select throws_ok(format($$delete from mos.org_module_settings where org_id = %L$$,
  current_setting('test.org_a')),
  '42501', null, 'authenticated cannot delete org module settings');
select throws_ok(format($$insert into mos.module_settings_audit
  (org_id, module_id, before, after, client_request_id, resulting_version)
  values (%L, 'money', null, '{}'::jsonb, gen_random_uuid(), 1)$$,
  current_setting('test.org_a')),
  '42501', null, 'authenticated cannot insert module audit rows');
select throws_ok(format($$update mos.module_settings_audit set after = '{}'::jsonb
  where org_id = %L$$,
  current_setting('test.org_a')),
  '42501', null, 'authenticated cannot update module audit rows');
select throws_ok(format($$delete from mos.module_settings_audit where org_id = %L$$,
  current_setting('test.org_a')),
  '42501', null, 'authenticated cannot delete module audit rows');

-- Staff is its own switch: on by default, switchable, and independent of Work.
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select enabled from mos.list_org_module_settings() where module_id = 'staff'),
  true, 'Staff is in the catalog and defaults to enabled');
select is((select enabled from mos.save_org_module_settings(
  '[{"module_id":"staff","enabled":false,"expected_version":0}]'::jsonb,
  gen_random_uuid()) where module_id = 'staff'),
  false, 'an admin can switch Staff off');
select is((select enabled from mos.list_org_module_settings() where module_id = 'work'),
  true, 'switching Staff off leaves Work on');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'),
  'person_id', current_setting('test.person_a_member'),
  'access_roles', jsonb_build_array('member'))::text);
select is((select enabled from mos.viewer_module_availability() where module_id = 'staff'),
  false, 'a member sees Staff off for the org');
select is((select enabled from mos.viewer_module_availability() where module_id = 'work'),
  true, 'a member still sees Work on');

reset role;
select * from finish();
rollback;
