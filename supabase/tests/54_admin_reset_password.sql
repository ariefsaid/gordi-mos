begin;
create extension if not exists pgtap with schema extensions;
select plan(2);

-- Fixture: org A admin ...00d3 (login). Target = ...00d2 (login user ...00aa02, seeded hash of
-- 'seed-password-1A'). Admin resets it; the old password must stop verifying and the new one must verify.
-- The reset runs as the admin session; the auth.users hash verification runs AFTER reset role (the
-- authenticated role has no SELECT on auth.users).
select mos._test_seed_admin_users();
create temporary table _pw (pw text) on commit drop;
grant insert on _pw to authenticated;  -- the admin session (authenticated) stashes its one-time password

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-020: reset is called ONCE; capture the new one-time password.
insert into _pw (pw) select shared.admin_reset_password('00000000-0000-0000-0000-0000000000d2');

reset role;

-- AC-020: the newly returned password verifies against the post-reset hash.
select results_eq(
  $$ select extensions.crypt((select pw from _pw), u.encrypted_password) = u.encrypted_password
       from shared.people pe join auth.users u on u.id = pe.user_id
      where pe.id = '00000000-0000-0000-0000-0000000000d2' $$,
  $$ values (true) $$,
  'AC-020: the newly returned password verifies against the reset hash');

-- AC-020: the OLD seeded password ('seed-password-1A') no longer verifies against the new hash.
select results_eq(
  $$ select extensions.crypt('seed-password-1A', u.encrypted_password) = u.encrypted_password
       from shared.people pe join auth.users u on u.id = pe.user_id
      where pe.id = '00000000-0000-0000-0000-0000000000d2' $$,
  $$ values (false) $$,
  'AC-020: the old password no longer verifies after reset');

select * from finish();
rollback;
