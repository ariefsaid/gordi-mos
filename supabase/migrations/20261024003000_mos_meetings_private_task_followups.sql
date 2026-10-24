-- DOWN: supabase/rollbacks/20261024003000_mos_meetings_private_task_followups.sql
-- Meetings (#1840) and Private Tasks (#1839): follow-up rules.
--
-- 1. The attendee arm of the Private Task read rule applies only to Tasks created while their Meeting
--    was private. mos.tasks.created_in_private_meeting is set by a trigger, never by the client: on
--    insert it is "meeting_id is set and that Meeting is private now"; on update it keeps its value
--    unless meeting_id changes, then it is recomputed. It is not recorded in the change history.
--    mos.can_person_read_task (read arm) and mos.can_change_task_privacy (attendee rule) both use it.
-- 2. Removing an attendee deletes that person's Task notices for Tasks of the Meeting they can no
--    longer read.
-- 3. Revoking admin deletes the person's notices for private Tasks they can no longer read, judged by
--    the one read rule (mos.person_can_read_task), so the Meetings arm is honoured.
-- 4. A minutes save that would notify more than 50 people is refused (22023), as on Tasks; the notice
--    also carries the author (actor) so the Inbox reads "<name> mentioned you".

-- ── 1. Column, trigger, backfill ─────────────────────────────────────────────────────────────
-- History first, so the backfill below records nothing.
drop trigger record_history_tasks on mos.tasks;
create trigger record_history_tasks
  after insert or update or delete on mos.tasks
  for each row execute function shared._record_history_write('-last_activity_at', '-body', '-created_in_private_meeting');

alter table mos.tasks add column created_in_private_meeting boolean not null default false;
comment on column mos.tasks.created_in_private_meeting is
  'True when the Task was created in a Meeting that was private at that moment. Server-derived (mos._set_task_private_meeting_flag); its attendees read the Task while it is private.';

update mos.tasks t set created_in_private_meeting = true
 where t.meeting_id is not null and t.is_private
   and exists (select 1 from mos.meetings m where m.id = t.meeting_id and m.is_private);

create or replace function mos._set_task_private_meeting_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.meeting_id is distinct from old.meeting_id then
    new.created_in_private_meeting := new.meeting_id is not null
      and exists (select 1 from mos.meetings m where m.id = new.meeting_id and m.is_private);
  else
    new.created_in_private_meeting := old.created_in_private_meeting;
  end if;
  return new;
end;
$$;
comment on function mos._set_task_private_meeting_flag() is
  'BEFORE trigger on mos.tasks: derives created_in_private_meeting from the Meeting at creation; a client value is overwritten. SECURITY DEFINER to read the Meeting under any caller.';
revoke execute on function mos._set_task_private_meeting_flag() from public, anon, authenticated;
create trigger tasks_private_meeting_flag
  before insert or update on mos.tasks
  for each row execute function mos._set_task_private_meeting_flag();

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

create or replace function mos.can_change_task_privacy(p_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select mos.can_edit_task(p_task_id)
     -- Meetings rule (#1840): a private Task created in a private Meeting is changed only by an attendee of it.
     and (
       not exists (
         select 1 from mos.tasks t
          where t.id = p_task_id and t.created_in_private_meeting and t.is_private)
       or exists (
         select 1 from mos.tasks t
           join mos.meeting_attendees a on a.meeting_id = t.meeting_id
          where t.id = p_task_id and a.person_id = shared.current_person_id() and a.removed_at is null)
     )
$$;
comment on function mos.can_change_task_privacy(uuid) is
  'Gate for toggling Private and editing the who-can-see list: the editors of the Task (mos.can_edit_task); for a private Task created in a private Meeting, only that Meeting''s attendees.';
revoke execute on function mos.can_change_task_privacy(uuid) from public, anon;
grant  execute on function mos.can_change_task_privacy(uuid) to authenticated;

-- ── 2. Removed attendee: Task notices go with the access ─────────────────────────────────────
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

  delete from mos.notifications n
   where n.owner_id = new.person_id
     and n.org_id = new.org_id
     and n.metadata #>> '{entity,type}' = 'task'
     and exists (
       select 1 from mos.tasks t
        where t.id::text = n.metadata #>> '{entity,id}'
          and t.org_id = new.org_id
          and t.meeting_id = new.meeting_id
          and not mos.person_can_read_task(new.person_id, t.id));
  return null;
end;
$$;
comment on function mos._purge_removed_attendee_notices() is
  'AFTER trigger: when an attendee is removed, deletes their mention notices about a Private Meeting (unless they still read it as an admin) and their notices about Tasks of the Meeting they can no longer read.';
revoke execute on function mos._purge_removed_attendee_notices() from public, anon, authenticated;

-- ── 3. Ex-admin Task notices follow the one read rule ────────────────────────────────────────
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

-- ── 4. Meeting mention fan-out: more than 50 recipients in one save is refused ────────────────
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
  v_actor_name text;
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

  select p.full_name into v_actor_name from shared.people p where p.id = v_me and p.org_id = new.org_id;

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

  -- Same cap as the Task path: one save may notify at most 50 people; more is refused, not truncated.
  if cardinality(v_recipients) > 50 then
    raise exception 'mention fan-out exceeds cap of 50 recipients (%)', cardinality(v_recipients)
      using errcode = '22023';
  end if;

  foreach v_person in array coalesce(v_recipients, '{}'::uuid[]) loop
    perform mos.create_notification(v_person, 'info', 'You were mentioned in meeting minutes', left(new.title, 200),
      jsonb_build_object('source', 'meeting_mention',
        'actor', jsonb_build_object('id', v_me, 'name', v_actor_name),
        'entity', jsonb_build_object('type', 'meeting', 'id', new.id, 'route', '/work/meetings?record=' || new.id)));
  end loop;
  return new;
end;
$$;
comment on function mos._fan_out_meeting_mentions() is
  'Observer on mos.meetings.minutes: one Inbox notice per newly mentioned person or Team member, never the author, only attendees for a Private Meeting. A save that would notify more than 50 people is refused (22023). SECURITY DEFINER to read Team memberships and deliver through mos.create_notification.';
revoke execute on function mos._fan_out_meeting_mentions() from public, anon, authenticated;
