begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Fixture: org A admin ...00d3 (login). Target = ...00d1 (email budi@ops.gordi.local, user_id NULL).
-- admin_create_login is called ONCE as the admin session; the returned password is stashed in a temp
-- table so the auth.users verification (which authenticated cannot SELECT) runs AFTER reset role.
select mos._test_seed_admin_users();
create temporary table _pw (pw text) on commit drop;
grant insert on _pw to authenticated;  -- the admin session (authenticated) stashes its one-time password

set local role authenticated;
-- Admin session (org A, person ...00d3, access_roles ["admin"]).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-010: create the login (called exactly once) and capture the one-time password.
insert into _pw (pw) select shared.admin_create_login('00000000-0000-0000-0000-0000000000d1');

reset role;

-- AC-010: the returned temp password verifies against the new auth.users bcrypt hash.
select results_eq(
  $$ select extensions.crypt((select pw from _pw), u.encrypted_password) = u.encrypted_password
       from shared.people pe join auth.users u on u.id = pe.user_id
      where pe.id = '00000000-0000-0000-0000-0000000000d1' $$,
  $$ values (true) $$,
  'AC-010: returned temp password verifies against the new auth.users hash');

-- AC-010: the person is now linked to a login.
select isnt(
  (select user_id from shared.people where id = '00000000-0000-0000-0000-0000000000d1'),
  null, 'AC-010: people.user_id linked after create-login');

-- AC-010: an auth.users row exists for the new user_id.
select is(
  (select count(*)::int from auth.users u
     join shared.people pe on pe.user_id = u.id
    where pe.id = '00000000-0000-0000-0000-0000000000d1'),
  1, 'AC-010: auth.users row exists for the new login');

-- AC-010: an auth.identities row exists for the new user (email provider).
select is(
  (select count(*)::int from auth.identities i
     join shared.people pe on pe.user_id = i.user_id
    where pe.id = '00000000-0000-0000-0000-0000000000d1' and i.provider = 'email'),
  1, 'AC-010: auth.identities row exists for the new login');

-- AC-010: the auth hook now stamps this person's claim. create-login grants NO access role (NFR-004),
-- so access_roles is an empty array, but the claim RESOLVES the person (person_id stamped, not orphan).
select is(
  shared.custom_access_token_hook(
    jsonb_build_object(
      'user_id', (select user_id::text from shared.people where id = '00000000-0000-0000-0000-0000000000d1'),
      'claims', jsonb_build_object())
  ) -> 'claims' ->> 'person_id',
  '00000000-0000-0000-0000-0000000000d1',
  'AC-010: auth hook stamps the new login''s person_id (claim resolves the person)');

-- Task 1.6 shape: admin_list_login_status() reports the new person has_login=true, disabled=false.
-- Read RPC is admin-gated -> call it in an admin session.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select results_eq(
  $$ select has_login, disabled from shared.admin_list_login_status()
      where person_id = '00000000-0000-0000-0000-0000000000d1' $$,
  $$ values (true, false) $$,
  'admin_list_login_status: new login -> has_login=true, disabled=false');

reset role;
select * from finish();
rollback;
