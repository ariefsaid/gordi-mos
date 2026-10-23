-- Meetings (#1840), last migration: the two Meetings rules inside the #1839 Private Task contract.
-- Each function below is the #1839 body (20261024001000) with ONLY the marked addition.
--
-- 1. mos.can_person_read_task gains ONE arm: a Task created in a Private Meeting is readable by
--    every live attendee of that Meeting now (people added later included, people removed lose it):
--
--        or exists (
--          select 1
--            from mos.meetings m
--            join mos.meeting_attendees a on a.meeting_id = m.id
--           where m.id = t.meeting_id and m.is_private
--             and a.person_id = p_person_id and a.removed_at is null)
--
--    Because the notice gate (mos.person_can_read_task) and the session wrapper (mos.can_read_task)
--    both call this function, every read path and every notice follows the arm.
--
-- 2. mos.can_change_task_privacy gains ONE rule: for a Task created in a Private Meeting, only a
--    live attendee of that Meeting may turn Private off (or change its who-can-see list), on top of
--    the #1839 gate (can edit the Task). Other Tasks are unchanged.
--
-- DOWN: replace both functions with their 20261024001000 bodies.

create or replace function mos.can_person_read_task(p_task_id uuid, p_person_id uuid, p_is_admin boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from mos.tasks t
     where t.id = p_task_id
       and t.org_id = shared.current_org_id()
       and (
         not t.is_private
         or coalesce(p_is_admin, false)
         or t.created_by = p_person_id
         or t.responsible_person_id = p_person_id
         or t.accountable_person_id = p_person_id
         or exists (
           select 1 from mos.task_viewers v
            where v.task_id = t.id and v.person_id = p_person_id)
         -- Meetings arm (#1840): a live attendee of the Private Meeting the Task was created in.
         or exists (
           select 1
             from mos.meetings m
             join mos.meeting_attendees a on a.meeting_id = m.id
            where m.id = t.meeting_id and m.is_private
              and a.person_id = p_person_id and a.removed_at is null)
       )
  )
$$;
comment on function mos.can_person_read_task(uuid, uuid, boolean) is
  'The Private Task read rule for a given person: same org AND (not private OR admin OR creator OR PIC OR Supervisor OR on the who-can-see list OR a live attendee of the Private Meeting it was created in). Internal: callers use mos.can_read_task.';
revoke execute on function mos.can_person_read_task(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function mos.can_change_task_privacy(p_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select mos.can_edit_task(p_task_id)
     -- Meetings rule (#1840): a Task from a Private Meeting is changed only by an attendee of it.
     and (
       not exists (
         select 1 from mos.tasks t
          where t.id = p_task_id and t.meeting_id is not null and mos._meeting_is_private(t.meeting_id))
       or exists (
         select 1 from mos.tasks t
           join mos.meeting_attendees a on a.meeting_id = t.meeting_id
          where t.id = p_task_id and a.person_id = shared.current_person_id() and a.removed_at is null)
     )
$$;
comment on function mos.can_change_task_privacy(uuid) is
  'Gate for toggling Private and editing the who-can-see list: the editors of the Task (mos.can_edit_task); for a Task created in a Private Meeting, only its attendees.';
revoke execute on function mos.can_change_task_privacy(uuid) from public, anon;
grant  execute on function mos.can_change_task_privacy(uuid) to authenticated;
