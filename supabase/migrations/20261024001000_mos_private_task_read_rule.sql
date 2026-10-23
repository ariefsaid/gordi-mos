-- DOWN: run supabase/rollbacks/20261024001000_mos_private_task_read_rule.sql
-- Private Task (#1839): the column, the who-can-see list, and the one read rule.
--
-- mos.can_person_read_task is the ONE place the rule lives: org match AND (not private OR admin OR
-- creator OR PIC OR Supervisor OR on the who-can-see list). A later Meetings migration adds its
-- arm (attendee of the private Meeting the Task came from) by replacing this function only.
-- mos.can_read_task is the session-bound wrapper every policy and definer read path calls.
-- SECURITY DEFINER for the same reason as mos.can_read_signal: the tasks SELECT policy calls it
-- and it reads mos.tasks and mos.task_viewers, which are gated by that policy; INVOKER would recurse.

alter table mos.tasks add column is_private boolean not null default false;
comment on column mos.tasks.is_private is
  'Private Task: when true only the creator, PIC, Supervisor, the people in mos.task_viewers and admins can read it (mos.can_person_read_task). False reads org-wide, as before.';

create table mos.task_viewers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null default shared.current_org_id() references shared.orgs(id) on delete cascade,
  task_id    uuid not null references mos.tasks(id) on delete cascade,
  person_id  uuid not null references shared.people(id),
  created_by uuid not null default shared.current_person_id() references shared.people(id),
  created_at timestamptz not null default now(),
  unique (task_id, person_id)
);
comment on table mos.task_viewers is
  'The who-can-see list of a private Task: extra people who may read it besides creator, PIC, Supervisor and admins. Written only by someone who may change the Task''s privacy (mos.can_change_task_privacy).';
create index task_viewers_org_idx on mos.task_viewers (org_id);
create index task_viewers_person_idx on mos.task_viewers (person_id);

-- Both people and the task must be in the row's org. Reads the task as the caller, so a task the
-- writer cannot read is reported as missing, the same error as a foreign-org id.
create or replace function mos._guard_task_viewers()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.task_id is distinct from old.task_id or new.person_id is distinct from old.person_id
                           or new.org_id is distinct from old.org_id) then
    raise exception 'task_viewers rows are immutable; delete and re-add' using errcode = '42501';
  end if;
  if not exists (select 1 from mos.tasks t where t.id = new.task_id and t.org_id = new.org_id) then
    raise exception 'task_id belongs to a different org' using errcode = '42501';
  end if;
  if not exists (select 1 from shared.people p where p.id = new.person_id and p.org_id = new.org_id) then
    raise exception 'person_id must belong to the same org as the task' using errcode = '23514';
  end if;
  return new;
end;
$$;
comment on function mos._guard_task_viewers() is
  'Guard: a who-can-see row names a same-org person on a same-org task the writer can read; rows are immutable.';
create trigger task_viewers_guard
  before insert or update on mos.task_viewers
  for each row execute function mos._guard_task_viewers();

-- The one read rule. p_is_admin is passed in because the session reads it from the JWT while a
-- notice recipient's admin role is read from shared.person_access_roles.
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
revoke execute on function mos.can_person_read_task(uuid, uuid, boolean) from public, anon, authenticated;

create or replace function mos.can_read_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select mos.can_person_read_task(
    p_task_id,
    shared.current_person_id(),
    coalesce(shared.has_access_role('admin'), false))
$$;
comment on function mos.can_read_task(uuid) is
  'Read gate for a Task and everything under it, for the session person. SECURITY DEFINER to avoid RLS recursion (see mos.can_read_signal); returns only a boolean.';
revoke execute on function mos.can_read_task(uuid) from public, anon, authenticated;
grant  execute on function mos.can_read_task(uuid) to authenticated;

-- Who may turn Private on/off or change the who-can-see list. Today that is exactly who may edit
-- the Task. The Meetings rule ("only an attendee of the private Meeting can turn it off") replaces
-- this function; the tasks guard and the task_viewers policies both call it.
create or replace function mos.can_change_task_privacy(p_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select mos.can_edit_task(p_task_id) $$;
comment on function mos.can_change_task_privacy(uuid) is
  'Gate for toggling Private and editing the who-can-see list: the editors of the Task (mos.can_edit_task). Replaced by the Meetings migration to add the attendee rule.';
revoke execute on function mos.can_change_task_privacy(uuid) from public, anon;
grant  execute on function mos.can_change_task_privacy(uuid) to authenticated;

grant select, insert, delete on mos.task_viewers to authenticated;
alter table mos.task_viewers enable row level security;
alter table mos.task_viewers force row level security;

create policy task_viewers_select on mos.task_viewers
  for select to authenticated
  using (org_id = (select shared.current_org_id()) and mos.can_read_task(task_id));
create policy task_viewers_insert on mos.task_viewers
  for insert to authenticated
  with check (org_id = (select shared.current_org_id()) and mos.can_change_task_privacy(task_id));
create policy task_viewers_delete on mos.task_viewers
  for delete to authenticated
  using (org_id = (select shared.current_org_id()) and mos.can_change_task_privacy(task_id));
