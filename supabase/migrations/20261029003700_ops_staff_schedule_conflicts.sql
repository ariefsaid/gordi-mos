-- Check actual effective standing occurrences at schedule and membership boundaries.
create or replace function ops._attendance_standing_conflicts(
  p_org uuid, p_team uuid, p_person uuid, p_since date, p_until date default null, p_rule uuid default null
) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    with boundaries as (
      select p_since as day
      union select m.effective_from from shared.team_memberships m where m.org_id=p_org and m.person_id=p_person
      union select m.effective_to+1 from shared.team_memberships m where m.org_id=p_org and m.person_id=p_person and m.effective_to is not null
      union select r.effective_from from ops.staff_standing_hours r
        join shared.team_memberships m on m.org_id=r.org_id and m.team_id=r.team_id and m.person_id=p_person
        where r.org_id=p_org and (r.person_id is null or r.person_id=p_person)
      union select r.effective_to+1 from ops.staff_standing_hours r
        join shared.team_memberships m on m.org_id=r.org_id and m.team_id=r.team_id and m.person_id=p_person
        where r.org_id=p_org and (r.person_id is null or r.person_id=p_person) and r.effective_to is not null
      union select s.local_date from ops.staff_shifts s where s.org_id=p_org and s.person_id=p_person and s.removed_at is null
    ), candidates as (
      select distinct b.day+n as local_date from boundaries b cross join generate_series(-1,7) n
      where isfinite(b.day) and b.day+n>=p_since and (p_until is null or b.day+n<=p_until)
    ), actual as (
      select c.local_date,o.start_at,o.end_at from candidates c
      cross join lateral ops._attendance_standing_occurrence(p_org,p_team,p_person,c.local_date) o
      left join lateral (select r.id from ops.staff_standing_hours r where r.org_id=p_org and r.team_id=p_team and r.person_id is null
        and r.effective_from<=c.local_date and (r.effective_to is null or r.effective_to>=c.local_date)
        order by r.effective_from desc limit 1) def on true
      left join lateral (select r.id from ops.staff_standing_hours r where r.org_id=p_org and r.team_id=p_team and r.person_id=p_person
        and r.effective_from<=c.local_date and (r.effective_to is null or r.effective_to>=c.local_date)
        order by r.effective_from desc limit 1) ex on true
      where (p_rule is null or coalesce(ex.id,def.id)=p_rule)
        and exists(select 1 from shared.people p where p.org_id=p_org and p.id=p_person and p.archived_at is null)
    )
    select 1 from actual a where exists (
      select 1 from ops.staff_shifts s where s.org_id=p_org and s.person_id=p_person and s.removed_at is null
        and s.start_at<a.end_at and s.end_at>a.start_at
    ) or exists (
      select 1 from shared.team_memberships m cross join generate_series(-1,1) n
      cross join lateral ops._attendance_standing_occurrence(p_org,m.team_id,p_person,a.local_date+n) o
      where m.org_id=p_org and m.person_id=p_person and m.team_id<>p_team
        and o.start_at<a.end_at and o.end_at>a.start_at
    )
  )
$$;
revoke execute on function ops._attendance_standing_conflicts(uuid,uuid,uuid,date,date,uuid) from public, anon, authenticated;

-- Membership writes acquire the same Team locks before the existing Person locks.
create or replace function ops._attendance_lock_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare team_keys text[]; person_keys text[]; k text;
begin
  team_keys := array[new.org_id::text || ':team:' || new.team_id::text];
  person_keys := array[new.org_id::text || ':' || new.person_id::text];
  if tg_op='UPDATE' then
    team_keys := team_keys || (old.org_id::text || ':team:' || old.team_id::text);
    person_keys := person_keys || (old.org_id::text || ':' || old.person_id::text);
  end if;
  for k in select distinct v from unnest(team_keys) v order by v loop
    perform pg_advisory_xact_lock(hashtextextended(k,0));
  end loop;
  for k in select distinct v from unnest(person_keys) v order by v loop
    perform pg_advisory_xact_lock(hashtextextended(k,0));
  end loop;
  return new;
end;
$$;
revoke execute on function ops._attendance_lock_membership() from public, anon, authenticated;

create or replace function ops._attendance_validate_membership()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op='UPDATE' and new.org_id=old.org_id and new.team_id=old.team_id and new.person_id=old.person_id
    and new.effective_from>=old.effective_from
    and (old.effective_to is null or (new.effective_to is not null and new.effective_to<=old.effective_to)) then
    return new;
  end if;
  if new.effective_to is not null and new.effective_to<new.effective_from then return new; end if;
  if ops._attendance_standing_conflicts(new.org_id,new.team_id,new.person_id,new.effective_from,new.effective_to) then
    raise exception 'STAFF_STANDING_CONFLICT' using errcode='23P01';
  end if;
  return new;
