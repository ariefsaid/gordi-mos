-- Attendance photo purge runs once a day, 03:17 WIB (20:17 UTC), instead of hourly.
-- DOWN: supabase/rollbacks/20261022050000_ops_attendance_photo_purge_daily.sql
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('attendance-photo-purge', '17 20 * * *', 'select ops.dispatch_attendance_photo_purge()');
  else
    raise notice 'pg_cron is not available; schedule ops.dispatch_attendance_photo_purge() daily by hand';
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$$;
