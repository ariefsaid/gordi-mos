-- SEC — kitchen-log pre-approval tampering. The UPDATE policy on ops.kitchen_logs was org-only, so
-- any authenticated member of the org could edit any other member's pending (Submitted) row. This
-- scopes non-privileged edits to the submitter's own rows; ops_lead/admin keep the review-edit they
-- need, and the Submitted→Approved/Rejected transition remains their exclusive right via the
-- existing ops._guard_kitchen_log trigger (unchanged by this migration).
--
-- Ported from the hardening authored on the v4 line (20260723000001), which closes TWO gaps. Only
-- this one is portable today: the other — requiring a working relationship with the kitchen before
-- a member may SUBMIT — depends on the shared.teams / shared.team_memberships substrate, which does
-- not exist on this line. It arrives with the v4 port, where its dependencies already exist.
--
-- Why it matters more than its severity suggests: production capture moves into MOS precisely so the
-- numbers become trustworthy. "Anyone may edit anyone's pending entry" is the one property that
-- argues against that, and it costs one policy to remove.
--
-- New migration rather than an edit to 20260620000008 — house rule, applied migrations are immutable.
-- SELECT stays org-wide: the review queue and pesanan view are deliberately org-readable (FR-044).
-- INSERT is unchanged: it already forces submitted_by = self and status = 'Submitted'.

drop policy if exists kitchen_logs_update_reviewer on ops.kitchen_logs;

create policy kitchen_logs_update_own_or_reviewer on ops.kitchen_logs
  for update to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      submitted_by = shared.current_person_id()
      or shared.has_access_role('ops_lead')
      or shared.has_access_role('admin')
    )
  )
  with check (
    org_id = shared.current_org_id()
    and (
      submitted_by = shared.current_person_id()
      or shared.has_access_role('ops_lead')
      or shared.has_access_role('admin')
    )
  );

comment on policy kitchen_logs_update_own_or_reviewer on ops.kitchen_logs is
  'Non-privileged edits are scoped to the submitter''s own rows; ops_lead/admin retain review-edit. '
  'submitted_by is immutable post-insert (ops._guard_kitchen_log), so USING and WITH CHECK cannot '
  'disagree — a member can neither re-attribute a row to themselves nor away from themselves. '
  'Replaces the org-only kitchen_logs_update_reviewer.';

-- DOWN (manual, pre-production):
--   drop policy if exists kitchen_logs_update_own_or_reviewer on ops.kitchen_logs;
--   create policy kitchen_logs_update_reviewer on ops.kitchen_logs
--     for update to authenticated
--     using (org_id = shared.current_org_id())
--     with check (org_id = shared.current_org_id());
