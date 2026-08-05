-- ops.item_units + ops.capture_form_items — the DD-WAY-29 gate and its fail-closed proofs (#232).
--
-- OWNS: AC-003 — an unconfirmed item-unit is ABSENT from the capture form's item query; a
--                confirmation event recorded by the master-data write role (ops_lead — the
--                procurement/ops-support distinction is a UI-level role read, not an access
--                role) makes it present. The read is org-wide, NOT stream-partitioned (#222
--                owner deferral): the view carries no stream dimension at all, so "absent for
--                every stream" and "present for every stream" are one assertion each — there
--                is no stream axis on which the answer could differ, which is the deferral
--                made structural.
--       Confirmation provenance (FR-030) — the event is server-stamped: client-supplied
--                who/when is overridden, and changing the ERP coordinates on a confirmed row
--                VOIDS the confirmation (DD-WAY-29 — the row leaves the form until
--                re-confirmed).
--       The capture/stock reader split — the gate scopes the CAPTURE form only (FR-011); the
--                stock/verification plane (FR-060, OD-WAY-45) keeps seeing every active item.
--       The migration's own backfill (§4), exercised verbatim against fresh rows.
--       Fail-closed proofs for every policy created in 20260807000001_ops_item_units.sql
--       (ops_03_policy_fail_closed.sql conventions: one negative per policy, each paired with
--       the positive it is the negative of; zero-row updates read back as owner).
--
-- Personas (shared fixture): Author ...0d1 member+finance (her ops_lead is seeded already-revoked
-- — the honest negative subject for every ops_lead gate); Peer ...0d4 member (the same-org person
-- a forged confirmation would be attributed to); DirectMgr ...0d2 ops_lead (the positive subject
-- and the confirmation recorder).
--
-- Fixture rows (ops._test_seed_cafe): de01/de02 confirmed 'porsi' defaults (the migrated shape,
-- confirmed_by NULL); de03 Es Teh — coordinates present, NOT confirmed, and planned on the
-- (Gordi HQ, bar) stream, so the absence is proven against an item a stream genuinely uses;
-- de09 org B's confirmed row, the cross-tenant negative.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- The Café BU is resolved by CODE, nothing else (kitchen-logs.ts resolveKitchenBuId — resolving
-- by display name broke on rename once already). A fixture BU without the code is a BU the app
-- cannot find, which is exactly the failure a mocked resolver hides.
select is(
  (select code from shared.business_units where id = '00000000-0000-0000-0000-00000000bb01'),
  'retail_ops',
  'fixture: the seeded Kitchen-and-Bar BU carries code=retail_ops — the sole handle the app resolves it by');

set local role authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. AC-003 — the gate is a query predicate (NFR-004): absence, then presence on confirmation
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';

select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000ab03'),
  0,
  'AC-003: an item-unit with no confirmed ERP coordinates is ABSENT from the capture form query — not disabled, not warned (DD-WAY-29)');

select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000ab01'),
  1,
  'AC-003 (positive pair): a confirmed item-unit IS present, so the absence above is the predicate and not an empty view');

-- The absence is the GATE, not a visibility trick: the unconfirmed row itself is org-readable.
select is(
  (select count(*)::int from ops.item_units
    where id = '00000000-0000-0000-0000-00000000de03'),
  1,
  'AC-003: the unconfirmed row is visible on the base table to any org member — its absence from the form is a query predicate, never RLS');

-- The gate scopes the CAPTURE form only (FR-011). The stock surface is the verification plane
-- (FR-060, OD-WAY-45) and reads active items UNGATED — an unconfirmed item still has real
-- balances to verify, and hiding it there would blind the very control that audits the gate.
select is(
  (select count(*)::int from ops.wip_items
    where id = '00000000-0000-0000-0000-00000000ab03' and flag_active),
  1,
  'reader split: the same unconfirmed item stays present in the ungated active-item read the stock surface uses (FR-060)');

-- The confirmation event (FR-030), with FORGED provenance: the client claims Peer confirmed it
-- back in 2020. The stamp trigger must discard both and record the SESSION person, now.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  update ops.item_units
     set confirmed_at = '2020-01-01T00:00:00Z',
         confirmed_by = '00000000-0000-0000-0000-0000000000d4'
   where id = '00000000-0000-0000-0000-00000000de03'
  $$,
  'FR-030: ops_lead records the confirmation event on the item-unit');

