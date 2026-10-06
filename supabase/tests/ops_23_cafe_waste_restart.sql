begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

-- One ERP-sourced RAW item/detail on the same stream as the regular seeded WIP items. Waste keeps
-- this default ERP detail while the captured factor converts typed batch quantities canonically.
insert into ops.wip_items
  (id, org_id, name, category, flag_active, kind, reference_source, erp_category_type_name, has_active_bom_output, esb_product_id)
values
  ('00000000-0000-0000-0000-00000000c920','00000000-0000-0000-0000-0000000000a1',
   'Synthetic waste RAW','Kitchen',true,null,'erp_catalog','Inventory',false,'SYNTH-WASTE-PRODUCT');
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_id, esb_product_detail_id, is_default, source_active, erp_is_stock, confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c921','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c920','batch','SYNTH-WASTE-PRODUCT','SYNTH-WASTE-DETAIL',false,true,true,now());
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf02','kitchen',
        '00000000-0000-0000-0000-00000000c920','esb')
on conflict (org_id, branch_id, activity, wip_item_id) do nothing;


select ok(not has_function_privilege('anon', 'ops.restart_cafe_waste_draft(uuid,date)', 'EXECUTE'),
  'anonymous sessions cannot restart a waste draft');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok($$select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf02','kitchen','00000000-0000-0000-0000-00000000c920',
  'Synthetic waste RAW','00000000-0000-0000-0000-00000000c921',
  array['00000000-0000-0000-0000-00000000c921'::uuid],'RAW',true,array[0.5::numeric]
)$$, 'the stream team classifies and activates the ERP RAW waste item');
reset role;
update ops.item_units set confirmed_at=null where id='00000000-0000-0000-0000-00000000c921';
set local role authenticated;
select throws_ok($$insert into ops.kitchen_logs
  (business_unit_id,log_date,branch_id,activity,action,wip_item_id,item_unit_id,qty_porsi)
  values ('00000000-0000-0000-0000-00000000bb01','2026-10-01','00000000-0000-0000-0000-00000000bf02',
    'kitchen','produce','00000000-0000-0000-0000-00000000c920','00000000-0000-0000-0000-00000000c921',1)$$,
  'P0015','CAFE_ITEM_UNIT_NOT_SHOWN: the selected ERP detail is not confirmed and available',
  'an ERP detail without confirmation cannot be bound to a captured log');
reset role;
update ops.item_units set confirmed_at=now() where id='00000000-0000-0000-0000-00000000c921';
set local role authenticated;

insert into ops.kitchen_logs
  (id,business_unit_id,log_date,branch_id,activity,action,wip_item_id,item_unit_id,qty_porsi,notes,status,created_at,
   entry_quantity,entry_unit_factor)
select ('00000000-0000-0000-0000-00000000ac' || suffix)::uuid,
  '00000000-0000-0000-0000-00000000bb01','2026-10-01','00000000-0000-0000-0000-00000000bf02',
  'kitchen','waste','00000000-0000-0000-0000-00000000c920','00000000-0000-0000-0000-00000000c921',
  case when suffix = '31' then 1.50 else 2.50 end,
  'Captured note','Draft',now() - case when suffix = '33' then interval '1 minute' else interval '16 minutes' end,
  case when suffix = '31' then 3::numeric else null end,
  case when suffix = '31' then 0.5::numeric else null end
from unnest(array['31','32','33','34']) suffix;
select ok((select created_at > '2000-01-01'::timestamptz from ops.kitchen_logs
  where id='00000000-0000-0000-0000-00000000ac31'),
  'the database stamps the waste-photo window rather than accepting a client timestamp');
select throws_ok($$update ops.kitchen_logs set created_at='2000-01-01' where id='00000000-0000-0000-0000-00000000ac31'$$,
  '42501',null,'an authenticated submitter cannot rewrite the waste-photo window');
reset role;
update ops.kitchen_logs set created_at=now()-interval '16 minutes'
  where id in ('00000000-0000-0000-0000-00000000ac31','00000000-0000-0000-0000-00000000ac32','00000000-0000-0000-0000-00000000ac34');
update ops.kitchen_logs set created_at=now()-interval '1 minute' where id='00000000-0000-0000-0000-00000000ac33';
update ops.item_units set unit_name='crate' where id='00000000-0000-0000-0000-00000000c921';
-- Existing evidence on an expired draft must remain resumable, never be superseded.
insert into storage.objects (bucket_id,name) values ('waste-photos',
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac34/00000000-0000-0000-0000-00000000f101.jpg');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select throws_ok($$select * from ops.restart_cafe_waste_draft('00000000-0000-0000-0000-00000000ac31','2026-10-02')$$,
  '42501',null,'a peer cannot replace another submitter''s draft');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select throws_ok($$select * from ops.restart_cafe_waste_draft('00000000-0000-0000-0000-00000000ac31','2026-10-02')$$,
  '42501',null,'another organization cannot replace the draft');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select * from ops.restart_cafe_waste_draft('00000000-0000-0000-0000-00000000ac33','2026-10-02')$$,
  '23514',null,'a draft with an open photo window cannot be restarted');
