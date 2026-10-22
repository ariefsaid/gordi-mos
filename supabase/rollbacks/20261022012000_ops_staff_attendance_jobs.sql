-- DOWN for 20261022012000. Unschedules the job and drops its function; alert and outcome rows stay.
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'staff-attendance-jobs';
  end if;
end $$;
drop function if exists ops.run_staff_attendance_jobs();
drop function if exists ops._attendance_has_clock_in(uuid,uuid,timestamptz);
