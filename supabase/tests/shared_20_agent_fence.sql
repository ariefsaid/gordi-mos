-- shared — the agent fence (#1005, ADR-0060 D3/D4/D5): the data-API pre-request function, the
-- trusted-agent-client allow-list, the `agent.connect` authority action and the access-token hook's
-- client branch. AC-020 … AC-024 and AC-026, plus the table rules.
--
-- The OAuth server stays off in this repo, so an agent token is simulated the way the data API
-- presents it: request claims carrying `client_id`, and the search path PostgREST sets for the
-- request (the schema named by the profile header comes first, quoted, comma+space separated).
--
-- Personas (shared._test_seed_directory + _test_seed_access_roles), org a1:
--   d3 admin (agent.connect by default)      d1 member+finance (not by default)
-- Org b1 has its own person b4 and its own allow-list rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(77);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

-- ── fixtures (as postgres) ───────────────────────────────────────────────────────────────────
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aa03') on conflict (id) do nothing;
update shared.people set user_id = '00000000-0000-0000-0000-00000000aa03' where id = '00000000-0000-0000-0000-0000000000d3';
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-000000005e01', '00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-00000000aa03');
-- an expired session for d1
insert into auth.sessions (id, user_id, not_after) values
  ('00000000-0000-0000-0000-000000005e0f', '00000000-0000-0000-0000-00000000aa01', now() - interval '1 minute');

insert into shared.trusted_agent_clients (org_id, client_id, display_name, enabled) values
  ('00000000-0000-0000-0000-0000000000a1', 'client-good', 'Good Agent', true),
  ('00000000-0000-0000-0000-0000000000a1', 'client-off',  'Switched-off Agent', false),
  ('00000000-0000-0000-0000-0000000000b1', 'client-b',    'Org B Agent', true);
update shared.agent_access_settings set mcp_resource = 'https://mcp.example.test/mcp';

-- Present a request the way the data API does: claims first, then the request schema.
create function public._t_req(p_person uuid, p_roles text, p_client text, p_sess text, p_sub uuid,
                              p_org uuid default '00000000-0000-0000-0000-0000000000a1')
returns void language sql as $$
  select set_config('request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object(
      'role', 'authenticated', 'sub', p_sub, 'session_id', p_sess, 'client_id', p_client,
      'org_id', p_org, 'person_id', p_person, 'access_roles', p_roles::jsonb))::text, true)
$$;
create function public._t_schema(p_schema text) returns void language sql as $$
  select set_config('search_path', '"' || p_schema || '", "public", "extensions"', true)
$$;

-- ── schema posture ───────────────────────────────────────────────────────────────────────────
select has_table('shared', 'trusted_agent_clients', 'the trusted-agent allow-list exists');
select has_table('shared', 'agent_access_settings', 'the resource-identifier setting exists');
select is(
  (select count(*)::int from shared.agent_access_settings), 1,
  'the setting is a single row');
select throws_ok(
  $$ insert into shared.agent_access_settings (singleton, mcp_resource) values (false, 'x') $$,
  '23514', null, 'a second settings row cannot be created');

select ok(
  exists (select 1 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
           where r.rolname = 'authenticator' and s.setdatabase = 0
             and 'pgrst.db_pre_request=api_private.check_request' = any(s.setconfig)),
  'AC-026: the fence is configured on the authenticator role by migration');

select is(
  (select p.prosecdef from pg_proc p
    where p.oid = 'api_private.check_request()'::regprocedure),
  false, 'the fence entry point is SECURITY INVOKER (it must read the request search path)');
select is(
  (select p.proconfig from pg_proc p
    where p.oid = 'api_private.check_request()'::regprocedure) is null,
  true, 'the fence entry point pins no search_path of its own (that would hide the request schema)');
select is(
  (select p.prosecdef and coalesce('search_path=""' = any(p.proconfig), false)
     from pg_proc p where p.oid = 'api_private._agent_fence(text)'::regprocedure),
  true, 'the fence helper is SECURITY DEFINER with an empty search_path');

-- AC-026 — the fence functions: authenticated executes, nobody else does (checked below for the
-- catalog as a whole in api_v1_01_catalog_contract).
select is(
  (select array_agg(g order by g) from (
     select r.rolname::text as g from pg_roles r
      where has_function_privilege(r.oid, 'api_private.check_request()'::regprocedure, 'execute')
        and r.rolname in ('anon', 'authenticated', 'service_role', 'supabase_auth_admin')) x),
  array['anon', 'authenticated', 'service_role'],
  'AC-026: the fence is executable by the three request roles (anon passes untouched) and nobody else');
