-- Stage 1 staff schedules: Site shift catalog, weekly Team rosters, standing hours, and personal views.
-- All writes and attendance reads use checked SECURITY DEFINER actions; direct table access stays closed.
-- DOWN (manual, only after the guarded rollback has confirmed there is no schedule history to preserve):
--   drop function ops.list_next_my_staff_shifts();
--   drop function ops.list_my_staff_shifts(date);
--   drop function ops.list_staff_standing_hours(uuid);
--   drop function ops.save_standing_hours(uuid,uuid,smallint[],time,time,boolean);
--   drop function ops.get_staff_roster(uuid,date);
--   drop function ops.list_led_staff_teams();
--   drop function ops.remove_staff_shift(uuid);
--   drop function ops.publish_staff_roster(uuid,date);
--   drop function ops.copy_staff_roster(uuid,date);
--   drop function ops.save_staff_shift(uuid,uuid,date,uuid,uuid);
--   drop function ops.list_staff_site_templates(uuid);
--   drop function ops.archive_site_shift_template(uuid);
--   drop function ops.save_site_shift_template(uuid,uuid,text,time,time);
--   drop function ops.save_attendance_team_site(uuid,uuid);
--   drop function ops.save_attendance_site(uuid,double precision,double precision,integer);
--   drop function ops._attendance_shift_overlaps(uuid,date,timestamptz,timestamptz,uuid);
--   drop function ops._attendance_standing_version(uuid,uuid,date);
--   drop function ops._attendance_week_start(date);
--   drop function ops._attendance_days_valid(smallint[]);
--   drop function ops._attendance_now();
--   drop table ops.staff_standing_hours;
--   drop table ops.staff_shifts;
--   drop table ops.staff_rosters;
--   drop table ops.staff_shift_templates;
--   drop index shared.people_org_id_id_uk;
--   drop index shared.sites_org_id_id_uk;
--   drop index shared.teams_org_id_id_uk;
--   alter table shared.sites drop column latitude, drop column longitude, drop column attendance_radius_m;

create unique index teams_org_id_id_uk on shared.teams (org_id, id);
create unique index sites_org_id_id_uk on shared.sites (org_id, id);
create unique index people_org_id_id_uk on shared.people (org_id, id);

alter table shared.sites
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column attendance_radius_m integer not null default 100 check (attendance_radius_m > 0);
alter table shared.sites add constraint sites_attendance_pin_pair_ck
  check ((latitude is null) = (longitude is null));
comment on column shared.sites.latitude is 'Site pin latitude; configured by Admin for the future attendance location check.';
comment on column shared.sites.longitude is 'Site pin longitude; configured by Admin for the future attendance location check.';
comment on column shared.sites.attendance_radius_m is 'Site radius in metres; defaults to 100 and is configured by Admin.';

