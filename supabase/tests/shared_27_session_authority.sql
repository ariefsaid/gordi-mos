-- Session authority: role changes and administrator credential actions apply on the next request.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select ok((
  select p.provolatile = 's' and p.prosecdef and 'search_path=""' = any(p.proconfig)
    from pg_proc p where p.oid = 'shared.has_access_role(text)'::regprocedure
), 'has_access_role remains stable SECURITY DEFINER with an empty search_path');

select shared._test_seed_directory();
select shared._test_seed_access_roles();
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000aa04') on conflict (id) do nothing;
update shared.people set user_id = '00000000-0000-0000-0000-00000000aa04'
 where id = '00000000-0000-0000-0000-0000000000b4';

-- A revoked role is not part of the current assignments.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead"]}';
select ok(not shared.has_access_role('ops_lead'), 'a revoked role is not active');
select set_eq($$ select unnest(shared.current_access_roles()) $$, array['finance','member'],
  'current_access_roles returns the live org-scoped assignments');
select set_eq($$ select unnest(shared._claim_text_array('access_roles')) $$, array['finance','member'],
  'the claim-array helper does not expose stale role claims');

-- The live assignment becomes effective even while the claim remains empty.
reset role;
update shared.person_access_roles set revoked_at = null
 where person_id = '00000000-0000-0000-0000-0000000000d1' and access_role = 'ops_lead';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":[]}';
select ok(shared.has_access_role('ops_lead'), 'a newly added role is effective on the next request');

-- Revocation takes effect on the next request, without refreshing the token.
reset role;
update shared.person_access_roles set revoked_at = now()
 where person_id = '00000000-0000-0000-0000-0000000000d1' and access_role = 'ops_lead';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["ops_lead"]}';
select ok(not shared.has_access_role('ops_lead'), 'a revoked role is denied on the next request');
select set_eq($$ select unnest(shared.current_access_roles()) $$, array['finance','member'],
  'revocation is reflected in current_access_roles');

-- A person claim from another org cannot read or exercise that person's role in this org.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["admin"]}';
select is(shared.current_access_roles(), '{}'::text[], 'a cross-org person resolves to no access roles');
select ok(not shared.has_access_role('admin'), 'a cross-org person cannot exercise an admin role');
reset role;

-- Cross-org administrator targets are refused before their sessions can be changed.
insert into auth.sessions (id, user_id) values
  ('00000000-0000-4000-8000-000000000027', '00000000-0000-0000-0000-00000000aa04');
insert into auth.refresh_tokens (session_id, token, user_id, revoked) values
  ('00000000-0000-4000-8000-000000000027', 'authority-cross-org-token', '00000000-0000-0000-0000-00000000aa04', false);
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$ select shared.admin_reset_password('00000000-0000-0000-0000-0000000000b4') $$,
  '42501', 'person not found in your org', 'an admin cannot reset a cross-org login');
reset role;
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-00000000aa04'), 1,
  'a refused cross-org reset leaves the target session intact');
select is((select count(*)::int from auth.refresh_tokens where token = 'authority-cross-org-token'), 1,
  'a refused cross-org reset leaves the target refresh token intact');

-- Reset revokes every session and its cascading refresh tokens for the in-org login.
insert into auth.sessions (id, user_id) values
  ('00000000-0000-4000-8000-000000000028', '00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-4000-8000-000000000029', '00000000-0000-0000-0000-00000000aa01');
insert into auth.refresh_tokens (session_id, token, user_id, revoked) values
  ('00000000-0000-4000-8000-000000000028', 'authority-reset-token-one', '00000000-0000-0000-0000-00000000aa01', false),
  ('00000000-0000-4000-8000-000000000029', 'authority-reset-token-two', '00000000-0000-0000-0000-00000000aa01', false);
set local role authenticated;
select lives_ok($$ select shared.admin_reset_password('00000000-0000-0000-0000-0000000000d1', 'TempPassword123') $$,
  'an admin resets an in-org login');
reset role;
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-00000000aa01'), 0,
  'password reset deletes every session for the login');
select is((select count(*)::int from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-00000000aa01'), 0,
  'password reset removes the login refresh tokens');

-- Disabling ends every session for the login.
insert into auth.sessions (id, user_id) values
  ('00000000-0000-4000-8000-00000000002a', '00000000-0000-0000-0000-00000000aa01');
insert into auth.refresh_tokens (session_id, token, user_id, revoked) values
  ('00000000-0000-4000-8000-00000000002a', 'authority-disable-token', '00000000-0000-0000-0000-00000000aa01', false);
set local role authenticated;
select lives_ok($$ select shared.admin_set_login_enabled('00000000-0000-0000-0000-0000000000d1', false) $$,
  'an admin disables an in-org login');
reset role;
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-00000000aa01'), 0,
  'disabling deletes every session for the login');
select is((select count(*)::int from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-00000000aa01'), 0,
  'disabling removes the login refresh tokens');
select is((select count(*)::int from auth.sessions where user_id = '00000000-0000-0000-0000-00000000aa04'), 1,
  'credential changes leave another org''s sessions untouched');

-- Missing identity or malformed claims remain fail-closed.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","access_roles":["admin"]}';
select is(shared.current_access_roles(), '{}'::text[], 'missing person claims resolve to no access roles');
select ok(not shared.has_access_role('admin'), 'missing person claims fail closed');
set local request.jwt.claims = 'not json';
select ok(not shared.has_access_role('admin'), 'malformed claims fail closed');

reset role;
select * from finish();
rollback;
