-- Meetings (#1840), last migration: one added arm in mos.can_read_task (#1839).
--
-- THE SINGLE ARM THIS FILE ADDS (everything else is the #1839 body, kept as it was):
--
--     or exists (
--       select 1
--         from mos.meetings m
--         join mos.meeting_attendees a on a.meeting_id = m.id
--        where m.id = t.meeting_id
--          and m.is_private
--          and a.person_id = shared.current_person_id()
--          and a.removed_at is null)
--
-- i.e. a Task created in a Private Meeting is readable by everyone who is an attendee of that Meeting
-- NOW (people added later included, people removed lose it). The arm is OR-ed into the existing
-- "who can read a private Task" disjunction and nothing else changes: the org match and the
-- "not private" short-circuit stay as #1839 defines them.
--
-- INTEGRATION: the body below is the stand-in from 20261024002800 plus the arm. When #1839 is
-- merged, delete 20261024002800 and re-base this file on the #1839 function body: copy that body,
-- paste the arm above as one more OR inside its private-task disjunction. Nothing else here changes.
--
-- DOWN: redefine mos.can_read_task(uuid) as the #1839 body without the arm.

create or replace function mos.can_read_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from mos.tasks t
    where t.id = p_task_id
      and t.org_id = shared.current_org_id()
      and (
        not t.is_private
        or t.created_by = shared.current_person_id()
        or t.responsible_person_id = shared.current_person_id()
        or t.accountable_person_id = shared.current_person_id()
        or shared.has_access_role('admin')
        -- Meetings arm (#1840): an attendee of the Private Meeting the Task was created in.
        or exists (
          select 1
            from mos.meetings m
            join mos.meeting_attendees a on a.meeting_id = m.id
           where m.id = t.meeting_id
             and m.is_private
             and a.person_id = shared.current_person_id()
             and a.removed_at is null)
      )
  )
$$;
comment on function mos.can_read_task(uuid) is
  'Read gate for a Task (#1839) plus the Meetings arm (#1840): an attendee of the Private Meeting the Task was created in can read it.';
