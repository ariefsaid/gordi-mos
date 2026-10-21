-- Staff attendance stage 2: absences, shift offers and claims, the doctor's-note bucket, the cover queue,
-- HR views and the per-org attendance settings. Every write is a checked SECURITY DEFINER action;
-- the tables stay closed to direct access. Timed jobs live in 20261022012000.
-- DOWN: supabase/rollbacks/20261022011000_ops_staff_absence_cover.sql (refuses while any absence or cover history exists).

-- ── No-show switch: no one is recorded as a no-show until an admin says clock-in is in use ───────
-- Alert windows and the leave cutoff come from the attendance settings (stage 3 owns that table);
-- until it exists the documented defaults apply.
create table ops.staff_cover_config (
  org_id uuid primary key references shared.orgs(id) on delete cascade,
  noshow_recording_from timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint staff_cover_config_updater_same_org_fk foreign key (org_id, updated_by)
    references shared.people (org_id, id) on delete restrict
);
comment on table ops.staff_cover_config is 'Per-org switch for the no-show job: shifts that start at or after noshow_recording_from are judged; null means off, so nobody is marked absent before clock-in is in use.';
alter table ops.staff_cover_config enable row level security;
alter table ops.staff_cover_config force row level security;
create policy staff_cover_config_read on ops.staff_cover_config for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.has_access_role('admin')));
revoke all on ops.staff_cover_config from public, anon, authenticated;

-- ── Shift provenance: a cover assignment records who it covered for ──────────────────────────────
alter table ops.staff_shifts
  add column origin text not null default 'roster' check (origin in ('roster','cover')),
  add column cover_for_person_id uuid;
alter table ops.staff_shifts add constraint staff_shifts_cover_for_same_org_fk
  foreign key (org_id, cover_for_person_id) references shared.people (org_id, id) on delete restrict;

-- ── Absences ─────────────────────────────────────────────────────────────────────────────────────
create table ops.staff_absences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  person_id uuid not null,
  team_id uuid not null,
  site_id uuid not null,
  shift_id uuid,
  local_date date not null,
  shift_start_at timestamptz not null,
  shift_end_at timestamptz not null,
  kind text not null check (kind in ('sick','permission','leave')),
  status text not null check (status in ('accepted','pending','approved','rejected','withdrawn')),
  flagged boolean not null default false,
  reason text check (reason is null or char_length(reason) <= 500),
  note_path text,
  note_added_at timestamptz,
  recorded_by uuid not null,
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_absences_org_id_id_uk unique (org_id, id),
  constraint staff_absences_person_same_org_fk foreign key (org_id, person_id) references shared.people (org_id, id) on delete restrict,
  constraint staff_absences_team_same_org_fk foreign key (org_id, team_id) references shared.teams (org_id, id) on delete restrict,
  constraint staff_absences_site_same_org_fk foreign key (org_id, site_id) references shared.sites (org_id, id) on delete restrict,
  constraint staff_absences_shift_same_org_fk foreign key (org_id, shift_id) references ops.staff_shifts (org_id, id) on delete restrict,
  constraint staff_absences_recorder_same_org_fk foreign key (org_id, recorded_by) references shared.people (org_id, id) on delete restrict,
  constraint staff_absences_decider_same_org_fk foreign key (org_id, decided_by) references shared.people (org_id, id) on delete restrict,
  constraint staff_absences_bounds_ck check (shift_end_at > shift_start_at),
  constraint staff_absences_flag_ck check (not flagged or kind = 'sick'),
  constraint staff_absences_note_ck check (note_path is null or kind = 'sick')
);
create unique index staff_absences_live_uk on ops.staff_absences (org_id, person_id, shift_start_at)
  where status in ('accepted','pending','approved');
create index staff_absences_team_date_idx on ops.staff_absences (org_id, team_id, local_date desc);
create index staff_absences_person_date_idx on ops.staff_absences (org_id, person_id, local_date desc);
create index staff_absences_pending_idx on ops.staff_absences (org_id, team_id) where status = 'pending';
comment on table ops.staff_absences is 'A reported absence for one shift occurrence (a rostered shift or a standing-hours day). Sick same-day is accepted and flagged at once; permission and leave wait for the Team lead.';

-- ── Cover: offers and claims ─────────────────────────────────────────────────────────────────────
create table ops.staff_shift_offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  shift_id uuid not null,
  kind text not null check (kind in ('absence','swap')),
  absence_id uuid,
  offered_by uuid not null,
  status text not null default 'open' check (status in ('open','claimed','filled','cancelled')),
  filled_by uuid,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint staff_shift_offers_org_id_id_uk unique (org_id, id),
  constraint staff_shift_offers_shift_same_org_fk foreign key (org_id, shift_id) references ops.staff_shifts (org_id, id) on delete restrict,
  constraint staff_shift_offers_absence_same_org_fk foreign key (org_id, absence_id) references ops.staff_absences (org_id, id) on delete restrict,
  constraint staff_shift_offers_offerer_same_org_fk foreign key (org_id, offered_by) references shared.people (org_id, id) on delete restrict,
  constraint staff_shift_offers_filler_same_org_fk foreign key (org_id, filled_by) references shared.people (org_id, id) on delete restrict,
  constraint staff_shift_offers_kind_ck check ((kind = 'absence') = (absence_id is not null)),
  constraint staff_shift_offers_closed_ck check ((status in ('filled','cancelled')) = (closed_at is not null))
);
create unique index staff_shift_offers_live_uk on ops.staff_shift_offers (org_id, shift_id) where status in ('open','claimed');
create index staff_shift_offers_open_idx on ops.staff_shift_offers (org_id, status);

create table ops.staff_shift_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  offer_id uuid not null,
  claimant_id uuid not null,
  status text not null default 'pending' check (status in ('pending','confirmed','declined','withdrawn','void')),
  decided_by uuid,
  decided_at timestamptz,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  constraint staff_shift_claims_org_id_id_uk unique (org_id, id),
  constraint staff_shift_claims_offer_same_org_fk foreign key (org_id, offer_id) references ops.staff_shift_offers (org_id, id) on delete restrict,
  constraint staff_shift_claims_claimant_same_org_fk foreign key (org_id, claimant_id) references shared.people (org_id, id) on delete restrict,
  constraint staff_shift_claims_decider_same_org_fk foreign key (org_id, decided_by) references shared.people (org_id, id) on delete restrict
);
-- The backstop for "first claim wins": at most one pending claim per offer, whatever the callers do.
create unique index staff_shift_claims_one_pending_uk on ops.staff_shift_claims (org_id, offer_id) where status = 'pending';
create index staff_shift_claims_claimant_idx on ops.staff_shift_claims (org_id, claimant_id, status);

-- ── Timed-job bookkeeping: one alert per shift per kind; one recorded no-show per shift ──────────
create table ops.staff_shift_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  shift_id uuid not null,
  kind text not null check (kind in ('uncovered')),
  created_at timestamptz not null default now(),
  constraint staff_shift_alerts_once_uk unique (org_id, shift_id, kind),
  constraint staff_shift_alerts_shift_same_org_fk foreign key (org_id, shift_id) references ops.staff_shifts (org_id, id) on delete restrict
);
create table ops.staff_shift_outcomes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references shared.orgs(id) on delete cascade,
  person_id uuid not null,
  team_id uuid not null,
  shift_start_at timestamptz not null,
  shift_end_at timestamptz not null,
  local_date date not null,
  outcome text not null check (outcome in ('no_show')),
  recorded_at timestamptz not null default now(),
  constraint staff_shift_outcomes_once_uk unique (org_id, person_id, shift_start_at),
  constraint staff_shift_outcomes_person_same_org_fk foreign key (org_id, person_id) references shared.people (org_id, id) on delete restrict,
  constraint staff_shift_outcomes_team_same_org_fk foreign key (org_id, team_id) references shared.teams (org_id, id) on delete restrict
);

