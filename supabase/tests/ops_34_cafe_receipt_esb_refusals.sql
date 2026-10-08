-- #1534 — Receipt issues can read permanently ESB-refused portions without exposing outbox text
-- to the receiver or another organisation; the page remains read-only for these rows.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1534-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1534-MILK","name":"Refusal test milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1534-MILK'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1534-MILK'), true);
update ops.item_units set confirmed_at = now() where esb_product_id = 'SYNTH-ESB-P-1534-MILK';

insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d7'::uuid, 'rumah_rames_kitchen')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'Refusal test milk', current_setting('app.milk_l')::uuid, array[current_setting('app.milk_l')::uuid], 'RAW', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf01', 'main_store');
select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true);
reset role;

set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1534-A', 'supplier_name', 'Synthetic supplier',
    'po_date', (current_date - 5)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'item_name', 'Milk (ESB)',
      'unit_name', 'l', 'outstanding_quantity', 20)))));
reset role;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.receipt', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1534000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '3')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.receipt')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.review_cafe_receipt(current_setting('app.receipt')::uuid, 'approve', 2, null);
reset role;

select set_config('app.group', (select push_group_id::text from integrations.esb_push
                                where payload ->> 'receipt_id' = current_setting('app.receipt')), true);
select set_config('app.mos_key', (select payload ->> 'mos_key' from integrations.esb_push
                                  where push_group_id = current_setting('app.group')::uuid limit 1), true);
set local role service_role;
select integrations.claim_esb_pushes(array(select id from integrations.esb_push where push_group_id = current_setting('app.group')::uuid));
update integrations.esb_push set status = 'dead_letter', last_error = 'ESB refused goods receipt: synthetic period closed'
 where push_group_id = current_setting('app.group')::uuid;
select is(ops.refuse_cafe_receipt_portions(current_setting('app.group')::uuid, 'esb_refused'), 1,
  'the real approved receipt flow records a held ESB refusal');
reset role;

select ok(has_function_privilege('authenticated', 'ops.cafe_receipt_esb_refused_portions(integer,integer)', 'EXECUTE')
          and not has_function_privilege('anon', 'ops.cafe_receipt_esb_refused_portions(integer,integer)', 'EXECUTE')
          and not has_function_privilege('public', 'ops.cafe_receipt_esb_refused_portions(integer,integer)', 'EXECUTE'),
  'only signed-in sessions may call the read function');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select string_agg(po_number || ':' || mos_key || ':' || esb_message, ',')
             from ops.cafe_receipt_esb_refused_portions(0, 100)),
  'PO-SYNTH-1534-A:' || current_setting('app.mos_key') || ':ESB refused goods receipt: synthetic period closed',
  'a reviewer reads the matching PO, exact MOS key and ESB message');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipt_esb_refused_portions(0, 100)), 0,
  'the receiver cannot read a refused portion or its outbox message');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member","supervisor"]}');
select is((select count(*)::int from ops.cafe_receipt_esb_refused_portions(0, 100)), 0,
  'a reviewer of another stream reads no refused portion');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipt_esb_refused_portions(0, 100)), 1,
  'a procurement-capability holder reads the organisation''s refused portion');
reset role;
update ops.cafe_receipt_portions set hold_reason = 'worker_refused'
 where push_id in (select id from integrations.esb_push where push_group_id = current_setting('app.group')::uuid);
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select count(*)::int from ops.cafe_receipt_esb_refused_portions(0, 100)), 0,
  'a worker refusal is not described as an ESB refusal');
reset role;
update ops.cafe_receipt_portions set hold_reason = 'esb_refused'
 where push_id in (select id from integrations.esb_push where push_group_id = current_setting('app.group')::uuid);
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_receipt_esb_refused_portions(0, 100)), 0,
  'another organisation cannot read the refused message');
reset role;

select * from finish();
rollback;
