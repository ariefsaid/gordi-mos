begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
select set_config('app.allow_test_seeds','on',true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id','00000000-0000-0000-0000-0000000000a1',true);
select ops.refresh_cafe_item_references((select jsonb_agg(jsonb_build_object(
  'esb_product_id', product, 'esb_product_detail_id', product || '-unit',
  'name', product, 'category','Kitchen','unit_name','kg','erp_category_type_name','Inventory',
  'is_stock', stock,'has_active_bom_output', bom,'is_active',true))
  from (values ('PREFILL-RAW',true,false),('PREFILL-WIP',true,true),
    ('PREFILL-NO-STOCK',false,true),('PREFILL-EXISTING',true,false),
    ('PREFILL-HIDDEN',true,false),('PREFILL-UNLISTED',true,false),
    ('PREFILL-AMBIGUOUS',true,false)) f(product,stock,bom)
));
-- Existing settings include a deliberately blank setup: existence alone protects it.
insert into ops.stream_items(org_id,branch_id,activity,wip_item_id,source,hidden_at,is_listed)
select org_id,'00000000-0000-0000-0000-00000000bf01','kitchen',id,'esb',
  case when esb_product_id='PREFILL-HIDDEN' then now() end, esb_product_id<>'PREFILL-UNLISTED'
from ops.wip_items where esb_product_id in ('PREFILL-EXISTING','PREFILL-HIDDEN','PREFILL-UNLISTED');
insert into ops.cafe_item_settings(org_id,branch_id,activity,wip_item_id,mos_name,kind,is_active)
select org_id,'00000000-0000-0000-0000-00000000bf01','kitchen',id,null,null,false
from ops.wip_items where esb_product_id='PREFILL-EXISTING';
insert into ops.stream_items(org_id,branch_id,activity,wip_item_id,source)
select org_id,'00000000-0000-0000-0000-00000000bf02','kitchen',id,'manual'
from ops.wip_items where esb_product_id='PREFILL-RAW';
insert into ops.cafe_item_settings(org_id,branch_id,activity,wip_item_id,mos_name,kind,is_active)
select org_id,'00000000-0000-0000-0000-00000000bf02','kitchen',id,'Other stream label','WIP',true
from ops.wip_items where esb_product_id='PREFILL-RAW';
create temp table original_settings as select s.* from ops.cafe_item_settings s;
insert into ops.item_units(org_id,wip_item_id,unit_name,esb_product_detail_id,esb_product_id,source_active,erp_is_stock)
select org_id,id,'alternate kg',esb_product_id || '-alt',esb_product_id,true,true
from ops.wip_items where esb_product_id='PREFILL-AMBIGUOUS';
select ops.refresh_cafe_stream_items('[
 {"esb_product_id":"PREFILL-RAW","branch_code":"gordi_hq"},
 {"esb_product_id":"PREFILL-WIP","branch_code":"gordi_hq"},
 {"esb_product_id":"PREFILL-NO-STOCK","branch_code":"gordi_hq"},
 {"esb_product_id":"PREFILL-EXISTING","branch_code":"gordi_hq"},
 {"esb_product_id":"PREFILL-HIDDEN","branch_code":"gordi_hq"},
 {"esb_product_id":"PREFILL-AMBIGUOUS","branch_code":"gordi_hq"}]');
select is((select count(*)::int from ops.cafe_item_settings s join ops.wip_items i on i.id=s.wip_item_id where i.esb_product_id in ('PREFILL-RAW','PREFILL-WIP') and s.branch_id='00000000-0000-0000-0000-00000000bf01'),2,'refresh prefills new stream memberships');
create temp view prefilled as select s.*,i.esb_product_id from ops.cafe_item_settings s join ops.wip_items i on i.id=s.wip_item_id where i.esb_product_id like 'PREFILL-%' and s.branch_id='00000000-0000-0000-0000-00000000bf01';
select is((select kind from prefilled where esb_product_id='PREFILL-RAW'),'RAW','known non-BOM item maps to RAW');
select is((select kind from prefilled where esb_product_id='PREFILL-WIP'),'WIP','BOM output maps to WIP');
select is((select count(*)::int from prefilled where esb_product_id in ('PREFILL-RAW','PREFILL-WIP') and not is_active),2,'prefill never activates items');
select is((select count(*)::int from prefilled s join ops.item_units u on u.id=s.default_item_unit_id where u.erp_is_stock and u.source_active and u.confirmed_at is null),2,'catalog stock coordinates supply the default without a manual confirmation timestamp');
select is((select count(*)::int from prefilled s join ops.cafe_item_setting_units u on u.cafe_item_setting_id=s.id and u.item_unit_id=s.default_item_unit_id),2,'prefilled defaults are shown');
select is((select count(*)::int from prefilled where esb_product_id='PREFILL-NO-STOCK'),0,'no stock unit means no prefill');
select is((select count(*)::int from prefilled where esb_product_id='PREFILL-AMBIGUOUS'),0,'ambiguous stock units are never guessed');
select is((select count(*)::int from prefilled where esb_product_id in ('PREFILL-HIDDEN','PREFILL-UNLISTED')),0,'hidden and unlisted memberships are not prefilled');
select results_eq('select s.* from ops.cafe_item_settings s join original_settings o on o.id=s.id order by s.id','select * from original_settings order by id','existing settings remain byte-for-byte unchanged');
select ops.prefill_cafe_item_settings('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from prefilled),3,'repeat prefill is idempotent');
select is(has_function_privilege('authenticated','ops.prefill_cafe_item_settings(uuid)','EXECUTE'),false,'prefill is private');
select is(has_table_privilege('authenticated','ops.cafe_item_settings_prefills','INSERT'),false,'clients cannot forge rollback provenance');
select ok((select relforcerowsecurity from pg_class where oid='ops.cafe_item_settings_prefills'::regclass),'provenance has forced RLS');
select is(ops._cafe_kind_from_esb(null),null::text,'unknown BOM evidence remains unset, as in the original mapping');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}');
select lives_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf01','kitchen',
  (select id from ops.wip_items where esb_product_id='PREFILL-UNLISTED'),false)$$,'manual restore also prefills its listed membership');
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (select id from ops.wip_items where esb_product_id='PREFILL-RAW'), 'Manager-owned prefill',
  (select unit.id from ops.item_units unit join ops.wip_items item on item.id=unit.wip_item_id where item.esb_product_id='PREFILL-RAW'),
  array[(select unit.id from ops.item_units unit join ops.wip_items item on item.id=unit.wip_item_id where item.esb_product_id='PREFILL-RAW')],
  'RAW', true, array[]::numeric[]
);
reset role;
select is((select count(*)::int from prefilled where esb_product_id='PREFILL-UNLISTED' and not is_active and default_item_unit_id is not null),1,'manual restore keeps its generated setup inactive');
select is((select count(*)::int from ops.cafe_item_settings_prefills p join prefilled s on s.id=p.setting_id where s.esb_product_id='PREFILL-RAW'),0,'manager save clears prefill ownership');
select ops._rollback_cafe_item_settings_prefills();
select is((select count(*)::int from prefilled),2,'rollback removes inactive prefills and keeps manager and existing settings');
select is((select count(*)::int from prefilled where esb_product_id='PREFILL-RAW' and is_active and mos_name='Manager-owned prefill'),1,'manager activation and name edit survive rollback');
select is((select count(*)::int from prefilled s join ops.cafe_item_setting_units shown on shown.cafe_item_setting_id=s.id and shown.item_unit_id=s.default_item_unit_id where s.esb_product_id='PREFILL-RAW'),1,'shown unit selection survives rollback');
select is((select count(*)::int from prefilled where esb_product_id in ('PREFILL-WIP','PREFILL-UNLISTED')),0,'untouched prefills are removed by rollback');
select is(has_function_privilege('authenticated','ops._rollback_cafe_item_settings_prefills()','EXECUTE'),false,'rollback deletion is private');
select * from finish();
rollback;
