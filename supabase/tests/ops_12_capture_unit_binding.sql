-- ops.kitchen_logs.item_unit_id + the offerability read — the unit binding proofs (#234).
--
-- OWNS: FR-020 server half — a row submitted with NO unit records the item's DEFAULT unit
--                (the common path enters no unit, yet every submitted row carries which
--                item-unit its quantity means).
--       FR-021/022 server half — an explicit binding (the "change unit" path) lands on the
--                row, must reference a unit of the row's OWN wip item in the row's own org
--                (23514 both ways), and is immutable after insert (42501 — provenance, like
--                submitted_by).
--       FR-032 substrate — ops.capture_form_items carries is_transferable, and the DD-WAY-29
--                confirmed gate is unchanged by the view replace: an unconfirmed alternate is
--                absent, a confirmed one is present whatever its flag (the OFFERING filter is
--                the capture reader's — AC-015 is unit-layer, owned in Vitest).
--       The migration's backfill (…0001 §2), exercised verbatim against a fresh row.
--       Fail-closed unchanged: the replaced view still runs security_invoker — a claimless
--                session reads an empty form.
--
-- Personas (shared fixture): Author ...0d1 member (submits logs); DirectMgr ...0d2 ops_lead.
-- Fixture rows (ops._test_seed_cafe): de01 ab01/porsi confirmed default; de02 ab02/porsi
-- confirmed default; de09 org B's confirmed default (the cross-org negative).
-- Inline rows below (this file's own, ops_11 §D convention): de04/de05 confirmed alternates of
-- ab02 (transferable / NON-transferable), de06 an UNCONFIRMED alternate of ab02.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- Alternate units for Ayam Bakar (ab02), inserted here rather than grown in the shared fixture
-- so ops_11's per-item view counts stay untouched. Superuser context, claims cleared — the
-- confirmation stamp records confirmed_by NULL, the system-migrated shape (ops_11 §D pattern).
set local request.jwt.claims = '{}';
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, confirmed_at, is_transferable) values
  ('00000000-0000-0000-0000-00000000de04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab02','botol','PD-BOTOL-002',now(),true),
  ('00000000-0000-0000-0000-00000000de05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab02','karton','PD-KARTON-002',now(),false);
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_transferable) values
  ('00000000-0000-0000-0000-00000000de06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab02','gelas','PD-GELAS-002',true);

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. The view: is_transferable exposed, the confirmed gate unchanged (FR-032 substrate)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000ab02'),
  3,
  'the view returns every CONFIRMED unit of an item — porsi default + both confirmed alternates; the DD-WAY-29 gate is per-row and unchanged by the replace');

select is(
  (select count(*)::int from ops.capture_form_items
    where item_unit_id = '00000000-0000-0000-0000-00000000de06'),
  0,
  'an UNCONFIRMED alternate is absent from the view — confirmation gates alternates exactly as it gates defaults');

select is(
  (select is_transferable from ops.capture_form_items
    where item_unit_id = '00000000-0000-0000-0000-00000000de05'),
  false,
  'FR-032: the view carries the ERP transfer flag, so the capture reader can refuse to OFFER a non-transferable alternate (the row itself stays readable — it is real master data)');

select is(
  (select is_transferable from ops.capture_form_items
    where item_unit_id = '00000000-0000-0000-0000-00000000de04'),
  true,
  'FR-032 (positive pair): a transferable alternate reads true — the false above is the flag, not a dead column');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- B. FR-020: no unit sent → the item's DEFAULT unit lands on the submitted row
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  insert into ops.kitchen_logs
    (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values
    ('00000000-0000-0000-0000-00000000bb01','2026-06-23',
     '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
     '00000000-0000-0000-0000-00000000ab01',5)
  $$,
  'FR-020: a member submits a production row with NO unit — the common path enters no unit at all');

select is(
  (select item_unit_id from ops.kitchen_logs
    where log_date = '2026-06-23'
      and wip_item_id = '00000000-0000-0000-0000-00000000ab01'
      and submitted_by = '00000000-0000-0000-0000-0000000000d1'),
  '00000000-0000-0000-0000-00000000de01'::uuid,
  'FR-020/022: the row bound to the item''s DEFAULT unit server-side — every submitted row names which ERP coordinate its quantity means');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- C. FR-021/022: an explicit alternate binds; wrong-item and cross-org bindings are refused
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select lives_ok($$
  insert into ops.kitchen_logs
    (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, item_unit_id)
  values
    ('00000000-0000-0000-0000-00000000bb01','2026-06-23',
     '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
     '00000000-0000-0000-0000-00000000ab02',2,
     '00000000-0000-0000-0000-00000000de04')
  $$,
  'FR-021: the "change unit" path — an explicit alternate binding is accepted');

