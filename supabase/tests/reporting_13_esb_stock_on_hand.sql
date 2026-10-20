-- Café ESB stock comparison: writer isolation, Count-review scope, exact EOD math and pinned pages.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Test-only role membership mirrors reporting_07_writer_org_scope.sql; the production role never receives it.
grant reporting_writer to postgres with set true;
grant usage on schema extensions to reporting_writer;

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
-- The shared fixture predates unit-level stock coordinates; changing a confirmed pair clears its confirmation, so re-confirm these test rows.
update ops.item_units unit
   set esb_product_id = item.esb_product_id, erp_is_stock = true
  from ops.wip_items item
 where item.org_id = unit.org_id and item.id = unit.wip_item_id
   and unit.id in ('00000000-0000-0000-0000-00000000de01','00000000-0000-0000-0000-00000000de02');
update ops.item_units
   set confirmed_at = statement_timestamp()
 where id in ('00000000-0000-0000-0000-00000000de01','00000000-0000-0000-0000-00000000de02');
select set_config('app.stock_day', ((statement_timestamp() at time zone 'Asia/Jakarta')::date - 1)::text, true);

-- RRS is a single-stream fixture here; GHQ keeps both activities to prove the shared-pool block.
update shared.teams set archived_at = statement_timestamp()
 where org_id = '00000000-0000-0000-0000-0000000000a1'
   and branch_id = '00000000-0000-0000-0000-00000000bf02' and activity = 'bar';
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4', team.id, true, current_date - 30
  from shared.teams team
 where team.org_id = '00000000-0000-0000-0000-0000000000a1'
   and team.branch_id = '00000000-0000-0000-0000-00000000bf02'
   and team.activity = 'kitchen' and team.archived_at is null;

insert into reporting.esb_stock_snapshots (
  id, org_id, source_system, esb_code, company_code, source_snapshot_key, revision,
  snapshot_date, as_of, business_date, source_timezone, basis, scope, source_complete,
  ingestion_complete, state, started_at, ingested_at, published_at, watermark, source_fingerprint
) values (
  '00000000-0000-0000-0000-00000000ed01',
  '00000000-0000-0000-0000-0000000000a1', 'esb', 'GKID', 'GKID', current_setting('app.stock_day'), 1,
  current_setting('app.stock_day')::date,
  ((current_setting('app.stock_day')::date + 1)::timestamp at time zone 'Asia/Jakarta') - interval '1 microsecond',
  current_setting('app.stock_day')::date, 'Asia/Jakarta', 'end_of_day',
  '{"branch_codes":["rumah_rames","gordi_hq"]}', true, true, 'published', now(), now(), now(),
  current_setting('app.stock_day'), repeat('a', 64)
);
insert into reporting.esb_stock_coverage (
  id, org_id, snapshot_id, branch_code, partition_key, status, expected_rows, received_rows,
  exhausted, missing_rows_mean_zero, source_evidence
) values
  ('00000000-0000-0000-0000-00000000ed02','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ed01','rumah_rames','branch','complete',2,2,true,false,'{"method":"fixture"}'),
  ('00000000-0000-0000-0000-00000000ed05','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ed01','gordi_hq','branch','complete',1,1,true,false,'{"method":"fixture"}');
insert into reporting.esb_stock_on_hand (
  id, org_id, snapshot_id, branch_code, product_code, product_detail_code, unit_code,
  quantity, location, row_complete, source_row_key, raw_payload_hash
) values
  ('00000000-0000-0000-0000-00000000ed03','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ed01','rumah_rames',null,'PD-PORSI-001','PORSI',3.5000,'Main',true,'RRS|Main|PD-PORSI-001',repeat('b',64)),
  ('00000000-0000-0000-0000-00000000ed04','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ed01','rumah_rames',null,'PD-PORSI-002','PORSI',0,'Main',true,'RRS|Main|PD-PORSI-002',repeat('c',64)),
  ('00000000-0000-0000-0000-00000000ed06','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000ed01','gordi_hq',null,'PD-PORSI-001','PORSI',3.5000,'Main',true,'GHQ|Main|PD-PORSI-001',repeat('d',64));

