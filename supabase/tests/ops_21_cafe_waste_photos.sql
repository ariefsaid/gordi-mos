-- #1241 Phase 1: waste uses the existing café log, ERP product-detail units, and private Signal-style evidence.
-- This test exercises storage.objects RLS directly; it never deletes a storage object with SQL.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.allow_test_seeds', 'off', true);

-- One ERP-sourced RAW item/detail on the same stream as the regular seeded WIP items. Waste keeps
-- this exact item_unit_id and qty; this fixture defines no MOS conversion.
insert into ops.wip_items
  (id, org_id, name, category, flag_active, kind, reference_source, erp_category_type_name, has_active_bom_output, esb_product_id)
values
  ('00000000-0000-0000-0000-00000000c920','00000000-0000-0000-0000-0000000000a1',
   'Synthetic waste RAW','Kitchen',true,null,'erp_catalog','Inventory',false,'SYNTH-WASTE-PRODUCT');
insert into ops.item_units
  (id, org_id, wip_item_id, unit_name, esb_product_id, esb_product_detail_id, is_default, source_active, erp_is_stock, confirmed_at)
values
  ('00000000-0000-0000-0000-00000000c921','00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-00000000c920','ERP carton','SYNTH-WASTE-PRODUCT','SYNTH-WASTE-DETAIL',false,true,true,now());
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf02','kitchen',
        '00000000-0000-0000-0000-00000000c920','esb')
on conflict (org_id, branch_id, activity, wip_item_id) do nothing;

select is((select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id='waste-photos'),
  row(false,5242880,array['image/jpeg','image/png','image/webp'])::text,
  'waste evidence is private, capped at 5 MB, and accepts JPEG/PNG/WebP');
select is((select count(*)::int from pg_policies where schemaname='storage' and tablename='objects'
  and policyname like 'waste_photos_%' and upper(cmd) in ('UPDATE','DELETE','ALL')),0,
  'waste evidence has no SQL update or delete policy');
select is(ops.cafe_waste_photo_log_id(
  '00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac21/00000000-0000-0000-0000-00000000f101.jpg'),
  '00000000-0000-0000-0000-00000000ac21'::uuid,
  'the canonical org/log/random-id path binds evidence to one waste row');
select is(ops.cafe_waste_photo_log_id(
  '00000000-0000-0000-0000-0000000000a1/../00000000-0000-0000-0000-00000000ac21/f101.jpg'),
  null::uuid,
  'traversal and malformed storage paths do not resolve to a log');
select is(ops.kitchen_action_label('waste',null),'Waste','the existing action derivation labels the new waste movement');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok($$select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf02','kitchen','00000000-0000-0000-0000-00000000c920',
  'Synthetic waste RAW','00000000-0000-0000-0000-00000000c921',
  array['00000000-0000-0000-0000-00000000c921'::uuid],'RAW',true
)$$, 'the stream team classifies and activates the ERP RAW waste item');

select lives_ok($$
  insert into ops.kitchen_logs (id,business_unit_id,log_date,branch_id,activity,action,destination_branch_id,
    wip_item_id,item_unit_id,qty_porsi,status)
  values ('00000000-0000-0000-0000-00000000ac21','00000000-0000-0000-0000-00000000bb01','2026-10-02',
    '00000000-0000-0000-0000-00000000bf02','kitchen','waste',null,
    '00000000-0000-0000-0000-00000000c920','00000000-0000-0000-0000-00000000c921',2.50,'Draft')
  $$,'a listed RAW item with an ERP product-detail unit can be logged as waste Draft');
select lives_ok($$
  insert into ops.kitchen_logs (id,business_unit_id,log_date,branch_id,activity,action,destination_branch_id,
    wip_item_id,item_unit_id,qty_porsi,status)
  values ('00000000-0000-0000-0000-00000000ac22','00000000-0000-0000-0000-00000000bb01','2026-10-02',
    '00000000-0000-0000-0000-00000000bf02','kitchen','waste',null,
    '00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000de01',1.25,'Draft')
  $$,'a listed WIP item can use the same waste-log movement');
insert into ops.kitchen_logs (id,business_unit_id,log_date,branch_id,activity,action,destination_branch_id,
  wip_item_id,item_unit_id,qty_porsi,status,created_at)
