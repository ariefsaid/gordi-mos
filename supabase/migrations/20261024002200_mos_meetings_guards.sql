-- Meetings (#1840), part 3: the one guard per table.
--
--   mos._guard_meetings          same-org Team / link / previous; immutable org, creator, series chain;
--                                derives series_id + sequence_number from previous_meeting_id on insert.
--   mos._guard_meeting_attendees only removed_at moves after insert; added_by is the caller.
--
-- DOWN:
--   drop trigger meeting_attendees_guard on mos.meeting_attendees;
--   drop trigger meetings_guard on mos.meetings;
--   drop function mos._guard_meeting_attendees();
--   drop function mos._guard_meetings();

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
  end if;
  return new;
end;
$$;
comment on function mos._guard_meetings() is
  'The ONE guard on mos.meetings (#1840): same-org Team and link, immutable org/creator/series chain, series fields derived on insert from previous_meeting_id.';
create trigger meetings_guard
  before insert or update on mos.meetings
  for each row execute function mos._guard_meetings();

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
  if tg_op = 'INSERT' and current_user = 'authenticated'
     and new.added_by is distinct from shared.current_person_id() then
    raise exception 'added_by must be the caller on a direct insert' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_meeting_attendees() is
  'The ONE guard on mos.meeting_attendees (#1840): after insert only removed_at moves; same-org is the composite FK.';
create trigger meeting_attendees_guard
  before insert or update on mos.meeting_attendees
  for each row execute function mos._guard_meeting_attendees();
