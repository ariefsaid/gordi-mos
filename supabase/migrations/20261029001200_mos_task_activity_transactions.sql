-- DOWN: run supabase/rollbacks/20261029001200_mos_task_activity_transactions.sql
-- Task activity is recorded in the transaction that changes the Task or its checklist.
create or replace function mos._guard_task_event_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 and current_user in ('postgres', 'supabase_admin', 'service_role') then
    new.created_at := clock_timestamp();
    return new;
  end if;

  -- Trusted SQL imports without a person retain their explicit history path.
  if shared.current_person_id() is null and current_user in ('postgres', 'supabase_admin', 'service_role') then
    new.created_at := clock_timestamp();
    return new;
  end if;

  if current_user = 'authenticated' and not coalesce(
    new.org_id = shared.current_org_id()
    and new.actor_person_id = shared.current_person_id()
    and (mos.can_edit_task(new.task_id) or (new.event_type = 'created' and shared.is_org_wide()
      and exists (select 1 from mos.tasks t where t.id = new.task_id
                  and t.created_by = shared.current_person_id()))), false) then
    raise exception 'task event requires its current-org editor and session actor' using errcode = '42501';
  end if;

  -- Older clients and RPCs still append after saving. The mutation already wrote the event.
  return null;
end;
$$;
comment on function mos._guard_task_event_write() is
  'Accepts database-triggered activity; legacy appends are acknowledged without writing. Trusted SQL imports without a session person retain explicit events with database timestamps.';
revoke execute on function mos._guard_task_event_write() from public, anon, authenticated;
create trigger task_events_write_guard before insert on mos.task_events
  for each row execute function mos._guard_task_event_write();

create or replace function mos._record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := shared.current_person_id();
  v_field text;
  v_old jsonb;
  v_new jsonb;
begin
  if v_actor is null then return null; end if;
  if tg_op = 'INSERT' then
    insert into mos.task_events(org_id, task_id, actor_person_id, event_type)
    values (new.org_id, new.id, v_actor, 'created');
    return null;
  end if;
  if new.status is distinct from old.status then
    insert into mos.task_events(org_id, task_id, actor_person_id, event_type, from_value, to_value)
    values (new.org_id, new.id, v_actor, 'status_changed', old.status, new.status);
  end if;
  if new.archived_at is distinct from old.archived_at then
    insert into mos.task_events(org_id, task_id, actor_person_id, event_type)
    values (new.org_id, new.id, v_actor, case when new.archived_at is null then 'unarchived' else 'archived' end);
  end if;
  if new.consulted_person_ids is distinct from old.consulted_person_ids
     or new.informed_person_ids is distinct from old.informed_person_ids then
    insert into mos.task_events(org_id, task_id, actor_person_id, event_type)
    values (new.org_id, new.id, v_actor, 'raci_edited');
  end if;
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  foreach v_field in array array['title', 'description', 'due_date', 'business_unit_id', 'team_id',
    'responsible_person_id', 'accountable_person_id', 'objective_id', 'work_line_id', 'is_private', 'body'] loop
    -- Derived columns do not create a second event for the same user edit.
    if v_field = 'body' and new.description is distinct from old.description then continue; end if;
    if v_field = 'business_unit_id' and new.team_id is distinct from old.team_id then continue; end if;
    if v_old -> v_field is distinct from v_new -> v_field then
      insert into mos.task_events(org_id, task_id, actor_person_id, event_type, from_value, to_value)
      values (new.org_id, new.id, v_actor, 'field_edited',
        case when v_field <> 'body' then v_old ->> v_field end,
        case when v_field <> 'body' then v_new ->> v_field end);
    end if;
  end loop;
  return null;
end;
$$;
comment on function mos._record_task_activity() is
  'Records the session actor and actual Task transitions atomically; ignores mechanical clocks and no-op updates. SQL imports without a person provide their own explicit events.';
revoke execute on function mos._record_task_activity() from public, anon, authenticated;
create trigger tasks_record_activity after insert or update on mos.tasks
  for each row execute function mos._record_task_activity();

create or replace function mos._record_checklist_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task uuid;
  v_org uuid;
  v_actor uuid := shared.current_person_id();
begin
  if v_actor is null then return null; end if;
  if tg_op = 'UPDATE' and new.label is not distinct from old.label
     and new.is_done is not distinct from old.is_done then return null; end if;
  if tg_op = 'DELETE' then
    v_task := old.task_id; v_org := old.org_id;
  else
    v_task := new.task_id; v_org := new.org_id;
  end if;
  -- A parent cascade has no remaining Task to receive activity.
  if exists (select 1 from mos.tasks t where t.id = v_task and t.org_id = v_org) then
    insert into mos.task_events(org_id, task_id, actor_person_id, event_type)
    values (v_org, v_task, v_actor, 'field_edited');
  end if;
  return null;
end;
$$;
comment on function mos._record_checklist_activity() is
  'Checklist additions, label/completion changes and deletions record activity in the same transaction; position changes alone do not.';
revoke execute on function mos._record_checklist_activity() from public, anon, authenticated;
create trigger task_checklist_record_activity after insert or update or delete on mos.task_checklist_items
  for each row execute function mos._record_checklist_activity();