select is(
  (select array_agg(r.rolname::text order by r.rolname) from pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
      and has_schema_privilege(r.oid, 'api_private', 'usage')),
  array['anon', 'authenticated', 'service_role'],
  'the data API can resolve the fence: the three request roles hold USAGE on api_private');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api_private'
      and p.oid not in ('api_private.check_request()'::regprocedure, 'api_private.claims_carry_client_id()'::regprocedure)
      and has_function_privilege('anon', p.oid, 'execute')),
  0, 'anon can execute nothing else in api_private but the fence and the claim rule it calls');
select is(
  (select count(*)::int from aclexplode((select proacl from pg_proc
     where oid = 'api_private.check_request()'::regprocedure)) a where a.grantee = 0),
  0, 'AC-026: no PUBLIC execute on the fence');

-- ── AC-020: app-shaped claims pass without effect, whatever the schema ───────────────────────
set local role authenticated;
select public._t_schema('mos');
select set_config('request.jwt.claims',
  '{"role":"authenticated","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}', true);
select lives_ok($$ select api_private.check_request() $$, 'AC-020: app claims, mos schema -> passes');
select public._t_schema('shared');
select lives_ok($$ select api_private.check_request() $$, 'AC-020: app claims, shared schema -> passes');
select set_config('request.jwt.claims', null, true);
select lives_ok($$ select api_private.check_request() $$, 'AC-020: no claims setting at all -> passes');
reset role;
set local role anon;
select public._t_schema('mos');
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$ select api_private.check_request() $$, 'AC-020: an anon request with anon claims runs as anon and passes');
select set_config('request.jwt.claims', '', true);
select lives_ok($$ select api_private.check_request() $$, 'AC-020: an anon request with empty claims passes');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","client_id":null}', true);
select throws_ok($$ select api_private.check_request() $$, 'PT403', null,
  'a null client_id claim is still an agent shape and is refused, never waved through');

-- ── AC-021: enabled client + live session + agent.connect → api_v1 passes, others 403 ─────────
select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-00000000aa03');
select public._t_schema('api_v1');
select lives_ok($$ select api_private.check_request() $$, 'AC-021: agent request for api_v1 passes');
select set_config('search_path', 'api_v1, public, extensions', true);
select lives_ok($$ select api_private.check_request() $$, 'AC-021: the unquoted search-path form reads the same');
select set_config('search_path', 'api_v1, extensions', true);
select lives_ok($$ select api_private.check_request() $$, 'AC-021: a search path without public reads the same');

select public._t_schema('mos');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null, 'AC-021: agent request for mos -> 403');
select public._t_schema('shared');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null, 'AC-021: agent request for shared -> 403');
select public._t_schema('ops');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null, 'AC-021: agent request for ops -> 403');
select public._t_schema('reporting');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null, 'AC-021: agent request for reporting -> 403');
select public._t_schema('integrations');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null, 'AC-021: agent request for integrations -> 403');
select public._t_schema('graphql_public');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null, 'AC-021: agent request for graphql_public -> 403');
select public._t_schema('public');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null,
  'AC-021: agent request with no profile header (default schema) -> 403');
select public._t_schema('api_v10');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null, 'a schema that merely starts with api_v1 is not api_v1 -> 403');
select set_config('search_path', 'public, api_v1, extensions', true);
select throws_ok($$ select api_private.check_request() $$, 'PT403', null,
  'api_v1 later in the path does not count: only the first entry is the request schema');

-- the refusal says nothing about why
select public._t_schema('mos');
select throws_ok($$ select api_private.check_request() $$, 'PT403', 'Not available to agent sessions.',
  'the schema refusal is generic');

-- ── AC-022: disabled client, unknown client, other-org client, dead session → 401 ────────────
select public._t_schema('api_v1');
select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-off',
                     '00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-00000000aa03');
select throws_ok($$ select api_private.check_request() $$, 'PT401', null, 'AC-022: a disabled client -> 401');
select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-unknown',
                     '00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-00000000aa03');
select throws_ok($$ select api_private.check_request() $$, 'PT401', null, 'AC-022: a client not on the list -> 401');
select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-b',
                     '00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-00000000aa03');
select throws_ok($$ select api_private.check_request() $$, 'PT401', null,
  'AC-022: a client enabled for another org only -> 401');
select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e99', '00000000-0000-0000-0000-00000000aa03');
select throws_ok($$ select api_private.check_request() $$, 'PT401', null, 'AC-022: a session that no longer exists -> 401');
select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e01', '00000000-0000-0000-0000-00000000aa03');
select throws_ok($$ select api_private.check_request() $$, 'PT401', null,
  'AC-022: a session that belongs to another user -> 401');
