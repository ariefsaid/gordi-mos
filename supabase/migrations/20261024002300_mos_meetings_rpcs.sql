-- Meetings (#1840), part 4: the write and read actions the app calls.
--
--   mos.create_meeting(title, owning_team_id, starts_at, is_private, work_line_id, objective_id, attendee_ids)
--       SECURITY DEFINER: the creator of a Private Meeting is not yet an attendee, so the attendee
--       policies would refuse the first insert. Checks the caller is an org member, then writes the
--       Meeting plus its attendees (creator always included). Returns the new id.
--   mos.start_next_meeting(meeting_id)
--       SECURITY DEFINER for the same reason. Needs edit rights on the previous Meeting. Copies title,
--       live attendees, owning Team, Private setting and link; starts_at stays NULL. One next per Meeting.
--   mos.create_meeting_task(meeting_id, title, pic_id, due_date, team_id, supervisor_id)
--       SECURITY INVOKER: the ordinary Task INSERT policy and mos._guard_tasks (who may be PIC) decide.
--       Defaults as Task creation does today: PIC = caller; Team = the PIC's primary Team, else the
--       Meeting's owning Team; Supervisor = the PIC's one direct manager, else the PIC themself when the
--       PIC is the caller ("None, just me"), else an error. Writes the `created` event.
--   mos.meeting_still_open(meeting_id) / mos.meeting_tasks(meeting_id)
--       SECURITY INVOKER readers: the previous Meeting's Tasks not Done / this Meeting's Tasks.
--       Task read rules (RLS) decide which rows the caller sees.
--
-- DOWN: supabase/rollbacks/20261024002300_mos_meetings_rpcs.sql

create or replace function mos.create_meeting(
  p_title          text,
  p_owning_team_id uuid,
  p_starts_at      timestamptz default null,
  p_is_private     boolean default false,
  p_work_line_id   uuid default null,
  p_objective_id   uuid default null,
  p_attendee_ids   uuid[] default '{}'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := shared.current_person_id();
  v_org uuid := shared.current_org_id();
  v_id  uuid;
begin
  if v_me is null or v_org is null or not shared.is_org_member() then
    raise exception 'create_meeting requires an organisation member' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_attendee_ids, '{}')) pid
    where not exists (select 1 from shared.people p where p.id = pid and p.org_id = v_org and p.archived_at is null)
  ) then
    raise exception 'every attendee must be an active person in your organisation' using errcode = '42501';
  end if;

  if not mos.can_pick_meeting_team(p_owning_team_id) then
    raise exception 'owning_team_id must be a team you belong to' using errcode = '42501';
  end if;

  insert into mos.meetings (org_id, title, starts_at, owning_team_id, work_line_id, objective_id, is_private, created_by)
  values (v_org, p_title, p_starts_at, p_owning_team_id, p_work_line_id, p_objective_id, coalesce(p_is_private, false), v_me)
  returning id into v_id;

  insert into mos.meeting_attendees (meeting_id, person_id, org_id, added_by)
  select v_id, a.pid, v_org, v_me
    from (select v_me as pid union select unnest(coalesce(p_attendee_ids, '{}'))) a;
  return v_id;
end;
$$;
comment on function mos.create_meeting(text, uuid, timestamptz, boolean, uuid, uuid, uuid[]) is
  'Creates a Meeting and its attendees (the creator is always one). SECURITY DEFINER because a Private Meeting''s creator is not yet an attendee; checks org membership and same-org attendees itself.';

