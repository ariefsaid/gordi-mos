-- #1345 — manager-defined entry multiples preserve the default ERP coordinate.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1345-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1345-WIP-A","name":"Synthetic multiple WIP","category":"KITCHEN","unit_name":"ERP pack","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"},
  {"esb_product_id":"SYNTH-ERP-P-1345-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1345-WIP-B","name":"Synthetic multiple WIP","category":"KITCHEN","unit_name":"ERP each","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);

select has_column('ops', 'cafe_item_settings', 'unit_multiples', 'multiples live on existing per-stream settings');
select has_column('ops', 'kitchen_logs', 'entry_quantity', 'logs retain the typed quantity');
select has_column('ops', 'kitchen_logs', 'entry_unit_factor', 'logs retain the selected factor');
select has_column('ops', 'kitchen_logs', 'entry_unit_name', 'logs retain the selected default-unit name');
select has_function('ops', 'save_cafe_item_settings',
  ARRAY['uuid','text','uuid','text','uuid','uuid[]','text','boolean','numeric[]'],
  'the existing manager save is extended with one factor-array argument');
select ok(ops.cafe_unit_multiples_valid(array[0.5, 2, 12.5]::numeric[]),
  'valid positive factors can be configured without creating ERP units');
select ok(not ops.cafe_unit_multiples_valid(array[1, 0.5]::numeric[])
          and not ops.cafe_unit_multiples_valid(array[0.5, 0.5]::numeric[])
          and not ops.cafe_unit_multiples_valid(array[0, 2]::numeric[])
          and not ops.cafe_unit_multiples_valid(array[0.1234567]::numeric[]),
  'one, duplicates, non-positive values and factors beyond six decimal places are rejected');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP'),
    'Multiple WIP',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1345-WIP-A'),
    array[
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1345-WIP-A'),
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1345-WIP-B')
    ], 'WIP', true, array[0.5, 2]::numeric[]
  )
$$, 'a Retail Ops manager saves multiples against the existing default ERP unit');
select is((select setting.unit_multiples::text from ops.cafe_item_settings setting
            where setting.wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP')
              and setting.branch_id = '00000000-0000-0000-0000-00000000bf01'), '{0.5,2}',
  'the factors persist on that stream item');
select is((select count(*)::int from ops.item_units unit
            where unit.wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP')),
          2, 'saving multiples creates no MOS item units or ERP conversion rows');

insert into ops.kitchen_logs
  (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, item_unit_id,
   qty_porsi, entry_quantity, entry_unit_factor)
values
  ('00000000-0000-0000-0000-00000000c431', '00000000-0000-0000-0000-00000000bb01',
   '2099-12-31', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce',
   (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP'), null,
   1.5, 3, 0.5);
select is((select qty_porsi from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c431'),
          1.5::numeric, 'the log stores the converted canonical quantity in the default ERP unit');
select is((select entry_quantity from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c431'),
          3::numeric, 'the log separately keeps the quantity the staff typed');
select is((select entry_unit_factor from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c431'),
          0.5::numeric, 'the configured factor is snapshotted on the log');
select is((select entry_unit_name from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c431'),
          'ERP pack', 'the log snapshots the selected ERP default-unit name');
select is((select item_unit_id from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c431'),
          (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1345-WIP-A'),
          'the log remains bound to the ERP default detail, not a synthetic multiple');

select throws_ok($$
  insert into ops.kitchen_logs
    (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi,
     entry_quantity, entry_unit_factor)
  values
    ('00000000-0000-0000-0000-00000000bb01', '2099-12-31', '00000000-0000-0000-0000-00000000bf01',
     'kitchen', 'produce',
     (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP'), 2, 2, 0.25)
$$, 'P0017', 'CAFE_UNIT_MULTIPLE_NOT_CONFIGURED: choose a multiple configured for this stream item',
  'a caller cannot submit an unconfigured factor');
select throws_ok($$
  insert into ops.kitchen_logs
    (business_unit_id, log_date, branch_id, activity, action, wip_item_id, item_unit_id, qty_porsi)
  values
    ('00000000-0000-0000-0000-00000000bb01', '2099-12-31', '00000000-0000-0000-0000-00000000bf01',
     'kitchen', 'produce',
     (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP'),
     (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1345-WIP-B'), 2)
$$, 'P0015', 'CAFE_ITEM_UNIT_NOT_SHOWN: Café capture must use the default ERP detail; select a configured multiple for another quantity',
  'a shown non-default ERP detail cannot replace the default coordinate');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok($$
  select ops.approve_kitchen_log('00000000-0000-0000-0000-00000000c431', 'multiple capture approved',
    (select updated_at from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c431'))
$$,
  'approval uses the normal review and ERP dispatch path');
select is((select qty_porsi from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c431'),
          1.5::numeric, 'approval leaves canonical default-unit quantity intact');
select is((select push.payload ->> 'esb_product_detail_id_porsi'
             from integrations.esb_push push
             join ops.kitchen_logs log on log.batch_id = push.source_ref
            where log.id = '00000000-0000-0000-0000-00000000c431'),
          'SYNTH-ERP-PD-1345-WIP-A', 'the ERP outbox posts against the same default detail');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP'),
    'Multiple WIP',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1345-WIP-B'),
    array[
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1345-WIP-A'),
      (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1345-WIP-B')
    ], 'WIP', true
  )
$$, 'the existing eight-argument save remains compatible when a manager changes the default');
select is((select cardinality(setting.unit_multiples) from ops.cafe_item_settings setting
            where setting.wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP')
              and setting.branch_id = '00000000-0000-0000-0000-00000000bf01'),
          0, 'a changed default cannot inherit factors from the old unit basis');
select is((select entry_unit_factor from ops.kitchen_logs where id = '00000000-0000-0000-0000-00000000c431'),
          0.5::numeric, 'changing settings never rewrites the captured historical factor');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}');
select cmp_ok((select count(*)::int from ops.cafe_item_settings_read
                where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP')
                  and branch_id = '00000000-0000-0000-0000-00000000bf01'), '>', 0,
  'ordinary members can read factors through the existing settings view');
select throws_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1345-WIP'),
    'Member attempt', null, array[]::uuid[], 'WIP', true, array[]::numeric[]
  )
$$, '42501', 'not authorized to edit this Café item stream',
  'ordinary members cannot use the extended settings save');
select ok(not ops.can_manage_cafe_item_settings('kitchen'),
  'adding factors did not widen the existing manager authority');

select * from finish();
rollback;
