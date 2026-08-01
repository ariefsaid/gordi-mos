-- #131 / GHSA-85fp-gf27-wg2c, second half — make the flag gate AUTHORIZATION, not just rendering.
--
-- ...0001 made the password change the only thing that lowers the flag, so the gate can no longer
-- be forged. But it was still only a React redirect. A flagged session's JWT stayed fully
-- authorized, so the holder of an admin-known password could skip the SPA and read everything RLS
-- allows straight from PostgREST — reporting revenue/COGS/margin (ADR-0050), per-branch revenue
-- (ADR-0051), the org directory — from devtools or a second tab. Against an ordinary user a
-- client-side gate is an accepted limit; against this threat actor, who holds the token by
-- definition, it is the control failing open.
--
-- The seam is shared.current_org_id(). ~202 policy references across mos/ops/shared/reporting/
-- integrations scope by it, so gating it there closes every org-scoped read and write at once,
-- rather than adding a guard to 91 policies and hoping none is missed later.
--
-- Deliberately NOT a JWT claim. A claim would be stale until the token refreshed, so the user who
-- just set their password would stay locked out until then — and the plan already rejected the
-- claim route for the flag. Reading the table costs a lookup and is always current.
--
-- Rollback:
--   drop policy people_select_self on shared.people;
--   restore shared.current_org_id() to `select shared._claim_uuid('org_id')` (20260611000004);
--   drop function shared._current_person_must_change_password();

-- ── 1. Is the CALLER flagged? ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER is load-bearing, not habit: shared.people's own SELECT policy calls
-- current_org_id(), which is about to call this function. Were this INVOKER, reading people here
-- would re-evaluate that policy and Postgres would abort with "infinite recursion detected in
-- policy for relation people".
--
-- READ THIS BEFORE DEPLOYING TO A NEW ENVIRONMENT. Definer alone is NOT what breaks the cycle:
-- shared.people is FORCE ROW LEVEL SECURITY, which deliberately subjects even the table owner to
-- its own policies. The cycle is broken only because this function's owner carries the BYPASSRLS
-- role attribute. On any environment where the migration owner lacks it — a self-hosted cluster
-- where the deploy role is not `postgres` — EVERY policy evaluation recurses and the database is
-- effectively down, not merely degraded. 89_must_change_password_authz.sql asserts the attribute
-- so that fails loudly at test time instead of silently at 3am.
--
-- Fails CLOSED-for-the-user / OPEN-for-the-org on a missing claim: no person_id claim (anon, or an
-- orphan) means no person to be flagged, so coalesce to false and current_org_id() behaves exactly
-- as it did before. Those sessions are already handled by their own policies.
create or replace function shared._current_person_must_change_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.must_change_password
       from shared.people p
      where p.id = shared._claim_uuid('person_id')),
    false)
$$;
comment on function shared._current_person_must_change_password() is
  '#131: true while the caller''s password is the admin-set one. Read by shared.current_org_id() to '
  'close every org-scoped policy. SECURITY DEFINER to break RLS recursion via shared.people.';

-- Revoke from PUBLIC, then grant BACK to authenticated explicitly. Both halves are required and the
-- order matters: EXECUTE defaults to PUBLIC, so the revoke alone also strips `authenticated` — and
-- since current_org_id() is SECURITY INVOKER and every policy calls it, that turns every query into
-- "permission denied for function". Verified: the revoke-only form fails the whole pgTAP suite.
-- The grant is what keeps the seam working; the revoke is what stops anon/PUBLIC reaching a DEFINER
-- function they have no business calling.
revoke execute on function shared._current_person_must_change_password() from public, anon;
grant  execute on function shared._current_person_must_change_password() to authenticated;

-- ── 2. The seam ──────────────────────────────────────────────────────────────────────────────
-- Body from the LATEST definition (20260611000004), per the scar in the plan. The only change is
-- the guard.
create or replace function shared.current_org_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
           when shared._current_person_must_change_password() then null::uuid
           else shared._claim_uuid('org_id')
         end
$$;
comment on function shared.current_org_id() is
  'Org id from the JWT custom claim (hook-injected, client-unspoofable). OD-P1-1. Returns NULL '
  'while the caller must change their password (#131), which closes every policy scoped by it — '
  'the flag gates authorization, not merely the UI.';

-- ── 3. ...but never starve the gate itself ───────────────────────────────────────────────────
-- resolveViewer reads shared.people by user_id to discover must_change_password. With org reads
-- closed and no self policy, that read returns nothing, the SPA resolves person=null, and it shows
-- the ORPHAN screen ("your account isn't set up yet") instead of the set-password screen — with
-- sign-out as the only action, no way to ever clear the flag, and a support call to undo it.
--
-- Scoped to the caller's OWN row and keyed on current_person_id(), which is deliberately NOT
-- gated: it is an identity, not an authorization. Discloses nothing new — the row is the reader's.
create policy people_select_self on shared.people
  for select to authenticated
  using (id = shared.current_person_id());

-- ponytail: the flag is checked per policy evaluation rather than once per statement. At ~30 people
-- that is noise. If it ever shows up in a plan, hoist it into the request via a
-- set_config/current_setting memo at the PostgREST pre-request hook.
