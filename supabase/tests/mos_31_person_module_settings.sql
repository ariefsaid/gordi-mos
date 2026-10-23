-- Per-person module settings are identity-scoped presentation overrides with admin-only audited writes.
begin;
create extension if not exists pgtap with schema extensions;
select plan(107);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select set_config('test.org_a', (select id::text from shared.orgs where slug = 'org-a'), true);
select set_config('test.org_b', (select id::text from shared.orgs where slug = 'org-b'), true);
select set_config('test.member', (select id::text from shared.people where full_name = 'Author'), true);
select set_config('test.admin', (select id::text from shared.people where full_name = 'GrandMgr'), true);
select set_config('test.other_a', (select id::text from shared.people where full_name = 'DualHat'), true);
select set_config('test.person_b', (select id::text from shared.people where full_name = 'ForeignMgr'), true);
select set_config('test.request', gen_random_uuid()::text, true);

select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'mos.person_module_settings'::regclass),
  'person settings enable and force row-level security');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'mos.person_module_settings_audit'::regclass),
  'person settings audit enables and forces row-level security');
select ok(has_function_privilege('authenticated', 'mos.list_person_module_settings(uuid)', 'execute'),
  'authenticated may execute the admin-checked list RPC');
select ok(has_function_privilege('authenticated', 'mos.save_person_module_settings(uuid,jsonb,uuid)', 'execute'),
  'authenticated may execute the admin-checked save RPC');
select ok(not has_function_privilege('anon', 'mos.list_person_module_settings(uuid)', 'execute'),
  'anonymous cannot execute the list RPC');
select ok(not has_function_privilege('anon', 'mos.save_person_module_settings(uuid,jsonb,uuid)', 'execute'),
  'anonymous cannot execute the save RPC');
select ok(not has_function_privilege('service_role', 'mos.list_person_module_settings(uuid)', 'execute'),
  'service_role cannot execute the browser admin list RPC');
select ok(not has_function_privilege('service_role', 'mos.save_person_module_settings(uuid,jsonb,uuid)', 'execute'),
  'service_role cannot execute the browser admin save RPC');

set local role authenticated;
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select count(*)::int from mos.list_person_module_settings(current_setting('test.member')::uuid)), 7,
  'an admin lists all seven modules for an in-org person');
select results_eq($$
  select module_id from mos.list_person_module_settings(current_setting('test.member')::uuid)
$$, $$
  values ('work'::text), ('money'), ('cafe'), ('roastery'), ('ecommerce'), ('assistant'), ('staff')
$$, 'the person list follows the catalog order');
select ok((select bool_and(override = 'inherit' and row_version = 0)
  from mos.list_person_module_settings(current_setting('test.member')::uuid)),
  'missing settings materialize as Inherit at version zero');
select ok((select bool_and(org_enabled) from mos.list_person_module_settings(current_setting('test.member')::uuid)
  where module_id <> 'assistant'), 'missing non-Assistant org settings default on');
select is((select org_enabled from mos.list_person_module_settings(current_setting('test.member')::uuid)
  where module_id = 'assistant'), false, 'missing Assistant org setting defaults off');
select is((select user_id from shared.people where id = current_setting('test.admin')::uuid), null::uuid,
  'the seeded admin target exists without a login');
select is((select count(*)::int from mos.list_person_module_settings(current_setting('test.admin')::uuid)), 7,
  'an admin can manage a person without a login');

select throws_ok(format('select * from mos.list_person_module_settings(%L::uuid)', current_setting('test.person_b')),
  '42501', 'admin access required', 'an admin cannot list a foreign-org person');
select throws_ok($$select * from mos.list_person_module_settings('00000000-0000-0000-0000-00000000ffff')$$,
  '42501', 'admin access required', 'an admin cannot distinguish an unknown person');
select throws_ok($$select * from mos.list_person_module_settings(null)$$,
  '42501', 'admin access required', 'an admin cannot list a null person');
select throws_ok(format($$select * from mos.save_person_module_settings(%L::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":0}]'::jsonb, gen_random_uuid())$$,
  current_setting('test.person_b')),
  '42501', 'admin access required', 'an admin cannot save a foreign-org person');
select throws_ok($$select * from mos.save_person_module_settings(null,
  '[{"module_id":"cafe","override":"block","expected_version":0}]'::jsonb, gen_random_uuid())$$,
  '42501', 'admin access required', 'an admin cannot save a null person');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('member'))::text);
