-- DOWN: run supabase/rollbacks/20261024001200_mos_private_task_guard_and_notices.sql
-- Private Task (#1839): the Supervisor rule, the privacy-change gate, and no notice leaks.

-- ── Guard: Supervisor "None, just me" and who may change privacy ─────────────────────────────
-- "None, just me" is stored as Supervisor = PIC (accountable_person_id stays NOT NULL). It is
-- allowed on a private Task only when the PIC is the creator; any other private Task keeps a real
-- Supervisor. Public Tasks keep today's rules. Toggling Private goes through the gate the Meetings
-- migration replaces (mos.can_change_task_privacy); the UPDATE policy already limits writes to
-- editors, this names the privacy decision on its own so it can be tightened without touching
-- the edit gate.
create or replace function mos._guard_task_privacy()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_private
     and new.accountable_person_id = new.responsible_person_id
     and new.responsible_person_id <> new.created_by then
    raise exception 'a private task needs its own Supervisor unless the PIC is its creator'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.is_private is distinct from old.is_private
     and current_user = 'authenticated'
     and not mos.can_change_task_privacy(old.id) then
    raise exception 'only someone who can change this task''s privacy may turn Private on or off'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_task_privacy() is
  'Guard on mos.tasks: a private Task has Supervisor = PIC only when the PIC is the creator ("None, just me", 23514); toggling is_private requires mos.can_change_task_privacy (42501).';
create trigger tasks_privacy_guard
  before insert or update on mos.tasks
  for each row execute function mos._guard_task_privacy();

-- ── Notices: only to people who can read the Task ────────────────────────────────────────────
-- Recipient-side read check for the notice writer and the purge below. The recipient's admin role
-- comes from shared.person_access_roles (their JWT is not the session's).
create or replace function mos.person_can_read_task(p_person_id uuid, p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select mos.can_person_read_task(
    p_task_id,
    p_person_id,
    exists (
      select 1 from shared.person_access_roles r
       where r.person_id = p_person_id
         and r.org_id = shared.current_org_id()
         and r.access_role = 'admin'
         and r.revoked_at is null))
$$;
comment on function mos.person_can_read_task(uuid, uuid) is
  'Can this person (not the session) read this Task? Used to gate notice delivery. Internal.';
revoke execute on function mos.person_can_read_task(uuid, uuid) from public, anon, authenticated;

-- The one cross-owner notice writer: a notice about a Task goes only to someone who can read that
-- Task. Returns NULL (nothing written) otherwise, so a mention of an outsider on a private Task
-- succeeds silently and says nothing about the Task. Mention, comment and assignment notices all
-- pass through here.
create or replace function mos.create_notification(
  p_owner    uuid,
  p_severity text,
  p_title    text,
  p_body     text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_task text := case when p_metadata #>> '{entity,type}' = 'task' then p_metadata #>> '{entity,id}' end;
begin
  -- The org wall. A caller in org A can never deliver into org B, so a cross-org @mention is not
  -- merely unauthorised but impossible; an archived person cannot be notified either.
  if not exists (
    select 1 from shared.people
     where id = p_owner
       and org_id = shared.current_org_id()
       and archived_at is null
  ) then
    raise exception 'create_notification: target % is not a current-org active person', p_owner
      using errcode = '42501';
  end if;

  if v_task is not null
     and v_task ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     and not mos.person_can_read_task(p_owner, v_task::uuid) then
    return null;
  end if;

  insert into mos.notifications (owner_id, org_id, severity, title, body, metadata)
  values (p_owner, shared.current_org_id(), coalesce(p_severity, 'info'), p_title, p_body,
          coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function mos.create_notification(uuid, text, text, text, jsonb) is
  'The ONLY path that writes a notification for another owner. SECURITY DEFINER, org-walled to a same-org non-archived target; a notice whose entity is a Task is delivered only to someone who can read that Task (otherwise returns NULL).';
revoke execute on function mos.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- A Task turning private, or a person leaving its list, removes notices already delivered to
-- people who can no longer read it (their title and body would otherwise keep the Task's words).
create or replace function mos._purge_task_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task uuid;
begin
  if tg_op = 'DELETE' then v_task := old.task_id; else v_task := new.id; end if;
  delete from mos.notifications n
   where n.org_id = shared.current_org_id()
     and n.metadata #>> '{entity,type}' = 'task'
     and n.metadata #>> '{entity,id}' = v_task::text
     and not mos.person_can_read_task(n.owner_id, v_task);
  return null;
end;
$$;
comment on function mos._purge_task_notices() is
  'AFTER trigger: deletes Task notices owned by people who can no longer read the Task (it turned private, or someone left its who-can-see list).';
revoke execute on function mos._purge_task_notices() from public, anon, authenticated;
create trigger tasks_purge_notices
  after update of is_private on mos.tasks
  for each row when (new.is_private and not old.is_private)
  execute function mos._purge_task_notices();
create trigger task_viewers_purge_notices
  after delete on mos.task_viewers
  for each row execute function mos._purge_task_notices();
