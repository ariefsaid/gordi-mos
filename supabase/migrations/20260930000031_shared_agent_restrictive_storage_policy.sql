-- shared — one restrictive policy keeps agent sessions out of storage (#1063, ADR-0060 D5).
--
-- A token issued to a connected agent app carries a `client_id` claim; an app session never does.
-- Two things change here:
--   1. api_private.claims_carry_client_id() is the single key-presence rule for "this request is an
--      agent's": true when the request claims hold a `client_id` key, whatever its value. The
--      data API's pre-request fence (api_private.check_request) and storage both call it.
--   2. One RESTRICTIVE policy on storage.objects and one on storage.buckets requires that rule to be
--      false. A restrictive policy is AND-ed with every permissive policy, so a policy added to
--      storage later inherits the exclusion without stating it. The two signal-photo policies go
--      back to their own conditions.
--
-- DOWN (manual, in order):
--   drop policy agent_sessions_excluded on storage.objects;
--   drop policy agent_sessions_excluded on storage.buckets;
--   -- restore api_private.check_request() from 20260930000004_shared_agent_fence.sql;
--   drop function api_private.claims_carry_client_id();
--   -- restore the signal_photos_select / signal_photos_insert policies from
--   -- 20260930000005_shared_storage_agent_fence.sql.

begin;

create function api_private.claims_carry_client_id()
returns boolean
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_exists(
    coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), ''), '{}')::pg_catalog.jsonb,
    'client_id')
$$;
comment on function api_private.claims_carry_client_id() is
  'The one rule for an agent request: the request claims hold a client_id key, whatever its value (null and empty included). Used by api_private.check_request() and by the restrictive storage policies. SECURITY INVOKER.';
revoke execute on function api_private.claims_carry_client_id() from public, anon, authenticated;
grant  execute on function api_private.claims_carry_client_id() to anon, authenticated, service_role;

create or replace function api_private.check_request()
returns void
language plpgsql
as $$
begin
  -- The app's own tokens, API v1 session tokens and anonymous calls carry no client_id: nothing to do.
  if not api_private.claims_carry_client_id() then
    return;
  end if;
  -- The request schema is the first entry of the search path PostgREST sets (quoted, comma-separated).
  perform api_private._agent_fence(
    pg_catalog.btrim(pg_catalog.split_part(pg_catalog.current_setting('search_path'), ',', 1), ' "'));
end;
$$;

create policy agent_sessions_excluded on storage.objects
  as restrictive for all to authenticated
  using      (not api_private.claims_carry_client_id())
  with check (not api_private.claims_carry_client_id());
create policy agent_sessions_excluded on storage.buckets
  as restrictive for all to authenticated
  using      (not api_private.claims_carry_client_id())
  with check (not api_private.claims_carry_client_id());

drop policy signal_photos_select on storage.objects;
create policy signal_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'signal-photos' and mos.can_read_signal_photo(name));

drop policy signal_photos_insert on storage.objects;
create policy signal_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'signal-photos' and mos.can_add_signal_photo(name));

commit;