values ('00000000-0000-0000-0000-00000000ac24','00000000-0000-0000-0000-00000000bb01','2026-10-02',
  '00000000-0000-0000-0000-00000000bf02','kitchen','waste',null,
  '00000000-0000-0000-0000-00000000c920','00000000-0000-0000-0000-00000000c921',1,'Draft',now()-interval '16 minutes');
select is((select row(item_unit_id,qty_porsi)::text from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac21'),
  row('00000000-0000-0000-0000-00000000c921'::uuid,2.50::numeric(12,2))::text,
  'the RAW record retains its exact ERP detail unit and quantity without conversion');
insert into ops.kitchen_logs (id,business_unit_id,log_date,branch_id,activity,action,destination_branch_id,
  wip_item_id,qty_porsi,status)
values ('00000000-0000-0000-0000-00000000ac23','00000000-0000-0000-0000-00000000bb01','2026-10-02',
  '00000000-0000-0000-0000-00000000bf02','kitchen','waste',null,
  '00000000-0000-0000-0000-00000000c920',1,'Draft');
select is((select item_unit_id from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac23'),
  '00000000-0000-0000-0000-00000000c921'::uuid,
  'a waste row without an explicit unit binds to the team-set shown default ERP detail');
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,
    wip_item_id,item_unit_id,qty_porsi,status)
  values ('00000000-0000-0000-0000-00000000bb01','2026-10-02','00000000-0000-0000-0000-00000000bf02',
    'kitchen','waste',null,'00000000-0000-0000-0000-00000000c920','00000000-0000-0000-0000-00000000c921',1,'Submitted')
  $$,'42501',null,'a waste log cannot be inserted directly into the review queue before photos are attached');
select throws_ok($$
  insert into ops.kitchen_logs (business_unit_id,log_date,branch_id,activity,action,destination_branch_id,
    wip_item_id,item_unit_id,qty_porsi,status)
  values ('00000000-0000-0000-0000-00000000bb01','2026-10-02','00000000-0000-0000-0000-00000000bf02',
    'kitchen','waste','00000000-0000-0000-0000-00000000bf03','00000000-0000-0000-0000-00000000c920',
    '00000000-0000-0000-0000-00000000c921',1,'Draft')
  $$,'23514',null,'waste has no destination branch');
select throws_ok($$select ops.submit_cafe_waste_log('00000000-0000-0000-0000-00000000ac21')$$,
  '23514','a waste log needs at least one uploaded photo before submission',
  'the submit RPC refuses a photo-less Draft');

select lives_ok($$
  insert into storage.objects (bucket_id,name) values
    ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac21/00000000-0000-0000-0000-00000000f101.jpg'),
    ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac21/00000000-0000-0000-0000-00000000f102.png'),
    ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac21/00000000-0000-0000-0000-00000000f103.webp'),
    ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac21/00000000-0000-0000-0000-00000000f104.jpg')
  $$,'the uploader may attach up to four canonical JPEG/PNG/WebP objects to their own draft');
select throws_ok($$insert into storage.objects (bucket_id,name) values
  ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac21/00000000-0000-0000-0000-00000000f105.jpg')$$,
  '42501',null,'a fifth photo is refused');
select throws_ok($$insert into storage.objects (bucket_id,name) values
  ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac21/notes.pdf')$$,
  '42501',null,'the object path must end with a supported image extension');
select throws_ok($$insert into storage.objects (bucket_id,name) values
  ('waste-photos','00000000-0000-0000-0000-0000000000b1/00000000-0000-0000-0000-00000000ac21/00000000-0000-0000-0000-00000000f105.jpg')$$,
  '42501',null,'a path under a different organization is refused');
select throws_ok($$insert into storage.objects (bucket_id,name) values
  ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac24/00000000-0000-0000-0000-00000000f241.jpg')$$,
  '42501',null,'the submitter cannot add photos outside the 15-minute Draft window');
select is((select count(*)::int from ops.kitchen_log_waste_photos where log_id='00000000-0000-0000-0000-00000000ac21'),4,
  'the uploader reads four per-item photo records through the invoker view');
