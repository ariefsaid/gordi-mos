-- Staff attendance stage 2: the timed job. One idempotent function run every 5 minutes by the database
-- scheduler: alert the lead about an uncovered shift and record a no-show when a shift ended with no
-- clock-in and no reported absence. One alert per shift per kind.
-- DOWN: supabase/rollbacks/20261022012000_ops_staff_attendance_jobs.sql

-- True when a clock-in exists for the Person's shift. Clock records belong to stage 3; before they exist nobody has clocked in.
create or replace function ops._attendance_has_clock_in(p_org uuid, p_person uuid, p_shift_start timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_found boolean := false;
begin
  if to_regclass('ops.attendance_records') is null then return false; end if;
  execute 'select exists (select 1 from ops.attendance_records r where r.org_id = $1 and r.person_id = $2 and r.shift_start_at = $3 and r.status <> ''pending'')'
    into v_found using p_org, p_person, p_shift_start;
  return coalesce(v_found, false);
end;
$$;
revoke execute on function ops._attendance_has_clock_in(uuid,uuid,timestamptz) from public, anon, authenticated;

create or replace function ops.run_staff_attendance_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := ops._attendance_now(); v_shift ops.staff_shifts; v_org uuid; v_from timestamptz;
  v_uncovered integer := 0; v_noshow integer := 0; v_added integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('ops-staff-attendance-jobs', 0));
  -- Open shifts still without a claim inside the alert window.
  for v_shift in
    select s.* from ops.staff_shift_offers o
      join ops.staff_shifts s on s.org_id = o.org_id and s.id = o.shift_id and s.removed_at is null
     where o.status = 'open' and s.start_at > v_now
       and s.start_at - make_interval(mins => ops._attendance_setting(o.org_id, 'uncovered_alert_minutes')) <= v_now
     order by s.start_at, s.id
  loop
    if ops._attendance_alert(v_shift.org_id, v_shift, 'uncovered') then v_uncovered := v_uncovered + 1; end if;
  end loop;

  -- No-show: the shift ended with no clock-in and no reported absence. Only shifts that start after the
  -- org's recording switch are judged, so enabling it never rewrites history.
  for v_org, v_from in select org_id, noshow_recording_from from ops.staff_cover_config where noshow_recording_from is not null and noshow_recording_from <= v_now loop
    for v_shift in
      select s.* from ops.staff_shifts s
        join ops.staff_rosters r on r.org_id = s.org_id and r.id = s.roster_id and r.status = 'published'
       where s.org_id = v_org and s.removed_at is null and s.start_at >= v_from and s.end_at <= v_now
         and not exists (select 1 from ops.staff_absences ab where ab.org_id = s.org_id and ab.person_id = s.person_id and ab.shift_start_at = s.start_at
                          and ab.status in ('accepted','pending','approved'))
       order by s.start_at, s.id
    loop
      if not ops._attendance_has_clock_in(v_org, v_shift.person_id, v_shift.start_at) then
        insert into ops.staff_shift_outcomes (org_id, person_id, team_id, shift_start_at, shift_end_at, local_date, outcome, recorded_at)
        values (v_org, v_shift.person_id, v_shift.team_id, v_shift.start_at, v_shift.end_at, v_shift.local_date, 'no_show', v_now)
        on conflict (org_id, person_id, shift_start_at) do nothing;
        get diagnostics v_added = row_count;
        v_noshow := v_noshow + v_added;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('uncovered', v_uncovered, 'no_show', v_noshow);
end;
$$;
comment on function ops.run_staff_attendance_jobs() is 'Timed cover job: uncovered-shift alert and no-show record. Idempotent; run only by the database scheduler (no client grant). The missing clock-in alert belongs to the clock job. SECURITY DEFINER.';
revoke execute on function ops.run_staff_attendance_jobs() from public, anon, authenticated;

-- Schedule on the database scheduler where the extension is available (Supabase Cloud, local stack).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'staff-attendance-jobs';
      perform cron.schedule('staff-attendance-jobs', '*/5 * * * *', 'select ops.run_staff_attendance_jobs()');
    exception when others then
      raise notice 'staff-attendance-jobs not scheduled: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not available; schedule ops.run_staff_attendance_jobs() every 5 minutes';
  end if;
end $$;
