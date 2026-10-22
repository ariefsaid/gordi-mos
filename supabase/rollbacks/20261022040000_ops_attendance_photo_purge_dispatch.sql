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

-- Restore path-only confirmation and the path-only primary key (fails if the same path now exists in both buckets).
drop function if exists ops.confirm_attendance_selfie_purged(text, text[]);
create function ops.confirm_attendance_selfie_purged(p_paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  update ops.attendance_selfie_purge_queue set deleted_at = ops._attendance_now() where path = any(p_paths) and deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function ops.confirm_attendance_selfie_purged(text[]) from public, anon, authenticated;
grant execute on function ops.confirm_attendance_selfie_purged(text[]) to service_role;

alter table ops.attendance_selfie_purge_queue drop constraint attendance_selfie_purge_queue_pkey;
alter table ops.attendance_selfie_purge_queue add primary key (path);
