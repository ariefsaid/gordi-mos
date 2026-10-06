-- OD-2026-10-06-ESB-ITEMS — MOS refuses new hand-made café items and new MOS writes against them,
-- ESB-catalog writes still pass, and existing hand-made rows stay readable and editable.
--
-- Personas (shared fixture): ...0d1 member+admin (logs, counts); ...0d2 ops_lead (items, plans,
-- stream lists, settings). The legacy item is written in replica mode, which is how a row created
-- before the rule looks to the new guards: present, never re-checked.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1456-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1456-WIP","name":"Synthetic ESB-only WIP","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"},
  {"esb_product_id":"SYNTH-ERP-P-1456-KEEP","esb_product_detail_id":"SYNTH-ERP-PD-1456-KEEP","name":"Synthetic ESB source probe","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"}
]$source$::jsonb);
update ops.item_units set confirmed_at = now() where esb_product_detail_id = 'SYNTH-ERP-PD-1456-WIP';
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.esb_item', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1456-WIP'), true);
select set_config('app.esb_unit', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1456-WIP'), true);

set local session_replication_role = replica;
insert into ops.wip_items (id, org_id, name, category, flag_active, kind, reference_source) values
  ('00000000-0000-0000-0000-000000001456', '00000000-0000-0000-0000-0000000000a1',
   'Legacy hand-made item', 'Mains', true, 'WIP', 'manual');
insert into ops.item_units (id, org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
  ('00000000-0000-0000-0000-000000001457', '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000001456', 'porsi', 'PD-PORSI-1456', true, now());
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', 'kitchen',
   '00000000-0000-0000-0000-000000001456', 'manual');
set local session_replication_role = origin;

-- ═══ Items: only the ESB catalog creates them ════════════════════════════════════════════════
select is((select reference_source from ops.wip_items where id = current_setting('app.esb_item')::uuid),
  'erp_catalog', 'the ESB catalog refresh still creates café items');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$
  insert into ops.wip_items (name, category) values ('Hand-made by an ops lead', 'Mains')
  $$, 'P0021', null,
  'a hand-made item is refused, even for an ops lead');
select throws_ok($$
  insert into ops.wip_items (name, reference_source) values ('Claims ESB without an id', 'erp_catalog')
  $$, 'P0021', null,
  'an item that claims the ESB catalog without its ESB product id is refused');

reset role;
select throws_ok(format($$
  update ops.wip_items set reference_source = 'manual' where esb_product_id = %L
  $$, 'SYNTH-ERP-P-1456-KEEP'), 'P0021', null,
  'an ESB-catalog item cannot be turned back into a hand-made one');

-- ═══ Writes against a hand-made item are refused ═════════════════════════════════════════════
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}');
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01', '2099-12-30', '00000000-0000-0000-0000-00000000bf01',
          'kitchen', 'produce', '00000000-0000-0000-0000-000000001456', 2)
  $$, 'P0021', null,
  'a production log against a hand-made item is refused');
select is((ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen', jsonb_build_array(
    jsonb_build_object('client_key', 'f1456000-0000-0000-0000-000000000001',
      'item_id', '00000000-0000-0000-0000-000000001456', 'quantity', '3'))) -> 0 ->> 'reason'),
  'item_not_countable', 'a count of a hand-made item is refused');
select is((select count(*)::int from ops.cafe_receivable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')
            where item_id = '00000000-0000-0000-0000-000000001456'),
  0, 'a hand-made item is not receivable or requestable');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$
  insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, qty_porsi)
  values ('2099-12-30', '00000000-0000-0000-0000-000000001456', '00000000-0000-0000-0000-00000000bf01',
          'kitchen', 'produce', 4)
  $$, 'P0021', null,
  'a plan against a hand-made item is refused');
select throws_ok($$
  insert into ops.stream_items (branch_id, activity, wip_item_id, source)
  values ('00000000-0000-0000-0000-00000000bf01', 'bar', '00000000-0000-0000-0000-000000001456', 'manual')
  $$, 'P0021', null,
  'a hand-made item cannot be added to another stream''s list');
select throws_ok($$
  select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen',
    '00000000-0000-0000-0000-000000001456', 'Legacy hand-made item',
    '00000000-0000-0000-0000-000000001457', array['00000000-0000-0000-0000-000000001457'::uuid],
    'WIP', true, array[]::numeric[])
  $$, 'P0002', null,
  'Café item settings cannot be saved for a hand-made item');

-- ═══ The same writes against an ESB-catalog item still pass ══════════════════════════════════
select lives_ok(format($$
  select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', %1$L,
    'Synthetic ESB-only WIP', %2$L, array[%2$L::uuid], 'WIP', true, array[]::numeric[])
  $$, current_setting('app.esb_item'), current_setting('app.esb_unit')),
  'Café item settings save for an ESB-catalog item');
select lives_ok(format($$
  insert into ops.kitchen_plans (log_date, wip_item_id, branch_id, activity, action, qty_porsi)
  values ('2099-12-30', %L, '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce', 4)
  $$, current_setting('app.esb_item')),
  'a plan against an ESB-catalog item is accepted');
select lives_ok(format($$
  insert into ops.stream_items (branch_id, activity, wip_item_id, source)
  values ('00000000-0000-0000-0000-00000000bf01', 'bar', %L, 'manual')
  $$, current_setting('app.esb_item')),
  'an ESB-catalog item can be added to another stream''s list');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}');
select lives_ok(format($$
  insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01', '2099-12-30', '00000000-0000-0000-0000-00000000bf01',
          'kitchen', 'produce', %L, 2)
  $$, current_setting('app.esb_item')),
  'a production log against an ESB-catalog item is accepted');
select is((ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen', jsonb_build_array(
    jsonb_build_object('client_key', 'f1456000-0000-0000-0000-000000000002',
      'item_id', current_setting('app.esb_item'), 'quantity', '3'))) -> 0 ->> 'outcome'),
  'submitted', 'a count of an ESB-catalog item is accepted');

-- ═══ Existing rows are untouched ═════════════════════════════════════════════════════════════
reset role;
select lives_ok($$
  insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
      wip_item_id, qty_porsi, status, source, posted_to_esb)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', '2026-08-01',
      '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce',
      '00000000-0000-0000-0000-000000001456', 10, 'Approved', 'teable_import', true)
  $$, 'imported history of a hand-made item still lands; it records what already happened');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
update ops.wip_items set flag_active = false where id = '00000000-0000-0000-0000-000000001456';
reset role;
select is((select flag_active from ops.wip_items where id = '00000000-0000-0000-0000-000000001456'),
  false, 'an existing hand-made item can still be deactivated');

select * from finish();
rollback;
