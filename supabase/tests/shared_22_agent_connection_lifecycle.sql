-- Agent connections end with the thing that authorised them (#1063). Switching an agent app off for
-- an organization, or archiving a person, revokes the matching Auth consents and deletes the matching
-- agent sessions (and their refresh tokens) in the same transaction. Switching back on, or
-- unarchiving, revives nothing: the old session is still refused by the data API fence.
-- All Auth rows are transactional fixtures and roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000aa03'),
  ('00000000-0000-0000-0000-00000000aa04')
on conflict (id) do nothing;
update shared.people set user_id = '00000000-0000-0000-0000-00000000aa03'
 where id = '00000000-0000-0000-0000-0000000000d3';
update shared.people set user_id = '00000000-0000-0000-0000-00000000aa04'
 where id = '00000000-0000-0000-0000-0000000000b4';

insert into auth.oauth_clients
  (id, client_secret_hash, registration_type, redirect_uris, grant_types, client_name, token_endpoint_auth_method)
values
  ('33333333-3333-4333-8333-333333333333', 'fixture-hash-a', 'manual',
   'https://agent-a.example.test/callback', 'authorization_code,refresh_token', 'Fixture A', 'client_secret_basic'),
  ('44444444-4444-4444-8444-444444444444', 'fixture-hash-b', 'manual',
   'https://agent-b.example.test/callback', 'authorization_code,refresh_token', 'Fixture B', 'client_secret_basic');

-- The same OAuth client is trusted by both organizations; org B's person holds a connection to it too.
insert into shared.trusted_agent_clients (org_id, client_id, display_name, enabled) values
  ('00000000-0000-0000-0000-0000000000a1', '33333333-3333-4333-8333-333333333333', 'Assistant A', true),
  ('00000000-0000-0000-0000-0000000000a1', '44444444-4444-4444-8444-444444444444', 'Assistant B', true),
  ('00000000-0000-0000-0000-0000000000b1', '33333333-3333-4333-8333-333333333333', 'Org B label', true);
update shared.agent_access_settings set mcp_resource = 'https://mcp.example.test/mcp';

-- d1 (aa01) and d3 admin (aa03) in org A, b4 (aa04) in org B.
insert into auth.oauth_consents (id, user_id, client_id, scopes, granted_at) values
  ('66666666-6666-4666-8666-666666666701', '00000000-0000-0000-0000-00000000aa01', '33333333-3333-4333-8333-333333333333', 'openid', now()),
  ('66666666-6666-4666-8666-666666666702', '00000000-0000-0000-0000-00000000aa01', '44444444-4444-4444-8444-444444444444', 'openid', now()),
  ('66666666-6666-4666-8666-666666666703', '00000000-0000-0000-0000-00000000aa03', '33333333-3333-4333-8333-333333333333', 'openid', now()),
  ('66666666-6666-4666-8666-666666666704', '00000000-0000-0000-0000-00000000aa04', '33333333-3333-4333-8333-333333333333', 'openid', now());
insert into auth.sessions (id, user_id, oauth_client_id) values
  ('5a020000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-00000000aa01', '33333333-3333-4333-8333-333333333333'),
  ('5a020000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-00000000aa01', '44444444-4444-4444-8444-444444444444'),
  ('5a020000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-00000000aa03', '33333333-3333-4333-8333-333333333333'),
  ('5a020000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-00000000aa01', null),
  ('5a020000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-00000000aa04', '33333333-3333-4333-8333-333333333333');
insert into auth.refresh_tokens (session_id, token, user_id, revoked) values
  ('5a020000-0000-4000-8000-000000000001', 'lifecycle-rt-1', '00000000-0000-0000-0000-00000000aa01', false),
  ('5a020000-0000-4000-8000-000000000002', 'lifecycle-rt-2', '00000000-0000-0000-0000-00000000aa01', false),
  ('5a020000-0000-4000-8000-000000000003', 'lifecycle-rt-3', '00000000-0000-0000-0000-00000000aa03', false),
  ('5a020000-0000-4000-8000-000000000005', 'lifecycle-rt-5', '00000000-0000-0000-0000-00000000aa04', false);

-- What the data API fence answers for d1 on a given agent session: 'passes', or the error code.
create function public._t_fence(p_session text, p_client text) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'role', 'authenticated', 'sub', '00000000-0000-0000-0000-00000000aa01', 'session_id', p_session,
    'client_id', p_client, 'org_id', '00000000-0000-0000-0000-0000000000a1',
    'person_id', '00000000-0000-0000-0000-0000000000d1', 'access_roles', '["admin"]'::jsonb)::text, true);
  perform set_config('search_path', '"api_v1", "public", "extensions"', true);
  perform api_private.check_request();
  return 'passes';
