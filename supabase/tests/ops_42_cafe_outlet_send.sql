begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
select set_config('app.allow_test_seeds','on',true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds','off',true);
create function pg_temp.approve(p_id uuid) returns text language sql as $$
 select ops.approve_kitchen_log(p_id,'checked',(select updated_at from ops.kitchen_logs where id=p_id))
$$;
create function pg_temp.balance(p_place text, p_date date default '2026-05-04') returns numeric language sql as $$
 select coalesce(sum((value->>'usable_qty')::numeric),0) from jsonb_array_elements(
 ops.cafe_location_balances(p_date,'00000000-0000-0000-0000-00000000bf02','kitchen')->'rows')
 where value->>'location_id' is not distinct from p_place and value->>'item_unit_id'='00000000-0000-0000-0000-00000000de01'
$$;
insert into ops.kitchen_logs(org_id,business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi,status,source)
values('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-05-03','00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab02',1,'Approved','teable_import');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select set_config('app.kitchen',ops.create_cafe_location('{"name":"Kitchen","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"]}','f1420000-0000-0000-0000-000000000001')->>'id',true);
select set_config('app.outlet',ops.create_cafe_location('{"name":"Outlet","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf02"]}','f1420000-0000-0000-0000-000000000002')->>'id',true);
select ops.save_cafe_stream_location_defaults('00000000-0000-0000-0000-00000000bf02','kitchen',jsonb_build_object('production_location_id',current_setting('app.kitchen'),'storage_location_id',current_setting('app.kitchen')),0,'f1420000-0000-0000-0000-000000000003');
select lives_ok($$insert into ops.kitchen_plans(log_date,branch_id,activity,action,wip_item_id,qty_porsi) values('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen','outlet_send','00000000-0000-0000-0000-00000000ab01',4)$$,'outlet send can be planned');
select throws_ok($$insert into ops.kitchen_plans(log_date,branch_id,activity,action,wip_item_id,qty_porsi) values('2026-05-04','00000000-0000-0000-0000-00000000bf01','kitchen','outlet_send','00000000-0000-0000-0000-00000000ab01',4)$$,'22023',null,'no outlet: no send');
insert into ops.kitchen_logs(id,business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi,notes) values
('f1420000-0000-0000-0000-000000000010','00000000-0000-0000-0000-00000000bb01','2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',10,'made'),
('f1420000-0000-0000-0000-000000000011','00000000-0000-0000-0000-00000000bb01','2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',3,'sent');
select lives_ok($$select ops.insert_cafe_capture_logs(jsonb_build_array(jsonb_build_object('client_request_id','f1420000-0000-0000-0000-000000000012','business_unit_id','00000000-0000-0000-0000-00000000bb01','log_date','2026-05-04','branch_id','00000000-0000-0000-0000-00000000bf02','activity','kitchen','action','outlet_send','wip_item_id','00000000-0000-0000-0000-00000000ab01','qty_porsi',4,'from_storage_location_id',current_setting('app.kitchen'),'to_storage_location_id',current_setting('app.outlet'))))$$,'outlet send captured through normal batch RPC');
select set_config('app.send',(select id::text from ops.kitchen_logs where client_request_id='f1420000-0000-0000-0000-000000000012'),true);
select is((select status from ops.kitchen_logs where id=current_setting('app.send')::uuid),'Submitted','send waits for review');
select is((select ops.action_label(l) from ops.kitchen_logs l where id=current_setting('app.send')::uuid),'Send to Rumah Rames outlet','record names the outlet, not an ESB transfer');
select throws_ok($$select pg_temp.approve(current_setting('app.send')::uuid)$$,'P0004',null,'production first also protects outlet sends');
select pg_temp.approve('f1420000-0000-0000-0000-000000000010');
select pg_temp.approve('f1420000-0000-0000-0000-000000000011');
select throws_ok($$select pg_temp.approve(current_setting('app.send')::uuid)$$,'P0001','CAFE_LOCATION_MOVE_BALANCE_UNALLOCATED','opening placement remains an ops prerequisite');
select ops.place_cafe_unassigned_stock(jsonb_build_object('stream',jsonb_build_object('branch_id','00000000-0000-0000-0000-00000000bf02','activity','kitchen'),'to_location_id',current_setting('app.kitchen'),'as_of','2026-05-04'),'f1420000-0000-0000-0000-000000000020');
select set_config('app.stock',(select jsonb_agg(to_jsonb(s) order by wip_item_id)::text from ops.kitchen_stock_for_date('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen') s),true);
select set_config('app.outbox',(select count(*)::text from integrations.esb_push),true);
select is(pg_temp.approve(current_setting('app.send')::uuid),null::text,'send approved without an ERP batch');
select is(pg_temp.balance(current_setting('app.kitchen')),3::numeric,'10 made - 3 Radiant - 4 outlet = 3 kitchen');
select is(pg_temp.balance(current_setting('app.outlet')),4::numeric,'outlet holds 4');
select is(pg_temp.balance(null),0::numeric,'Unassigned unchanged');
select is((select jsonb_agg(to_jsonb(s) order by wip_item_id)::text from ops.kitchen_stock_for_date('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen') s),current_setting('app.stock'),'stream book byte-identical');
select is(ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-05-05','00000000-0000-0000-0000-00000000bf02','kitchen'),7::numeric,'next-day book unchanged');
select is((select count(*)::text from integrations.esb_push),current_setting('app.outbox'),'zero new outbox rows');
select is((select count(*)::int from ops.location_movements where source_type='log' and source_id=current_setting('app.send')::uuid and kind='move'),1,'one log-linked location move');
select throws_ok($$select pg_temp.approve(current_setting('app.send')::uuid)$$,'P0003',null,'retry does not reapprove');
select is((select count(*)::int from ops.location_movements where source_id=current_setting('app.send')::uuid),1,'retry never duplicates');
-- A future move leaves only one at the kitchen. A backdated send of two must fail atomically.
select ops.move_cafe_stock(jsonb_build_object('stream',jsonb_build_object('branch_id','00000000-0000-0000-0000-00000000bf02','activity','kitchen'),'item_unit_id','00000000-0000-0000-0000-00000000de01','quantity','2','movement_date','2026-05-06','from_location_id',current_setting('app.kitchen'),'to_location_id',current_setting('app.outlet')),'f1420000-0000-0000-0000-000000000021');
insert into ops.kitchen_logs(id,business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi,notes) values
('f1420000-0000-0000-0000-000000000022','00000000-0000-0000-0000-00000000bb01','2026-05-05','00000000-0000-0000-0000-00000000bf02','kitchen','outlet_send','00000000-0000-0000-0000-00000000ab01',2,'send');
select throws_ok($$select pg_temp.approve('f1420000-0000-0000-0000-000000000022')$$,'P0001','CAFE_LOCATION_MOVE_INSUFFICIENT_STOCK','later-date source balance protects approval');
select is((select status from ops.kitchen_logs where id='f1420000-0000-0000-0000-000000000022'),'Submitted','refused approval stays reviewable');
select is((select count(*)::int from ops.location_movements where source_id='f1420000-0000-0000-0000-000000000022'),0,'refused approval writes nothing');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select pg_temp.approve('f1420000-0000-0000-0000-000000000022')$$,'42501',null,'ordinary member cannot approve');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000e1","access_roles":["admin","member"]}');
select is((select count(*)::int from ops.location_movements where source_id=current_setting('app.send')::uuid),0,'other org cannot read send ledger');
select throws_ok($$select pg_temp.approve('f1420000-0000-0000-0000-000000000022')$$,'42501',null,'other org cannot approve');
reset role;
select * from finish();
rollback;