create or replace function ops._attendance_days_valid(p_days smallint[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_days is not null and cardinality(p_days) = (select count(distinct day)::integer from unnest(p_days) as days(day))
$$;
revoke execute on function ops._attendance_days_valid(smallint[]) from public, anon, authenticated;

create table ops.staff_shift_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  site_id uuid not null,
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  start_time time not null,
  end_time time not null,
  archived_at timestamptz,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_shift_templates_org_id_id_uk unique (org_id, id),
  constraint staff_shift_templates_site_same_org_fk foreign key (org_id, site_id)
    references shared.sites (org_id, id) on delete restrict,
  constraint staff_shift_templates_creator_same_org_fk foreign key (org_id, created_by)
    references shared.people (org_id, id) on delete restrict,
  constraint staff_shift_templates_updater_same_org_fk foreign key (org_id, updated_by)
    references shared.people (org_id, id) on delete restrict,
  constraint staff_shift_templates_time_ck check (start_time <> end_time)
);
create unique index staff_shift_templates_live_name_uk
  on ops.staff_shift_templates (org_id, site_id, lower(btrim(name))) where archived_at is null;
create index staff_shift_templates_site_idx on ops.staff_shift_templates (org_id, site_id, archived_at, name);
comment on table ops.staff_shift_templates is 'Admin-defined shift hours for a Site. Assignments snapshot the name and times; later edits and archives affect new assignments only.';

create table ops.staff_rosters (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  team_id uuid not null,
  site_id uuid not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid not null references shared.people(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_rosters_org_id_id_uk unique (org_id, id),
  constraint staff_rosters_team_week_uk unique (org_id, team_id, week_start),
  constraint staff_rosters_team_same_org_fk foreign key (org_id, team_id)
    references shared.teams (org_id, id) on delete restrict,
  constraint staff_rosters_site_same_org_fk foreign key (org_id, site_id)
    references shared.sites (org_id, id) on delete restrict,
  constraint staff_rosters_creator_same_org_fk foreign key (org_id, created_by)
    references shared.people (org_id, id) on delete restrict,
  constraint staff_rosters_published_state_ck check ((status = 'draft' and published_at is null) or (status = 'published' and published_at is not null))
);
create index staff_rosters_team_week_idx on ops.staff_rosters (org_id, team_id, week_start desc);
comment on table ops.staff_rosters is 'A Team-owned Monday–Sunday roster. A published roster exposes each assigned Person’s own shifts through the personal schedule action; publication delivers one Inbox notice per Person.';

create table ops.staff_shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  roster_id uuid not null,
  team_id uuid not null,
  site_id uuid not null,
  person_id uuid not null,
  template_id uuid,
  local_date date not null,
  template_name text not null check (btrim(template_name) <> ''),
  start_at timestamptz not null,
  end_at timestamptz not null,
  removed_at timestamptz,
  created_by uuid not null references shared.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_shifts_org_id_id_uk unique (org_id, id),
  constraint staff_shifts_roster_same_org_fk foreign key (org_id, roster_id)
    references ops.staff_rosters (org_id, id) on delete restrict,
  constraint staff_shifts_team_same_org_fk foreign key (org_id, team_id)
    references shared.teams (org_id, id) on delete restrict,
  constraint staff_shifts_site_same_org_fk foreign key (org_id, site_id)
    references shared.sites (org_id, id) on delete restrict,
  constraint staff_shifts_person_same_org_fk foreign key (org_id, person_id)
    references shared.people (org_id, id) on delete restrict,
  constraint staff_shifts_template_same_org_fk foreign key (org_id, template_id)
    references ops.staff_shift_templates (org_id, id) on delete restrict,
  constraint staff_shifts_creator_same_org_fk foreign key (org_id, created_by)
    references shared.people (org_id, id) on delete restrict,
  constraint staff_shifts_bounds_ck check (end_at > start_at)
);
create index staff_shifts_person_time_idx on ops.staff_shifts (org_id, person_id, start_at, end_at) where removed_at is null;
create index staff_shifts_roster_date_idx on ops.staff_shifts (org_id, roster_id, local_date) where removed_at is null;
comment on table ops.staff_shifts is 'A dated assignment with UTC instants and Site-shift snapshot. Removal is retained as history; a changed template never retimes an existing assignment.';

create table ops.staff_standing_hours (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  team_id uuid not null,
  person_id uuid,
  effective_from date not null check (extract(isodow from effective_from) = 1),
  effective_to date,
  working_days smallint[] not null default '{}',
  start_time time,
  end_time time,
  active boolean not null,
  changed_by uuid not null references shared.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint staff_standing_hours_org_id_id_uk unique (org_id, id),
  constraint staff_standing_hours_team_same_org_fk foreign key (org_id, team_id)
    references shared.teams (org_id, id) on delete restrict,
  constraint staff_standing_hours_person_same_org_fk foreign key (org_id, person_id)
    references shared.people (org_id, id) on delete restrict,
  constraint staff_standing_hours_actor_same_org_fk foreign key (org_id, changed_by)
    references shared.people (org_id, id) on delete restrict,
  constraint staff_standing_hours_range_ck check (effective_to is null or effective_to >= effective_from),
  constraint staff_standing_hours_days_ck check (
    cardinality(working_days) <= 7 and working_days <@ array[0,1,2,3,4,5,6]::smallint[]
    and ops._attendance_days_valid(working_days)
  ),
  constraint staff_standing_hours_time_ck check (not active or (cardinality(working_days) > 0 and start_time is not null and end_time is not null and start_time <> end_time))
);
create unique index staff_standing_hours_team_version_uk
  on ops.staff_standing_hours (org_id, team_id, effective_from) where person_id is null;
create unique index staff_standing_hours_person_version_uk
  on ops.staff_standing_hours (org_id, team_id, person_id, effective_from) where person_id is not null;
create index staff_standing_hours_effective_idx on ops.staff_standing_hours (org_id, team_id, person_id, effective_from desc, effective_to);
comment on table ops.staff_standing_hours is 'Effective-dated Team defaults and per-Person exceptions. A change starts next Monday; earlier/current schedule history is preserved.';

alter table ops.staff_shift_templates enable row level security;
alter table ops.staff_shift_templates force row level security;
alter table ops.staff_rosters enable row level security;
alter table ops.staff_rosters force row level security;
alter table ops.staff_shifts enable row level security;
alter table ops.staff_shifts force row level security;
alter table ops.staff_standing_hours enable row level security;
alter table ops.staff_standing_hours force row level security;

create policy staff_shift_templates_read on ops.staff_shift_templates for select to authenticated
  using (org_id = (select shared.current_org_id()) and ((select shared.has_access_role('admin')) or exists (
    select 1 from shared.teams t where t.org_id = staff_shift_templates.org_id and t.site_id = staff_shift_templates.site_id
      and shared.is_designated_team_lead(t.id, (select shared.current_person_id()))
  )));
create policy staff_rosters_read on ops.staff_rosters for select to authenticated
  using (org_id = (select shared.current_org_id()) and ((select shared.has_access_role('admin'))
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))));
create policy staff_shifts_read on ops.staff_shifts for select to authenticated
  using (org_id = (select shared.current_org_id()) and ((select shared.has_access_role('admin'))
    or person_id = (select shared.current_person_id())
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))));
create policy staff_standing_hours_read on ops.staff_standing_hours for select to authenticated
  using (org_id = (select shared.current_org_id()) and ((select shared.has_access_role('admin'))
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))
    or (person_id = (select shared.current_person_id()) or (person_id is null and exists (select 1 from shared.team_memberships m
      where m.org_id = staff_standing_hours.org_id and m.team_id = staff_standing_hours.team_id
        and m.person_id = (select shared.current_person_id()) and (m.effective_to is null or m.effective_to >= current_date))))));