exception when others then return sqlstate;
end $$;
grant execute on function public._t_fence(text, text) to authenticated;

-- ── posture ──────────────────────────────────────────────────────────────────────────────────
select is((select count(*)::int from pg_proc p
            where p.oid in ('api_private._end_agent_connections(uuid,uuid,uuid)'::regprocedure,
                            'shared._end_agent_connections_on_client_off()'::regprocedure,
                            'shared._end_agent_connections_on_person_archive()'::regprocedure)
              and p.prosecdef and 'search_path=""' = any(p.proconfig)), 3,
  'the three lifecycle functions are SECURITY DEFINER with an empty search_path');
select is((select count(*)::int from pg_proc p, pg_roles r
            where p.oid in ('api_private._end_agent_connections(uuid,uuid,uuid)'::regprocedure,
                            'shared._end_agent_connections_on_client_off()'::regprocedure,
                            'shared._end_agent_connections_on_person_archive()'::regprocedure)
              and r.rolname in ('anon', 'authenticated', 'service_role')
              and has_function_privilege(r.oid, p.oid, 'execute')), 0,
  'no request role executes a lifecycle function directly');

-- ── before: the app-A session passes the fence ───────────────────────────────────────────────
set local role authenticated;
select is(public._t_fence('5a020000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333'), 'passes',
  'a live agent session for an enabled app passes the fence');
reset role;

-- ── switching an app off, by an admin ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000aa03","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}', true);
select lives_ok($$ update shared.trusted_agent_clients set enabled = false
  where client_id = '33333333-3333-4333-8333-333333333333' and org_id = '00000000-0000-0000-0000-0000000000a1' $$,
  'an admin switches the app off for the organization');
reset role;