select is(
  (select confirmed_by from ops.item_units where id = '00000000-0000-0000-0000-00000000de03'),
  '00000000-0000-0000-0000-0000000000d2'::uuid,
  'FR-030 provenance: confirmed_by is stamped from the SESSION person — the client-supplied peer attribution is overridden');

select is(
  (select confirmed_at from ops.item_units where id = '00000000-0000-0000-0000-00000000de03'),
  now(),
  'FR-030 provenance: confirmed_at is stamped now() — the client-supplied back-date is overridden');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000ab03'),
  1,
  'AC-003: the confirmation event makes the pair present in the form query — org-wide, no stream axis to differ on (#222)');

-- Re-pointing a CONFIRMED row voids its confirmation (DD-WAY-29): new coordinates are an
-- unconfirmed claim, whoever writes them — the row must leave the form until re-confirmed,
-- even when the same statement pretends to re-confirm it.
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.item_units
   set esb_product_detail_id = 'PD-PORSI-001-MOVED',
       confirmed_at = now(), confirmed_by = '00000000-0000-0000-0000-0000000000d2'
 where id = '00000000-0000-0000-0000-00000000de01';

select is(
  (select confirmed_at from ops.item_units where id = '00000000-0000-0000-0000-00000000de01'),
  null::timestamptz,
  'DD-WAY-29: changing the ERP coordinates on a confirmed row clears the confirmation — even against an in-statement re-confirm claim');

select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000ab01'),
  0,
  'DD-WAY-29: the re-pointed row is gone from the capture form until a separate confirmation event re-admits it');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. Fail-closed, one per policy (ops_03 conventions)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- item_units_select_org
set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.item_units), 0,
  'item_units_select_org: a claimless session reads zero item units');

select is((select count(*)::int from ops.capture_form_items), 0,
  'capture_form_items: a claimless session reads an empty form — security_invoker, the base-table RLS is the scope');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';
select isnt((select count(*)::int from ops.item_units), 0,
  'item_units_select_org (positive): a member reads the org''s item units');

select is(
  (select count(*)::int from ops.item_units
    where org_id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'item_units_select_org: another org''s rows are invisible — cross-org stays fail-closed');

select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000ab09'),
  0,
  'capture_form_items: another org''s confirmed item-unit never reaches this org''s form');

-- item_units_insert_ops
select throws_ok($$
  insert into ops.item_units (wip_item_id, unit_name, esb_product_detail_id)
  values ('00000000-0000-0000-0000-00000000ab01','member-added','PD-X')
  $$, '42501', 'new row violates row-level security policy for table "item_units"',
  'item_units_insert_ops: a member without ops_lead cannot add master data — the confirmation decides what every capture surface can record');

-- item_units_update_ops — USING excludes the member, so the UPDATE silently affects zero rows;
-- read the surviving state back as owner to prove nothing moved.
update ops.item_units set unit_name = 'member renamed'
 where id = '00000000-0000-0000-0000-00000000de01';
reset role;
select is(
  (select unit_name from ops.item_units where id = '00000000-0000-0000-0000-00000000de01'),
  'porsi',
  'item_units_update_ops: a member''s edit affects zero rows — the unit name is unchanged');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select lives_ok($$
  insert into ops.item_units (wip_item_id, unit_name, esb_product_detail_id)
  values ('00000000-0000-0000-0000-00000000ab01','botol','PD-BOTOL-001')
  $$,
  'item_units_insert_ops (positive): ops_lead CAN add an item-unit, so the refusal above is the role gate and not a dead policy');
