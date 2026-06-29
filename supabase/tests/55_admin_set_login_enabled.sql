begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

-- Fixture: org A admin ...00d3 (login). Target = ...00d2, a NON-admin person-with-login, so the
-- no-lockout guard does not fire and we exercise the pure disable/enable mechanism.
-- NOTE: the spec's "authentication is refused" is GoTrue runtime behavior; pgTAP asserts the documented
-- mechanism (banned_until far-future finite per Director §8.4); the end-to-end refusal is verified at the
-- GoTrue token endpoint on staging (Director post-build), not here.
-- The RPC runs as the admin session; the auth.users.banned_until reads run after reset role (the
-- authenticated role has no SELECT on auth.users); admin_list_login_status is read in an admin session.
select mos._test_seed_admin_users();

-- AC-030: disable.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.admin_set_login_enabled('00000000-0000-0000-0000-0000000000d2', false);

-- AC-030: disabled person reports disabled=true via the read RPC (still in the admin session).
select results_eq(
  $$ select has_login, disabled from shared.admin_list_login_status()
      where person_id = '00000000-0000-0000-0000-0000000000d2' $$,
  $$ values (true, true) $$,
  'AC-030: disabled login -> admin_list_login_status disabled=true');

reset role;
-- AC-030: disable -> banned_until is set to a FUTURE timestamp (the GoTrue ban mechanism).
select ok(
  (select u.banned_until from shared.people pe join auth.users u on u.id = pe.user_id
     where pe.id = '00000000-0000-0000-0000-0000000000d2') > now(),
  'AC-030: disabled -> banned_until is a future timestamp');

-- AC-030: re-enable.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select shared.admin_set_login_enabled('00000000-0000-0000-0000-0000000000d2', true);

reset role;
-- AC-030: re-enable -> banned_until cleared to NULL.
select is(
  (select u.banned_until from shared.people pe join auth.users u on u.id = pe.user_id
     where pe.id = '00000000-0000-0000-0000-0000000000d2'),
  null, 'AC-030: re-enabled -> banned_until cleared to NULL');

select * from finish();
rollback;
