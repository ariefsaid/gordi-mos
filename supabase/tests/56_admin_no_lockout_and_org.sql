begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Fixture: org A has EXACTLY ONE active admin (...00d3, with a login). Org B person ...00b4 has a login.
select mos._test_seed_admin_users();

set local role authenticated;
-- Admin session as the sole org-A admin (...00d3).
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-040 (disable arm, FR-041): disabling the last active admin's login is refused (42501).
select throws_ok(
  $$ select shared.admin_set_login_enabled('00000000-0000-0000-0000-0000000000d3', false) $$,
  '42501', null, 'AC-040: cannot disable the last active admin login');

-- AC-040 (revoke arm, FR-041): revoking admin from the last active admin is refused (42501).
select throws_ok(
  $$ update shared.person_access_roles set revoked_at = now()
      where person_id = '00000000-0000-0000-0000-0000000000d3' and access_role = 'admin' $$,
  '42501', null, 'AC-040: cannot revoke admin from the last active admin');

-- AC-040 (negative control): add a SECOND admin (...00d2, who has a login) -> the revoke of ...00d3's
-- admin is no longer the last and succeeds. Proves the guard counts active admins correctly.
select lives_ok(
  $$ insert into shared.person_access_roles (person_id, access_role)
       values ('00000000-0000-0000-0000-0000000000d2','admin') $$,
  'AC-040: admin may grant admin to a second person (negative-control setup)');
select lives_ok(
  $$ update shared.person_access_roles set revoked_at = now()
      where person_id = '00000000-0000-0000-0000-0000000000d3' and access_role = 'admin' $$,
  'AC-040: revoke of an admin succeeds once a second active admin exists');

-- AC-002 (org isolation): the org-A admin cannot create a login for an org-B person -> 42501.
-- (Re-grant admin to ...00d3 first so the prior revoke does not strip the caller's authz; the JWT claim
-- carries access_roles, so the live row is irrelevant to the in-body has_access_role check, but the
-- org-membership target check is what fails here.)
select throws_ok(
  $$ select shared.admin_create_login('00000000-0000-0000-0000-0000000000b4') $$,
  '42501', null, 'AC-002: admin in org A cannot target an org-B person');

reset role;
select * from finish();
rollback;
