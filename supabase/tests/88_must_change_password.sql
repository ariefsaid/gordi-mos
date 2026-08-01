begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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

-- ── The flag clears ONLY because the password actually changed ──────────────────────────────
-- GHSA-85fp-gf27-wg2c: the original shape exposed shared.clear_must_change_password() to
-- `authenticated`. It took no argument and never checked that anything had happened — the
-- "set the password FIRST, then clear" ordering lived only in the SPA. So the threat actor the
-- flag exists to stop (the provisioner, who holds the password) could sign in, POST the RPC
-- straight from devtools, and keep using the admin-known password on a permanently unflagged
-- account. The RPC is gone; the password change itself is what clears the flag now.
select hasnt_function('shared', 'clear_must_change_password', array[]::text[],
  'AC-131c: there is NO argument-free RPC that clears the flag — a caller cannot disarm the gate
   without actually changing their password');

reset role;
update shared.people set must_change_password = true
 where id in ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-0000000000d7');

-- An auth write that RE-WRITES encrypted_password to the value it already had must not clear
-- anything. This is the full-row-save shape (sign-in stamping last_sign_in_at while persisting the
-- whole record), so encrypted_password IS in the SET list and `AFTER UPDATE OF encrypted_password`
-- alone would fire. Only the WHEN (old IS DISTINCT FROM new) guard stops it — without that, merely
-- signing in with the admin-known password would disarm the gate, which is worse than the RPC it
-- replaced. Verified to fail when the WHEN clause is removed.
update auth.users
   set encrypted_password = encrypted_password, updated_at = now(), last_sign_in_at = now()
 where id = (select user_id from shared.people where id = '00000000-0000-0000-0000-0000000000d7');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d7'),
  true,
  'AC-131c2: re-writing the SAME password hash does NOT clear the flag — only a real change does');

-- The real path: GoTrue writes a new encrypted_password when the holder sets one.
update auth.users set encrypted_password = extensions.crypt('a new one they chose', extensions.gen_salt('bf'))
 where id = (select user_id from shared.people where id = '00000000-0000-0000-0000-0000000000d7');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d7'),
  false,
  'AC-131g: changing the password clears the flag — the change IS the proof, so there is nothing
   left to forge');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d3'),
  true,
  'AC-131h: and it clears ONLY the person whose password changed');

-- ── An admin reset must still land FLAGGED, despite the trigger ─────────────────────────────
-- admin_reset_password writes auth.users.encrypted_password and THEN raises the flag. The trigger
-- fires on that write, so it clears the flag mid-RPC and the RPC's own update re-raises it. If
-- anyone ever reorders those two statements, the reset would silently hand out an admin-known
-- password with the gate already disarmed — the exact hole this migration closes, reopened.
reset role;
update shared.people set must_change_password = false
 where id = '00000000-0000-0000-0000-0000000000d7';
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select lives_ok($$ select shared.admin_reset_password('00000000-0000-0000-0000-0000000000d7') $$,
  'admin_reset_password still runs with the trigger installed');
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d7'),
  true,
  'AC-131i: an admin reset leaves the account FLAGGED — the trigger clears on the password write,
   and the RPC re-raises after it. Statement order in that RPC is load-bearing.');

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
  'must_change_password is cleared only by an actual password change',
  'AC-131e: an admin cannot clear the flag by a direct write — only changing the password clears it');

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
