-- #1863: staging-shaped stream, no human confirmation, and a non-stock default.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references((select jsonb_agg(row) from (
 select jsonb_build_object('esb_product_id','SYNTH-1863-'||n,
  'esb_product_detail_id','SYNTH-1863-STOCK-'||n, 'name','RRS shaped item '||n,
  'category','KITCHEN','unit_name','kg','erp_category_type_name','Inventory',
  'is_stock',true,'has_active_bom_output',false,'is_active',true) row from generate_series(1,154) n
 union all
 select jsonb_build_object('esb_product_id','SYNTH-1863-'||n,
  'esb_product_detail_id','SYNTH-1863-BATCH-'||n, 'name','RRS shaped item '||n,
  'category','KITCHEN','unit_name','batch','erp_category_type_name','Inventory',
  'is_stock',false,'has_active_bom_output',false,'is_active',true) from generate_series(119,154) n
) fixtures));
select ops.refresh_cafe_stream_items((select jsonb_agg(jsonb_build_object(
 'esb_product_id', esb_product_id, 'branch_code','rumah_rames')) from ops.wip_items
 where org_id='00000000-0000-0000-0000-0000000000a1' and esb_product_id like 'SYNTH-1863-%'));
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf02','kitchen',i.id,i.name,u.id,array[u.id],'RAW',true)
 from ops.wip_items i join ops.item_units u on u.wip_item_id=i.id and u.org_id=i.org_id
 where i.esb_product_id like 'SYNTH-1863-%' and u.esb_product_detail_id =
 case when substring(i.esb_product_id from '[0-9]+$')::int >118
 then replace(i.esb_product_id,'SYNTH-1863-','SYNTH-1863-BATCH-')
 else replace(i.esb_product_id,'SYNTH-1863-','SYNTH-1863-STOCK-') end;
select is((select count(*)::int from ops.item_units where esb_product_id like 'SYNTH-1863-%' and confirmed_at is not null),0,
 'AC-1863 fixture mirrors later streams with zero human-confirmed units');
select is((select count(*)::int from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf02','kitchen') where item_name like 'RRS shaped%'),154,
 'AC-1863 Count includes all 154 synced stock units without a confirmation backfill');
select is((select unit_name from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf02','kitchen') where item_name='RRS shaped item 154'),'kg',
 'AC-1863 Count uses the stock unit when the stream default is batch');
select is((select count(*)::int from ops.cafe_receivable_items('00000000-0000-0000-0000-00000000bf02','kitchen') where item_name like 'RRS shaped%'),154,
 'AC-1863 Receive and Request include synced stock units');
select is((select count(*)::int from ops.cafe_receivable_items('00000000-0000-0000-0000-00000000bf02','kitchen') where item_name like 'RRS shaped%' and is_default_unit),118,
 'AC-1863 Receive and Request retain default-unit flags');
select is((select count(*)::int from ops.cafe_count_excluded_items('00000000-0000-0000-0000-00000000bf02','kitchen') where item_name like 'RRS shaped%'),0,
 'AC-1863 stock-unit fallback removes items from exclusions');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'RRS shaped',null,null,'item','asc',null,200)->'counts'->>'shown_scope')::int,154,
 'AC-1863 Stock comparison includes the same 154 countable items');
select ok(ops._cafe_unit_is_confirmed('erp_catalog','SYNTH-DETAIL',null),'AC-1863 catalog coordinate is confirmed');
select ok(not ops._cafe_unit_is_confirmed('manual','SYNTH-DETAIL',null),'AC-1863 hand-made unit requires confirmation');
select ok(ops._cafe_unit_is_confirmed('manual','SYNTH-DETAIL',now()),'AC-1863 explicitly confirmed hand-made coordinate is confirmed');
select ok(not ops._cafe_unit_is_confirmed('erp_catalog',null,now()),'AC-1863 missing coordinate is never confirmed');
select * from finish();
rollback;
