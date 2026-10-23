-- Meetings (#1840), part 2: who can read and edit, grants, RLS.
--
--   mos.can_read_meeting(id)  org match AND (not private OR live attendee OR admin)
--   mos.can_edit_meeting(id)  can read AND (live attendee OR live member of the owning Team OR admin)
--
-- Both are SECURITY DEFINER because the Meeting policies and the attendee policies call them: under
-- INVOKER their own reads of mos.meetings / mos.meeting_attendees would re-enter those policies.
-- They gate on shared.current_org_id() explicitly. Edit requires read, so a Team member who cannot
-- see a private Meeting cannot add themselves to it.
--
-- Meetings are created only through mos.create_meeting / mos.start_next_meeting (no INSERT grant).
-- Nothing is deleted: Meetings archive, attendees are removed softly.
--
-- DOWN: supabase/rollbacks/20261024002100_mos_meetings_access.sql

create or replace function mos.can_read_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from mos.meetings m
    where m.id = p_meeting_id
      and m.org_id = shared.current_org_id()
      and (
        not m.is_private
        or shared.has_access_role('admin')
        or exists (
          select 1 from mos.meeting_attendees a
          where a.meeting_id = m.id and a.person_id = shared.current_person_id() and a.removed_at is null)
      )
  )
$$;
comment on function mos.can_read_meeting(uuid) is
  'Read gate (#1840): same org and (not Private, or a live attendee, or admin). SECURITY DEFINER so the Meeting policies can call it without recursing into themselves.';

create or replace function mos.can_edit_meeting(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select mos.can_read_meeting(p_meeting_id)
     and exists (
       select 1 from mos.meetings m
       where m.id = p_meeting_id
         and (
           shared.has_access_role('admin')
           or exists (
             select 1 from mos.meeting_attendees a
             where a.meeting_id = m.id and a.person_id = shared.current_person_id() and a.removed_at is null)
           or exists (
             select 1 from shared.team_memberships tm
             where tm.team_id = m.owning_team_id and tm.person_id = shared.current_person_id()
               and tm.org_id = m.org_id
               and tm.effective_from <= current_date and (tm.effective_to is null or tm.effective_to >= current_date))
         )
     )
$$;
comment on function mos.can_edit_meeting(uuid) is
  'Edit gate (#1840): can read, and is a live attendee, a live member of the owning Team, or admin. SECURITY DEFINER for the same reason as can_read_meeting.';

-- May the caller name this Team as a Meeting's owner: an admin, or a live member of the Team. Only the
-- caller's own membership is revealed.
create or replace function mos.can_pick_meeting_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select shared.has_access_role('admin')
      or exists (
        select 1 from shared.team_memberships tm
        where tm.team_id = p_team_id and tm.person_id = shared.current_person_id()
          and tm.org_id = shared.current_org_id()
          and tm.effective_from <= current_date and (tm.effective_to is null or tm.effective_to >= current_date))
$$;
comment on function mos.can_pick_meeting_team(uuid) is
  'Owning-Team choice (#1840): an admin, or a live member of that Team. SECURITY DEFINER to read the caller''s membership.';

revoke execute on function mos.can_read_meeting(uuid), mos.can_edit_meeting(uuid), mos.can_pick_meeting_team(uuid) from public, anon;
grant  execute on function mos.can_read_meeting(uuid), mos.can_edit_meeting(uuid), mos.can_pick_meeting_team(uuid) to authenticated;

revoke all on mos.meetings, mos.meeting_attendees from public, anon, authenticated;
grant select, update on mos.meetings to authenticated;
grant select, insert, update on mos.meeting_attendees to authenticated;
alter table mos.meetings          enable row level security;
alter table mos.meetings          force  row level security;
alter table mos.meeting_attendees enable row level security;
alter table mos.meeting_attendees force  row level security;

create policy meetings_select on mos.meetings
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and mos.can_read_meeting(id));
create policy meetings_update on mos.meetings
  for update to authenticated
  using (mos.can_edit_meeting(id))
  with check (org_id = (select shared.current_org_id()) and mos.can_edit_meeting(id));

create policy meeting_attendees_select on mos.meeting_attendees
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and mos.can_read_meeting(meeting_id));
create policy meeting_attendees_insert on mos.meeting_attendees
  for insert to authenticated
  with check (org_id = (select shared.current_org_id()) and mos.can_edit_meeting(meeting_id));
create policy meeting_attendees_update on mos.meeting_attendees
  for update to authenticated
  using (mos.can_edit_meeting(meeting_id))
  with check (org_id = (select shared.current_org_id()) and mos.can_edit_meeting(meeting_id));
