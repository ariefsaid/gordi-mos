-- shared, squashed baseline — the must_change_password rotation gate.
--
-- The threat actor is the PROVISIONER: an admin sets a password, hands it over once, and knows it.
-- A client-side redirect is no control against someone who holds the token by definition — they can
-- skip the SPA and read straight from PostgREST. So the flag gates AUTHORIZATION, at the one seam
-- every org-scoped policy resolves through, and the only thing that lowers it is the password
-- actually changing.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select shared._test_seed_directory();
select shared._test_seed_access_roles();

set local role authenticated;
-- Act as Peer (...0d04): an ordinary org-A member holding no access role.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":[]}';

-- Preconditions, so the "denied" assertions below cannot pass on an empty fixture.
select cmp_ok((select count(*) from shared.people), '>', 1::bigint,
  'precondition: an unflagged member sees more than just their own person row');
select cmp_ok((select count(*) from shared.roles), '>', 0::bigint,
  'precondition: an unflagged member sees the org role tree');

-- ── Raise the flag and the org closes ────────────────────────────────────────────────────────
reset role;
update shared.people set must_change_password = true
 where id = '00000000-0000-0000-0000-0000000000d4';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":[]}';

select is(shared.current_org_id(), null,
  'current_org_id() is the seam: it returns NULL while flagged, so every policy scoped by it is false at once');
select is((select count(*) from shared.roles), 0::bigint,
  'a flagged session reads NO org data — the token is still live but no longer authorized');
select is((select count(*) from shared.person_roles), 0::bigint,
  '...and that holds for every table scoped by the seam, not just one');
select is((select count(*) from shared.branches), 0::bigint,
  '...including tables added by this baseline, because they scope by the same seam');

-- ── ...but never starve the gate itself ──────────────────────────────────────────────────────
-- The SPA reads shared.people to discover the flag. If that read were closed too, it would resolve
-- person=null, show the ORPHAN screen, and the user could never clear the flag — a support call to
-- undo a security control.
select is((select count(*) from shared.people), 1::bigint,
  'a flagged session still sees exactly ONE person row');
-- array_agg rather than a scalar subquery: if the gate were missing this returns every row, and a
-- scalar subquery would abort the file with 22023 instead of failing as an assertion.
select is(
  (select array_agg(id order by id) from shared.people),
  array['00000000-0000-0000-0000-0000000000d4'::uuid],
  '...and it is their OWN row, so the set-password screen can render and the flag can be cleared');

-- ── Clearing the flag is not an act that can be forged ───────────────────────────────────────
-- An admin session cannot lower it by writing the column. This is the arm that matters: the org
-- admin write surface would otherwise let admin B — whose password admin A chose and knows — clear
-- their own flag and skip the rotation entirely.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select throws_ok($$
  update shared.people set must_change_password = false
   where id = '00000000-0000-0000-0000-0000000000d4'
$$, '42501', 'must_change_password is cleared only by an actual password change',
  'an admin cannot clear the flag with a direct write');

-- Raising it IS allowed from an app session: that is an admin forcing a rotation, which is the
-- feature rather than a bypass.
select lives_ok($$
  update shared.people set must_change_password = true
   where id = '00000000-0000-0000-0000-0000000000d1'
$$, 'raising the flag from an app session is allowed — forcing a rotation is the feature');

-- ── The password change is what clears it ────────────────────────────────────────────────────
-- Author (...0d01) is linked to auth user ...aa01 by the fixture and was just flagged above.
reset role;
update auth.users set encrypted_password = 'a-new-hash' where id = '00000000-0000-0000-0000-00000000aa01';
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d1'),
  false, 'writing a NEW encrypted_password clears the flag — the only thing that does');

-- An incidental auth write must NOT clear it. A plain AFTER UPDATE would fire on a sign-in stamp,
-- and the gate would be exactly as forgeable as the RPC this design replaced.
update shared.people set must_change_password = true
 where id = '00000000-0000-0000-0000-0000000000d1';
update auth.users set updated_at = now() where id = '00000000-0000-0000-0000-00000000aa01';
select is(
  (select must_change_password from shared.people where id = '00000000-0000-0000-0000-0000000000d1'),
  true, 'an auth write that does NOT change the password leaves the flag standing');

-- ── Deploy guard ─────────────────────────────────────────────────────────────────────────────
-- shared.people is FORCE ROW LEVEL SECURITY, so being the table owner does not exempt
-- _current_person_must_change_password() from people's own policy — and that policy calls
-- current_org_id(), which calls this function. The only reason it terminates is the owner's
-- BYPASSRLS attribute. On an environment where the migration role lacks it, every policy evaluation
-- on every table recurses: not a degraded feature, a down database. Asserted here so a bad
-- environment fails at test time rather than under live traffic.
select ok(
  (select r.rolbypassrls
     from pg_proc p join pg_roles r on r.oid = p.proowner
    where p.oid = 'shared._current_person_must_change_password()'::regprocedure),
  'the owner of _current_person_must_change_password() has BYPASSRLS — without it the policy cycle recurses');

select * from finish();
rollback;