revoke all on ops.staff_shift_templates, ops.staff_rosters, ops.staff_shifts, ops.staff_standing_hours from public, anon, authenticated;

create or replace function ops._attendance_now()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(current_setting('app.allow_test_seeds', true), '') = 'on'
                   and nullif(current_setting('app.attendance_now', true), '') is not null
              then current_setting('app.attendance_now', true)::timestamptz
              else statement_timestamp() end
$$;
revoke execute on function ops._attendance_now() from public, anon, authenticated;

create or replace function ops._attendance_week_start(p_date date)
returns date
language sql
immutable
set search_path = ''
as $$ select p_date - (extract(isodow from p_date)::integer - 1) $$;
revoke execute on function ops._attendance_week_start(date) from public, anon, authenticated;

create or replace function ops._attendance_standing_version(p_team_id uuid, p_person_id uuid, p_date date)
returns ops.staff_standing_hours
language sql
stable
security definer
set search_path = ''
as $$
  select rule from ops.staff_standing_hours rule
   where rule.org_id = shared.current_org_id() and rule.team_id = p_team_id
     and rule.person_id is not distinct from p_person_id
     and rule.effective_from <= p_date and (rule.effective_to is null or rule.effective_to >= p_date)
   order by rule.effective_from desc limit 1
$$;
revoke execute on function ops._attendance_standing_version(uuid,uuid,date) from public, anon, authenticated;

create or replace function ops._attendance_shift_overlaps(
  p_person_id uuid, p_local_date date, p_start_at timestamptz, p_end_at timestamptz, p_except_shift_id uuid
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from ops.staff_shifts s
     where s.org_id = shared.current_org_id() and s.person_id = p_person_id and s.removed_at is null
       and s.id is distinct from p_except_shift_id and s.start_at < p_end_at and s.end_at > p_start_at
  ) or exists (
    with dates as (
      select p_local_date + offset_days as local_date from generate_series(-1, 1) as offsets(offset_days)
    ), active_rules as (
      select d.local_date, m.team_id,
             case when exception.id is not null then exception.active else team_rule.active end as active,
             case when exception.id is not null then exception.working_days else team_rule.working_days end as working_days,
             case when exception.id is not null then exception.start_time else team_rule.start_time end as start_time,
             case when exception.id is not null then exception.end_time else team_rule.end_time end as end_time
        from dates d
        join shared.team_memberships m on m.org_id = shared.current_org_id() and m.person_id = p_person_id
          and m.effective_from <= d.local_date and (m.effective_to is null or m.effective_to >= d.local_date)
        join shared.teams t on t.org_id = m.org_id and t.id = m.team_id and t.archived_at is null
        left join lateral (select r.* from ops.staff_standing_hours r where r.org_id = m.org_id and r.team_id = m.team_id
          and r.person_id is null and r.effective_from <= d.local_date and (r.effective_to is null or r.effective_to >= d.local_date)
          order by r.effective_from desc limit 1) team_rule on true
        left join lateral (select r.* from ops.staff_standing_hours r where r.org_id = m.org_id and r.team_id = m.team_id
          and r.person_id = p_person_id and r.effective_from <= d.local_date and (r.effective_to is null or r.effective_to >= d.local_date)
          order by r.effective_from desc limit 1) exception on true
       where team_rule.id is not null and coalesce(exception.active, team_rule.active)
         and (exception.id is null or exception.active)
    ), standing_ranges as (
      select (local_date + start_time) at time zone 'Asia/Jakarta' as start_at,
             ((local_date + end_time) + case when end_time < start_time then interval '1 day' else interval '0 day' end)
                at time zone 'Asia/Jakarta' as end_at
        from active_rules
       where (extract(isodow from local_date)::integer - 1)::smallint = any(working_days)
    )
    select 1 from standing_ranges r where r.start_at < p_end_at and r.end_at > p_start_at
  )
$$;
revoke execute on function ops._attendance_shift_overlaps(uuid,date,timestamptz,timestamptz,uuid) from public, anon, authenticated;

