-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Admin writes on shared.team_memberships — putting people on teams from the app
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Owner, 2026-08-26: Admin Settings should manage "adding people to the different teams /
-- activity", not just adding people. `shared.team_memberships` has existed since the squashed
-- baseline with SELECT-only RLS and no write grant, so the only writer was the seed and the only
-- way to put someone on a team was to edit SQL.
--
-- ── Read this before widening anything here ──────────────────────────────────────────────────
-- Team membership is an AUTHORIZATION INPUT, not a label. `mos.can_read_signal`'s R1 arm,
-- `mos.can_post_signal_for_team` and `mos.can_start_process_for_team` all resolve a caller's
-- rights by asking whether a membership row exists (see shared._guard_team_memberships' comment,
-- which is why the tenancy guard was written before any write surface existed). Granting a write
-- here therefore grants the power to change who can READ which Signals and POST to which teams.
--
-- That is admissible for `admin` and only for `admin`: an admin already grants and revokes access
-- roles, which is strictly more powerful than editing a membership. It is not admissible for
-- ops_lead, manager or supervisor, none of which appear below — a team lead who could add
-- themselves to a team could read that team's Signals, and the read gate would be working exactly
-- as designed while the boundary moved underneath it.
--
-- ── No DELETE, deliberately ──────────────────────────────────────────────────────────────────
-- The table is effective-dated (`effective_from` / `effective_to`), and this schema's stated
-- convention is that removal is a soft end or an archive, never a hard delete — person_roles is
-- the single exception and says why. Ending a membership sets `effective_to`, which is an UPDATE.
-- That also frees the primary slot: `team_memberships_one_primary` is a partial unique index over
-- `is_primary and effective_to is null`, so an ended row stops competing for it without being
-- destroyed. Membership history is worth keeping — "who was on the bar in March" is a question
-- the ops surfaces will eventually ask, and a DELETE answers it with silence.
--
-- Reversal:
--   drop policy team_memberships_update_admin on shared.team_memberships;
--   drop policy team_memberships_insert_admin on shared.team_memberships;
--   revoke insert, update on shared.team_memberships from authenticated;

grant insert, update on shared.team_memberships to authenticated;

-- org_id is defaulted from the session (shared.current_org_id()) and re-checked here: the default
-- stamps it, the WITH CHECK makes it unspoofable even when a client sends one explicitly. An
-- explicit NULL is rejected too, because NULL <> current_org_id(). The same-org pairing of person
-- and team is held separately, by the BEFORE trigger, which no policy can substitute for: RLS sees
-- the membership's own org_id, not the org of the person or team it names.
create policy team_memberships_insert_admin on shared.team_memberships
  for insert to authenticated
  with check (org_id = shared.current_org_id() and shared.has_access_role('admin'));

-- USING gates which row is visible to the update; WITH CHECK gates the state it lands in. Both
-- arms carry the full predicate so an admin cannot move a row out of their own org on the way
-- through, which a USING-only policy would permit.
create policy team_memberships_update_admin on shared.team_memberships
  for update to authenticated
  using       (org_id = shared.current_org_id() and shared.has_access_role('admin'))
  with check  (org_id = shared.current_org_id() and shared.has_access_role('admin'));

comment on policy team_memberships_insert_admin on shared.team_memberships is
  'Admin-only, org-scoped. Membership is an authorization input (mos.can_read_signal R1, '
  'can_post_signal_for_team, can_start_process_for_team), so no other access role may write it.';
comment on policy team_memberships_update_admin on shared.team_memberships is
  'Admin-only, org-scoped. Carries the removal path too: ending a membership sets effective_to '
  'rather than deleting the row, which frees the one-live-primary slot and keeps the history.';

-- ── Ending a membership NOW ──────────────────────────────────────────────────────────────────
-- `effective_to` is an INCLUSIVE last day — every gate reads `effective_to >= current_date` as
-- still live (can_read_signal R1, can_post_signal_for_team, can_start_process_for_team,
-- _function_holders, the notification fan-out, ops.is_stream_reviewer). So `= current_date`
-- revokes TOMORROW while the screen says removed; revoking now is `current_date - 1`.
-- A function, not a client date: the cutoff must be the DATABASE's today, not a browser's.
-- SECURITY INVOKER — RLS admits the caller; this adds no privilege.
-- Same-day join+leave inverts the range, which is live on no day. That is the honest record.
create or replace function shared.end_team_membership(p_person_id uuid, p_team_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update shared.team_memberships
     set effective_to = current_date - 1
   where person_id = p_person_id
     and team_id   = p_team_id
     -- The GATES' definition of live, not `is null` alone: a future-dated end is still a live
     -- membership, the screen renders it as one, and this is the only way to remove it. Matching
     -- `is null` alone made Remove a silent no-op on exactly those rows.
     and (effective_to is null or effective_to >= current_date);
$$;

comment on function shared.end_team_membership(uuid, uuid) is
  'Ends a live team membership NOW: effective_to = current_date - 1, because the gates read '
  'effective_to as an inclusive last day (>= current_date is still live). SECURITY INVOKER — RLS '
  'admits the caller, this adds no privilege. Computed server-side so a skewed client clock cannot '
  'hand back access it meant to revoke.';

revoke execute on function shared.end_team_membership(uuid, uuid) from public, anon;
grant  execute on function shared.end_team_membership(uuid, uuid) to authenticated;
