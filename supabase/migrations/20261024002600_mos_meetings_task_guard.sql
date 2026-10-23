-- Meetings (#1840), part 7: Tasks created in a Meeting.
--
-- mos._guard_task_meeting, a second BEFORE trigger on mos.tasks next to mos._guard_tasks (kept
-- separate so it does not collide with the guard other lanes rewrite):
--   INSERT  a Task naming a meeting_id needs a Meeting the caller can edit (42501), and a Task made
--           in a Private Meeting is Private whatever the client sent.
--   UPDATE  meeting_id never changes.
-- Turning Private off on such a Task is gated by mos.can_change_task_privacy (#1839), which
-- 20261024002900 extends with the attendee rule. Relies on mos.tasks.is_private from #1839.
--
-- DOWN: supabase/rollbacks/20261024002600_mos_meetings_task_guard.sql

create or replace function mos._guard_task_meeting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.meeting_id is not null then
      if current_user = 'authenticated' and not mos.can_edit_meeting(new.meeting_id) then
        raise exception 'meeting_id is not a meeting you can edit' using errcode = '42501';
      end if;
      -- Under RLS the caller sees the Meeting here, so a Private one forces the Task Private.
      if exists (select 1 from mos.meetings m where m.id = new.meeting_id and m.is_private) then
        new.is_private := true;
      end if;
    end if;
    return new;
  end if;

  if new.meeting_id is distinct from old.meeting_id then
    raise exception 'meeting_id is immutable on a task' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_task_meeting() is
  'Meeting rules on mos.tasks (#1840): a Task created in a Private Meeting is Private; meeting_id is immutable.';
create trigger tasks_meeting_guard
  before insert or update on mos.tasks
  for each row execute function mos._guard_task_meeting();