create or replace function ops.save_attendance_site(
  p_site_id uuid, p_latitude double precision, p_longitude double precision, p_radius_m integer
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id();
begin
  if v_org is null or shared.current_person_id() is null or not shared.has_access_role('admin') then raise exception 'STAFF_ADMIN_FORBIDDEN' using errcode = '42501'; end if;
  if p_site_id is null or p_radius_m is null or p_radius_m <= 0
     or ((p_latitude is null) <> (p_longitude is null))
     or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90))
     or (p_longitude is not null and (p_longitude < -180 or p_longitude > 180)) then
    raise exception 'STAFF_SITE_INVALID' using errcode = '22023';
  end if;
  update shared.sites set latitude=p_latitude, longitude=p_longitude, attendance_radius_m=p_radius_m, updated_at=statement_timestamp()
   where id=p_site_id and org_id=v_org and archived_at is null;
  if not found then raise exception 'STAFF_SITE_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;
revoke execute on function ops.save_attendance_site(uuid,double precision,double precision,integer) from public, anon;
grant execute on function ops.save_attendance_site(uuid,double precision,double precision,integer) to authenticated;

create or replace function ops.save_attendance_team_site(p_team_id uuid, p_site_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id();
begin
  if v_org is null or shared.current_person_id() is null or not shared.has_access_role('admin') then raise exception 'STAFF_ADMIN_FORBIDDEN' using errcode = '42501'; end if;
  if p_site_id is not null and not exists(select 1 from shared.sites where id=p_site_id and org_id=v_org and archived_at is null) then
    raise exception 'STAFF_SITE_NOT_FOUND' using errcode = 'P0002';
  end if;
  update shared.teams set site_id=p_site_id, updated_at=statement_timestamp()
   where id=p_team_id and org_id=v_org and archived_at is null;
  if not found then raise exception 'STAFF_TEAM_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;
revoke execute on function ops.save_attendance_team_site(uuid,uuid) from public, anon;
grant execute on function ops.save_attendance_team_site(uuid,uuid) to authenticated;

create or replace function ops.save_site_shift_template(
  p_site_id uuid, p_template_id uuid, p_name text, p_start_time time, p_end_time time
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_id uuid;
begin
  if v_org is null or v_actor is null or not shared.has_access_role('admin') then raise exception 'STAFF_ADMIN_FORBIDDEN' using errcode = '42501'; end if;
  if p_site_id is null or nullif(btrim(p_name),'') is null or char_length(btrim(p_name)) > 80
     or p_start_time is null or p_end_time is null or p_start_time = p_end_time then
    raise exception 'STAFF_TEMPLATE_INVALID' using errcode = '22023';
  end if;
  if not exists(select 1 from shared.sites where id=p_site_id and org_id=v_org and archived_at is null) then raise exception 'STAFF_SITE_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists(select 1 from ops.staff_shift_templates where org_id=v_org and site_id=p_site_id and archived_at is null
    and lower(btrim(name))=lower(btrim(p_name)) and id is distinct from p_template_id) then raise exception 'STAFF_TEMPLATE_NAME_TAKEN' using errcode = '23505'; end if;
  if p_template_id is null then
    insert into ops.staff_shift_templates(org_id,site_id,name,start_time,end_time,created_by,updated_by)
    values(v_org,p_site_id,btrim(p_name),p_start_time,p_end_time,v_actor,v_actor) returning id into v_id;
  else
    update ops.staff_shift_templates set name=btrim(p_name),start_time=p_start_time,end_time=p_end_time,updated_by=v_actor,updated_at=statement_timestamp()
     where id=p_template_id and org_id=v_org and site_id=p_site_id and archived_at is null returning id into v_id;
    if v_id is null then raise exception 'STAFF_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function ops.save_site_shift_template(uuid,uuid,text,time,time) from public, anon;
grant execute on function ops.save_site_shift_template(uuid,uuid,text,time,time) to authenticated;

create or replace function ops.archive_site_shift_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id();
begin
  if v_org is null or shared.current_person_id() is null or not shared.has_access_role('admin') then raise exception 'STAFF_ADMIN_FORBIDDEN' using errcode = '42501'; end if;
  update ops.staff_shift_templates set archived_at=statement_timestamp(),updated_by=shared.current_person_id(),updated_at=statement_timestamp()
   where id=p_template_id and org_id=v_org and archived_at is null;
  if not found then raise exception 'STAFF_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;
end;
$$;
revoke execute on function ops.archive_site_shift_template(uuid) from public, anon;
grant execute on function ops.archive_site_shift_template(uuid) to authenticated;

create or replace function ops.list_staff_site_templates(p_site_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_person uuid := shared.current_person_id(); v_result jsonb;
begin
  if v_org is null or v_person is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if not exists(select 1 from shared.sites s where s.org_id=v_org and s.id=p_site_id and s.archived_at is null)
     or not (shared.has_access_role('admin') or exists(select 1 from shared.teams t where t.org_id=v_org and t.site_id=p_site_id and shared.is_designated_team_lead(t.id,v_person))
       or exists(select 1 from ops.staff_rosters r join shared.teams t on t.org_id=r.org_id and t.id=r.team_id
         where r.org_id=v_org and r.site_id=p_site_id and t.archived_at is null and shared.is_designated_team_lead(t.id,v_person))) then
    raise exception 'STAFF_SITE_FORBIDDEN' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'site_id',site_id,'name',name,'start_time',start_time,'end_time',end_time,'archived_at',archived_at) order by start_time,name),'[]'::jsonb)
    into v_result from ops.staff_shift_templates where org_id=v_org and site_id=p_site_id and (shared.has_access_role('admin') or archived_at is null);
  return v_result;
