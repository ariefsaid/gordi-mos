begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select set_config('app.allow_test_seeds', 'on', true);
select mos._test_seed_signal_tree();
select shared._test_seed_access_roles();
select mos._test_seed_follow_ups();

-- Separate tenants can each provision the same case-insensitive address.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-00000000a928', 'Login lookup A', 'login-lookup-a'),
  ('00000000-0000-0000-0000-00000000a929', 'Login lookup B', 'login-lookup-b'),
  ('00000000-0000-0000-0000-00000000a938', 'Password policy', 'password-policy');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b928', 'Same.Address@example.test'),
  ('00000000-0000-0000-0000-00000000b938', 'policy-admin@example.test'),
  ('00000000-0000-0000-0000-00000000b939', 'policy-reset@example.test');
insert into shared.people (id, org_id, full_name, email, user_id) values
  ('00000000-0000-0000-0000-00000000c928', '00000000-0000-0000-0000-00000000a928', 'Lookup A', 'Same.Address@example.test', '00000000-0000-0000-0000-00000000b928'),
  ('00000000-0000-0000-0000-00000000c929', '00000000-0000-0000-0000-00000000a929', 'Lookup B', 'same.address@EXAMPLE.test', null),
  ('00000000-0000-0000-0000-00000000c938', '00000000-0000-0000-0000-00000000a938', 'Policy Admin', 'policy-admin@example.test', '00000000-0000-0000-0000-00000000b938'),
  ('00000000-0000-0000-0000-00000000c939', '00000000-0000-0000-0000-00000000a938', 'Policy Target', 'policy-reset@example.test', '00000000-0000-0000-0000-00000000b939'),
  ('00000000-0000-0000-0000-00000000c940', '00000000-0000-0000-0000-00000000a938', 'Policy Create Target', 'policy-create@example.test', null),
  ('00000000-0000-0000-0000-00000000c941', '00000000-0000-0000-0000-00000000a938', 'Existing Email Target', 'Same.Address@example.test', null);
insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-00000000a938', '00000000-0000-0000-0000-00000000c938', 'admin');

select lives_ok($$
  insert into auth.identities (id, user_id, provider, provider_id, identity_data)
  values ('00000000-0000-0000-0000-00000000d928', '00000000-0000-0000-0000-00000000b928', 'google', 'f11-subject',
          '{"sub":"f11-subject","email":"SAME.ADDRESS@example.test","email_verified":true}'::jsonb)
$$, 'a verified Google identity resolves to its provisioned user despite an equal email in another org');
select ok(not (shared.custom_access_token_hook(jsonb_build_object(
  'user_id', '00000000-0000-0000-0000-00000000b928', 'authentication_method', 'oauth',
  'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated'))) ? 'error'),
  'the OAuth token hook resolves the caller by user id rather than counting matching emails across orgs');
select throws_ok($$
  insert into shared.people (id, org_id, full_name, email)
  values ('00000000-0000-0000-0000-00000000c927', '00000000-0000-0000-0000-00000000a928', 'Duplicate in org', 'same.address@EXAMPLE.test')
$$, '23505', null, 'case-insensitive email uniqueness is enforced within one org');

set local role authenticated;
select ok(not has_function_privilege('authenticated', 'shared.role_authority_scope(text,text)', 'EXECUTE'),
  'the role-scope helper is not an authenticated RPC');
select ok(not has_function_privilege('authenticated', 'shared.is_designated_team_lead(uuid,uuid)', 'EXECUTE'),
  'the team-lead helper is not an authenticated RPC');
select ok(not has_schema_privilege('anon', 'shared', 'USAGE'),
  'anonymous sessions do not need schema access to shared');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-00000000a938","person_id":"00000000-0000-0000-0000-00000000c938","access_roles":["admin"]}');
select shared._count_active_admins();
select ok(exists (
  select 1 from pg_locks l
   where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.granted and l.objsubid = 1
     and l.classid = ((pg_catalog.hashtextextended('shared.active-admins:' || '00000000-0000-0000-0000-00000000a938', 0) >> 32) & 4294967295)::oid
     and l.objid = (pg_catalog.hashtextextended('shared.active-admins:' || '00000000-0000-0000-0000-00000000a938', 0) & 4294967295)::oid
), 'active-admin counting holds an org-keyed transaction lock');
select throws_ok($$ select shared.admin_create_login('00000000-0000-0000-0000-00000000c940', 'weak') $$,
  '22023', 'password does not meet the configured policy', 'login creation applies the configured password policy');
