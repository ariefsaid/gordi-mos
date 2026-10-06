-- #1368 — recount, reason, variance review, and OD-2026-10-06-ERP-MIN confirmation authority.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select ok(not has_table_privilege('authenticated', 'ops.cafe_count_lines', 'select')
          and not has_column_privilege('authenticated', 'ops.cafe_count_lines', 'expected_balance', 'select')
          and not has_column_privilege('authenticated', 'ops.cafe_count_lines', 'variance', 'select'),
          'AC-016 floor clients cannot directly select reviewer count facts');
select ok(position('expected_balance' in pg_get_function_result('ops.cafe_count_floor_lines(date)'::regprocedure)) = 0
          and position('variance' in pg_get_function_result('ops.cafe_count_floor_lines(date)'::regprocedure)) = 0,
          'AC-016 floor RPC return shape omits Expected and Variance');

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"TESTCAT-PRODUCT-1368-ZERO","esb_product_detail_id":"TESTCAT-DETAIL-1368-ZERO","name":"Long-name recount control item","category":"KITCHEN","unit_name":"sealed stock carton","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"TESTCAT-PRODUCT-1368-OPS","esb_product_detail_id":"TESTCAT-DETAIL-1368-OPS","name":"Ops lead confirmation item","category":"KITCHEN","unit_name":"kilogram","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"TESTCAT-PRODUCT-1368-RECOUNT","esb_product_detail_id":"TESTCAT-DETAIL-1368-RECOUNT","name":"Recount and reason fixture item","category":"KITCHEN","unit_name":"prepared batch tray","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.count1368_zero_id', (select id::text from ops.wip_items where esb_product_id = 'TESTCAT-PRODUCT-1368-ZERO'), true);
select set_config('app.count1368_ops_id', (select id::text from ops.wip_items where esb_product_id = 'TESTCAT-PRODUCT-1368-OPS'), true);
select set_config('app.count1368_recount_id', (select id::text from ops.wip_items where esb_product_id = 'TESTCAT-PRODUCT-1368-RECOUNT'), true);
select set_config('app.count1368_zero_unit', (select id::text from ops.item_units where esb_product_detail_id = 'TESTCAT-DETAIL-1368-ZERO'), true);
select set_config('app.count1368_ops_unit', (select id::text from ops.item_units where esb_product_detail_id = 'TESTCAT-DETAIL-1368-OPS'), true);
select set_config('app.count1368_recount_unit', (select id::text from ops.item_units where esb_product_detail_id = 'TESTCAT-DETAIL-1368-RECOUNT'), true);

insert into shared.people (id, org_id, full_name, email) values
  ('13680000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','Count Test Submitter','count-submitter-1368@example.test'),
  ('13680000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','Count Test Re-counter','count-recounter-1368@example.test'),
  ('13680000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a1','Count Test Member','count-member-1368@example.test'),
  ('13680000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000a1','Count Test Stream Reviewer','count-supervisor-1368@example.test'),
  ('13680000-0000-0000-0000-000000000005','00000000-0000-0000-0000-0000000000a1','Count Test Ops Lead','count-ops-lead-1368@example.test'),
  ('13680000-0000-0000-0000-000000000006','00000000-0000-0000-0000-0000000000a1','Count Test Admin','count-admin-1368@example.test');
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', people.person_id, team.id, true, current_date - 30
  from (values
    ('13680000-0000-0000-0000-000000000001'::uuid),
    ('13680000-0000-0000-0000-000000000002'::uuid),
    ('13680000-0000-0000-0000-000000000003'::uuid),
    ('13680000-0000-0000-0000-000000000004'::uuid)
  ) as people(person_id)
  join shared.teams team on team.org_id = '00000000-0000-0000-0000-0000000000a1'
   and team.branch_id = '00000000-0000-0000-0000-00000000bf01' and team.activity = 'kitchen'
   and team.archived_at is null;

update ops.item_units set confirmed_at = now()
 where esb_product_id like 'TESTCAT-PRODUCT-1368-%';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000005","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count1368_zero_id')::uuid,
  'Long-name recount control item', current_setting('app.count1368_zero_unit')::uuid, array[current_setting('app.count1368_zero_unit')::uuid], 'RAW', true);
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count1368_ops_id')::uuid,
  'Ops lead confirmation item', current_setting('app.count1368_ops_unit')::uuid, array[current_setting('app.count1368_ops_unit')::uuid], 'RAW', true);
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.count1368_recount_id')::uuid,
  'Recount and reason fixture item', current_setting('app.count1368_recount_unit')::uuid, array[current_setting('app.count1368_recount_unit')::uuid], 'RAW', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000001","access_roles":["member"]}');
select ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01','kitchen',
  jsonb_build_array(
    jsonb_build_object('client_key','13680000-0000-0000-0000-000000000001','item_id',current_setting('app.count1368_zero_id'),'quantity','2'),
    jsonb_build_object('client_key','13680000-0000-0000-0000-000000000002','item_id',current_setting('app.count1368_ops_id'),'quantity','5'),
    jsonb_build_object('client_key','13680000-0000-0000-0000-000000000003','item_id',current_setting('app.count1368_recount_id'),'quantity','5')
  ));
