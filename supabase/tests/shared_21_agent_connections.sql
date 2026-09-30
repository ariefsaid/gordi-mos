-- Connected-agent administration (#1062, ADR-0060 D4/D8).
-- All rows, including Auth sessions and refresh tokens, are transactional fixtures and roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

-- The directory seeds Author (aa01) and Admin (aa03 is attached here); add a second-org person.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000aa03'),
  ('00000000-0000-0000-0000-00000000aa04')
on conflict (id) do nothing;
update shared.people set user_id = '00000000-0000-0000-0000-00000000aa03'
 where id = '00000000-0000-0000-0000-0000000000d3';
update shared.people set user_id = '00000000-0000-0000-0000-00000000aa04'
 where id = '00000000-0000-0000-0000-0000000000b4';

-- OAuth client IDs are Auth UUID primary keys. The same client is explicitly trusted in both orgs
-- and has consents on each side: no org-A admin response may reveal the foreign person's consent.
insert into auth.oauth_clients
  (id, client_secret_hash, registration_type, redirect_uris, grant_types, client_name, token_endpoint_auth_method)
values
  ('33333333-3333-4333-8333-333333333333', 'fixture-hash-a', 'manual',
   'https://agent-a.example.test/callback', 'authorization_code,refresh_token', 'Untrusted Auth Metadata A', 'client_secret_basic'),
  ('44444444-4444-4444-8444-444444444444', 'fixture-hash-b', 'manual',
   'https://agent-b.example.test/callback', 'authorization_code,refresh_token', 'Untrusted Auth Metadata B', 'client_secret_basic');

insert into shared.trusted_agent_clients (org_id, client_id, display_name, enabled) values
  ('00000000-0000-0000-0000-0000000000a1', '33333333-3333-4333-8333-333333333333', 'Verified Assistant', true),
  ('00000000-0000-0000-0000-0000000000a1', '44444444-4444-4444-8444-444444444444', 'Second Assistant', true),
  ('00000000-0000-0000-0000-0000000000a1', '55555555-5555-4555-8555-555555555555', 'No connections', false),
  ('00000000-0000-0000-0000-0000000000b1', '33333333-3333-4333-8333-333333333333', 'Org B label', true);

insert into auth.oauth_consents (id, user_id, client_id, scopes, granted_at) values
  ('66666666-6666-4666-8666-666666666601', '00000000-0000-0000-0000-00000000aa01', '33333333-3333-4333-8333-333333333333', 'openid profile', '2026-09-01T10:30:00Z'),
  ('66666666-6666-4666-8666-666666666602', '00000000-0000-0000-0000-00000000aa01', '44444444-4444-4444-8444-444444444444', 'openid email', '2026-09-02T10:30:00Z'),
  ('66666666-6666-4666-8666-666666666603', '00000000-0000-0000-0000-00000000aa03', '33333333-3333-4333-8333-333333333333', 'openid profile', '2026-09-03T10:30:00Z'),
  ('66666666-6666-4666-8666-666666666604', '00000000-0000-0000-0000-00000000aa04', '33333333-3333-4333-8333-333333333333', 'openid email', '2026-09-04T10:30:00Z');

insert into auth.sessions (id, user_id, oauth_client_id) values
  ('5a010000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-00000000aa01', '33333333-3333-4333-8333-333333333333'),
  ('5a010000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-00000000aa01', '33333333-3333-4333-8333-333333333333'),
  ('5a010000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-00000000aa01', '44444444-4444-4444-8444-444444444444'),
  ('5a010000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-00000000aa03', '33333333-3333-4333-8333-333333333333'),
  ('5a010000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-00000000aa01', null),
  ('5a010000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-00000000aa04', '33333333-3333-4333-8333-333333333333');

insert into auth.refresh_tokens (session_id, token, user_id, revoked) values
  ('5a010000-0000-4000-8000-000000000001', 'fixture-refresh-a1', '00000000-0000-0000-0000-00000000aa01', false),
  ('5a010000-0000-4000-8000-000000000002', 'fixture-refresh-a2', '00000000-0000-0000-0000-00000000aa01', false),
  ('5a010000-0000-4000-8000-000000000003', 'fixture-refresh-b1', '00000000-0000-0000-0000-00000000aa01', false),
  ('5a010000-0000-4000-8000-000000000006', 'fixture-refresh-foreign', '00000000-0000-0000-0000-00000000aa04', false);

-- Schema and role posture: both RPCs are definer-owned with a pinned empty path; only authenticated
-- can call them, and the internal audit table is not readable by app/service roles.
select has_table('api_private', 'agent_connection_admin_events', 'the revocation audit table exists');
select has_function('shared', 'admin_list_agent_connections', array[]::text[], 'the admin connection list RPC exists');
select has_function('shared', 'admin_revoke_agent_connection', array['uuid','text'], 'the admin revoke RPC exists');
select is((select prosecdef from pg_proc where oid = 'shared.admin_list_agent_connections()'::regprocedure), true,
  'the list RPC is SECURITY DEFINER');
select is((select prosecdef from pg_proc where oid = 'shared.admin_revoke_agent_connection(uuid,text)'::regprocedure), true,
  'the revoke RPC is SECURITY DEFINER');
select ok((select proconfig from pg_proc where oid = 'shared.admin_list_agent_connections()'::regprocedure) @> array['search_path=""'],
  'the list RPC pins an empty search_path');
select ok((select proconfig from pg_proc where oid = 'shared.admin_revoke_agent_connection(uuid,text)'::regprocedure) @> array['search_path=""'],
  'the revoke RPC pins an empty search_path');
select ok(has_function_privilege('authenticated', 'shared.admin_list_agent_connections()', 'execute'),
  'authenticated can call the admin list RPC');
select ok(not has_function_privilege('anon', 'shared.admin_list_agent_connections()', 'execute'),
  'anon cannot call the admin list RPC');
select ok(not has_function_privilege('service_role', 'shared.admin_list_agent_connections()', 'execute'),
  'service_role has no ambient execution grant for the admin list RPC');
select ok(has_function_privilege('authenticated', 'shared.admin_revoke_agent_connection(uuid,text)', 'execute'),
  'authenticated can call the revoke RPC and the function enforces admin role');
select ok(not has_function_privilege('service_role', 'shared.admin_revoke_agent_connection(uuid,text)', 'execute'),
  'service_role has no ambient execution grant for the admin revoke RPC');
select ok(not has_table_privilege('service_role', 'api_private.agent_connection_admin_events', 'select'),
  'service_role cannot read the internal audit table');
select ok((select r.rolbypassrls from pg_proc p join pg_roles r on r.oid = p.proowner
  where p.oid = 'shared.admin_revoke_agent_connection(uuid,text)'::regprocedure),
  'the definer owner bypasses forced RLS on the private append-only audit table');

-- Admin sees all apps including the disconnected one, active same-org grants only, and the
-- allow-list's display name rather than Auth's untrusted client metadata.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000aa03","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}', true);
select is((select count(*)::int from shared.admin_list_agent_connections()), 4,
  'admin list includes the three trusted apps plus their same-org active connections');