select throws_ok($$select * from ops.restart_cafe_waste_draft('00000000-0000-0000-0000-00000000ac34','2026-10-02')$$,
  '23514',null,'an expired draft with evidence cannot be restarted');
select throws_ok($$select * from ops.restart_cafe_waste_draft('00000000-0000-0000-0000-00000000ac32',null)$$,
  '22023',null,'a replacement needs a log date');
select lives_ok($$select * from ops.restart_cafe_waste_draft('00000000-0000-0000-0000-00000000ac31','2026-10-02')$$,
  'the original submitter explicitly restarts an expired photo-less draft');
select is((select row(item_unit_id,qty_porsi,log_date,notes,status)::text from ops.kitchen_logs
  where id='00000000-0000-0000-0000-00000000ac31'),
  row('00000000-0000-0000-0000-00000000c921'::uuid,1.50::numeric(12,2),'2026-10-01'::date,'Captured note'::text,'Draft'::text)::text,
  'the original captured facts and date remain unchanged');
select is((select row(item_unit_id,qty_porsi,log_date,notes,status,submitted_by,org_id)::text from ops.kitchen_logs
  where id=(select superseded_by from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac31')),
  row('00000000-0000-0000-0000-00000000c921'::uuid,1.50::numeric(12,2),'2026-10-02'::date,'Captured note'::text,'Draft'::text,
    '00000000-0000-0000-0000-0000000000d2'::uuid,'00000000-0000-0000-0000-0000000000a1'::uuid)::text,
  'the replacement retains the exact unit, quantity, note, submitter and organization with a new date');
select is((select row(entry_quantity,entry_unit_factor,entry_unit_name,qty_porsi)::text
  from ops.kitchen_logs where id=(select superseded_by from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac31')),
  row(3::numeric(12,3),0.5::numeric,'batch'::text,1.50::numeric(12,2))::text,
  'restarting a 0.5 batch draft preserves the entry snapshot and canonical quantity');
select is((select count(*)::int from ops.kitchen_logs where action='waste' and status='Draft' and superseded_by is null),4,
  'the resumable query excludes the retired original and includes its replacement');
select is((select id from ops.restart_cafe_waste_draft('00000000-0000-0000-0000-00000000ac31','2026-10-03')),
  (select superseded_by from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac31'),
  'retry returns the same replacement even if the requested date changes');
select is((select count(*)::int from ops.kitchen_logs where action='waste' and status='Draft'),5,
  'retry creates no additional draft');
select ok(ops.can_add_cafe_waste_photo('00000000-0000-0000-0000-0000000000a1/' ||
  (select superseded_by::text from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac31') ||
  '/00000000-0000-0000-0000-00000000f102.jpg'), 'the replacement has a fresh photo window');
select throws_ok($$update ops.kitchen_logs set superseded_by=null where id='00000000-0000-0000-0000-00000000ac31'$$,
  '42501',null,'the retirement marker cannot be cleared by a caller');
select throws_ok($$insert into ops.kitchen_logs
  (business_unit_id,log_date,branch_id,activity,action,wip_item_id,item_unit_id,qty_porsi,status,superseded_by)
  values ('00000000-0000-0000-0000-00000000bb01','2026-10-02','00000000-0000-0000-0000-00000000bf02',
    'kitchen','waste','00000000-0000-0000-0000-00000000c920','00000000-0000-0000-0000-00000000c921',1,'Draft',
    '00000000-0000-0000-0000-00000000ac31')$$,
  '42501',null,'a caller cannot insert a forged retirement marker');
reset role;
update ops.item_units set source_active=false where id='00000000-0000-0000-0000-00000000c921';
set local role authenticated;
select throws_ok($$select * from ops.restart_cafe_waste_draft('00000000-0000-0000-0000-00000000ac32','2026-10-02')$$,
  'P0014',null,'a replacement still passes the current unit eligibility guard (an inactive default unit is not available)');
select is((select superseded_by from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac32'),null::uuid,
  'failed replacement leaves the original resumable');
select is((select count(*)::int from ops.kitchen_logs where action='waste' and status='Draft'),5,
  'failed replacement leaves no extra draft');
reset role;
-- Simulate the timestamp snapshot of an upload transaction that began before expiry.
update ops.kitchen_logs set created_at=now() where id='00000000-0000-0000-0000-00000000ac31';
set local role authenticated;
select ok(not ops.can_add_cafe_waste_photo(
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac31/00000000-0000-0000-0000-00000000f103.jpg'),
  'retirement closes photo capture even with a pre-expiry timestamp snapshot');
reset role;
insert into storage.objects (bucket_id,name) values ('waste-photos',
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac31/00000000-0000-0000-0000-00000000f104.jpg');
set local role authenticated;
select throws_ok($$select ops.submit_cafe_waste_log('00000000-0000-0000-0000-00000000ac31')$$,
  '42501',null,'a retired draft never enters review even if evidence arrives later');
select * from finish();
rollback;
