-- DOWN for 20261022040000. The pg_net and supabase_vault extensions and any Vault secrets stay.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('attendance-photo-purge');
  end if;
exception when others then
  raise notice 'unschedule skipped: %', sqlerrm;
end
$$;
drop function if exists ops.dispatch_attendance_photo_purge();
