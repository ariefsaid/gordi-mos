begin;
create extension if not exists pgtap with schema extensions;
select plan(37);
select set_config('app.allow_test_seeds','on',true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id','00000000-0000-0000-0000-0000000000a1',true);
create temp table usage_source as select jsonb_agg(jsonb_build_object(
  'esb_product_id', product, 'esb_product_detail_id',product || '-unit',
  'name',product,'category',category,'unit_name','portion','erp_category_type_name','Inventory',
  'is_stock',true,'has_active_bom_output',true,'is_active',true,'branch_code',null)) as rows
from (values ('USAGE-SHARED','Kitchen'),('USAGE-HQ','Kitchen'),('USAGE-BAR','Bar'),
             ('USAGE-NONE','Kitchen'),('USAGE-DROP','Kitchen')) as fixture(product,category);
select ops.refresh_cafe_item_references((select rows from usage_source));
select is((select count(*)::int from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id like 'USAGE-%'),0,
  'AC1: null branch catalog rows create no memberships without usage');
create temp table usage_result as select ops.refresh_cafe_stream_items('[
 {"esb_product_id":"USAGE-SHARED","branch_code":"rumah_rames"},
 {"esb_product_id":"USAGE-SHARED","branch_code":"gordi_hq"},
 {"esb_product_id":"USAGE-HQ","branch_code":"gordi_hq"},
 {"esb_product_id":"USAGE-BAR","branch_code":"rumah_rames"},
 {"esb_product_id":"USAGE-DROP","branch_code":"rumah_rames"},
 {"esb_product_id":"USAGE-NONE","branch_code":"unmapped"}]') as report;
select is((select count(*)::int from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id='USAGE-SHARED'),2,'AC2: shared production item is on both branches');
select is((select count(*)::int from ops.wip_items where esb_product_id='USAGE-SHARED'),1,'shared branches keep one item identity');
select is((select count(*)::int from ops.cafe_item_settings_read where erp_name='USAGE-HQ' and branch_id='00000000-0000-0000-0000-00000000bf02'),0,'AC3: HQ-only item absent from Rames Items');
select is((select count(*)::int from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id='USAGE-BAR' and si.activity='kitchen'),0,'AC4: Bar item never enters Kitchen');
select is((select count(*)::int from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id='USAGE-SHARED' and si.activity='bar'),0,'AC4: Kitchen item never enters Bar');
select is((select (report->>'skipped_unmapped')::int from usage_result),1,'AC5: unmapped branch skipped and counted');
select ops._test_configure_cafe_items(array(select id from ops.wip_items where esb_product_id in ('USAGE-SHARED','USAGE-HQ')));
select cmp_ok((select count(*)::int from ops.stream_items where org_id='00000000-0000-0000-0000-0000000000b1'),'>',0,'wrong-org read test has real memberships');
update ops.wip_items set category='Kitchen' where id='00000000-0000-0000-0000-00000000ab09';
update ops.stream_items set hidden_at=now() where org_id='00000000-0000-0000-0000-0000000000b1';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}');
select lives_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf02','kitchen',(select id from ops.wip_items where esb_product_id='USAGE-SHARED'),true)$$,'AC6: ops lead hides an ESB membership');
select is((ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01','kitchen',jsonb_build_array(jsonb_build_object(
  'client_key','f0140000-0000-0000-0000-000000000001','item_id',(select id from ops.wip_items where esb_product_id='USAGE-HQ'),'quantity','1')))->0->>'outcome'),
  'submitted','count reference fixture is submitted through the real writer');
select is((select count(*)::int from ops.cafe_item_settings_read where erp_name='USAGE-SHARED' and branch_id='00000000-0000-0000-0000-00000000bf02'),0,'hidden item absent from Items reader');
select is((select count(*)::int from ops.cafe_item_references where esb_product_id='USAGE-SHARED' and branch_id='00000000-0000-0000-0000-00000000bf02'),0,'hidden item absent from count/reference picker');
select throws_ok($$insert into ops.kitchen_plans(log_date,branch_id,activity,action,wip_item_id,qty_porsi) values ('2026-10-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',(select id from ops.wip_items where esb_product_id='USAGE-SHARED'),1)$$,'P0012',null,'hidden item refused for new plan');
select throws_ok($$insert into ops.kitchen_logs(business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi) values ('00000000-0000-0000-0000-00000000bb01','2026-10-20','00000000-0000-0000-0000-00000000bf02','kitchen','produce',(select id from ops.wip_items where esb_product_id='USAGE-SHARED'),1)$$,'P0012',null,'hidden item refused for add-to-log');
reset role;
delete from ops.cafe_item_settings where wip_item_id=(select id from ops.wip_items where esb_product_id='USAGE-HQ');
select ops.refresh_cafe_item_references((select rows from usage_source));
select ops.refresh_cafe_stream_items('[{"esb_product_id":"USAGE-SHARED","branch_code":"rumah_rames"}]');
select ok((select is_listed from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id='USAGE-HQ'),
  'count-backed membership remains listed even without settings or usage');
