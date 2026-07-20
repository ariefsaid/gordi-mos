-- V3 Issue 6 (DB half of Tasks 8/9) — persist typed Work collection views on the existing
-- mos.user_views substrate (docs/plans/2026-07-20-v3-record-collection.md §"Task 9 — GREEN").
-- The row now carries a discriminated, schema-versioned CollectionViewSpec in the existing `spec`
-- jsonb, plus three NULLABLE normalized metadata columns (kind/context/lifecycle) that classify a
-- row without rewriting the legacy CompositionSpec (Home/dashboard) rows. The TS contract mirrored
-- here is mos-app/src/lib/record-collection/collection-view-spec.ts (validate-before-DAL). No Task
-- Team column is added or inferred — that is Issue 8's `mos.tasks.team_id` contract.
--
-- Backwards-compatible by construction: legacy rows keep the all-null metadata tuple and pass every
-- new check via that branch; the existing fail-closed org-gate + owner/managed-report RLS policies
-- are untouched. Reversibility (pre-production): `supabase db reset`; manual DOWN spelled out at foot.

-- 1. Normalized metadata columns (nullable; no backfill of existing rows).
alter table mos.user_views
  add column kind      text,
  add column context   text,
  add column lifecycle text;

comment on column mos.user_views.kind is
  'Row classifier: composition (legacy Home/dashboard CompositionSpec) or collection (V3 Work RecordCollection view). NULL = legacy row predating the metadata columns.';
comment on column mos.user_views.context is
  'Surface a row belongs to: home | work. Collection rows are always work.';
comment on column mos.user_views.lifecycle is
  'active | archived — kept consistent with archived_at by mos_user_views_metadata_ck.';

-- 2. Value-domain checks. Each allows the all-null legacy tuple (so old rows are unaffected).
alter table mos.user_views
  add constraint mos_user_views_kind_ck
    check (kind is null or kind in ('composition','collection'));
alter table mos.user_views
  add constraint mos_user_views_context_ck
    check (context is null or context in ('home','work'));
alter table mos.user_views
  add constraint mos_user_views_lifecycle_ck
    check (lifecycle is null or lifecycle in ('active','archived'));

-- 3. Structural coherence: a non-null kind requires the full metadata tuple; a collection row must
--    be Work-context and carry a valid versioned collection spec; lifecycle tracks archived_at.
alter table mos.user_views
  add constraint mos_user_views_metadata_ck check (
    (kind is null and context is null and lifecycle is null)
    or (
      kind is not null and context is not null and lifecycle is not null
      and (
        (lifecycle = 'archived' and archived_at is not null)
        or (lifecycle = 'active'  and archived_at is null)
      )
      and (
        (
          kind = 'collection'
          and context = 'work'
          and (spec->>'kind') = 'collection'
          and (spec->>'version') = '1'
          and (spec->>'collectionId') in ('tasks','signals')
        )
        or (
          kind = 'composition'
          and context in ('home','work')
        )
      )
    )
  );

-- 4. Partial hot-path indexes for the Work collection-view lists (live, per-org and per-owner).
create index mos_user_views_collection_live_idx
  on mos.user_views (org_id, context, updated_at desc)
  where kind = 'collection' and context = 'work' and lifecycle = 'active' and archived_at is null;
create index mos_user_views_collection_owner_idx
  on mos.user_views (owner_id, context, updated_at desc)
  where kind = 'collection' and context = 'work' and lifecycle = 'active' and archived_at is null;

-- 5. RLS is UNCHANGED: the existing user_views_select / user_views_insert / user_views_update
--    policies remain enabled + forced and fail-closed (org-gate on every branch, owner/managed-report
--    visibility, post-image owner/org pinning). A collection INSERT/UPDATE still omits org_id/owner_id.
--    A narrow BEFORE UPDATE guard additionally pins the two classifier columns so a persisted row's
--    kind/context are immutable once set (RLS WITH CHECK cannot compare OLD vs NEW). This mirrors
--    mos._guard_notification_update; it never fires for legacy rows (kind/context stay NULL) nor for
--    name/spec/scope/archived_at/lifecycle updates (rename/apply/soft-archive).
create or replace function mos._guard_user_view_metadata_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'user_views.kind is immutable once set' using errcode = '42501';
  end if;
  if new.context is distinct from old.context then
    raise exception 'user_views.context is immutable once set' using errcode = '42501';
  end if;
  return new;
end;
$$;
comment on function mos._guard_user_view_metadata_update() is
  'BEFORE UPDATE column-pin: kind/context are immutable once set, so a persisted collection view cannot be mutated into a composition row (or vice versa). Serves the collection-view update-pinning invariant.';

create trigger user_views_pin_metadata
  before update on mos.user_views
  for each row execute function mos._guard_user_view_metadata_update();

-- ── Manual rollback (pre-production) ────────────────────────────────────────────
-- drop trigger if exists user_views_pin_metadata on mos.user_views;
-- drop function if exists mos._guard_user_view_metadata_update();
-- drop index if exists mos.mos_user_views_collection_owner_idx;
-- drop index if exists mos.mos_user_views_collection_live_idx;
-- alter table mos.user_views drop constraint if exists mos_user_views_metadata_ck;
-- alter table mos.user_views drop constraint if exists mos_user_views_lifecycle_ck;
-- alter table mos.user_views drop constraint if exists mos_user_views_context_ck;
-- alter table mos.user_views drop constraint if exists mos_user_views_kind_ck;
-- alter table mos.user_views drop column if exists lifecycle;
-- alter table mos.user_views drop column if exists context;
-- alter table mos.user_views drop column if exists kind;
