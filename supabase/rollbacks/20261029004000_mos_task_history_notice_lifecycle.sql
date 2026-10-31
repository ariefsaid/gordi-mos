drop trigger record_task_document_only_history on mos.tasks;
drop function mos._record_task_document_only_history();
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
         -- Meetings arm (#1840): a live attendee of the private Meeting the Task was created in.
         or (t.created_in_private_meeting and exists (
           select 1 from mos.meeting_attendees a
            where a.meeting_id = t.meeting_id
              and a.person_id = p_person_id and a.removed_at is null))
       )
  )
$$;
comment on function mos.can_person_read_task(uuid, uuid, boolean) is
  'The Private Task read rule for a given person: same org AND (not private OR admin OR creator OR PIC OR Supervisor OR on the who-can-see list OR a live attendee of the private Meeting it was created in). Internal: callers use mos.can_read_task.';
revoke execute on function mos.can_person_read_task(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function mos._purge_task_notices_for_ex_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from mos.notifications n
   where n.owner_id = new.person_id
     and n.org_id = new.org_id
     and n.metadata #>> '{entity,type}' = 'task'
     and exists (
       select 1 from mos.tasks t
        where t.id::text = n.metadata #>> '{entity,id}'
          and t.org_id = new.org_id
          and t.is_private
          and not mos.person_can_read_task(new.person_id, t.id));
  return null;
end;
$$;
comment on function mos._purge_task_notices_for_ex_admin() is
  'AFTER trigger on shared.person_access_roles: when admin is revoked, deletes that person''s notices about private Tasks they can no longer read (mos.person_can_read_task).';
revoke execute on function mos._purge_task_notices_for_ex_admin() from public, anon, authenticated;

drop function mos._task_read_in_org(uuid, uuid, boolean, uuid);
