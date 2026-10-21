-- Stage 3 staff attendance: clock in/out with a server-checked position, a selfie in a private
-- insert-only bucket, per-org settings that apply from the next shift, and timed jobs.
-- Rules live in checked SECURITY DEFINER actions; direct table access stays closed.
-- DOWN: supabase/rollbacks/20261022020000_ops_staff_attendance_stage3_clock.sql (guarded: refuses while
--   attendance records, consents, alerts or settings exist). Summary: unschedule job 'ops-attendance-jobs';
--   drop the storage policies attendance_selfies_select/insert (the empty bucket stays; Storage blocks
--   deleting it in SQL, and objects are never deleted with SQL); drop the ops.*attendance* functions
--   and the tables attendance_selfie_purge_queue, attendance_alerts, attendance_record_history,
--   attendance_records, attendance_consents, attendance_settings.

-- ── Per-org settings, versioned so a change applies from the next shift only ─────────────────
create table ops.attendance_settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  effective_from timestamptz not null,
  late_grace_min integer not null default 10 check (late_grace_min between 0 and 120),
  clock_in_open_min integer not null default 30 check (clock_in_open_min between 0 and 240),
  max_accuracy_m integer not null default 50 check (max_accuracy_m between 5 and 500),
  missing_alert_min integer not null default 30 check (missing_alert_min between 1 and 240),
  no_clockout_close_min integer not null default 120 check (no_clockout_close_min between 15 and 1440),
  uncovered_alert_min integer not null default 120 check (uncovered_alert_min between 15 and 1440),
  leave_cutoff_days integer not null default 3 check (leave_cutoff_days between 0 and 60),
  -- Retention may be shortened by an Admin but never lengthened past the disclosed 90 days.
  selfie_retention_days integer not null default 90 check (selfie_retention_days between 1 and 90),
  changed_by uuid not null,
  created_at timestamptz not null default now(),
  constraint attendance_settings_org_id_id_uk unique (org_id, id),
  constraint attendance_settings_version_uk unique (org_id, effective_from),
  constraint attendance_settings_actor_same_org_fk foreign key (org_id, changed_by)
    references shared.people (org_id, id) on delete restrict
);
comment on table ops.attendance_settings is 'Org attendance defaults, one row per change. A shift uses the newest row effective at its start, so recorded attendance is never re-judged. No row means the built-in defaults.';

create table ops.attendance_consents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  person_id uuid not null,
  notice_version text not null check (btrim(notice_version) <> ''),
  language text not null check (language in ('en', 'id')),
  accepted_at timestamptz not null default now(),
  constraint attendance_consents_person_version_uk unique (org_id, person_id, notice_version),
  constraint attendance_consents_person_same_org_fk foreign key (org_id, person_id)
    references shared.people (org_id, id) on delete cascade
);
comment on table ops.attendance_consents is 'Who agreed to which privacy notice version, when and in which language. Declining records nothing.';

create table ops.attendance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  person_id uuid not null,
  team_id uuid not null,
  site_id uuid not null,
  shift_start_at timestamptz not null,
  shift_end_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'in', 'out', 'closed')),
  clock_in_at timestamptz,
  in_latitude double precision,
  in_longitude double precision,
  in_accuracy_m double precision,
  in_distance_m double precision,
  clock_out_at timestamptz,
  out_latitude double precision,
  out_longitude double precision,
  out_accuracy_m double precision,
  out_distance_m double precision,
  selfie_path text,
  selfie_captured_at timestamptz,
  selfie_purged_at timestamptz,
  radius_m integer,
  grace_min integer,
  late boolean not null default false,
  late_minutes integer,
  early_leave boolean not null default false,
  early_minutes integer,
  closure text check (closure is null or closure = 'no_clock_out'),
  source text not null default 'device' check (source in ('device', 'correction')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_org_id_id_uk unique (org_id, id),
  constraint attendance_records_shift_uk unique (org_id, person_id, shift_start_at),
  constraint attendance_records_person_same_org_fk foreign key (org_id, person_id)
    references shared.people (org_id, id) on delete restrict,
  constraint attendance_records_team_same_org_fk foreign key (org_id, team_id)
    references shared.teams (org_id, id) on delete restrict,
  constraint attendance_records_site_same_org_fk foreign key (org_id, site_id)
    references shared.sites (org_id, id) on delete restrict,
  constraint attendance_records_bounds_ck check (shift_end_at > shift_start_at),
  constraint attendance_records_clocked_ck check (status = 'pending' or clock_in_at is not null),
  constraint attendance_records_pending_ck check (status <> 'pending' or clock_in_at is null),
  constraint attendance_records_out_ck check (status <> 'out' or clock_out_at is not null)
);
create index attendance_records_team_time_idx on ops.attendance_records (org_id, team_id, shift_start_at desc);
create index attendance_records_open_idx on ops.attendance_records (org_id, shift_end_at) where status = 'in';
create index attendance_records_selfie_idx on ops.attendance_records (org_id, selfie_captured_at) where selfie_path is not null;
comment on table ops.attendance_records is 'One row per Person and shift: the clock events with server-calculated distance, flags and the selfie reference. Pending rows are capture attempts that have not been accepted.';

create table ops.attendance_record_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  record_id uuid not null,
  changed_by uuid not null,
  reason text not null check (btrim(reason) <> ''),
  before_state jsonb,
  after_state jsonb not null,
  created_at timestamptz not null default now(),
  constraint attendance_record_history_record_fk foreign key (org_id, record_id)
    references ops.attendance_records (org_id, id) on delete cascade,
  constraint attendance_record_history_actor_fk foreign key (org_id, changed_by)
    references shared.people (org_id, id) on delete restrict
);
create index attendance_record_history_record_idx on ops.attendance_record_history (org_id, record_id, created_at);
comment on table ops.attendance_record_history is 'Each reasoned correction with the record before and after. Times and flags only; never coordinates.';

create table ops.attendance_alerts (
  org_id uuid not null references shared.orgs(id) on delete cascade,
  kind text not null check (kind in ('missing', 'no_clock_out')),
  person_id uuid not null,
  shift_start_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (org_id, kind, person_id, shift_start_at),
  constraint attendance_alerts_person_same_org_fk foreign key (org_id, person_id)
    references shared.people (org_id, id) on delete cascade
);
comment on table ops.attendance_alerts is 'One alert per shift per kind, so the timed job can run any number of times.';

