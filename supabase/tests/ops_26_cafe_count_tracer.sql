-- #1366 — blind Cafe Count, reviewer gate, version, freeze, posting switch and org seam.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1366-RAW","esb_product_detail_id":"SYNTH-ERP-PD-1366-RAW","name":"Count raw item","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1366-WIP","esb_product_detail_id":"SYNTH-ERP-PD-1366-WIP","name":"Count WIP item","category":"KITCHEN","unit_name":"tray","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":true,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1366-INACTIVE","esb_product_detail_id":"SYNTH-ERP-PD-1366-INACTIVE","name":"Inactive count item","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1366-UNCONFIRMED","esb_product_detail_id":"SYNTH-ERP-PD-1366-UNCONFIRMED","name":"Unconfirmed count item","category":"KITCHEN","unit_name":"box","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1366-UNIT-INACTIVE","esb_product_detail_id":"SYNTH-ERP-PD-1366-UNIT-INACTIVE","name":"Inactive unit count item","category":"KITCHEN","unit_name":"case","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1366-NONSTOCK","esb_product_detail_id":"SYNTH-ERP-PD-1366-NONSTOCK","name":"Non-stock count item","category":"KITCHEN","unit_name":"case","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":true,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.count_raw_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1366-RAW'), true);
select set_config('app.count_wip_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1366-WIP'), true);
select set_config('app.count_inactive_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1366-INACTIVE'), true);
select set_config('app.count_nonstock_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1366-NONSTOCK'), true);
select set_config('app.count_unconfirmed_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1366-UNCONFIRMED'), true);
select set_config('app.count_inactive_unit_item_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1366-UNIT-INACTIVE'), true);
select set_config('app.count_raw_unit_id', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1366-RAW'), true);
select set_config('app.count_wip_unit_id', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1366-WIP'), true);
select set_config('app.count_inactive_unit_id', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1366-INACTIVE'), true);
select set_config('app.count_nonstock_unit_id', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1366-NONSTOCK'), true);
select set_config('app.count_unconfirmed_unit_id', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1366-UNCONFIRMED'), true);
select set_config('app.count_inactive_erp_unit_id', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ERP-PD-1366-UNIT-INACTIVE'), true);

insert into shared.branches (id, org_id, code, name)
values ('00000000-0000-0000-0000-00000000bf05', '00000000-0000-0000-0000-0000000000a1', 'count_test', 'Count test branch');
select is((select posting_enabled from ops.cafe_count_posting_switches
            where org_id = '00000000-0000-0000-0000-0000000000a1'
              and branch_id = '00000000-0000-0000-0000-00000000bf05'),
          false, 'AC-028 a branch created after migration receives a posting switch defaulted off');

set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
update ops.item_units set confirmed_at = now()
 where esb_product_id like 'SYNTH-ERP-P-1366-%';
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count_raw_id')::uuid,
  'Count raw item', current_setting('app.count_raw_unit_id')::uuid,
  array[current_setting('app.count_raw_unit_id')::uuid], 'RAW', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count_wip_id')::uuid,
  'Count WIP item', current_setting('app.count_wip_unit_id')::uuid,
  array[current_setting('app.count_wip_unit_id')::uuid], 'WIP', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count_inactive_id')::uuid,
  'Inactive count item', current_setting('app.count_inactive_unit_id')::uuid,
  array[current_setting('app.count_inactive_unit_id')::uuid], 'RAW', false);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count_nonstock_id')::uuid,
  'Non-stock count item', current_setting('app.count_nonstock_unit_id')::uuid,
  array[current_setting('app.count_nonstock_unit_id')::uuid], 'WIP', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count_unconfirmed_id')::uuid,
  'Unconfirmed count item', current_setting('app.count_unconfirmed_unit_id')::uuid,
  array[current_setting('app.count_unconfirmed_unit_id')::uuid], 'RAW', true);
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01',
        'bar', current_setting('app.count_raw_id')::uuid, 'manual')
on conflict (org_id, branch_id, activity, wip_item_id) do nothing;
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count_inactive_unit_item_id')::uuid,
  'Inactive unit count item', current_setting('app.count_inactive_erp_unit_id')::uuid,
  array[current_setting('app.count_inactive_erp_unit_id')::uuid], 'RAW', true);
update ops.item_units set source_active = false, is_default = false
 where id = current_setting('app.count_inactive_erp_unit_id')::uuid;
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'bar', current_setting('app.count_raw_id')::uuid,
  'Count raw item', current_setting('app.count_raw_unit_id')::uuid,
  array[current_setting('app.count_raw_unit_id')::uuid], 'RAW', true);
update ops.item_units set confirmed_at = null
 where id = current_setting('app.count_unconfirmed_unit_id')::uuid;

select ok((select c.relrowsecurity and c.relforcerowsecurity
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops' and c.relname = 'cafe_count_lines'),
          'NFR-001 Count lines force RLS');
select ok((select c.relrowsecurity and c.relforcerowsecurity
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops' and c.relname = 'cafe_count_posting_switches'),
          'NFR-001 posting switches force RLS');
select ok(not has_table_privilege('authenticated', 'ops.cafe_count_lines', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_count_lines', 'UPDATE')
          and not has_table_privilege('service_role', 'ops.cafe_count_lines', 'INSERT')
          and not has_table_privilege('service_role', 'ops.cafe_count_lines', 'UPDATE'),
          'NFR-001 clients and workers have no direct Count write privileges');
select is((select count(*)::int from ops.cafe_count_posting_switches
            where org_id = '00000000-0000-0000-0000-0000000000a1'
              and branch_id = '00000000-0000-0000-0000-00000000bf01' and not posting_enabled),
          1, 'AC-028 every branch starts with its posting switch off');
select is((select count(*)::int from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')),
          2, 'AC-003 list contains exactly the active RAW and WIP with stock defaults');
select ok(exists (select 1 from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')
                  where item_id = current_setting('app.count_raw_id')::uuid and item_kind = 'RAW'),
          'AC-003 active RAW appears in the stream list');
select ok(exists (select 1 from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')
                  where item_id = current_setting('app.count_wip_id')::uuid and item_kind = 'WIP'),
          'AC-003 active WIP appears in the same stream list');
select ok(not exists (select 1 from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')
                      where item_id in (current_setting('app.count_inactive_id')::uuid,
                                        current_setting('app.count_nonstock_id')::uuid,
                                        current_setting('app.count_unconfirmed_id')::uuid,
                                        current_setting('app.count_inactive_unit_item_id')::uuid)),
          'AC-004 inactive items, non-stock defaults, unconfirmed and inactive ERP units are absent');
select is((select count(*)::int from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf01', 'bar')),
          1, 'AC-003 the other stream returns only its own active RAW list item');
select ok(exists (select 1 from ops.cafe_countable_items('00000000-0000-0000-0000-00000000bf01', 'bar')
                  where item_id = current_setting('app.count_raw_id')::uuid and item_kind = 'RAW'),
          'AC-003 the shared item is independently configured on its second stream');

select set_config('app.count_submit_results', ops.submit_cafe_counts(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', jsonb_build_array(
    jsonb_build_object('client_key', 'f1366000-0000-0000-0000-000000000001',
      'item_id', current_setting('app.count_raw_id'), 'quantity', '0',
      'org_id', '00000000-0000-0000-0000-0000000000b1',
      'submitter_id', '00000000-0000-0000-0000-0000000000b4', 'status', 'Confirmed',
      'source', 'erp', 'expected_balance', 91, 'posting_status', 'posted', 'count_date', '2000-01-01'),
    jsonb_build_object('client_key', 'f1366000-0000-0000-0000-000000000002',
      'item_id', current_setting('app.count_wip_id'), 'quantity', '4,25'),
    jsonb_build_object('client_key', 'f1366000-0000-0000-0000-000000000003',
      'item_id', current_setting('app.count_nonstock_id'), 'quantity', '2'),
    jsonb_build_object('client_key', 'f1366000-0000-0000-0000-000000000004',
      'item_id', current_setting('app.count_raw_id'), 'quantity', '1'),
    jsonb_build_object('client_key', 'f1366000-0000-0000-0000-000000000006',
      'item_id', current_setting('app.count_unconfirmed_id'), 'quantity', '1'),
    jsonb_build_object('client_key', 'f1366000-0000-0000-0000-000000000007',
      'item_id', current_setting('app.count_inactive_unit_item_id'), 'quantity', '1')
  ))::text, true);
select set_config('app.count_raw_line_id', (current_setting('app.count_submit_results')::jsonb -> 0 ->> 'line_id'), true);
select set_config('app.count_wip_line_id', (current_setting('app.count_submit_results')::jsonb -> 1 ->> 'line_id'), true);
select is(jsonb_array_length(current_setting('app.count_submit_results')::jsonb), 6,
          'AC-011 one result is returned for every submitted line');
select is(current_setting('app.count_submit_results')::jsonb -> 0 ->> 'outcome', 'submitted',
          'AC-011 zero is a valid physical Count');
select is(current_setting('app.count_submit_results')::jsonb -> 1 ->> 'outcome', 'submitted',
          'AC-007 decimal comma is accepted');
select is(current_setting('app.count_submit_results')::jsonb -> 2 ->> 'reason', 'item_not_countable',
          'AC-004 a non-stock default unit is refused at insert');
select is(current_setting('app.count_submit_results')::jsonb -> 3 ->> 'reason', 'already_counted',
          'AC-006 a second live line for the branch/item/day is refused');
select is(current_setting('app.count_submit_results')::jsonb -> 4 ->> 'reason', 'item_not_countable',
          'AC-004 an unconfirmed default ERP unit is refused at insert');
select is(current_setting('app.count_submit_results')::jsonb -> 5 ->> 'reason', 'item_not_countable',
          'AC-004 an inactive default ERP unit is refused at insert');
select is((select count(*)::int from ops.cafe_count_lines
            where org_id = '00000000-0000-0000-0000-0000000000a1'
              and branch_id = '00000000-0000-0000-0000-00000000bf01'
              and count_date = (now() at time zone 'Asia/Jakarta')::date),
          2, 'AC-011 one refused line never blocks valid lines');
select ok((select org_id = '00000000-0000-0000-0000-0000000000a1'
                  and submitted_by = '00000000-0000-0000-0000-0000000000d2'
                  and source = 'mos' and status = 'Submitted'
                  and count_date = (submitted_at at time zone 'Asia/Jakarta')::date
                  and expected_status = 'waiting' and expected_balance is null
                  and posting_status = 'not_posted' and row_version = 1
             from ops.cafe_count_lines where id = current_setting('app.count_raw_line_id')::uuid),
          'NFR-001 org, submitter, WIB date, source, status, Expected balance and posting state are server-stamped');
select ok(position('expected_balance' in current_setting('app.count_submit_results')) = 0,
          'AC-009 submit response does not disclose the blind Expected balance');
select is(ops.submit_cafe_counts(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(jsonb_build_object('client_key','f1366000-0000-0000-0000-000000000001',
    'item_id',current_setting('app.count_raw_id'),'quantity','0'))
) -> 0 ->> 'outcome', 'existing', 'AC-012 repeating the same key returns the existing line');
select throws_ok($$select ops.submit_cafe_counts(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', null::jsonb)$$,
  '22023', null, 'AC-011 a null batch is refused rather than treated as an empty success');
select is(ops.submit_cafe_counts(
  '00000000-0000-0000-0000-00000000bf01', 'bar',
  jsonb_build_array(jsonb_build_object('client_key','f1366000-0000-0000-0000-000000000005',
    'item_id',current_setting('app.count_raw_id'),'quantity','0'))
) -> 0 ->> 'reason', 'already_counted', 'AC-006 a second stream of the branch cannot count a live item again');
select is((select count(*)::int from ops.cafe_count_lines
            where client_key = 'f1366000-0000-0000-0000-000000000001'),
          1, 'AC-012 an idempotent retry creates no second row');
select ok(not has_function_privilege('authenticated', 'ops.record_cafe_count_expected_balance(uuid,numeric)', 'EXECUTE')
          and has_function_privilege('service_role', 'ops.record_cafe_count_expected_balance(uuid,numeric)', 'EXECUTE'),
          'NFR-001 only the worker role can write the Expected balance');
select throws_ok($$select ops.record_cafe_count_expected_balance(
  current_setting('app.count_raw_line_id')::uuid, 0)$$,
  '42501', null, 'NFR-001 browser role cannot call the worker-only Expected balance function');

reset role;
grant update on ops.cafe_count_lines to service_role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select throws_ok($$select ops.record_cafe_count_expected_balance(
  current_setting('app.count_wip_line_id')::uuid, 1.23456)$$,
  '22023', null, 'AC-015 Expected balance precision beyond four places is refused rather than rounded');
select ops.record_cafe_count_expected_balance(current_setting('app.count_raw_line_id')::uuid, 0);
select ops.record_cafe_count_expected_balance(current_setting('app.count_wip_line_id')::uuid, 3);
select throws_ok($$update ops.cafe_count_lines set status = 'Confirmed', counted_quantity = 1
  where id = current_setting('app.count_raw_line_id')::uuid$$,
  '42501', null, 'AC-022 a reviewer cannot confirm while changing a figure in the same action');
select throws_ok($$update ops.cafe_count_lines set status = 'Confirmed'
  where id = current_setting('app.count_raw_line_id')::uuid$$,
  '42501', null, 'AC-019 direct UPDATE to Confirmed is refused by the database guard');
reset role;
revoke update on ops.cafe_count_lines from service_role;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select is((select row_version from ops.cafe_count_lines where id = current_setting('app.count_raw_line_id')::uuid),
          2, 'AC-021 Expected balance refresh increments the optimistic version');
select ok((select expected_status = 'ready' and expected_balance = 0 and variance = 0
             from ops.cafe_count_lines where id = current_setting('app.count_raw_line_id')::uuid),
          'AC-015 server-stored zero Variance is exact');

reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select ops.record_cafe_count_expected_balance(current_setting('app.count_raw_line_id')::uuid, 0);
reset role;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.count_raw_line_id')::uuid, 1)$$,
  'P0019', null, 'AC-021 reviewer token from before the first Expected balance is stale');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.count_raw_line_id')::uuid, 2)$$,
  'P0019', null, 'AC-021 a refreshed Expected balance invalidates the prior review version');
select set_config('app.count_confirm_result', ops.confirm_cafe_count_line(
  current_setting('app.count_raw_line_id')::uuid, 3)::text, true);
select is(current_setting('app.count_confirm_result')::jsonb ->> 'status', 'Confirmed',
          'AC-019 current-version zero-Variance line is confirmed');
select is(current_setting('app.count_confirm_result')::jsonb ->> 'posting_status', 'not_needed',
          'AC-028 zero Variance closes as not needed with the switch off');
select ok((select status = 'Confirmed' and reviewed_by = '00000000-0000-0000-0000-0000000000d2'
                  and reviewed_at is not null and row_version = 4 and variance = 0
             from ops.cafe_count_lines where id = current_setting('app.count_raw_line_id')::uuid),
          'AC-019 reviewer, time, immutable facts and new version are stored');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.count_wip_line_id')::uuid, 2)$$,
  'P0020', null, 'AC-028 non-zero Variance cannot be confirmed yet');
select ok((select status = 'Submitted' and variance = 1.25 and posting_status = 'not_posted'
             from ops.cafe_count_lines where id = current_setting('app.count_wip_line_id')::uuid),
          'AC-028 non-zero line remains Submitted and no ERP document is claimed');

reset role;
grant update on ops.cafe_count_lines to service_role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}';
select throws_ok($$update ops.cafe_count_lines set counted_quantity = 99
  where id = current_setting('app.count_raw_line_id')::uuid$$,
  '42501', null, 'AC-022 confirmed Count facts are frozen');
reset role;
revoke update on ops.cafe_count_lines from service_role;
set local role authenticated;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select is((select count(*)::int from ops.cafe_count_lines), 2,
          'NFR-001 current-org reviewer can read Count lines');
select is((select count(*)::int from ops.cafe_count_posting_switches
            where branch_id = '00000000-0000-0000-0000-00000000bf01'), 1,
          'NFR-001 current-org member can read its branch switch');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member"]}';
select is((select count(*)::int from ops.cafe_count_lines), 0,
          'NFR-001 foreign organization is refused Count-line reads');
select is((select count(*)::int from ops.cafe_count_posting_switches
            where branch_id = '00000000-0000-0000-0000-00000000bf01'), 0,
          'NFR-001 foreign organization is refused switch reads');
set local request.jwt.claims = '{}';
select is((select count(*)::int from ops.cafe_count_lines), 0,
          'NFR-001 missing org claim fails closed for Count lines');
select is((select count(*)::int from ops.cafe_count_posting_switches), 0,
          'NFR-001 missing org claim fails closed for switch reads');

set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}';
select throws_ok($$select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  '42501', null, 'AC-028 only admin can change the branch posting switch');
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}';
select lives_ok($$select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  'AC-028 admin can change the branch switch');
select is((select posting_enabled from ops.cafe_count_posting_switches
            where org_id = '00000000-0000-0000-0000-0000000000a1'
              and branch_id = '00000000-0000-0000-0000-00000000bf01'),
          true, 'AC-028 admin change is stored');
select lives_ok($$select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', false)$$,
  'AC-028 admin can leave the switch off');
select ok(exists (select 1 from shared.record_history
                   where schema_name = 'ops' and table_name = 'cafe_count_lines'
                     and record_key = current_setting('app.count_raw_line_id')
                     and action in ('insert', 'update')),
          'NFR-007 Count submit, Expected balance and review are registered in record history');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 0,
          'AC-028 Count never creates an ERP outbox row');

select * from finish();
rollback;
