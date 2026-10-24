-- DOWN for 20261024002900. Restores the 20261024001000 bodies of the two functions.
begin;
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
       )
  )
$$;
comment on function mos.can_person_read_task(uuid, uuid, boolean) is
  'The Private Task read rule for a given person: same org AND (not private OR admin OR creator OR PIC OR Supervisor OR on the who-can-see list). The one place a Meetings arm is added. Internal: callers use mos.can_read_task.';

create or replace function mos.can_change_task_privacy(p_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select mos.can_edit_task(p_task_id) $$;
comment on function mos.can_change_task_privacy(uuid) is
  'Gate for toggling Private and editing the who-can-see list: the editors of the Task (mos.can_edit_task). Replaced by the Meetings migration to add the attendee rule.';
commit;
