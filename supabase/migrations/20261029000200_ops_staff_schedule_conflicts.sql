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
  select * into v_source from ops.staff_rosters where org_id=v_org and team_id=p_team_id and week_start=p_week_start-7 and status='published';
  if not found then raise exception 'STAFF_COPY_SOURCE_UNAVAILABLE' using errcode = 'P0002'; end if;
  if exists(select 1 from ops.staff_rosters where org_id=v_org and team_id=p_team_id and week_start=p_week_start) then raise exception 'STAFF_COPY_TARGET_EXISTS' using errcode = '23505'; end if;
  if exists(select 1 from ops.staff_standing_hours r where r.org_id=v_org and r.team_id=p_team_id and r.person_id is null and r.active
    and r.effective_from <= p_week_start and (r.effective_to is null or r.effective_to >= p_week_start)) then raise exception 'STAFF_TEAM_STANDING_HOURS' using errcode = '23514'; end if;
  insert into ops.staff_rosters(org_id,team_id,site_id,week_start,created_by) values(v_org,p_team_id,v_source.site_id,p_week_start,v_actor) returning * into v_target;
  for v_source_shift in select * from ops.staff_shifts where org_id=v_org and roster_id=v_source.id and removed_at is null order by local_date,person_id loop
    if not exists(select 1 from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
      where m.org_id=v_org and m.team_id=p_team_id and m.person_id=v_source_shift.person_id and p.archived_at is null
        and m.effective_from <= v_source_shift.local_date+7 and (m.effective_to is null or m.effective_to >= v_source_shift.local_date+7)) then continue; end if;
    v_start := v_source_shift.start_at + interval '7 days'; v_end := v_source_shift.end_at + interval '7 days';
    perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || v_source_shift.person_id::text,0));
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
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_effective date; v_prior ops.staff_standing_hours; v_id uuid; v_person uuid;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if not (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_STANDING_FORBIDDEN' using errcode = '42501'; end if;
  if (p_active is null and p_person_id is null) or (p_active is true and (p_working_days is null or cardinality(p_working_days)=0 or p_start_time is null or p_end_time is null or p_start_time=p_end_time
      or cardinality(p_working_days)>7 or not (p_working_days <@ array[0,1,2,3,4,5,6]::smallint[]))) then raise exception 'STAFF_STANDING_INVALID' using errcode = '22023'; end if;
  if not exists(select 1 from shared.teams where org_id=v_org and id=p_team_id and archived_at is null and site_id is not null) then raise exception 'STAFF_TEAM_SITE_REQUIRED' using errcode = '23514'; end if;
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
  if (p_active is true or (p_active is null and p_person_id is not null)) and exists (
    with affected as (
      select distinct m.person_id from shared.team_memberships m
      join shared.people p on p.org_id=m.org_id and p.id=m.person_id and p.archived_at is null
      where m.org_id=v_org and m.team_id=p_team_id
        and (p_person_id is null or m.person_id=p_person_id)
        and (m.effective_to is null or m.effective_to>=v_effective)
    ), boundaries as (
      select a.person_id, v_effective as day from affected a
      union select a.person_id, m.effective_from from affected a join shared.team_memberships m on m.org_id=v_org and m.person_id=a.person_id
      union select a.person_id, m.effective_to+1 from affected a join shared.team_memberships m on m.org_id=v_org and m.person_id=a.person_id where m.effective_to is not null
      union select a.person_id, r.effective_from from affected a join shared.team_memberships m on m.org_id=v_org and m.person_id=a.person_id
        join ops.staff_standing_hours r on r.org_id=m.org_id and r.team_id=m.team_id and (r.person_id is null or r.person_id=a.person_id)
      union select a.person_id, r.effective_to+1 from affected a join shared.team_memberships m on m.org_id=v_org and m.person_id=a.person_id
        join ops.staff_standing_hours r on r.org_id=m.org_id and r.team_id=m.team_id and (r.person_id is null or r.person_id=a.person_id) where r.effective_to is not null
      union select a.person_id, s.local_date from affected a join ops.staff_shifts s on s.org_id=v_org and s.person_id=a.person_id and s.removed_at is null
    ), candidates as (
      select distinct b.person_id, b.day+n as local_date from boundaries b cross join generate_series(-1,7) n
      where b.day+n>=v_effective
    ), proposed as (
      select c.person_id,c.local_date,
        (c.local_date+rule.start_time) at time zone 'Asia/Jakarta' as start_at,
        ((c.local_date+rule.end_time)+case when rule.end_time<rule.start_time then interval '1 day' else interval '0 day' end) at time zone 'Asia/Jakarta' as end_at
      from candidates c
      left join lateral (select r.* from ops.staff_standing_hours r where r.org_id=v_org and r.team_id=p_team_id and r.person_id is null
        and r.effective_from<=c.local_date and (r.effective_to is null or r.effective_to>=c.local_date) order by r.effective_from desc limit 1) def on p_active is null
      cross join lateral (select case when p_active is null then def.active else p_active end as active,
        case when p_active is null then def.working_days else p_working_days end as working_days,
        case when p_active is null then def.start_time else p_start_time end as start_time,
        case when p_active is null then def.end_time else p_end_time end as end_time) rule
      where rule.active and (extract(isodow from c.local_date)::integer-1)::smallint=any(rule.working_days)
        and not exists(select 1 from ops.staff_standing_hours future where future.org_id=v_org and future.team_id=p_team_id
          and future.person_id is not distinct from p_person_id and future.effective_from>v_effective and future.effective_from<=c.local_date)
        and exists(select 1 from shared.team_memberships m where m.org_id=v_org and m.team_id=p_team_id and m.person_id=c.person_id
          and m.effective_from<=c.local_date and (m.effective_to is null or m.effective_to>=c.local_date))
        and (p_person_id is not null or not exists(select 1 from ops.staff_standing_hours ex where ex.org_id=v_org and ex.team_id=p_team_id
          and ex.person_id=c.person_id and ex.effective_from<=c.local_date and (ex.effective_to is null or ex.effective_to>=c.local_date)))
    )
    select 1 from proposed p where exists (
      select 1 from ops.staff_shifts s where s.org_id=v_org and s.person_id=p.person_id and s.removed_at is null
        and s.start_at<p.end_at and s.end_at>p.start_at
    ) or exists (
      select 1 from generate_series(-1,1) n
      join shared.team_memberships m on m.org_id=v_org and m.person_id=p.person_id and m.team_id<>p_team_id
        and m.effective_from<=p.local_date+n and (m.effective_to is null or m.effective_to>=p.local_date+n)
      join shared.teams t on t.org_id=m.org_id and t.id=m.team_id and t.archived_at is null
      join lateral (select r.* from ops.staff_standing_hours r where r.org_id=v_org and r.team_id=m.team_id and r.person_id is null
        and r.effective_from<=p.local_date+n and (r.effective_to is null or r.effective_to>=p.local_date+n) order by r.effective_from desc limit 1) def on true
      left join lateral (select r.* from ops.staff_standing_hours r where r.org_id=v_org and r.team_id=m.team_id and r.person_id=p.person_id
        and r.effective_from<=p.local_date+n and (r.effective_to is null or r.effective_to>=p.local_date+n) order by r.effective_from desc limit 1) ex on true
      cross join lateral (select coalesce(ex.active,def.active) as active, coalesce(ex.working_days,def.working_days) as working_days,
        case when ex.id is not null then ex.start_time else def.start_time end as start_time,
        case when ex.id is not null then ex.end_time else def.end_time end as end_time) r
      where r.active and (extract(isodow from p.local_date+n)::integer-1)::smallint=any(r.working_days)
        and ((p.local_date+n)+r.start_time) at time zone 'Asia/Jakarta'<p.end_at
        and (((p.local_date+n)+r.end_time)+case when r.end_time<r.start_time then interval '1 day' else interval '0 day' end) at time zone 'Asia/Jakarta'>p.start_at
    )
  ) then raise exception 'STAFF_STANDING_CONFLICT' using errcode = '23P01'; end if;
  select * into v_prior from ops.staff_standing_hours where org_id=v_org and team_id=p_team_id and person_id is not distinct from p_person_id
    and effective_from<=v_effective and (effective_to is null or effective_to>=v_effective) order by effective_from desc limit 1 for update;
  if p_active is null then
    if v_prior.id is not null and v_prior.effective_from=v_effective then
      delete from ops.staff_standing_hours where id=v_prior.id;
    elsif v_prior.id is not null then
      update ops.staff_standing_hours set effective_to=v_effective-1 where id=v_prior.id;
    end if;
    return v_effective;
  end if;
  if v_prior.id is not null and v_prior.effective_from=v_effective then
    update ops.staff_standing_hours set working_days=case when p_active then p_working_days else '{}'::smallint[] end,
      start_time=case when p_active then p_start_time else null end,end_time=case when p_active then p_end_time else null end,
      active=p_active,changed_by=v_actor where id=v_prior.id;
  else
    update ops.staff_standing_hours set effective_to=v_effective-1 where org_id=v_org and team_id=p_team_id
      and person_id is not distinct from p_person_id and effective_to is null and effective_from<v_effective;
    insert into ops.staff_standing_hours(org_id,team_id,person_id,effective_from,working_days,start_time,end_time,active,changed_by)
    values(v_org,p_team_id,p_person_id,v_effective,case when p_active then p_working_days else '{}'::smallint[] end,
      case when p_active then p_start_time else null end,case when p_active then p_end_time else null end,p_active,v_actor);
  end if;
  return v_effective;
end;
$$;
revoke execute on function ops.save_standing_hours(uuid,uuid,smallint[],time,time,boolean) from public, anon;
grant execute on function ops.save_standing_hours(uuid,uuid,smallint[],time,time,boolean) to authenticated;
