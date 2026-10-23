-- DOWN for 20261024001200. Restores the original create_notification (20260805000007).
begin;
do $$
begin
  if exists (select 1 from mos.tasks where is_private) then
    raise exception 'Rollback refused: make every private Task public (or archive the data) first';
  end if;
end $$;
drop trigger task_viewers_purge_notices on mos.task_viewers;
drop trigger tasks_purge_notices on mos.tasks;
drop function mos._purge_task_notices();
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
begin
  if not exists (
    select 1 from shared.people
     where id = p_owner
       and org_id = shared.current_org_id()
       and archived_at is null
  ) then
    raise exception 'create_notification: target % is not a current-org active person', p_owner
      using errcode = '42501';
  end if;

  insert into mos.notifications (owner_id, org_id, severity, title, body, metadata)
  values (p_owner, shared.current_org_id(), coalesce(p_severity, 'info'), p_title, p_body,
          coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function mos.create_notification(uuid, text, text, text, jsonb) is
  'The ONLY path that writes a notification for another owner (@mention delivery). SECURITY DEFINER, org-walled to a same-org non-archived target.';
revoke execute on function mos.create_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;
drop function mos.person_can_read_task(uuid, uuid);
drop trigger tasks_privacy_guard on mos.tasks;
drop function mos._guard_task_privacy();
commit;
