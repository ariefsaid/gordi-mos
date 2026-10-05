-- #1287 — per-stream team kind, active status, capture guards, history and tenant isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1287-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1287-RAW","name":"Synthetic RAW 1287","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1287-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1287-WIP","name":"Synthetic WIP 1287","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true}
]$source$::jsonb);

select is((select count(*)::int from ops.wip_items
            where esb_product_id like 'SYNTH-ERP-P-1287-%' and kind is null and flag_active),
          2, 'ERP import rows start without an item-level classification');
select is((select count(*)::int from ops.cafe_item_settings_read
            where item_id in (select id from ops.wip_items where esb_product_id like 'SYNTH-ERP-P-1287-%')
              and branch_id = '00000000-0000-0000-0000-00000000bf01'
              and activity = 'kitchen' and kind is null and not is_active),
          2, 'every stream starts unclassified and inactive');
select is((select count(*)::int from ops.wip_items
            where id = '00000000-0000-0000-0000-00000000ab01' and kind = 'WIP' and flag_active
              and reference_source = 'manual'),
          1, 'existing manually maintained kitchen WIP remains active');
select is((select count(*)::int from ops.cafe_item_reference_source($source$[
  {"esb_product_id":"SYNTH-ERP-P-1287-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1287-RAW","name":"Synthetic RAW 1287","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb) where kind is null),
          1, 'the source parser does not apply the automatic classifier');
select ok(
  position('classify_cafe_item_kind' in pg_get_functiondef('ops.refresh_cafe_item_references(jsonb)'::regprocedure)) = 0
  and position('classify_cafe_item_kind' in pg_get_functiondef('ops.cafe_item_reference_source(jsonb)'::regprocedure)) = 0,
  'neither ERP refresh nor its parser calls the retained suggestion classifier');

-- Replace the classifier temporarily with a hard failure: a successful refresh proves runtime
-- refresh also does not invoke it. The transaction rollback restores the original suggestion.
create or replace function ops.classify_cafe_item_kind(
  p_category text,
  p_category_type_name text,
  p_has_active_bom_output boolean,
  p_is_stock boolean,
  p_is_active boolean
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'classifier was unexpectedly invoked';
end;
$$;
select lives_ok($$select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1287-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1287-RAW","name":"Synthetic RAW 1287","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1287-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1287-WIP","name":"Synthetic WIP 1287","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true}
]$source$::jsonb)$$,
  'refresh completes even when the retained classifier would throw');
select is((select count(*)::int from ops.wip_items
            where esb_product_id like 'SYNTH-ERP-P-1287-%' and kind is null),
          2, 'refresh clears rather than carries an item-level classifier result');
select set_config('app.allow_test_seeds', 'off', true);

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ok(ops.can_manage_cafe_item_settings('kitchen'), 'an Ops Lead can edit per-stream item classification');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1287-RAW'),
    'Team raw item',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW')],
    'RAW', true
  )
$$, 'an authorized team editor can assign RAW and activate the stream item');
select is((select kind || ':' || is_active::text from ops.cafe_item_settings_read
            where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1287-RAW')
              and branch_id = '00000000-0000-0000-0000-00000000bf01'
            limit 1), 'RAW:true', 'capture readers expose the team-set kind and active status');

select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1287-RAW'),
    'Team raw item',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW')],
    'WIP', true
  )
$$, 'an item kind can be changed independently for its stream');
select ok(
  exists (select 1 from shared.record_history where schema_name = 'ops' and table_name = 'cafe_item_settings'
           and field_name = 'kind' and old_value = 'RAW' and new_value = 'WIP'),
  'kind edits use the existing history mechanism');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1287-RAW'),
    'Team raw item',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW')],
    'WIP', false
  )
$$, 'the team can deactivate an item without losing its kind');
select ok(exists (select 1 from shared.record_history where schema_name = 'ops' and table_name = 'cafe_item_settings'
                  and field_name = 'is_active' and old_value = 'true' and new_value = 'false'),
          'active-status edits use the existing history mechanism');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1287-RAW'),
    'Team raw item',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW')],
    'RAW', true
  )
$$, 'the stream can restore active RAW classification');
reset role;
select set_config('app.allow_test_seeds', 'on', true);
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select lives_ok($$select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1287-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1287-RAW","name":"Synthetic RAW 1287","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1287-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1287-WIP","name":"Synthetic WIP 1287","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true}
]$source$::jsonb)$$,
  'ERP refresh keeps unchanged stream membership rows in place');
select set_config('app.allow_test_seeds', 'off', true);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((select kind || ':' || is_active::text from ops.cafe_item_settings_read
            where item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1287-RAW')
              and branch_id = '00000000-0000-0000-0000-00000000bf01'
            limit 1), 'RAW:true', 'team-set kind and activation survive an ERP refresh');

select throws_ok($$
  insert into ops.kitchen_logs
    (id, business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values
    ('00000000-0000-0000-0000-00000000c870', '00000000-0000-0000-0000-00000000bb01',
     '2099-12-31', '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce',
     (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1287-RAW'), 1)
$$, 'P0013', 'CAFE_WIP_ITEM_REQUIRED: production logs and plans require a WIP item',
  'team-classified RAW items cannot be used for production');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select throws_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf01', 'kitchen',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1287-RAW'),
    'Member attempt', null, array[]::uuid[], 'WIP', true
  )
$$, '42501', null, 'ordinary members cannot edit team kind or active status');

-- A real Org B ERP row/settings is the negative control for Org A reads and writes.
reset role;
select set_config('app.allow_test_seeds', 'on', true);
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000b1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1287-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1287-RAW","name":"Synthetic RAW 1287","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1287-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1287-WIP","name":"Synthetic WIP 1287","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.test_org_b_item_id',
  (select id::text from ops.wip_items where org_id = '00000000-0000-0000-0000-0000000000b1'
    and esb_product_id = 'SYNTH-ERP-P-1287-RAW'), true);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","ops_lead"]}');
select lives_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf09', 'kitchen',
    current_setting('app.test_org_b_item_id')::uuid,
    'Org B raw',
    (select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW'),
    array[(select id from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1287-RAW')],
    'RAW', true
  )
$$, 'the foreign-organization control can configure its own item');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_item_settings_read
            where item_id = current_setting('app.test_org_b_item_id')::uuid),
          0, 'an Org A member cannot read Org B team settings');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$
  select ops.save_cafe_item_settings(
    '00000000-0000-0000-0000-00000000bf09', 'kitchen',
    current_setting('app.test_org_b_item_id')::uuid,
    'Cross-org attempt', null, array[]::uuid[], 'WIP', true
  )
$$, 'P0002', null, 'an Org A editor cannot save settings for an Org B item');

reset role;
select * from finish();
rollback;