alter table ops.staff_absences enable row level security;
alter table ops.staff_absences force row level security;
alter table ops.staff_shift_offers enable row level security;
alter table ops.staff_shift_offers force row level security;
alter table ops.staff_shift_claims enable row level security;
alter table ops.staff_shift_claims force row level security;
alter table ops.staff_shift_alerts enable row level security;
alter table ops.staff_shift_alerts force row level security;
alter table ops.staff_shift_outcomes enable row level security;
alter table ops.staff_shift_outcomes force row level security;

-- Reads: the Person concerned, the designated lead of the record's Team, hr/admin through the named grant.
create policy staff_absences_read on ops.staff_absences for select to authenticated
  using (org_id = (select shared.current_org_id()) and (
    person_id = (select shared.current_person_id()) or (select shared.can('attendance.read_all'))
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))));
create policy staff_shift_offers_read on ops.staff_shift_offers for select to authenticated
  using (org_id = (select shared.current_org_id()) and (
    offered_by = (select shared.current_person_id()) or (select shared.can('attendance.read_all'))
    or exists (select 1 from ops.staff_shifts s where s.org_id = staff_shift_offers.org_id and s.id = staff_shift_offers.shift_id
      and shared.is_designated_team_lead(s.team_id, (select shared.current_person_id())))));
create policy staff_shift_claims_read on ops.staff_shift_claims for select to authenticated
  using (org_id = (select shared.current_org_id()) and (
    claimant_id = (select shared.current_person_id()) or (select shared.can('attendance.read_all'))
    or exists (select 1 from ops.staff_shift_offers o join ops.staff_shifts s on s.org_id = o.org_id and s.id = o.shift_id
      where o.org_id = staff_shift_claims.org_id and o.id = staff_shift_claims.offer_id
        and shared.is_designated_team_lead(s.team_id, (select shared.current_person_id())))));
create policy staff_shift_alerts_read on ops.staff_shift_alerts for select to authenticated
  using (org_id = (select shared.current_org_id()) and (select shared.can('attendance.read_all')));
create policy staff_shift_outcomes_read on ops.staff_shift_outcomes for select to authenticated
  using (org_id = (select shared.current_org_id()) and (
    person_id = (select shared.current_person_id()) or (select shared.can('attendance.read_all'))
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))));
revoke all on ops.staff_absences, ops.staff_shift_offers, ops.staff_shift_claims,
  ops.staff_shift_alerts, ops.staff_shift_outcomes from public, anon, authenticated;

-- hr reads every Team's shifts and rosters (ADR-0063); writes stay with the Team lead and admin.
drop policy staff_rosters_read on ops.staff_rosters;
create policy staff_rosters_read on ops.staff_rosters for select to authenticated
  using (org_id = (select shared.current_org_id()) and ((select shared.can('attendance.read_all'))
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))));
drop policy staff_shifts_read on ops.staff_shifts;
create policy staff_shifts_read on ops.staff_shifts for select to authenticated
  using (org_id = (select shared.current_org_id()) and ((select shared.can('attendance.read_all'))
    or person_id = (select shared.current_person_id())
    or shared.is_designated_team_lead(team_id, (select shared.current_person_id()))));

-- ── Internal helpers (not callable by clients) ───────────────────────────────────────────────────
create or replace function ops._attendance_setting(p_org uuid, p_key text)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_json jsonb;
begin
  -- Stage 3 owns the versioned settings; when its reader exists it supplies the values, else the defaults hold.
  if to_regprocedure('ops._attendance_settings_at(uuid,timestamp with time zone)') is not null then
    execute 'select to_jsonb(ops._attendance_settings_at($1, $2))' into v_json using p_org, ops._attendance_now();
    if v_json ->> (case p_key when 'uncovered_alert_minutes' then 'uncovered_alert_min' else p_key end) is not null then
      return (v_json ->> (case p_key when 'uncovered_alert_minutes' then 'uncovered_alert_min' else p_key end))::integer;
    end if;
  end if;
  return case p_key when 'leave_cutoff_days' then 3 when 'uncovered_alert_minutes' then 120 else null end;
end;
$$;
revoke execute on function ops._attendance_setting(uuid,text) from public, anon, authenticated;

create or replace function ops._attendance_notify(
  p_org uuid, p_owner uuid, p_severity text, p_title text, p_body text, p_entity_type text, p_entity_id uuid, p_route text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner is null or not exists (select 1 from shared.people where id = p_owner and org_id = p_org and archived_at is null) then
    return;
  end if;
  insert into mos.notifications (org_id, owner_id, severity, title, body, metadata)
  values (p_org, p_owner, p_severity, p_title, p_body,
    jsonb_build_object('source','staff_attendance','entity',jsonb_build_object('type',p_entity_type,'id',p_entity_id,'route',p_route)));
end;
$$;
revoke execute on function ops._attendance_notify(uuid,uuid,text,text,text,text,uuid,text) from public, anon, authenticated;

-- Who receives a Team's requests and alerts: its designated lead(s), else every hr holder (FR-022).
-- Takes the org explicitly so the timed jobs, which have no session, use it too.
create or replace function ops._attendance_recipients(p_org uuid, p_team uuid, p_except uuid default null)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from shared.team_lead_assignments a
              join shared.people p on p.org_id = a.org_id and p.id = a.lead_person_id and p.archived_at is null
              join shared.teams t on t.org_id = a.org_id and t.id = a.team_id and t.archived_at is null
             where a.org_id = p_org and a.team_id = p_team and a.lead_person_id is distinct from p_except) then
    return query select a.lead_person_id from shared.team_lead_assignments a
      join shared.people p on p.org_id = a.org_id and p.id = a.lead_person_id and p.archived_at is null
      join shared.teams t on t.org_id = a.org_id and t.id = a.team_id and t.archived_at is null
     where a.org_id = p_org and a.team_id = p_team and a.lead_person_id is distinct from p_except;
  elsif not exists (select 1 from shared.team_lead_assignments a
              join shared.people p on p.org_id = a.org_id and p.id = a.lead_person_id and p.archived_at is null
             where a.org_id = p_org and a.team_id = p_team) then
    return query select distinct par.person_id from shared.person_access_roles par
      join shared.people p on p.org_id = par.org_id and p.id = par.person_id and p.archived_at is null
     where par.org_id = p_org and par.access_role = 'hr' and par.revoked_at is null and par.person_id is distinct from p_except;
  end if;
end;
$$;
revoke execute on function ops._attendance_recipients(uuid,uuid,uuid) from public, anon, authenticated;

