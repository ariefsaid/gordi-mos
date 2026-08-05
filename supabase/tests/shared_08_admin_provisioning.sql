-- shared, squashed baseline — the privileged provisioning RPCs.
--
-- These are SECURITY DEFINER and therefore run as the owner: the in-body admin check is the real
-- gate, not the EXECUTE grant. Every one of them is asserted to fail closed for a non-admin, to
-- refuse a target outside the caller's org, and to leave no partial state behind when it refuses.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Fixture: two orgs, each with one admin holding a login, plus targets.
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000ea','Prov Org A','prov-org-a'),
  ('00000000-0000-0000-0000-0000000000eb','Prov Org B','prov-org-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000fa0d','a.admin@example.test'),
  ('00000000-0000-0000-0000-00000000fb0d','b.admin@example.test');

insert into shared.people (id, org_id, full_name, email, user_id) values
  ('00000000-0000-0000-0000-00000000ea0d','00000000-0000-0000-0000-0000000000ea','A Admin', 'a.admin@example.test',  '00000000-0000-0000-0000-00000000fa0d'),
  ('00000000-0000-0000-0000-00000000ea01','00000000-0000-0000-0000-0000000000ea','A Target','collide@example.test',  null),
  ('00000000-0000-0000-0000-00000000ea02','00000000-0000-0000-0000-0000000000ea','A NoEmail', null,                  null),
  ('00000000-0000-0000-0000-00000000eb0d','00000000-0000-0000-0000-0000000000eb','B Admin', 'b.admin@example.test',  '00000000-0000-0000-0000-00000000fb0d'),
  ('00000000-0000-0000-0000-00000000eb01','00000000-0000-0000-0000-0000000000eb','B Target','collide@example.test',  null);

insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000ea','00000000-0000-0000-0000-00000000ea0d','admin'),
  ('00000000-0000-0000-0000-0000000000eb','00000000-0000-0000-0000-00000000eb0d','admin');

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Fail closed for a non-admin — the check runs BEFORE any auth.users write
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ea","person_id":"00000000-0000-0000-0000-00000000ea01","access_roles":["member"]}';

select throws_ok($$ select shared.admin_create_login('00000000-0000-0000-0000-00000000ea01') $$,
  '42501', 'admin access role required', 'admin_create_login refuses a non-admin caller');
select throws_ok($$ select shared.admin_reset_password('00000000-0000-0000-0000-00000000ea0d') $$,
  '42501', 'admin access role required', 'admin_reset_password refuses a non-admin caller');
select throws_ok($$ select shared.admin_set_login_enabled('00000000-0000-0000-0000-00000000ea0d', false) $$,
  '42501', 'admin access role required', 'admin_set_login_enabled refuses a non-admin caller');
select throws_ok($$ select * from shared.admin_list_login_status() $$,
  '42501', 'admin access role required', 'admin_list_login_status refuses a non-admin caller');

select is(
  (select user_id from shared.people where id = '00000000-0000-0000-0000-00000000ea01'),
  null, 'the refused create-login left no auth link — it failed before writing, not after');

-- Even an ADMIN app session cannot set people.user_id by a direct write: the auth link is an
-- RPC-only seam, which is what keeps the provisioning path auditable.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000ea","person_id":"00000000-0000-0000-0000-00000000ea0d","access_roles":["admin"]}';
select throws_ok($$
  update shared.people set user_id = '00000000-0000-0000-0000-00000000fb0d'
   where id = '00000000-0000-0000-0000-00000000ea01'
$$, '42501', 'user_id is set only by the provisioning RPCs, not a direct write',
  'an admin app session cannot set people.user_id directly');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The org seam holds inside the definer functions too
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A definer function runs as the owner and therefore is NOT protected by RLS — the org check has to
-- be written into the body, and this is what proves it is there.
select throws_ok($$ select shared.admin_create_login('00000000-0000-0000-0000-00000000eb01') $$,
  '42501', 'person not found in your org', 'admin_create_login refuses a target in another org');
select throws_ok($$ select shared.admin_reset_password('00000000-0000-0000-0000-00000000eb0d') $$,
  '42501', 'person not found in your org', 'admin_reset_password refuses a target in another org');
select throws_ok($$ select shared.admin_set_login_enabled('00000000-0000-0000-0000-00000000eb0d', true) $$,
  '42501', 'person not found in your org', 'admin_set_login_enabled refuses a target in another org');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Round trip, and what provisioning does NOT grant
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select lives_ok($$ select shared.admin_create_login('00000000-0000-0000-0000-00000000ea01') $$,
  'an admin provisions a login for a person in their own org');
select isnt(
  (select user_id from shared.people where id = '00000000-0000-0000-0000-00000000ea01'),
  null, '...and the person is linked to the new auth user');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-00000000ea01'),
  true, '...and is flagged for rotation, because the provisioner now knows the password');
select is(
  (select count(*)::int from shared.person_access_roles
    where person_id = '00000000-0000-0000-0000-00000000ea01' and revoked_at is null),
  0, '...and creating a login grants NO access role — the two acts are separate on purpose');

select throws_ok($$ select shared.admin_create_login('00000000-0000-0000-0000-00000000ea02') $$,
  '22023', 'person has no email to provision a login for',
  'a person with no email cannot be provisioned');

-- ── The cross-tenant existence oracle stays closed ───────────────────────────────────────────
-- auth.users.email is globally unique, so provisioning the SAME email from another org collides.
-- The raw 23505 DETAIL names the conflicting row and would confirm that the address exists in
-- another tenant. It must surface as a clean, org-agnostic error instead.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000eb","person_id":"00000000-0000-0000-0000-00000000eb0d","access_roles":["admin"]}';
select throws_ok($$ select shared.admin_create_login('00000000-0000-0000-0000-00000000eb01') $$,
  '22023', 'email already in use',
  'a cross-org email collision raises a clean 22023, never the raw 23505 whose DETAIL is a cross-tenant oracle');
select is(
  (select user_id from shared.people where id = '00000000-0000-0000-0000-00000000eb01'),
  null, '...and the refused attempt left the org-B person unlinked, with no orphaned auth row');

reset role;
select * from finish();
rollback;
