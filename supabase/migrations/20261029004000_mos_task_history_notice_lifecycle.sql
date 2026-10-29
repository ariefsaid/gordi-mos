-- DOWN: supabase/rollbacks/20261029004000_mos_task_history_notice_lifecycle.sql
-- Keep document-only edits as summaries and evaluate revoked-role notices in their org.
create or replace function mos._task_read_in_org(p_task_id uuid, p_person_id uuid, p_is_admin boolean, p_org_id uuid)
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
       and t.org_id = p_org_id
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
revoke execute on function mos._task_read_in_org(uuid, uuid, boolean, uuid) from public, anon, authenticated;

create or replace function mos.can_person_read_task(p_task_id uuid, p_person_id uuid, p_is_admin boolean)
returns boolean language sql stable security definer set search_path = ''
as $$ select mos._task_read_in_org(p_task_id, p_person_id, p_is_admin, shared.current_org_id()) $$;
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
          and not mos._task_read_in_org(t.id, new.person_id, exists (select 1 from shared.person_access_roles r where r.person_id = new.person_id and r.org_id = new.org_id and r.access_role = 'admin' and r.revoked_at is null), new.org_id));
  return null;
end;
$$;
comment on function mos._purge_task_notices_for_ex_admin() is
  'AFTER trigger on shared.person_access_roles: when admin is revoked, deletes that person''s notices about private Tasks they can no longer read in the revoked role''s org.';
revoke execute on function mos._purge_task_notices_for_ex_admin() from public, anon, authenticated;


create function mos._record_task_document_only_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into shared.record_history (org_id, schema_name, table_name, record_key, actor_person_id, action, field_name)
  select new.org_id, 'mos', 'tasks', new.id::text, shared.current_person_id(), 'update', 'body'
  where exists (select 1 from shared.orgs o where o.id = new.org_id);
  return new;
end;
$$;
revoke execute on function mos._record_task_document_only_history() from public, anon, authenticated;
create trigger record_task_document_only_history after update on mos.tasks
for each row when (old.body is distinct from new.body and old.description is not distinct from new.description)
execute function mos._record_task_document_only_history();