select throws_ok($$ select shared.admin_reset_password('00000000-0000-0000-0000-00000000c939', 'weak') $$,
  '22023', 'password does not meet the configured policy', 'password reset applies the configured password policy');
select throws_ok($$ select shared.admin_create_login('00000000-0000-0000-0000-00000000c941', 'GoodPass1') $$,
  '22023', 'email already in use', 'a global login-email conflict stays org-neutral');
select is((select user_id from shared.people where id = '00000000-0000-0000-0000-00000000c940'),
  null::uuid, 'a refused password leaves the person unlinked');

select ok(not has_table_privilege('authenticated', 'integrations.esb_push', 'UPDATE'),
  'authenticated has no table-wide UPDATE on the ERP outbox');
select ok(has_table_privilege('service_role', 'integrations.esb_push', 'UPDATE'),
  'the dispatch worker retains outbox UPDATE');
select ok(has_function_privilege('authenticated', 'api_private.json_date(jsonb,text)', 'EXECUTE'),
  'an api_private helper used by an api_v1 invoker remains executable');
select ok(has_function_privilege('authenticated', 'api_private._agent_fence(text)', 'EXECUTE'),
  'the pre-request fence can call its api_private helper as authenticated');

reset role;
select lives_ok($$ insert into mos.push_subscriptions (org_id, owner_id, endpoint)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','https://push.example/valid') $$,
  'an HTTPS push endpoint within the length cap is accepted');
select throws_ok($$ insert into mos.push_subscriptions (org_id, owner_id, endpoint)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','http://push.example/insecure') $$,
  '23514', null, 'an insecure push endpoint is refused');
select throws_ok($$ insert into mos.push_subscriptions (org_id, owner_id, endpoint)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','https://' || repeat('x', 2048)) $$,
  '23514', null, 'an overlong push endpoint is refused');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select lives_ok($$ insert into mos.tasks (id, org_id, title, business_unit_id, responsible_person_id,
  accountable_person_id, created_by, created_at, last_activity_at)
  values ('00000000-0000-0000-0000-00000000f140', '00000000-0000-0000-0000-0000000000a1', 'Stamped task',
    '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000d1',
    '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d1',
    '2000-01-01', '2000-01-01') $$, 'a member can create a valid task');
select ok((select created_at > '2000-01-01'::timestamptz and last_activity_at > '2000-01-01'::timestamptz
  from mos.tasks where id = '00000000-0000-0000-0000-00000000f140'),
  'task creation timestamps are stamped by the server, not the supplied values');
select is((select created_by from mos.tasks where id = '00000000-0000-0000-0000-00000000f140'),
  '00000000-0000-0000-0000-0000000000d1'::uuid, 'task creator attribution is stamped from the session person');
select throws_ok($$ update mos.tasks set created_at = '2000-01-01' where id = '00000000-0000-0000-0000-00000000f140' $$,
  '42501', null, 'created_at cannot be changed by an authenticated client');
select throws_ok($$ update mos.tasks set last_activity_at = '2000-01-01' where id = '00000000-0000-0000-0000-00000000f140' $$,
  '42501', null, 'last_activity_at cannot be changed by an authenticated client');
select throws_ok($$ update mos.tasks set created_by = '00000000-0000-0000-0000-0000000000d2' where id = '00000000-0000-0000-0000-00000000f140' $$,
  '42501', null, 'created_by remains immutable');
select lives_ok($$ insert into mos.task_events (org_id, task_id, actor_person_id, event_type)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000f140',
          '00000000-0000-0000-0000-0000000000d1','created') $$,
  'the task event path can still advance task activity');
select ok((select t.last_activity_at = e.created_at from mos.tasks t join mos.task_events e on e.task_id = t.id
  where t.id = '00000000-0000-0000-0000-00000000f140'),
  'the event-owned activity timestamp still matches its event');