end;
$$;
revoke execute on function ops.list_staff_site_templates(uuid) from public, anon;
grant execute on function ops.list_staff_site_templates(uuid) to authenticated;

create or replace function ops.list_led_staff_teams()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_person uuid := shared.current_person_id(); v_result jsonb;
begin
  if v_org is null or v_person is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'site_id',s.id,'site_name',s.name) order by t.name),'[]'::jsonb)
    into v_result from shared.teams t left join shared.sites s on s.org_id=t.org_id and s.id=t.site_id
   where t.org_id=v_org and t.archived_at is null and (shared.has_access_role('admin') or shared.is_designated_team_lead(t.id,v_person));
  return v_result;
end;
$$;
revoke execute on function ops.list_led_staff_teams() from public, anon;
grant execute on function ops.list_led_staff_teams() to authenticated;

create or replace function ops.save_staff_shift(
  p_team_id uuid, p_person_id uuid, p_local_date date, p_template_id uuid, p_shift_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id();
  v_week date; v_roster ops.staff_rosters; v_template ops.staff_shift_templates; v_shift ops.staff_shifts;
  v_start timestamptz; v_end timestamptz; v_old_person uuid; v_id uuid;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if not (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_SHIFT_FORBIDDEN' using errcode = '42501'; end if;
  if p_local_date is null or p_person_id is null or p_template_id is null then raise exception 'STAFF_SHIFT_INVALID' using errcode = '22023'; end if;
  v_week := ops._attendance_week_start(p_local_date);
  if p_local_date < v_week or p_local_date > v_week + 6 then raise exception 'STAFF_SHIFT_INVALID' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || p_person_id::text,0));
  if not exists(select 1 from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
    where m.org_id=v_org and m.team_id=p_team_id and m.person_id=p_person_id and p.archived_at is null
      and m.effective_from <= p_local_date and (m.effective_to is null or m.effective_to >= p_local_date)) then
    raise exception 'STAFF_SHIFT_PERSON_NOT_MEMBER' using errcode = '42501';
  end if;
  if p_shift_id is not null then
    select * into v_shift from ops.staff_shifts where id=p_shift_id and org_id=v_org and team_id=p_team_id and removed_at is null for update;
    if not found or v_shift.local_date < v_week or v_shift.local_date > v_week+6 then raise exception 'STAFF_SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
    v_week := ops._attendance_week_start(v_shift.local_date);
    v_old_person := v_shift.person_id;
  end if;
  select * into v_roster from ops.staff_rosters where org_id=v_org and team_id=p_team_id and week_start=v_week for update;
  if not found then
    if p_shift_id is not null then raise exception 'STAFF_SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
    select * into v_template from ops.staff_shift_templates where id=p_template_id and org_id=v_org and archived_at is null;
    if not found then raise exception 'STAFF_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;
    select site_id into v_roster.site_id from shared.teams where id=p_team_id and org_id=v_org and archived_at is null;
    if v_roster.site_id is null then raise exception 'STAFF_TEAM_SITE_REQUIRED' using errcode = '23514'; end if;
    if v_template.site_id is distinct from v_roster.site_id then raise exception 'STAFF_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;
    insert into ops.staff_rosters(org_id,team_id,site_id,week_start,created_by) values(v_org,p_team_id,v_roster.site_id,v_week,v_actor) returning * into v_roster;
  else
    select * into v_template from ops.staff_shift_templates where id=p_template_id and org_id=v_org and site_id=v_roster.site_id and archived_at is null;
    if not found then raise exception 'STAFF_TEMPLATE_NOT_FOUND' using errcode = 'P0002'; end if;
  end if;
  if v_roster.status='published' and p_shift_id is null then
    -- A new assignment on a published week is allowed; its recipient is notified below.
    null;
  end if;
  if p_shift_id is not null and p_local_date <> v_shift.local_date then raise exception 'STAFF_SHIFT_DATE_FIXED' using errcode = '22023'; end if;
  v_start := (p_local_date + v_template.start_time) at time zone 'Asia/Jakarta';
  v_end := ((p_local_date + v_template.end_time) + case when v_template.end_time < v_template.start_time then interval '1 day' else interval '0 day' end) at time zone 'Asia/Jakarta';
  if exists(select 1 from ops.staff_standing_hours r where r.org_id=v_org and r.team_id=p_team_id and r.person_id is null
    and r.effective_from <= p_local_date and (r.effective_to is null or r.effective_to >= p_local_date) and r.active) then
    raise exception 'STAFF_TEAM_STANDING_HOURS' using errcode = '23514';
  end if;
  if ops._attendance_shift_overlaps(p_person_id,p_local_date,v_start,v_end,p_shift_id) then raise exception 'STAFF_SHIFT_OVERLAP' using errcode = '23P01'; end if;
  if p_shift_id is null then
    insert into ops.staff_shifts(org_id,roster_id,team_id,site_id,person_id,template_id,local_date,template_name,start_at,end_at,created_by)
    values(v_org,v_roster.id,p_team_id,v_roster.site_id,p_person_id,v_template.id,p_local_date,v_template.name,v_start,v_end,v_actor) returning id into v_id;
  else
    update ops.staff_shifts set person_id=p_person_id,template_id=v_template.id,template_name=v_template.name,start_at=v_start,end_at=v_end,updated_at=statement_timestamp()
     where id=p_shift_id and org_id=v_org returning id into v_id;
  end if;
  if v_roster.status='published' then
    if v_old_person is not null and v_old_person <> p_person_id then
      perform mos.create_notification(v_old_person,'info','Your shift changed / Shift Anda berubah','Your published shift was updated. / Shift terbit Anda telah diperbarui.',jsonb_build_object('source','staff_roster','entity',jsonb_build_object('type','staff_roster','id',v_roster.id,'route','/work/shifts')));
    end if;
    perform mos.create_notification(p_person_id,'info','Your shift changed / Shift Anda berubah','Your published shift was updated. / Shift terbit Anda telah diperbarui.',jsonb_build_object('source','staff_roster','entity',jsonb_build_object('type','staff_roster','id',v_roster.id,'route','/work/shifts')));
  end if;
  return v_id;
