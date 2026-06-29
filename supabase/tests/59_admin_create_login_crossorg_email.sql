-- pgTAP: D11 Medium fix — cross-org duplicate email in shared.admin_create_login raises a CLEAN,
-- org-agnostic error (22023 'email already in use'), NOT the raw global-unique 23505 whose DETAIL
-- would leak that the email exists in another org (cross-tenant existence oracle). Charter: the
-- org_id tenancy seam must not be bypassable / leak. (Migration …0629000001.)
--
-- UUID key: org A ...0000ea  · org B ...0000eb · admins ...00ea0d / ...00eb0d · targets ...00ea01 / ...00eb01
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

-- ─── Fixtures (service_role bypasses RLS) ────────────────────────────────────
insert into shared.orgs (id, name, slug) values
  ('00000000-0000-0000-0000-0000000000ea','Email Org A','email-org-a'),
  ('00000000-0000-0000-0000-0000000000eb','Email Org B','email-org-b');

-- Two people in DIFFERENT orgs sharing the SAME email (the global-unique collision).
insert into shared.people (id, org_id, full_name, email) values
  ('00000000-0000-0000-0000-00000000ea0d','00000000-0000-0000-0000-0000000000ea','EA Admin','ea.admin@ops.gordi.local'),
  ('00000000-0000-0000-0000-00000000ea01','00000000-0000-0000-0000-0000000000ea','EA Target','collide@ops.gordi.local'),
  ('00000000-0000-0000-0000-00000000eb0d','00000000-0000-0000-0000-0000000000eb','EB Admin','eb.admin@ops.gordi.local'),
  ('00000000-0000-0000-0000-00000000eb01','00000000-0000-0000-0000-0000000000eb','EB Target','collide@ops.gordi.local');

insert into shared.person_access_roles (org_id, person_id, access_role) values
  ('00000000-0000-0000-0000-0000000000ea','00000000-0000-0000-0000-00000000ea0d','admin'),
  ('00000000-0000-0000-0000-0000000000eb','00000000-0000-0000-0000-00000000eb0d','admin');

-- ─── Org-A admin creates a login for the org-A target (email = collide@…) → succeeds ─────────────
set local role authenticated;
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000ea","person_id":"00000000-0000-0000-0000-00000000ea0d","access_roles":["admin"]}';

select lives_ok($$
  select shared.admin_create_login('00000000-0000-0000-0000-00000000ea01')
$$, 'org-A admin creates the first login for collide@… (succeeds)');

-- ─── Org-B admin creates a login for the org-B target with the SAME email → CLEAN error ──────────
set local request.jwt.claims =
  '{"org_id":"00000000-0000-0000-0000-0000000000eb","person_id":"00000000-0000-0000-0000-00000000eb0d","access_roles":["admin"]}';

-- The fix: a clean app error 22023 'email already in use' — NOT the raw 23505, NO cross-org DETAIL.
select throws_ok($$
  select shared.admin_create_login('00000000-0000-0000-0000-00000000eb01')
$$, '22023', 'email already in use',
  'D11: cross-org duplicate email → clean 22023 "email already in use" (no raw 23505 / no cross-org leak)');

-- ─── The failed cross-org attempt left org-B's person UNLINKED (no partial login) ────────────────
reset role;
select is(
  (select user_id from shared.people where id = '00000000-0000-0000-0000-00000000eb01'),
  null,
  'D11: the refused cross-org create left org-B person unlinked (no orphaned auth row leak)');

-- And the auth.users insert itself rolled back (savepoint) — exactly ONE login for the shared email
-- (the org-A one), no orphaned row from the refused org-B attempt.
select is(
  (select count(*)::int from auth.users where email = 'collide@ops.gordi.local' and is_sso_user = false),
  1,
  'D11: only the org-A auth.users row exists for the shared email (org-B attempt left no orphan)');

select * from finish();
rollback;
