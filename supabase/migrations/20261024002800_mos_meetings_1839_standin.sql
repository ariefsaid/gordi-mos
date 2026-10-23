-- STAND-IN FOR #1839 (Private task). DELETE THIS FILE when the #1839 migrations are merged in.
--
-- The Meetings lane (#1840) is built beside #1839, which owns mos.tasks.is_private, the who-can-see
-- list and mos.can_read_task(uuid) (used by every task SELECT policy). So this branch can be built
-- and tested alone, this file supplies the least of that contract: the column, a can_read_task
-- carrying creator / PIC / Supervisor / admin, and the SELECT policy calling it. #1839's real
-- versions replace all three; the Meetings lane adds exactly one arm to the function
-- (20261024002900), which the integrator re-bases onto the #1839 body.
--
-- DOWN: drop this file's objects only if #1839 has not landed:
--   alter policy tasks_select_org on mos.tasks using (org_id = (select shared.current_org_id()));
--   drop function mos.can_read_task(uuid);
--   alter table mos.tasks drop column is_private;

alter table mos.tasks add column if not exists is_private boolean not null default false;

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
      )
  )
$$;
comment on function mos.can_read_task(uuid) is
  'STAND-IN for #1839: org match and (not private, or creator, PIC, Supervisor, or admin).';
revoke execute on function mos.can_read_task(uuid) from public, anon;
grant  execute on function mos.can_read_task(uuid) to authenticated;

-- The creator arm is inline so INSERT ... RETURNING (the app's createTask) still sees its own new row:
-- a stable function cannot see a row inserted by the statement that calls it.
alter policy tasks_select_org on mos.tasks
  using (org_id = (select shared.current_org_id())
         and (created_by = (select shared.current_person_id()) or mos.can_read_task(id)));