create or replace function ops._attendance_notify_team(
  p_org uuid, p_team uuid, p_except uuid, p_severity text, p_title text, p_body text, p_entity_type text, p_entity_id uuid, p_route text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_person uuid;
begin
  for v_person in select r from ops._attendance_recipients(p_org, p_team, p_except) as r loop
    perform ops._attendance_notify(p_org, v_person, p_severity, p_title, p_body, p_entity_type, p_entity_id, p_route);
  end loop;
end;
$$;
revoke execute on function ops._attendance_notify_team(uuid,uuid,uuid,text,text,text,text,uuid,text) from public, anon, authenticated;

-- A caller who may decide for a Team: its designated lead or an admin. hr alone may not (ADR-0063).
create or replace function ops._attendance_can_lead(p_team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select shared.current_org_id() is not null and shared.current_person_id() is not null
     and (shared.has_access_role('admin') or shared.is_designated_team_lead(p_team, shared.current_person_id()))
$$;
revoke execute on function ops._attendance_can_lead(uuid) from public, anon, authenticated;

-- One alert per shift per kind. Returns true only for the call that created it.
create or replace function ops._attendance_alert(p_org uuid, p_shift ops.staff_shifts, p_kind text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into ops.staff_shift_alerts (org_id, shift_id, kind) values (p_org, p_shift.id, p_kind)
  on conflict (org_id, shift_id, kind) do nothing returning id into v_id;
  if v_id is null then return false; end if;
  perform ops._attendance_notify_team(p_org, p_shift.team_id, null, 'warning',
    'Shift still uncovered / Shift belum ada pengganti',
    'A shift on ' || to_char(p_shift.local_date, 'DD Mon') || ' ' || to_char(p_shift.start_at at time zone 'Asia/Jakarta', 'HH24:MI')
      || ' has no cover yet. / Shift tanggal ' || to_char(p_shift.local_date, 'DD Mon') || ' pukul ' || to_char(p_shift.start_at at time zone 'Asia/Jakarta', 'HH24:MI') || ' belum ada pengganti.',
    'staff_shift', p_shift.id, '/work/shifts/inbox');
  return true;
end;
$$;
revoke execute on function ops._attendance_alert(uuid,ops.staff_shifts,text) from public, anon, authenticated;

-- Standing-hours occurrence for one Person on one date, as the personal schedule computes it.
create or replace function ops._attendance_standing_occurrence(p_org uuid, p_team uuid, p_person uuid, p_date date)
returns table (site_id uuid, start_at timestamptz, end_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_def ops.staff_standing_hours; v_ex ops.staff_standing_hours; v_rule ops.staff_standing_hours; v_site uuid;
begin
  if not exists (select 1 from shared.team_memberships m join shared.teams t on t.org_id = m.org_id and t.id = m.team_id and t.archived_at is null
    where m.org_id = p_org and m.team_id = p_team and m.person_id = p_person
      and m.effective_from <= p_date and (m.effective_to is null or m.effective_to >= p_date)) then
    return;
  end if;
  select r.* into v_def from ops.staff_standing_hours r where r.org_id = p_org and r.team_id = p_team and r.person_id is null
    and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date) order by r.effective_from desc limit 1;
  if v_def.id is null then return; end if;
  select r.* into v_ex from ops.staff_standing_hours r where r.org_id = p_org and r.team_id = p_team and r.person_id = p_person
    and r.effective_from <= p_date and (r.effective_to is null or r.effective_to >= p_date) order by r.effective_from desc limit 1;
  v_rule := case when v_ex.id is not null then v_ex else v_def end;
  if not v_rule.active or not ((extract(isodow from p_date)::integer - 1)::smallint = any(v_rule.working_days)) then return; end if;
  select t.site_id into v_site from shared.teams t where t.org_id = p_org and t.id = p_team;
  if v_site is null then return; end if;
  return query select v_site,
    (p_date + v_rule.start_time) at time zone 'Asia/Jakarta',
    ((p_date + v_rule.end_time) + case when v_rule.end_time < v_rule.start_time then interval '1 day' else interval '0 day' end) at time zone 'Asia/Jakarta';
end;
$$;
revoke execute on function ops._attendance_standing_occurrence(uuid,uuid,uuid,date) from public, anon, authenticated;

-- Opens a shift to teammates at the same Site. The original Person stays assigned until it is covered.
create or replace function ops._attendance_open_offer(p_org uuid, p_shift ops.staff_shifts, p_kind text, p_absence uuid, p_offered_by uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_now timestamptz := ops._attendance_now();
begin
  select id into v_id from ops.staff_shift_offers where org_id = p_org and shift_id = p_shift.id and status in ('open','claimed');
  if v_id is not null then return v_id; end if;
  insert into ops.staff_shift_offers (org_id, shift_id, kind, absence_id, offered_by, opened_at)
  values (p_org, p_shift.id, p_kind, p_absence, p_offered_by, v_now) returning id into v_id;
  -- Opening later than the alert window alerts the lead straight away.
  if p_shift.start_at > v_now
     and p_shift.start_at - make_interval(mins => ops._attendance_setting(p_org, 'uncovered_alert_minutes')) <= v_now then
    perform ops._attendance_alert(p_org, p_shift, 'uncovered');
  end if;
  return v_id;
end;
$$;
revoke execute on function ops._attendance_open_offer(uuid,ops.staff_shifts,text,uuid,uuid) from public, anon, authenticated;

-- After a claim falls through the shift is open again; the same window rule applies.
create or replace function ops._attendance_reopen_offer(p_org uuid, p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_shift ops.staff_shifts; v_now timestamptz := ops._attendance_now();
begin
  update ops.staff_shift_offers set status = 'open' where org_id = p_org and id = p_offer_id and status = 'claimed';
  select s.* into v_shift from ops.staff_shifts s join ops.staff_shift_offers o on o.org_id = s.org_id and o.shift_id = s.id
   where o.org_id = p_org and o.id = p_offer_id;
  if v_shift.id is not null and v_shift.start_at > v_now
     and v_shift.start_at - make_interval(mins => ops._attendance_setting(p_org, 'uncovered_alert_minutes')) <= v_now then
    perform ops._attendance_alert(p_org, v_shift, 'uncovered');
  end if;
end;
$$;
revoke execute on function ops._attendance_reopen_offer(uuid,uuid) from public, anon, authenticated;

-- A Person may cover a shift when they belong to a Team at the shift's Site and are free then.
create or replace function ops._attendance_cover_eligible(p_org uuid, p_shift ops.staff_shifts, p_person uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_person = p_shift.person_id then return 'STAFF_CLAIM_OWN_SHIFT'; end if;
  if not exists (
    select 1 from shared.team_memberships m
      join shared.teams t on t.org_id = m.org_id and t.id = m.team_id and t.archived_at is null
      join shared.people p on p.org_id = m.org_id and p.id = m.person_id and p.archived_at is null
     where m.org_id = p_org and m.person_id = p_person and t.site_id = p_shift.site_id
       and m.effective_from <= p_shift.local_date and (m.effective_to is null or m.effective_to >= p_shift.local_date)) then
    return 'STAFF_CLAIM_NOT_ELIGIBLE';
  end if;
  if ops._attendance_shift_overlaps(p_person, p_shift.local_date, p_shift.start_at, p_shift.end_at, p_shift.id) then
    return 'STAFF_SHIFT_OVERLAP';
  end if;
  return null;
end;
$$;
revoke execute on function ops._attendance_cover_eligible(uuid,ops.staff_shifts,uuid) from public, anon, authenticated;

-- ── Report an absence ────────────────────────────────────────────────────────────────────────────
create or replace function ops.report_staff_absence(
  p_kind text, p_shift_id uuid, p_team_id uuid, p_local_date date, p_person_id uuid default null, p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id();
  v_target uuid; v_now timestamptz := ops._attendance_now(); v_today date;
  v_shift ops.staff_shifts; v_team uuid; v_site uuid; v_start timestamptz; v_end timestamptz; v_date date;
  v_status text; v_flagged boolean := false; v_behalf boolean; v_id uuid; v_name text;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('sick','permission','leave') then raise exception 'STAFF_ABSENCE_INVALID' using errcode = '22023'; end if;
  if p_reason is not null and char_length(p_reason) > 500 then raise exception 'STAFF_ABSENCE_INVALID' using errcode = '22023'; end if;
  v_target := coalesce(p_person_id, v_actor);
  v_behalf := v_target <> v_actor;
  v_today := (v_now at time zone 'Asia/Jakarta')::date;

  if p_shift_id is not null then
    select * into v_shift from ops.staff_shifts s where s.id = p_shift_id and s.org_id = v_org and s.removed_at is null
       and exists (select 1 from ops.staff_rosters r where r.org_id = s.org_id and r.id = s.roster_id and r.status = 'published');
    if v_shift.id is null or v_shift.person_id <> v_target then raise exception 'STAFF_SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
    v_team := v_shift.team_id; v_site := v_shift.site_id; v_start := v_shift.start_at; v_end := v_shift.end_at; v_date := v_shift.local_date;
  else
    if p_team_id is null or p_local_date is null then raise exception 'STAFF_ABSENCE_INVALID' using errcode = '22023'; end if;
    select o.site_id, o.start_at, o.end_at into v_site, v_start, v_end
      from ops._attendance_standing_occurrence(v_org, p_team_id, v_target, p_local_date) o;
    if v_start is null then raise exception 'STAFF_SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
    v_team := p_team_id; v_date := p_local_date;
  end if;

  if v_behalf then
    -- Recording for someone else is the Team lead's act (or an admin's); it is accepted without the cutoff.
    if not ops._attendance_can_lead(v_team) then raise exception 'STAFF_ABSENCE_FORBIDDEN' using errcode = '42501'; end if;
    v_status := case when p_kind = 'sick' then 'accepted' else 'approved' end;
    v_flagged := p_kind = 'sick' and v_date = v_today;
  elsif p_kind = 'sick' then
    if v_date <> v_today or v_end <= v_now then raise exception 'STAFF_SICK_SAME_DAY_ONLY' using errcode = '22023'; end if;
    v_status := 'accepted'; v_flagged := true;
  else
    if v_date < v_today + ops._attendance_setting(v_org, 'leave_cutoff_days') then
      raise exception 'STAFF_ABSENCE_TOO_LATE' using errcode = '23514';
    end if;
    v_status := 'pending';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('staff-absence:' || v_org::text || ':' || v_target::text, 0));
  if exists (select 1 from ops.staff_absences a where a.org_id = v_org and a.person_id = v_target and a.shift_start_at = v_start
             and a.status in ('accepted','pending','approved')) then
    raise exception 'STAFF_ABSENCE_EXISTS' using errcode = '23505';
  end if;

  insert into ops.staff_absences (org_id, person_id, team_id, site_id, shift_id, local_date, shift_start_at, shift_end_at, kind, status, flagged, reason, recorded_by, decided_by, decided_at)
  values (v_org, v_target, v_team, v_site, v_shift.id, v_date, v_start, v_end, p_kind, v_status, v_flagged, nullif(btrim(p_reason), ''), v_actor,
          case when v_behalf then v_actor end, case when v_behalf then v_now end)
  returning id into v_id;
  select full_name into v_name from shared.people where org_id = v_org and id = v_target;

  if v_status in ('accepted','approved') and v_shift.id is not null then
    perform ops._attendance_open_offer(v_org, v_shift, 'absence', v_id, v_target);
  end if;

  if v_status = 'pending' then
    perform ops._attendance_notify_team(v_org, v_team, v_actor, 'info', 'Absence request / Permintaan tidak hadir',
      v_name || ' asks for ' || p_kind || ' on ' || to_char(v_date, 'DD Mon') || '. / ' || v_name || ' mengajukan ' || p_kind || ' pada ' || to_char(v_date, 'DD Mon') || '.',
      'staff_absence', v_id, '/work/shifts/inbox');
  elsif v_behalf then
    perform ops._attendance_notify(v_org, v_target, 'info', 'Absence recorded / Ketidakhadiran dicatat',
      'Your lead recorded your ' || p_kind || ' on ' || to_char(v_date, 'DD Mon') || '. / Lead mencatat ' || p_kind || ' Anda pada ' || to_char(v_date, 'DD Mon') || '.',
      'staff_absence', v_id, '/work/shifts/absences');
  else
    perform ops._attendance_notify_team(v_org, v_team, v_actor, 'warning', 'Sick today / Sakit hari ini',
      v_name || ' reported sick for today''s shift. / ' || v_name || ' melaporkan sakit untuk shift hari ini.',
      'staff_absence', v_id, '/work/shifts/inbox');
  end if;
  return v_id;
end;
$$;
revoke execute on function ops.report_staff_absence(text,uuid,uuid,date,uuid,text) from public, anon;
grant execute on function ops.report_staff_absence(text,uuid,uuid,date,uuid,text) to authenticated;

create or replace function ops.decide_staff_absence(p_absence_id uuid, p_approve boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_abs ops.staff_absences; v_shift ops.staff_shifts; v_now timestamptz := ops._attendance_now();
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_abs from ops.staff_absences where id = p_absence_id and org_id = v_org for update;
  if v_abs.id is null or not ops._attendance_can_lead(v_abs.team_id) then raise exception 'STAFF_ABSENCE_FORBIDDEN' using errcode = '42501'; end if;
  if v_abs.status <> 'pending' then raise exception 'STAFF_ABSENCE_NOT_PENDING' using errcode = 'P0003'; end if;
  if p_approve is null then raise exception 'STAFF_ABSENCE_INVALID' using errcode = '22023'; end if;
  if not p_approve and nullif(btrim(p_reason), '') is null then raise exception 'STAFF_REASON_REQUIRED' using errcode = '22023'; end if;
  update ops.staff_absences set status = case when p_approve then 'approved' else 'rejected' end, decided_by = v_actor, decided_at = v_now,
    decision_reason = nullif(btrim(p_reason), ''), updated_at = v_now where id = v_abs.id;
  if p_approve and v_abs.shift_id is not null then
    select * into v_shift from ops.staff_shifts where id = v_abs.shift_id and org_id = v_org and removed_at is null;
    if v_shift.id is not null then perform ops._attendance_open_offer(v_org, v_shift, 'absence', v_abs.id, v_abs.person_id); end if;
  end if;
  perform ops._attendance_notify(v_org, v_abs.person_id, 'info',
    case when p_approve then 'Absence approved / Ketidakhadiran disetujui' else 'Absence rejected / Ketidakhadiran ditolak' end,
    case when p_approve then 'Your ' || v_abs.kind || ' on ' || to_char(v_abs.local_date, 'DD Mon') || ' was approved. / ' || v_abs.kind || ' Anda pada ' || to_char(v_abs.local_date, 'DD Mon') || ' disetujui.'
         else 'Your ' || v_abs.kind || ' on ' || to_char(v_abs.local_date, 'DD Mon') || ' was not approved: ' || btrim(p_reason) || ' / ' || v_abs.kind || ' Anda pada ' || to_char(v_abs.local_date, 'DD Mon') || ' ditolak: ' || btrim(p_reason) end,
    'staff_absence', v_abs.id, '/work/shifts/absences');
end;
$$;
revoke execute on function ops.decide_staff_absence(uuid,boolean,text) from public, anon;
grant execute on function ops.decide_staff_absence(uuid,boolean,text) to authenticated;

create or replace function ops.cancel_staff_absence(p_absence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_abs ops.staff_absences;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_abs from ops.staff_absences where id = p_absence_id and org_id = v_org and person_id = v_actor for update;
  if v_abs.id is null then raise exception 'STAFF_ABSENCE_FORBIDDEN' using errcode = '42501'; end if;
  if v_abs.status <> 'pending' then raise exception 'STAFF_ABSENCE_NOT_PENDING' using errcode = 'P0003'; end if;
  update ops.staff_absences set status = 'withdrawn', updated_at = ops._attendance_now() where id = v_abs.id;
end;
$$;
revoke execute on function ops.cancel_staff_absence(uuid) from public, anon;
grant execute on function ops.cancel_staff_absence(uuid) to authenticated;

-- ── Doctor's note photo: private, insert-only bucket read through a checking function ────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('staff-notes', 'staff-notes', false, 5242880, array['image/jpeg','image/png','image/webp']);

create or replace function ops.staff_note_absence_id(p_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    return null;
  end if;
  return split_part(p_name, '/', 2)::uuid;
end;
$$;

create or replace function ops.can_read_staff_note(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_absence uuid := ops.staff_note_absence_id(p_name);
begin
  if v_absence is null or split_part(p_name, '/', 1) <> shared.current_org_id()::text then return false; end if;
  return exists (
    select 1 from ops.staff_absences a
     where a.id = v_absence and a.org_id = shared.current_org_id() and a.kind = 'sick'
       and (a.person_id = shared.current_person_id()
         or shared.can('attendance.read_all')
         or shared.is_designated_team_lead(a.team_id, shared.current_person_id())));
end;
$$;
comment on function ops.can_read_staff_note(text) is 'Storage read predicate for doctor''s notes: the Person, the designated lead of the absence''s Team, hr or admin. Path org and parent absence must match the viewer''s org. SECURITY DEFINER.';
revoke execute on function ops.can_read_staff_note(text) from public, anon, authenticated;
grant execute on function ops.can_read_staff_note(text) to authenticated, service_role;

create or replace function ops.can_add_staff_note(p_name text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_absence uuid := ops.staff_note_absence_id(p_name); v_org uuid := shared.current_org_id();
begin
  if v_absence is null or v_org is null or split_part(p_name, '/', 1) <> v_org::text then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('staff-note:' || v_absence::text, 0));
  return exists (
    select 1 from ops.staff_absences a
     where a.id = v_absence and a.org_id = v_org and a.kind = 'sick' and a.status in ('accepted','approved')
       and a.person_id = shared.current_person_id() and a.note_path is null
       and a.created_at > now() - interval '30 days'
       and (select count(*) from storage.objects o where o.bucket_id = 'staff-notes' and ops.staff_note_absence_id(o.name) = v_absence) < 2);
end;
$$;
comment on function ops.can_add_staff_note(text) is 'Storage insert predicate: only the sick Person adds a note photo to their own accepted absence, within 30 days, at most two objects; no update or delete policy exists. SECURITY DEFINER.';
revoke execute on function ops.can_add_staff_note(text) from public, anon, authenticated;
grant execute on function ops.can_add_staff_note(text) to authenticated, service_role;

create policy staff_notes_select on storage.objects for select to authenticated
  using (bucket_id = 'staff-notes' and ops.can_read_staff_note(name));
create policy staff_notes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'staff-notes' and ops.can_add_staff_note(name));

create or replace function ops.attach_staff_absence_note(p_absence_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_abs ops.staff_absences;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_abs from ops.staff_absences where id = p_absence_id and org_id = v_org and person_id = v_actor and kind = 'sick' for update;
  if v_abs.id is null or v_abs.status not in ('accepted','approved') then raise exception 'STAFF_ABSENCE_FORBIDDEN' using errcode = '42501'; end if;
  if ops.staff_note_absence_id(p_path) is distinct from v_abs.id or split_part(p_path, '/', 1) <> v_org::text
     or not exists (select 1 from storage.objects o where o.bucket_id = 'staff-notes' and o.name = p_path) then
    raise exception 'STAFF_NOTE_MISSING' using errcode = '23514';
  end if;
  if v_abs.note_path is not null then raise exception 'STAFF_NOTE_EXISTS' using errcode = '23505'; end if;
  update ops.staff_absences set note_path = p_path, note_added_at = ops._attendance_now(), updated_at = ops._attendance_now() where id = v_abs.id;
end;
$$;
revoke execute on function ops.attach_staff_absence_note(uuid,text) from public, anon;
grant execute on function ops.attach_staff_absence_note(uuid,text) to authenticated;

-- ── Cover: offer, claim, confirm ─────────────────────────────────────────────────────────────────
create or replace function ops.offer_staff_shift(p_shift_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_shift ops.staff_shifts;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select s.* into v_shift from ops.staff_shifts s where s.id = p_shift_id and s.org_id = v_org and s.person_id = v_actor and s.removed_at is null for update;
  if v_shift.id is null then raise exception 'STAFF_SHIFT_NOT_FOUND' using errcode = 'P0002'; end if;
  if not exists (select 1 from ops.staff_rosters r where r.org_id = v_org and r.id = v_shift.roster_id and r.status = 'published') then
    raise exception 'STAFF_SHIFT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_shift.start_at <= ops._attendance_now() then raise exception 'STAFF_SHIFT_STARTED' using errcode = '22023'; end if;
  return ops._attendance_open_offer(v_org, v_shift, 'swap', null, v_actor);
end;
$$;
revoke execute on function ops.offer_staff_shift(uuid) from public, anon;
grant execute on function ops.offer_staff_shift(uuid) to authenticated;

create or replace function ops.cancel_staff_offer(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_offer ops.staff_shift_offers; v_shift ops.staff_shifts; v_claim ops.staff_shift_claims; v_now timestamptz := ops._attendance_now();
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_offer from ops.staff_shift_offers where id = p_offer_id and org_id = v_org for update;
  if v_offer.id is null then raise exception 'STAFF_OFFER_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_shift from ops.staff_shifts where id = v_offer.shift_id and org_id = v_org;
  -- The Person may withdraw a swap they offered; an absence offer stays open until covered. A lead may cancel either.
  if not (ops._attendance_can_lead(v_shift.team_id) or (v_offer.kind = 'swap' and v_offer.offered_by = v_actor)) then
    raise exception 'STAFF_OFFER_FORBIDDEN' using errcode = '42501';
  end if;
  if v_offer.status not in ('open','claimed') then raise exception 'STAFF_OFFER_CLOSED' using errcode = 'P0003'; end if;
  select * into v_claim from ops.staff_shift_claims where org_id = v_org and offer_id = v_offer.id and status = 'pending' for update;
  if v_claim.id is not null then
    update ops.staff_shift_claims set status = 'void', decided_by = v_actor, decided_at = v_now where id = v_claim.id;
    perform ops._attendance_notify(v_org, v_claim.claimant_id, 'info', 'Open shift withdrawn / Shift terbuka ditarik',
      'The shift you claimed is no longer open. / Shift yang Anda ambil tidak lagi terbuka.', 'staff_shift', v_shift.id, '/work/shifts/cover');
  end if;
  update ops.staff_shift_offers set status = 'cancelled', closed_at = v_now where id = v_offer.id;
end;
$$;
revoke execute on function ops.cancel_staff_offer(uuid) from public, anon;
grant execute on function ops.cancel_staff_offer(uuid) to authenticated;

create or replace function ops.claim_staff_shift(p_offer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_offer ops.staff_shift_offers; v_shift ops.staff_shifts; v_err text; v_id uuid; v_name text;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  -- The offer row lock serialises claimants: whoever gets it second sees 'claimed' and loses.
  select * into v_offer from ops.staff_shift_offers where id = p_offer_id and org_id = v_org for update;
  if v_offer.id is null then raise exception 'STAFF_OFFER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_offer.status = 'claimed' then raise exception 'STAFF_CLAIM_TAKEN' using errcode = '23505'; end if;
  if v_offer.status <> 'open' then raise exception 'STAFF_OFFER_CLOSED' using errcode = 'P0003'; end if;
  select * into v_shift from ops.staff_shifts where id = v_offer.shift_id and org_id = v_org and removed_at is null;
  if v_shift.id is null then raise exception 'STAFF_OFFER_CLOSED' using errcode = 'P0003'; end if;
  if v_shift.start_at <= ops._attendance_now() then raise exception 'STAFF_SHIFT_STARTED' using errcode = '22023'; end if;
  v_err := ops._attendance_cover_eligible(v_org, v_shift, v_actor);
  if v_err is not null then raise exception '%', v_err using errcode = case v_err when 'STAFF_SHIFT_OVERLAP' then '23P01' else '42501' end; end if;
  insert into ops.staff_shift_claims (org_id, offer_id, claimant_id) values (v_org, v_offer.id, v_actor) returning id into v_id;
  update ops.staff_shift_offers set status = 'claimed' where id = v_offer.id;
  select full_name into v_name from shared.people where org_id = v_org and id = v_actor;
  perform ops._attendance_notify_team(v_org, v_shift.team_id, v_actor, 'info', 'Cover claimed / Pengganti mengambil shift',
    v_name || ' wants to cover the shift on ' || to_char(v_shift.local_date, 'DD Mon') || '. Confirm or choose someone else. / ' || v_name || ' ingin menggantikan shift ' || to_char(v_shift.local_date, 'DD Mon') || '. Konfirmasi atau pilih orang lain.',
    'staff_claim', v_id, '/work/shifts/inbox');
  return v_id;
exception when unique_violation then
  raise exception 'STAFF_CLAIM_TAKEN' using errcode = '23505';
end;
$$;
revoke execute on function ops.claim_staff_shift(uuid) from public, anon;
grant execute on function ops.claim_staff_shift(uuid) to authenticated;

-- The claimant lets go: the shift reopens to teammates and the lead is told.
create or replace function ops.withdraw_staff_claim(p_claim_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_claim ops.staff_shift_claims; v_shift ops.staff_shifts; v_name text; v_now timestamptz := ops._attendance_now();
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_claim from ops.staff_shift_claims where id = p_claim_id and org_id = v_org and claimant_id = v_actor for update;
  if v_claim.id is null then raise exception 'STAFF_CLAIM_FORBIDDEN' using errcode = '42501'; end if;
  if v_claim.status <> 'pending' then raise exception 'STAFF_CLAIM_CLOSED' using errcode = 'P0003'; end if;
  update ops.staff_shift_claims set status = 'withdrawn', decided_at = v_now where id = v_claim.id;
  perform ops._attendance_reopen_offer(v_org, v_claim.offer_id);
  select s.* into v_shift from ops.staff_shifts s join ops.staff_shift_offers o on o.org_id = s.org_id and o.shift_id = s.id where o.org_id = v_org and o.id = v_claim.offer_id;
  select full_name into v_name from shared.people where org_id = v_org and id = v_actor;
  perform ops._attendance_notify_team(v_org, v_shift.team_id, v_actor, 'warning', 'Cover fell through / Pengganti batal',
    v_name || ' withdrew; the shift on ' || to_char(v_shift.local_date, 'DD Mon') || ' is open to teammates again. / ' || v_name || ' mundur; shift ' || to_char(v_shift.local_date, 'DD Mon') || ' dibuka lagi untuk rekan.',
    'staff_shift', v_shift.id, '/work/shifts/inbox');
end;
$$;
revoke execute on function ops.withdraw_staff_claim(uuid) from public, anon;
grant execute on function ops.withdraw_staff_claim(uuid) to authenticated;

-- Moves the shift to a new Person; shared by confirm and direct assignment.
create or replace function ops._attendance_fill_offer(p_org uuid, p_offer ops.staff_shift_offers, p_shift ops.staff_shifts, p_person uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_now timestamptz := ops._attendance_now(); v_date text := to_char(p_shift.local_date, 'DD Mon');
begin
  update ops.staff_shifts set person_id = p_person, origin = 'cover', cover_for_person_id = p_shift.person_id, updated_at = v_now where id = p_shift.id;
  update ops.staff_shift_offers set status = 'filled', filled_by = p_person, closed_at = v_now where id = p_offer.id;
  perform ops._attendance_notify(p_org, p_person, 'info', 'You are covering a shift / Anda menggantikan shift',
    'You now hold the shift on ' || v_date || '. / Anda kini memegang shift ' || v_date || '.', 'staff_shift', p_shift.id, '/work/shifts');
  perform ops._attendance_notify(p_org, p_shift.person_id, 'info', 'Your shift is covered / Shift Anda sudah ada pengganti',
    'Your shift on ' || v_date || ' is covered. / Shift Anda pada ' || v_date || ' sudah ada pengganti.', 'staff_shift', p_shift.id, '/work/shifts');
end;
$$;
revoke execute on function ops._attendance_fill_offer(uuid,ops.staff_shift_offers,ops.staff_shifts,uuid,uuid) from public, anon, authenticated;

create or replace function ops.decide_staff_claim(p_claim_id uuid, p_confirm boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_claim ops.staff_shift_claims; v_offer ops.staff_shift_offers; v_shift ops.staff_shifts; v_err text; v_now timestamptz := ops._attendance_now();
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_confirm is null then raise exception 'STAFF_CLAIM_INVALID' using errcode = '22023'; end if;
  select * into v_claim from ops.staff_shift_claims where id = p_claim_id and org_id = v_org for update;
  if v_claim.id is null then raise exception 'STAFF_CLAIM_FORBIDDEN' using errcode = '42501'; end if;
  select * into v_offer from ops.staff_shift_offers where id = v_claim.offer_id and org_id = v_org for update;
  select * into v_shift from ops.staff_shifts where id = v_offer.shift_id and org_id = v_org for update;
  if not ops._attendance_can_lead(v_shift.team_id) then raise exception 'STAFF_CLAIM_FORBIDDEN' using errcode = '42501'; end if;
  if v_claim.status <> 'pending' then raise exception 'STAFF_CLAIM_CLOSED' using errcode = 'P0003'; end if;
  if p_confirm then
    if v_shift.removed_at is not null or v_shift.end_at <= v_now then raise exception 'STAFF_OFFER_CLOSED' using errcode = 'P0003'; end if;
    v_err := ops._attendance_cover_eligible(v_org, v_shift, v_claim.claimant_id);
    if v_err is not null then raise exception '%', v_err using errcode = case v_err when 'STAFF_SHIFT_OVERLAP' then '23P01' else '42501' end; end if;
    update ops.staff_shift_claims set status = 'confirmed', decided_by = v_actor, decided_at = v_now where id = v_claim.id;
    perform ops._attendance_fill_offer(v_org, v_offer, v_shift, v_claim.claimant_id, v_actor);
  else
    update ops.staff_shift_claims set status = 'declined', decided_by = v_actor, decided_at = v_now, reason = nullif(btrim(p_reason), '') where id = v_claim.id;
    perform ops._attendance_reopen_offer(v_org, v_offer.id);
    perform ops._attendance_notify(v_org, v_claim.claimant_id, 'info', 'Claim not accepted / Pengambilan shift tidak diterima',
      'Your lead chose another way to cover the shift on ' || to_char(v_shift.local_date, 'DD Mon') || '. / Lead memilih cara lain untuk shift ' || to_char(v_shift.local_date, 'DD Mon') || '.',
      'staff_shift', v_shift.id, '/work/shifts/cover');
  end if;
end;
$$;
revoke execute on function ops.decide_staff_claim(uuid,boolean,text) from public, anon;
grant execute on function ops.decide_staff_claim(uuid,boolean,text) to authenticated;

create or replace function ops.assign_staff_cover(p_offer_id uuid, p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_offer ops.staff_shift_offers; v_shift ops.staff_shifts; v_err text; v_claim ops.staff_shift_claims; v_now timestamptz := ops._attendance_now();
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  if p_person_id is null then raise exception 'STAFF_CLAIM_INVALID' using errcode = '22023'; end if;
  select * into v_offer from ops.staff_shift_offers where id = p_offer_id and org_id = v_org for update;
  if v_offer.id is null then raise exception 'STAFF_OFFER_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_shift from ops.staff_shifts where id = v_offer.shift_id and org_id = v_org for update;
  if not ops._attendance_can_lead(v_shift.team_id) then raise exception 'STAFF_OFFER_FORBIDDEN' using errcode = '42501'; end if;
  if v_offer.status not in ('open','claimed') or v_shift.removed_at is not null or v_shift.end_at <= v_now then raise exception 'STAFF_OFFER_CLOSED' using errcode = 'P0003'; end if;
  v_err := ops._attendance_cover_eligible(v_org, v_shift, p_person_id);
  if v_err is not null then raise exception '%', v_err using errcode = case v_err when 'STAFF_SHIFT_OVERLAP' then '23P01' else '42501' end; end if;
  select * into v_claim from ops.staff_shift_claims where org_id = v_org and offer_id = v_offer.id and status = 'pending' for update;
  if v_claim.id is not null then
    if v_claim.claimant_id = p_person_id then
      update ops.staff_shift_claims set status = 'confirmed', decided_by = v_actor, decided_at = v_now where id = v_claim.id;
    else
      update ops.staff_shift_claims set status = 'void', decided_by = v_actor, decided_at = v_now where id = v_claim.id;
      perform ops._attendance_notify(v_org, v_claim.claimant_id, 'info', 'Claim not accepted / Pengambilan shift tidak diterima',
        'Your lead assigned the shift on ' || to_char(v_shift.local_date, 'DD Mon') || ' to someone else. / Lead menugaskan shift ' || to_char(v_shift.local_date, 'DD Mon') || ' kepada orang lain.',
        'staff_shift', v_shift.id, '/work/shifts/cover');
    end if;
  end if;
  perform ops._attendance_fill_offer(v_org, v_offer, v_shift, p_person_id, v_actor);
end;
$$;
revoke execute on function ops.assign_staff_cover(uuid,uuid) from public, anon;
grant execute on function ops.assign_staff_cover(uuid,uuid) to authenticated;

-- ── Reads for the Person ─────────────────────────────────────────────────────────────────────────
create or replace function ops.list_my_staff_absences()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_today date := (ops._attendance_now() at time zone 'Asia/Jakarta')::date;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'status',a.status,'flagged',a.flagged,
      'documented',a.note_path is not null,'note_path',a.note_path,'local_date',a.local_date,'start_at',a.shift_start_at,'end_at',a.shift_end_at,
      'team_name',t.name,'site_name',s.name,'reason',a.reason,'decision_reason',a.decision_reason,'recorded_by_other',a.recorded_by <> a.person_id)
      order by a.local_date desc, a.shift_start_at desc)
    from ops.staff_absences a join shared.teams t on t.org_id = a.org_id and t.id = a.team_id
      join shared.sites s on s.org_id = a.org_id and s.id = a.site_id
    where a.org_id = v_org and a.person_id = v_actor and a.local_date >= v_today - 60), '[]'::jsonb);
end;
$$;
revoke execute on function ops.list_my_staff_absences() from public, anon;
grant execute on function ops.list_my_staff_absences() to authenticated;

-- Open shifts at the caller's Site(s) plus the caller's own offers. Absence details are never shown to teammates.
create or replace function ops.list_open_staff_shifts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now(); v_open jsonb; v_mine jsonb;
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('offer_id',o.id,'shift_id',s.id,'kind',o.kind,'status',o.status,'local_date',s.local_date,
      'start_at',s.start_at,'end_at',s.end_at,'template_name',s.template_name,'team_name',t.name,'site_name',site.name,
      'my_claim_id',c.id,'my_claim_status',c.status,
      'can_claim',(o.status = 'open' and ops._attendance_cover_eligible(v_org, s, v_actor) is null)) order by s.start_at), '[]'::jsonb)
    into v_open
    from ops.staff_shift_offers o
    join ops.staff_shifts s on s.org_id = o.org_id and s.id = o.shift_id and s.removed_at is null and s.start_at > v_now
    join shared.teams t on t.org_id = s.org_id and t.id = s.team_id
    join shared.sites site on site.org_id = s.org_id and site.id = s.site_id
    left join ops.staff_shift_claims c on c.org_id = o.org_id and c.offer_id = o.id and c.claimant_id = v_actor and c.status = 'pending'
   where o.org_id = v_org and o.status in ('open','claimed') and s.person_id <> v_actor
     and exists (select 1 from shared.team_memberships m join shared.teams mt on mt.org_id = m.org_id and mt.id = m.team_id and mt.archived_at is null
       where m.org_id = v_org and m.person_id = v_actor and mt.site_id = s.site_id
         and m.effective_from <= s.local_date and (m.effective_to is null or m.effective_to >= s.local_date));
  select coalesce(jsonb_agg(jsonb_build_object('offer_id',o.id,'shift_id',s.id,'kind',o.kind,'status',o.status,'local_date',s.local_date,
      'start_at',s.start_at,'end_at',s.end_at,'template_name',s.template_name,'site_name',site.name,
      'claimant_name',cp.full_name) order by s.start_at), '[]'::jsonb)
    into v_mine
    from ops.staff_shift_offers o
    join ops.staff_shifts s on s.org_id = o.org_id and s.id = o.shift_id
    join shared.sites site on site.org_id = s.org_id and site.id = s.site_id
    left join ops.staff_shift_claims c on c.org_id = o.org_id and c.offer_id = o.id and c.status = 'pending'
    left join shared.people cp on cp.org_id = c.org_id and cp.id = c.claimant_id
   where o.org_id = v_org and o.offered_by = v_actor and o.status in ('open','claimed') and s.start_at > v_now;
  return jsonb_build_object('open', v_open, 'mine', v_mine);
end;
$$;
revoke execute on function ops.list_open_staff_shifts() from public, anon;
grant execute on function ops.list_open_staff_shifts() to authenticated;

-- ── The lead's queue: requests, claims, uncovered shifts and flagged sick reports ────────────────
create or replace function ops.list_staff_cover_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id(); v_now timestamptz := ops._attendance_now();
  v_admin boolean; v_unled boolean; v_teams uuid[];
begin
  if v_org is null or v_actor is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  v_admin := shared.has_access_role('admin');
  v_unled := shared.has_access_role('hr') and shared.can('attendance.receive_unled');
  select coalesce(array_agg(t.id), '{}') into v_teams from shared.teams t
   where t.org_id = v_org and t.archived_at is null
     and (v_admin or shared.is_designated_team_lead(t.id, v_actor)
       or (v_unled and not exists (select 1 from shared.team_lead_assignments a where a.org_id = t.org_id and a.team_id = t.id)));
  return jsonb_build_object(
    'absences', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'person_name',p.full_name,'team_name',t.name,'kind',a.kind,'local_date',a.local_date,
        'start_at',a.shift_start_at,'end_at',a.shift_end_at,'reason',a.reason,'can_decide',ops._attendance_can_lead(a.team_id)) order by a.local_date, a.created_at)
      from ops.staff_absences a join shared.people p on p.org_id = a.org_id and p.id = a.person_id join shared.teams t on t.org_id = a.org_id and t.id = a.team_id
      where a.org_id = v_org and a.status = 'pending' and a.team_id = any(v_teams)), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'offer_kind',o.kind,'claimant_name',cp.full_name,'person_name',p.full_name,'team_name',t.name,
        'local_date',s.local_date,'start_at',s.start_at,'end_at',s.end_at,'can_decide',ops._attendance_can_lead(s.team_id)) order by s.start_at)
      from ops.staff_shift_claims c join ops.staff_shift_offers o on o.org_id = c.org_id and o.id = c.offer_id
      join ops.staff_shifts s on s.org_id = o.org_id and s.id = o.shift_id
      join shared.people cp on cp.org_id = c.org_id and cp.id = c.claimant_id join shared.people p on p.org_id = s.org_id and p.id = s.person_id
      join shared.teams t on t.org_id = s.org_id and t.id = s.team_id
      where c.org_id = v_org and c.status = 'pending' and s.team_id = any(v_teams)), '[]'::jsonb),
    'uncovered', coalesce((select jsonb_agg(jsonb_build_object('offer_id',o.id,'offer_kind',o.kind,'person_name',p.full_name,'team_name',t.name,'team_id',t.id,'site_id',s.site_id,
        'local_date',s.local_date,'start_at',s.start_at,'end_at',s.end_at,'can_decide',ops._attendance_can_lead(s.team_id)) order by s.start_at)
      from ops.staff_shift_offers o join ops.staff_shifts s on s.org_id = o.org_id and s.id = o.shift_id and s.removed_at is null and s.end_at > v_now
      join shared.people p on p.org_id = s.org_id and p.id = s.person_id join shared.teams t on t.org_id = s.org_id and t.id = s.team_id
      where o.org_id = v_org and o.status = 'open' and s.team_id = any(v_teams)), '[]'::jsonb),
    'sick', coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'person_name',p.full_name,'team_name',t.name,'local_date',a.local_date,'documented',a.note_path is not null) order by a.local_date desc)
      from ops.staff_absences a join shared.people p on p.org_id = a.org_id and p.id = a.person_id join shared.teams t on t.org_id = a.org_id and t.id = a.team_id
      where a.org_id = v_org and a.kind = 'sick' and a.flagged and a.status = 'accepted' and a.local_date >= (v_now at time zone 'Asia/Jakarta')::date - 7 and a.team_id = any(v_teams)), '[]'::jsonb),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object('person_id',p.id,'full_name',p.full_name,'site_id',t.site_id) order by p.full_name)
      from (select distinct m.person_id, mt.site_id from shared.team_memberships m join shared.teams mt on mt.org_id = m.org_id and mt.id = m.team_id and mt.archived_at is null
        where m.org_id = v_org and mt.site_id is not null and m.effective_from <= (v_now at time zone 'Asia/Jakarta')::date + 14
          and (m.effective_to is null or m.effective_to >= (v_now at time zone 'Asia/Jakarta')::date)) t
      join shared.people p on p.org_id = v_org and p.id = t.person_id and p.archived_at is null
      where t.site_id in (select tt.site_id from shared.teams tt where tt.id = any(v_teams))), '[]'::jsonb)
  );
