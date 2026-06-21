-- TEST-ONLY fixture (SECURITY DEFINER, service-role only). Seeds the Kitchen-and-Bar BU + WIP items
-- + Submitted logs the pgTAP files reference, plus foreign-org rows for the same-org FK guard test.
-- Inserts via the function owner (postgres / service_role context — bypasses RLS + guard). Mirrors
-- mos._test_seed_access_roles(). The Kitchen-and-Bar BU is seeded here so the approval RPC's mirror
-- insert (I4) finds it before any approval test runs.
create or replace function mos._test_seed_kitchen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Kitchen and Bar BU for org A (fresh hex id; NOT org WU-B's …0b1). Required by the mirror (I4).
  insert into shared.business_units (id, org_id, name)
  values ('00000000-0000-0000-0000-00000000bb01','00000000-0000-0000-0000-0000000000a1','Kitchen and Bar')
  on conflict (id) do nothing;
  -- A foreign-org (WU-B) BU + WIP item, for the same-org FK guard test (I2 / T-041-test-guard).
  insert into shared.business_units (id, org_id, name)
  values ('00000000-0000-0000-0000-00000000bb09','00000000-0000-0000-0000-0000000000b1','B-Kitchen')
  on conflict (id) do nothing;

  -- Active WIP items (org A).
  insert into ops.wip_items (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi)
  values
    ('00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-0000000000a1','Nasi Goreng','Mains',true,'BOM-001','PD-PORSI-001'),
    ('00000000-0000-0000-0000-00000000ab02','00000000-0000-0000-0000-0000000000a1','Ayam Bakar','Mains',true,'BOM-002','PD-PORSI-002'),
    ('00000000-0000-0000-0000-00000000ab03','00000000-0000-0000-0000-0000000000a1','Es Teh','Drinks',true,'BOM-003','PD-PORSI-003')
  on conflict (id) do nothing;
  -- A foreign-org (WU-B) WIP item, for the same-org FK guard test (I2).
  insert into ops.wip_items (id, org_id, name, flag_active)
  values ('00000000-0000-0000-0000-00000000ab09','00000000-0000-0000-0000-0000000000b1','B-Item',true)
  on conflict (id) do nothing;

  -- Submitted kitchen logs (org A, BU Kitchen-and-Bar …bb01).
  -- 2026-06-20 mint suite: ac01..03 Production (qty 12/8/5), ac04 TR 4, ac05 TB 3, ac06 PR 2 (reject).
  insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, status, submitted_by)
  values
    ('00000000-0000-0000-0000-00000000ac01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',8,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',5,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Transfer to Radiant','00000000-0000-0000-0000-00000000ab01',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Transfer to Bungur','00000000-0000-0000-0000-00000000ab01',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ac06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-20','Production','00000000-0000-0000-0000-00000000ab01',2,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;
  -- 2026-06-21 stock suite (item ab02): ad01 PR 12, ad02 TR 4, ad03 TB 3, ad04 PR 9.
  -- 2026-06-22 negative suite (item ab03): ad05 TB 100 (zero production that day).
  insert into ops.kitchen_logs (id, org_id, business_unit_id, log_date, action_type, wip_item_id, qty_porsi, status, submitted_by)
  values
    ('00000000-0000-0000-0000-00000000ad01','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Production','00000000-0000-0000-0000-00000000ab02',12,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Transfer to Radiant','00000000-0000-0000-0000-00000000ab02',4,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Transfer to Bungur','00000000-0000-0000-0000-00000000ab02',3,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-21','Production','00000000-0000-0000-0000-00000000ab02',9,'Submitted','00000000-0000-0000-0000-0000000000d1'),
    ('00000000-0000-0000-0000-00000000ad05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-06-22','Transfer to Bungur','00000000-0000-0000-0000-00000000ab03',100,'Submitted','00000000-0000-0000-0000-0000000000d1')
  on conflict (id) do nothing;
end;
$$;
comment on function mos._test_seed_kitchen() is
  'TEST-ONLY fixture (SECURITY DEFINER): Kitchen-and-Bar BU + WIP items + Submitted logs on the WU-A tree, plus foreign-org rows for the same-org guard test. Call after _test_seed_role_tree() + _test_seed_access_roles().';
revoke execute on function mos._test_seed_kitchen() from public, anon, authenticated;

-- DOWN: drop function mos._test_seed_kitchen();