select is((select count(*)::int from shared.admin_list_agent_connections()
  where client_id = '33333333-3333-4333-8333-333333333333'), 2,
  'same globally shared client lists only the two org-A connections, not org B');
select is((select min(display_name) from shared.admin_list_agent_connections()
  where client_id = '33333333-3333-4333-8333-333333333333'), 'Verified Assistant',
  'display name is sourced from this organization''s trusted-app record');
select is((select count(*)::int from shared.admin_list_agent_connections()
  where person_id is null and client_id = '55555555-5555-4555-8555-555555555555'), 1,
  'an app with no active connections still appears');

-- Membership alone cannot enumerate other people's app access or invoke admin revocation.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000aa01","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}', true);
select throws_ok($$ select * from shared.admin_list_agent_connections() $$, '42501', null,
  'a non-admin cannot list organization-wide connections');
select throws_ok($$ select shared.admin_revoke_agent_connection('00000000-0000-0000-0000-0000000000d3','33333333-3333-4333-8333-333333333333') $$, '42501', null,
  'a member cannot revoke another person''s connection');

-- Back as org-A admin: foreign-person requests and malformed client IDs are no-ops.
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000aa03","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}', true);
select is(shared.admin_revoke_agent_connection('00000000-0000-0000-0000-0000000000b4','33333333-3333-4333-8333-333333333333'), false,
  'org-A admin cannot target a connected person from org B even when the app ID is globally shared');