end;
$$;
revoke execute on function ops.list_staff_cover_queue() from public, anon;
grant execute on function ops.list_staff_cover_queue() to authenticated;

-- ── HR / lead views: every visible Team's absences and monthly totals per Person ─────────────────
create or replace function ops._attendance_visible_teams()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(t.id), '{}') from shared.teams t
   where t.org_id = shared.current_org_id() and t.archived_at is null
     and (shared.can('attendance.read_all') or shared.is_designated_team_lead(t.id, shared.current_person_id()))
$$;
revoke execute on function ops._attendance_visible_teams() from public, anon, authenticated;

create or replace function ops.list_staff_absences(p_from date, p_to date, p_team_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_teams uuid[];
begin
  if v_org is null or shared.current_person_id() is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  v_teams := ops._attendance_visible_teams();
  if cardinality(v_teams) = 0 then raise exception 'STAFF_ABSENCE_FORBIDDEN' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 93 then raise exception 'STAFF_WEEK_INVALID' using errcode = '22023'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'person_id',p.id,'person_name',p.full_name,'team_id',t.id,'team_name',t.name,'kind',a.kind,'status',a.status,
      'flagged',a.flagged,'documented',a.note_path is not null,'note_path',a.note_path,'local_date',a.local_date,'start_at',a.shift_start_at,'end_at',a.shift_end_at,
      'reason',a.reason,'decision_reason',a.decision_reason) order by a.local_date desc, p.full_name)
    from ops.staff_absences a join shared.people p on p.org_id = a.org_id and p.id = a.person_id join shared.teams t on t.org_id = a.org_id and t.id = a.team_id
    where a.org_id = v_org and a.local_date between p_from and p_to and a.status <> 'withdrawn'
      and a.team_id = any(v_teams) and (p_team_id is null or a.team_id = p_team_id)), '[]'::jsonb);