create table ops.attendance_selfie_purge_queue (
  path text primary key,
  org_id uuid not null references shared.orgs(id) on delete cascade,
  queued_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index attendance_selfie_purge_due_idx on ops.attendance_selfie_purge_queue (queued_at) where deleted_at is null;
comment on table ops.attendance_selfie_purge_queue is 'Selfie objects due for deletion. The Storage API worker deletes them and confirms; SQL never deletes storage objects.';

alter table ops.attendance_settings enable row level security;
alter table ops.attendance_settings force row level security;
alter table ops.attendance_consents enable row level security;
alter table ops.attendance_consents force row level security;
alter table ops.attendance_records enable row level security;
alter table ops.attendance_records force row level security;
alter table ops.attendance_record_history enable row level security;
alter table ops.attendance_record_history force row level security;
alter table ops.attendance_alerts enable row level security;
alter table ops.attendance_alerts force row level security;
alter table ops.attendance_selfie_purge_queue enable row level security;
alter table ops.attendance_selfie_purge_queue force row level security;
revoke all on ops.attendance_settings, ops.attendance_consents, ops.attendance_records,
  ops.attendance_record_history, ops.attendance_alerts, ops.attendance_selfie_purge_queue
  from public, anon, authenticated;

-- ── Who may read a Person's attendance: the Person, their Team lead, hr, admin ───────────────
-- has_access_role('hr') is a plain membership test, so it is simply false until the hr role exists.
create or replace function ops._attendance_reader_ok(p_person_id uuid, p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(shared.current_person_id() is not null
     and (p_person_id = shared.current_person_id()
          or shared.has_access_role('admin')
          or shared.has_access_role('hr')
          or shared.is_designated_team_lead(p_team_id, shared.current_person_id())), false)
$$;
revoke execute on function ops._attendance_reader_ok(uuid, uuid) from public, anon;
grant execute on function ops._attendance_reader_ok(uuid, uuid) to authenticated;

create policy attendance_records_read on ops.attendance_records for select to authenticated
  using (org_id = (select shared.current_org_id()) and ops._attendance_reader_ok(person_id, team_id));
create policy attendance_record_history_read on ops.attendance_record_history for select to authenticated
  using (org_id = (select shared.current_org_id()) and exists (
    select 1 from ops.attendance_records r
     where r.org_id = attendance_record_history.org_id and r.id = attendance_record_history.record_id
       and ops._attendance_reader_ok(r.person_id, r.team_id)));
create policy attendance_consents_read on ops.attendance_consents for select to authenticated
  using (org_id = (select shared.current_org_id()) and person_id = (select shared.current_person_id()));

-- ── Pure helpers ──────────────────────────────────────────────────────────────────────────────
create or replace function ops._attendance_distance_m(
  p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision
) returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371008.8 * asin(sqrt(least(1.0::double precision,
    power(sin(radians(p_lat2 - p_lat1) / 2), 2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lng2 - p_lng1) / 2), 2))))
$$;
comment on function ops._attendance_distance_m(double precision, double precision, double precision, double precision) is
  'Great-circle (haversine) distance in metres on a 6371008.8 m sphere. Plain SQL, no extension.';
revoke execute on function ops._attendance_distance_m(double precision, double precision, double precision, double precision) from public, anon, authenticated;

create or replace function ops._attendance_notice_version()
returns text
language sql
immutable
set search_path = ''
as $$ select 'attendance-2026-10-r2'::text $$;
revoke execute on function ops._attendance_notice_version() from public, anon, authenticated;

create or replace function ops._attendance_settings_at(p_org_id uuid, p_at timestamptz)
returns ops.attendance_settings
language plpgsql
stable
security definer
set search_path = ''
as $$
declare r ops.attendance_settings;
begin
  select s.* into r from ops.attendance_settings s
   where s.org_id = p_org_id and s.effective_from <= p_at
   order by s.effective_from desc limit 1;
  if not found then
    r.org_id := p_org_id;
    r.late_grace_min := 10; r.clock_in_open_min := 30; r.max_accuracy_m := 50; r.missing_alert_min := 30;
    r.no_clockout_close_min := 120; r.uncovered_alert_min := 120; r.leave_cutoff_days := 3; r.selfie_retention_days := 90;
  end if;
  return r;
end;
$$;
revoke execute on function ops._attendance_settings_at(uuid, timestamptz) from public, anon, authenticated;

