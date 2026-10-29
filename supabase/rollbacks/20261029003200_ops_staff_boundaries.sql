-- Restore staff attendance functions.

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
revoke execute on function ops.can_add_staff_note(text) from public, anon, authenticated;
grant execute on function ops.can_add_staff_note(text) to authenticated, service_role;

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

drop function ops._attendance_clock_counts(uuid,date,date,uuid[]);

create or replace function ops.run_attendance_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := ops._attendance_now(); v_org record; v_row record; v_rcpt record; v_name text;
  v_missing integer := 0; v_closed integer := 0; v_pending integer := 0; v_selfies integer := 0; v_notes integer := 0; v_locations integer := 0;
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
            'No clock-in or absence since the shift started. / Belum ada catatan masuk atau ketidakhadiran sejak shift dimulai.',
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

    -- Superseded and never-accepted images: every object that is not its record's accepted selfie is queued within the hour,
    -- so retries and replaced captures never outlive the retention period.
    insert into ops.attendance_selfie_purge_queue (path, org_id, queued_at)
    select o.name, v_org.id, v_now from storage.objects o
     where o.bucket_id = 'attendance-selfies' and o.name like v_org.id::text || '/%'
       and ops.attendance_selfie_record_id(o.name) is not null
       and o.created_at <= v_now - interval '1 hour'
       and not exists (select 1 from ops.attendance_records r
                        where r.org_id = v_org.id and r.id = ops.attendance_selfie_record_id(o.name)
                          and (r.status = 'pending' or r.selfie_path = o.name))
    on conflict do nothing;

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

    -- Doctor's-note retention (NFR-002): notes older than 2 years leave at once and the object is queued like a selfie.
    for v_row in
      select a.id, a.note_path
        from ops.staff_absences a
       where a.org_id = v_org.id and a.note_path is not null and a.note_added_at <= v_now - interval '2 years'
         for update of a
    loop
      insert into ops.attendance_selfie_purge_queue (path, org_id, bucket, queued_at) values (v_row.note_path, v_org.id, 'staff-notes', v_now) on conflict do nothing;
      update ops.staff_absences set note_path = null, updated_at = v_now where id = v_row.id;
      v_notes := v_notes + 1;
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
  return jsonb_build_object('missing_alerts', v_missing, 'closed_no_clock_out', v_closed, 'abandoned_attempts', v_pending, 'selfies_queued', v_selfies, 'notes_queued', v_notes, 'locations_cleared', v_locations);
end;
$$;
revoke execute on function ops.run_attendance_jobs() from public, anon, authenticated;
grant execute on function ops.run_attendance_jobs() to service_role;