select throws_ok(format('select * from mos.list_person_module_settings(%L::uuid)', current_setting('test.member')),
  '42501', 'admin access required', 'a member cannot list personal module settings, including their own');
select throws_ok(format($$select * from mos.save_person_module_settings(%L::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":0}]'::jsonb, gen_random_uuid())$$,
  current_setting('test.member')),
  '42501', 'admin access required', 'a member cannot save personal module settings, including their own');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('finance'))::text);
select throws_ok(format('select * from mos.list_person_module_settings(%L::uuid)', current_setting('test.member')),
  '42501', 'admin access required', 'finance alone cannot list personal settings');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('ops_lead'))::text);
select throws_ok(format($query$select * from mos.save_person_module_settings(%L::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":0}]'::jsonb, gen_random_uuid())$query$,
  current_setting('test.member')),
  '42501', 'admin access required', 'ops_lead alone cannot save personal settings');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select row_version from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":0.0}]'::jsonb,
  current_setting('test.request')::uuid) where module_id = 'cafe'),
  1::bigint, 'the first admin save stores a Block at version one');
select is((select override from mos.list_person_module_settings(current_setting('test.member')::uuid)
  where module_id = 'cafe'), 'block', 'the list returns the saved personal Block');
select is((select count(*)::int from mos.person_module_settings_audit
  where org_id = current_setting('test.org_a')::uuid and person_id = current_setting('test.member')::uuid
    and module_id = 'cafe' and actor = current_setting('test.admin')::uuid
    and client_request_id = current_setting('test.request')::uuid and resulting_version = 1),
  1, 'the audit records the caller actor, target, org and resulting version');
select is((select before from mos.person_module_settings_audit
  where client_request_id = current_setting('test.request')::uuid), null::jsonb,
  'the first audit snapshot has a null before row');
select is((select after ->> 'override' from mos.person_module_settings_audit
  where client_request_id = current_setting('test.request')::uuid), 'block',
  'the audit stores the complete after-row override');

select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid, '{}'::jsonb, gen_random_uuid())$$,
  '22023', null, 'a non-array save batch is rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid, '[null]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'a non-object row is rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":null,"expected_version":1}]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'a null override cannot become an implicit Allow');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid, '[]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'an empty save batch is rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"grant","expected_version":1}]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'an unknown override is rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"unknown","override":"block","expected_version":0}]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'an unknown module is rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":-1}]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'a negative expected version is rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":"0"}]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'a string expected version is rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":0.5}]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'a fractional expected version is rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":1},
    {"module_id":"cafe","override":"allow","expected_version":1}]'::jsonb, gen_random_uuid())$$,
  '22023', null, 'duplicate modules in one save are rejected');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":1}]'::jsonb, null)$$,
  '22023', null, 'a null request id is rejected');

select is((select row_version from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"inherit","expected_version":1}]'::jsonb,
  gen_random_uuid()) where module_id = 'cafe'), 2::bigint,
  'resetting to Inherit stores a new versioned tombstone');
select is((select row_version from mos.list_person_module_settings(current_setting('test.member')::uuid)
  where module_id = 'cafe'), 2::bigint, 'reset does not delete the versioned settings row');
select set_config('test.retry_id', gen_random_uuid()::text, true);
select is((select row_version from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"inherit","expected_version":2}]'::jsonb,
  current_setting('test.retry_id')::uuid) where module_id = 'cafe'), 3::bigint,
  'an explicit same-value save advances the version');
select is((select row_version from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"inherit","expected_version":2}]'::jsonb,
  current_setting('test.retry_id')::uuid) where module_id = 'cafe'), 3::bigint,
  'an idempotent request returns the current list');
select is((select count(*)::int from mos.person_module_settings_audit
  where org_id = current_setting('test.org_a')::uuid and person_id = current_setting('test.member')::uuid
    and client_request_id = current_setting('test.retry_id')::uuid), 1,
  'an idempotent retry creates no duplicate audit row');
select is((select before ->> 'row_version' from mos.person_module_settings_audit
  where client_request_id = current_setting('test.retry_id')::uuid), '2',
  'the audit before snapshot contains the prior full row version');
select is((select after ->> 'row_version' from mos.person_module_settings_audit
  where client_request_id = current_setting('test.retry_id')::uuid), '3',
  'the audit after snapshot contains the resulting full row version');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":2}]'::jsonb, gen_random_uuid())$$,
  '40001', 'module settings changed, reload', 'a stale version raises the expected conflict');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":3},
    {"module_id":"money","override":"allow","expected_version":1}]'::jsonb, gen_random_uuid())$$,
  '40001', 'module settings changed, reload', 'a mixed batch checks all versions before writing');
