begin;
create extension if not exists pgtap with schema extensions;
select plan(48);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

insert into shared.orgs (id, name, slug)
values ('00000000-0000-0000-0000-00000000a8b1', 'Recipe visibility second org', 'recipe-visibility-second-org');
insert into shared.business_units (id, org_id, name, code)
values ('00000000-0000-0000-0000-00000000a8b3', '00000000-0000-0000-0000-00000000a8b1', 'Recipe visibility unit', 'recipe_visibility');
insert into shared.people (id, org_id, full_name, email) values
  ('00000000-0000-0000-0000-00000000a8a1', '00000000-0000-0000-0000-0000000000a1', 'Recipe settings manager', 'recipe-manager@example.test'),
  ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000a1', 'Recipe settings member', 'recipe-member@example.test'),
  ('00000000-0000-0000-0000-00000000a8b2', '00000000-0000-0000-0000-00000000a8b1', 'Second org member', 'recipe-second-org@example.test');
insert into shared.roles (org_id, business_unit_id, name, cafe_item_settings_scope) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', 'Recipe visibility manager', 'kitchen'),
  ('00000000-0000-0000-0000-00000000a8b1', '00000000-0000-0000-0000-00000000a8b3', 'Second org recipe visibility manager', 'kitchen');
insert into shared.person_roles (org_id, person_id, role_id)
select r.org_id,
       case r.org_id when '00000000-0000-0000-0000-0000000000a1'::uuid
         then '00000000-0000-0000-0000-00000000a8a1'::uuid
         else '00000000-0000-0000-0000-00000000a8b2'::uuid end,
       r.id
  from shared.roles r
 where r.name in ('Recipe visibility manager', 'Second org recipe visibility manager');
select set_config('app.allow_test_seeds', 'off', true);

