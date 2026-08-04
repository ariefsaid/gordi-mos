-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SQUASHED BASELINE — 4 of 4 for `ops`: pgTAP fixtures (OD-WAY-35).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Every fixture here extends the two-org directory the `shared` baseline seeds
-- (shared._test_seed_directory / shared._test_seed_access_roles, ...0004).
--
-- SECURITY DEFINER so they can write under RLS. Intended ONLY inside a begin;...rollback; pgTAP
-- transaction — the rows never ship. Two independent controls keep that true, and both are needed,
-- exactly as in the `shared` and `mos` halves:
--
--   1. EXECUTE is revoked from public/anon/authenticated. `ops` is exposed through PostgREST, so a
--      default PUBLIC grant would make each of these a reachable RPC that writes production facts.
--   2. A fail-closed environment opt-in. Every fixture below raises 42501 unless
--      `app.allow_test_seeds` is 'on'. The pgTAP harness sets it per transaction; nothing else ever
--      does, so the fixtures are inert wherever they have not been explicitly asked for. The revoke
--      alone is one mistaken grant away from being no control at all; the GUC is opt-in by
--      construction.
--
-- ⚠ THE BRANCH CATALOG HAS TO BE SEEDED HERE. shared.branches is seeded by a DO block in ...0001
-- that loops over the orgs existing AT MIGRATION TIME. The two test orgs are created inside the
-- pgTAP transaction, long afterwards, so they have no branches unless this file gives them some.
-- Anything asserting the production stream depends on that and it is not obvious from the shared
-- file.
--
-- DOWN: drop function ops._test_seed_daily_log(); drop function ops._test_seed_cafe();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ops._test_seed_cafe() — branches, master data, plans, logs, stock
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Fixture ids, and why each exists:
--
--   Branches (org A)   ...bf01 Gordi HQ · ...bf02 Rumah Rames · ...bf03 Radiant
--   Branch   (org B)   ...bf09 B-Branch — the cross-tenant negative for the same-org FK seam.
--   BUs                ...bb01 Kitchen and Bar (org A) · ...bb09 B-Kitchen (org B)
--   WIP items          ...ab01..ab03 (org A) · ...ab09 (org B, cross-tenant negative)
--
-- The seeded logs span FOUR production streams on purpose, not one:
--   (Rumah Rames, kitchen)  the stream the incumbent captures — produce, plus both transfer shapes.
--   (Gordi HQ,    kitchen)  one of the four streams that reach the ERP by hand today.
--   (Gordi HQ,    bar)      a bar stream, which has never had a capture surface at all.
-- A fixture that only covered the incumbent's stream would let a stream-blind implementation pass.
--
-- ACCESS-ROLE NOTE, stated because it shapes every write assertion: the shared fixture leaves NOBODY
-- holding a live ops_lead — Author ...0d1's grant is seeded already-revoked, which makes her the
-- honest negative subject. This fixture grants ops_lead to DirectMgr ...0d2 so there is a positive
-- subject too. GrandMgr ...0d3 is admin from the shared fixture.
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
  'TEST-ONLY fixture (SECURITY DEFINER): branch catalog for both test orgs, Kitchen-and-Bar BU, WIP items, plans, Submitted logs across four production streams, imported history, and stock — plus a live ops_lead. Call AFTER shared._test_seed_directory(), inside begin;...rollback; with app.allow_test_seeds=on.';
revoke execute on function ops._test_seed_cafe() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ops._test_seed_daily_log() — Daily Log entries
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Author ...0d1 owns le01; Peer ...0d4 owns le02. DirectMgr ...0d2 manages Author but not Peer, which
-- is what makes the author-or-manager edit gate provable in both directions from one fixture.
create or replace function ops._test_seed_daily_log()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_seed_daily_log is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;

  perform ops._test_seed_cafe();

  insert into ops.log_entries
    (id, org_id, business_unit_id, event_type, title, detail, occurred_at, created_by) values
    ('00000000-0000-0000-0000-00000000ea01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','production','Author entry','made by the author','2026-06-20T09:00:00Z','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ea02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','qc','Peer entry','made by a peer','2026-06-20T10:00:00Z','00000000-0000-0000-0000-0000000000d4')
  on conflict (id) do nothing;

  insert into ops.log_entries
    (id, org_id, business_unit_id, event_type, title, occurred_at, created_by) values
    ('00000000-0000-0000-0000-00000000ea09','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bb09','other','B entry','2026-06-20T11:00:00Z','00000000-0000-0000-0000-0000000000b4')
  on conflict (id) do nothing;
end;
$$;
comment on function ops._test_seed_daily_log() is
  'TEST-ONLY fixture (SECURITY DEFINER): Daily Log entries owned by Author and by Peer, plus an org-B entry. Extends ops._test_seed_cafe(). Call inside begin;...rollback; with app.allow_test_seeds=on.';
revoke execute on function ops._test_seed_daily_log() from public, anon, authenticated;
