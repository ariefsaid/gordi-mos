-- Hourly Supabase-native dispatch of the attendance photo purge (replaces the server-run worker).
-- pg_cron calls ops.dispatch_attendance_photo_purge(), which posts to the attendance-photo-purge Edge Function
-- with a dedicated bearer secret read from Vault. The service-role key never lives in the database.
-- DOWN: supabase/rollbacks/20261022040000_ops_attendance_photo_purge_dispatch.sql
--
-- One-time operator step per environment (values are never committed):
--   1. select vault.create_secret('<function url>', 'attendance_purge_url');
--      select vault.create_secret('<random secret>', 'attendance_purge_secret');
--   2. supabase secrets set ATTENDANCE_PURGE_SECRET=<the same random secret>
--   3. deploy the function: supabase functions deploy attendance-photo-purge
-- Until both Vault rows exist the dispatcher does nothing, so local and CI resets are safe.

do $$
begin
  create extension if not exists pg_net;
  create extension if not exists supabase_vault;
exception when others then
  raise notice 'pg_net / supabase_vault unavailable; the dispatcher stays inert: %', sqlerrm;
end
$$;

create or replace function ops.dispatch_attendance_photo_purge()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'attendance_purge_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'attendance_purge_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
end
$$;
comment on function ops.dispatch_attendance_photo_purge() is 'Posts to the attendance-photo-purge Edge Function with the Vault bearer secret; does nothing until both Vault rows exist.';
revoke execute on function ops.dispatch_attendance_photo_purge() from public, anon, authenticated;

-- Hourly, off the hour. Skipped, not failed, where pg_cron is unavailable.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('attendance-photo-purge', '17 * * * *', 'select ops.dispatch_attendance_photo_purge()');
  else
    raise notice 'pg_cron is not available; schedule ops.dispatch_attendance_photo_purge() hourly by hand';
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end
$$;