select is((select row_version from mos.list_person_module_settings(current_setting('test.member')::uuid)
  where module_id = 'money'), 0::bigint, 'a stale mixed batch leaves the absent row at version zero');
select is((select row_version from mos.list_person_module_settings(current_setting('test.member')::uuid)
  where module_id = 'cafe'), 3::bigint, 'a stale mixed batch leaves earlier rows unchanged');
select is((select count(*)::int from mos.person_module_settings_audit
  where org_id = current_setting('test.org_a')::uuid and person_id = current_setting('test.member')::uuid), 3,
  'a mixed stale batch leaves all prior audit rows unchanged');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('member'))::text);
select is((select count(*)::int from mos.viewer_module_availability()), 7,
  'the viewer receives all catalog facts for their own identity');
select is((select person_override from mos.viewer_module_availability() where module_id = 'cafe'), 'inherit',
  'the viewer sees their own Inherit tombstone');
select is((select enabled from mos.viewer_module_availability() where module_id = 'assistant'), false,
  'viewer Assistant availability retains the default-Off org fact');
select is((select count(distinct revision)::int from mos.viewer_module_availability()), 1,
  'all viewer rows share a revision');
select set_config('test.viewer_revision', (select revision from mos.viewer_module_availability() where module_id = 'cafe'), true);
select throws_ok('select count(*) from mos.person_module_settings', '42501', null,
  'a browser viewer cannot directly select person settings despite a positive admin-seeded row');
select is((select count(*)::int from mos.person_module_settings_audit), 0,
  'a member sees no audit rows');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select row_version from mos.save_person_module_settings(
  current_setting('test.other_a')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":0}]'::jsonb,
  gen_random_uuid()) where module_id = 'cafe'), 1::bigint,
  'an admin can save another person in the same org');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('member'))::text);
select is((select revision from mos.viewer_module_availability() where module_id = 'cafe'),
  current_setting('test.viewer_revision'), 'another person''s setting does not change this viewer revision');
select is((select person_override from mos.viewer_module_availability() where module_id = 'cafe'), 'inherit',
  'the viewer does not see another person''s Block');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select set_config('test.same_request', gen_random_uuid()::text, true);
select is((select row_version from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"money","override":"allow","expected_version":0}]'::jsonb,
  current_setting('test.same_request')::uuid) where module_id = 'money'), 1::bigint,
  'the same request id is independently scoped to another person');
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"money","override":"block","expected_version":0}]'::jsonb, gen_random_uuid())$$,
  '40001', 'module settings changed, reload', 'a second writer with an absent-row version cannot replace the first insert');
select is((select count(*)::int from mos.person_module_settings_audit
  where person_id = current_setting('test.member')::uuid and module_id = 'money'), 1,
  'the losing absent-row writer adds no audit or version');
select is((select row_version from mos.save_person_module_settings(
  current_setting('test.other_a')::uuid,
  '[{"module_id":"money","override":"allow","expected_version":0}]'::jsonb,
  current_setting('test.same_request')::uuid) where module_id = 'money'), 1::bigint,
  'the same request id is independently scoped to the target person');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('member'))::text);
select ok((select revision <> current_setting('test.viewer_revision')
  from mos.viewer_module_availability() where module_id = 'cafe'),
  'the viewer revision changes after their own setting changes');
select is((select person_override from mos.viewer_module_availability() where module_id = 'money'), 'allow',
  'the viewer sees their own Allow');
select set_config('test.after_allow_revision', (select revision from mos.viewer_module_availability() where module_id = 'cafe'), true);
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select row_version from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"money","override":"inherit","expected_version":1}]'::jsonb,
  gen_random_uuid()) where module_id = 'money'), 2::bigint,
  'resetting the viewer''s Allow stores an Inherit tombstone');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('member'))::text);
select ok((select revision <> current_setting('test.after_allow_revision')
  from mos.viewer_module_availability() where module_id = 'cafe'),
  'resetting to Inherit changes the viewer revision');
select is((select person_override from mos.viewer_module_availability() where module_id = 'money'), 'inherit',
  'the viewer sees their reset Inherit tombstone');