select has_table('ops', 'recipe_visibility', 'recipe choices have their own org-scoped table');
select has_table('ops', 'recipe_visibility_audit', 'accepted changes retain an audit trail');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'ops.recipe_visibility'::regclass), 'visibility table has RLS enabled');
select ok((select relforcerowsecurity from pg_catalog.pg_class where oid = 'ops.recipe_visibility'::regclass), 'visibility table forces RLS');
select ok((select relrowsecurity from pg_catalog.pg_class where oid = 'ops.recipe_visibility_audit'::regclass), 'audit table has RLS enabled');
select ok((select relforcerowsecurity from pg_catalog.pg_class where oid = 'ops.recipe_visibility_audit'::regclass), 'audit table forces RLS');
select has_function('ops', 'list_recipe_visibility', array[]::text[], 'members have an org-scoped read RPC');
select has_function('ops', 'set_recipe_visibility', array['text','boolean','integer','uuid'], 'managers have a versioned write RPC');
select has_trigger('ops', 'recipe_visibility_audit', 'recipe_visibility_audit_immutable', 'audit mutations are guarded by an immutable trigger');
select ok(not has_table_privilege('authenticated', 'ops.recipe_visibility_audit', 'UPDATE'), 'members cannot update audit rows directly');
select ok(not has_table_privilege('authenticated', 'ops.recipe_visibility_audit', 'DELETE'), 'members cannot delete audit rows directly');
select ok(has_function_privilege('authenticated', 'ops.list_recipe_visibility()', 'EXECUTE'), 'signed-in users can read visibility');
select ok(not has_function_privilege('anon', 'ops.set_recipe_visibility(text,boolean,integer,uuid)', 'EXECUTE'), 'anonymous callers cannot change visibility');
select ok(has_table_privilege('authenticated', 'ops.recipe_visibility', 'SELECT'), 'members can read visibility rows through RLS');
select ok(not has_table_privilege('authenticated', 'ops.recipe_visibility', 'INSERT'), 'members cannot insert visibility rows directly');
select ok(not has_table_privilege('authenticated', 'ops.recipe_visibility', 'UPDATE'), 'members cannot update visibility rows directly');
select ok(not has_table_privilege('authenticated', 'ops.recipe_visibility', 'DELETE'), 'members cannot delete visibility rows directly');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000a8a1","access_roles":["member","manager"]}');
select is(ops.can_manage_cafe_item_settings('kitchen'), true, 'the existing kitchen item-settings manager may manage recipe visibility');
select is(ops.can_manage_cafe_item_settings('bar'), false, 'recipe visibility does not broaden the manager activity scope');
select is((select count(*)::int from ops.list_recipe_visibility()), 0, 'a new organization starts with every recipe shown');
select is((select hidden from ops.set_recipe_visibility('SYNTH:4', true, null, '00000000-0000-4000-8000-000000000001')), true, 'manager hides a recipe');
select is((select row_version from ops.set_recipe_visibility('SYNTH:5', true, null, '00000000-0000-4000-8000-000000000002')), 1, 'a new visibility choice starts at version one');
select is((select updated_by from ops.recipe_visibility where esb_code = 'SYNTH' and menu_id = 4), '00000000-0000-0000-0000-00000000a8a1'::uuid, 'the database stamps the acting person');
select is((select recipe_key from ops.list_recipe_visibility() where recipe_key = 'SYNTH:4'), 'SYNTH:4', 'the manager can read the saved choice');
select is((select hidden from ops.set_recipe_visibility('SYNTH:4', true, null, '00000000-0000-4000-8000-000000000001')), true, 'an identical retry returns its original result');
select is((select row_version from ops.set_recipe_visibility('SYNTH:4', true, null, '00000000-0000-4000-8000-000000000001')), 1, 'an identical retry does not advance the version');
select throws_ok($$select * from ops.set_recipe_visibility('SYNTH:4', false, 1, '00000000-0000-4000-8000-000000000001')$$, '22023', null, 'reusing a request id with different input is invalid');
select throws_ok($$select * from ops.set_recipe_visibility('SYNTH:4', false, 0, '00000000-0000-4000-8000-000000000003')$$, 'P0019', null, 'a stale expected version conflicts');
select is((select row_version from ops.recipe_visibility where esb_code = 'SYNTH' and menu_id = 4), 1, 'a stale write leaves the saved choice unchanged');
select is((select hidden from ops.set_recipe_visibility('SYNTH:4', false, 1, '00000000-0000-4000-8000-000000000004')), false, 'manager shows a hidden recipe');
select is((select row_version from ops.recipe_visibility where esb_code = 'SYNTH' and menu_id = 4), 2, 'showing a recipe advances its version');
select throws_ok($$update ops.recipe_visibility_audit set result_hidden = false$$, '42501', null, 'members cannot update audit entries');
select throws_ok($$delete from ops.recipe_visibility_audit$$, '42501', null, 'members cannot delete audit entries');
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-00000000a8a1","access_roles":["member","manager"]}');
select is((select hidden from ops.set_recipe_visibility('SYNTH:4', true, null, '00000000-0000-4000-8000-000000000001')), true, 'a retry after later changes still returns its original result');
select is((select hidden from ops.recipe_visibility where esb_code = 'SYNTH' and menu_id = 4), false, 'an old retry does not undo the latest choice');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000a9","access_roles":["member"]}');
select is(ops.can_manage_cafe_item_settings('kitchen'), false, 'a member without the existing settings right cannot manage visibility');
select is((select count(*)::int from ops.list_recipe_visibility()), 2, 'a non-manager can read the organization visibility list');
select is((select count(*)::int from ops.recipe_visibility), 2, 'RLS lets a non-manager read saved visibility rows');
select throws_ok($$select * from ops.set_recipe_visibility('SYNTH:4', true, 2, '00000000-0000-4000-8000-000000000005')$$, '42501', null, 'a non-manager cannot change recipe visibility');
select throws_ok($$insert into ops.recipe_visibility (org_id, esb_code, menu_id, hidden) values ('00000000-0000-0000-0000-0000000000a1', 'DIRECT', 1, true)$$, '42501', null, 'browser DML cannot bypass the write RPC');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-00000000a8b1","person_id":"00000000-0000-0000-0000-00000000a8b2","access_roles":["member"]}');
select is((select count(*)::int from ops.list_recipe_visibility()), 0, 'a second organization sees no other organization visibility choices');
select is((select count(*)::int from ops.recipe_visibility), 0, 'RLS hides another organization''s visibility rows');
reset role;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-00000000a8b1","person_id":"00000000-0000-0000-0000-00000000a8b2","access_roles":["member","manager"]}');
select is((select hidden from ops.set_recipe_visibility('SECOND:1', true, null, '00000000-0000-4000-8000-000000000099')), true, 'second-org manager writes an isolated visibility choice');
reset role;
select lives_ok($$delete from shared.people where id = '00000000-0000-0000-0000-00000000a8a1'$$, 'actor deletion clears attribution without deleting audit history');
select is((select count(*)::int from ops.recipe_visibility_audit where org_id = '00000000-0000-0000-0000-0000000000a1' and actor_id is null), 3, 'actor deletion preserves every audit event');
select is((select count(*)::int from ops.recipe_visibility_audit where org_id = '00000000-0000-0000-0000-0000000000a1' and actor_id is null and result_updated_by is null), 3, 'audit actor references are cleared without losing result data');
select is((select count(*)::int from ops.recipe_visibility where org_id = '00000000-0000-0000-0000-0000000000a1' and updated_by is null), 2, 'visibility choices survive manager deletion');
select lives_ok($$delete from shared.orgs where id = '00000000-0000-0000-0000-00000000a8b1'$$, 'organization deletion cascades visibility and audit records');
select * from finish();
rollback;
