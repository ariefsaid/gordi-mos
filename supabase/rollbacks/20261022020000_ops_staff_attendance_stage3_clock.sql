-- DOWN for 20261022020000. Refuses to erase attendance records, consents, alerts or settings.
-- Storage objects are never deleted with SQL: empty the attendance-selfies bucket through the Storage API first.
begin;
lock table ops.attendance_records, ops.attendance_consents, ops.attendance_alerts, ops.attendance_settings,
  ops.attendance_record_history, ops.attendance_selfie_purge_queue in access exclusive mode;
do $$
begin
  if exists (select 1 from ops.attendance_records)
     or exists (select 1 from ops.attendance_consents)
     or exists (select 1 from ops.attendance_alerts)
     or exists (select 1 from ops.attendance_settings)
     or exists (select 1 from ops.attendance_record_history)
     or exists (select 1 from ops.attendance_selfie_purge_queue where deleted_at is null) then
    raise exception 'Rollback refused: export and separately preserve attendance records, consents, alerts and settings first';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'attendance-selfies') then
    raise exception 'Rollback refused: the attendance-selfies bucket still holds objects; delete them through the Storage API first';
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ops-attendance-jobs';
  end if;
end $$;
drop policy attendance_selfies_insert on storage.objects;
drop policy attendance_selfies_select on storage.objects;
delete from storage.buckets where id = 'attendance-selfies';
drop function ops.confirm_attendance_selfie_purged(text[]);
drop function ops.claim_attendance_selfie_purge(integer);
drop function ops.run_attendance_jobs();
drop function ops._attendance_alert_recipients(uuid, uuid);
drop function ops.correct_attendance_record(uuid, timestamptz, timestamptz, timestamptz, text);
drop function ops.get_attendance_record(uuid);
drop function ops.list_team_attendance(uuid, date);
drop function ops.get_my_clock_state();
drop function ops.clock_out_attendance(uuid, double precision, double precision, double precision);
drop function ops.clock_in_attendance(uuid, double precision, double precision, double precision);
drop function ops._attendance_position_refusal(uuid, uuid, double precision, double precision, double precision, integer, integer);
drop function ops.begin_attendance_clock_in(timestamptz);
drop function ops.record_attendance_consent(text, text);
drop function ops.save_attendance_settings(integer, integer, integer, integer, integer, integer, integer, integer);
drop function ops.get_attendance_settings();
drop function ops.can_add_attendance_selfie(text);
drop function ops.can_read_attendance_selfie(text);
drop function ops.attendance_selfie_record_id(text);
drop function ops._attendance_has_absence(uuid, uuid, timestamptz);
drop function ops._attendance_shifts_between(uuid, timestamptz, timestamptz);
drop function ops._attendance_settings_at(uuid, timestamptz);
drop function ops._attendance_notice_version();
drop function ops._attendance_distance_m(double precision, double precision, double precision, double precision);
drop table ops.attendance_selfie_purge_queue;
drop table ops.attendance_alerts;
drop table ops.attendance_record_history;
drop table ops.attendance_records;
drop table ops.attendance_consents;
drop table ops.attendance_settings;
drop function ops._attendance_reader_ok(uuid, uuid);
commit;