select throws_ok($$update ops.kitchen_logs set status='Submitted' where id='00000000-0000-0000-0000-00000000ac21'$$,
  '42501',null,'even a lead cannot bypass the dedicated waste-submit RPC');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member"]}');
select is((select count(*)::int from ops.kitchen_log_waste_photos where log_id='00000000-0000-0000-0000-00000000ac21'),0,
  'another same-org person cannot read evidence while its parent is still Draft');
select throws_ok($$insert into storage.objects (bucket_id,name) values
  ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac22/00000000-0000-0000-0000-00000000f201.jpg')$$,
  '42501',null,'a peer cannot add evidence to another submitter''s Draft');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}');
select is((select count(*)::int from storage.objects where bucket_id='waste-photos'),0,
  'another organization reads no waste evidence');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok($$select ops.submit_cafe_waste_log('00000000-0000-0000-0000-00000000ac21')$$,
  'the uploader submits the Draft only after the evidence exists');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.kitchen_log_waste_photos where log_id='00000000-0000-0000-0000-00000000ac21'),4,
  'an authorized same-org reviewer can read the submitted waste evidence');
select throws_ok($$insert into storage.objects (bucket_id,name) values
  ('waste-photos','00000000-0000-0000-0000-0000000000a1/00000000-0000-0000-0000-00000000ac21/00000000-0000-0000-0000-00000000f106.jpg')$$,
  '42501',null,'no further photo is added after the Draft is submitted');

reset role;
create temporary table waste_outbox_before as
  select count(*)::int as count from integrations.esb_push where org_id='00000000-0000-0000-0000-0000000000a1';
create temporary table waste_groups_before as
  select count(*)::int as count from integrations.esb_push_groups where org_id='00000000-0000-0000-0000-0000000000a1';

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select throws_ok($$select * from ops.approve_kitchen_logs(array['00000000-0000-0000-0000-00000000ac21'::uuid], 'reviewed')$$,
  '22023','waste logs must be approved individually; ERP posting is held',
  'bulk approval refuses waste before creating a grouped ERP document');
reset role;
select is((select count(*)::int from integrations.esb_push_groups where org_id='00000000-0000-0000-0000-0000000000a1'),
  (select count from waste_groups_before),'refused bulk waste approval creates no group');
select is((select count(*)::int from integrations.esb_push where org_id='00000000-0000-0000-0000-0000000000a1'),
  (select count from waste_outbox_before),'refused bulk waste approval creates no ERP push');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is(ops.approve_kitchen_log('00000000-0000-0000-0000-00000000ac21','waste verified by reviewer'),
  null::text,'single-row approval reviews waste and explicitly returns no ERP batch id');
reset role;
select is((select status='Approved' and batch_id is null and not posted_to_esb from ops.kitchen_logs
  where id='00000000-0000-0000-0000-00000000ac21'),true,
  'approved waste has reviewer status but no batch and is not marked posted');
select is((select count(*)::int from integrations.esb_push where org_id='00000000-0000-0000-0000-0000000000a1'),
  (select count from waste_outbox_before),'single-row waste approval never enqueues an ERP push');
select is((select count(*)::int from integrations.esb_push_groups where org_id='00000000-0000-0000-0000-0000000000a1'),
  (select count from waste_groups_before),'single-row waste approval creates no ERP group');
select is((select row(item_unit_id,qty_porsi)::text from ops.kitchen_logs where id='00000000-0000-0000-0000-00000000ac21'),
  row('00000000-0000-0000-0000-00000000c921'::uuid,2.50::numeric(12,2))::text,
  'review does not alter the ERP product-detail binding or recorded quantity');
select is((select usable_qty from ops.kitchen_stock where org_id='00000000-0000-0000-0000-0000000000a1'
  and log_date='2026-10-02' and wip_item_id='00000000-0000-0000-0000-00000000c920'
  and branch_id='00000000-0000-0000-0000-00000000bf02' and activity='kitchen'),
  -2.50::numeric(12,2),'approved waste reduces the same recorded stock quantity without conversion');
select is((select count(*)::int from ops.kitchen_log_waste_photos where log_id='00000000-0000-0000-0000-00000000ac21'),4,
  'review evidence remains attached after approval');

select * from finish();
rollback;