select is((select count(*)::int from auth.oauth_consents
            where client_id = '33333333-3333-4333-8333-333333333333' and revoked_at is not null
              and user_id in ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000aa03')), 2,
  'both org-A consents for the app are revoked');
select is((select count(*)::int from auth.sessions
            where oauth_client_id = '33333333-3333-4333-8333-333333333333'
              and user_id in ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000aa03')), 0,
  'both org-A sessions for the app are deleted');
select is((select count(*)::int from auth.refresh_tokens where token in ('lifecycle-rt-1', 'lifecycle-rt-3')), 0,
  'their refresh tokens are gone with the sessions');
select is((select count(*)::int from auth.oauth_consents
            where user_id = '00000000-0000-0000-0000-00000000aa01'
              and client_id = '44444444-4444-4444-8444-444444444444' and revoked_at is null), 1,
  'the same person''s consent for another app is untouched');
select is((select count(*)::int from auth.sessions where id in
            ('5a020000-0000-4000-8000-000000000002', '5a020000-0000-4000-8000-000000000004')), 2,
  'the person''s session for another app and their app session are untouched');
select is((select count(*)::int from auth.oauth_consents
            where user_id = '00000000-0000-0000-0000-00000000aa04' and revoked_at is null)
        + (select count(*)::int from auth.sessions where id = '5a020000-0000-4000-8000-000000000005'), 2,
  'another organization''s connection to the same app is untouched');
select is((select count(*)::int from api_private.agent_connection_admin_events
            where actor_person_id = '00000000-0000-0000-0000-0000000000d3'
              and client_id = '33333333-3333-4333-8333-333333333333'), 2,
  'each revoked consent is audited with the acting admin');

-- switch back on: nothing returns
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000aa03","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}', true);
select lives_ok($$ update shared.trusted_agent_clients set enabled = true
  where client_id = '33333333-3333-4333-8333-333333333333' and org_id = '00000000-0000-0000-0000-0000000000a1' $$,
  'an admin switches the app back on');
select is(public._t_fence('5a020000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333'), 'PT401',
  'the pre-existing session is refused by the fence after the app is switched back on');
reset role;
select is((select count(*)::int from auth.oauth_consents
            where client_id = '33333333-3333-4333-8333-333333333333' and revoked_at is not null
              and user_id in ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-00000000aa03')), 2,
  'switching back on leaves the consents revoked');

-- ── removing an allow-list row ends its connections too ──────────────────────────────────────
delete from shared.trusted_agent_clients
 where client_id = '44444444-4444-4444-8444-444444444444' and org_id = '00000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from auth.oauth_consents
            where client_id = '44444444-4444-4444-8444-444444444444' and revoked_at is null), 0,
  'deleting the allow-list row revokes its consents');
select is((select count(*)::int from auth.sessions where id = '5a020000-0000-4000-8000-000000000002'), 0,
  'deleting the allow-list row deletes its sessions');

-- ── archiving a person ───────────────────────────────────────────────────────────────────────
-- Fixtures again: d1 connects to the app anew (a fresh consent, session and refresh token).
update auth.oauth_consents set revoked_at = null
 where user_id = '00000000-0000-0000-0000-00000000aa01' and client_id = '33333333-3333-4333-8333-333333333333';
insert into auth.sessions (id, user_id, oauth_client_id) values
  ('5a020000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-00000000aa01', '33333333-3333-4333-8333-333333333333');
insert into auth.refresh_tokens (session_id, token, user_id, revoked) values
  ('5a020000-0000-4000-8000-000000000006', 'lifecycle-rt-6', '00000000-0000-0000-0000-00000000aa01', false);
set local role authenticated;
select is(public._t_fence('5a020000-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333'), 'passes',
  'the renewed agent session passes the fence before the person is archived');
reset role;

update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d1';
select is((select count(*)::int from auth.oauth_consents
            where user_id = '00000000-0000-0000-0000-00000000aa01' and revoked_at is null), 0,
  'archiving the person revokes every agent consent they hold');
select is((select count(*)::int from auth.sessions
            where user_id = '00000000-0000-0000-0000-00000000aa01' and oauth_client_id is not null), 0,
  'archiving the person deletes every agent session they hold');
select is((select count(*)::int from auth.refresh_tokens where token = 'lifecycle-rt-6'), 0,
  'archiving the person deletes their agent refresh tokens');
select is((select count(*)::int from auth.sessions where id = '5a020000-0000-4000-8000-000000000004'), 1,
  'the person''s app session is untouched');

update shared.people set archived_at = null where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
select is(public._t_fence('5a020000-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333'), 'PT401',
  'after unarchiving, the old agent session is refused by the fence');
reset role;
select is((select count(*)::int from auth.oauth_consents
            where user_id = '00000000-0000-0000-0000-00000000aa01' and revoked_at is null), 0,
  'unarchiving revives no consent');

-- a write that does not archive anyone ends nothing
update shared.people set full_name = full_name where id = '00000000-0000-0000-0000-0000000000b4';
select is((select count(*)::int from auth.oauth_consents
            where user_id = '00000000-0000-0000-0000-00000000aa04' and revoked_at is null), 1,
  'a write that does not archive a person ends no connection');

select * from finish();
rollback;
