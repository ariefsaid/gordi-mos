-- Café stream item lists (#222): which items a production stream — a live (branch, activity)
-- Team — offers for NEW MOS capture and planning. One ops.wip_items row may be offered by many
-- streams; item identity is never duplicated to do that. The list is master data sourced from the
-- ERP's own production record (`source = 'esb'`) or set by hand (`source = 'manual'`).
--
-- Only NEW writes are held to the list. A `source = 'mos'` log or plan may be inserted, or have its
-- item or stream changed, only for an item on that stream's list. Status, review and quantity
-- updates never re-check it, so a row whose item later leaves the list stays readable, reviewable
-- and editable. Imported history is never checked. ops.kitchen_stock is not guarded: no app role
-- can write it, and its rows derive from approved logs that were checked when they were written.
--
-- DOWN (manual, in one explicit transaction, this order):
--   1. Restore ops._test_seed_cafe() verbatim from 20260914000002_ops_cafe_books.sql.
--   2. drop trigger kitchen_logs_z_stream_item_guard on ops.kitchen_logs;
--      drop trigger kitchen_plans_z_stream_item_guard on ops.kitchen_plans;
--      drop function ops._guard_cafe_stream_item();
--   3. drop table ops.stream_items;
--      drop function ops._guard_stream_item();
-- Step 3 discards every stream item list; export ops.stream_items first if it must come back.

create table ops.stream_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default shared.current_org_id() references shared.orgs(id) on delete cascade,
  branch_id uuid not null references shared.branches(id),
  activity text not null,
  wip_item_id uuid not null references ops.wip_items(id) on delete cascade,
  source text not null check (source in ('esb', 'manual')),
  created_at timestamptz not null default now(),
  created_by uuid references shared.people(id),
  unique (org_id, branch_id, activity, wip_item_id)
);
create index stream_items_org_item_idx on ops.stream_items (org_id, wip_item_id);
comment on table ops.stream_items is
  'The items a live (branch, activity) stream Team offers for new MOS capture and planning. One item may be on many streams. Rows are added or removed, never edited.';
comment on column ops.stream_items.source is
  'Provenance: esb = taken from the ERP production record; manual = set by an ops lead or admin. App roles may only write manual.';
comment on column ops.stream_items.created_by is
  'Server-stamped on insert from the session person; NULL for a system load.';

create function ops._guard_stream_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  -- Provenance is the server's, never the caller's.
  new.created_at := now();
  new.created_by := shared.current_person_id();
  if not exists (select 1 from ops.wip_items i
                 where i.id = new.wip_item_id and i.org_id = new.org_id) then
    raise exception 'CAFE_STREAM_ITEM_ORG_MISMATCH: the item belongs to another org' using errcode = 'P0010';
  end if;
  if not exists (
    select 1 from shared.teams t
    join shared.branches b on b.id = t.branch_id and b.org_id = t.org_id and b.archived_at is null
    where t.org_id = new.org_id and t.branch_id = new.branch_id
      and t.activity = new.activity and t.archived_at is null
  ) then
    raise exception 'CAFE_STREAM_ITEM_NO_LIVE_STREAM: no live stream Team for this branch and activity'
      using errcode = 'P0011';
  end if;
  return new;
end;
$$;
comment on function ops._guard_stream_item() is
  'On insert into ops.stream_items: stamps created_at/created_by, requires the item in the row''s org (P0010) and a live stream Team for the (branch, activity) in that org (P0011). SECURITY INVOKER.';
revoke execute on function ops._guard_stream_item() from public, anon, authenticated;
create trigger stream_items_validate before insert on ops.stream_items
for each row execute function ops._guard_stream_item();

alter table ops.stream_items enable row level security;
alter table ops.stream_items force row level security;
grant select, insert, delete on ops.stream_items to authenticated;
grant select on ops.stream_items to service_role;
create policy stream_items_select_org on ops.stream_items
  for select to authenticated
  using (org_id = shared.current_org_id() and shared.is_org_member());
comment on policy stream_items_select_org on ops.stream_items is
  'Org-readable: every member sees which items each stream offers.';
create policy stream_items_insert_ops_lead_or_admin on ops.stream_items
  for insert to authenticated
  with check (org_id = shared.current_org_id() and source = 'manual'
              and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
comment on policy stream_items_insert_ops_lead_or_admin on ops.stream_items is
  'Stream item lists are master data, written by the same roles as ops.wip_items. A person can only add a manual row; esb rows come from a system load.';
create policy stream_items_delete_ops_lead_or_admin on ops.stream_items
  for delete to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('ops_lead') or shared.has_access_role('admin')));
