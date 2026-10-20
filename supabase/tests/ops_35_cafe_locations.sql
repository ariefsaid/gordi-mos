-- Café physical locations: tenant-scoped catalog, honest opening coverage, and same-stream moves.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-LOC-PRODUCT","esb_product_detail_id":"SYNTH-LOC-UNIT","name":"Locations receipt item","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true}
]$source$::jsonb);
select ops.refresh_cafe_stream_items('[{"esb_product_id":"SYNTH-LOC-PRODUCT","branch_code":"gordi_hq"}]');
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.loc_item', (select id::text from ops.wip_items where esb_product_id='SYNTH-LOC-PRODUCT'), true);
select set_config('app.loc_unit', (select id::text from ops.item_units where esb_product_detail_id='SYNTH-LOC-UNIT'), true);
update ops.item_units set confirmed_at=clock_timestamp(), is_default=true where id=current_setting('app.loc_unit')::uuid;
insert into shared.team_memberships (org_id,person_id,team_id,is_primary,effective_from)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d5', t.id, true, current_date-1
  from shared.teams t where t.org_id='00000000-0000-0000-0000-0000000000a1' and t.code='gordi_hq_kitchen'
on conflict do nothing;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01','kitchen',current_setting('app.loc_item')::uuid,
  'Locations receipt item',current_setting('app.loc_unit')::uuid,array[current_setting('app.loc_unit')::uuid],'WIP',true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select set_config('app.loc_main', ops.create_cafe_location(
  jsonb_build_object('name','Locations main storage','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000001')->>'id', true);
select set_config('app.loc_to', ops.create_cafe_location(
  jsonb_build_object('name','Locations destination storage','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000002')->>'id', true);
select set_config('app.loc_parent', ops.create_cafe_location(
  jsonb_build_object('name','Locations parent','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000003')->>'id', true);
select set_config('app.loc_child', ops.create_cafe_location(
  jsonb_build_object('name','Locations child','use','storage','parent_id',current_setting('app.loc_parent')::uuid,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000004')->>'id', true);
select set_config('app.loc_empty', ops.create_cafe_location(
  jsonb_build_object('name','Locations empty','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000005')->>'id', true);
select set_config('app.loc_receipt', ops.create_cafe_location(
  jsonb_build_object('name','Locations receipt storage','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000006')->>'id', true);

select ok((select bool_and(c.relrowsecurity and c.relforcerowsecurity)
             from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='ops' and c.relname in ('locations','location_branches','location_audit','location_movements','stream_location_defaults')
           having count(*)=5), 'all location tables force RLS');
select ok(not has_table_privilege('authenticated','ops.locations','INSERT')
          and not has_table_privilege('authenticated','ops.locations','UPDATE')
          and not has_table_privilege('authenticated','ops.locations','DELETE')
          and not has_table_privilege('authenticated','ops.location_branches','INSERT')
          and not has_table_privilege('authenticated','ops.location_audit','INSERT')
          and not has_table_privilege('authenticated','ops.location_movements','INSERT')
          and not has_table_privilege('authenticated','ops.stream_location_defaults','INSERT'),
          'browser sessions have no direct location configuration or ledger DML');
select is((ops.create_cafe_location(
  jsonb_build_object('name','Locations main storage','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000001')->>'row_version')::int, 1,
  'admin create starts at row version one');
select is((ops.create_cafe_location(
  jsonb_build_object('name','Locations main storage','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000001')->>'id'), current_setting('app.loc_main'),
  'repeating an identical create returns the original location');
select throws_ok($$select ops.create_cafe_location(
  jsonb_build_object('name','Changed request','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000001')$$, '22023', null,
  'a create request key cannot be reused with another payload');
select is((ops.update_cafe_location(current_setting('app.loc_main')::uuid,1,
  jsonb_build_object('name','Locations main storage updated','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000007')->>'row_version')::int, 2,
  'admin update increments the expected version');
select throws_ok($$select ops.update_cafe_location(current_setting('app.loc_main')::uuid,1,
  jsonb_build_object('name','Stale update','use','storage','parent_id',null,'branch_ids',jsonb_build_array('00000000-0000-0000-0000-00000000bf01'::uuid)),
  'f1350000-0000-0000-0000-000000000008')$$, '40001', null,
  'stale catalog versions cannot overwrite a newer location');
select ok(exists(select 1 from ops.list_cafe_locations(jsonb_build_object('ids',jsonb_build_array(current_setting('app.loc_main')::uuid)))
                  where id=current_setting('app.loc_main')::uuid and name='Locations main storage updated'),
  'active members read the current-org location catalog');

reset role;
insert into ops.kitchen_stock (org_id,log_date,wip_item_id,branch_id,activity,usable_qty)
values ('00000000-0000-0000-0000-0000000000a1',current_date-1,current_setting('app.loc_item')::uuid,
        '00000000-0000-0000-0000-00000000bf01','kitchen',7),
       ('00000000-0000-0000-0000-0000000000a1',current_date,current_setting('app.loc_item')::uuid,
        '00000000-0000-0000-0000-00000000bf01','kitchen',5);
insert into ops.location_movements (org_id,branch_id,activity,item_id,item_unit_id,from_location_id,to_location_id,
  quantity,movement_date,kind,source_type)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf01','kitchen',
        current_setting('app.loc_item')::uuid,current_setting('app.loc_unit')::uuid,null,current_setting('app.loc_main')::uuid,
        5,current_date,'opening','opening');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.create_cafe_location(
  jsonb_build_object('name','Member cannot create','use','storage','parent_id',null,'branch_ids','[]'::jsonb),
  'f1350000-0000-0000-0000-000000000009')$$, '42501', null,
  'a non-admin cannot create catalog locations');
select throws_ok($$insert into ops.locations (org_id,name,use) values
  ('00000000-0000-0000-0000-0000000000a1','Browser write','storage')$$, '42501', null,
  'browser direct DML is denied');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.list_cafe_locations('{}'::jsonb)), 0,
  'another organization cannot read this catalog');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select throws_ok($$select ops.archive_cafe_location(current_setting('app.loc_parent')::uuid,1,'f1350000-0000-0000-0000-000000000010')$$,
  'P0001', null, 'a parent with an active child cannot be archived');
select throws_ok($$select ops.archive_cafe_location(current_setting('app.loc_main')::uuid,2,'f1350000-0000-0000-0000-000000000011')$$,
  'P0001', null, 'a location with a nonzero balance cannot be archived');
select is((ops.archive_cafe_location(current_setting('app.loc_empty')::uuid,1,'f1350000-0000-0000-0000-000000000012')->>'row_version')::int, 2,
  'an unused location can be archived at its expected version');
select ok(exists(select 1 from ops.list_cafe_locations(jsonb_build_object('ids',jsonb_build_array(current_setting('app.loc_empty')::uuid)))
                  where id=current_setting('app.loc_empty')::uuid and archived_at is not null),
  'archived locations remain addressable by their stored ID');
select is((select count(*)::int from ops.list_cafe_locations(jsonb_build_object(
  'branch_id','00000000-0000-0000-0000-00000000bf01','use','storage','archived',false))),5,
  'branch, use, and archive filters return only the matching active catalog rows');
select is(ops.cafe_location_balances(current_date-1,'00000000-0000-0000-0000-00000000bf01','kitchen')->>'coverage',
  'unallocated', 'historical stock without a place is explicitly unallocated');
select ok(exists(select 1 from jsonb_array_elements(ops.cafe_location_balances(current_date-1,
  '00000000-0000-0000-0000-00000000bf01','kitchen')->'rows') row
  where row->>'location_id' is null and row->>'item_id'=current_setting('app.loc_item')
    and (row->>'usable_qty')::numeric=7), 'unallocated coverage retains the stream quantity without guessing a place');
select is(ops.cafe_location_balances(current_date,'00000000-0000-0000-0000-00000000bf01','kitchen')->>'coverage',
  'complete', 'an explicit opening movement reconciles today''s stream balance');
select ok((select sum((row->>'usable_qty')::numeric)=5 from jsonb_array_elements(ops.cafe_location_balances(current_date,
  '00000000-0000-0000-0000-00000000bf01','kitchen')->'rows') row),
  'location totals including Unassigned tie to the stream book');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.move',ops.move_cafe_stock(jsonb_build_object(
  'stream',jsonb_build_object('branch_id','00000000-0000-0000-0000-00000000bf01','activity','kitchen'),
  'item_unit_id',current_setting('app.loc_unit'),'quantity','2','from_location_id',current_setting('app.loc_main'),
  'to_location_id',current_setting('app.loc_to'),'movement_date',current_date::text,'note',null),
  'f1350000-0000-0000-0000-000000000013')->>'movement_id',true);
select is((select row_version from ops.location_movements where id=current_setting('app.move')::uuid),1,
  'an authorized same-stream move writes one versioned ledger event');
select is((ops.move_cafe_stock(jsonb_build_object(
  'stream',jsonb_build_object('branch_id','00000000-0000-0000-0000-00000000bf01','activity','kitchen'),
  'item_unit_id',current_setting('app.loc_unit'),'quantity','2','from_location_id',current_setting('app.loc_main'),
  'to_location_id',current_setting('app.loc_to'),'movement_date',current_date::text,'note',null),
  'f1350000-0000-0000-0000-000000000013')->>'movement_id'),current_setting('app.move'),
  'an identical request retry returns the original move');
select throws_ok($$select ops.move_cafe_stock(jsonb_build_object(
  'stream',jsonb_build_object('branch_id','00000000-0000-0000-0000-00000000bf01','activity','kitchen'),
  'item_unit_id',current_setting('app.loc_unit'),'quantity','1','from_location_id',current_setting('app.loc_main'),
  'to_location_id',current_setting('app.loc_to'),'movement_date',current_date::text,'note',null),
  'f1350000-0000-0000-0000-000000000013')$$,'22023',null,
  'a move request key cannot be reused with different quantities');
select throws_ok($$select ops.move_cafe_stock(jsonb_build_object(
  'stream',jsonb_build_object('branch_id','00000000-0000-0000-0000-00000000bf02','activity','kitchen'),
  'item_unit_id',current_setting('app.loc_unit'),'quantity','1','from_location_id',current_setting('app.loc_main'),
  'to_location_id',current_setting('app.loc_to'),'movement_date',current_date::text,'note',null),
  'f1350000-0000-0000-0000-000000000014')$$,'22023',null,
  'locations available to one branch cannot be moved through another stream');
select set_config('app.receipt',ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01','kitchen',null,
  'f1350000-0000-0000-0000-000000000015',jsonb_build_array(jsonb_build_object(
    'item_unit_id',current_setting('app.loc_unit'),'quantity','3','to_storage_location_id',current_setting('app.loc_receipt'))))::text,true);
select ok((select bool_and(wip_item_id=current_setting('app.loc_item')::uuid and item_name='Locations receipt item'
                  and unit_name='kg' and storage_location_id=current_setting('app.loc_receipt')::uuid)
            from ops.cafe_receipt_lines where receipt_id=(current_setting('app.receipt')::jsonb->>'receipt_id')::uuid),
  'receipt submission stamps real item metadata and the selected storage location');
select is((current_setting('app.receipt')::jsonb->'lines'->0->>'storage_location_id'),current_setting('app.loc_receipt'),
  'receipt submit returns the selected storage location on its line');
select is((select storage_location_id::text from ops.cafe_record_locations('receipt',array[
  (select id from ops.cafe_receipt_lines where receipt_id=(current_setting('app.receipt')::jsonb->>'receipt_id')::uuid)])),
  current_setting('app.loc_receipt'), 'the record-location read returns the stored receipt location');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select throws_ok($$select ops.archive_cafe_location(current_setting('app.loc_receipt')::uuid,1,'f1350000-0000-0000-0000-000000000016')$$,
  'P0001', null, 'a location referenced by a pending receipt cannot be archived');

reset role;
select * from finish();
rollback;
