-- DOWN for 20261024003000. Restores the 20261024002900 / 002400 / 001400 bodies and drops the flag.
-- Refuses while any Task is private: the earlier read arm lets every attendee of the Meeting read a
-- private Task made there, which would widen who reads it.
begin;
do $$
begin
  if exists (select 1 from mos.tasks where is_private) then
    raise exception 'Rollback refused: make every private Task public (or archive the data) first';
  end if;
end $$;

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
          and t.created_by <> new.person_id
          and t.responsible_person_id <> new.person_id
          and t.accountable_person_id <> new.person_id
          and not exists (select 1 from mos.task_viewers v where v.task_id = t.id and v.person_id = new.person_id));
  return null;
end;
$$;
comment on function mos._purge_task_notices_for_ex_admin() is
  'AFTER trigger on shared.person_access_roles: when admin is revoked, deletes that person''s notices about private Tasks they have no other route to read.';

create or replace function mos._purge_removed_attendee_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from mos.notifications n
   where n.owner_id = new.person_id
     and n.org_id = new.org_id
     and n.metadata ->> 'source' = 'meeting_mention'
     and n.metadata #>> '{entity,id}' = new.meeting_id::text
     and exists (select 1 from mos.meetings m where m.id = new.meeting_id and m.is_private)
     and not exists (
       select 1 from shared.person_access_roles r
        where r.person_id = new.person_id and r.org_id = new.org_id
          and r.access_role = 'admin' and r.revoked_at is null);
  return null;
end;
$$;
comment on function mos._purge_removed_attendee_notices() is
  'AFTER trigger: when an attendee of a Private Meeting is removed, deletes their mention notices about it unless they still read it as an admin.';

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
         or exists (
           select 1 from mos.meeting_attendees a
            where a.meeting_id = t.meeting_id
              and a.person_id = p_person_id and a.removed_at is null)
       )
  )
$$;
comment on function mos.can_person_read_task(uuid, uuid, boolean) is
  'The Private Task read rule for a given person: same org AND (not private OR admin OR creator OR PIC OR Supervisor OR on the who-can-see list OR a live attendee of the Meeting it was created in). Internal: callers use mos.can_read_task.';

create or replace function mos.can_change_task_privacy(p_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select mos.can_edit_task(p_task_id)
     and (
       not exists (
         select 1 from mos.tasks t
          where t.id = p_task_id and t.meeting_id is not null and t.is_private)
       or exists (
         select 1 from mos.tasks t
           join mos.meeting_attendees a on a.meeting_id = t.meeting_id
          where t.id = p_task_id and a.person_id = shared.current_person_id() and a.removed_at is null)
     )
$$;
comment on function mos.can_change_task_privacy(uuid) is
  'Gate for toggling Private and editing the who-can-see list: the editors of the Task (mos.can_edit_task); for a private Task created in a Meeting, only that Meeting''s attendees.';

create or replace function mos._fan_out_meeting_mentions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me         uuid := shared.current_person_id();
  v_recipients uuid[];
  v_person     uuid;
  v_old        jsonb;
begin
  if new.minutes is null or shared.current_org_id() is null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    v_old := old.minutes;
    if new.minutes is not distinct from v_old then
      return new;
    end if;
  end if;

  select array_agg(distinct r.pid) into v_recipients
  from mos._meeting_mentions(new.minutes) nm
  cross join lateral (
    select nm.target_id as pid where nm.kind = 'person'
    union
    select tm.person_id from shared.team_memberships tm
      join shared.teams tt on tt.id = tm.team_id and tt.org_id = new.org_id and tt.archived_at is null
     where nm.kind = 'team' and tm.team_id = nm.target_id and tm.org_id = new.org_id
       and tm.effective_from <= current_date and (tm.effective_to is null or tm.effective_to >= current_date)
  ) r
  join shared.people pp on pp.id = r.pid and pp.org_id = new.org_id and pp.archived_at is null
  where not exists (
      select 1 from mos._meeting_mentions(v_old) om
       where om.kind = nm.kind and om.target_id = nm.target_id)
    and r.pid is distinct from v_me
    and (not new.is_private or exists (
      select 1 from mos.meeting_attendees a
       where a.meeting_id = new.id and a.person_id = r.pid and a.removed_at is null));

  foreach v_person in array coalesce(v_recipients[1:50], '{}'::uuid[]) loop
    perform mos.create_notification(v_person, 'info', 'You were mentioned in meeting minutes', left(new.title, 200),
      jsonb_build_object('source', 'meeting_mention',
        'entity', jsonb_build_object('type', 'meeting', 'id', new.id, 'route', '/work/meetings?record=' || new.id)));
  end loop;
  return new;
end;
$$;
comment on function mos._fan_out_meeting_mentions() is
  'Observer on mos.meetings.minutes: one Inbox notice per newly mentioned person or Team member, never the author, only attendees for a Private Meeting, at most 50. SECURITY DEFINER to read Team memberships and deliver through mos.create_notification.';

drop trigger tasks_private_meeting_flag on mos.tasks;
drop function mos._set_task_private_meeting_flag();
drop trigger record_history_tasks on mos.tasks;
create trigger record_history_tasks
  after insert or update or delete on mos.tasks
  for each row execute function shared._record_history_write('-last_activity_at', '-body');
alter table mos.tasks drop column created_in_private_meeting;
commit;