end;
$$;
revoke execute on function ops._attendance_validate_membership() from public, anon, authenticated;

create trigger zz_staff_membership_schedule_lock before insert or update on shared.team_memberships
for each row execute function ops._attendance_lock_membership();
create trigger staff_membership_schedule_validate after insert or update on shared.team_memberships
for each row execute function ops._attendance_validate_membership();

-- Enforce date-specific membership and cross-Team schedule conflicts.
create or replace function ops.copy_staff_roster(p_team_id uuid, p_week_start date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_source ops.staff_rosters; v_target ops.staff_rosters; v_source_shift ops.staff_shifts; v_count integer := 0; v_start timestamptz; v_end timestamptz;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if not (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_ROSTER_FORBIDDEN' using errcode = '42501'; end if;
  if p_week_start is null or p_week_start <> ops._attendance_week_start(p_week_start) then raise exception 'STAFF_WEEK_INVALID' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':team:' || p_team_id::text,0));
  select * into v_source from ops.staff_rosters where org_id=v_org and team_id=p_team_id and week_start=p_week_start-7 and status='published';
  if not found then raise exception 'STAFF_COPY_SOURCE_UNAVAILABLE' using errcode = 'P0002'; end if;
  if exists(select 1 from ops.staff_rosters where org_id=v_org and team_id=p_team_id and week_start=p_week_start) then raise exception 'STAFF_COPY_TARGET_EXISTS' using errcode = '23505'; end if;
  if exists(select 1 from ops.staff_standing_hours r where r.org_id=v_org and r.team_id=p_team_id and r.person_id is null and r.active
    and r.effective_from <= p_week_start and (r.effective_to is null or r.effective_to >= p_week_start)) then raise exception 'STAFF_TEAM_STANDING_HOURS' using errcode = '23514'; end if;
  insert into ops.staff_rosters(org_id,team_id,site_id,week_start,created_by) values(v_org,p_team_id,v_source.site_id,p_week_start,v_actor) returning * into v_target;
  for v_source_shift in select * from ops.staff_shifts where org_id=v_org and roster_id=v_source.id and removed_at is null order by local_date,person_id loop
    perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || v_source_shift.person_id::text,0));
    if not exists(select 1 from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
      where m.org_id=v_org and m.team_id=p_team_id and m.person_id=v_source_shift.person_id and p.archived_at is null
        and m.effective_from <= v_source_shift.local_date+7 and (m.effective_to is null or m.effective_to >= v_source_shift.local_date+7)) then continue; end if;
    v_start := v_source_shift.start_at + interval '7 days'; v_end := v_source_shift.end_at + interval '7 days';
    if ops._attendance_shift_overlaps(v_source_shift.person_id,v_source_shift.local_date+7,v_start,v_end,null) then raise exception 'STAFF_SHIFT_OVERLAP' using errcode = '23P01'; end if;
    insert into ops.staff_shifts(org_id,roster_id,team_id,site_id,person_id,template_id,local_date,template_name,start_at,end_at,created_by)
    values(v_org,v_target.id,p_team_id,v_target.site_id,v_source_shift.person_id,v_source_shift.template_id,v_source_shift.local_date+7,v_source_shift.template_name,v_start,v_end,v_actor);
    v_count := v_count+1;
  end loop;
  if v_count=0 then raise exception 'STAFF_COPY_SOURCE_UNAVAILABLE' using errcode = 'P0002'; end if;
  return v_count;
end;
$$;
revoke execute on function ops.copy_staff_roster(uuid,date) from public, anon;
grant execute on function ops.copy_staff_roster(uuid,date) to authenticated;

