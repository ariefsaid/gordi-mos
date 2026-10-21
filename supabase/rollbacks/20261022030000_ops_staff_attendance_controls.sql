-- DOWN for 20261022030000. Restores the previous bodies exactly, then drops the helpers.

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

drop function if exists ops._attendance_deciders(uuid, uuid, uuid);
drop function if exists ops._attendance_can_decide(uuid, uuid);
drop function if exists ops._attendance_requester_tier(uuid, uuid);
