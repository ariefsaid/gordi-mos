-- Meetings (#1840): the Meeting task readers also return each Task's own privacy.
--
-- mos.meeting_tasks / mos.meeting_still_open now carry is_private and created_in_private_meeting, so the
-- minutes show a Task's lock from the Task itself rather than from the Meeting's current Private setting.
-- The return type changes, so each function is dropped and created again; grants are repeated.
--
-- DOWN: supabase/rollbacks/20261025001000_mos_meeting_tasks_privacy_columns.sql

drop function mos.meeting_still_open(uuid);
drop function mos.meeting_tasks(uuid);

create function mos.meeting_still_open(p_meeting_id uuid)
returns table (id uuid, title text, responsible_person_id uuid, accountable_person_id uuid,
               due_date date, status text, meeting_id uuid, is_private boolean, created_in_private_meeting boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.title, t.responsible_person_id, t.accountable_person_id, t.due_date, t.status, t.meeting_id,
         t.is_private, t.created_in_private_meeting
    from mos.meetings m
    join mos.tasks t on t.meeting_id = m.previous_meeting_id
   where m.id = p_meeting_id
     and t.status <> 'Done' and t.archived_at is null
   order by t.due_date nulls last, t.created_at
$$;
comment on function mos.meeting_still_open(uuid) is
  'Still open from last time: the previous Meeting''s Tasks not Done and not archived, as far as the caller can read them (Task and Meeting RLS apply), with each Task''s own privacy.';

create function mos.meeting_tasks(p_meeting_id uuid)
returns table (id uuid, title text, responsible_person_id uuid, accountable_person_id uuid,
               due_date date, status text, meeting_id uuid, is_private boolean, created_in_private_meeting boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.title, t.responsible_person_id, t.accountable_person_id, t.due_date, t.status, t.meeting_id,
         t.is_private, t.created_in_private_meeting
    from mos.tasks t
   where t.meeting_id = p_meeting_id and t.archived_at is null
   order by t.created_at
$$;
comment on function mos.meeting_tasks(uuid) is
  'Tasks created in this Meeting that the caller can read (Task RLS applies), oldest first, with each Task''s own privacy.';

revoke execute on function mos.meeting_still_open(uuid) from public, anon;
revoke execute on function mos.meeting_tasks(uuid) from public, anon;
grant execute on function mos.meeting_still_open(uuid) to authenticated;
grant execute on function mos.meeting_tasks(uuid) to authenticated;