-- reporting_writer can insert and read only the org declared by the nightly run.
select set_config('app.reporting_org', '00000000-0000-0000-0000-0000000000a1', true);
set local role reporting_writer;
select lives_ok($$
  insert into reporting.esb_stock_snapshots (
    org_id, source_system, esb_code, company_code, source_snapshot_key, revision,
    snapshot_date, as_of, business_date, source_timezone, basis, scope, source_complete,
    ingestion_complete, state, started_at, source_fingerprint
  ) values (
    '00000000-0000-0000-0000-0000000000a1','esb','writer-test','writer-test','writer-test',1,
    current_date - 3, now() - interval '3 days', current_date - 3, 'Asia/Jakarta','end_of_day','{}',
    false,false,'staging',now(),repeat('e',64)
  )
$$, 'reporting_writer can insert a scoped staging header');
select is((select count(*)::integer from reporting.esb_stock_snapshots where esb_code = 'writer-test'), 1,
  'reporting_writer can select its declared org rows');
select throws_ok($$
  insert into reporting.esb_stock_snapshots (
    org_id, source_system, esb_code, company_code, source_snapshot_key, revision,
    snapshot_date, as_of, business_date, source_timezone, basis, scope, source_complete,
    ingestion_complete, state, started_at, source_fingerprint
  ) values (
    '00000000-0000-0000-0000-0000000000b1','esb','other-org','other-org','other-org',1,
    current_date - 3, now() - interval '3 days', current_date - 3, 'Asia/Jakarta','end_of_day','{}',
    false,false,'staging',now(),repeat('f',64)
  )
$$, '42501', null, 'reporting_writer cannot insert outside the declared org');
reset role;

-- Insert physical Counts through the existing Count RPC; comparison reads their latest values.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((ops.submit_cafe_counts(
    '00000000-0000-0000-0000-00000000bf02', 'kitchen',
    '[{"client_key":"00000000-0000-0000-0000-00000000e101","item_id":"00000000-0000-0000-0000-00000000ab01","quantity":"2.5"},{"client_key":"00000000-0000-0000-0000-00000000e102","item_id":"00000000-0000-0000-0000-00000000ab02","quantity":"5"}]'::jsonb)#>>'{0,outcome}'), 'submitted',
  'physical Counts still enter through the unchanged Count RPC');

-- Browser sessions cannot select any raw source table.
select throws_ok($$select * from reporting.esb_stock_snapshots limit 1$$, '42501', null,
  'authenticated has no direct snapshot read');
select throws_ok($$select * from reporting.esb_stock_coverage limit 1$$, '42501', null,
  'authenticated has no direct coverage read');
select throws_ok($$select * from reporting.esb_stock_on_hand limit 1$$, '42501', null,
  'authenticated has no direct on-hand read');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member"]}');
select throws_ok($$select ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'gap','desc',null,50)$$,
  '42501', 'STOCK_COMPARISON_FORBIDDEN', 'ordinary member cannot read expected stock');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all','Mains','gap','desc',null,50)#>>'{counts,shown_scope}'), '2',
  'p_category filters the whole authorized scope');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'Nasi Goreng','all',null,'gap','desc',null,50)#>>'{rows,0,expected,quantity}'), '3.5000',
  'ops_lead reads the exact source on-hand row');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'Nasi Goreng','all',null,'gap','desc',null,50)#>>'{rows,0,count,quantity}'), '2.5000',
  'latest Submitted Count is returned as a decimal string');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'Nasi Goreng','all',null,'gap','desc',null,50)#>>'{rows,0,difference}'), '-1.0000',
  'difference is Count minus ESB without rounding');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'Nasi Goreng','all',null,'gap','desc',null,50)#>>'{rows,0,difference_pct}'), '-28.571428571',
  'percentage uses the absolute expected denominator and nine decimal places');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'Ayam Bakar','all',null,'gap','desc',null,50)#>>'{rows,0,difference}'), '5.0000',
  'zero expected preserves the nonzero physical difference');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'quantity','desc',null,1)#>>'{rows,0,item_name}'), 'Ayam Bakar',
  'quantity sort ranks the largest absolute difference before unit-id tie breakers');
