-- OD-2026-10-06-ESB-ITEMS — an ESB item's descriptive columns belong to the catalog refresh. App
-- sessions cannot change them; MOS-owned settings (per-stream name, kind, active, units) stay
-- editable; the refresh, run by its owner, still writes them.
--
-- Personas (shared fixture): ...0d2 ops_lead, ...0d1 member+admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1484-A","esb_product_detail_id":"SYNTH-ERP-PD-1484-A","name":"Synthetic ESB item","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"},
  {"esb_product_id":"SYNTH-ERP-P-1484-B","esb_product_detail_id":"SYNTH-ERP-PD-1484-B","name":"Synthetic ESB neighbour","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"}
]$source$::jsonb);
update ops.item_units set confirmed_at = now() where esb_product_detail_id = 'SYNTH-ERP-PD-1484-A';
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.esb_item', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1484-A'), true);
select set_config('app.esb_unit', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1484-A'), true);

-- ═══ App sessions cannot change a column the refresh writes ══════════════════════════════════
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok(format($$update ops.wip_items set name = 'Renamed in MOS' where id = %L$$,
  current_setting('app.esb_item')), '42501', null,
  'an ops lead cannot rename an ESB item');
select throws_ok(format($$update ops.wip_items set category = 'Renamed category' where id = %L$$,
  current_setting('app.esb_item')), '42501', null,
  'an ops lead cannot change an ESB item''s category');
select throws_ok(format($$update ops.wip_items set flag_active = false where id = %L$$,
  current_setting('app.esb_item')), '42501', null,
  'an ops lead cannot withdraw an ESB item from the catalog');
select throws_ok(format($$update ops.wip_items set kind = 'WIP' where id = %L$$,
  current_setting('app.esb_item')), '42501', null,
  'an ops lead cannot set an item-level kind on an ESB item');
select throws_ok(format($$update ops.wip_items set erp_category_type_name = 'Other' where id = %L$$,
  current_setting('app.esb_item')), '42501', null,
  'an ops lead cannot change an ESB item''s category type');
select throws_ok(format($$update ops.wip_items set has_active_bom_output = false where id = %L$$,
  current_setting('app.esb_item')), '42501', null,
  'an ops lead cannot change whether an ESB item has an active BOM output');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}');
select throws_ok(format($$update ops.wip_items set name = 'Renamed by an admin' where id = %L$$,
  current_setting('app.esb_item')), '42501', null,
  'an admin cannot rename an ESB item either');

-- ═══ MOS-owned settings stay editable ════════════════════════════════════════════════════════
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok(format($$
  select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', %1$L,
    'Team name for the ESB item', %2$L, array[%2$L::uuid], 'WIP', true, array[2]::numeric[])
  $$, current_setting('app.esb_item'), current_setting('app.esb_unit')),
  'an ops lead saves the stream''s MOS name, kind, active status and units for an ESB item');
select is(
  (select row(erp_name, mos_name, kind, is_active)::text from ops.cafe_item_settings_read
    where item_id = current_setting('app.esb_item')::uuid
      and branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'kitchen'),
  row('Synthetic ESB item', 'Team name for the ESB item', 'WIP', true)::text,
  'the saved MOS settings read back beside the unchanged ESB name');

-- ═══ The catalog refresh, run by its owner, still writes them ═════════════════════════════════
-- The category decides the item's stream, so the category change is proven on the neighbour in
-- the last refresh: moving the item off its stream would drop the setting asserted below.
reset role;
update ops.wip_items set kind = 'WIP' where id = current_setting('app.esb_item')::uuid;
select set_config('app.allow_test_seeds', 'on', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1484-A","esb_product_detail_id":"SYNTH-ERP-PD-1484-A","name":"Synthetic ESB item, renamed in ESB","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"INVENTORY","is_stock":true,"has_active_bom_output":false,"is_active":true,"branch_code":"gordi_hq"},
  {"esb_product_id":"SYNTH-ERP-P-1484-B","esb_product_detail_id":"SYNTH-ERP-PD-1484-B","name":"Synthetic ESB neighbour","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"}
]$source$::jsonb);
select is((select name from ops.wip_items where id = current_setting('app.esb_item')::uuid),
  'Synthetic ESB item, renamed in ESB', 'the refresh renames the item');
select is((select erp_category_type_name from ops.wip_items where id = current_setting('app.esb_item')::uuid),
  'INVENTORY', 'the refresh writes the category type');
select is((select has_active_bom_output from ops.wip_items where id = current_setting('app.esb_item')::uuid),
  false, 'the refresh writes whether the item has an active BOM output');
select is((select kind from ops.wip_items where id = current_setting('app.esb_item')::uuid),
  null, 'the refresh clears an item-level kind');
select is(
  (select mos_name from ops.cafe_item_settings_read
    where item_id = current_setting('app.esb_item')::uuid
      and branch_id = '00000000-0000-0000-0000-00000000bf01' and activity = 'kitchen'),
  'Team name for the ESB item', 'the stream''s MOS name survives the refresh');

select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1484-B","esb_product_detail_id":"SYNTH-ERP-PD-1484-B","name":"Synthetic ESB neighbour","category":"BAR","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"}
]$source$::jsonb);
select is((select category from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1484-B'),
  'Bar', 'the refresh changes the category');
select is((select flag_active from ops.wip_items where id = current_setting('app.esb_item')::uuid),
  false, 'the refresh withdraws an item that left the ESB catalog');
select is((select flag_active from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1484-B'),
  true, 'the refresh keeps an item still in the ESB catalog active');

select * from finish();
rollback;