-- (item_units_update_ops' positive is the confirmation update in section A.)

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. The guard and the shape constraints
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Same-org FK seam: under INVOKER RLS the org-B item is invisible, the lookup returns NULL, 23514.
select throws_ok($$
  insert into ops.item_units (wip_item_id, unit_name, esb_product_detail_id)
  values ('00000000-0000-0000-0000-00000000ab09','porsi','PD-EVIL')
  $$, '23514', 'wip_item_id must belong to the same org as the item unit',
  '_guard_item_unit: an item-unit cannot reference another org''s wip item');

-- confirmed_by is held to the same seam (org B person ...0b4). The guard fires on the
-- client-supplied value BEFORE the stamp trigger overrides it (alphabetical trigger order),
-- so a cross-org attribution is refused rather than silently corrected.
select throws_ok($$
  update ops.item_units
     set confirmed_by = '00000000-0000-0000-0000-0000000000b4'
   where id = '00000000-0000-0000-0000-00000000de02'
  $$, '23514', 'confirmed_by must belong to the same org as the item unit',
  '_guard_item_unit: a confirmation cannot be attributed to another org''s person');

-- org_id immutability.
select throws_ok($$
  update ops.item_units
     set org_id = '00000000-0000-0000-0000-0000000000b1'
   where id = '00000000-0000-0000-0000-00000000de01'
  $$, '42501', 'org_id is immutable on an item unit',
  '_guard_item_unit: org_id cannot be moved to another tenant');

-- A confirmation asserts coordinates, so there must BE coordinates (FR-030/022).
select throws_ok($$
  insert into ops.item_units (wip_item_id, unit_name, confirmed_at)
  values ('00000000-0000-0000-0000-00000000ab02','tanpa-koordinat', now())
  $$, '23514', null,
  'item_units_confirmed_has_coordinates: a row cannot be confirmed with no product-detail coordinate');

-- Exactly one default unit per item.
select throws_ok($$
  insert into ops.item_units (wip_item_id, unit_name, esb_product_detail_id, is_default)
  values ('00000000-0000-0000-0000-00000000ab01','gelas','PD-GELAS-001', true)
  $$, '23505', null,
  'item_units_one_default_uidx: a second default unit for the same item is refused');

-- One row per (item, unit name).
select throws_ok($$
  insert into ops.item_units (wip_item_id, unit_name, esb_product_detail_id)
  values ('00000000-0000-0000-0000-00000000ab01','porsi','PD-DUP')
  $$, '23505', null,
  'item_units_unit_per_item_uk: a duplicate unit name on the same item is refused');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. The backfill (migration §4), exercised verbatim
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The migration ran against an empty database, so its backfill has no output to inspect here.
-- These fresh rows recreate its input and run THE SAME STATEMENT — keep the INSERT below in
-- lockstep with 20260807000001_ops_item_units.sql §4, verbatim. Claims are cleared to mirror
-- the migration context (no session person → confirmed_by NULL, the system-migrated shape).
reset role;
set local request.jwt.claims = '{}';

insert into ops.wip_items (id, org_id, name, flag_active, esb_product_detail_id_porsi, esb_product_id) values
  ('00000000-0000-0000-0000-00000000dd01','00000000-0000-0000-0000-0000000000a1','Backfill Subject',true,'PD-PORSI-D01','P-D01');
insert into ops.wip_items (id, org_id, name, flag_active) values
  ('00000000-0000-0000-0000-00000000dd02','00000000-0000-0000-0000-0000000000a1','No Coordinates',true);

insert into ops.item_units
  (org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id, is_default, confirmed_at)
select w.org_id, w.id, 'porsi', w.esb_product_detail_id_porsi, w.esb_product_id, true, now()
from ops.wip_items w
where w.esb_product_detail_id_porsi is not null
on conflict (wip_item_id, unit_name) do nothing;

select is(
  (select count(*)::int from ops.item_units
    where wip_item_id = '00000000-0000-0000-0000-00000000dd01'
      and unit_name = 'porsi' and is_default
      and esb_product_detail_id = 'PD-PORSI-D01' and esb_product_id = 'P-D01'
      and confirmed_at is not null and confirmed_by is null),
  1,
  'backfill: an item with a porsi coordinate gets EXACTLY ONE confirmed default porsi row, coordinates copied, confirmed_by NULL (system-migrated)');

select is(
  (select count(*)::int from ops.item_units
    where wip_item_id = '00000000-0000-0000-0000-00000000dd02'),
  0,
  'backfill: an item with NO porsi coordinate gets no row at all — nothing to confirm, nothing to migrate');

-- Re-run: the conflict target keeps it idempotent — a second application doubles nothing.
insert into ops.item_units
  (org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id, is_default, confirmed_at)
select w.org_id, w.id, 'porsi', w.esb_product_detail_id_porsi, w.esb_product_id, true, now()
from ops.wip_items w
where w.esb_product_detail_id_porsi is not null
on conflict (wip_item_id, unit_name) do nothing;

select is(
  (select count(*)::int from ops.item_units
    where wip_item_id = '00000000-0000-0000-0000-00000000dd01'),
  1,
  'backfill: re-applying the statement is a no-op — still exactly one row');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';

select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000dd01'),
  1,
  'backfill: the migrated row is on the capture form — the live kitchen form does not empty at the flip');

select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000dd02'),
  0,
  'backfill: the coordinate-less item is absent from the capture form (DD-WAY-29), while still readable as an active item for stock');

reset role;
select * from finish();
rollback;
