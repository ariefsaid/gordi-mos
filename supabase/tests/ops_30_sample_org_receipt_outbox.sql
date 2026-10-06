-- A sample org's Café receipts reach the outbox as dry_run, decided by the row's org, including the
-- enqueue that runs with no session: the worker's PO-cache refresh matching a waiting receipt.
-- Reuses the ops_29 fixture; org A is made sample-shaped and flagged, and the deployment targets goo.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1429-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1429-BEAN-KG","name":"Matching coffee bean","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1429-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1429-BEAN-BAG","name":"Matching coffee bean","category":"KITCHEN","unit_name":"bag","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1429-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1429-MILK","name":"Matching milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1429-SUGAR","esb_product_detail_id":"SYNTH-ESB-PD-1429-SUGAR","name":"Matching sugar","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);

select set_config('app.bean_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1429-BEAN'), true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1429-MILK'), true);
select set_config('app.sugar_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1429-SUGAR'), true);
select set_config('app.bean_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1429-BEAN-KG'), true);
select set_config('app.bean_bag', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1429-BEAN-BAG'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1429-MILK'), true);
select set_config('app.sugar_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1429-SUGAR'), true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ESB-P-1429-%';

-- Personas: d5 kitchen shift member at bf01, d4 kitchen stream supervisor at bf01, d7 kitchen
-- shift member at bf02, d2 ops lead, d3 admin, b4 admin of another organisation.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d7'::uuid, 'rumah_rames_kitchen')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings(b.branch_id, 'kitchen', current_setting('app.bean_id')::uuid, 'Matching coffee bean',
  current_setting('app.bean_kg')::uuid, array[current_setting('app.bean_kg')::uuid, current_setting('app.bean_bag')::uuid], 'RAW', true)
  from (values ('00000000-0000-0000-0000-00000000bf01'::uuid), ('00000000-0000-0000-0000-00000000bf02'::uuid)) b(branch_id);
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'Matching milk', current_setting('app.milk_l')::uuid, array[current_setting('app.milk_l')::uuid], 'RAW', true);
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.sugar_id')::uuid,
  'Matching sugar', current_setting('app.sugar_kg')::uuid, array[current_setting('app.sugar_kg')::uuid], 'RAW', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf01', 'main_store');
select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf02', 'main_store');
reset role;

set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1455-A', 'supplier_name', 'Synthetic supplier one',
    'po_date', (current_date - 2)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 9)))));
reset role;

-- Org A becomes the sample org; the deployment points the outbox at the ERP sandbox.
update shared.orgs set name = 'Gordi Sample' where id = '00000000-0000-0000-0000-0000000000a1';
update shared.people set email = 'p-' || id || '@sample.gordi.test' where org_id = '00000000-0000-0000-0000-0000000000a1';
update shared.orgs set is_sample = true where id = '00000000-0000-0000-0000-0000000000a1';
select set_config('app.esb_target_env', 'goo', true);

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true);
select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf02', true);

-- ── In a session: a receipt approved against current PO data ─────────────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r1', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1455000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '4')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r1')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select lives_ok($$select ops.review_cafe_receipt(current_setting('app.r1')::uuid, 'approve', 2, null)$$,
  'a sample-org receipt approval completes');
reset role;
select is((select array_agg(distinct e.target_env || ':' || (e.dedup_key like '%|dry_run')::text)
             from integrations.esb_push e join ops.cafe_receipt_portions p on p.push_id = e.id
            where p.receipt_id = current_setting('app.r1')::uuid),
  array['dry_run:true'], 'its outbox rows target dry_run and their dedupe keys say so');
select is((select array_agg(distinct g.target_env) from integrations.esb_push_groups g
            where g.dedup_key like 'cafe-receipt|' || current_setting('app.r1') || '|%'),
  array['dry_run'], 'its outbox group targets dry_run');

-- ── With no session: the worker's refresh matches a receipt that waited for PO data ──────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}');
select set_config('app.r2', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf02', 'kitchen', null,
  'f1455000-0000-0000-0000-000000000002', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '2')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r2')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.review_cafe_receipt(current_setting('app.r2')::uuid, 'approve', 2, null);
reset role;
select set_config('request.jwt.claims', '{}', true);
set local role service_role;
select lives_ok($$select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1455-B', 'supplier_name', 'Synthetic supplier two',
    'po_date', current_date::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 5)))))$$,
  'the worker''s PO refresh for a sample branch completes with no session');
reset role;
select is((select count(*)::int from integrations.esb_push e join ops.cafe_receipt_portions p on p.push_id = e.id
            where p.receipt_id = current_setting('app.r2')::uuid), 1,
  'the waiting sample-org receipt is matched and enqueued by that refresh');
select is((select array_agg(distinct e.target_env || ':' || (e.dedup_key like '%|dry_run')::text)
             from integrations.esb_push e join ops.cafe_receipt_portions p on p.push_id = e.id
            where p.receipt_id = current_setting('app.r2')::uuid),
  array['dry_run:true'], 'an enqueue with no session still targets dry_run for a sample-org row');

select * from finish();
rollback;
