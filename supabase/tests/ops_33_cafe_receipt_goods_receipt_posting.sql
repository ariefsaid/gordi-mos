-- #1430 — the database side of the worker's goods-receipt posting: the MOS key and branch code on
-- each outbox member, the group's posting stage, the worker's re-match against a freshly read
-- outstanding (excess to Receipt issues) and the move of a refused group's portions out of queued.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1430-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1430-BEAN-KG","name":"Posting coffee bean","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1430-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1430-MILK","name":"Posting milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);

select set_config('app.bean_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1430-BEAN'), true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1430-MILK'), true);
select set_config('app.bean_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1430-BEAN-KG'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1430-MILK'), true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ESB-P-1430-%';

-- Personas: d5 kitchen shift member at bf01, d4 its stream supervisor, d2 ops lead, d3 admin.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.bean_id')::uuid,
  'Posting coffee bean', current_setting('app.bean_kg')::uuid, array[current_setting('app.bean_kg')::uuid], 'RAW', true);
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'Posting milk', current_setting('app.milk_l')::uuid, array[current_setting('app.milk_l')::uuid], 'RAW', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf01', 'main_store');
select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true);
reset role;

set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1430-A', 'supplier_name', 'Synthetic supplier',
    'po_date', (current_date - 5)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 20),
      jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'item_name', 'Milk (ESB)', 'unit_name', 'l', 'outstanding_quantity', 20)))));
reset role;

-- Two approved receipts, each queued as one group on PO A.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r1', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1430000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '6'),
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '4')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r1')::uuid, 1, null);
select set_config('app.r2', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1430000-0000-0000-0000-000000000002', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '3')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r2')::uuid, 1, null);
select set_config('app.r3', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1430000-0000-0000-0000-000000000003', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '1')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r3')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.review_cafe_receipt(current_setting('app.r1')::uuid, 'approve', 2, null);
select ops.review_cafe_receipt(current_setting('app.r2')::uuid, 'approve', 2, null);
select ops.review_cafe_receipt(current_setting('app.r3')::uuid, 'approve', 2, null);
reset role;
select set_config('app.g1', (select distinct push_group_id::text from integrations.esb_push
                              where payload ->> 'receipt_id' = current_setting('app.r1')), true);
select set_config('app.g2', (select distinct push_group_id::text from integrations.esb_push
                              where payload ->> 'receipt_id' = current_setting('app.r2')), true);
select set_config('app.g3', (select distinct push_group_id::text from integrations.esb_push
                              where payload ->> 'receipt_id' = current_setting('app.r3')), true);

-- ── FR-1046 / FR-1029 the payload carries the MOS key and the id map's branch key ─────────────
select is(ops.cafe_receipt_mos_key('dddddddd-1430-0000-0000-000000000001'), 'MOS-DDDDDDDD',
  'FR-1046 a receipt''s MOS key is MOS- and eight characters of its id');
select is(ops.cafe_receipt_mos_key('dddddddd-1430-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001'),
  'MOS-DDDDDDDD-CCCCCCCC', 'FR-1046 a post attempt''s key extends its receipt''s key');