select set_config('app.stock_quantity_cursor', ops.list_stock_comparison(
  '00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'quantity','desc',null,1
) ->> 'next', true);
select is((ops.list_stock_comparison(
  '00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'quantity','desc',current_setting('app.stock_quantity_cursor'),1
)#>>'{rows,0,item_name}'), 'Nasi Goreng', 'quantity cursor continues in absolute-difference order');
select set_config('app.stock_date_first', (ops.list_stock_comparison(
  '00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'count-date','desc',null,1
)#>>'{rows,0,item_name}'), true);
select set_config('app.stock_date_cursor', (ops.list_stock_comparison(
  '00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'count-date','desc',null,1
) ->> 'next'), true);
select ok((ops.list_stock_comparison(
  '00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'count-date','desc',current_setting('app.stock_date_cursor'),1
)#>>'{rows,0,item_name}') <> current_setting('app.stock_date_first'),
  'count-date cursor advances without repeating the first item');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'Ayam Bakar','all',null,'gap','desc',null,50)#>>'{rows,0,difference_pct}'), null,
  'zero expected has no infinite percentage');
select ok((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'Ayam Bakar','all',null,'gap','desc',null,50)#>'{rows,0,flags}') @> '["zero_expected"]'::jsonb,
  'zero expected is explicitly flagged');
select is((ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf01','bar',false,'Nasi Goreng','all',null,'gap','desc',null,50)#>>'{rows,0,missing}'), 'ambiguous_pool',
  'a shared kitchen/bar source pool blocks comparison while retaining its expected quantity');
select is((ops.get_stock_comparison_item('00000000-0000-0000-0000-00000000bf02','kitchen','00000000-0000-0000-0000-00000000ab01','00000000-0000-0000-0000-00000000de01','00000000-0000-0000-0000-00000000ed01')#>>'{row,difference}'), '-1.0000',
  'detail returns the same authorized row and generation');

-- Location approval, book opening and a physical send never change the Count/ERP comparison.
select set_config('app.comparison_before',ops.list_stock_comparison(
  '00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'item','asc',null,50)::text,true);
reset role;
insert into ops.locations(id,org_id,name,use) values
 ('f1130000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Comparison kitchen','both'),
 ('f1130000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','Comparison outlet','storage');
insert into ops.location_branches(org_id,location_id,branch_id)
select org_id,id,'00000000-0000-0000-0000-00000000bf02' from ops.locations where id in
 ('f1130000-0000-0000-0000-000000000001','f1130000-0000-0000-0000-000000000002');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
insert into ops.kitchen_logs(id,business_unit_id,log_date,branch_id,activity,action,wip_item_id,qty_porsi,to_storage_location_id,notes)
values('f1130000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000bb01',current_date,
 '00000000-0000-0000-0000-00000000bf02','kitchen','produce','00000000-0000-0000-0000-00000000ab01',10,
 'f1130000-0000-0000-0000-000000000001','made');
select ops.approve_kitchen_log('f1130000-0000-0000-0000-000000000003','verified',
 (select updated_at from ops.kitchen_logs where id='f1130000-0000-0000-0000-000000000003'));
select ops.place_cafe_unassigned_stock('{"stream":{"branch_id":"00000000-0000-0000-0000-00000000bf02","activity":"kitchen"},"to_location_id":"f1130000-0000-0000-0000-000000000001"}'::jsonb || jsonb_build_object('as_of',current_date),
 'f1130000-0000-0000-0000-000000000004');
select ops.move_cafe_stock('{"stream":{"branch_id":"00000000-0000-0000-0000-00000000bf02","activity":"kitchen"},"item_unit_id":"00000000-0000-0000-0000-00000000de01","quantity":"4","from_location_id":"f1130000-0000-0000-0000-000000000001","to_location_id":"f1130000-0000-0000-0000-000000000002"}'::jsonb || jsonb_build_object('movement_date',current_date),
 'f1130000-0000-0000-0000-000000000005');
select is(ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'item','asc',null,50)::text,
 current_setting('app.comparison_before'),'AC9: approval, placement and send leave ERP comparison byte-identical');

-- The stream reviewer can read only the stream of their live primary Team.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select lives_ok($$select ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'gap','desc',null,50)$$,
  'stream reviewer can read their own stream');
select throws_ok($$select ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf01','bar',false,'','all',null,'gap','desc',null,50)$$,
  '42501', 'STOCK_COMPARISON_FORBIDDEN', 'stream reviewer cannot read another stream');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'gap','desc',null,50)$$,
  '42501', 'STOCK_COMPARISON_FORBIDDEN', 'another org cannot use a guessed stream identifier');

-- The cursor is generation-bound; replacing the published header invalidates the next request.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select set_config('app.stock_cursor', ops.list_stock_comparison(
  '00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'item','asc',null,1
) ->> 'next', true);
reset role;
update reporting.esb_stock_snapshots
   set id = '00000000-0000-0000-0000-00000000ed10'
 where id = '00000000-0000-0000-0000-00000000ed01';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.list_stock_comparison('00000000-0000-0000-0000-00000000bf02','kitchen',false,'','all',null,'item','asc',current_setting('app.stock_cursor'),1)$$,
  '40001', 'generation changed, reload', 'a cursor pinned to an older generation is rejected');
reset role;

select * from finish();
rollback;