reset role;

set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000005"}';
select ops.record_cafe_count_expected_balance(line.id, case line.wip_item_id
  when current_setting('app.count1368_zero_id')::uuid then 2 else 4 end)
  from ops.cafe_count_lines line
 where line.wip_item_id in (current_setting('app.count1368_zero_id')::uuid,
                            current_setting('app.count1368_ops_id')::uuid,
                            current_setting('app.count1368_recount_id')::uuid);
reset role;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000003","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_count_floor_lines((statement_timestamp() at time zone 'Asia/Jakarta')::date)),
          3, 'AC-016 an org member reads the safe floor rows without base-table SELECT');
select throws_ok($$select * from ops.cafe_count_review_lines((statement_timestamp() at time zone 'Asia/Jakarta')::date)$$,
  '42501', null, 'AC-016 ordinary members cannot call the reviewer-only Expected/Variance reader');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000005","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.record_cafe_count_recount(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_zero_id')::uuid), 9)$$,
  'P0018', null, 'AC-018 a zero first-count variance does not request a recount');
select throws_ok($$select ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_ops_id')::uuid), 2)$$,
  'P0018', null, 'AC-020 a non-zero first variance cannot be confirmed before recount');
select throws_ok($$select ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), 2)$$,
  'P0018', null, 'AC-020 a non-zero first variance cannot be confirmed before recount');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000002","access_roles":["member"]}');
select lives_ok($$select ops.record_cafe_count_recount(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_ops_id')::uuid), 4)$$,
  'AC-018 a recount that lands on expected is recorded');
select throws_ok($$select ops.record_cafe_count_recount(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_ops_id')::uuid), 3)$$,
  'P0018', null, 'AC-018 the one blind recount cannot be replaced after it is recorded');
reset role;
select ok((select counted_quantity = 5 and recounted_quantity = 4
                  and recounted_by = '13680000-0000-0000-0000-000000000002'
                  and recounted_at is not null and expected_balance = 4
                  and variance = 0 and row_version = 3
             from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_ops_id')::uuid),
          'AC-018 the first count stays fixed and recount variance uses the original expected snapshot');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000005","access_roles":["member","ops_lead"]}');
select is(ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_ops_id')::uuid), 3) ->> 'posting_status',
  'not_needed', 'AC-018 a complete zero-final-variance recount needs no reason and is confirmable by an independent ops lead');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000002","access_roles":["member"]}');
select lives_ok($$select ops.record_cafe_count_recount(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), 4.5)$$,
  'AC-016 a dedicated re-counter records a non-zero final Count');
reset role;
select ok((select counted_quantity = 5 and recounted_quantity = 4.5
                  and recounted_by = '13680000-0000-0000-0000-000000000002'
                  and recounted_at is not null and expected_balance = 4
                  and variance = 0.5 and row_version = 3
             from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid),
          'AC-016 recounter and time are stored, first count is unchanged, and final variance uses the same expected snapshot');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000002","access_roles":["member"]}');
select throws_ok($$select ops.record_cafe_count_reason(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), '   ')$$,
  '22023', null, 'AC-016 whitespace-only final-variance reason is refused');
select throws_ok($$select ops.record_cafe_count_reason(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), repeat('x', 501))$$,
  '22023', null, 'AC-016 a reason beyond the field limit is refused');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000005","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), 3)$$,
  'P0018', null, 'AC-020 a non-zero final variance without a reason remains waiting');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000002","access_roles":["member"]}');
select lives_ok($$select ops.record_cafe_count_reason(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), 'Recounted the sealed shelf stock.')$$,
  'AC-016 a non-zero final variance accepts a bounded reason');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000002","access_roles":["member","ops_lead"]}');

select throws_ok($$select ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), 4)$$,
  '42501', null, 'OD-2026-10-06-ERP-MIN the re-counter cannot confirm their own recount');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000003","access_roles":["member"]}');
select throws_ok($$select ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), 4)$$,
  '42501', null, 'OD-2026-10-06-ERP-MIN a Café member cannot confirm a Count');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000004","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), 4)$$,
  '42501', null, 'OD-2026-10-06-ERP-MIN a stream reviewer cannot confirm a Count');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000005","access_roles":["member","ops_lead"]}');
select is(ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid), 4) ->> 'posting_status',
  'held', 'AC-019 an independent ops lead can confirm a complete non-zero recount while posting is off');
select is((select status from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_recount_id')::uuid),
          'Confirmed', 'AC-031 a held non-zero Count is recorded confirmed');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000001","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_zero_id')::uuid), 2)$$,
  '42501', null, 'OD-2026-10-06-ERP-MIN an ops lead who submitted the Count cannot confirm it');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"13680000-0000-0000-0000-000000000006","access_roles":["member","admin"]}');
select is(ops.confirm_cafe_count_line(
  (select id from ops.cafe_count_lines where wip_item_id = current_setting('app.count1368_zero_id')::uuid), 2) ->> 'posting_status',
  'not_needed', 'AC-018 an admin other than the submitter confirms a zero-variance Count without recount or reason');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 0,
          'AC-031 recount confirmation with posting off creates no ERP outbox row');
select * from finish();
rollback;
