-- shared — storage is reached by a person's app session only (#1071, ADR-0060 D5).
--
-- A token issued to a connected agent app carries a `client_id` claim; an app session never does.
-- Every policy on storage.objects and storage.buckets admits a request only when
-- api_private.claim_client_id() is null, so an agent session has no storage access on any bucket
-- until a deliberate photo operation exists in api_v1. The predicate is the one the fence already
-- uses (api_private.claim_client_id, a SECURITY INVOKER reader of the request claims).
--
-- Each policy below keeps its full previous condition; the only change is the added exclusion.

begin;

drop policy signal_photos_select on storage.objects;
create policy signal_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'signal-photos' and mos.can_read_signal_photo(name)
         and api_private.claim_client_id() is null);

drop policy signal_photos_insert on storage.objects;
create policy signal_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'signal-photos' and mos.can_add_signal_photo(name)
              and api_private.claim_client_id() is null);

commit;

-- DOWN:
-- begin;
-- drop policy signal_photos_insert on storage.objects;
-- create policy signal_photos_insert on storage.objects for insert to authenticated
--   with check (bucket_id = 'signal-photos' and mos.can_add_signal_photo(name));
-- drop policy signal_photos_select on storage.objects;
-- create policy signal_photos_select on storage.objects for select to authenticated
--   using (bucket_id = 'signal-photos' and mos.can_read_signal_photo(name));
-- commit;