end;
$$;
revoke execute on function ops.save_staff_shift(uuid,uuid,date,uuid,uuid) from public, anon;
grant execute on function ops.save_staff_shift(uuid,uuid,date,uuid,uuid) to authenticated;

create or replace function ops.remove_staff_shift(p_shift_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_shift ops.staff_shifts; v_roster ops.staff_rosters;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_shift from ops.staff_shifts where id=p_shift_id and org_id=v_org and removed_at is null for update;
  if not found or not (shared.has_access_role('admin') or shared.is_designated_team_lead(v_shift.team_id,v_actor)) then raise exception 'STAFF_SHIFT_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_roster from ops.staff_rosters where id=v_shift.roster_id and org_id=v_org for update;
  update ops.staff_shifts set removed_at=statement_timestamp(),updated_at=statement_timestamp() where id=v_shift.id;
  if v_roster.status='published' then
    perform mos.create_notification(v_shift.person_id,'info','Your shift was removed / Shift Anda dihapus','A published shift was removed from your week. / Shift terbit dihapus dari minggu Anda.',jsonb_build_object('source','staff_roster','entity',jsonb_build_object('type','staff_roster','id',v_roster.id,'route','/work/shifts')));
  end if;
end;
$$;
revoke execute on function ops.remove_staff_shift(uuid) from public, anon;
grant execute on function ops.remove_staff_shift(uuid) to authenticated;

create or replace function ops.publish_staff_roster(p_team_id uuid, p_week_start date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_roster ops.staff_rosters; v_person uuid; v_count integer := 0;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if not (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_ROSTER_FORBIDDEN' using errcode = '42501'; end if;
  if p_week_start is null or p_week_start <> ops._attendance_week_start(p_week_start) then raise exception 'STAFF_WEEK_INVALID' using errcode = '22023'; end if;
  select * into v_roster from ops.staff_rosters where org_id=v_org and team_id=p_team_id and week_start=p_week_start for update;
  if not found then raise exception 'STAFF_ROSTER_EMPTY' using errcode = '23514'; end if;
  if v_roster.status='published' then return 0; end if;
  if not exists(select 1 from ops.staff_shifts where org_id=v_org and roster_id=v_roster.id and removed_at is null) then raise exception 'STAFF_ROSTER_EMPTY' using errcode = '23514'; end if;
  update ops.staff_rosters set status='published',published_at=ops._attendance_now(),updated_at=ops._attendance_now() where id=v_roster.id;
  for v_person in select distinct person_id from ops.staff_shifts where org_id=v_org and roster_id=v_roster.id and removed_at is null order by person_id loop
    perform mos.create_notification(v_person,'info','Your week is published / Jadwal minggu Anda diterbitkan','Your Team lead published your shifts. / Team lead menerbitkan shift Anda.',jsonb_build_object('source','staff_roster','week_start',p_week_start,'entity',jsonb_build_object('type','staff_roster','id',v_roster.id,'route','/work/shifts')));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function ops.publish_staff_roster(uuid,date) from public, anon;
grant execute on function ops.publish_staff_roster(uuid,date) to authenticated;

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
        and m.effective_from <= p_week_start+6 and (m.effective_to is null or m.effective_to >= p_week_start)) then continue; end if;
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

create or replace function ops.get_staff_roster(p_team_id uuid, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_roster ops.staff_rosters; v_result jsonb;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if not (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_ROSTER_FORBIDDEN' using errcode = '42501'; end if;
  if p_week_start is null or p_week_start <> ops._attendance_week_start(p_week_start) then raise exception 'STAFF_WEEK_INVALID' using errcode = '22023'; end if;
  select * into v_roster from ops.staff_rosters where org_id=v_org and team_id=p_team_id and week_start=p_week_start;
  select jsonb_build_object(
    'team_id',t.id,'team_name',t.name,'site_id',coalesce(v_roster.site_id,t.site_id),'site_name',s.name,
    'week_start',p_week_start,'status',coalesce(v_roster.status,'draft'),
    'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'person_id',x.person_id,'person_name',p.full_name,'local_date',x.local_date,'template_id',x.template_id,'template_name',x.template_name,'start_at',x.start_at,'end_at',x.end_at) order by x.local_date,x.start_at,p.full_name)
      from ops.staff_shifts x join shared.people p on p.id=x.person_id and p.org_id=x.org_id where x.org_id=v_org and x.roster_id=v_roster.id and x.removed_at is null),'[]'::jsonb),
    'members',coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'full_name',p.full_name) order by p.full_name)
      from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
      where m.org_id=v_org and m.team_id=t.id and p.archived_at is null and m.effective_from<=p_week_start+6 and (m.effective_to is null or m.effective_to>=p_week_start)),'[]'::jsonb)
  ) into v_result from shared.teams t left join shared.sites s on s.id=coalesce(v_roster.site_id,t.site_id) and s.org_id=t.org_id where t.org_id=v_org and t.id=p_team_id and t.archived_at is null;
  if v_result is null then raise exception 'STAFF_TEAM_NOT_FOUND' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;