select public._t_req('00000000-0000-0000-0000-0000000000d1', '["member"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e0f', '00000000-0000-0000-0000-00000000aa01');
select throws_ok($$ select api_private.check_request() $$, 'PT401', null, 'AC-022: an expired session -> 401');
select set_config('request.jwt.claims',
  '{"role":"authenticated","client_id":"client-good","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","sub":"00000000-0000-0000-0000-00000000aa03","access_roles":["admin"]}', true);
select throws_ok($$ select api_private.check_request() $$, 'PT401', null, 'AC-022: no session_id claim -> 401');
select set_config('request.jwt.claims',
  '{"role":"authenticated","client_id":"client-good","session_id":"not-a-uuid","sub":"00000000-0000-0000-0000-00000000aa03","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}', true);
select throws_ok($$ select api_private.check_request() $$, 'PT401', null,
  'AC-022: a malformed session_id is a clean 401, never a cast error');
select set_config('request.jwt.claims',
  '{"role":"authenticated","client_id":"client-good","session_id":"00000000-0000-0000-0000-000000005e03","sub":"00000000-0000-0000-0000-00000000aa03","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}', true);
select throws_ok($$ select api_private.check_request() $$, 'PT401', null, 'AC-022: no org claim -> 401');
select throws_ok($$ select api_private.check_request() $$, 'PT401', 'Agent session is not valid.',
  'the session refusal is generic');

-- ── AC-023: agent.connect at its default, then widened by an admin ───────────────────────────
select public._t_req('00000000-0000-0000-0000-0000000000d1', '["member","finance"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e01', '00000000-0000-0000-0000-00000000aa01');
select throws_ok($$ select api_private.check_request() $$, 'PT403',
  'Agent access isn''t switched on for you yet.',
  'AC-023: a member at the default -> 403 with the plain sentence');

select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-00000000aa03');
select lives_ok(
  $$ select shared.save_role_authority('[{"action":"agent.connect","role":"member","scope":"org"}]'::jsonb) $$,
  'an admin widens agent.connect to members');
select public._t_req('00000000-0000-0000-0000-0000000000d1', '["member","finance"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e01', '00000000-0000-0000-0000-00000000aa01');
select lives_ok($$ select api_private.check_request() $$, 'AC-023: after widening, the member passes');

select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-00000000aa03');
select lives_ok(
  $$ select shared.save_role_authority('[{"action":"agent.connect","role":"member","scope":"none"}]'::jsonb) $$,
  'an admin narrows it again');
select public._t_req('00000000-0000-0000-0000-0000000000d1', '["member","finance"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e01', '00000000-0000-0000-0000-00000000aa01');
select throws_ok($$ select api_private.check_request() $$, 'PT403', null,
  'AC-023: narrowing bites on the very next request');

-- The matrix itself
select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', 'client-good',
                     '00000000-0000-0000-0000-000000005e03', '00000000-0000-0000-0000-00000000aa03');
select is(
  (select string_agg(role || '=' || scope, ',' order by role)
     from shared.list_role_authority() where action = 'agent.connect' and scope <> 'none'),
  'admin=org', 'agent.connect defaults to the admin category, org-wide, and nobody else');
select is(
  (select count(*)::int from shared.list_role_authority() where action = 'agent.connect'), 8,
  'agent.connect has a row for each of the eight categories');
select throws_ok(
  $$ select shared.save_role_authority('[{"action":"agent.connect","role":"member","scope":"own_bu"}]'::jsonb) $$,
  '22023', null, 'agent.connect admits only none or org');
select throws_ok(
  $$ select shared.save_role_authority('[{"action":"agent.connect","role":"admin","scope":"none"}]'::jsonb) $$,
  '42501', null, 'the admin category cannot switch agent.connect off for itself');

-- ── the trusted-agent allow-list: RLS and org seam ───────────────────────────────────────────
select public._t_schema('shared');
select public._t_req('00000000-0000-0000-0000-0000000000d1', '["member","finance"]', null,
                     null, '00000000-0000-0000-0000-00000000aa01');
select is((select count(*)::int from shared.trusted_agent_clients), 2, 'a member reads only their own org''s two rows (the foreign org is hidden)');
select throws_ok(
  $$ insert into shared.trusted_agent_clients (client_id, display_name) values ('client-x', 'X') $$,
  '42501', null, 'a non-admin cannot add a trusted client');
update shared.trusted_agent_clients set enabled = false where client_id = 'client-good';
select is((select enabled from shared.trusted_agent_clients where client_id = 'client-good'), true,
  'a non-admin cannot switch a client off');

