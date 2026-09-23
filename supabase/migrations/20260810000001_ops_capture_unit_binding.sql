-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ops.kitchen_logs.item_unit_id + the offerability read — the unit binding (#234)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Spec: docs/specs/bar-capture.spec.md — FR-020..023, FR-032, AC-005, AC-015.
--
-- #232 made the unit master data (ops.item_units: the ERP coordinate pair IS the unit identity —
-- FR-022). This migration makes the LOG carry it: every submitted row records WHICH item-unit it
-- was captured in, because the ERP transfer line takes the product-detail id and no unit field —
-- a row that only names its wip item cannot say which coordinate its quantity means once an item
-- has more than one confirmed unit.
--
-- Three parts, all additive (expand, don't contract):
--   1. ops.kitchen_logs.item_unit_id — nullable FK; backfilled to each item's default unit.
--   2. A bind trigger: a row inserted WITHOUT an explicit unit records the item's default
--      (FR-020 — the common path enters no unit), an explicit binding must reference a unit of
--      the row's own item in the row's own org, and the binding is immutable after insert.
--   3. ops.capture_form_items grows `is_transferable` (FR-032): the view keeps returning every
--      CONFIRMED (item, unit) — the DD-WAY-29 gate is unchanged — and the capture READER filters
--      alternates to transferable ones. The flag rides the view so offering stays one query.
--
-- qty_porsi note: the quantity column keeps its name. Renaming it is a contraction of the live
-- capture/approval/dispatch surface, out of this additive slice's scope; item_unit_id is what
-- says which unit the number means (the backfilled/default binding IS 'porsi' for every
-- pre-existing row, so the old name stays truthful for history).
--
-- DOWN:
--   drop trigger kitchen_logs_bind_item_unit on ops.kitchen_logs;
--   drop function ops._bind_kitchen_log_item_unit();
--   alter table ops.kitchen_logs drop column item_unit_id;
--   -- and re-create ops.capture_form_items from 20260807000001_ops_item_units.sql §5
--   -- (drop view + create view — column removal cannot go through create or replace).

-- ── 1. The log row carries WHICH item-unit was recorded (FR-022) ─────────────────────────────
-- Nullable BY DESIGN, not as a shortcut: a pre-#232 item that never had coordinates has no unit
-- row to bind (its logs still exist and still count in stock), and the flip-time import path
-- must not be refused over master data that arrives later. `on delete restrict` because the
-- binding is provenance: a unit row that priced real production cannot silently vanish.
alter table ops.kitchen_logs
  add column item_unit_id uuid references ops.item_units(id) on delete restrict;

comment on column ops.kitchen_logs.item_unit_id is
  'The item-unit this row was captured in (FR-022, OD-WAY-46): the unit IS the ERP coordinate (product-detail identity), so the log must name which one its quantity means. NULL binding on insert resolves to the item''s default unit server-side (FR-020); NULL after that means the item has no unit row at all (pre-master-data history). Immutable once SET; a NULL may be first-filled later (the backfill arm) but never rewritten.';

-- The FK is `on delete restrict`, so unit deletion checks this column; index it so that check
-- (and any per-unit audit read) is not a sequential scan of the fact table.
create index kitchen_logs_item_unit_idx on ops.kitchen_logs (item_unit_id);

-- ── 2. Backfill: every existing row binds to its item's default unit ─────────────────────────
-- The #232 backfill made each item's live 'porsi' coordinate a CONFIRMED default unit row, so
-- binding history to the default is a statement of fact, not a guess: those rows were captured
-- in that unit — it was the only one. An item with no unit row (no coordinates) stays NULL,
-- which is what the column's nullability is for.
--
-- The org equality is defense in depth, not a behaviour change: a log's wip item is same-org
-- (ops._guard_kitchen_log) and a unit's item is same-org (ops._guard_item_unit), so the join
-- cannot cross tenants on current data — but the backfill states the invariant itself rather
-- than inheriting it, exactly as the bind trigger does for writes.
update ops.kitchen_logs l
   set item_unit_id = u.id
  from ops.item_units u
 where u.wip_item_id = l.wip_item_id
   and l.org_id = u.org_id
   and u.is_default
   and l.item_unit_id is null;

-- ── 3. Bind trigger: default resolution + the same-item/same-org seam + immutability ─────────
-- Named to fire BEFORE kitchen_logs_guard (alphabetical BEFORE-trigger order: 'bind' < 'guard'),
-- though the two are independent — each validates its own columns.
--
-- The UPDATE column grant on ops.kitchen_logs (…0010 §grants) is a column LIST that does not
-- include item_unit_id, so an authenticated client cannot touch the binding post-insert at all;
-- the immutability arm here covers the service/definer paths the grant does not.
create or replace function ops._bind_kitchen_log_item_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item uuid;
  v_org  uuid;
begin
  -- FR-022 provenance: once a row HAS a binding, which unit its quantity was captured in never
  -- changes — a correction is a new log, exactly as for the wip item itself. A NULL binding
  -- (pre-master-data history) MAY be first-filled later: that is the backfill arm writing the
  -- fact for the first time, not rewriting it — and it re-enters the seam checks below.
  if tg_op = 'UPDATE' and old.item_unit_id is not null
     and new.item_unit_id is distinct from old.item_unit_id then
    raise exception 'item_unit_id is immutable on a kitchen log' using errcode = '42501';
  end if;

  -- INSERT, no explicit binding: the common path enters no unit (FR-020) — the row records the
  -- item's DEFAULT unit server-side, so every capture carries its coordinate without the client
  -- having to say so. Under INVOKER RLS the lookup sees the caller's org only. An item with no
  -- unit row resolves to NULL (nullable by design — see the column comment).
  if tg_op = 'INSERT' and new.item_unit_id is null then
    select u.id into new.item_unit_id
      from ops.item_units u
     where u.wip_item_id = new.wip_item_id
       and u.is_default;
    return new;
  end if;

  -- A binding being WRITTEN — explicit on INSERT (the "change unit" path, FR-021) or the
  -- late first-fill on UPDATE: the unit must belong to the row's own item and org.
  -- item_unit_id is an existence-only FK and FK lookups bypass RLS, so this is the same seam
  -- every sibling guard closes: a cross-org unit is invisible under INVOKER RLS, the lookup
  -- returns NULL, and the org arm raises 23514.
  if new.item_unit_id is not null and (tg_op = 'INSERT' or old.item_unit_id is null) then
    select u.wip_item_id, u.org_id into v_item, v_org
      from ops.item_units u
     where u.id = new.item_unit_id;
    if v_org is distinct from new.org_id then
      raise exception 'item_unit_id must belong to the same org as the kitchen log'
        using errcode = '23514';
    end if;
    if v_item is distinct from new.wip_item_id then
      raise exception 'item_unit_id must reference a unit of the log''s own wip item'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._bind_kitchen_log_item_unit() is
  'Unit binding for kitchen logs (#234, FR-020..022): INSERT without item_unit_id binds the item''s default unit; a written binding must be same-org (23514) and belong to the row''s own wip item (23514); a SET binding is immutable (42501) while a NULL one may be first-filled (the backfill arm). SECURITY INVOKER.';

create trigger kitchen_logs_bind_item_unit
  before insert or update on ops.kitchen_logs
  for each row execute function ops._bind_kitchen_log_item_unit();

-- ── 4. The gated read grows the offerability flag (FR-032) ───────────────────────────────────
-- Same query, one more column at the end (create or replace — additive). The view still returns
-- every CONFIRMED (item, unit) on an active item: the DD-WAY-29 confirmation gate is a view
-- predicate and stays one; the TRANSFERABLE filter is the capture reader's, at the offering
-- layer (AC-015 is a unit-layer contract) — a non-transferable confirmed unit remains readable
-- here because it is real master data (a default unit is displayed regardless; only ALTERNATES
-- are subject to FR-032).
create or replace view ops.capture_form_items as
select
  w.id       as wip_item_id,
  w.name,
  w.category,
  u.id       as item_unit_id,
  u.unit_name,
  u.is_default,
  u.esb_product_detail_id,
  u.esb_product_id,
  u.is_transferable
from ops.wip_items w
join ops.item_units u on u.wip_item_id = w.id
where w.flag_active
  and u.confirmed_at is not null;

-- Re-asserted (idempotent) so the replace can never leave the view running definer-style.
alter view ops.capture_form_items set (security_invoker = true);
comment on view ops.capture_form_items is
  'The capture form''s item source: confirmed item-units on active items ONLY (FR-011, DD-WAY-29, NFR-004). Absence, not warning. Carries is_transferable (FR-032) so the reader can filter ALTERNATES to transferable in the same query. security_invoker — base-table RLS scopes the org.';

comment on column ops.item_units.is_transferable is
  'FR-032: an ERP-synced variant the ERP flags non-transferable must never be offered as an alternate. Recorded here because the item-unit record is the seam between synced and hand-maintained rows. Consumed by the capture read path (#234): ops.capture_form_items exposes it and the form reader offers only transferable alternates.';
