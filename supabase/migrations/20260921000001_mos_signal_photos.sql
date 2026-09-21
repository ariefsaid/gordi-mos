-- Signal photos (ticket 680): a private bucket whose objects ARE the record. An object lives at
-- <org_id>/<signal_id>/<uuid>.<ext>; who may read it is who may read that Signal.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signal-photos', 'signal-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- The Signal an object path belongs to, or null when the path is not
-- <current org>/<uuid>/<uuid>.<jpg|png|webp>. Text comparison only: a malformed path never reaches
-- a uuid cast.
create or replace function mos._signal_photo_signal_id(p_name text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_name ~ ('^' || shared.current_org_id()::text
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
                   || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
    then split_part(p_name, '/', 2)::uuid
  end
$$;

-- Read: whoever reads the Signal, while it is not retracted — a tombstone shows no evidence.
create or replace function mos.can_read_signal_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from mos.signals s
     where s.id = mos._signal_photo_signal_id(p_name)
       and s.retracted_at is null
       and mos.can_read_signal(s.id)
  )
$$;

-- Add: the author, to their own live Signal, inside the capture window, up to four. Evidence is
-- attached at capture and never edited: there is no update or delete grant.
create or replace function mos.can_add_signal_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from mos.signals s
     where s.id = mos._signal_photo_signal_id(p_name)
       and s.author_id = shared.current_person_id()
       and s.retracted_at is null
       and s.created_at > now() - interval '15 minutes'
       and (select count(*)
              from storage.objects o
             where o.bucket_id = 'signal-photos'
               and o.name like shared.current_org_id()::text || '/' || s.id::text || '/%') < 4
  )
$$;

revoke execute on function mos._signal_photo_signal_id(text) from public, anon, authenticated;
revoke execute on function mos.can_read_signal_photo(text)   from public, anon, authenticated;
revoke execute on function mos.can_add_signal_photo(text)    from public, anon, authenticated;
grant  execute on function mos.can_read_signal_photo(text) to authenticated;
grant  execute on function mos.can_add_signal_photo(text)  to authenticated;

create policy signal_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'signal-photos' and mos.can_read_signal_photo(name));
create policy signal_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'signal-photos' and mos.can_add_signal_photo(name));

-- The feed reads many Signals' photos in one query. security_invoker: the policy above decides.
create view mos.signal_photos with (security_invoker = true) as
  select split_part(o.name, '/', 2)::uuid as signal_id, o.name as path, o.created_at
    from storage.objects o
   where o.bucket_id = 'signal-photos';
grant select on mos.signal_photos to authenticated;

commit;

-- DOWN:
-- drop view mos.signal_photos;
-- drop policy signal_photos_insert on storage.objects;
-- drop policy signal_photos_select on storage.objects;
-- drop function mos.can_add_signal_photo(text);
-- drop function mos.can_read_signal_photo(text);
-- drop function mos._signal_photo_signal_id(text);
-- Empty and delete the 'signal-photos' bucket through the Storage API (storage refuses direct SQL deletes).
