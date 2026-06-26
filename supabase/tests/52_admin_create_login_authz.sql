begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

-- Fixture: org A admin ...00d3 (login), ...00d1 no-login target, ...00d2 login target; org B ...00b4.
select mos._test_seed_admin_users();

set local role authenticated;

-- AC-001 (NFR-001, fail-closed): a NON-admin session (org A, person ...00d1, access_roles ["member"])
-- cannot call any privileged RPC -> each raises 42501 BEFORE any auth.users write.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}';

select throws_ok(
  $$ select shared.admin_create_login('00000000-0000-0000-0000-0000000000d1') $$,
  '42501', null, 'AC-001: non-admin admin_create_login -> 42501');

select throws_ok(
  $$ select shared.admin_reset_password('00000000-0000-0000-0000-0000000000d2') $$,
  '42501', null, 'AC-001: non-admin admin_reset_password -> 42501');

select throws_ok(
  $$ select shared.admin_set_login_enabled('00000000-0000-0000-0000-0000000000d2', false) $$,
  '42501', null, 'AC-001: non-admin admin_set_login_enabled -> 42501');

-- AC-001: no auth.users row was created/linked for the no-login target (the seeded set is unchanged) —
-- person ...00d1 still has user_id NULL.
select is(
  (select count(*)::int from shared.people
     where id = '00000000-0000-0000-0000-0000000000d1' and user_id is not null),
  0, 'AC-001: failed non-admin create-login left no auth link');

-- _guard_people: even an ADMIN app session cannot set people.user_id by a DIRECT write (RPC-only seam).
-- Proves the role-scoped user_id guard (the divergence noted in the migration) still blocks app writes.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok(
  $$ update shared.people set user_id = '00000000-0000-0000-0000-0000000000a3'
      where id = '00000000-0000-0000-0000-0000000000d1' $$,
  '42501', null, 'AC-001: admin app session cannot set people.user_id directly (RPC-only seam)');

reset role;
select * from finish();
rollback;