comment on policy stream_items_delete_ops_lead_or_admin on ops.stream_items is
  'Removing an item from a stream''s list stops new capture and planning of it there; existing rows are unaffected.';

create function ops._guard_cafe_stream_item()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.source <> 'mos' or new.branch_id is null or new.activity is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (old.wip_item_id, old.branch_id, old.activity)
       is not distinct from (new.wip_item_id, new.branch_id, new.activity) then
    return new;
  end if;
  if not exists (
    select 1 from ops.stream_items si
    where si.org_id = new.org_id and si.branch_id = new.branch_id
      and si.activity = new.activity and si.wip_item_id = new.wip_item_id
  ) then
    raise exception 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list'
      using errcode = 'P0012';
  end if;
  return new;
end;
$$;
comment on function ops._guard_cafe_stream_item() is
  'On a MOS-sourced Café log or plan that is inserted or re-pointed to another item or stream, requires the item on that stream''s ops.stream_items list (P0012, token CAFE_ITEM_NOT_ON_STREAM). Other updates and imported rows pass. SECURITY INVOKER.';
revoke execute on function ops._guard_cafe_stream_item() from public, anon, authenticated;
create trigger kitchen_logs_z_stream_item_guard
before insert or update of wip_item_id, branch_id, activity on ops.kitchen_logs
for each row execute function ops._guard_cafe_stream_item();
create trigger kitchen_plans_z_stream_item_guard
before insert or update of wip_item_id, branch_id, activity on ops.kitchen_plans
for each row execute function ops._guard_cafe_stream_item();

-- The test-only Café fixture offers each of its items on every live stream of the item's org, so
-- suites written before stream item lists keep writing where they did. A suite that asserts the
-- list itself removes rows inside its own transaction.
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

  perform ops._test_seed_streams();

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
  -- `code` is LOAD-BEARING, not decoration: the app resolves the Café BU exclusively by
  -- code='retail_ops' (kitchen-logs.ts resolveKitchenBuId — resolving by display name broke on
  -- rename once already), and #231's stream-team seed joins on the same code. A fixture BU
  -- without it is a BU the app cannot find.
  insert into shared.business_units (id, org_id, name, code) values
    ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar','retail_ops'),
    ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B-Kitchen','retail_ops')
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

  -- ── Stream item lists (#222) ────────────────────────────────────────────────────────────────
  insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
  select i.org_id, t.branch_id, t.activity, i.id, 'manual'
  from ops.wip_items i
  join shared.teams t on t.org_id = i.org_id and t.branch_id is not null
    and t.activity is not null and t.archived_at is null
  where i.id in ('00000000-0000-0000-0000-00000000ab01',
                 '00000000-0000-0000-0000-00000000ab02',
                 '00000000-0000-0000-0000-00000000ab03',
                 '00000000-0000-0000-0000-00000000ab09')
  on conflict (org_id, branch_id, activity, wip_item_id) do nothing;

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
  -- Radiant (a real ERP movement); ac05 is the incumbent's within-branch "Transfer to Bungur",
  -- which the ERP never sees — filed now by the RUMAH RAMES BAR, the only stream the books rules
  -- (#777) still let move within their own branch; a kitchen cannot.
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ac01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',8,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',5,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','bar','transfer','00000000-0000-0000-0000-00000000bf02','00000000-0000-0000-0000-00000000ab01',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',2,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;

  -- 2026-06-21 item ab02 and 2026-06-22 item ab03, same stream: the stock arithmetic suite, including
  -- a day whose only movement is a transfer, so the balance goes negative and is preserved (FR-061).
  insert into ops.kitchen_logs
    (id, org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
     wip_item_id, qty_porsi, status, submitted_by) values
    ('00000000-0000-0000-0000-00000000ad01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab02',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab02',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',9,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-22','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab03',100,'Submitted','00000000-0000-0000-0000-0000000000d1')
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
  'TEST-ONLY fixture (SECURITY DEFINER): branch catalog for both test orgs, Kitchen-and-Bar BU, WIP items offered on every live stream of their org (#222), item units (#232: confirmed defaults + one unconfirmed + a cross-tenant row), plans, Submitted logs across four production streams, imported history, and stock — plus a live ops_lead. Call AFTER shared._test_seed_directory(), inside begin;...rollback; with app.allow_test_seeds=on.';
revoke execute on function ops._test_seed_cafe() from public, anon, authenticated;
