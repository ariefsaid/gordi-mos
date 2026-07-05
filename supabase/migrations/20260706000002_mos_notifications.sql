-- mos.notifications — the owner-private notification inbox (ADR-0044 §5 analog / ADR-0019 D9
-- Inbox destination). Adapted from the sibling internal project's notifications table; MOS deltas:
-- schema-qualified `mos.*`, `org_id default shared.current_org_id()` / `owner_id default
-- shared.current_person_id()` (owner_id references shared.people(id) directly — MOS has no profiles
-- table), org-gate on EVERY policy branch + WITH CHECK pinning (P1 user_views / P2 agent_persistence
-- pattern). Content is IMMUTABLE post-create; the only permitted UPDATE is `read_at` (a mark-read
-- column-pin trigger, mirroring mos._guard_agent_event_update — RLS WITH CHECK cannot compare OLD vs
-- NEW). Cross-owner delivery (an @mention notifying another person) goes through the SECURITY DEFINER
-- mos.create_notification helper (migration 20260706000003), NOT a direct cross-owner INSERT — RLS
-- pins owner_id to the caller here. FR-P3-NF-001/002/004.
-- Reversibility (pre-production): `supabase db reset`. Manual rollback at file foot (spelled out).

create table mos.notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  owner_id    uuid not null references shared.people(id) on delete cascade
                default shared.current_person_id(),
  severity    text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  title       text not null check (btrim(title) <> ''),
  body        text,
  -- deep-link payload: { entity: { type, id, route } } routing the Inbox row to its owning surface.
  metadata    jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- Unread fast-path: the bell badge + Inbox default filter both scan owner's unread (FR-P3-NF-004).
create index mos_notifications_owner_unread_idx
  on mos.notifications (owner_id) where read_at is null;
-- Inbox list is created_at-desc per owner.
create index mos_notifications_owner_created_idx
  on mos.notifications (owner_id, created_at desc);

alter table mos.notifications enable row level security;
alter table mos.notifications force  row level security;

grant select, insert, update on mos.notifications to authenticated; -- no delete (audit-durable inbox)

-- SELECT: org-gate first, then owner-only (no manager-share / admin cross-owner read — an inbox is
-- strictly the recipient's, mirroring the P2 transcript posture).
create policy notifications_select on mos.notifications
  for select to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- INSERT: owner pins to self + own org. Cross-owner delivery uses mos.create_notification (definer);
-- a direct INSERT addressed to another owner is denied here.
create policy notifications_insert on mos.notifications
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- UPDATE: owner-only, org/owner re-pinned; the column-pin trigger below narrows this to read_at only.
create policy notifications_update on mos.notifications
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- ── notifications_mark_read_only guard trigger (FR-P3-NF-002) ─────────────────────────────────
-- Content is immutable once delivered: only read_at may flip (unread → read). RLS's WITH CHECK
-- cannot compare OLD vs NEW, so a BEFORE UPDATE trigger enforces the append-only-except-read_at rule.
create or replace function mos._guard_notification_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.id       is distinct from old.id
     or new.org_id    is distinct from old.org_id
     or new.owner_id  is distinct from old.owner_id
     or new.severity  is distinct from old.severity
     or new.title     is distinct from old.title
     or new.body      is distinct from old.body
     or new.metadata  is distinct from old.metadata
     or new.created_at is distinct from old.created_at
  then
    raise exception 'notifications is read-state-only on UPDATE: only read_at may change'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_notification_update() is
  'BEFORE UPDATE column-pin: rejects any change except read_at, so a delivered notification is immutable content (FR-P3-NF-002).';

create trigger notifications_mark_read_only
  before update on mos.notifications
  for each row execute function mos._guard_notification_update();

-- DOWN (manual, pre-production):
-- drop trigger if exists notifications_mark_read_only on mos.notifications;
-- drop function if exists mos._guard_notification_update();
-- drop policy if exists notifications_update on mos.notifications;
-- drop policy if exists notifications_insert on mos.notifications;
-- drop policy if exists notifications_select on mos.notifications;
-- drop index if exists mos.mos_notifications_owner_created_idx;
-- drop index if exists mos.mos_notifications_owner_unread_idx;
-- drop table if exists mos.notifications;