select public._t_req('00000000-0000-0000-0000-0000000000d3', '["admin"]', null,
                     null, '00000000-0000-0000-0000-00000000aa03');
select lives_ok(
  $$ insert into shared.trusted_agent_clients (client_id, display_name) values ('client-new', 'New Agent') $$,
  'an admin adds a trusted client');
select is(
  (select org_id || '/' || added_by from shared.trusted_agent_clients where client_id = 'client-new'),
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-0000000000d3',
  'the org and the adder are stamped by the server');
select is((select enabled from shared.trusted_agent_clients where client_id = 'client-new'), false,
  'a new client starts switched off: registration alone grants nothing');
select throws_ok(
  $$ insert into shared.trusted_agent_clients (org_id, client_id, display_name)
     values ('00000000-0000-0000-0000-0000000000b1', 'client-y', 'Y') $$,
  '42501', null, 'an admin cannot add a client to a foreign org');
select throws_ok(
  $$ insert into shared.trusted_agent_clients (client_id, display_name) values ('  ', 'Blank') $$,
  '23514', null, 'a blank client id is refused');
select lives_ok(
  $$ update shared.trusted_agent_clients set enabled = true, display_name = 'New Agent v2' where client_id = 'client-new' $$,
  'an admin switches a client on and renames it');
select throws_ok(
  $$ update shared.trusted_agent_clients set client_id = 'renamed' where client_id = 'client-new' $$,
  '42501', null, 'the client id is immutable');
select throws_ok(
  $$ update shared.trusted_agent_clients set org_id = '00000000-0000-0000-0000-0000000000b1' where client_id = 'client-new' $$,
  '42501', null, 'the org is immutable');
select throws_ok(
  $$ delete from shared.trusted_agent_clients where client_id = 'client-new' $$,
  '42501', null, 'a client is switched off, never deleted');
select is(
  (select count(*)::int from shared.trusted_agent_clients where org_id = '00000000-0000-0000-0000-0000000000b1'), 0,
  'the admin of org a1 cannot read org b1''s rows');
select throws_ok($$ select * from shared.agent_access_settings $$, '42501', null,
  'no app role can read the resource setting');

reset role;
set local role anon;
select throws_ok($$ select * from shared.trusted_agent_clients $$, '42501', null, 'anon cannot read the allow-list');
reset role;

-- ── AC-024: the access-token hook ────────────────────────────────────────────────────────────
-- The hook sees the user id and the claims the login service is about to sign.
select is(
  (select r.claims->>'aud' from (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'sub', '00000000-0000-0000-0000-00000000aa01'))) -> 'claims' as claims) r),
  'authenticated', 'AC-024: without client_id the audience is untouched');
select is(
  (select (shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'sub', '00000000-0000-0000-0000-00000000aa01'))) -> 'claims') ?& array['org_id','person_id','access_roles']),
  true, 'AC-024: without client_id the person claims are still added as before');
select ok(
  not (shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated'))) ? 'error'),
  'AC-024: without client_id there is no error');

select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'client_id', 'client-good'))) -> 'claims' ->> 'aud'),
  'https://mcp.example.test/mcp', 'AC-024: an enabled client gets the configured resource as aud');
select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'client_id', 'client-good'))) -> 'claims' ->> 'role'),
  'authenticated', 'AC-024: role stays authenticated');
select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'client_id', 'client-good'))) -> 'claims' ->> 'person_id'),
  '00000000-0000-0000-0000-0000000000d1', 'AC-024: the person claims are intact on an agent token');

select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'client_id', 'client-off'))) -> 'error' ->> 'http_code'),
  '403', 'AC-024: a disabled client is refused with an http_code error, never a raise');
select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'client_id', 'client-b'))) -> 'error' ->> 'http_code'),
  '403', 'AC-024: a client enabled for another org only is refused');
select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000ffff',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'client_id', 'client-good'))) -> 'error' ->> 'http_code'),
  '403', 'AC-024: an agent token for a user with no live person is refused');
select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'client_id', 'client-off'))) -> 'error' ->> 'message'),
  'Agent access is not available.', 'the hook refusal is generic');

update shared.agent_access_settings set mcp_resource = null;
select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated',
                                   'client_id', 'client-good'))) -> 'error' ->> 'http_code'),
  '403', 'AC-024: with no resource identifier configured the hook refuses to mint an agent token');
select is(
  (select shared.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-0000-0000-00000000aa01',
      'claims', jsonb_build_object('aud', 'authenticated', 'role', 'authenticated'))) -> 'claims' ->> 'aud'),
  'authenticated', 'an unset resource does not touch app tokens');

select * from finish();
rollback;
