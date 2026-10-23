-- DOWN for 20261022050000: back to hourly, off the hour.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('attendance-photo-purge', '17 * * * *', 'select ops.dispatch_attendance_photo_purge()');
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$$;
