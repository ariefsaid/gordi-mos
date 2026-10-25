-- DOWN for 20261025001000. Restores the Meeting task readers without the privacy columns.
begin;
drop function mos.meeting_still_open(uuid);
drop function mos.meeting_tasks(uuid);

create function mos.meeting_still_open(p_meeting_id uuid)
returns table (id uuid, title text, responsible_person_id uuid, accountable_person_id uuid,
               due_date date, status text, meeting_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.title, t.responsible_person_id, t.accountable_person_id, t.due_date, t.status, t.meeting_id
    from mos.meetings m
    join mos.tasks t on t.meeting_id = m.previous_meeting_id
   where m.id = p_meeting_id
     and t.status <> 'Done' and t.archived_at is null
   order by t.due_date nulls last, t.created_at
$$;
comment on function mos.meeting_still_open(uuid) is
  'Still open from last time: the previous Meeting''s Tasks not Done and not archived, as far as the caller can read them (Task and Meeting RLS apply).';

create function mos.meeting_tasks(p_meeting_id uuid)
returns table (id uuid, title text, responsible_person_id uuid, accountable_person_id uuid,
               due_date date, status text, meeting_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.title, t.responsible_person_id, t.accountable_person_id, t.due_date, t.status, t.meeting_id
    from mos.tasks t
   where t.meeting_id = p_meeting_id and t.archived_at is null
   order by t.created_at
$$;
comment on function mos.meeting_tasks(uuid) is
  'Tasks created in this Meeting that the caller can read (Task RLS applies), oldest first.';

revoke execute on function mos.meeting_still_open(uuid) from public, anon;
revoke execute on function mos.meeting_tasks(uuid) from public, anon;
grant execute on function mos.meeting_still_open(uuid) to authenticated;
grant execute on function mos.meeting_tasks(uuid) to authenticated;
commit;
