-- Org-scoped calendar commitments. DOWN: drop trigger, functions, policies, grant and table.
create table mos.events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default shared.current_org_id() references shared.orgs(id),
  title text not null check (btrim(title) <> ''),
  venue text not null check (btrim(venue) <> ''),
  is_outbound boolean not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  business_unit_id uuid references shared.business_units(id),
  coordinator_person_id uuid references shared.people(id),
  created_by uuid not null default shared.current_person_id() references shared.people(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_window_ck check (ends_at > starts_at)
);
create index events_active_month_idx on mos.events (org_id, starts_at) where archived_at is null;

create or replace function mos.can_edit_event(p_id uuid) returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from mos.events e
    where e.id = p_id and e.org_id = shared.current_org_id()
      and (e.created_by = shared.current_person_id() or shared.is_manager_of(e.created_by))
  )
$$;
create or replace function mos._guard_events() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.org_id is distinct from old.org_id or new.created_by is distinct from old.created_by) then raise exception 'event ownership is immutable' using errcode = '42501'; end if;
  if shared.current_org_id() is not null and new.org_id is distinct from shared.current_org_id() then raise exception 'event org must match current org' using errcode = '42501'; end if;
  if new.created_by <> shared.current_person_id() and shared.current_person_id() is not null then raise exception 'event creator must match current person' using errcode = '42501'; end if;
  if new.business_unit_id is not null and not exists (select 1 from shared.business_units where id = new.business_unit_id and org_id = new.org_id) then raise exception 'business unit belongs to a different org' using errcode = '42501'; end if;
  if new.coordinator_person_id is not null and not exists (select 1 from shared.people where id = new.coordinator_person_id and org_id = new.org_id) then raise exception 'coordinator belongs to a different org' using errcode = '42501'; end if;
  return new;
end $$;
create trigger events_set_updated_at before update on mos.events for each row execute function shared.set_updated_at();
create trigger events_guard before insert or update on mos.events for each row execute function mos._guard_events();
grant select, insert, update on mos.events to authenticated;
alter table mos.events enable row level security;
alter table mos.events force row level security;
create policy events_select on mos.events for select to authenticated using (org_id = shared.current_org_id() and shared.is_org_member());
create policy events_insert on mos.events for insert to authenticated with check (org_id = shared.current_org_id() and shared.is_org_member());
create policy events_update on mos.events for update to authenticated using (mos.can_edit_event(id)) with check (org_id = shared.current_org_id() and mos.can_edit_event(id));

alter table mos.user_views drop constraint mos_user_views_metadata_ck;
alter table mos.user_views add constraint mos_user_views_metadata_ck check (
  (kind is null and context is null and lifecycle is null) or (
    kind is not null and context is not null and lifecycle is not null
    and ((lifecycle = 'archived' and archived_at is not null) or (lifecycle = 'active' and archived_at is null))
    and ((kind = 'collection' and context = 'work' and (spec->>'kind') = 'collection'
      and (spec->>'version') = '1' and (spec->>'collectionId') in ('tasks','signals','events'))
      or (kind = 'composition' and context in ('home','work')))
  )
);
-- DOWN: drop policy events_update on mos.events; drop policy events_insert on mos.events; drop policy events_select on mos.events; revoke all on mos.events from authenticated; drop trigger events_guard on mos.events; drop trigger events_set_updated_at on mos.events; drop function mos._guard_events(); drop function mos.can_edit_event(uuid); drop table mos.events;