-- Every shift a Person is expected to work in a window: published roster shifts plus the shifts
-- that standing hours generate. Standing shifts have no row, so attendance keys on the start time.
create or replace function ops._attendance_shifts_between(p_org_id uuid, p_from timestamptz, p_to timestamptz)
returns table (shift_id uuid, person_id uuid, team_id uuid, site_id uuid, local_date date, template_name text, start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with dates as (
    select d::date as local_date
      from generate_series(((p_from at time zone 'Asia/Jakarta')::date - 1)::timestamp,
                           ((p_to at time zone 'Asia/Jakarta')::date + 1)::timestamp, interval '1 day') d
  ), standing as (
    select m.person_id, m.team_id, t.site_id, d.local_date,
      case when ex.id is not null then ex.start_time else def.start_time end as start_time,
      case when ex.id is not null then ex.end_time else def.end_time end as end_time,
      case when ex.id is not null then ex.working_days else def.working_days end as working_days
    from dates d
    join shared.team_memberships m on m.org_id = p_org_id and m.effective_from <= d.local_date
      and (m.effective_to is null or m.effective_to >= d.local_date)
    join shared.people p on p.id = m.person_id and p.org_id = m.org_id and p.archived_at is null
    join shared.teams t on t.id = m.team_id and t.org_id = m.org_id and t.archived_at is null and t.site_id is not null
    join lateral (select r.* from ops.staff_standing_hours r
       where r.org_id = p_org_id and r.team_id = m.team_id and r.person_id is null
         and r.effective_from <= d.local_date and (r.effective_to is null or r.effective_to >= d.local_date)
       order by r.effective_from desc limit 1) def on true
    left join lateral (select r.* from ops.staff_standing_hours r
       where r.org_id = p_org_id and r.team_id = m.team_id and r.person_id = m.person_id
         and r.effective_from <= d.local_date and (r.effective_to is null or r.effective_to >= d.local_date)
       order by r.effective_from desc limit 1) ex on true
    where (ex.id is null and def.active) or (ex.id is not null and ex.active)
  ), generated as (
    select st.person_id, st.team_id, st.site_id, st.local_date, 'Standing shift'::text as template_name,
      (st.local_date + st.start_time) at time zone 'Asia/Jakarta' as start_at,
      ((st.local_date + st.end_time) + case when st.end_time < st.start_time then interval '1 day' else interval '0 day' end)
        at time zone 'Asia/Jakarta' as end_at
      from standing st
     where (extract(isodow from st.local_date)::integer - 1)::smallint = any(st.working_days)
  )
  select s.id, s.person_id, s.team_id, s.site_id, s.local_date, s.template_name, s.start_at, s.end_at
    from ops.staff_shifts s join ops.staff_rosters r on r.org_id = s.org_id and r.id = s.roster_id
   where s.org_id = p_org_id and s.removed_at is null and r.status = 'published'
     and s.start_at >= p_from and s.start_at < p_to
  union all
  select null::uuid, g.person_id, g.team_id, g.site_id, g.local_date, g.template_name, g.start_at, g.end_at
    from generated g where g.start_at >= p_from and g.start_at < p_to
$$;
revoke execute on function ops._attendance_shifts_between(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Stage 2 records absences. Until its table exists, nobody is absent. The check is isolated so
-- stage 2 can swap it for its own shape without touching the clock or the jobs.
create or replace function ops._attendance_has_absence(p_org_id uuid, p_person_id uuid, p_shift_start_at timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_found boolean := false;
begin
  if to_regclass('ops.staff_absences') is null then return false; end if;
  begin
    execute 'select exists (select 1 from ops.staff_absences a where a.org_id = $1 and a.person_id = $2 and a.shift_start_at = $3 and a.status in (''accepted'', ''approved''))'
      into v_found using p_org_id, p_person_id, p_shift_start_at;
  exception when undefined_column or undefined_table then
    v_found := false;
  end;
  return coalesce(v_found, false);
end;
$$;
revoke execute on function ops._attendance_has_absence(uuid, uuid, timestamptz) from public, anon, authenticated;

-- ── Selfie storage: <org>/<attendance-record>/<random-id>.jpg, private and insert-only ─────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-selfies', 'attendance-selfies', false, 307200, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 307200, allowed_mime_types = array['image/jpeg'];

create or replace function ops.attendance_selfie_record_id(p_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then
    return null;
  end if;
  return split_part(p_name, '/', 2)::uuid;
end;
$$;
revoke execute on function ops.attendance_selfie_record_id(text) from public, anon, authenticated;
grant execute on function ops.attendance_selfie_record_id(text) to authenticated, service_role;

create or replace function ops.can_read_attendance_selfie(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_record uuid := ops.attendance_selfie_record_id(p_name);
begin
  if v_record is null or split_part(p_name, '/', 1) <> shared.current_org_id()::text then return false; end if;
  return exists (
    select 1 from ops.attendance_records r
     where r.id = v_record and r.org_id = shared.current_org_id()
       and r.selfie_path = p_name and ops._attendance_reader_ok(r.person_id, r.team_id));
end;
$$;
comment on function ops.can_read_attendance_selfie(text) is 'Storage read check: canonical path, same org, the record that owns the object, and a reader who is the Person, the Team lead of that record, hr or admin.';
revoke execute on function ops.can_read_attendance_selfie(text) from public, anon, authenticated;
grant execute on function ops.can_read_attendance_selfie(text) to authenticated, service_role;

create or replace function ops.can_add_attendance_selfie(p_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_record uuid := ops.attendance_selfie_record_id(p_name); v_org uuid := shared.current_org_id();
begin
  if v_record is null or v_org is null or split_part(p_name, '/', 1) <> v_org::text then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-selfie:' || v_record::text, 0));
  return exists (
    select 1 from ops.attendance_records r
     where r.id = v_record and r.org_id = v_org and r.person_id = shared.current_person_id()
       and r.status = 'pending' and r.created_at > ops._attendance_now() - interval '15 minutes'
       and (select count(*) from storage.objects o
             where o.bucket_id = 'attendance-selfies' and ops.attendance_selfie_record_id(o.name) = v_record) < 3);
end;
$$;
comment on function ops.can_add_attendance_selfie(text) is 'Storage insert check: only the Person who owns a pending, recent capture attempt can add an image to it; three images at most.';
revoke execute on function ops.can_add_attendance_selfie(text) from public, anon, authenticated;
grant execute on function ops.can_add_attendance_selfie(text) to authenticated, service_role;

create policy attendance_selfies_select on storage.objects for select to authenticated
  using (bucket_id = 'attendance-selfies' and ops.can_read_attendance_selfie(name));
create policy attendance_selfies_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attendance-selfies' and ops.can_add_attendance_selfie(name));

-- ── Settings ──────────────────────────────────────────────────────────────────────────────────
create or replace function ops.get_attendance_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); r ops.attendance_settings;
begin
  if v_org is null or shared.current_person_id() is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  r := ops._attendance_settings_at(v_org, ops._attendance_now());
  return jsonb_build_object('late_grace_min', r.late_grace_min, 'clock_in_open_min', r.clock_in_open_min,
    'max_accuracy_m', r.max_accuracy_m, 'missing_alert_min', r.missing_alert_min,
    'no_clockout_close_min', r.no_clockout_close_min, 'uncovered_alert_min', r.uncovered_alert_min,
    'leave_cutoff_days', r.leave_cutoff_days, 'selfie_retention_days', r.selfie_retention_days);
end;
$$;
revoke execute on function ops.get_attendance_settings() from public, anon;
grant execute on function ops.get_attendance_settings() to authenticated;

create or replace function ops.save_attendance_settings(
  p_late_grace_min integer, p_clock_in_open_min integer, p_max_accuracy_m integer, p_missing_alert_min integer,
  p_no_clockout_close_min integer, p_uncovered_alert_min integer, p_leave_cutoff_days integer, p_selfie_retention_days integer
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_at timestamptz := ops._attendance_now();
begin
  if v_org is null or v_actor is null or not shared.has_access_role('admin') then raise exception 'STAFF_ADMIN_FORBIDDEN' using errcode = '42501'; end if;
  if p_late_grace_min is null or p_late_grace_min not between 0 and 120
     or p_clock_in_open_min is null or p_clock_in_open_min not between 0 and 240
     or p_max_accuracy_m is null or p_max_accuracy_m not between 5 and 500
     or p_missing_alert_min is null or p_missing_alert_min not between 1 and 240
     or p_no_clockout_close_min is null or p_no_clockout_close_min not between 15 and 1440
     or p_uncovered_alert_min is null or p_uncovered_alert_min not between 15 and 1440
     or p_leave_cutoff_days is null or p_leave_cutoff_days not between 0 and 60
     or p_selfie_retention_days is null or p_selfie_retention_days not between 1 and 90 then
    raise exception 'STAFF_SETTINGS_INVALID' using errcode = '22023';
  end if;
  insert into ops.attendance_settings (org_id, effective_from, late_grace_min, clock_in_open_min, max_accuracy_m, missing_alert_min,
    no_clockout_close_min, uncovered_alert_min, leave_cutoff_days, selfie_retention_days, changed_by)
  values (v_org, v_at, p_late_grace_min, p_clock_in_open_min, p_max_accuracy_m, p_missing_alert_min,
    p_no_clockout_close_min, p_uncovered_alert_min, p_leave_cutoff_days, p_selfie_retention_days, v_actor)
  on conflict (org_id, effective_from) do update set late_grace_min = excluded.late_grace_min,
    clock_in_open_min = excluded.clock_in_open_min, max_accuracy_m = excluded.max_accuracy_m,
    missing_alert_min = excluded.missing_alert_min, no_clockout_close_min = excluded.no_clockout_close_min,
    uncovered_alert_min = excluded.uncovered_alert_min, leave_cutoff_days = excluded.leave_cutoff_days,
    selfie_retention_days = excluded.selfie_retention_days, changed_by = excluded.changed_by;
  return v_at;
end;
$$;
revoke execute on function ops.save_attendance_settings(integer, integer, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function ops.save_attendance_settings(integer, integer, integer, integer, integer, integer, integer, integer) to authenticated;

-- ── Consent ───────────────────────────────────────────────────────────────────────────────────
create or replace function ops.record_attendance_consent(p_notice_version text, p_language text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_person uuid := shared.current_person_id();
begin
  if v_org is null or v_person is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_notice_version is distinct from ops._attendance_notice_version() then raise exception 'STAFF_NOTICE_STALE' using errcode = '22023'; end if;
  if p_language is null or p_language not in ('en', 'id') then raise exception 'STAFF_CONSENT_INVALID' using errcode = '22023'; end if;
  insert into ops.attendance_consents (org_id, person_id, notice_version, language, accepted_at)
  values (v_org, v_person, p_notice_version, p_language, ops._attendance_now())
  on conflict (org_id, person_id, notice_version) do nothing;
end;
$$;
revoke execute on function ops.record_attendance_consent(text, text) from public, anon;
grant execute on function ops.record_attendance_consent(text, text) to authenticated;

-- ── Clock in and out ──────────────────────────────────────────────────────────────────────────
create or replace function ops.begin_attendance_clock_in(p_shift_start_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_person uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now();
  v_shift record; v_set ops.attendance_settings; v_id uuid;
begin
  if v_org is null or v_person is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_shift_start_at is null then raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023'; end if;
  select s.* into v_shift from ops._attendance_shifts_between(v_org, p_shift_start_at, p_shift_start_at + interval '1 second') s
   where s.person_id = v_person and s.start_at = p_shift_start_at limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_shift'); end if;
  if not exists (select 1 from ops.attendance_consents c where c.org_id = v_org and c.person_id = v_person and c.notice_version = ops._attendance_notice_version()) then
    return jsonb_build_object('ok', false, 'reason', 'consent_needed', 'notice_version', ops._attendance_notice_version());
  end if;
  v_set := ops._attendance_settings_at(v_org, v_shift.start_at);
  if v_now < v_shift.start_at - v_set.clock_in_open_min * interval '1 minute' then
    return jsonb_build_object('ok', false, 'reason', 'too_early', 'opens_at', v_shift.start_at - v_set.clock_in_open_min * interval '1 minute');
  end if;
  if v_now >= v_shift.end_at then return jsonb_build_object('ok', false, 'reason', 'shift_over'); end if;
  insert into ops.attendance_records (org_id, person_id, team_id, site_id, shift_start_at, shift_end_at, created_at, updated_at)
  values (v_org, v_person, v_shift.team_id, v_shift.site_id, v_shift.start_at, v_shift.end_at, v_now, v_now)
  on conflict (org_id, person_id, shift_start_at) do update set created_at = v_now, updated_at = v_now
    where ops.attendance_records.status = 'pending'
  returning id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'already_in'); end if;
  return jsonb_build_object('ok', true, 'attempt_id', v_id, 'org_id', v_org, 'shift_end_at', v_shift.end_at);
end;
$$;
revoke execute on function ops.begin_attendance_clock_in(timestamptz) from public, anon;
grant execute on function ops.begin_attendance_clock_in(timestamptz) to authenticated;

-- The position and accuracy tests shared by clock-in and clock-out. NULL means accepted.
create or replace function ops._attendance_position_refusal(
  p_site_id uuid, p_org_id uuid, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision,
  p_max_accuracy_m integer, p_radius_m integer
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_site shared.sites; v_dist double precision;
begin
  select * into v_site from shared.sites where id = p_site_id and org_id = p_org_id;
  if not found or v_site.latitude is null or v_site.longitude is null then
    return jsonb_build_object('ok', false, 'reason', 'site_not_set');
  end if;
  if p_accuracy_m > p_max_accuracy_m then
    return jsonb_build_object('ok', false, 'reason', 'weak_gps', 'accuracy_m', round(p_accuracy_m::numeric), 'max_accuracy_m', p_max_accuracy_m);
  end if;
  v_dist := ops._attendance_distance_m(p_latitude, p_longitude, v_site.latitude, v_site.longitude);
  if v_dist > coalesce(p_radius_m, v_site.attendance_radius_m) then
    return jsonb_build_object('ok', false, 'reason', 'too_far', 'distance_m', round(v_dist::numeric), 'radius_m', coalesce(p_radius_m, v_site.attendance_radius_m));
  end if;
  return null;
end;
$$;
revoke execute on function ops._attendance_position_refusal(uuid, uuid, double precision, double precision, double precision, integer, integer) from public, anon, authenticated;

create or replace function ops.clock_in_attendance(
  p_attempt_id uuid, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_person uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now();
  r ops.attendance_records; v_set ops.attendance_settings; v_site shared.sites; v_path text; v_refusal jsonb;
  v_dist double precision; v_late boolean; v_minutes integer;
begin
  if v_org is null or v_person is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_attempt_id is null or p_latitude is null or p_longitude is null or p_accuracy_m is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_accuracy_m < 0 then
    raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023';
  end if;
  select * into r from ops.attendance_records where id = p_attempt_id and org_id = v_org and person_id = v_person for update;
  if not found then raise exception 'STAFF_ATTEMPT_INVALID' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'STAFF_CLOCK_ALREADY' using errcode = '23505'; end if;
  if r.created_at <= v_now - interval '15 minutes' then raise exception 'STAFF_ATTEMPT_EXPIRED' using errcode = '22023'; end if;
  if not exists (select 1 from ops.attendance_consents c where c.org_id = v_org and c.person_id = v_person and c.notice_version = ops._attendance_notice_version()) then
    return jsonb_build_object('ok', false, 'reason', 'consent_needed', 'notice_version', ops._attendance_notice_version());
  end if;
  v_set := ops._attendance_settings_at(v_org, r.shift_start_at);
  if v_now < r.shift_start_at - v_set.clock_in_open_min * interval '1 minute' then
    return jsonb_build_object('ok', false, 'reason', 'too_early', 'opens_at', r.shift_start_at - v_set.clock_in_open_min * interval '1 minute');
  end if;
  if v_now >= r.shift_end_at then return jsonb_build_object('ok', false, 'reason', 'shift_over'); end if;
  select o.name into v_path from storage.objects o
   where o.bucket_id = 'attendance-selfies' and o.name like v_org::text || '/' || p_attempt_id::text || '/%'
   order by o.created_at desc limit 1;
  if v_path is null then return jsonb_build_object('ok', false, 'reason', 'photo_needed'); end if;
  select * into v_site from shared.sites where id = r.site_id and org_id = v_org;
  v_refusal := ops._attendance_position_refusal(r.site_id, v_org, p_latitude, p_longitude, p_accuracy_m, v_set.max_accuracy_m, null);
  if v_refusal is not null then return v_refusal; end if;
  v_dist := ops._attendance_distance_m(p_latitude, p_longitude, v_site.latitude, v_site.longitude);
  v_late := v_now > r.shift_start_at + v_set.late_grace_min * interval '1 minute';
  v_minutes := case when v_late then floor(extract(epoch from (v_now - r.shift_start_at)) / 60)::integer else 0 end;
  update ops.attendance_records set status = 'in', clock_in_at = v_now,
    in_latitude = p_latitude, in_longitude = p_longitude, in_accuracy_m = p_accuracy_m, in_distance_m = v_dist,
    selfie_path = v_path, selfie_captured_at = v_now, radius_m = v_site.attendance_radius_m, grace_min = v_set.late_grace_min,
    late = v_late, late_minutes = case when v_late then v_minutes else null end, updated_at = v_now
   where id = r.id;
  return jsonb_build_object('ok', true, 'record_id', r.id, 'status', 'in', 'clock_in_at', v_now, 'late', v_late, 'late_minutes', case when v_late then v_minutes else null end);
end;
$$;
revoke execute on function ops.clock_in_attendance(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function ops.clock_in_attendance(uuid, double precision, double precision, double precision) to authenticated;

create or replace function ops.clock_out_attendance(
  p_record_id uuid, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_person uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now();
  r ops.attendance_records; v_set ops.attendance_settings; v_site shared.sites; v_refusal jsonb; v_dist double precision;
  v_early boolean; v_minutes integer;
begin
  if v_org is null or v_person is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_record_id is null or p_latitude is null or p_longitude is null or p_accuracy_m is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 or p_accuracy_m < 0 then
    raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023';
  end if;
  select * into r from ops.attendance_records where id = p_record_id and org_id = v_org and person_id = v_person for update;
  if not found or r.status = 'pending' then raise exception 'STAFF_ATTEMPT_INVALID' using errcode = 'P0002'; end if;
  if r.status = 'closed' then return jsonb_build_object('ok', false, 'reason', 'closed'); end if;
  if r.status = 'out' then raise exception 'STAFF_CLOCK_ALREADY' using errcode = '23505'; end if;
  v_set := ops._attendance_settings_at(v_org, r.shift_start_at);
  v_refusal := ops._attendance_position_refusal(r.site_id, v_org, p_latitude, p_longitude, p_accuracy_m, v_set.max_accuracy_m, r.radius_m);
  if v_refusal is not null then return v_refusal; end if;
  select * into v_site from shared.sites where id = r.site_id and org_id = v_org;
  v_dist := ops._attendance_distance_m(p_latitude, p_longitude, v_site.latitude, v_site.longitude);
  v_early := v_now < r.shift_end_at;
  v_minutes := case when v_early then ceil(extract(epoch from (r.shift_end_at - v_now)) / 60)::integer else 0 end;
  update ops.attendance_records set status = 'out', clock_out_at = v_now,
    out_latitude = p_latitude, out_longitude = p_longitude, out_accuracy_m = p_accuracy_m, out_distance_m = v_dist,
    early_leave = v_early, early_minutes = case when v_early then v_minutes else null end, updated_at = v_now
   where id = r.id;
  return jsonb_build_object('ok', true, 'record_id', r.id, 'status', 'out', 'clock_out_at', v_now, 'early_leave', v_early, 'early_minutes', case when v_early then v_minutes else null end);
end;
$$;
revoke execute on function ops.clock_out_attendance(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function ops.clock_out_attendance(uuid, double precision, double precision, double precision) to authenticated;

-- ── The Person's clock screen ─────────────────────────────────────────────────────────────────
create or replace function ops.get_my_clock_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_person uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now(); v_result jsonb;
begin
  if v_org is null or v_person is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'start_at', s.start_at, 'end_at', s.end_at, 'local_date', s.local_date, 'template_name', s.template_name,
      'site_id', s.site_id, 'site_name', site.name, 'team_name', team.name,
      'opens_at', s.start_at - cfg.clock_in_open_min * interval '1 minute',
      'site_ready', site.latitude is not null, 'radius_m', site.attendance_radius_m, 'max_accuracy_m', cfg.max_accuracy_m,
      'record', case when rec.id is null or rec.status = 'pending' then null else jsonb_build_object(
        'id', rec.id, 'status', rec.status, 'late', rec.late, 'late_minutes', rec.late_minutes, 'early_leave', rec.early_leave,
        'early_minutes', rec.early_minutes, 'closure', rec.closure, 'clock_in_at', rec.clock_in_at, 'clock_out_at', rec.clock_out_at) end
    ) order by s.start_at), '[]'::jsonb)
  into v_result
  from ops._attendance_shifts_between(v_org, v_now - interval '36 hours', v_now + interval '14 hours') s
  join shared.sites site on site.id = s.site_id and site.org_id = v_org
  join shared.teams team on team.id = s.team_id and team.org_id = v_org
  cross join lateral ops._attendance_settings_at(v_org, s.start_at) cfg
  left join ops.attendance_records rec on rec.org_id = v_org and rec.person_id = v_person and rec.shift_start_at = s.start_at
  where s.person_id = v_person and s.end_at > v_now - interval '12 hours' and s.start_at < v_now + interval '12 hours';
  return jsonb_build_object('notice_version', ops._attendance_notice_version(),
    'consented', exists (select 1 from ops.attendance_consents c where c.org_id = v_org and c.person_id = v_person and c.notice_version = ops._attendance_notice_version()),
    'now', v_now, 'shifts', v_result);
end;
$$;
revoke execute on function ops.get_my_clock_state() from public, anon;
grant execute on function ops.get_my_clock_state() to authenticated;

-- ── Lead, hr and admin views and corrections ──────────────────────────────────────────────────
create or replace function ops.list_team_attendance(p_team_id uuid, p_local_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_now timestamptz := ops._attendance_now(); v_result jsonb;
begin
  if v_org is null or shared.current_person_id() is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_team_id is null or p_local_date is null then raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023'; end if;
  if not exists (select 1 from shared.teams t where t.id = p_team_id and t.org_id = v_org) then raise exception 'STAFF_TEAM_NOT_FOUND' using errcode = 'P0002'; end if;
  if not ops._attendance_reader_ok(null, p_team_id) then raise exception 'STAFF_ATTENDANCE_FORBIDDEN' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'person_id', s.person_id, 'person_name', p.full_name, 'start_at', s.start_at, 'end_at', s.end_at,
      'status', case
        when rec.status = 'closed' then 'no_clock_out'
        when rec.status = 'out' and rec.early_leave then 'early_leave'
        when rec.status = 'out' then 'out'
        when rec.status = 'in' and rec.late then 'late'
        when rec.status = 'in' then 'in'
        when v_now >= s.start_at + cfg.missing_alert_min * interval '1 minute' then 'missing'
        else 'scheduled' end,
      'record_id', case when rec.status = 'pending' then null else rec.id end,
      'clock_in_at', rec.clock_in_at, 'clock_out_at', rec.clock_out_at, 'late_minutes', rec.late_minutes, 'early_minutes', rec.early_minutes,
      'corrected', rec.source = 'correction'
    ) order by s.start_at, p.full_name), '[]'::jsonb)
  into v_result
  from ops._attendance_shifts_between(v_org, ((p_local_date::timestamp) at time zone 'Asia/Jakarta'), ((p_local_date + 1)::timestamp) at time zone 'Asia/Jakarta') s
  join shared.people p on p.id = s.person_id and p.org_id = v_org
  cross join lateral ops._attendance_settings_at(v_org, s.start_at) cfg
  left join ops.attendance_records rec on rec.org_id = v_org and rec.person_id = s.person_id and rec.shift_start_at = s.start_at
  where s.team_id = p_team_id;
  return v_result;
end;
$$;
revoke execute on function ops.list_team_attendance(uuid, date) from public, anon;
grant execute on function ops.list_team_attendance(uuid, date) to authenticated;

create or replace function ops.get_attendance_record(p_record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); r ops.attendance_records;
begin
  if v_org is null or shared.current_person_id() is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select * into r from ops.attendance_records where id = p_record_id and org_id = v_org;
  if not found or r.status = 'pending' or not ops._attendance_reader_ok(r.person_id, r.team_id) then raise exception 'STAFF_ATTENDANCE_FORBIDDEN' using errcode = '42501'; end if;
  return jsonb_build_object('id', r.id, 'person_id', r.person_id, 'status', r.status, 'shift_start_at', r.shift_start_at, 'shift_end_at', r.shift_end_at,
    'clock_in_at', r.clock_in_at, 'clock_out_at', r.clock_out_at, 'in_distance_m', round(r.in_distance_m::numeric), 'in_accuracy_m', round(r.in_accuracy_m::numeric),
    'out_distance_m', round(r.out_distance_m::numeric), 'late', r.late, 'late_minutes', r.late_minutes, 'early_leave', r.early_leave,
    'early_minutes', r.early_minutes, 'closure', r.closure, 'source', r.source, 'selfie_path', r.selfie_path,
    'history', coalesce((select jsonb_agg(jsonb_build_object('at', h.created_at, 'by', pe.full_name, 'reason', h.reason, 'before', h.before_state, 'after', h.after_state) order by h.created_at)
       from ops.attendance_record_history h join shared.people pe on pe.id = h.changed_by and pe.org_id = h.org_id
      where h.org_id = v_org and h.record_id = r.id), '[]'::jsonb));
end;
$$;
revoke execute on function ops.get_attendance_record(uuid) from public, anon;
grant execute on function ops.get_attendance_record(uuid) to authenticated;

create or replace function ops.correct_attendance_record(
  p_person_id uuid, p_shift_start_at timestamptz, p_clock_in_at timestamptz, p_clock_out_at timestamptz, p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now();
  v_shift record; r ops.attendance_records; v_before jsonb; v_set ops.attendance_settings; v_in timestamptz; v_out timestamptz;
  v_late boolean; v_early boolean; v_status text; v_team uuid; v_id uuid;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'STAFF_REASON_REQUIRED' using errcode = '22023'; end if;
  if p_person_id is null or p_shift_start_at is null then raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023'; end if;
  -- Nobody corrects their own record; a Team lead's own record goes to hr.
  if p_person_id = v_actor and not shared.has_access_role('hr') then raise exception 'STAFF_ATTENDANCE_FORBIDDEN' using errcode = '42501'; end if;
  select * into r from ops.attendance_records where org_id = v_org and person_id = p_person_id and shift_start_at = p_shift_start_at for update;
  if found then
    v_team := r.team_id;
  else
    select s.* into v_shift from ops._attendance_shifts_between(v_org, p_shift_start_at, p_shift_start_at + interval '1 second') s
     where s.person_id = p_person_id and s.start_at = p_shift_start_at limit 1;
    if not found then raise exception 'STAFF_SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
    v_team := v_shift.team_id;
  end if;
  if not (shared.has_access_role('hr') or shared.is_designated_team_lead(v_team, v_actor)) then raise exception 'STAFF_ATTENDANCE_FORBIDDEN' using errcode = '42501'; end if;
  v_in := coalesce(p_clock_in_at, r.clock_in_at);
  v_out := coalesce(p_clock_out_at, r.clock_out_at);
  if v_in is null then raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023'; end if;
  if v_out is not null and v_out <= v_in then raise exception 'STAFF_CLOCK_INVALID' using errcode = '22023'; end if;
  v_set := ops._attendance_settings_at(v_org, p_shift_start_at);
  v_status := case when v_out is not null then 'out' when r.status = 'closed' then 'closed' else 'in' end;
  if r.id is null then
    insert into ops.attendance_records (org_id, person_id, team_id, site_id, shift_start_at, shift_end_at, status, clock_in_at, clock_out_at,
      grace_min, late, late_minutes, early_leave, early_minutes, source, created_at, updated_at)
    values (v_org, p_person_id, v_team, v_shift.site_id, v_shift.start_at, v_shift.end_at, v_status, v_in, v_out, v_set.late_grace_min,
      false, null, false, null, 'correction', v_now, v_now)
    returning * into r;
    v_before := null;
  else
    v_before := jsonb_build_object('status', r.status, 'clock_in_at', r.clock_in_at, 'clock_out_at', r.clock_out_at, 'late', r.late,
      'early_leave', r.early_leave, 'closure', r.closure);
  end if;
  v_late := v_in > r.shift_start_at + coalesce(r.grace_min, v_set.late_grace_min) * interval '1 minute';
  v_early := v_out is not null and v_out < r.shift_end_at;
  update ops.attendance_records set status = v_status, clock_in_at = v_in, clock_out_at = v_out,
    late = v_late, late_minutes = case when v_late then floor(extract(epoch from (v_in - r.shift_start_at)) / 60)::integer else null end,
    early_leave = v_early, early_minutes = case when v_early then ceil(extract(epoch from (r.shift_end_at - v_out)) / 60)::integer else null end,
    closure = case when v_out is not null then null else r.closure end, source = 'correction', updated_at = v_now
   where id = r.id returning id into v_id;
  insert into ops.attendance_record_history (org_id, record_id, changed_by, reason, before_state, after_state, created_at)
  select v_org, rec.id, v_actor, btrim(p_reason), v_before,
    jsonb_build_object('status', rec.status, 'clock_in_at', rec.clock_in_at, 'clock_out_at', rec.clock_out_at, 'late', rec.late,
      'early_leave', rec.early_leave, 'closure', rec.closure), v_now
    from ops.attendance_records rec where rec.id = v_id;
  return v_id;
end;
$$;
revoke execute on function ops.correct_attendance_record(uuid, timestamptz, timestamptz, timestamptz, text) from public, anon;
grant execute on function ops.correct_attendance_record(uuid, timestamptz, timestamptz, timestamptz, text) to authenticated;

-- ── Timed jobs: missing clock-in, no clock-out, abandoned captures, selfie retention ──────────
create or replace function ops._attendance_alert_recipients(p_org_id uuid, p_team_id uuid)
returns table (person_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select a.lead_person_id from shared.team_lead_assignments a
    join shared.people p on p.id = a.lead_person_id and p.org_id = a.org_id and p.archived_at is null
   where a.org_id = p_org_id and a.team_id = p_team_id
  union
  select par.person_id from shared.person_access_roles par
    join shared.people p on p.id = par.person_id and p.org_id = par.org_id and p.archived_at is null
   where par.org_id = p_org_id and par.access_role::text = 'hr'
     and not exists (select 1 from shared.team_lead_assignments a where a.org_id = p_org_id and a.team_id = p_team_id)
$$;
revoke execute on function ops._attendance_alert_recipients(uuid, uuid) from public, anon, authenticated;

create or replace function ops.run_attendance_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := ops._attendance_now(); v_org record; v_row record; v_rcpt record; v_name text;
  v_missing integer := 0; v_closed integer := 0; v_pending integer := 0; v_selfies integer := 0; v_locations integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended('ops-attendance-jobs', 0));
  for v_org in select id from shared.orgs loop
    -- Missing clock-in: the shift started missing_alert_min ago, is still running, and has no clock-in or absence.
    for v_row in
      select s.person_id, s.team_id, s.start_at, s.end_at
        from ops._attendance_shifts_between(v_org.id, v_now - interval '1 day', v_now) s
        cross join lateral ops._attendance_settings_at(v_org.id, s.start_at) cfg
       where s.start_at + cfg.missing_alert_min * interval '1 minute' <= v_now and s.end_at > v_now
         and not exists (select 1 from ops.attendance_records r where r.org_id = v_org.id and r.person_id = s.person_id
                           and r.shift_start_at = s.start_at and r.status <> 'pending')
         and not ops._attendance_has_absence(v_org.id, s.person_id, s.start_at)
    loop
      insert into ops.attendance_alerts (org_id, kind, person_id, shift_start_at, created_at)
      values (v_org.id, 'missing', v_row.person_id, v_row.start_at, v_now) on conflict do nothing;
      if found then
        v_missing := v_missing + 1;
        select full_name into v_name from shared.people where id = v_row.person_id;
        for v_rcpt in select person_id from ops._attendance_alert_recipients(v_org.id, v_row.team_id) loop
          insert into mos.notifications (org_id, owner_id, severity, title, body, metadata)
          values (v_org.id, v_rcpt.person_id, 'warning', v_name || ' has not clocked in / ' || v_name || ' belum mencatat masuk',
            'No clock-in or absence 30 minutes into the shift. / Belum ada catatan masuk atau ketidakhadiran setelah shift berjalan.',
            jsonb_build_object('source', 'staff_attendance', 'kind', 'missing', 'entity', jsonb_build_object('type', 'staff_attendance', 'id', v_row.person_id, 'route', '/work/shifts')));
        end loop;
      end if;
    end loop;

    -- No clock-out: close the record once the shift ended no_clockout_close_min ago and ask the lead to correct it.
    for v_row in
      select r.id, r.person_id, r.team_id, r.shift_start_at
        from ops.attendance_records r
        cross join lateral ops._attendance_settings_at(r.org_id, r.shift_start_at) cfg
       where r.org_id = v_org.id and r.status = 'in' and r.clock_out_at is null
         and r.shift_end_at + cfg.no_clockout_close_min * interval '1 minute' <= v_now
         for update of r
    loop
      update ops.attendance_records set status = 'closed', closure = 'no_clock_out', updated_at = v_now where id = v_row.id;
      v_closed := v_closed + 1;
      insert into ops.attendance_alerts (org_id, kind, person_id, shift_start_at, created_at)
      values (v_org.id, 'no_clock_out', v_row.person_id, v_row.shift_start_at, v_now) on conflict do nothing;
      if found then
        select full_name into v_name from shared.people where id = v_row.person_id;
        for v_rcpt in select person_id from ops._attendance_alert_recipients(v_org.id, v_row.team_id) loop
          insert into mos.notifications (org_id, owner_id, severity, title, body, metadata)
          values (v_org.id, v_rcpt.person_id, 'info', v_name || ' did not clock out / ' || v_name || ' tidak mencatat pulang',
            'The record was closed as no clock-out; please correct it with a reason. / Catatan ditutup tanpa catatan pulang; mohon koreksi dengan alasan.',
            jsonb_build_object('source', 'staff_attendance', 'kind', 'no_clock_out', 'entity', jsonb_build_object('type', 'staff_attendance', 'id', v_row.id, 'route', '/work/shifts')));
        end loop;
      end if;
    end loop;

    -- Abandoned capture attempts and the images uploaded to them.
    insert into ops.attendance_selfie_purge_queue (path, org_id, queued_at)
    select o.name, v_org.id, v_now from storage.objects o
     where o.bucket_id = 'attendance-selfies' and o.name like v_org.id::text || '/%'
       and exists (select 1 from ops.attendance_records r where r.org_id = v_org.id and r.status = 'pending'
                     and r.created_at <= v_now - interval '1 hour' and r.id = ops.attendance_selfie_record_id(o.name))
    on conflict do nothing;
    with gone as (delete from ops.attendance_records r where r.org_id = v_org.id and r.status = 'pending'
                    and r.created_at <= v_now - interval '1 hour' returning 1)
    select v_pending + count(*) into v_pending from gone;

    -- Selfie retention: clear the reference at once and queue the object for the Storage API worker.
    for v_row in
      select r.id, r.selfie_path
        from ops.attendance_records r
        cross join lateral ops._attendance_settings_at(r.org_id, v_now) cfg
       where r.org_id = v_org.id and r.selfie_path is not null
         and r.selfie_captured_at <= v_now - cfg.selfie_retention_days * interval '1 day'
         for update of r
    loop
      insert into ops.attendance_selfie_purge_queue (path, org_id, queued_at) values (v_row.selfie_path, v_org.id, v_now) on conflict do nothing;
      update ops.attendance_records set selfie_path = null, selfie_purged_at = v_now, updated_at = v_now where id = v_row.id;
      v_selfies := v_selfies + 1;
    end loop;

    -- Location retention: coordinates, accuracy and distance are wiped after 6 months (owner, 2026-10-21); times and flags stay.
    with wiped as (update ops.attendance_records r
         set in_latitude = null, in_longitude = null, in_accuracy_m = null, in_distance_m = null,
             out_latitude = null, out_longitude = null, out_accuracy_m = null, out_distance_m = null, updated_at = v_now
       where r.org_id = v_org.id and r.created_at <= v_now - interval '6 months'
         and (r.in_latitude is not null or r.out_latitude is not null or r.in_distance_m is not null or r.out_distance_m is not null)
       returning 1)
    select v_locations + count(*) into v_locations from wiped;
  end loop;
  return jsonb_build_object('missing_alerts', v_missing, 'closed_no_clock_out', v_closed, 'abandoned_attempts', v_pending, 'selfies_queued', v_selfies, 'locations_cleared', v_locations);
end;
$$;
revoke execute on function ops.run_attendance_jobs() from public, anon, authenticated;
grant execute on function ops.run_attendance_jobs() to service_role;

create or replace function ops.claim_attendance_selfie_purge(p_limit integer default 100)
returns table (path text)
language sql
stable
security definer
set search_path = ''
as $$
  select q.path from ops.attendance_selfie_purge_queue q where q.deleted_at is null order by q.queued_at limit greatest(1, least(coalesce(p_limit, 100), 500))
$$;
revoke execute on function ops.claim_attendance_selfie_purge(integer) from public, anon, authenticated;
grant execute on function ops.claim_attendance_selfie_purge(integer) to service_role;

create or replace function ops.confirm_attendance_selfie_purged(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update ops.attendance_selfie_purge_queue set deleted_at = ops._attendance_now() where path = any(p_paths) and deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function ops.confirm_attendance_selfie_purged(text[]) from public, anon, authenticated;
grant execute on function ops.confirm_attendance_selfie_purged(text[]) to service_role;

-- Every five minutes on the database scheduler. Skipped, not failed, where pg_cron is unavailable.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('ops-attendance-jobs', '*/5 * * * *', 'select ops.run_attendance_jobs()');
  else
    raise notice 'pg_cron is not available; schedule ops.run_attendance_jobs() every 5 minutes by hand';
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$$;
