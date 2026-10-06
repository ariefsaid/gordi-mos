-- ops.kitchen_logs.item_unit_id + the offerability read — the unit binding proofs (#234).
--
-- OWNS: FR-020 server half — a row submitted with NO unit records the item's DEFAULT unit
--                (the common path enters no unit, yet every submitted row carries which
--                item-unit its quantity means).
--       FR-022 server half — a binding must reference a unit of the row's OWN wip item in the
--                row's own org, and is immutable after insert (42501 — provenance, like
--                submitted_by). A new MOS row on an ESB item binds only its stream default
--                (ops_21 owns that refusal); the explicit alternate of FR-021 existed only for
--                hand-made items, which take no new logs (OD-2026-10-06-ESB-ITEMS).
--       FR-032 substrate — ops.capture_form_items carries is_transferable, and the DD-WAY-29
--                confirmed gate is unchanged by the view replace: an unconfirmed alternate is
--                absent, a confirmed one is present whatever its flag (the OFFERING filter is
--                the capture reader's — AC-015 is unit-layer, owned in Vitest).
--       The migration's backfill (…0001 §2), exercised verbatim against a fresh row.
--       Fail-closed unchanged: the replaced view still runs security_invoker — a claimless
--                session reads an empty form.
--
-- Personas (shared fixture): Author ...0d1 member (submits logs); DirectMgr ...0d2 ops_lead.
-- Fixture rows (ops._test_seed_cafe): de01 ab01/porsi confirmed default of an ESB item; de09 org
-- B's confirmed default (the cross-org negative).
-- Inline rows below: c131, a hand-made item from before OD-2026-10-06-ESB-ITEMS (replica mode, the
-- way a pre-existing row looks), with a confirmed porsi default (c1d0), de04/de05 confirmed
-- alternates (transferable / NON-transferable) and de06 an UNCONFIRMED alternate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();

-- #744: the production-log insert gate arms on stream-Team affiliation. Author ...0d1 is this
-- file's submitting member, so the fixture gives her a live (Gordi HQ, bar) membership — the unit
-- binding contracts below are orthogonal to the gate and now run as an AFFILIATED member, which
-- is the persona the page actually serves. The Café fixture seeds that real stream, so the
-- membership uses it rather than creating a duplicate coordinate.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', t.id, true
from shared.teams t
where t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'gordi_hq_bar';

set local session_replication_role = replica;
insert into ops.wip_items (id, org_id, name, category, flag_active, kind, reference_source) values
  ('00000000-0000-0000-0000-00000000c131','00000000-0000-0000-0000-0000000000a1','Legacy unit WIP','Drinks',true,'WIP','manual');
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at, is_transferable) values
  ('00000000-0000-0000-0000-00000000c1d0','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000c131','porsi','PD-PORSI-C131',true,now(),true),
  ('00000000-0000-0000-0000-00000000de04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000c131','botol','PD-BOTOL-C131',false,now(),true),
  ('00000000-0000-0000-0000-00000000de05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000c131','karton','PD-KARTON-C131',false,now(),false),
  ('00000000-0000-0000-0000-00000000de06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000c131','gelas','PD-GELAS-C131',false,null,true);
set local session_replication_role = origin;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","finance"]}');

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A. The view: is_transferable exposed, the confirmed gate unchanged (FR-032 substrate)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from ops.capture_form_items
    where wip_item_id = '00000000-0000-0000-0000-00000000c131'),
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
-- C. FR-022: another item's or another org's unit is refused on a new row
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- On an ESB item the binder answers with its default-unit rule before the generic seam check; the
-- generic seam itself is exercised by the first-fill arm in section E.
select throws_ok($$
  insert into ops.kitchen_logs
    (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, item_unit_id)
  values
    ('00000000-0000-0000-0000-00000000bb01','2026-06-23',
     '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
     '00000000-0000-0000-0000-00000000ab01',1,
     '00000000-0000-0000-0000-00000000de04')
  $$, 'P0015', null,
  '_bind_kitchen_log_item_unit: a row cannot bind another ITEM''s unit — the coordinate would price the wrong product');

select throws_ok($$
  insert into ops.kitchen_logs
    (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, item_unit_id)
  values
    ('00000000-0000-0000-0000-00000000bb01','2026-06-23',
     '00000000-0000-0000-0000-00000000bf02','kitchen','produce',
     '00000000-0000-0000-0000-00000000ab01',1,
     '00000000-0000-0000-0000-00000000de09')
  $$, 'P0015', null,
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
-- The subject is a hand-made item from before OD-2026-10-06-ESB-ITEMS (replica mode). Its log is an
-- imported row, the only new row such an item can still take, left Submitted so the backfill may
-- fill its unit; the binder runs on it as on any row.
set local request.jwt.claims = '{}';
set local session_replication_role = replica;
insert into ops.wip_items (id, org_id, name, flag_active, kind, reference_source) values
  ('00000000-0000-0000-0000-00000000dd11','00000000-0000-0000-0000-0000000000a1','Backfill Subject',true,'WIP','manual');
set local session_replication_role = origin;
insert into ops.kitchen_logs
  (id, org_id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi, status, source) values
  ('00000000-0000-0000-0000-00000000ac21','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-23','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000dd11',3,'Submitted','teable_import');

select is(
  (select item_unit_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000ac21'),
  null::uuid,
  'an item with no unit row binds nothing — the column is nullable BY DESIGN for pre-master-data history');

-- The first-fill arm re-enters the SAME seam the INSERT arm runs (the trigger validates a
-- binding whenever one is WRITTEN, not only at insert): a NULL may be filled, but never with
-- another item's unit, and never across orgs — even by a privileged writer.
select throws_ok($$
  update ops.kitchen_logs
     set item_unit_id = '00000000-0000-0000-0000-00000000de04'
   where id = '00000000-0000-0000-0000-00000000ac21'
  $$, '23514', 'item_unit_id must reference a unit of the log''s own wip item',
  '_bind_kitchen_log_item_unit: a NULL binding cannot be first-filled with another ITEM''s unit');

select throws_ok($$
  update ops.kitchen_logs
     set item_unit_id = '00000000-0000-0000-0000-00000000de09'
   where id = '00000000-0000-0000-0000-00000000ac21'
  $$, '23514', 'item_unit_id must belong to the same org as the kitchen log',
  '_bind_kitchen_log_item_unit: a NULL binding cannot be first-filled across orgs — the seam holds on the backfill arm too');

insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default) values
  ('00000000-0000-0000-0000-00000000dd12','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000dd11','porsi','PD-PORSI-D11',true);

update ops.kitchen_logs l
   set item_unit_id = u.id
  from ops.item_units u
 where u.wip_item_id = l.wip_item_id
   and l.org_id = u.org_id
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
