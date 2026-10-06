-- #1240 — caller-supplied ERP item-detail references, classification, stream scope and RLS.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);
-- A hand-made WIP item that predates OD-2026-10-06-ESB-ITEMS. Replica mode writes it the way an
-- existing row looks to the new guards: present and never re-checked.
set local session_replication_role = replica;
insert into ops.wip_items (id, org_id, name, category, flag_active, kind, reference_source) values
  ('00000000-0000-0000-0000-00000000c240','00000000-0000-0000-0000-0000000000a1','Legacy hand-made WIP','Mains',true,'WIP','manual');
insert into ops.item_units (org_id, wip_item_id, unit_name, esb_product_detail_id, is_default, confirmed_at) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000c240','porsi','PD-PORSI-C240',true,now());
set local session_replication_role = origin;

create temporary table cafe_reference_test_source (source_rows jsonb not null);
insert into cafe_reference_test_source values ($source$[
  {"esb_product_id":"SYNTH-ERP-P-1240-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1240-RAW-A","name":"Synthetic RAW Sample","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true,"branch_code":null},
  {"esb_product_id":"SYNTH-ERP-P-1240-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1240-RAW-B","name":"Synthetic RAW Sample","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":false,"is_active":true,"branch_code":null},
  {"esb_product_id":"SYNTH-ERP-P-1240-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1240-RAW-C","name":"Synthetic RAW Sample","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":false,"is_active":true,"branch_code":null},
  {"esb_product_id":"SYNTH-ERP-P-1240-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1240-RAW-INACTIVE","name":"Synthetic RAW Sample","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":false,"is_active":false,"branch_code":null},
  {"esb_product_id":"SYNTH-ERP-P-1240-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1240-WIP","name":"Synthetic WIP Sample","category":"BAR","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true,"branch_code":"gordi_hq"},
  {"esb_product_id":"SYNTH-ERP-P-1240-NONSTOCK","esb_product_detail_id":"SYNTH-ERP-PD-1240-NONSTOCK","name":"Synthetic Nonstock Sample","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":false,"is_active":true,"branch_code":null}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'on', true);
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);

select is((select count(*)::int from ops.cafe_item_reference_source((select source_rows from cafe_reference_test_source))), 6,
  'source parser accepts one synthetic row per ERP product detail, including excluded non-stock rows');
select is((select count(*)::int from ops.cafe_item_reference_source((select source_rows from cafe_reference_test_source)) where kind is null), 6,
  'source parser leaves every ERP row unclassified for team-owned settings');
select is((select count(*)::int from ops.cafe_item_reference_source((select source_rows from cafe_reference_test_source)) where kind is not null), 0,
  'ERP classification evidence is not applied by the item source parser');

select is(ops.classify_cafe_item_kind('BAR', 'Inventory', true, false, true), 'WIP',
  'classification: an active BOM output is WIP');
select is(ops.classify_cafe_item_kind('KITCHEN', 'Inventory', false, true, true), 'RAW',
  'classification: an active stock detail without an active BOM output is RAW');
select is(ops.classify_cafe_item_kind('KITCHEN', 'Inventory', false, false, true), null,
  'classification: a non-stock non-output is outside the RAW reference set');
select is(ops.classify_cafe_item_kind('KITCHEN', 'Inventory', false, true, false), null,
  'classification: an inactive source detail is excluded');
select is(ops.classify_cafe_item_kind('OTHER', 'Inventory', false, true, true), null,
  'classification: categories outside KITCHEN/BAR are excluded');

select lives_ok($$select ops.refresh_cafe_item_references((select source_rows from cafe_reference_test_source))$$,
  'refresh: synthetic source rows populate the shared item/detail/stream catalog');
insert into ops.cafe_item_settings (org_id, branch_id, activity, wip_item_id)
select item.org_id, '00000000-0000-0000-0000-00000000bf01', 'kitchen', item.id
  from ops.wip_items item
 where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW';
insert into ops.cafe_item_setting_units (org_id, cafe_item_setting_id, item_unit_id)
select setting.org_id, setting.id, unit.id
  from ops.cafe_item_settings setting
  join ops.wip_items item on item.id = setting.wip_item_id
  join ops.item_units unit on unit.wip_item_id = item.id
 where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW'
   and unit.esb_product_detail_id = 'SYNTH-ERP-PD-1240-RAW-A';
update ops.cafe_item_settings setting
   set default_item_unit_id = unit.id
  from ops.wip_items item
  join ops.item_units unit on unit.wip_item_id = item.id
 where setting.wip_item_id = item.id
   and item.esb_product_id = 'SYNTH-ERP-P-1240-RAW'
   and unit.esb_product_detail_id = 'SYNTH-ERP-PD-1240-RAW-A';
select lives_ok($$select ops.refresh_cafe_item_references((select source_rows from cafe_reference_test_source))$$,
  'refresh: replaying the same source snapshot is idempotent');
select is((select unit.esb_product_detail_id from ops.cafe_item_settings setting
  join ops.item_units unit on unit.id = setting.default_item_unit_id
  join ops.wip_items item on item.id = setting.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW'
    and setting.branch_id = '00000000-0000-0000-0000-00000000bf01'),
  'SYNTH-ERP-PD-1240-RAW-A', 'refresh preserves the manager-selected default detail');
select is((select string_agg(unit.esb_product_detail_id, ',' order by unit.esb_product_detail_id)
  from ops.cafe_item_settings setting
  join ops.cafe_item_setting_units shown on shown.cafe_item_setting_id = setting.id
  join ops.item_units unit on unit.id = shown.item_unit_id
  join ops.wip_items item on item.id = setting.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW'
    and setting.branch_id = '00000000-0000-0000-0000-00000000bf01'),
  'SYNTH-ERP-PD-1240-RAW-A', 'refresh preserves the manager-selected shown details');
select is((select count(*)::int from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1240-RAW' and kind is null and flag_active), 1,
  'refresh: one ERP product creates one active but unclassified shared item');
select is((select count(*)::int from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1240-WIP' and kind is null and flag_active), 1,
  'refresh: a BOM output also remains team-unclassified');
select is((select count(*)::int from ops.item_units unit join ops.wip_items item on item.id = unit.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW' and unit.source_active), 3,
  'refresh: the RAW item has exactly its three active source product details as units');
select is((select count(DISTINCT unit.unit_name)::int from ops.item_units unit join ops.wip_items item on item.id = unit.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW' and unit.source_active), 1,
  'refresh: duplicate ERP unit labels do not collapse distinct product details');
select is((select string_agg(unit.esb_product_detail_id, ',' order by unit.esb_product_detail_id)
  from ops.item_units unit join ops.wip_items item on item.id = unit.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW' and unit.source_active),
  'SYNTH-ERP-PD-1240-RAW-A,SYNTH-ERP-PD-1240-RAW-B,SYNTH-ERP-PD-1240-RAW-C',
  'refresh: each selectable unit retains its exact synthetic ERP product-detail identity');
select is((select count(*)::int from ops.item_units unit join ops.wip_items item on item.id = unit.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW' and unit.is_default), 0,
  'refresh: ERP import does not infer unit defaults or conversions');
select is((select count(*)::int from ops.item_units unit join ops.wip_items item on item.id = unit.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW' and unit.erp_is_stock), 1,
  'refresh: ERP stock evidence remains attached to each source detail');
select is((select count(*)::int from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1240-RAW-INACTIVE'), 0,
  'refresh: an inactive detail never becomes a selectable unit');
select is((select unit.erp_is_stock from ops.item_units unit join ops.wip_items item on item.id = unit.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-WIP'), false,
  'refresh: source detail stock evidence is retained for WIP outputs too');
select is((select count(*)::int from ops.stream_items stream_item join ops.wip_items item on item.id = stream_item.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW' and stream_item.activity = 'kitchen'),
  (select count(DISTINCT team.branch_id)::int from shared.teams team join shared.orgs org on org.id = team.org_id
    where org.id = '00000000-0000-0000-0000-0000000000a1' and team.activity = 'kitchen' and team.branch_id is not null and team.archived_at is null),
  'refresh: category membership makes the RAW item available on each live kitchen stream');
select is((select count(*)::int from ops.stream_items stream_item join ops.wip_items item on item.id = stream_item.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-WIP' and stream_item.branch_id = '00000000-0000-0000-0000-00000000bf01' and stream_item.activity = 'bar'), 1,
  'refresh: an ERP branch code narrows WIP membership to the matching bar stream');
select is((select count(*)::int from ops.stream_items stream_item join ops.wip_items item on item.id = stream_item.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-WIP' and stream_item.branch_id <> '00000000-0000-0000-0000-00000000bf01'), 0,
  'refresh: branch-scoped WIP is not added to other branches');
select is((select count(*)::int from ops.cafe_item_references reference
  where reference.esb_product_id = 'SYNTH-ERP-P-1240-RAW' and reference.kind is null),
  3 * (select count(DISTINCT team.branch_id)::int from shared.teams team join shared.orgs org on org.id = team.org_id
    where org.id = '00000000-0000-0000-0000-0000000000a1' and team.activity = 'kitchen' and team.branch_id is not null and team.archived_at is null),
  'reference view: every unclassified product detail appears on each mapped kitchen stream');
select is((select count(DISTINCT reference.item_unit_id)::int from ops.cafe_item_references reference
  where reference.esb_product_id = 'SYNTH-ERP-P-1240-RAW'), 3,
  'reference view: product-detail identity remains distinct across streams');
select is((select count(*)::int from ops.cafe_item_references reference
  where reference.esb_product_id = 'SYNTH-ERP-P-1240-WIP' and reference.kind is null), 1,
  'reference view: the imported unclassified detail is readable through the shared catalog');

insert into ops.wip_items (
  id, org_id, name, category, flag_active, esb_product_id, kind, reference_source,
  erp_category_type_name, has_active_bom_output
) values (
  '00000000-0000-0000-0000-00000000c849','00000000-0000-0000-0000-0000000000b1',
  'Synthetic Other Org Reference','Kitchen',true,'SYNTH-ERP-P-1240-OTHER','RAW','erp_catalog','Inventory',false
);
insert into ops.item_units (org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id)
values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000c849',
  'SYNTHETIC-ERP-UNIT','SYNTH-ERP-PD-1240-OTHER','SYNTH-ERP-P-1240-OTHER');
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000bf09','kitchen',
  '00000000-0000-0000-0000-00000000c849','esb');
select cmp_ok((select count(*)::int from ops.cafe_item_references reference
  where reference.item_id = '00000000-0000-0000-0000-00000000c849'), '>', 0,
  'RLS precondition: another org has a synthetic item-detail reference row');

update ops.item_units unit set confirmed_at = now()
from ops.wip_items item
where item.id = unit.wip_item_id and item.esb_product_id = 'SYNTH-ERP-P-1240-RAW'
  and unit.esb_product_detail_id = 'SYNTH-ERP-PD-1240-RAW-A';
select is((select count(*)::int from ops.capture_form_items capture
  join ops.wip_items item on item.id = capture.wip_item_id where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW'), 0,
  'production capture excludes RAW even when one source detail is confirmed');
select is((select count(*)::int from ops.capture_form_items where wip_item_id = '00000000-0000-0000-0000-00000000c240'), 1,
  'the legacy capture view still lists an existing hand-made WIP item after a refresh');

select throws_ok($$select ops.refresh_cafe_item_references('[]'::jsonb)$$, '22023', null,
  'refresh rejects an empty snapshot instead of deactivating the catalog');
select is((select count(*)::int from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1240-NONSTOCK'), 0,
  'refresh excludes active non-stock non-output rows instead of persisting them');
select throws_ok($$select ops.refresh_cafe_item_references('[{"esb_product_id":"SYNTH-ERP-P-MISSING-BOM","esb_product_detail_id":"SYNTH-ERP-PD-MISSING-BOM","name":"Synthetic Missing BOM","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":true,"is_active":true}]'::jsonb)$$,
  '23514', null, 'refresh rejects active inventory rows without BOM evidence');
select throws_ok($$select ops.refresh_cafe_item_references('[{"esb_product_id":"SYNTH-ERP-P-DUP","esb_product_detail_id":"SYNTH-ERP-PD-DUP","name":"Synthetic Duplicate","category":"BAR","unit_name":"SYNTHETIC-ERP-UNIT-A","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},{"esb_product_id":"SYNTH-ERP-P-DUP","esb_product_detail_id":"SYNTH-ERP-PD-DUP","name":"Synthetic Duplicate","category":"BAR","unit_name":"SYNTHETIC-ERP-UNIT-B","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}]'::jsonb)$$,
  '23514', 'an ERP product detail has conflicting source identity or unit labels',
  'refresh rejects conflicting records for one ERP product detail');
select throws_ok($$select ops.refresh_cafe_item_references($json$[
  {"esb_product_id":"SYNTH-ERP-P-1340-REQUIRED","esb_product_detail_id":"SYNTH-ERP-PD-1340-STOCK","name":"Synthetic Required Fields","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1340-REQUIRED","esb_product_detail_id":"","name":"Synthetic Required Fields","category":"KITCHEN","unit_name":"","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":false,"is_active":true}
]$json$::jsonb)$$,
  '23514', 'active café Inventory reference rows need ERP product/detail ids, name, unit, stock and BOM evidence',
  'refresh validates required fields on active non-stock non-output details of an imported product');
select throws_ok($$select ops.refresh_cafe_item_references($json$[
  {"esb_product_id":"SYNTH-ERP-P-1340-IDENTITY","esb_product_detail_id":"SYNTH-ERP-PD-1340-STOCK","name":"Synthetic Detail Identity","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1340-IDENTITY","esb_product_detail_id":"SYNTH-ERP-PD-1340-NONSTOCK","name":"Synthetic Detail Identity","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT-A","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1340-IDENTITY","esb_product_detail_id":"SYNTH-ERP-PD-1340-NONSTOCK","name":"Synthetic Detail Identity","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT-B","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":false,"is_active":true}
]$json$::jsonb)$$,
  '23514', 'an ERP product detail has conflicting source identity or unit labels',
  'refresh rejects conflicting identity on active non-stock non-output details');
-- If the old importer unexpectedly accepts the conflicting snapshot, restore the baseline before
-- later assertions about the synthetic RAW item; the successful import is a full snapshot.
do $$
begin
  perform ops.refresh_cafe_item_references((select source_rows from cafe_reference_test_source));
end
$$;
select throws_ok($$select ops.refresh_cafe_item_references('[{"esb_product_id":"SYNTH-ERP-P-CONFLICT","esb_product_detail_id":"SYNTH-ERP-PD-CONFLICT-A","name":"Synthetic Conflict","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},{"esb_product_id":"SYNTH-ERP-P-CONFLICT","esb_product_detail_id":"SYNTH-ERP-PD-CONFLICT-B","name":"Synthetic Conflict","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true}]'::jsonb)$$,
  '23514', 'an ERP product has conflicting source classification',
  'refresh rejects conflicting RAW/WIP evidence for one ERP product');

select set_config('app.allow_test_seeds', 'off', true);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select cmp_ok((select count(*)::int from ops.cafe_item_references reference
  where reference.esb_product_id = 'SYNTH-ERP-P-1240-RAW'), '>', 0,
  'RLS: an org member can read their synthetic RAW references');
select is((select count(*)::int from ops.cafe_item_references reference
  where reference.item_id = '00000000-0000-0000-0000-00000000c849'), 0,
  'RLS: an org member cannot read another org''s item-detail references');
select throws_ok($$insert into ops.cafe_item_references (item_id) values ('00000000-0000-0000-0000-00000000ab01')$$,
  '55000', null, 'reference view is read-only');
select throws_ok($$insert into ops.kitchen_logs (business_unit_id, log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-10-02','00000000-0000-0000-0000-00000000bf01','kitchen','produce',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1240-RAW'),1)$$,
  'P0014', 'CAFE_ITEM_NOT_ACTIVE: classify and activate this item for the stream before capture',
  'production logs reject ERP items until the team classifies and activates them');
select throws_ok($$insert into ops.kitchen_plans (log_date, branch_id, activity, action, wip_item_id, qty_porsi)
  values ('2026-10-02','00000000-0000-0000-0000-00000000bf01','kitchen','produce',
    (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1240-RAW'),1)$$,
  'P0014', 'CAFE_ITEM_NOT_ACTIVE: classify and activate this item for the stream before capture',
  'production plans reject ERP items until the team classifies and activates them');
select is((select count(*)::int from ops.kitchen_stock_for_date(
  '2026-10-02','00000000-0000-0000-0000-00000000bf01','kitchen') stock
  where stock.wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1240-RAW')), 0,
  'production stock remains WIP-only');
select is((select count(*)::int from ops.kitchen_logs log
  where log.wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1240-RAW')), 0,
  'a rejected RAW log does not post a transaction');
select is((select count(*)::int from ops.kitchen_plans plan
  where plan.wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1240-RAW')), 0,
  'a rejected RAW plan does not create a production transaction');
reset role;

select is(has_function_privilege('authenticated', 'ops.refresh_cafe_item_references(jsonb)', 'EXECUTE'), false,
  'reference refresh is not callable by authenticated clients');
select is(has_function_privilege('authenticated', 'ops.cafe_item_reference_source(jsonb)', 'EXECUTE'), false,
  'source parser is not callable by authenticated clients');

select set_config('app.allow_test_seeds', 'on', true);
select lives_ok($$select ops.refresh_cafe_item_references('[{"esb_product_id":"SYNTH-ERP-P-1240-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1240-RAW-A","name":"Synthetic RAW Sample","category":"KITCHEN","unit_name":"SYNTHETIC-ERP-UNIT","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}]'::jsonb)$$,
  'refresh: a smaller full snapshot retires omitted product details and products');
select is((select count(*)::int from ops.item_units unit where unit.esb_product_detail_id in ('SYNTH-ERP-PD-1240-RAW-B', 'SYNTH-ERP-PD-1240-RAW-C') and not unit.source_active), 2,
  'refresh: omitted ERP product details remain for history but become inactive');
select is((select count(*)::int from ops.wip_items item where item.esb_product_id = 'SYNTH-ERP-P-1240-WIP' and not item.flag_active), 1,
  'refresh: omitted ERP products become inactive without deleting history');
select is((select count(*)::int from ops.cafe_item_references reference where reference.esb_product_id = 'SYNTH-ERP-P-1240-WIP'), 0,
  'reference view omits retired products');
select is((select count(*)::int from ops.item_units unit join ops.wip_items item on item.id = unit.wip_item_id
  where item.esb_product_id = 'SYNTH-ERP-P-1240-RAW' and unit.source_active), 1,
  'refresh leaves only source-present ERP product details selectable');

select * from finish();
rollback;