create or replace function mos.start_next_meeting(p_meeting_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me   uuid := shared.current_person_id();
  v_prev mos.meetings;
  v_next uuid;
  v_id   uuid;
begin
  if v_me is null or not mos.can_edit_meeting(p_meeting_id) then
    raise exception 'you cannot start the next meeting of this record' using errcode = '42501';
  end if;
  select * into v_prev from mos.meetings where id = p_meeting_id;
  select n.id into v_next from mos.meetings n where n.previous_meeting_id = p_meeting_id;
  if v_next is not null then
    -- A next meeting the caller cannot read gets the same answer as no right to start one.
    if not mos.can_read_meeting(v_next) then
      raise exception 'you cannot start the next meeting of this record' using errcode = '42501';
    end if;
    raise exception 'this meeting already has a next meeting' using errcode = '23505';
  end if;

  insert into mos.meetings (org_id, title, starts_at, owning_team_id, work_line_id, objective_id,
                            is_private, previous_meeting_id, created_by)
  values (v_prev.org_id, v_prev.title, null, v_prev.owning_team_id, v_prev.work_line_id, v_prev.objective_id,
          v_prev.is_private, v_prev.id, v_me)
  returning id into v_id;

  insert into mos.meeting_attendees (meeting_id, person_id, org_id, added_by)
  select v_id, a.person_id, v_prev.org_id, v_me
    from mos.meeting_attendees a
    join shared.people p on p.id = a.person_id and p.archived_at is null
   where a.meeting_id = v_prev.id and a.removed_at is null;
  return v_id;
end;
$$;
comment on function mos.start_next_meeting(uuid) is
  'Start next meeting: copies title, live attendees, owning Team, Private setting and link from the previous Meeting; the date stays unset. SECURITY DEFINER; needs edit rights on the previous Meeting; at most one next per Meeting.';

create or replace function mos.create_meeting_task(
  p_meeting_id    uuid,
  p_title         text,
  p_pic_id        uuid default null,
  p_due_date      date default null,
  p_team_id       uuid default null,
  p_supervisor_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_me   uuid := shared.current_person_id();
  v_m    mos.meetings;
  v_pic  uuid;
  v_team uuid;
  v_bu   uuid;
  v_sup  uuid := p_supervisor_id;
  v_id   uuid;
begin
  select * into v_m from mos.meetings where id = p_meeting_id;
  if v_m.id is null or not mos.can_edit_meeting(p_meeting_id) then
    raise exception 'you cannot add tasks to this meeting' using errcode = '42501';
  end if;
  v_pic := coalesce(p_pic_id, v_me);

  v_team := coalesce(
    p_team_id,
    (select tm.team_id from shared.team_memberships tm
      where tm.person_id = v_pic and tm.is_primary
        and tm.effective_from <= current_date and (tm.effective_to is null or tm.effective_to >= current_date)
      limit 1),
    v_m.owning_team_id);
  select t.business_unit_id into v_bu from shared.teams t where t.id = v_team and t.org_id = v_m.org_id;
  if v_bu is null then
    raise exception 'team_id must belong to your organisation' using errcode = '42501';
  end if;

  if v_sup is null then
    select min(holder.person_id::text)::uuid into v_sup
      from (
        select distinct pr2.person_id
          from shared.person_roles pr
          join shared.roles r on r.id = pr.role_id and r.business_unit_id = v_bu
          join shared.person_roles pr2 on pr2.role_id = r.reports_to_role_id
          join shared.people p on p.id = pr2.person_id and p.archived_at is null
         where pr.person_id = v_pic and pr2.person_id <> v_pic
      ) holder
    having count(*) = 1;
    if v_sup is null and v_pic = v_me then
      v_sup := v_me;
    end if;
  end if;
  if v_sup is null then
    raise exception 'no single manager found for this PIC; choose a Supervisor' using errcode = '23502';
  end if;

  -- No RETURNING: the SELECT policy's stable can_read_task() cannot see the row its own statement
  -- inserts, so the id is generated here instead.
  v_id := gen_random_uuid();
  insert into mos.tasks (id, title, business_unit_id, team_id, responsible_person_id, accountable_person_id,
                         created_by, due_date, meeting_id)
  values (v_id, p_title, v_bu, v_team, v_pic, v_sup, v_me, p_due_date, p_meeting_id);

  insert into mos.task_events (task_id, actor_person_id, event_type) values (v_id, v_me, 'created');
  return v_id;
end;
$$;
comment on function mos.create_meeting_task(uuid, text, uuid, date, uuid, uuid) is
  'Creates a real Task inside a Meeting (title, PIC, due). Defaults as Task creation does: PIC = caller, Team = PIC primary Team else the Meeting''s Team, Supervisor = the PIC''s one direct manager else the PIC when it is the caller. SECURITY INVOKER: Task RLS and mos._guard_tasks decide. A Private Meeting makes the Task private (mos._guard_task_meeting).';

create or replace function mos.meeting_still_open(p_meeting_id uuid)
returns table (id uuid, title text, responsible_person_id uuid, accountable_person_id uuid,
               due_date date, status text, meeting_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.title, t.responsible_person_id, t.accountable_person_id, t.due_date, t.status, t.meeting_id
    from mos.meetings m
    join mos.tasks t on t.meeting_id = m.previous_meeting_id
   where m.id = p_meeting_id
     and t.status <> 'Done' and t.archived_at is null
   order by t.due_date nulls last, t.created_at
$$;
comment on function mos.meeting_still_open(uuid) is
  'Still open from last time: the previous Meeting''s Tasks not Done and not archived, as far as the caller can read them (Task and Meeting RLS apply).';

create or replace function mos.meeting_tasks(p_meeting_id uuid)
returns table (id uuid, title text, responsible_person_id uuid, accountable_person_id uuid,
               due_date date, status text, meeting_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.title, t.responsible_person_id, t.accountable_person_id, t.due_date, t.status, t.meeting_id
    from mos.tasks t
   where t.meeting_id = p_meeting_id and t.archived_at is null
   order by t.created_at
$$;
comment on function mos.meeting_tasks(uuid) is
  'Tasks created in this Meeting that the caller can read (Task RLS applies), oldest first.';

revoke execute on function mos.create_meeting(text, uuid, timestamptz, boolean, uuid, uuid, uuid[]) from public, anon;
revoke execute on function mos.start_next_meeting(uuid) from public, anon;
revoke execute on function mos.create_meeting_task(uuid, text, uuid, date, uuid, uuid) from public, anon;
revoke execute on function mos.meeting_still_open(uuid) from public, anon;
revoke execute on function mos.meeting_tasks(uuid) from public, anon;
grant execute on function mos.create_meeting(text, uuid, timestamptz, boolean, uuid, uuid, uuid[]) to authenticated;
grant execute on function mos.start_next_meeting(uuid) to authenticated;
grant execute on function mos.create_meeting_task(uuid, text, uuid, date, uuid, uuid) to authenticated;
grant execute on function mos.meeting_still_open(uuid) to authenticated;
grant execute on function mos.meeting_tasks(uuid) to authenticated;
