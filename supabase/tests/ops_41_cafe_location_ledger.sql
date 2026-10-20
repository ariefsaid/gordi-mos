-- Approval, signed book placement, and same-stream physical sends.
begin;
create extension if not exists pgtap with schema extensions;
select plan(41);
select set_config('app.allow_test_seeds','on',true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds','off',true);
insert into shared.team_memberships(org_id,person_id,team_id,is_primary,effective_from)
select '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000d5',id,true,'2026-01-01'
from shared.teams where code='rumah_rames_kitchen' and org_id='00000000-0000-0000-0000-0000000000a1';

create function pg_temp.approve(p_id uuid) returns text language sql as $$
 select ops.approve_kitchen_log(p_id,'verified', (select updated_at from ops.kitchen_logs where id=p_id))
$$;
create function pg_temp.input(p_quantity text default '3', p_day date default '2026-05-04') returns jsonb language sql as $$
 select jsonb_build_object('stream',jsonb_build_object('branch_id','00000000-0000-0000-0000-00000000bf02','activity','kitchen'),
 'item_unit_id','00000000-0000-0000-0000-00000000de01','quantity',p_quantity,
 'from_location_id',current_setting('app.kitchen'),'to_location_id',current_setting('app.outlet'),'movement_date',p_day)
$$;
create function pg_temp.placement(p_unit uuid default null, p_quantity text default null) returns jsonb language sql as $$
 select jsonb_build_object('stream',jsonb_build_object('branch_id','00000000-0000-0000-0000-00000000bf02','activity','kitchen'),
 'to_location_id',current_setting('app.kitchen'),'as_of','2026-05-04','item_unit_id',p_unit,'quantity',p_quantity)
$$;
create function pg_temp.balance(p_location text, p_unit text default '00000000-0000-0000-0000-00000000de01', p_day date default '2026-05-04') returns numeric language sql as $$
 select coalesce(sum((value->>'usable_qty')::numeric),0)
 from jsonb_array_elements(ops.cafe_location_balances(p_day,'00000000-0000-0000-0000-00000000bf02','kitchen')->'rows')
 where value->>'location_id' is not distinct from p_location and value->>'item_unit_id'=p_unit
$$;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select set_config('app.kitchen',ops.create_cafe_location('{"name":"Kitchen","use":"both","branch_ids":["00000000-0000-0000-0000-00000000bf02"]}','f1410000-0000-0000-0000-000000000001')->>'id',true);
select set_config('app.outlet',ops.create_cafe_location('{"name":"Outlet","use":"storage","branch_ids":["00000000-0000-0000-0000-00000000bf02"]}','f1410000-0000-0000-0000-000000000002')->>'id',true);
reset role;
-- Explicit places, null place, and inserted-Approved history, across three dates.
insert into ops.kitchen_logs(id,org_id,business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi,status,to_storage_location_id,from_storage_location_id,notes)
values
('f1410000-0000-0000-0000-000000000010','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-05-01','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',10,'Submitted',current_setting('app.kitchen')::uuid,null,'made'),
('f1410000-0000-0000-0000-000000000011','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-05-02','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',3,'Submitted',null,current_setting('app.kitchen')::uuid,'sent'),
('f1410000-0000-0000-0000-000000000012','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-05-03','00000000-0000-0000-0000-00000000bf02','kitchen','waste',null,'00000000-0000-0000-0000-00000000ab02',2,'Submitted',null,current_setting('app.kitchen')::uuid,'spoiled'),
('f1410000-0000-0000-0000-000000000013','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-05-03','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab02',5,'Submitted',null,null,'unplaced'),
('f1410000-0000-0000-0000-000000000014','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-05-03','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab03',6,'Approved',current_setting('app.kitchen')::uuid,null,'history');
insert into storage.objects(bucket_id,name) values('waste-photos','00000000-0000-0000-0000-0000000000a1/f1410000-0000-0000-0000-000000000012/f1410000-0000-0000-0000-000000000099.jpg');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ok(shared.has_access_role('ops_lead'),'fixture has live review authority');
select pg_temp.approve('f1410000-0000-0000-0000-000000000010');
select pg_temp.approve('f1410000-0000-0000-0000-000000000011');
select pg_temp.approve('f1410000-0000-0000-0000-000000000012');
select pg_temp.approve('f1410000-0000-0000-0000-000000000013');
select is((select count(*)::int from ops.location_movements where source_type='log'),3,'AC1: produce, transfer and waste each post once');
select is((select (value->>'usable_qty')::numeric from jsonb_array_elements(ops.cafe_location_balances('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen')->'rows') where value->>'location_id' is null and value->>'item_id'='00000000-0000-0000-0000-00000000ab02'),5::numeric,'AC: the known location-book remainder remains allocatable when the stored stock snapshot is absent');
select results_eq($$select kind,from_location_id::text,to_location_id::text,quantity from ops.location_movements where source_type='log' order by source_id$$,
 format('values (''production''::text,null::text,%L::text,10::numeric),(''transfer'',%L,null,3),(''waste'',%L,null,2)',current_setting('app.kitchen'),current_setting('app.kitchen'),current_setting('app.kitchen')),'AC1: exact movement direction and quantity');
select throws_ok($$select pg_temp.approve('f1410000-0000-0000-0000-000000000010')$$,'P0003',null,'AC1: re-approval remains refused');
select is((select count(*)::int from ops.location_movements where source_id='f1410000-0000-0000-0000-000000000010'),1,'AC1: retry does not duplicate');
select is((select count(*)::int from ops.location_movements where source_id in ('f1410000-0000-0000-0000-000000000013','f1410000-0000-0000-0000-000000000014')),0,'AC1/2: no place and inserted Approved history do not post');
select is(pg_temp.balance(null),0::numeric,'AC3: running book uses all three dates, not only today net');
select throws_ok($$select ops.move_cafe_stock(pg_temp.input(),'f1410000-0000-0000-0000-000000000020')$$,'P0001','CAFE_LOCATION_MOVE_BALANCE_UNALLOCATED','AC7: signed opening required');
select is((ops.place_cafe_unassigned_stock(pg_temp.placement('00000000-0000-0000-0000-00000000de02','2'),'f1410000-0000-0000-0000-000000000021')->>'rows_written')::int,1,'AC4: ops lead can place one positive remainder');
select is(pg_temp.balance(current_setting('app.kitchen'),'00000000-0000-0000-0000-00000000de02'),0::numeric,'partial placement credits the selected item only');
select throws_ok($$select ops.place_cafe_unassigned_stock(pg_temp.placement('00000000-0000-0000-0000-00000000de02','4'),'f1410000-0000-0000-0000-000000000022')$$,'P0001','CAFE_LOCATION_MOVE_INSUFFICIENT_STOCK','placement cannot exceed the remainder');
select set_config('app.book_before',(select jsonb_agg(to_jsonb(stock) order by wip_item_id)::text from ops.kitchen_stock_for_date('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen') stock),true);
select set_config('app.available_before',ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen')::text,true);
select set_config('app.outbox_before',(select count(*)::text from integrations.esb_push),true);
select set_config('app.logs_before',(select count(*)::text from ops.kitchen_logs),true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.place_cafe_unassigned_stock(pg_temp.placement(),'f1410000-0000-0000-0000-000000000023')$$,'42501',null,'AC4: ordinary member cannot sign an opening');
select lives_ok($$select ops.move_cafe_stock(pg_temp.input(),'f1410000-0000-0000-0000-000000000024')$$,'AC5/7: Cafe member moves despite another unplaced item');
select is(pg_temp.balance(current_setting('app.kitchen')),4::numeric,'AC5: kitchen loses three');
select is(pg_temp.balance(current_setting('app.outlet')),3::numeric,'AC5: outlet gains three');
select is(pg_temp.balance(null),0::numeric,'AC5: unassigned unchanged');
select lives_ok($$select ops.move_cafe_stock(pg_temp.input(),'f1410000-0000-0000-0000-000000000024')$$,'same move request can be retried');
select is(pg_temp.balance(current_setting('app.outlet')),3::numeric,'move retry does not send twice');
select throws_ok($$select ops.move_cafe_stock(pg_temp.input('4'),'f1410000-0000-0000-0000-000000000024')$$,'22023','CAFE_LOCATION_MOVE_REQUEST_CONFLICT','move request cannot change quantity');
select is((select jsonb_agg(to_jsonb(stock) order by wip_item_id)::text from ops.kitchen_stock_for_date('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen') stock),current_setting('app.book_before'),'AC5: stream stock byte-identical');
select is(ops.stock_available_for_date('00000000-0000-0000-0000-00000000ab01','2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen')::text,current_setting('app.available_before'),'AC5: start-of-day stream stock unchanged');
-- Count as the original reviewer: a floor member cannot read the outbox.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((select count(*)::text from integrations.esb_push),current_setting('app.outbox_before'),'AC6: move writes no outbox');
select is((select count(*)::text from ops.kitchen_logs),current_setting('app.logs_before'),'AC6: move writes no log');
select is((ops.place_cafe_unassigned_stock(pg_temp.placement(),'f1410000-0000-0000-0000-000000000025')->>'rows_written')::int,2,'AC4: place all remaining items');
select is((ops.place_cafe_unassigned_stock(pg_temp.placement(),'f1410000-0000-0000-0000-000000000025')->>'rows_written')::int,0,'AC4: retry writes nothing');
select throws_ok($$select ops.place_cafe_unassigned_stock(pg_temp.placement() || '{"as_of":"2026-05-05"}','f1410000-0000-0000-0000-000000000025')$$,'22023',null,'AC4: same request cannot change its payload');
select is(ops.cafe_location_balances('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen')->>'coverage','complete','AC3: placement completes through-date coverage');
select is((select sum((value->>'usable_qty')::numeric) from jsonb_array_elements(ops.cafe_location_balances('2026-05-04','00000000-0000-0000-0000-00000000bf02','kitchen')->'rows')),16::numeric,'AC3: place totals plus remainder equal cumulative book');
select results_eq($$select value->>'item_id',sum((value->>'available_qty')::numeric),sum((value->>'usable_qty')::numeric)
 from jsonb_array_elements(ops.cafe_location_balances('2026-05-03','00000000-0000-0000-0000-00000000bf02','kitchen')->'rows')
 group by value->>'item_id' order by value->>'item_id'$$,
 $$select wip_item_id::text,available_qty,available_qty+coalesce(usable_qty,0)
 from ops.kitchen_stock_for_date('2026-05-03','00000000-0000-0000-0000-00000000bf02','kitchen')
 where available_qty <> 0 or coalesce(usable_qty,0) <> 0 order by wip_item_id$$,
 'AC3: every item ties to the location book when a missing snapshot has no stored day adjustment');
select lives_ok($$select ops.move_cafe_stock(pg_temp.input('3','2026-05-06'),'f1410000-0000-0000-0000-000000000026')$$,'later send can consume source stock');
select throws_ok($$select ops.move_cafe_stock(pg_temp.input('2','2026-05-05'),'f1410000-0000-0000-0000-000000000027')$$,'P0001','CAFE_LOCATION_MOVE_INSUFFICIENT_STOCK','AC8: backdated send cannot overdraw later date');
-- Defaults affect new approvals only, never the stored log or imported history.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.save_cafe_stream_location_defaults('00000000-0000-0000-0000-00000000bf02','kitchen',jsonb_build_object('storage_location_id',current_setting('app.kitchen'),'production_location_id',current_setting('app.kitchen')),0,'f1410000-0000-0000-0000-000000000030');
insert into ops.kitchen_logs(id,business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi,notes)
values ('f1410000-0000-0000-0000-000000000031','00000000-0000-0000-0000-00000000bb01','2026-05-07','00000000-0000-0000-0000-00000000bf02','kitchen','produce',null,'00000000-0000-0000-0000-00000000ab01',10,'made'),
('f1410000-0000-0000-0000-000000000032','00000000-0000-0000-0000-00000000bb01','2026-05-07','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab01',3,'sent');
select pg_temp.approve('f1410000-0000-0000-0000-000000000031');
select pg_temp.approve('f1410000-0000-0000-0000-000000000032');
select results_eq($$select kind,from_location_id::text,to_location_id::text,note from ops.location_movements where source_id in ('f1410000-0000-0000-0000-000000000031','f1410000-0000-0000-0000-000000000032') order by source_id$$,
 format('values (''production''::text,null::text,%L::text,''default place''::text),(''transfer'',%L,null,''default place'')',current_setting('app.kitchen'),current_setting('app.kitchen')),'AC1a: defaults land in and deduct from kitchen, not outlet');
select ok((select to_storage_location_id is null from ops.kitchen_logs where id='f1410000-0000-0000-0000-000000000031'),'AC1a: fallback leaves authored log unchanged');
select ok((select bool_and(item_unit_id='00000000-0000-0000-0000-00000000de01' and movement_date='2026-05-07')
 from ops.location_movements where source_id in ('f1410000-0000-0000-0000-000000000031','f1410000-0000-0000-0000-000000000032')),
 'AC1a: older clients use the confirmed default unit and authored log date');
select is((select endpoint from integrations.esb_push where source_ref=(select batch_id from ops.kitchen_logs where id='f1410000-0000-0000-0000-000000000032')),'simple-transfer','AC1a: normal Radiant outbox unchanged');
select throws_ok($$select ops.place_cafe_unassigned_stock(pg_temp.placement('00000000-0000-0000-0000-00000000de01','0'),'f1410000-0000-0000-0000-000000000033')$$,'22023',null,'placement requires positive quantity');
select throws_ok($$select ops.place_cafe_unassigned_stock(pg_temp.placement() || '{"to_location_id":"f1410000-0000-0000-0000-000000000099"}','f1410000-0000-0000-0000-000000000034')$$,'22023','CAFE_LOCATION_MOVE_LOCATION_INVALID','placement rejects an unavailable destination');
reset role;
insert into ops.kitchen_logs(org_id,business_unit_id,log_date,branch_id,activity,action,destination_branch_id,wip_item_id,qty_porsi,status,source)
values('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bb01','2026-05-08','00000000-0000-0000-0000-00000000bf02','kitchen','transfer','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000ab03',8,'Approved','teable_import');
-- On the following day the running book includes the inserted historical debit.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is((ops.place_cafe_unassigned_stock(pg_temp.placement() || '{"as_of":"2026-05-09"}','f1410000-0000-0000-0000-000000000035')->>'rows_written')::int,1,'admin can place a negative book remainder');
select is(pg_temp.balance(current_setting('app.kitchen'),'00000000-0000-0000-0000-00000000de03','2026-05-09'),(-2)::numeric,'negative opening deducts from the chosen place');
select ok(exists(select 1 from ops.location_movements where kind='opening' and item_unit_id='00000000-0000-0000-0000-00000000de03' and quantity=8 and from_location_id=current_setting('app.kitchen')::uuid and to_location_id is null),'negative remainder writes from place to Unassigned');
reset role;
select * from finish();
rollback;