end;
$$;
revoke execute on function ops.list_staff_absences(date,date,uuid) from public, anon;
grant execute on function ops.list_staff_absences(date,date,uuid) to authenticated;

-- Clock records belong to stage 3. When its table exists the worked / late / early-leave counts come from it;
-- until then they are null, which the screen shows as "not yet recorded".
create or replace function ops._attendance_clock_counts(p_org uuid, p_first date, p_last date)
returns table (person_id uuid, worked bigint, late bigint, early_leave bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if to_regclass('ops.attendance_records') is null then return; end if;
  return query execute
    'select r.person_id, count(*) filter (where r.clock_in_at is not null), count(*) filter (where r.late), count(*) filter (where r.early_leave)
       from ops.attendance_records r
      where r.org_id = $1 and r.status <> ''pending'' and (r.shift_start_at at time zone ''Asia/Jakarta'')::date between $2 and $3
      group by r.person_id' using p_org, p_first, p_last;
end;
$$;
revoke execute on function ops._attendance_clock_counts(uuid,date,date) from public, anon, authenticated;

create or replace function ops.list_staff_monthly_totals(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_teams uuid[]; v_first date; v_last date; v_clock boolean := to_regclass('ops.attendance_records') is not null;
begin
  if v_org is null or shared.current_person_id() is null or not shared.is_org_member() then raise exception 'STAFF_FORBIDDEN' using errcode = '42501'; end if;
  v_teams := ops._attendance_visible_teams();
  if cardinality(v_teams) = 0 then raise exception 'STAFF_ABSENCE_FORBIDDEN' using errcode = '42501'; end if;
  if p_month is null then raise exception 'STAFF_WEEK_INVALID' using errcode = '22023'; end if;
  v_first := date_trunc('month', p_month)::date; v_last := (v_first + interval '1 month - 1 day')::date;
  return coalesce((
    with people_in_scope as (
      select distinct on (p.id) p.id as person_id, p.full_name, t.id as team_id, t.name as team_name
        from shared.team_memberships m join shared.people p on p.org_id = m.org_id and p.id = m.person_id and p.archived_at is null
        join shared.teams t on t.org_id = m.org_id and t.id = m.team_id and t.archived_at is null
       where m.org_id = v_org and m.team_id = any(v_teams) and m.effective_from <= v_last and (m.effective_to is null or m.effective_to >= v_first)
       order by p.id, m.is_primary desc, t.name
    ), counts as (
      select a.person_id,
        count(*) filter (where a.kind = 'sick' and a.note_path is not null) as sick_documented,
        count(*) filter (where a.kind = 'sick' and a.note_path is null) as sick_undocumented,
        count(*) filter (where a.kind = 'permission') as permission,
        count(*) filter (where a.kind = 'leave') as leave
      from ops.staff_absences a
      where a.org_id = v_org and a.local_date between v_first and v_last and a.status in ('accepted','approved') and a.team_id = any(v_teams)
      group by a.person_id
    ), noshows as (
      select o.person_id, count(*) as no_show from ops.staff_shift_outcomes o
       where o.org_id = v_org and o.outcome = 'no_show' and o.local_date between v_first and v_last and o.team_id = any(v_teams) group by o.person_id
    ), clock as (
      select * from ops._attendance_clock_counts(v_org, v_first, v_last)
    )
    select jsonb_agg(jsonb_build_object('person_id',ps.person_id,'full_name',ps.full_name,'team_id',ps.team_id,'team_name',ps.team_name,
        'shifts_worked', case when v_clock then coalesce(k.worked,0) end,
        'late', case when v_clock then coalesce(k.late,0) end,
        'early_leave', case when v_clock then coalesce(k.early_leave,0) end,
        'sick_documented',coalesce(c.sick_documented,0),'sick_undocumented',coalesce(c.sick_undocumented,0),
        'permission',coalesce(c.permission,0),'leave',coalesce(c.leave,0),'no_show',coalesce(n.no_show,0)) order by ps.team_name, ps.full_name)
    from people_in_scope ps left join counts c on c.person_id = ps.person_id left join noshows n on n.person_id = ps.person_id left join clock k on k.person_id = ps.person_id
  ), '[]'::jsonb);
end;
$$;
revoke execute on function ops.list_staff_monthly_totals(date) from public, anon;
grant execute on function ops.list_staff_monthly_totals(date) to authenticated;

-- ── Admin: when no-show recording starts (null = off) ───────────────────────────────────────────
create or replace function ops.set_noshow_recording_from(p_from timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id();
begin
  if v_org is null or v_actor is null or not shared.has_access_role('admin') then raise exception 'STAFF_ADMIN_FORBIDDEN' using errcode = '42501'; end if;
  insert into ops.staff_cover_config (org_id, noshow_recording_from, updated_by) values (v_org, p_from, v_actor)
  on conflict (org_id) do update set noshow_recording_from = excluded.noshow_recording_from, updated_by = v_actor, updated_at = now();
end;
$$;
revoke execute on function ops.set_noshow_recording_from(timestamptz) from public, anon;
grant execute on function ops.set_noshow_recording_from(timestamptz) to authenticated;

-- hr may read a Team roster it does not lead (read only; every write action still checks the lead).
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
  if not (shared.can('attendance.read_all') or shared.is_designated_team_lead(p_team_id,v_actor)) then raise exception 'STAFF_ROSTER_FORBIDDEN' using errcode = '42501'; end if;
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
