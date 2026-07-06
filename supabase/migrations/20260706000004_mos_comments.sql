-- mos.comments — append-only comments attached to MOS work items (ADR-0019 D4 / P3a Phase F).
-- v1 scope: comments attach polymorphically to task / weekly_update / daily_log / follow_up.
-- Read posture is same-org for v1, matching the existing task/update/log visibility decision in
-- the P3 plan. Writes are pinned to the caller's org/person via JWT claim defaults. No UPDATE or
-- DELETE is granted: comments are append-only for audit simplicity. FR-P3-CM-001.
-- Reversibility (pre-production): `supabase db reset`. Manual rollback at file foot.

create table mos.comments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  author_id   uuid not null references shared.people(id) on delete cascade
                default shared.current_person_id(),
  entity_type text not null check (entity_type in ('task', 'weekly_update', 'daily_log', 'follow_up')),
  entity_id   uuid not null,
  body        text not null check (btrim(body) <> ''),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index mos_comments_entity_created_idx
  on mos.comments (org_id, entity_type, entity_id, created_at);

create index mos_comments_author_created_idx
  on mos.comments (author_id, created_at desc);

alter table mos.comments enable row level security;
alter table mos.comments force  row level security;

grant select, insert on mos.comments to authenticated;

-- SELECT: v1 comments inherit the same-org read posture of their owning work surface.
create policy comments_select on mos.comments
  for select to authenticated
  using (org_id = shared.current_org_id());

-- INSERT: a caller may create only as themselves in their current org. The entity-specific read
-- guard remains a later hardening if task-level confidentiality is introduced; v1 work items are
-- same-org-readable by design.
create policy comments_insert on mos.comments
  for insert to authenticated
  with check (org_id = shared.current_org_id() and author_id = shared.current_person_id());

comment on table mos.comments is
  'Append-only comments attached to MOS work items; same-org readable v1, author/org pinned by JWT.';

-- DOWN (manual, pre-production):
-- drop policy if exists comments_insert on mos.comments;
-- drop policy if exists comments_select on mos.comments;
-- drop index if exists mos.mos_comments_author_created_idx;
-- drop index if exists mos.mos_comments_entity_created_idx;
-- drop table if exists mos.comments;