revoke execute on function ops.get_staff_roster(uuid,date) from public, anon;
grant execute on function ops.get_staff_roster(uuid,date) to authenticated;

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
  if p_active is true and exists(
    select 1 from ops.staff_shifts s
      join shared.team_memberships m on m.org_id=s.org_id and m.team_id=s.team_id and m.person_id=s.person_id
      join shared.people p on p.id=m.person_id and p.org_id=m.org_id and p.archived_at is null
      cross join lateral generate_series(0,2) as offsets(n)
      cross join lateral (select s.local_date + offsets.n - 1 as local_date) d
      cross join lateral (select (d.local_date + p_start_time) at time zone 'Asia/Jakarta' as start_at,
        ((d.local_date + p_end_time) + case when p_end_time < p_start_time then interval '1 day' else interval '0 day' end) at time zone 'Asia/Jakarta' as end_at) standing
     where s.org_id=v_org and s.team_id=p_team_id and s.removed_at is null and s.end_at > (v_effective::timestamp at time zone 'Asia/Jakarta')
       and (p_person_id is null or s.person_id=p_person_id)
       and d.local_date>=v_effective and m.effective_from<=d.local_date and (m.effective_to is null or m.effective_to>=d.local_date)
       and (extract(isodow from d.local_date)::integer-1)::smallint=any(p_working_days)
       and s.start_at < standing.end_at and s.end_at > standing.start_at
       and (p_person_id is not null or not exists(select 1 from ops.staff_standing_hours ex where ex.org_id=v_org and ex.team_id=p_team_id
         and ex.person_id=s.person_id and ex.effective_from<=d.local_date and (ex.effective_to is null or ex.effective_to>=d.local_date)))
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

create or replace function ops.list_staff_standing_hours(p_team_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_effective date; v_result jsonb;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() or not (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_STANDING_FORBIDDEN' using errcode = '42501'; end if;
  v_effective := ops._attendance_week_start((ops._attendance_now() at time zone 'Asia/Jakarta')::date) + 7;
  select jsonb_build_object('effective_from',v_effective,'team_name',t.name,'site_name',s.name,
    'current_default', (select jsonb_build_object('active',r.active,'working_days',r.working_days,'start_time',r.start_time,'end_time',r.end_time)
      from ops._attendance_standing_version(p_team_id,null,v_effective-7) r),
    'current_exceptions',coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'full_name',p.full_name,'active',r.active,'working_days',r.working_days,'start_time',r.start_time,'end_time',r.end_time) order by p.full_name)
      from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
      cross join lateral ops._attendance_standing_version(p_team_id,p.id,v_effective-7) r
      where m.org_id=v_org and m.team_id=p_team_id and p.archived_at is null and m.effective_from<v_effective and (m.effective_to is null or m.effective_to>=v_effective-7)),'[]'::jsonb),
    'default', (select jsonb_build_object('active',r.active,'working_days',r.working_days,'start_time',r.start_time,'end_time',r.end_time)
      from ops._attendance_standing_version(p_team_id,null,v_effective) r),
    'exceptions',coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'full_name',p.full_name,'active',r.active,'working_days',r.working_days,'start_time',r.start_time,'end_time',r.end_time) order by p.full_name)
      from shared.team_memberships m join shared.people p on p.id=m.person_id and p.org_id=m.org_id
      cross join lateral ops._attendance_standing_version(p_team_id,p.id,v_effective) r
      where m.org_id=v_org and m.team_id=p_team_id and p.archived_at is null and m.effective_from<=v_effective and (m.effective_to is null or m.effective_to>=v_effective)),'[]'::jsonb))
    into v_result from shared.teams t left join shared.sites s on s.org_id=t.org_id and s.id=t.site_id where t.org_id=v_org and t.id=p_team_id and t.archived_at is null;
  if v_result is null then raise exception 'STAFF_TEAM_NOT_FOUND' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;