select set_config('test.after_reset_revision', (select revision from mos.viewer_module_availability() where module_id = 'cafe'), true);
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select set_config('test.org_cafe_version', (select row_version::text from mos.list_org_module_settings() where module_id = 'cafe'), true);
select set_config('test.org_cafe_enabled', (select enabled::text from mos.list_org_module_settings() where module_id = 'cafe'), true);
select * from mos.save_org_module_settings(jsonb_build_array(jsonb_build_object(
  'module_id', 'cafe', 'enabled', not current_setting('test.org_cafe_enabled')::boolean,
  'expected_version', current_setting('test.org_cafe_version')::bigint)), gen_random_uuid());
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('member'))::text);
select ok((select revision <> current_setting('test.after_reset_revision')
  from mos.viewer_module_availability() where module_id = 'cafe'),
  'an org switch change changes the viewer revision');
select is((select enabled from mos.viewer_module_availability() where module_id = 'cafe'),
  not current_setting('test.org_cafe_enabled')::boolean, 'viewer enabled remains the org fact');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_b'), 'person_id', current_setting('test.person_b'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select row_version from mos.save_person_module_settings(
  current_setting('test.person_b')::uuid,
  '[{"module_id":"money","override":"allow","expected_version":0}]'::jsonb,
  current_setting('test.same_request')::uuid) where module_id = 'money'), 1::bigint,
  'the same request id is independently scoped to another org');
select is((select person_override from mos.viewer_module_availability() where module_id = 'money'), 'allow',
  'an org-B viewer sees their own setting');
select is((select count(*)::int from mos.person_module_settings_audit
  where org_id = current_setting('test.org_b')::uuid and person_id = current_setting('test.person_b')::uuid
    and client_request_id = current_setting('test.same_request')::uuid), 1,
  'the shared request id creates its own org-B audit witness');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('member'))::text);
select throws_ok($$select * from mos.save_person_module_settings(
  current_setting('test.member')::uuid,
  '[{"module_id":"cafe","override":"block","expected_version":3}]'::jsonb, gen_random_uuid())$$,
  '42501', 'admin access required', 'the member cannot use Allow or Block to change their own authority');
select set_config('request.jwt.claims', jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'access_roles', jsonb_build_array('member'))::text, true);
select throws_ok($$select * from mos.viewer_module_availability()$$,
  '42501', null, 'an identity without person id fails closed');
select set_config('request.jwt.claims', jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.person_b'),
  'access_roles', jsonb_build_array('admin'))::text, true);
select throws_ok($$select * from mos.viewer_module_availability()$$,
  '42501', null, 'a foreign-org person claim fails closed');

reset role;
select throws_ok(format($$insert into mos.person_module_settings (org_id, person_id, module_id, override)
  values (%L, %L, 'cafe', 'block')$$, current_setting('test.org_a'), current_setting('test.person_b')),
  '23503', null, 'a privileged cross-org target insert fails the composite person foreign key');
select throws_ok(format($$insert into mos.person_module_settings (org_id, person_id, module_id, override, updated_by)
  values (%L, %L, 'work', 'block', %L)$$,
  current_setting('test.org_a'), current_setting('test.member'), current_setting('test.person_b')),
  '23503', null, 'a privileged cross-org updater fails the composite updater foreign key');
select ok(not has_table_privilege('authenticated', 'mos.person_module_settings', 'select'),
  'authenticated admins and members have no direct person-settings SELECT privilege');
select ok(not has_table_privilege('authenticated', 'mos.person_module_settings', 'insert,update,delete,truncate'),
  'authenticated has no direct settings DML privilege');
select ok(not has_table_privilege('authenticated', 'mos.person_module_settings_audit', 'insert,update,delete,truncate'),
  'authenticated has no direct audit DML privilege');
select ok(not has_sequence_privilege('authenticated', 'mos.person_module_settings_audit_id_seq', 'usage,select,update'),
  'authenticated has no audit identity-sequence privileges');

set local role authenticated;
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.member'),
  'access_roles', jsonb_build_array('member'))::text);
select throws_ok(format($$insert into mos.person_module_settings (org_id, person_id, module_id, override)
  values (%L, %L, 'cafe', 'block')$$, current_setting('test.org_a'), current_setting('test.member')),
  '42501', null, 'an authenticated member cannot insert person settings');
select throws_ok(format($$update mos.person_module_settings set override = 'block'
  where org_id = %L and person_id = %L and module_id = 'cafe'$$,
  current_setting('test.org_a'), current_setting('test.member')),
  '42501', null, 'an authenticated member cannot update person settings');
