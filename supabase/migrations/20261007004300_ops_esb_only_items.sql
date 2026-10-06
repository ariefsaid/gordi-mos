-- OD-2026-10-06-ESB-ITEMS — every café item comes from the ESB catalog. MOS refuses new hand-made
-- items and new MOS writes against them; existing rows are not changed or re-checked.
--
--   * ops._guard_esb_item_source (ops.wip_items): a new item is an ESB-catalog row carrying its ESB
--     product id, and an ESB-catalog row cannot be turned back into a hand-made one.
--   * ops._guard_esb_item_reference (new MOS kitchen logs and plans, new stream item list rows): the
--     item is an ESB-catalog row. Imported history keeps its own source and passes.
--   Settings, counts, receipts and purchase requests already resolve their item through ESB-only
--   readers (the settings guard and ops.cafe_item_references) and keep those checks.
--   * ops._guard_cafe_stream_item checks the stream's item list before per-stream activation.
--   * ops._test_seed_cafe() seeds ESB-catalog items, configured for every stream that lists them by
--     the test-only ops._test_configure_cafe_items(uuid[]).
--
-- Rollback: supabase/rollbacks/20261007004300_ops_esb_only_items.sql.

create or replace function ops._guard_esb_item_source()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and (new.reference_source is distinct from 'erp_catalog'
          or nullif(btrim(coalesce(new.esb_product_id, '')), '') is null) then
    raise exception 'CAFE_ITEM_NOT_FROM_ESB: add the item in ESB; MOS creates items only from the ESB catalog'
      using errcode = 'P0021';
  end if;
  if tg_op = 'UPDATE'
     and old.reference_source = 'erp_catalog'
     and new.reference_source is distinct from 'erp_catalog' then
    raise exception 'CAFE_ITEM_NOT_FROM_ESB: an ESB-catalog item stays an ESB-catalog item'
      using errcode = 'P0021';
  end if;
  return new;
end;
$$;
comment on function ops._guard_esb_item_source() is
  'OD-2026-10-06-ESB-ITEMS: a new café item must be an ESB-catalog row carrying its ESB product id, and an ESB-catalog row cannot become hand-made (P0021, token CAFE_ITEM_NOT_FROM_ESB). Existing hand-made rows can still be updated or deleted. SECURITY INVOKER.';
revoke execute on function ops._guard_esb_item_source() from public, anon, authenticated, service_role;

create trigger wip_items_esb_source_guard
  before insert or update of reference_source on ops.wip_items
  for each row execute function ops._guard_esb_item_source();

create or replace function ops._guard_esb_item_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name in ('kitchen_logs', 'kitchen_plans') and new.source <> 'mos' then
    return new;
  end if;
  if not exists (
    select 1 from ops.wip_items item
     where item.id = new.wip_item_id
       and item.reference_source = 'erp_catalog'
  ) then
    raise exception 'CAFE_ITEM_NOT_FROM_ESB: only ESB-catalog items can be logged, planned or listed'
      using errcode = 'P0021';
  end if;
  return new;
end;
$$;
comment on function ops._guard_esb_item_reference() is
  'OD-2026-10-06-ESB-ITEMS: a new MOS kitchen log or plan, and every new stream item list row, must reference an ESB-catalog item (P0021, token CAFE_ITEM_NOT_FROM_ESB). Imported history passes. Fires after the org and stream checks, so those keep their own errors. SECURITY INVOKER.';
revoke execute on function ops._guard_esb_item_reference() from public, anon, authenticated, service_role;

-- zz_ sorts after every existing BEFORE trigger on these tables (org seam, stream list, units).
create trigger kitchen_logs_zz_esb_item_guard
  before insert on ops.kitchen_logs
  for each row execute function ops._guard_esb_item_reference();
create trigger kitchen_plans_zz_esb_item_guard
  before insert on ops.kitchen_plans
  for each row execute function ops._guard_esb_item_reference();
create trigger stream_items_zz_esb_item_guard
  before insert on ops.stream_items
  for each row execute function ops._guard_esb_item_reference();

-- With every item from the ESB catalog, per-stream activation rows exist only for listed items, so
-- the stream-list refusal (P0012) must run before the activation read or it can never answer.
create or replace function ops._guard_cafe_stream_item()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text;
  v_item_kind text;
  v_stream_kind text;
  v_stream_active boolean;
  v_requires_wip boolean;
begin
  if new.source <> 'mos' then
    return new;
  end if;
  if new.branch_id is null or new.activity is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (old.wip_item_id, old.branch_id, old.activity)
       is not distinct from (new.wip_item_id, new.branch_id, new.activity) then
    return new;
  end if;

  select item.reference_source, item.kind, item.flag_active
    into v_source, v_item_kind, v_stream_active
    from ops.wip_items item
   where item.id = new.wip_item_id and item.org_id = new.org_id;
  if v_source is null or v_stream_active is distinct from true then
    raise exception 'CAFE_ITEM_NOT_ACTIVE: the item is not active in this café catalog'
      using errcode = 'P0014';
  end if;

  if not exists (
    select 1 from ops.stream_items stream_item
     where stream_item.org_id = new.org_id
       and stream_item.branch_id = new.branch_id
       and stream_item.activity = new.activity
       and stream_item.wip_item_id = new.wip_item_id
  ) then
    raise exception 'CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream''s item list'
      using errcode = 'P0012';
  end if;

  v_requires_wip := tg_table_name = 'kitchen_plans' or new.action = 'produce';
  if v_source = 'erp_catalog' then
    select setting.kind, setting.is_active
      into v_stream_kind, v_stream_active
      from ops.cafe_item_settings setting
     where setting.org_id = new.org_id
       and setting.branch_id = new.branch_id
       and setting.activity = new.activity
       and setting.wip_item_id = new.wip_item_id;
    if v_stream_active is distinct from true or v_stream_kind is null then
      raise exception 'CAFE_ITEM_NOT_ACTIVE: classify and activate this item for the stream before capture'
        using errcode = 'P0014';
    end if;
  else
    v_stream_kind := v_item_kind;
  end if;

  if v_requires_wip and v_stream_kind <> 'WIP' then
    raise exception 'CAFE_WIP_ITEM_REQUIRED: production logs and plans require a WIP item'
      using errcode = 'P0013';
  end if;
  if not v_requires_wip and v_stream_kind not in ('RAW', 'WIP') then
    raise exception 'CAFE_ITEM_REQUIRED: transfer and waste logs require a RAW or WIP item'
      using errcode = 'P0014';
  end if;

  return new;