revoke execute on function ops.list_staff_standing_hours(uuid) from public, anon;
grant execute on function ops.list_staff_standing_hours(uuid) to authenticated;

create or replace function ops.list_my_staff_shifts(p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_person uuid := shared.current_person_id(); v_result jsonb;
begin
  if v_org is null or v_person is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_week_start is null or p_week_start <> ops._attendance_week_start(p_week_start) then raise exception 'STAFF_WEEK_INVALID' using errcode = '22023'; end if;
  with dates as (select p_week_start + n as local_date from generate_series(0,6) n),
  standing as (
    select m.person_id,m.team_id,t.site_id,d.local_date,
      case when ex.id is not null then ex.start_time else def.start_time end as start_time,
      case when ex.id is not null then ex.end_time else def.end_time end as end_time,
      case when ex.id is not null then ex.working_days else def.working_days end as working_days
    from dates d
    join shared.team_memberships m on m.org_id=v_org and m.effective_from<=d.local_date and (m.effective_to is null or m.effective_to>=d.local_date)
    join shared.people p on p.id=m.person_id and p.org_id=m.org_id and p.archived_at is null
    join shared.teams t on t.id=m.team_id and t.org_id=m.org_id and t.archived_at is null
    join lateral ops._attendance_standing_version(m.team_id,null,d.local_date) def on def.id is not null
    left join lateral ops._attendance_standing_version(m.team_id,m.person_id,d.local_date) ex on true
    where (ex.id is null and def.active) or (ex.id is not null and ex.active)
  ),
  all_shifts as (
    select s.id,s.person_id,s.team_id,s.site_id,s.local_date,s.template_name,s.start_at,s.end_at
      from ops.staff_shifts s join ops.staff_rosters r on r.org_id=s.org_id and r.id=s.roster_id
     where s.org_id=v_org and s.removed_at is null and r.status='published'
       and s.local_date between p_week_start and p_week_start+6
    union all
    select null::uuid,st.person_id,st.team_id,st.site_id,st.local_date,'Standing shift',
      (st.local_date+st.start_time) at time zone 'Asia/Jakarta',
      ((st.local_date+st.end_time)+case when st.end_time<st.start_time then interval '1 day' else interval '0 day' end) at time zone 'Asia/Jakarta'
      from standing st where (extract(isodow from st.local_date)::integer-1)::smallint=any(st.working_days)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',own.id,'team_id',own.team_id,'site_id',own.site_id,'site_name',site.name,
    'team_name',team.name,'local_date',own.local_date,'template_name',own.template_name,'start_at',own.start_at,'end_at',own.end_at,
    'crew',coalesce((select jsonb_agg(distinct p.full_name order by p.full_name) from all_shifts crew join shared.people p on p.id=crew.person_id and p.org_id=v_org
      where crew.person_id <> own.person_id and crew.team_id=own.team_id and crew.site_id=own.site_id and crew.local_date=own.local_date and crew.start_at=own.start_at and crew.end_at=own.end_at),'[]'::jsonb)) order by own.local_date,own.start_at),'[]'::jsonb)
    into v_result from all_shifts own join shared.sites site on site.id=own.site_id and site.org_id=v_org join shared.teams team on team.id=own.team_id and team.org_id=v_org
   where own.person_id=v_person;
  return v_result;
end;
$$;
revoke execute on function ops.list_my_staff_shifts(date) from public, anon;
grant execute on function ops.list_my_staff_shifts(date) to authenticated;

create or replace function ops.list_next_my_staff_shifts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_today date := (ops._attendance_now() at time zone 'Asia/Jakarta')::date; v_week date := ops._attendance_week_start(v_today); v_result jsonb;
begin
  with weeks as (select v_week + (n*7) as week_start from generate_series(0,5) n),
  items as (select jsonb_array_elements(ops.list_my_staff_shifts(week_start)) as shift from weeks),
  upcoming as (
    select shift from items where (shift->>'start_at')::timestamptz >= ops._attendance_now()
    order by (shift->>'start_at')::timestamptz limit 3
  ) select coalesce(jsonb_agg(shift order by (shift->>'start_at')::timestamptz),'[]'::jsonb) into v_result from upcoming;
  return v_result;
end;
$$;
revoke execute on function ops.list_next_my_staff_shifts() from public, anon;
grant execute on function ops.list_next_my_staff_shifts() to authenticated;