select is(shared.admin_revoke_agent_connection('00000000-0000-0000-0000-0000000000d1','not-a-uuid'), false,
  'malformed client IDs fail closed without a cast error');
select throws_ok($$ insert into shared.trusted_agent_clients (client_id, display_name)
  values ('A3333333-3333-4333-8333-333333333333', 'Uppercase UUID') $$,
  '23514', null, 'the database rejects noncanonical uppercase OAuth UUID client IDs');

-- The supported Auth user endpoint has no admin form. The RPC mirrors its v2.189.0 transaction:
-- revoke one consent, delete every session for only that user+client, cascade refresh tokens, audit.
select is(shared.admin_revoke_agent_connection('00000000-0000-0000-0000-0000000000d1','33333333-3333-4333-8333-333333333333'), true,
  'admin revokes the selected person and client');
-- Auth tables and the private audit table are not readable by app roles: inspect them as the owner.
reset role;
select ok((select revoked_at is not null from auth.oauth_consents
  where user_id = '00000000-0000-0000-0000-00000000aa01'
    and client_id = '33333333-3333-4333-8333-333333333333'),
  'selected consent is marked revoked');
set local role authenticated;
select is((select count(*)::int from shared.admin_list_agent_connections()
  where client_id = '33333333-3333-4333-8333-333333333333'
    and person_id = '00000000-0000-0000-0000-0000000000d1'), 0,
  'admin listing omits a consent after it is revoked');
reset role;
select is((select count(*)::int from auth.sessions
  where user_id = '00000000-0000-0000-0000-00000000aa01'
    and oauth_client_id = '33333333-3333-4333-8333-333333333333'), 0,
  'all sessions for exactly that person and client are deleted');
select is((select count(*)::int from auth.sessions where id = '5a010000-0000-4000-8000-000000000003'), 1,
  'the same person''s other-client session is untouched');
select is((select count(*)::int from auth.sessions where id = '5a010000-0000-4000-8000-000000000004'), 1,
  'another person''s same-client session is untouched');
select is((select count(*)::int from auth.sessions where id = '5a010000-0000-4000-8000-000000000005'), 1,
  'the person''s ordinary app session is untouched');
select is((select count(*)::int from auth.sessions where id = '5a010000-0000-4000-8000-000000000006'), 1,
  'the other organization''s same-client session is untouched');
select is((select count(*)::int from auth.refresh_tokens
  where session_id in ('5a010000-0000-4000-8000-000000000001','5a010000-0000-4000-8000-000000000002')), 0,
  'matching refresh tokens are deleted by Auth''s session cascade');
select is((select count(*)::int from auth.refresh_tokens where session_id = '5a010000-0000-4000-8000-000000000003'), 1,
  'another-client refresh token is untouched');
select is((select count(*)::int from auth.refresh_tokens where session_id = '5a010000-0000-4000-8000-000000000006'), 1,
  'the foreign user refresh token is untouched');
select is((select count(*)::int from api_private.agent_connection_admin_events), 1,
  'successful admin revocation appends one private audit event');
set local role authenticated;
select is(shared.admin_revoke_agent_connection('00000000-0000-0000-0000-0000000000d1','33333333-3333-4333-8333-333333333333'), false,
  'repeating a completed revoke is idempotent and reports no new change');
reset role;
select is((select count(*)::int from api_private.agent_connection_admin_events), 1,
  'idempotent repeat does not duplicate the audit event');

-- Simulate the very next data-API request from the revoked access token. D5 checks session_id in
-- auth.sessions before authority; the deleted session fails as an invalid agent session.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000aa01","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"],"client_id":"33333333-3333-4333-8333-333333333333","session_id":"5a010000-0000-4000-8000-000000000001"}', true);
select set_config('search_path', '"api_v1", "public", "extensions"', true);
select throws_ok($$ select api_private.check_request() $$, 'PT401', null,
  'the revoked agent token is denied on its next api_v1 request');
reset role;

set local role anon;
select throws_ok($$ select * from shared.admin_list_agent_connections() $$, '42501', null,
  'anon cannot execute the admin list RPC');
reset role;

select * from finish();
rollback;