end;
$$;
comment on function ops._guard_cafe_stream_item() is
  'MOS production and plans require an active WIP item on the stream''s list; transfers and waste accept an active team-classified RAW or WIP item there. The list is checked before per-stream activation, so an unlisted item is refused as unlisted (P0012). SECURITY INVOKER.';
revoke execute on function ops._guard_cafe_stream_item() from public, anon, authenticated;

create or replace function ops._test_configure_cafe_items(p_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_test_seeds', true), '') <> 'on' then
    raise exception '_test_configure_cafe_items is a TEST-ONLY fixture; set app.allow_test_seeds=on to run it'
      using errcode = '42501';
  end if;
  insert into ops.cafe_item_settings (org_id, branch_id, activity, wip_item_id, kind, is_active)
  select stream_item.org_id, stream_item.branch_id, stream_item.activity, stream_item.wip_item_id, 'WIP', true
    from ops.stream_items stream_item
   where stream_item.wip_item_id = any(p_item_ids)
  on conflict (org_id, branch_id, activity, wip_item_id) do nothing;
  insert into ops.cafe_item_setting_units (org_id, cafe_item_setting_id, item_unit_id)
  select setting.org_id, setting.id, unit.id
    from ops.cafe_item_settings setting
    join ops.item_units unit
      on unit.org_id = setting.org_id and unit.wip_item_id = setting.wip_item_id and unit.is_default
   where setting.wip_item_id = any(p_item_ids)
     and setting.default_item_unit_id is null
  on conflict (cafe_item_setting_id, item_unit_id) do nothing;
  update ops.cafe_item_settings setting
     set default_item_unit_id = shown.item_unit_id
    from ops.cafe_item_setting_units shown
   where shown.cafe_item_setting_id = setting.id
     and setting.wip_item_id = any(p_item_ids)
     and setting.default_item_unit_id is null;
end;
$$;
comment on function ops._test_configure_cafe_items(uuid[]) is
  'TEST-ONLY fixture (SECURITY DEFINER): configures each given ESB item as an active WIP item, with its default unit shown and selected, on every stream that lists it and has no settings yet. Requires app.allow_test_seeds=on.';
revoke execute on function ops._test_configure_cafe_items(uuid[]) from public, anon, authenticated, service_role;

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
  -- ESB-catalog items (OD-2026-10-06-ESB-ITEMS): MOS creates no hand-made item, so neither does
  -- the fixture. Each one is configured below as an active WIP item on every stream that lists it.
  insert into ops.wip_items
    (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi, reference_source, esb_product_id) values
    ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000a1','Nasi Goreng','Mains',true,'BOM-001','PD-PORSI-001','erp_catalog','P-001'),
    ('00000000-0000-0000-0000-00000000ab02','00000000-0000-0000-0000-0000000000a1','Ayam Bakar','Mains',true,'BOM-002','PD-PORSI-002','erp_catalog','P-002'),
    ('00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-0000000000a1','Es Teh','Drinks',true,'BOM-003','PD-PORSI-003','erp_catalog','P-003')
  on conflict (id) do nothing;
  insert into ops.wip_items (id, org_id, name, flag_active, reference_source, esb_product_id) values
    ('00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-0000000000b1','B-Item',true,'erp_catalog','P-B09')
  on conflict (id) do nothing;

  -- ── Item units (#232) ───────────────────────────────────────────────────────────────────────
  -- de01..de03 are confirmed 'porsi' ERP details with confirmed_by NULL, the system-recorded shape.
  -- de09 is org B's confirmed default, the cross-tenant negative.
  insert into ops.item_units
    (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
    ('00000000-0000-0000-0000-00000000de01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab01','porsi','PD-PORSI-001',true,'2026-06-01T00:00:00Z'),
    ('00000000-0000-0000-0000-00000000de02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab02','porsi','PD-PORSI-002',true,'2026-06-01T00:00:00Z'),
    ('00000000-0000-0000-0000-00000000de03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ab03','porsi','PD-PORSI-003',true,'2026-06-01T00:00:00Z')
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

  -- ── Per-stream Café item settings: active WIP with the confirmed default shown ───────────────
  perform ops._test_configure_cafe_items(array[
    '00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000ab02',
    '00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-00000000ab09']::uuid[]);

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
  'TEST-ONLY fixture (SECURITY DEFINER): branch catalog for both test orgs, Kitchen-and-Bar BU, WIP items offered on every live stream of their org (#222), ESB-catalog item units (#232: confirmed defaults + a cross-tenant row) and per-stream settings that make every listed item an active WIP item, plans, Submitted logs across four production streams, imported history, and stock — plus a live ops_lead. Call AFTER shared._test_seed_directory(), inside begin;...rollback; with app.allow_test_seeds=on.';
revoke execute on function ops._test_seed_cafe() from public, anon, authenticated;
