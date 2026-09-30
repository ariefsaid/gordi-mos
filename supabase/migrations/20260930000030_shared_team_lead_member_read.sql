-- shared — a member reads the Team-lead designation of the Teams they are an active member of.
--
-- The lead designation was RPC-only and admin-only, so a new Task's Supervisor could not default to
-- the creator's home Team lead for anyone but an admin. This adds the smallest scoped read: a row
-- policy limited to the viewer's own active Teams, and a column grant that omits the audit columns.
-- The table stays write-closed and the admin settings RPCs are unchanged.
--
-- DOWN (manual, before production):
--   drop policy team_lead_assignments_select_own_team on shared.team_lead_assignments;
--   revoke select on shared.team_lead_assignments from authenticated;

grant select (org_id, team_id, lead_person_id) on shared.team_lead_assignments to authenticated;

create policy team_lead_assignments_select_own_team on shared.team_lead_assignments
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and exists (
      select 1
        from shared.team_memberships m
       where m.org_id = team_lead_assignments.org_id
         and m.team_id = team_lead_assignments.team_id
         and m.person_id = shared.current_person_id()
         and m.effective_from <= current_date
         and (m.effective_to is null or m.effective_to >= current_date)
    )
  );
comment on policy team_lead_assignments_select_own_team on shared.team_lead_assignments is
  'A member reads the designated lead of a Team they are actively a member of, same org only. '
  'No other row and no write; admins list every Team through shared.list_team_lead_assignments().';
