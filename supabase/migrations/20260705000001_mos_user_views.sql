-- mos.user_views — declarative user-composed surfaces (ADR-0018 D6 P1 / ADR-0017 D5/D6).
-- Adapted from the sibling internal project's user_views migration; MOS deltas: mos schema
-- (not public), owner_id (person_id), shared_team via NEW shared.is_managed_by (the reverse of
-- shared.is_manager_of — owner shares TO their reports), org-gate baked in from day 1
-- (sibling SEC-HIGH-1 lesson: org_id must be the wall on EVERY SELECT branch).
-- Reversibility (pre-production): `supabase db reset`. Manual rollback at file foot.

-- ── shared.is_managed_by(manager_person_id): true iff manager manages the current person ──
-- The reverse of shared.is_manager_of (which answers "does current manage target"). For
-- user_views.shared_team: the OWNER (a manager) shares TO their reports, so a viewer V sees owner
-- O's shared view iff O manages V — i.e. is_managed_by(O) from V's session. Recursive CTE mirrors
-- is_manager_of (cycle-safe via UNION); source/target swapped.
create or replace function shared.is_managed_by(p_manager_person_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  with recursive
  current_roles as (
    select pr.role_id from shared.person_roles pr
    where pr.person_id = shared.current_person_id()
  ),
  ancestor_roles as (
    select r.id, r.reports_to_role_id
    from shared.roles r
    join current_roles cr on cr.role_id = r.id
    union
    select parent.id, parent.reports_to_role_id
    from shared.roles parent
    join ancestor_roles a on a.reports_to_role_id = parent.id
  ),
  manager_roles as (
    select pr.role_id from shared.person_roles pr
    where pr.person_id = p_manager_person_id
  )
  select exists (
    select 1
    from ancestor_roles a
    join manager_roles mr on mr.role_id = a.id
    where a.id not in (select role_id from current_roles)
  )
$$;
comment on function shared.is_managed_by(uuid) is
  'True iff p_manager_person_id manages the current person (reverse of is_manager_of). Backs user_views.shared_team (ADR-0017 D6 manager-share).';

-- ── mos.user_views table ──────────────────────────────────────────────────────
create table mos.user_views (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references shared.orgs(id) on delete cascade
                default shared.current_org_id(),
  owner_id    uuid not null references shared.people(id)
                default shared.current_person_id(),
  name        text not null check (btrim(name) <> ''),
  spec        jsonb not null default '{}'::jsonb,
  scope       text not null default 'private' check (scope in ('private','shared_team')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

-- Hot-path indexes: per-org listing + live-only fast path + owner-list fast path.
create index mos_user_views_org_idx   on mos.user_views (org_id);
create index mos_user_views_live_idx  on mos.user_views (org_id) where archived_at is null;
create index mos_user_views_owner_idx on mos.user_views (owner_id) where archived_at is null;

alter table mos.user_views enable row level security;
alter table mos.user_views force  row level security;

grant select, insert, update on mos.user_views to authenticated; -- no delete (soft-archive)

-- SELECT (SEC-HIGH-1 org-gate on EVERY branch): org must match FIRST, then owner OR shared_team
-- (owner manages the viewer via is_managed_by). A private row owned by another person is invisible
-- even to same-org members/admin. A cross-org row of ANY scope/owner is 0 rows.
create policy user_views_select on mos.user_views
  for select to authenticated
  using (
    org_id = shared.current_org_id()
    and (
      owner_id = shared.current_person_id()
      or (scope = 'shared_team' and shared.is_managed_by(owner_id))
    )
  );

-- INSERT: org + owner pinned to the caller (defaults + WITH CHECK). A browser holds a valid JWT +
-- anon key, so the post-image predicate is required, not optional (sibling 0045/0053 lesson).
create policy user_views_insert on mos.user_views
  for insert to authenticated
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- UPDATE: owner-only; org + owner re-pinned on the post-image (cannot reassign ownership).
create policy user_views_update on mos.user_views
  for update to authenticated
  using (org_id = shared.current_org_id() and owner_id = shared.current_person_id())
  with check (org_id = shared.current_org_id() and owner_id = shared.current_person_id());

-- No delete policy (soft-archive via archived_at, the ADR-0001/0004 archive discipline).

-- ── Manual rollback ───────────────────────────────────────────────────────────
-- drop policy if exists user_views_update on mos.user_views;
-- drop policy if exists user_views_insert on mos.user_views;
-- drop policy if exists user_views_select on mos.user_views;
-- alter table mos.user_views disable row level security;
-- drop index if exists mos_user_views_owner_idx;
-- drop index if exists mos_user_views_live_idx;
-- drop index if exists mos_user_views_org_idx;
-- drop table if exists mos.user_views;
-- drop function if exists shared.is_managed_by(uuid);