select ok(has_function_privilege('authenticated', 'ops.cafe_receipt_mos_key(uuid, uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'ops.cafe_receipt_mos_key(uuid, uuid)', 'EXECUTE'),
  'FR-1046 signed-in readers can show the key; anonymous callers cannot');
select ok((select bool_and(e.payload ->> 'mos_key' = ops.cafe_receipt_mos_key(current_setting('app.r1')::uuid, e.push_group_id)
                           and e.payload ->> 'mos_key' ~ '^MOS-[0-9A-F]{8}-[0-9A-F]{8}$')
             from integrations.esb_push e where e.push_group_id = current_setting('app.g1')::uuid),
  'FR-1046 every member carries its group''s ASCII MOS key, which starts with the receipt''s');
select ok((select bool_and(e.payload ->> 'branch_code' = b.code)
             from integrations.esb_push e
             join shared.branches b on b.id = '00000000-0000-0000-0000-00000000bf01'
            where e.push_group_id = current_setting('app.g1')::uuid),
  'FR-1029 every member carries the branch code the id map resolves its receiving location under');

-- ── Who may call what ────────────────────────────────────────────────────────────────────────
select ok(has_function_privilege('service_role', 'ops.rematch_cafe_receipt_group(uuid, jsonb)', 'EXECUTE')
          and has_function_privilege('service_role', 'ops.refuse_cafe_receipt_portions(uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'ops.rematch_cafe_receipt_group(uuid, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'ops.refuse_cafe_receipt_portions(uuid, text)', 'EXECUTE'),
  'NFR-1006 only the worker re-matches or refuses a group');
select ok(not has_function_privilege('service_role', 'ops._return_cafe_receipt_portion(uuid, numeric, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'ops._return_cafe_receipt_portion(uuid, numeric, text)', 'EXECUTE'),
  'NFR-1002 the return path runs only inside the database');

-- ── FR-1025 / FR-1028 the posting stage ──────────────────────────────────────────────────────
set local role service_role;
select throws_ok(format($$update integrations.esb_push_groups set posting_stage = 'awaiting_authorization' where id = %L$$,
  current_setting('app.g1')), '23514', null, 'FR-1025 a group cannot await authorization without a created number');
select throws_ok(format($$update integrations.esb_push_groups set posting_stage = 'create_sent', esb_doc_num = 'GR-SYNTH-1' where id = %L$$,
  current_setting('app.g1')), '23514', null, 'FR-1028 a group with a number is past "create sent"');
select lives_ok(format($$update integrations.esb_push_groups set posting_stage = 'create_sent' where id = %L$$,
  current_setting('app.g1')), 'FR-1028 the worker records a create that may have reached ESB');
select throws_ok(format($$update integrations.esb_push_groups set posting_stage = 'authorized' where id = %L$$,
  current_setting('app.g1')), '23514', null, 'FR-1025 the stage is one of the two the worker writes');

-- ── FR-1026/1027 the worker's re-match ───────────────────────────────────────────────────────
select is((select count(*)::int from integrations.claim_esb_pushes(array(
            select id from integrations.esb_push where push_group_id = current_setting('app.g1')::uuid))), 2,
  'the worker claims both members of the group');
select throws_ok(format($$select ops.rematch_cafe_receipt_group(%L, '[{"item_unit_id": "x", "outstanding": -1}]')$$,
  current_setting('app.g1')), '22023', null, 'FR-1027 a negative outstanding is refused');
select throws_ok($$select ops.rematch_cafe_receipt_group('99999999-0000-0000-0000-000000000000', '[]')$$,
  'P0002', null, 'FR-1026 a group that does not exist is refused');
select set_config('app.fresh', jsonb_build_array(
  jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'outstanding', 4),
  jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'outstanding', 9))::text, true);
select is(ops.rematch_cafe_receipt_group(current_setting('app.g1')::uuid, current_setting('app.fresh')::jsonb),
  (select jsonb_agg(jsonb_build_object('push_id', q.push_id, 'quantity', 4)
                    order by q.created_at, q.id)
     from ops.cafe_receipt_portions q where q.receipt_id = current_setting('app.r1')::uuid and q.state = 'queued'),
  'AC-1024 the re-match keeps what the fresh outstanding fits: 4 of 6 kg, all 4 l');
reset role;
select is((select string_agg(q.quantity::text || ':' || q.state, ',' order by q.item_unit_id = current_setting('app.milk_l')::uuid)
             from ops.cafe_receipt_portions q where q.receipt_id = current_setting('app.r1')::uuid),
  '4.0000:queued,4.0000:queued', 'AC-1024 the bean portion now holds the 4 that fits and stays on its outbox row');
select is((select string_agg(i.kind || ':' || i.quantity::text || ':' || i.status || ':' || i.reopened_po_number, ',')
             from ops.cafe_receipt_issues i where i.receipt_id = current_setting('app.r1')::uuid and i.kind in ('over', 'no_po')),
  'over:2.0000:open:PO-SYNTH-1430-A', 'AC-1024 the excess 2 kg returns to Receipt issues as over, naming the PO');
set local role service_role;
select is(jsonb_array_length(ops.rematch_cafe_receipt_group(current_setting('app.g1')::uuid, current_setting('app.fresh')::jsonb)), 2,
  'FR-1026 re-matching the same outstanding again keeps both members');
reset role;
select is((select string_agg(i.kind || ':' || i.quantity::text, ',') from ops.cafe_receipt_issues i
            where i.receipt_id = current_setting('app.r1')::uuid and i.kind in ('over', 'no_po')),
  'over:2.0000', 'FR-1026 ...and returns nothing twice');
set local role service_role;
select is(ops.rematch_cafe_receipt_group(current_setting('app.g1')::uuid, '[]'), '[]'::jsonb,
  'AC-1025 a PO no longer open keeps nothing to send');
reset role;
select ok((select bool_and(q.state = 'superseded' and q.push_id is not null)
             from ops.cafe_receipt_portions q where q.receipt_id = current_setting('app.r1')::uuid),
  'AC-1025 its portions leave the posting path and keep their outbox link (FR-1046)');
select is((select string_agg(i.kind || ':' || i.quantity::text, ',' order by i.kind, i.quantity)
             from ops.cafe_receipt_issues i where i.receipt_id = current_setting('app.r1')::uuid and i.kind in ('over', 'no_po')),
  'no_po:4.0000,no_po:4.0000,over:2.0000', 'AC-1025 ...and their quantities are Receipt issues procurement can link or close');

-- ── DD-2026-10-06-1429 (6) a refused group's portions leave queued ───────────────────────────
set local role service_role;
select integrations.claim_esb_pushes(array(select id from integrations.esb_push where push_group_id = current_setting('app.g2')::uuid));
select is(ops.refuse_cafe_receipt_portions(current_setting('app.g2')::uuid, 'esb_refused'), 0,
  'DD-1429 (6) members still in flight are not moved');
update integrations.esb_push set status = 'dead_letter', last_error = 'ESB refused goods receipt: synthetic closed period'
 where push_group_id = current_setting('app.g2')::uuid;
select throws_ok(format($$select ops.refuse_cafe_receipt_portions(%L, 'posting_off')$$, current_setting('app.g2')),
  '22023', null, 'CQ4 a refusal names who refused: ESB or the worker');

-- B1: ESB may hold a goods receipt for the group, so nothing is freed and nothing is released again.
update integrations.esb_push_groups set posting_stage = 'create_sent' where id = current_setting('app.g2')::uuid;
select is(ops.refuse_cafe_receipt_portions(current_setting('app.g2')::uuid, 'esb_refused'), 0,
  'B1 a group whose create may have reached ESB (create sent) keeps its portions queued');
update integrations.esb_push_groups set esb_doc_num = 'GR-SYNTH-1430', posting_stage = 'awaiting_authorization', status = 'dead_letter'
 where id = current_setting('app.g2')::uuid;
select is(ops.refuse_cafe_receipt_portions(current_setting('app.g2')::uuid, 'esb_refused'), 0,
  'PROBE-DB1 B1 a group ESB already holds (esb_doc_num set) does not release its portions from queued');
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is(ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01') ->> 'queued_portions', '0',
  'PROBE-DB2 B1 a release does not enqueue a second goods receipt for goods ESB already holds');
reset role;
select is((select count(*)::int from ops.cafe_receipt_portions q join integrations.esb_push e on e.id = q.push_id
            where q.receipt_id = current_setting('app.r2')::uuid and e.push_group_id <> current_setting('app.g2')::uuid), 0,
  'PROBE-DB3 B1 no second outbox group exists for receipt 2');
select is((select q.state from ops.cafe_receipt_portions q where q.receipt_id = current_setting('app.r2')::uuid),
  'queued', 'B1 ...and its portion still counts against the PO');

-- ESB refused the create itself: nothing exists in ESB, so the portion leaves queued.
set local role service_role;
update integrations.esb_push_groups set esb_doc_num = null, posting_stage = null where id = current_setting('app.g2')::uuid;
select is(ops.refuse_cafe_receipt_portions(current_setting('app.g2')::uuid, 'esb_refused'), 1,
  'DD-1429 (6) a dead-lettered member''s portion is moved once ESB provably holds nothing');
select integrations.claim_esb_pushes(array(select id from integrations.esb_push where push_group_id = current_setting('app.g3')::uuid));
update integrations.esb_push set status = 'dead_letter', last_error = 'branch has no id map entry'
 where push_group_id = current_setting('app.g3')::uuid;
select is(ops.refuse_cafe_receipt_portions(current_setting('app.g3')::uuid, 'worker_refused'), 1,
  'CQ4 a group the worker refused before contacting ESB is freed too');
reset role;
select is((select q.state || ':' || q.hold_reason from ops.cafe_receipt_portions q where q.receipt_id = current_setting('app.r3')::uuid),
  'held:worker_refused', 'CQ4 ...held as refused by the worker, never blamed on ESB');
select is((select q.state || ':' || q.hold_reason || ':' || (q.push_id is not null)::text
             from ops.cafe_receipt_portions q where q.receipt_id = current_setting('app.r2')::uuid),
  'held:esb_refused:true', 'DD-1429 (6) the refused portion is held as esb_refused with its outbox link');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((select ops.cafe_receipt_posting(r) ->> 'state' from ops.cafe_receipts r where r.id = current_setting('app.r2')::uuid),
  'failed', 'FR-1025 the refused receipt reads failed');
select is(ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01') ->> 'queued_portions', '2',
  'FR-1030 once the cause is fixed, a release queues both refused portions again');
reset role;
select ok((select count(*) = 1 and bool_and(e.payload ->> 'mos_key' like ops.cafe_receipt_mos_key(current_setting('app.r2')::uuid) || '-%'
                                            and e.push_group_id <> current_setting('app.g2')::uuid and e.status = 'pending')
             from ops.cafe_receipt_portions q join integrations.esb_push e on e.id = q.push_id
            where q.receipt_id = current_setting('app.r2')::uuid and q.state = 'queued'),
  'FR-1046 the new post attempt is a new group under the same receipt key');

select * from finish();
rollback;