select ok((select hidden_at is not null from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id='USAGE-SHARED' and si.branch_id='00000000-0000-0000-0000-00000000bf02'),'AC6: both refreshes leave manual hide intact');
select is((select count(*)::int from ops.cafe_item_settings s join ops.wip_items item on item.id=s.wip_item_id where item.esb_product_id='USAGE-SHARED'),2,'hide and reconcile preserve settings');
select ok((select not is_listed from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id='USAGE-DROP'),'AC9 amended: unused ESB membership retained but no longer listed');
select is((select count(*)::int from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id='USAGE-DROP'),1,'reconcile never deletes rows');
create temp table kept_report as select ops.refresh_cafe_stream_items('[]') as report;
select is((select jsonb_array_length(report->'kept_referenced') from kept_report),3,'AC9: settings-backed and count-backed rows kept and reported');
set local role authenticated;
select lives_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf02','kitchen',(select id from ops.wip_items where esb_product_id='USAGE-SHARED'),false)$$,'AC7: ops lead restores membership manually');
select is((select count(*)::int from ops.cafe_item_settings_read where erp_name='USAGE-SHARED' and branch_id='00000000-0000-0000-0000-00000000bf02'),1,'restored item keeps saved settings and unit');
select lives_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf02','kitchen',(select id from ops.wip_items where esb_product_id='USAGE-NONE'),false)$$,'manual add over catalog');
select throws_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf02','kitchen',(select id from ops.wip_items where esb_product_id='USAGE-BAR'),false)$$,'23514',null,'manual add respects category/activity');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select throws_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf02','kitchen',(select id from ops.wip_items where esb_product_id='USAGE-NONE'),true)$$,'42501',null,'AC10: members cannot hide memberships');
select throws_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf02','kitchen',(select id from ops.wip_items where esb_product_id='USAGE-NONE'),false)$$,'42501',null,'AC10: members cannot add or restore memberships');
select throws_ok($$insert into ops.stream_items(branch_id,activity,wip_item_id,source) values ('00000000-0000-0000-0000-00000000bf01','kitchen',(select id from ops.wip_items where esb_product_id='USAGE-NONE'),'manual')$$,'42501',null,'AC10: direct inserts remain role gated');
select is((with removed as (delete from ops.stream_items returning id) select count(*)::int from removed),0,'AC10: members cannot directly delete memberships');
select throws_ok($$update ops.stream_items set hidden_at=null$$,'42501',null,'AC10: clients cannot bypass the RPC to edit hidden markers');
select is((select count(*)::int from ops.stream_items where org_id='00000000-0000-0000-0000-0000000000b1'),0,'AC10: hidden markers remain org scoped');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["ops_lead"]}');
select throws_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf09','kitchen','00000000-0000-0000-0000-00000000ab09',false)$$,'23514',null,'AC10: lead cannot add another org item');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["ops_lead"]}');
select lives_ok($$select ops.set_cafe_stream_item('00000000-0000-0000-0000-00000000bf09','kitchen','00000000-0000-0000-0000-00000000ab09',false)$$,'wrong-org control: its own lead can restore the same hidden item');
reset role;
select ops.refresh_cafe_item_references((select rows from usage_source));
select ops.refresh_cafe_stream_items('[]');
select is((select count(*)::int from ops.stream_items si join ops.wip_items item on item.id=si.wip_item_id where item.esb_product_id in ('USAGE-SHARED','USAGE-NONE') and si.branch_id='00000000-0000-0000-0000-00000000bf02' and hidden_at is null and is_listed and si.source='manual'),2,'AC7/8: manual additions survive both refreshes without usage');
select ops.refresh_cafe_stream_items('[{"esb_product_id":"USAGE-DROP","branch_code":"rumah_rames"}]');
select is((select count(*)::int from ops.cafe_item_settings_read where erp_name='USAGE-DROP'),1,'new usage automatically relists a previously unused membership');
select is(has_function_privilege('authenticated','ops.refresh_cafe_stream_items(jsonb)','EXECUTE'),false,'refresh stays private');
select throws_ok($$select ops.refresh_cafe_stream_items('[{"esb_product_id":"USAGE-DROP"}]')$$,'22023',null,'incomplete usage snapshots are refused');
select ok((select relforcerowsecurity from pg_class where oid='ops.stream_items'::regclass),'forced RLS preserved');
select * from finish();
rollback;