select throws_ok(format($$delete from mos.person_module_settings where org_id = %L$$, current_setting('test.org_a')),
  '42501', null, 'an authenticated member cannot delete person settings');
select throws_ok('truncate mos.person_module_settings', '42501', null,
  'an authenticated member cannot truncate person settings');
select throws_ok(format($$insert into mos.person_module_settings_audit
  (org_id, person_id, module_id, after, actor, client_request_id, resulting_version)
  values (%L, %L, 'cafe', '{}'::jsonb, %L, gen_random_uuid(), 1)$$,
  current_setting('test.org_a'), current_setting('test.member'), current_setting('test.member')),
  '42501', null, 'an authenticated member cannot insert audit rows');
select throws_ok(format($$update mos.person_module_settings_audit set after = '{}'::jsonb
  where org_id = %L$$, current_setting('test.org_a')),
  '42501', null, 'an authenticated member cannot update audit rows');
select throws_ok(format($$delete from mos.person_module_settings_audit where org_id = %L$$, current_setting('test.org_a')),
  '42501', null, 'an authenticated member cannot delete audit rows');
select throws_ok('truncate mos.person_module_settings_audit', '42501', null,
  'an authenticated member cannot truncate audit rows');
select is((select count(*)::int from mos.person_module_settings_audit), 0,
  'a member reads zero audit rows while an org-A witness exists');

select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_a'), 'person_id', current_setting('test.admin'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select count(*)::int from mos.person_module_settings_audit), 7,
  'an org admin reads only the audit rows seeded for their org');
select throws_ok('select count(*) from mos.person_module_settings', '42501', null,
  'an authenticated admin cannot directly select person settings');
select throws_ok(format($$insert into mos.person_module_settings (org_id, person_id, module_id, override)
  values (%L, %L, 'work', 'block')$$, current_setting('test.org_a'), current_setting('test.member')),
  '42501', null, 'an authenticated admin cannot insert settings directly');
select throws_ok(format($$update mos.person_module_settings set override = 'block'
  where org_id = %L and person_id = %L and module_id = 'cafe'$$,
  current_setting('test.org_a'), current_setting('test.member')),
  '42501', null, 'an authenticated admin cannot update settings directly');
select throws_ok(format($$delete from mos.person_module_settings where org_id = %L$$, current_setting('test.org_a')),
  '42501', null, 'an authenticated admin cannot delete settings directly');
select throws_ok('truncate mos.person_module_settings', '42501', null,
  'an authenticated admin cannot truncate settings directly');
select throws_ok(format($$insert into mos.person_module_settings_audit
  (org_id, person_id, module_id, after, actor, client_request_id, resulting_version)
  values (%L, %L, 'work', '{}'::jsonb, %L, gen_random_uuid(), 1)$$,
  current_setting('test.org_a'), current_setting('test.member'), current_setting('test.admin')),
  '42501', null, 'an authenticated admin cannot insert audit rows directly');
select throws_ok(format($$update mos.person_module_settings_audit set after = '{}'::jsonb
  where org_id = %L$$, current_setting('test.org_a')),
  '42501', null, 'an authenticated admin cannot update audit rows directly');
select throws_ok(format($$delete from mos.person_module_settings_audit where org_id = %L$$, current_setting('test.org_a')),
  '42501', null, 'an authenticated admin cannot delete audit rows directly');
select throws_ok('truncate mos.person_module_settings_audit', '42501', null,
  'an authenticated admin cannot truncate audit rows directly');
select shared._test_set_access_roles(jsonb_build_object(
  'org_id', current_setting('test.org_b'), 'person_id', current_setting('test.person_b'),
  'access_roles', jsonb_build_array('admin'))::text);
select is((select count(*)::int from mos.person_module_settings_audit), 1,
  'a foreign-org admin sees only their org-B audit witness, not org-A audit rows');

reset role;
select throws_ok($$update mos.person_module_settings_audit set after = '{}'::jsonb$$,
  '55000', 'module settings audit is append-only', 'a privileged update is rejected by the append-only trigger');
select throws_ok($$delete from mos.person_module_settings_audit$$,
  '55000', 'module settings audit is append-only', 'a privileged delete is rejected by the append-only trigger');
select throws_ok('truncate mos.person_module_settings_audit',
  '55000', 'module settings audit is append-only', 'a privileged truncate is rejected by the append-only trigger');

select * from finish();
rollback;
