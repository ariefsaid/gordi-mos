-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ops.item_units — Unit as master data + the no-coordinates-no-row gate (#232)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Spec: docs/specs/bar-capture.spec.md — FR-011, FR-030..032, NFR-004, AC-003;
-- Implementation Decision "Units as reference data" (OD-WAY-46/47, DD-WAY-29).
--
-- A per-item-unit record carrying the ERP coordinate pair and a confirmation event. The capture
-- form's item read (ops.capture_form_items below) returns ONLY confirmed item-units: an unconfirmed
-- item is ABSENT, not disabled or warned (DD-WAY-29). The gate is a query predicate, not a
-- validation rule or review step — a control with nothing to bypass (NFR-004).
--
-- Additive on the squashed baseline (expand, don't contract): ops.wip_items keeps its single-unit
-- esb_* columns untouched; this migration copies each item's current coordinate onto a CONFIRMED
-- default-unit row (unit 'porsi'). Migrated as confirmed because those coordinates post to the ERP
-- today — treating them as unconfirmed would empty the live kitchen form.
--
-- Writes are gated to ops_lead/admin, exactly like ops.wip_items: the procurement/ops-support
-- refinement (FR-030's "who records the confirmation") is a role read at the UI level, not a new
-- access role.
--
-- DOWN:
--   drop view ops.capture_form_items;
--   drop trigger item_units_guard on ops.item_units;
--   drop function ops._guard_item_unit();
--   drop table ops.item_units;
--   -- and re-create ops._test_seed_cafe() from 20260805000012_ops_test_seed.sql.

-- ── 1. The table ─────────────────────────────────────────────────────────────────────────────
create table ops.item_units (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references shared.orgs(id) on delete cascade,
  wip_item_id           uuid not null references ops.wip_items(id) on delete cascade,
  -- The display name of the unit ('porsi', 'botol', ...). Display only: the ERP transfer line
  -- takes the product-detail id and NO unit field (FR-022, confirmed at API level by #227), so
  -- the coordinate pair below is the identity and this is the label beside the qty input.
  unit_name             text not null check (btrim(unit_name) <> ''),
  -- The ERP coordinate pair, shaped like the wip_items esb_* columns it generalises. Nullable:
  -- a hand-maintained row may exist before its coordinates are known — it simply cannot be
  -- confirmed (check below), so the DD-WAY-29 gate keeps it off every form.
  esb_product_detail_id text,
  esb_product_id        text,
  -- Exactly one default unit per item (partial unique index below); the form shows the default
  -- as fixed master data and offers alternates only behind "change unit" (FR-020/021).
  is_default            boolean not null default false,
  -- The confirmation event (FR-030): who/when. confirmed_at is the gate predicate. confirmed_by
  -- is nullable BY DESIGN, not just for `on delete set null`: the backfilled rows below are
  -- system-migrated (the coordinates post today; no person recorded them in MOS), and a person
  -- row's deletion must not un-confirm live master data.
  confirmed_at          timestamptz,
  confirmed_by          uuid references shared.people(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- One row per (item, unit name) — a unit is a row, never a free-text variant.
  constraint item_units_unit_per_item_uk unique (wip_item_id, unit_name),
  -- A confirmation asserts the coordinates are right, so there must BE coordinates. The product
  -- id alone is not an ERP transfer identity — the product-detail id is (FR-022).
  constraint item_units_confirmed_has_coordinates
    check (confirmed_at is null or esb_product_detail_id is not null)
);
comment on table ops.item_units is
  'Unit as master data (FR-030, OD-WAY-46/47): per item-unit, the ERP coordinate pair and a confirmation event. The capture form reads only confirmed rows (DD-WAY-29 via ops.capture_form_items). Backfilled rows carry confirmed_by NULL (system-migrated).';
comment on column ops.item_units.confirmed_at is
  'The DD-WAY-29 gate predicate: NULL = the pair appears on no capture form, anywhere.';

create unique index item_units_one_default_uidx on ops.item_units (wip_item_id) where is_default;
create index item_units_org_idx  on ops.item_units (org_id);
create index item_units_item_idx on ops.item_units (wip_item_id);

create trigger item_units_set_updated_at
  before update on ops.item_units
  for each row execute function shared.set_updated_at();

alter table ops.item_units alter column org_id set default shared.current_org_id();

-- ── 2. Guard: org immutability + the same-org FK seam ────────────────────────────────────────
-- wip_item_id and confirmed_by are existence-only FKs and FK lookups bypass RLS, so a writer
-- could reference a foreign-org row. Under INVOKER RLS a same-org reference is visible and a
-- cross-org one is not, so the lookup returns NULL and raises 23514 — the same seam every
-- sibling ops table guards. Arms are null-guarded so a missing required column is diagnosed by
-- NOT NULL (23502), not mis-reported as a cross-org reference.
create or replace function ops._guard_item_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_wip_org  uuid;
  v_conf_org uuid;
begin
  if tg_op = 'UPDATE' and new.org_id is distinct from old.org_id then
    raise exception 'org_id is immutable on an item unit' using errcode = '42501';
  end if;
  if new.wip_item_id is not null then
    select w.org_id into v_wip_org from ops.wip_items w where w.id = new.wip_item_id;
    if v_wip_org is distinct from new.org_id then
      raise exception 'wip_item_id must belong to the same org as the item unit'
        using errcode = '23514';
    end if;
  end if;
  if new.confirmed_by is not null then
    select p.org_id into v_conf_org from shared.people p where p.id = new.confirmed_by;
    if v_conf_org is distinct from new.org_id then
      raise exception 'confirmed_by must belong to the same org as the item unit'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
comment on function ops._guard_item_unit() is
  'Guard: org_id immutable (42501); wip_item_id and confirmed_by must be same-org (23514). SECURITY INVOKER.';

create trigger item_units_guard
  before insert or update on ops.item_units
  for each row execute function ops._guard_item_unit();

-- ── 3. Grants + RLS (mirrors ops.wip_items — master data, ops_lead/admin write) ──────────────
grant select, insert, update on ops.item_units to authenticated;
grant select                 on ops.item_units to service_role;

alter table ops.item_units enable row level security;
alter table ops.item_units force  row level security;

create policy item_units_select_org on ops.item_units
  for select to authenticated
  using (org_id = shared.current_org_id());
comment on policy item_units_select_org on ops.item_units is
  'Org-readable: an UNCONFIRMED row is visible to the org — its absence from the capture form is the DD-WAY-29 query predicate, never a visibility trick.';

create policy item_units_insert_ops on ops.item_units
  for insert to authenticated
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));

create policy item_units_update_ops on ops.item_units
  for update to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')))
  with check (org_id = shared.current_org_id()
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
comment on policy item_units_update_ops on ops.item_units is
  'Master-data write is ops_lead/admin only, exactly like wip_items: the confirmation decides what every capture surface can record (FR-030). The procurement/ops-support distinction is a UI-level role read, not a new access role.';

-- ── 4. Backfill: the incumbent single-unit coordinates become confirmed default rows ─────────
-- Every active-or-not item whose esb_product_detail_id_porsi is set gets a confirmed 'porsi'
-- default row. Migrated AS CONFIRMED: those coordinates post to the ERP today, and leaving them
-- unconfirmed would empty the live kitchen form the moment the gate lands. confirmed_by is NULL
-- (system migration — no person recorded this confirmation in MOS). The old columns stay in
-- place, expand-don't-contract: the outbox worker still composes from them until it is pointed
-- here by a later ticket.
insert into ops.item_units
  (org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id, is_default, confirmed_at)
select w.org_id, w.id, 'porsi', w.esb_product_detail_id_porsi, w.esb_product_id, true, now()
from ops.wip_items w
where w.esb_product_detail_id_porsi is not null
on conflict (wip_item_id, unit_name) do nothing;

-- ── 5. The gated read path: ops.capture_form_items ───────────────────────────────────────────
-- The DD-WAY-29 gate as a query predicate (NFR-004): the capture form's item source. One row per
-- confirmed (item, unit) on an active item; an unconfirmed pair is ABSENT — no flag column is
-- consulted at render time, there is nothing to consult. Org-wide, not stream-partitioned
-- (FR-011, #222 owner deferral): a bar item enters as its own row with its own confirmed
-- coordinates, never by reusing a kitchen row's (OD-WAY-47).
--
-- security_invoker, so the base tables' RLS scopes the result to the caller's org — same pattern
-- as mos.process_run_rollup.
create view ops.capture_form_items as
select
  w.id       as wip_item_id,
  w.name,
  w.category,
  u.id       as item_unit_id,
  u.unit_name,
  u.is_default,
  u.esb_product_detail_id,
  u.esb_product_id
from ops.wip_items w
join ops.item_units u on u.wip_item_id = w.id
where w.flag_active
  and u.confirmed_at is not null;

alter view ops.capture_form_items set (security_invoker = true);
comment on view ops.capture_form_items is
  'The capture form''s item source: confirmed item-units on active items ONLY (FR-011, DD-WAY-29, NFR-004). Absence, not warning. security_invoker — base-table RLS scopes the org.';

grant select on ops.capture_form_items to authenticated;

-- ── 6. Test fixture: ops._test_seed_cafe() grows item-unit rows ──────────────────────────────
-- Full replacement of the baseline fixture (create or replace — the baseline file stays the
-- reference for everything above the item_units block). New fixture ids, prefix 'de':
--   ...de01  ab01 Nasi Goreng  'porsi'  CONFIRMED default — the migrated shape
--   ...de02  ab02 Ayam Bakar   'porsi'  CONFIRMED default
--   ...de03  ab03 Es Teh       'porsi'  coordinates present, NOT confirmed — AC-003's subject
--   ...de09  ab09 B-Item       'porsi'  CONFIRMED default, org B — the cross-tenant negative
-- Es Teh is deliberately the unconfirmed one: it is planned on the (Gordi HQ, bar) stream in the
-- plans fixture, so the gate's absence is proven against an item a stream genuinely uses.
create or replace function ops._test_seed_cafe()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_cafe is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  -- shared._test_seed_directory() is NOT called from here, and that is not an oversight. It is not
  -- idempotent — it inserts the two orgs by primary key with no conflict clause — so a fixture that
  -- called it internally would abort any test file that also called it explicitly, which every file
  -- needing the access-role tree must. The `mos` half has the same contract: the caller seeds the
  -- directory, then the schema fixture extends it.
  --
  -- ── Branches ────────────────────────────────────────────────────────────────────────────────
  -- Codes match the catalog's own seed so an assertion written against either finds the same value.
  -- 'Bungur' is NOT here: it is the incumbent's UI label for Rumah Rames, and the one place it
  -- legitimately appears is the label derivation.
  insert into shared.branches (id, org_id, code, name) values
    ('00000000-0000-0000-0000-00000000bf01','00000000-0000-0000-0000-0000000000a1','gordi_hq','Gordi HQ'),
    ('00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-0000000000a1','rumah_rames','Rumah Rames'),
    ('00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-0000000000a1','radiant','Radiant'),
    ('00000000-0000-0000-0000-00000000bf09','00000000-0000-0000-0000-0000000000b1','b_branch','B-Branch')
  on conflict (id) do nothing;

  -- ── Business units ──────────────────────────────────────────────────────────────────────────
  insert into shared.business_units (id, org_id, name) values
    ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar'),
    ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B-Kitchen')
  on conflict (id) do nothing;

  -- ── A live ops_lead grant ───────────────────────────────────────────────────────────────────
  -- Stated plainly so nobody reads more into it than is there: RLS policies consult
  -- shared.has_access_role, which reads the JWT access_roles claim, NOT this table — the claim is
  -- hook-injected from here at login. So an assertion selects its persona by setting the claim, and
  -- this row exists to keep the fixture consistent with the source that claim comes from, not to
  -- drive any policy. The shared fixture seeds Author ...0d1's ops_lead already-revoked, which is
  -- what makes her the honest negative subject; this grants it live to DirectMgr ...0d2.
  insert into shared.person_access_roles (org_id, person_id, access_role) values
    ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d2','ops_lead')
  on conflict do nothing;

  -- ── Master data ─────────────────────────────────────────────────────────────────────────────
  insert into ops.wip_items (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi) values
    ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000a1','Nasi Goreng','Mains',true,'BOM-001','PD-PORSI-001'),
    ('00000000-0000-0000-0000-00000000ab02','00000000-0000-0000-0000-0000000000a1','Ayam Bakar','Mains',true,'BOM-002','PD-PORSI-002'),
    ('00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-0000000000a1','Es Teh','Drinks',true,'BOM-003','PD-PORSI-003')
  on conflict (id) do nothing;
  insert into ops.wip_items (id, org_id, name, flag_active) values
    ('00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-0000000000b1','B-Item',true)
  on conflict (id) do nothing;

  -- ── Item units (#232) ───────────────────────────────────────────────────────────────────────
  -- de01/de02 are the migrated shape: confirmed 'porsi' defaults with confirmed_by NULL, exactly
  -- what the backfill produces. de03 (Es Teh) carries coordinates but NO confirmation — the
  -- DD-WAY-29 negative. de09 is org B's confirmed default, the view's cross-tenant negative.
  insert into ops.item_units
    (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
    ('00000000-0000-0000-0000-00000000de01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab01','porsi','PD-PORSI-001',true,'2026-06-01T00:00:00Z'),
    ('00000000-0000-0000-0000-00000000de02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab02','porsi','PD-PORSI-002',true,'2026-06-01T00:00:00Z')
  on conflict (id) do nothing;
  insert into ops.item_units
    (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default) values
    ('00000000-0000-0000-0000-00000000de03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab03','porsi','PD-PORSI-003',true)
  on conflict (id) do nothing;
  insert into ops.item_units
    (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
    ('00000000-0000-0000-0000-00000000de09','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000ab09','porsi','PD-PORSI-B09',true,'2026-06-01T00:00:00Z')
  on conflict (id) do nothing;

  -- ── Plans ───────────────────────────────────────────────────────────────────────────────────
  insert into ops.kitchen_plans
    (id, org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by) values
    ('00000000-0000-0000-0000-00000000ae01','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,20,'00000000-0000-0000-0000-0000000000d2'),
    ('00000000-0000-0000-0000-00000000ae02','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03',5,'00000000-0000-0000-0000-0000000000d2'),
    ('00000000-0000-0000-0000-00000000ae03','00000000-0000-0000-0000-0000000000a1','2026-06-20','00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-00000000bf01','bar','produce',null,4,'00000000-0000-0000-0000-0000000000d2')
  on conflict (id) do nothing;
  insert into ops.kitchen_plans
    (id, org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi) values
    ('00000000-0000-0000-0000-00000000ae09','00000000-0000-0000-0000-0000000000b1','2026-06-20','00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-00000000bf09','kitchen','produce',null,9)
  on conflict (id) do nothing;

  -- ── Logs: the incumbent's stream, all three movement shapes ─────────────────────────────────
  -- 2026-06-20, item ab01, (Rumah Rames, kitchen). ac01..ac03 + ac06 produce; ac04 transfers to
  -- Radiant (a real ERP movement); ac05 transfers within Rumah Rames's own books — the movement the
  -- incumbent labels "Transfer to Bungur" and the ERP never sees.
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ac01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',8,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',5,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab01',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',2,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;

  -- 2026-06-21 item ab02 and 2026-06-22 item ab03, same stream: the stock arithmetic suite, including
  -- a day whose only movement is a transfer, so the balance goes negative and is preserved (FR-061).
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ad01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab02',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab02',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',9,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-22','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab03',100,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;

  -- Two of the four streams the incumbent never covered — the ones that reach the ERP on a paper
  -- form a supervisor retypes (OD-WAY-27). Same table, same shape, no new surface.
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ac11','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',7,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac12','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf01','bar','produce',null,'00000000-0000-0000-0000-00000000ab03',6,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;

  -- ── Imported history, and the posted/unposted pair the enqueue refusal is proven against ─────
  -- aa01 is what the flip actually creates (OD-WAY-38): a Teable row with no MOS submitter, landing
  -- Approved, carrying the ERP document the live system ALREADY HOLDS. aa02 is the control — a
  -- MOS-authored batch that has not been posted, so the refusal has something it must still allow.
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, source, submitted_by, batch_id, posted_to_esb, esb_doc_num, posted_at) values
    ('00000000-0000-0000-0000-00000000aa01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',11,'Approved','teable_import',null,'PR-20260601-001',true,'ESB-HISTORIC-0001','2026-06-01T10:00:00Z'),
    ('00000000-0000-0000-0000-00000000aa02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-02','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',6,'Approved','mos','00000000-0000-0000-0000-0000000000d1','PR-20260602-001',false,null,null)
  on conflict (id) do nothing;

  -- ── The cross-tenant negative ───────────────────────────────────────────────────────────────
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ac09','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb09','2026-06-20','00000000-0000-0000-0000-00000000bf09','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab09',9,'Submitted','00000000-0000-0000-0000-0000000000b4')
  on conflict (id) do nothing;

  -- ── Stock ───────────────────────────────────────────────────────────────────────────────────
  insert into ops.kitchen_stock (id, org_id, log_date, wip_item_id, branch_id, activity, usable_qty) values
    ('00000000-0000-0000-0000-00000000af01','00000000-0000-0000-0000-0000000000a1','2026-06-19','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf02','kitchen',10),
    ('00000000-0000-0000-0000-00000000af02','00000000-0000-0000-0000-0000000000a1','2026-06-19','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000bf01','kitchen',3)
  on conflict (id) do nothing;
  insert into ops.kitchen_stock (id, org_id, log_date, wip_item_id, branch_id, activity, usable_qty) values
    ('00000000-0000-0000-0000-00000000af09','00000000-0000-0000-0000-0000000000b1','2026-06-19','00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-00000000bf09','kitchen',99)
  on conflict (id) do nothing;

  -- ── Outbox rows, one per org ────────────────────────────────────────────────────────────────
  -- Both reference UNPOSTED batches: the enqueue refusal is a real trigger on this table, so a
  -- fixture pointing at posted history would fail to seed rather than fail an assertion.
  insert into integrations.esb_push (id, org_id, source_module, source_ref, endpoint, dedup_key) values
    ('00000000-0000-0000-0000-00000000ba01','00000000-0000-0000-0000-0000000000a1','kitchen','PR-20260602-001','assembly-actual','kitchen|PR-20260602-001|dry_run'),
    ('00000000-0000-0000-0000-00000000ba09','00000000-0000-0000-0000-0000000000b1','kitchen','PR-20260620-B01','assembly-actual','kitchen|PR-20260620-B01|dry_run')
  on conflict (id) do nothing;
end;
$$;
comment on function ops._test_seed_cafe() is
  'TEST-ONLY fixture (SECURITY DEFINER): branch catalog for both test orgs, Kitchen-and-Bar BU, WIP items, item units (#232: confirmed defaults + one unconfirmed + a cross-tenant row), plans, Submitted logs across four production streams, imported history, and stock — plus a live ops_lead. Call AFTER shared._test_seed_directory(), inside begin;...rollback; with app.allow_test_seeds=on.';
revoke execute on function ops._test_seed_cafe() from public, anon, authenticated;
