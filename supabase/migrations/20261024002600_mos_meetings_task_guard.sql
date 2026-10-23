-- Meetings (#1840), part 7: Tasks created in a Meeting.
--
-- mos._guard_task_meeting, a second BEFORE trigger on mos.tasks next to mos._guard_tasks (kept
-- separate so it does not collide with the guard other lanes rewrite):
--   INSERT  a Task naming a meeting_id needs a Meeting the caller can read (42501), and a Task made
--           in a Private Meeting is Private whatever the client sent.
--   UPDATE  meeting_id never changes; only a live attendee of a Private Meeting may turn Private off
--           on a Task created in it.
-- This relies on mos.tasks.is_private from #1839 (the stand-in migration 20261024002800 supplies it
-- until that lane merges).
--
-- DOWN:
--   drop trigger tasks_meeting_guard on mos.tasks;
--   drop function mos._guard_task_meeting();
--   drop function mos._meeting_is_private(uuid);

-- Whether a Meeting is Private, regardless of whether the caller can read it: a non-reader must not
-- be able to learn anything else, and the guard only needs this one bit.
create or replace function mos._meeting_is_private(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select m.is_private from mos.meetings m
                    where m.id = p_meeting_id and m.org_id = shared.current_org_id()), false)
$$;
comment on function mos._meeting_is_private(uuid) is
  'True iff the Meeting exists in the caller''s org and is Private. SECURITY DEFINER; returns only that bit.';
revoke execute on function mos._meeting_is_private(uuid) from public, anon;
grant  execute on function mos._meeting_is_private(uuid) to authenticated;

create or replace function mos._guard_task_meeting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.meeting_id is not null then
      if current_user = 'authenticated' and not mos.can_read_meeting(new.meeting_id) then
        raise exception 'meeting_id is not a meeting you can open' using errcode = '42501';
      end if;
      if mos._meeting_is_private(new.meeting_id) then
        new.is_private := true;
      end if;
    end if;
    return new;
  end if;

  if new.meeting_id is distinct from old.meeting_id then
    raise exception 'meeting_id is immutable on a task' using errcode = '42501';
  end if;
  if old.meeting_id is not null and old.is_private and not new.is_private
     and mos._meeting_is_private(old.meeting_id)
     and not exists (
       select 1 from mos.meeting_attendees a
        where a.meeting_id = old.meeting_id and a.person_id = shared.current_person_id() and a.removed_at is null) then
    raise exception 'only an attendee of a private meeting can make its task visible to everyone' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_task_meeting() is
  'Meeting rules on mos.tasks (#1840): a Task created in a Private Meeting is Private; meeting_id is immutable; only an attendee of that Private Meeting can set is_private=false.';
create trigger tasks_meeting_guard
  before insert or update on mos.tasks
  for each row execute function mos._guard_task_meeting();
