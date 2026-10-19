-- #1368 — Recount and reason only for Counts that differ; confirm preconditions; held with posting off.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1368-A","esb_product_detail_id":"SYNTH-ERP-PD-1368-A","name":"Recount item A","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1368-B","esb_product_detail_id":"SYNTH-ERP-PD-1368-B","name":"Recount item B","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1368-C","esb_product_detail_id":"SYNTH-ERP-PD-1368-C","name":"Recount item C","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1368-D","esb_product_detail_id":"SYNTH-ERP-PD-1368-D","name":"Recount item D","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ERP-P-1368-%';

-- Personas (Gordi HQ bf01): d5 kitchen shift member, d4 kitchen supervisor, d2 ops lead.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid), ('00000000-0000-0000-0000-0000000000d4'::uuid)) as p(person_id)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'gordi_hq_kitchen';

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', w.id, w.name, u.id, array[u.id], 'RAW', true)
  from ops.wip_items w join ops.item_units u on u.wip_item_id = w.id
 where w.esb_product_id like 'SYNTH-ERP-P-1368-%';

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r', ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen', (
  select jsonb_agg(jsonb_build_object('client_key', k.key, 'item_id', w.id, 'quantity', k.qty) order by k.code)
    from (values ('A', 'f1368000-0000-0000-0000-00000000000a'::uuid, '5'),
                 ('B', 'f1368000-0000-0000-0000-00000000000b'::uuid, '3'),
                 ('C', 'f1368000-0000-0000-0000-00000000000c'::uuid, '2'),
                 ('D', 'f1368000-0000-0000-0000-00000000000d'::uuid, '1')) as k(code, key, qty)
    join ops.wip_items w on w.esb_product_id = 'SYNTH-ERP-P-1368-' || k.code
))::text, true);
select set_config('app.a', current_setting('app.r')::jsonb -> 0 ->> 'line_id', true);
select set_config('app.b', current_setting('app.r')::jsonb -> 1 ->> 'line_id', true);
select set_config('app.c', current_setting('app.r')::jsonb -> 2 ->> 'line_id', true);
select set_config('app.d', current_setting('app.r')::jsonb -> 3 ->> 'line_id', true);
select is((select count(*)::int from ops.cafe_count_lines where id in (
  current_setting('app.a')::uuid, current_setting('app.b')::uuid, current_setting('app.c')::uuid, current_setting('app.d')::uuid)),
  4, 'setup: the floor submits four blind Counts');

-- AC-020 an Expected balance that is not ready blocks recount and confirm.
select throws_ok($$select ops.record_cafe_count_recount(current_setting('app.d')::uuid, 1)$$,
  'P0018', 'CAFE_COUNT_EXPECTED_BALANCE_NOT_READY', 'AC-020 no recount is asked before the Expected balance is ready');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.d')::uuid, 1)$$,
  'P0018', 'CAFE_COUNT_EXPECTED_BALANCE_NOT_READY', 'AC-020 a line whose Expected balance is not ready is refused');

-- The worker stub writes Expected: A matches, B differs by the smallest stored step, C differs by 2.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1"}';
select ops.record_cafe_count_expected_balance(current_setting('app.a')::uuid, 5);
select ops.record_cafe_count_expected_balance(current_setting('app.b')::uuid, 3.0001);
select ops.record_cafe_count_expected_balance(current_setting('app.c')::uuid, 4);
reset role;
set local role authenticated;
select set_config('app.b_expected_at', (select expected_recorded_at::text from ops.cafe_count_lines where id = current_setting('app.b')::uuid), true);

-- AC-018 zero first-count Variance confirms with neither recount nor reason.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.record_cafe_count_recount(current_setting('app.a')::uuid, 5)$$,
  'P0018', 'CAFE_COUNT_RECOUNT_NOT_REQUIRED', 'AC-018 a matching first count is never asked for a recount');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is(ops.confirm_cafe_count_line(current_setting('app.a')::uuid, 2) ->> 'posting_status', 'not_needed',
  'AC-018 a zero-Variance line confirms without recount or reason and closes not needed');

-- AC-020 no threshold: a 0.0001 difference without a recount is refused and stays Submitted.
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.b')::uuid, 2)$$,
  'P0020', 'CAFE_COUNT_RECOUNT_REQUIRED', 'AC-020 a non-zero Variance without a recount is refused, however small');
select ok((select status = 'Submitted' and posting_status = 'not_posted' from ops.cafe_count_lines where id = current_setting('app.b')::uuid),
  'AC-020 the refused line stays Submitted and claims no posting');

-- AC-016 the recount keeps the first count and snapshot and recomputes against the same snapshot.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select throws_ok($$select ops.record_cafe_count_recount(current_setting('app.b')::uuid, 3)$$,
  'P0018', 'CAFE_COUNT_LINE_NOT_SUBMITTED', 'NFR-001 another organisation cannot recount the line');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.record_cafe_count_recount(current_setting('app.b')::uuid, -1)$$,
  '22023', 'CAFE_COUNT_RECOUNT_INVALID', 'AC-016 a negative recount is refused');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.b')::uuid, 'early reason')$$,
  'P0018', 'CAFE_COUNT_RECOUNT_REQUIRED', 'AC-016 a reason waits for the recount');
