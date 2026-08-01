begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- #131 / GHSA-85fp-gf27-wg2c, second half — the flag must gate AUTHORIZATION, not just rendering.
--
-- 20260801000001 made the password change the only thing that lowers the flag, so the gate can no
-- longer be forged. But the gate was still only a React redirect: a flagged session's JWT stayed
-- fully authorized, so the holder of an admin-known password could skip the SPA entirely and read
-- everything RLS allows straight from PostgREST — reporting revenue/COGS/margin (ADR-0050),
-- per-branch revenue (ADR-0051), the org directory — from devtools or a second tab.
--
-- Against an ordinary user, a client-side gate is an accepted limit. Against THIS threat actor,
-- who holds the token by definition, it is the control failing open.
--
-- The seam is shared.current_org_id(): ~202 policy references across mos/ops/shared/reporting/
-- integrations all scope by it, so gating it there fails every org-scoped read closed at once.

select mos._test_seed_role_tree();      -- org a1 people d1..d7, roles f1..f6/c1; org b1 person b4
select mos._test_seed_access_roles();   -- grants admin -> GrandMgr (...d3)

-- Act as d7 throughout: an ordinary member, no access roles.
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":[]}';

-- ── Precondition: unflagged, d7 reads the org normally ───────────────────────────────────────
-- Without these the "denied" assertions below could pass on a seed that was empty all along.
select cmp_ok((select count(*) from shared.people), '>', 1::bigint,
  'precondition: an unflagged member sees more than just their own person row');
select cmp_ok((select count(*) from shared.roles), '>', 0::bigint,
  'precondition: an unflagged member sees the org role tree');

-- ── Flag d7, and the org closes ──────────────────────────────────────────────────────────────
reset role;
update shared.people set must_change_password = true
 where id = '00000000-0000-0000-0000-0000000000d7';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":[]}';

select is((select count(*) from shared.roles), 0::bigint,
  'AC-131j: a flagged session reads NO org data — the token is live but no longer authorized');
select is((select count(*) from shared.person_roles), 0::bigint,
  'AC-131j: ...and that holds for every table scoped by current_org_id(), not just one');
select is(shared.current_org_id(), null,
  'AC-131k: current_org_id() is the seam — it returns null while flagged, so every policy
   predicate that scopes by it is false rather than each policy needing its own guard');

-- ── ...but the viewer can still read their OWN row, or the gate cannot render ────────────────
-- resolveViewer reads shared.people by user_id to discover must_change_password. If that read were
-- also closed, the SPA would resolve person=null, show the ORPHAN screen instead of the
-- set-password screen, and the user could never get out. The self policy is what prevents that.
select is((select count(*) from shared.people), 1::bigint,
  'AC-131l: a flagged session still sees exactly ONE person row — its own');
-- array_agg, not a bare scalar subquery: while the gate is missing this returns every row, and a
-- scalar subquery would abort the whole file with 22023 instead of failing as an assertion.
select is(
  (select array_agg(id order by id) from shared.people),
  array['00000000-0000-0000-0000-0000000000d7'::uuid],
  'AC-131l: and it is their own row, so the SPA can read the flag and render the gate');

-- ── Writes close too ─────────────────────────────────────────────────────────────────────────
-- Same seam, so this is covered by construction — asserted anyway, because "reads are gated" would
-- be a hollow control if a flagged session could still mutate.
select is((select count(*) from mos.tasks), 0::bigint,
  'AC-131m: a flagged session reads no mos data either');

-- ── Clearing the flag restores everything ────────────────────────────────────────────────────
-- Cleared as owner. That the PASSWORD CHANGE is what clears it is owned by AC-131g in
-- 88_must_change_password.sql — this file owns the authorization seam, not the clearing mechanism,
-- and the seeded d7 has no auth.users row to change a password on.
reset role;
update shared.people set must_change_password = false
 where id = '00000000-0000-0000-0000-0000000000d7';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":[]}';
select is(shared.current_org_id(), '00000000-0000-0000-0000-0000000000a1'::uuid,
  'AC-131n: the seam reopens the moment the flag clears — no token refresh needed, because the
   check reads the table rather than a JWT claim');
select cmp_ok((select count(*) from shared.roles), '>', 0::bigint,
  'AC-131n: and org reads work again');

-- ── An unflagged bystander is never affected ─────────────────────────────────────────────────
-- The gate is per-person. If it leaked across sessions it would lock out the whole org the first
-- time one account was provisioned.
reset role;
update shared.people set must_change_password = true
 where id = '00000000-0000-0000-0000-0000000000d7';

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["admin"]}';
select cmp_ok((select count(*) from shared.roles), '>', 0::bigint,
  'AC-131o: d3 is unflagged and reads normally while d7 is flagged — the gate is per-person');

-- ── Deploy guard: the recursion break depends on a ROLE ATTRIBUTE, not on DEFINER ───────────
-- shared.people is FORCE ROW LEVEL SECURITY, so being the table owner does NOT exempt
-- _current_person_must_change_password() from people's own policy — and that policy calls
-- current_org_id(), which calls this function. The only reason it terminates is that the owner
-- carries BYPASSRLS. If a self-hosted deploy runs migrations as a role without it, every policy
-- evaluation on every table recurses: not a degraded feature, a down database. Assert it here so a
-- bad environment fails at `supabase test db` rather than under live traffic.
select ok(
  (select r.rolbypassrls
     from pg_proc p
     join pg_roles r on r.oid = p.proowner
    where p.oid = 'shared._current_person_must_change_password()'::regprocedure),
  'AC-131p: the owner of _current_person_must_change_password() has BYPASSRLS — without it, the
   people policy -> current_org_id() -> this function cycle recurses and the DB is down');

select * from finish();
rollback;
