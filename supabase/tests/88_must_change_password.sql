begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- #131 / GHSA-85fp-gf27-wg2c — provisioned passwords are admin-known and never expire.
-- The flag forces the holder to replace one before the app is usable.
--
-- Threat: shared.admin_create_login and shared.admin_reset_password BOTH set a password the admin
-- chose or was shown (it is the RPC's return value). So the provisioner knows it, and until now
-- nothing made the holder change it.

select mos._test_seed_role_tree();      -- org a1 people d1..d7, roles f1..f6/c1; org b1 person b4
select mos._test_seed_access_roles();   -- grants admin -> GrandMgr (...d3)

-- The seeded people carry no email, and admin_create_login refuses a person without one.
-- Arrange as owner: these writes are fixture setup, not the behaviour under test.
update shared.people set email = 'lead2holder@example.test'
 where id = '00000000-0000-0000-0000-0000000000d7';

-- ── Column contract ─────────────────────────────────────────────────────────────────────────
select has_column('shared', 'people', 'must_change_password',
  'shared.people carries must_change_password');
select col_not_null('shared', 'people', 'must_change_password',
  'must_change_password is NOT NULL — a null is neither set nor cleared, and every read would
   have to guess which');
select col_has_default('shared', 'people', 'must_change_password',
  'must_change_password defaults, so a row created by a path that predates this is not undefined');

-- A person with no login has nothing to rotate, and could never clear the flag (no auth user ->
-- no password -> no way to complete a change). d1 is seeded without a login.
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d1'),
  false,
  'a person with no login defaults to false — nothing to rotate, and no way to clear it');

-- ── admin_create_login sets the flag ────────────────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';

select lives_ok($$ select shared.admin_create_login('00000000-0000-0000-0000-0000000000d7') $$,
  'admin_create_login succeeds for a person with an email and no login');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d7'),
  true,
  'AC-131a: creating a login flags the account — the admin was just handed the password');

-- ── admin_reset_password sets the flag ──────────────────────────────────────────────────────
-- Clear it first as owner, so a pass below cannot be inherited from the create above. Without
-- this precondition the assertion would hold even if admin_reset_password did nothing at all.
reset role;
update shared.people set must_change_password = false
 where id = '00000000-0000-0000-0000-0000000000d7';
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d7'),
  false,
  'precondition: flag cleared, so the next assertion cannot pass by inheritance');

set local role authenticated;
select lives_ok($$ select shared.admin_reset_password('00000000-0000-0000-0000-0000000000d7') $$,
  'admin_reset_password succeeds for a person with a login');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d7'),
  true,
  'AC-131b: an admin reset re-flags the account — the admin knows this password too');

-- ── clear_must_change_password clears ONLY the caller ───────────────────────────────────────
-- Flag a second person, act as d7, clear. d3 must survive: an RPC that cleared by argument rather
-- than by the session's own person would let any user disarm someone else's gate.
reset role;
update shared.people set must_change_password = true
 where id in ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d7');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":[]}';
select lives_ok($$ select shared.clear_must_change_password() $$,
  'clear_must_change_password runs for an ordinary authenticated caller — no access role needed,
   since being locked out of your own account is not a privilege');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d7'),
  false,
  'AC-131c: the caller''s own flag clears');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d3'),
  true,
  'AC-131d: clearing my own flag does NOT clear anyone else''s — the RPC resolves the caller and
   takes no person argument');

-- ── The gate cannot be disarmed by a direct write ───────────────────────────────────────────
-- people_update_admin grants UPDATE on any person in the org to any ADMIN. Without a guard, admin B
-- — whose password admin A chose and therefore knows — could clear their own flag and skip the
-- rotation entirely. That is the population the flag exists for, so this is the assertion that
-- decides whether the gate is real.
reset role;
update shared.people set must_change_password = true
 where id = '00000000-0000-0000-0000-0000000000d3';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$
  update shared.people set must_change_password = false
   where id = '00000000-0000-0000-0000-0000000000d3'
$$, '42501',
  'must_change_password is cleared only by shared.clear_must_change_password()',
  'AC-131e: an admin cannot clear the flag by a direct write — only the RPC clears it');

-- Raising it from an app session IS allowed: that is an admin forcing a rotation, the feature
-- rather than a bypass. Asserted so the guard cannot later be widened into a blanket block.
reset role;
update shared.people set must_change_password = false
 where id = '00000000-0000-0000-0000-0000000000d4';
set local role authenticated;
select lives_ok($$
  update shared.people set must_change_password = true
   where id = '00000000-0000-0000-0000-0000000000d4'
$$, 'AC-131f: an admin may still RAISE the flag — forcing a rotation is the feature');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d4'),
  true,
  'AC-131f: and the raise actually took');

select * from finish();
rollback;
