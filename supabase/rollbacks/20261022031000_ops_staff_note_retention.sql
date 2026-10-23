-- DOWN for 20261022031000. Restores the previous bodies exactly, then drops the bucket column.
-- Note references already cleared by the retention job are not restored.

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

drop function ops.claim_attendance_selfie_purge(integer);
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

delete from ops.attendance_selfie_purge_queue where bucket <> 'attendance-selfies';
alter table ops.attendance_selfie_purge_queue drop column bucket;
comment on table ops.attendance_selfie_purge_queue is 'Selfie objects due for deletion. The Storage API worker deletes them and confirms; SQL never deletes storage objects.';