create or replace function ops.save_standing_hours(
  p_team_id uuid, p_person_id uuid, p_working_days smallint[], p_start_time time, p_end_time time, p_active boolean
) returns date
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_effective date; v_prior ops.staff_standing_hours; v_id uuid; v_person uuid; v_until date;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if not (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_STANDING_FORBIDDEN' using errcode = '42501'; end if;
  if (p_active is null and p_person_id is null) or (p_active is true and (p_working_days is null or cardinality(p_working_days)=0 or p_start_time is null or p_end_time is null or p_start_time=p_end_time
      or cardinality(p_working_days)>7 or not (p_working_days <@ array[0,1,2,3,4,5,6]::smallint[]))) then raise exception 'STAFF_STANDING_INVALID' using errcode = '22023'; end if;
  if not exists(select 1 from shared.teams where org_id=v_org and id=p_team_id and archived_at is null and site_id is not null) then raise exception 'STAFF_TEAM_SITE_REQUIRED' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':team:' || p_team_id::text,0));
  if p_person_id is not null and p_active is true and not exists(select 1 from ops.staff_standing_hours r where r.org_id=v_org and r.team_id=p_team_id and r.person_id is null
    and r.active and r.effective_from<=ops._attendance_week_start((ops._attendance_now() at time zone 'Asia/Jakarta')::date)+7
    and (r.effective_to is null or r.effective_to>=ops._attendance_week_start((ops._attendance_now() at time zone 'Asia/Jakarta')::date)+7)) then
    raise exception 'STAFF_STANDING_DEFAULT_REQUIRED' using errcode = '23514';
  end if;
  if p_person_id is not null and not exists(select 1 from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
    where m.org_id=v_org and m.team_id=p_team_id and m.person_id=p_person_id and p.archived_at is null
      and m.effective_from<=((ops._attendance_now() at time zone 'Asia/Jakarta')::date + 7 - extract(isodow from (ops._attendance_now() at time zone 'Asia/Jakarta')::date)::integer + 1)
      and (m.effective_to is null or m.effective_to>=((ops._attendance_now() at time zone 'Asia/Jakarta')::date + 7 - extract(isodow from (ops._attendance_now() at time zone 'Asia/Jakarta')::date)::integer + 1))) then
    raise exception 'STAFF_STANDING_PERSON_NOT_MEMBER' using errcode = '42501';
  end if;
  v_effective := ops._attendance_week_start((ops._attendance_now() at time zone 'Asia/Jakarta')::date) + 7;
  if p_person_id is null then
    for v_person in select m.person_id from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
      where m.org_id=v_org and m.team_id=p_team_id and p.archived_at is null and (m.effective_to is null or m.effective_to>=v_effective) order by m.person_id loop
      perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || v_person::text,0));
    end loop;
  else
    perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || p_person_id::text,0));
  end if;
  select * into v_prior from ops.staff_standing_hours where org_id=v_org and team_id=p_team_id and person_id is not distinct from p_person_id
    and effective_from<=v_effective and (effective_to is null or effective_to>=v_effective) order by effective_from desc limit 1 for update;
  if p_active is null then
    if v_prior.id is not null and v_prior.effective_from=v_effective then
      delete from ops.staff_standing_hours where id=v_prior.id;
    elsif v_prior.id is not null then
      update ops.staff_standing_hours set effective_to=v_effective-1 where id=v_prior.id;
    end if;
    select min(r.effective_from)-1 into v_until from ops.staff_standing_hours r
      where r.org_id=v_org and r.team_id=p_team_id and r.person_id=p_person_id and r.effective_from>v_effective;
  elsif v_prior.id is not null and v_prior.effective_from=v_effective then
    update ops.staff_standing_hours set working_days=case when p_active then p_working_days else '{}'::smallint[] end,
      start_time=case when p_active then p_start_time else null end,end_time=case when p_active then p_end_time else null end,
      active=p_active,changed_by=v_actor where id=v_prior.id returning id into v_id;
  else
    update ops.staff_standing_hours set effective_to=v_effective-1 where org_id=v_org and team_id=p_team_id
      and person_id is not distinct from p_person_id and effective_to is null and effective_from<v_effective;
    insert into ops.staff_standing_hours(org_id,team_id,person_id,effective_from,working_days,start_time,end_time,active,changed_by)
    values(v_org,p_team_id,p_person_id,v_effective,case when p_active then p_working_days else '{}'::smallint[] end,
      case when p_active then p_start_time else null end,case when p_active then p_end_time else null end,p_active,v_actor) returning id into v_id;
  end if;
  for v_person in select distinct m.person_id from shared.team_memberships m
    join shared.people p on p.org_id=m.org_id and p.id=m.person_id and p.archived_at is null
    where m.org_id=v_org and m.team_id=p_team_id and (p_person_id is null or m.person_id=p_person_id)
      and (m.effective_to is null or m.effective_to>=v_effective) order by m.person_id loop
    if ops._attendance_standing_conflicts(v_org,p_team_id,v_person,v_effective,v_until,v_id) then
      raise exception 'STAFF_STANDING_CONFLICT' using errcode='23P01';
    end if;
  end loop;
  return v_effective;
end;
$$;
revoke execute on function ops.save_standing_hours(uuid,uuid,smallint[],time,time,boolean) from public, anon;
grant execute on function ops.save_standing_hours(uuid,uuid,smallint[],time,time,boolean) to authenticated;
