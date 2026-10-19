-- Records reads the submitter stored on Counts and the item/unit ids stored on request lines.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-RECORDS-READ","esb_product_detail_id":"SYNTH-ESB-PD-RECORDS-READ","name":"Records read item","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.records_item_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-RECORDS-READ'), true);
select set_config('app.records_unit_id', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-RECORDS-READ'), true);
select set_config('app.records_today', ((now() at time zone 'Asia/Jakarta')::date)::text, true);
update ops.item_units set confirmed_at = now() where id = current_setting('app.records_unit_id')::uuid;

insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.records_item_id')::uuid,
  'Records read item', current_setting('app.records_unit_id')::uuid,
  array[current_setting('app.records_unit_id')::uuid], 'RAW', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.records_count_id', (ops.submit_cafe_counts(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(jsonb_build_object('client_key', 'f1435000-0000-0000-0000-000000000001',
    'item_id', current_setting('app.records_item_id'), 'quantity', '2'))
) -> 0 ->> 'line_id'), true);
select set_config('app.records_request_id', (ops.submit_cafe_purchase_request(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.records_today')::date,
  null, 'f1435000-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.records_unit_id'), 'quantity', '3'))
) ->> 'request_id'), true);

select is((select submitted_by::text from ops.cafe_count_lines where id = current_setting('app.records_count_id')::uuid),
          '00000000-0000-0000-0000-0000000000d5', 'a member can read the stored Count submitter on their stream');
select is((select wip_item_id::text || ':' || item_unit_id::text
             from ops.cafe_purchase_request_lines where request_id = current_setting('app.records_request_id')::uuid),
          current_setting('app.records_item_id') || ':' || current_setting('app.records_unit_id'),
          'a member can read the item and unit ids on their own request lines');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select submitted_by::text from ops.cafe_count_lines where id = current_setting('app.records_count_id')::uuid),
          '00000000-0000-0000-0000-0000000000d5', 'a stream reviewer can read the Count submitter');
select is((select wip_item_id::text || ':' || item_unit_id::text
             from ops.cafe_purchase_request_lines where request_id = current_setting('app.records_request_id')::uuid),
          current_setting('app.records_item_id') || ':' || current_setting('app.records_unit_id'),
          'a stream reviewer can read request-line item and unit ids');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_count_lines where id = current_setting('app.records_count_id')::uuid), 0,
          'another organisation cannot read the Count row');
select is((select count(*)::int from ops.cafe_purchase_request_lines where request_id = current_setting('app.records_request_id')::uuid), 0,
          'another organisation cannot read request-line ids');

select * from finish();
rollback;