select set_config('app.b_recount', ops.record_cafe_count_recount(current_setting('app.b')::uuid, 3.5)::text, true);
select is(current_setting('app.b_recount')::jsonb ->> 'reason_required', 'true',
  'AC-016 a recount that still differs asks for a reason');
select ok(not (current_setting('app.b_recount')::jsonb ? 'variance') and not (current_setting('app.b_recount')::jsonb ? 'expected_balance'),
  'AC-017 the recount response carries no Expected figure, Variance or direction');
select ok((select counted_quantity = 3 and recounted_quantity = 3.5
                  and recounted_by = '00000000-0000-0000-0000-0000000000d5' and recounted_at is not null
                  and expected_balance = 3.0001 and expected_recorded_at::text = current_setting('app.b_expected_at')
                  and variance = 0.4999 and row_version = 3
             from ops.cafe_count_lines where id = current_setting('app.b')::uuid),
  'AC-016 first count unchanged, recounter and time stored, Variance recomputed against the same snapshot');
select throws_ok($$select ops.record_cafe_count_recount(current_setting('app.b')::uuid, 4)$$,
  'P0018', 'CAFE_COUNT_RECOUNT_ALREADY_RECORDED', 'AC-016 a line takes one recount');
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1"}';
select throws_ok($$select ops.record_cafe_count_expected_balance(current_setting('app.b')::uuid, 3.5)$$,
  'P0018', 'CAFE_COUNT_EXPECTED_SNAPSHOT_FROZEN', 'AC-016 the worker cannot move the snapshot once a recount exists');
reset role;
set local role authenticated;

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.b')::uuid, 3)$$,
  'P0020', 'CAFE_COUNT_REASON_REQUIRED', 'AC-020 a non-zero final Variance without a reason is refused');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.b')::uuid, '')$$,
  '22023', 'CAFE_COUNT_REASON_INVALID', 'AC-016 a blank reason is refused');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.b')::uuid, E'  \t ')$$,
  '22023', 'CAFE_COUNT_REASON_INVALID', 'AC-016 a whitespace-only reason is refused');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.b')::uuid, repeat('x', 501))$$,
  '22023', 'CAFE_COUNT_REASON_INVALID', 'AC-016 a reason over 500 characters is refused');
select lives_ok($$select ops.record_cafe_count_reason(current_setting('app.b')::uuid, '  Half a bag spilled  ')$$,
  'AC-016 a written reason is accepted');
select ok((select reason = 'Half a bag spilled' and reason_entered_by = '00000000-0000-0000-0000-0000000000d5'
                  and reason_entered_at is not null and row_version = 4
             from ops.cafe_count_lines where id = current_setting('app.b')::uuid),
  'AC-016 the trimmed reason, who entered it and when are stored');

-- FR-024 the version token: the floor's writes make an earlier reviewer token stale.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.b')::uuid, 3)$$,
  'P0019', 'CAFE_COUNT_VERSION_STALE', 'FR-024 a token from before the reason is stale');
select is(ops.confirm_cafe_count_line(current_setting('app.b')::uuid, 4) ->> 'posting_status', 'held',
  'FR-031 a complete non-zero line confirms held while posting is off');
select ok((select status = 'Confirmed' and posting_status = 'held' and reviewed_by = '00000000-0000-0000-0000-0000000000d4'
             from ops.cafe_count_lines where id = current_setting('app.b')::uuid),
  'FR-031 the held line is Confirmed with its reviewer stored');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.b')::uuid, 'changed later')$$,
  'P0018', 'CAFE_COUNT_LINE_NOT_SUBMITTED', 'FR-028 a confirmed line takes no further reason');

-- AC-018 a recount that lands on Expected needs no reason.
select is(ops.record_cafe_count_recount(current_setting('app.c')::uuid, 4) ->> 'reason_required', 'false',
  'AC-018 a recount that lands on Expected asks for no reason');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.c')::uuid, 'not needed')$$,
  'P0018', 'CAFE_COUNT_REASON_NOT_REQUIRED', 'AC-018 a reason is refused when the final Variance is zero');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is(ops.confirm_cafe_count_line(current_setting('app.c')::uuid, 3) ->> 'posting_status', 'not_needed',
  'AC-018 a recount on Expected confirms without a reason and closes not needed');
select ok((select counted_quantity = 2 and recounted_quantity = 4 and variance = 0
             from ops.cafe_count_lines where id = current_setting('app.c')::uuid),
  'AC-018 the first count stays beside the recount');

-- The floor's writes go only through these functions.
select ok(not has_table_privilege('authenticated', 'ops.cafe_count_lines', 'UPDATE'),
  'NFR-002 the browser has no direct UPDATE on Count lines');
select ok(not has_function_privilege('anon', 'ops.record_cafe_count_recount(uuid,numeric)', 'EXECUTE')
          and not has_function_privilege('anon', 'ops.record_cafe_count_reason(uuid,text)', 'EXECUTE'),
  'NFR-001 anonymous callers cannot recount or explain');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 0,
  'FR-031 nothing reaches the outbox with posting off');

select * from finish();
rollback;
