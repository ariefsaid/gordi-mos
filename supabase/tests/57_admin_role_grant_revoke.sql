begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Fixture: org A admin ...00d3 (login). Role target = ...00d2 (login user ...00aa02), so the hook
-- re-mint resolves a person and we can read the access_roles claim. Grant/revoke are DIRECT RLS writes
-- on shared.person_access_roles (admin-gated, existing policies + guard); this file proves the round-trip
-- and the self-assign guard still holds (AC-050).
-- The custom_access_token_hook is EXECUTE-revoked from authenticated (single audited definer point), so
-- the hook re-mint asserts run AFTER reset role (as the test/owner role), reading the rows the admin wrote.
select mos._test_seed_admin_users();

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-050: admin grants ops_lead to another person (...00d2) -> direct RLS INSERT lives.
select lives_ok(
  $$ insert into shared.person_access_roles (person_id, access_role)
       values ('00000000-0000-0000-0000-0000000000d2','ops_lead') $$,
  'AC-050: admin grants ops_lead to another person (direct RLS INSERT)');

reset role;
-- AC-050: the hook re-mint for that person's login now includes ops_lead.
select ok(
  shared.custom_access_token_hook(
    jsonb_build_object('user_id','00000000-0000-0000-0000-0000000000a2','claims', jsonb_build_object())
  ) -> 'claims' -> 'access_roles' ? 'ops_lead',
  'AC-050: hook re-mint includes the granted ops_lead');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

-- AC-050: revoke (soft) -> revoked_at set, the row STILL EXISTS (no delete).
select lives_ok(
  $$ update shared.person_access_roles set revoked_at = now()
      where person_id = '00000000-0000-0000-0000-0000000000d2' and access_role = 'ops_lead' $$,
  'AC-050: admin revokes ops_lead (soft UPDATE)');

-- AC-050: admin/finance never self-assignable (existing guard) -> 42501 on the admin's own row.
-- (The finance arm is covered by the existing 33_* guard suite; here we assert the representative admin
-- self-grant to confirm the guard remains intact after the no-lockout extension.)
select throws_ok(
  $$ insert into shared.person_access_roles (person_id, access_role)
       values ('00000000-0000-0000-0000-0000000000d3','admin') $$,
  '42501', null, 'AC-050: admin never self-assignable (self-assign guard intact)');

reset role;
-- AC-050: the revoke set revoked_at and did NOT delete the row (soft-revoke, NFR-005).
select is(
  (select count(*)::int from shared.person_access_roles
     where person_id = '00000000-0000-0000-0000-0000000000d2' and access_role = 'ops_lead'
       and revoked_at is not null),
  1, 'AC-050: revoke sets revoked_at and the row is not deleted');

select * from finish();
rollback;