select is(
  (select item_unit_id from ops.kitchen_logs
    where log_date = '2026-06-23'
      and wip_item_id = '00000000-0000-0000-0000-00000000ab02'
      and submitted_by = '00000000-0000-0000-0000-0000000000d1'),
  '00000000-0000-0000-0000-00000000de04'::uuid,
  'FR-022: the submitted row carries THAT item-unit — the alternate is a distinct ERP coordinate, never a label');

select throws_ok($$
  insert into ops.kitchen_logs
    (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, item_unit_id)
  values
    ('00000000-0000-0000-0000-00000000bb01','2026-06-23',
     '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
     '00000000-0000-0000-0000-00000000ab01',1,
     '00000000-0000-0000-0000-00000000de04')
  $$, '23514', 'item_unit_id must reference a unit of the log''s own wip item',
  '_bind_kitchen_log_item_unit: a row cannot bind another ITEM''s unit — the coordinate would price the wrong product');

select throws_ok($$
  insert into ops.kitchen_logs
    (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, item_unit_id)
  values
    ('00000000-0000-0000-0000-00000000bb01','2026-06-23',
     '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
     '00000000-0000-0000-0000-00000000ab01',1,
     '00000000-0000-0000-0000-00000000de09')
  $$, '23514', 'item_unit_id must belong to the same org as the kitchen log',
  '_bind_kitchen_log_item_unit: another org''s unit is invisible under INVOKER RLS and refused — cross-org stays fail-closed');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- D. The binding is immutable — at the grant for clients, at the trigger for everyone else
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- item_unit_id is NOT in the authenticated UPDATE column grant (…0010 grants a column LIST), so
-- a client rebind dies at the grant before any trigger runs.
select throws_ok($$
  update ops.kitchen_logs
     set item_unit_id = '00000000-0000-0000-0000-00000000de04'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', null,
  'a client cannot rebind a log''s unit — item_unit_id is outside the UPDATE column grant');

-- The trigger arm covers the paths the grant does not (service_role, definer functions).
reset role;
select throws_ok($$
  update ops.kitchen_logs
     set item_unit_id = '00000000-0000-0000-0000-00000000de04'
   where id = '00000000-0000-0000-0000-00000000ac01'
  $$, '42501', 'item_unit_id is immutable on a kitchen log',
  '_bind_kitchen_log_item_unit: the binding is immutable even for a privileged writer — which unit a quantity was captured in is provenance, like submitted_by');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- E. The backfill (migration §2), exercised verbatim
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The migration ran against an empty database, so its backfill has no output to inspect here.
-- Recreate its input: a log whose item had NO unit row at insert time (the bind trigger resolves
-- nothing and leaves NULL — the nullable-by-design case), then a default unit arrives, then THE
-- SAME STATEMENT as 20260810000001 §2 — keep the UPDATE below in lockstep with it, verbatim.
set local request.jwt.claims = '{}';
insert into ops.wip_items (id, org_id, name, flag_active) values
  ('00000000-0000-0000-0000-00000000dd11','00000000-0000-0000-0000-0000000000a1','Backfill Subject',true);
insert into ops.kitchen_logs
  (id, org_id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, submitted_by) values
  ('00000000-0000-0000-0000-00000000ac21','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-23','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000dd11',3,'00000000-0000-0000-0000-0000000000d1');

select is(
  (select item_unit_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac21'),
  null::uuid,
  'an item with no unit row binds nothing — the column is nullable BY DESIGN for pre-master-data history');

insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default) values
  ('00000000-0000-0000-0000-00000000dd12','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000dd11','porsi','PD-PORSI-D11',true);

update ops.kitchen_logs l
   set item_unit_id = u.id
  from ops.item_units u
 where u.wip_item_id = l.wip_item_id
   and u.is_default
   and l.item_unit_id is null;

select is(
  (select item_unit_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac21'),
  '00000000-0000-0000-0000-00000000dd12'::uuid,
  'backfill: the migration''s own statement binds the stranded row to the item''s default unit once one exists');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- F. Fail-closed unchanged: the replaced view still runs as the caller
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.capture_form_items), 0,
  'capture_form_items: a claimless session still reads an EMPTY form — security_invoker survived the view replace');

reset role;
select * from finish();
rollback;