reset role;
insert into shared.teams (id, org_id, business_unit_id, name, code)
values ('00000000-0000-0000-0000-000000009910','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000a2','Hardening Team','hardening_team');
insert into mos.work_lines (id, org_id, name, type, business_unit_id, accountable_person_id)
values ('00000000-0000-0000-0000-000000009911','00000000-0000-0000-0000-0000000000a1',
        'Hardening Process','process','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000d1');
insert into mos.process_task_defs (id, org_id, work_line_id, title, pic_person_id)
values ('00000000-0000-0000-0000-000000009913','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009911','Pending definition','00000000-0000-0000-0000-0000000000d1');
insert into mos.process_runs (id, org_id, work_line_id, owning_team_id, period_key, caption, scheduled_date, definition_version, spec_snapshot)
values ('00000000-0000-0000-0000-000000009914','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009911','00000000-0000-0000-0000-000000009910','f14','Hardening Run',current_date,1,'{}');
insert into mos.process_run_pending_tasks (id, org_id, process_run_id, task_def_id, reason)
values ('00000000-0000-0000-0000-000000009915','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000009914','00000000-0000-0000-0000-000000009913','none');
insert into mos.signals (id, org_id, author_id, audience, occurred_at, body)
values ('00000000-0000-0000-0000-000000009916','00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-0000000000d1','org',now(),'Org signal for scope checks');

select throws_ok($$ insert into mos.signals (org_id, author_id, audience, occurred_at, body)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','org',now(),repeat('s',4001)) $$,
  '23514', null, 'Signal text has a database-enforced length cap');
select throws_ok($$ insert into mos.comments (org_id, author_id, entity_type, entity_id, body)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d1','task',
          '00000000-0000-0000-0000-00000000f140',repeat('c',4001)) $$,
  '23514', null, 'comment text has a database-enforced length cap');
select throws_ok($$ insert into mos.tasks (org_id, title, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('00000000-0000-0000-0000-0000000000a1',repeat('t',301),'00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1') $$,
  '23514', null, 'task titles have a database-enforced length cap');
select throws_ok($$ insert into mos.tasks (org_id, title, description, business_unit_id, responsible_person_id, accountable_person_id, created_by)
  values ('00000000-0000-0000-0000-0000000000a1','Long description',repeat('d',2001),'00000000-0000-0000-0000-0000000000a2',
          '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d1') $$,
  '23514', null, 'task descriptions have a database-enforced length cap');
select throws_ok($$ insert into mos.process_task_defs (org_id, work_line_id, title, pic_person_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000009911',repeat('t',301),
          '00000000-0000-0000-0000-0000000000d1') $$,
  '23514', null, 'generated-task template titles have a database-enforced length cap');
select throws_ok($$ insert into mos.process_task_defs (org_id, work_line_id, title, description, pic_person_id)
  values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000009911','Long template',repeat('d',2001),
          '00000000-0000-0000-0000-0000000000d1') $$,
  '23514', null, 'generated-task template descriptions have a database-enforced length cap');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
select throws_ok($$ select mos.resolve_pending_task('00000000-0000-0000-0000-000000009915','00000000-0000-0000-0000-0000000000b4') $$,
  'P0002', 'pending item not found', 'foreign pending tasks share the missing-item response before row locking');
select throws_ok($$ select mos.resolve_pending_task('00000000-0000-0000-0000-000000009900','00000000-0000-0000-0000-0000000000b4') $$,
  'P0002', 'pending item not found', 'a missing pending task has the same response');
select throws_ok($$ select mos.transition_follow_up('00000000-0000-0000-0000-000000000e01','chase','{}'::jsonb) $$,
  'P0002', 'follow-up not found', 'foreign follow-ups share the missing-item response before row locking');
select throws_ok($$ select mos.transition_follow_up('00000000-0000-0000-0000-000000009900','chase','{}'::jsonb) $$,
  'P0002', 'follow-up not found', 'a missing follow-up has the same response');
select throws_ok($$ select mos.fan_out_signal_mention('00000000-0000-0000-0000-000000009916') $$,
  'P0002', 'signal not found', 'foreign Signals share the missing-item response before row lookup');
select throws_ok($$ select mos.fan_out_signal_mention('00000000-0000-0000-0000-000000009900') $$,
  'P0002', 'signal not found', 'a missing Signal has the same response');

reset role;
select * from finish();
rollback;
