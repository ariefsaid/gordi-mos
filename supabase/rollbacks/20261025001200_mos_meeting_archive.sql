-- DOWN for 20261025001200. Restores the Meeting guards and Start next meeting without the archived rules.
begin;
create or replace function mos._guard_meetings()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prev mos.meetings;
begin
  if not exists (select 1 from shared.teams t where t.id = new.owning_team_id and t.org_id = new.org_id) then
    raise exception 'owning_team_id must belong to the same org as the meeting' using errcode = '42501';
  end if;
  if new.work_line_id is not null and not exists (
       select 1 from mos.work_lines w where w.id = new.work_line_id and w.org_id = new.org_id) then
    raise exception 'work_line_id belongs to a different org' using errcode = '42501';
  end if;
  if new.objective_id is not null and not exists (
       select 1 from mos.objectives o where o.id = new.objective_id and o.org_id = new.org_id) then
    raise exception 'objective_id belongs to a different org' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.previous_meeting_id is null then
      new.series_id := coalesce(new.series_id, new.id);
      new.sequence_number := 1;
    else
      select * into v_prev from mos.meetings p where p.id = new.previous_meeting_id and p.org_id = new.org_id;
      if v_prev.id is null then
        raise exception 'previous_meeting_id belongs to a different org' using errcode = '42501';
      end if;
      new.series_id := v_prev.series_id;
      new.sequence_number := v_prev.sequence_number + 1;
    end if;
  else
    if new.org_id is distinct from old.org_id then
      raise exception 'org_id is immutable on a meeting' using errcode = '42501';
    end if;
    if new.created_by is distinct from old.created_by then
      raise exception 'created_by is immutable on a meeting' using errcode = '42501';
    end if;
    if new.previous_meeting_id is distinct from old.previous_meeting_id
       or new.series_id is distinct from old.series_id
       or new.sequence_number is distinct from old.sequence_number then
      raise exception 'the series chain is set only by Start next meeting' using errcode = '42501';
    end if;
    if current_user = 'authenticated' then
      if new.is_private is distinct from old.is_private
         and not (shared.has_access_role('admin') or exists (
           select 1 from mos.meeting_attendees a
            where a.meeting_id = old.id and a.person_id = shared.current_person_id() and a.removed_at is null)) then
        raise exception 'only an attendee or an admin changes whether a meeting is private' using errcode = '42501';
      end if;
      if new.owning_team_id is distinct from old.owning_team_id and not mos.can_pick_meeting_team(new.owning_team_id) then
        raise exception 'owning_team_id must be a team you belong to' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function mos._guard_meeting_attendees()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.meeting_id is distinct from old.meeting_id
     or new.person_id is distinct from old.person_id
     or new.org_id is distinct from old.org_id
     or new.added_by is distinct from old.added_by) then
    raise exception 'only removed_at may change on a meeting attendee' using errcode = '42501';
  end if;
  if new.removed_at is null and (tg_op = 'INSERT' or old.removed_at is not null)
     and exists (select 1 from shared.people p where p.id = new.person_id and p.archived_at is not null) then
    raise exception 'an archived person cannot be an attendee' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and current_user = 'authenticated'
     and new.added_by is distinct from shared.current_person_id() then
    raise exception 'added_by must be the caller on a direct insert' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function mos._guard_task_meeting()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.meeting_id is not null then
      if current_user = 'authenticated' and not mos.can_edit_meeting(new.meeting_id) then
        raise exception 'meeting_id is not a meeting you can edit' using errcode = '42501';
      end if;
      -- Under RLS the caller sees the Meeting here, so a Private one forces the Task Private.
      if exists (select 1 from mos.meetings m where m.id = new.meeting_id and m.is_private) then
        new.is_private := true;
      end if;
    end if;
    return new;
  end if;

  if new.meeting_id is distinct from old.meeting_id then
    raise exception 'meeting_id is immutable on a task' using errcode = '42501';
  end if;
  return new;
end;
$$;

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

revoke execute on function mos.start_next_meeting(uuid) from public, anon;
grant execute on function mos.start_next_meeting(uuid) to authenticated;
commit;
