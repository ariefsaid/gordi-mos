-- #1373/#1375 — confirmation groups, independent branch switches and current-only release.
begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1373-A","esb_product_detail_id":"SYNTH-ERP-PD-1373-A","name":"Count posting A","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1373-B","esb_product_detail_id":"SYNTH-ERP-PD-1373-B","name":"Count posting B","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1373-C","esb_product_detail_id":"SYNTH-ERP-PD-1373-C","name":"Count posting C","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1373-D","esb_product_detail_id":"SYNTH-ERP-PD-1373-D","name":"Count posting D","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1373-E","esb_product_detail_id":"SYNTH-ERP-PD-1373-E","name":"Count posting E","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1373-F","esb_product_detail_id":"SYNTH-ERP-PD-1373-F","name":"Count posting F","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1373-G","esb_product_detail_id":"SYNTH-ERP-PD-1373-G","name":"Count posting G","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1373-H","esb_product_detail_id":"SYNTH-ERP-PD-1373-H","name":"Count posting H","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
select org_id, '00000000-0000-0000-0000-00000000bf01', 'kitchen', id, 'manual'
  from ops.wip_items
 where org_id = '00000000-0000-0000-0000-0000000000a1' and esb_product_id like 'SYNTH-ERP-P-1373-%';
select set_config('app.allow_test_seeds', 'off', true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ERP-P-1373-%';
select set_config('app.esb_target_env', 'goo', true);

insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid),
               ('00000000-0000-0000-0000-0000000000d4'::uuid)) p(person_id)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'gordi_hq_kitchen'
 where not exists (select 1 from shared.team_memberships m where m.org_id = t.org_id and m.person_id = p.person_id and m.team_id = t.id);

create function pg_temp.submit_count(p_code text, p_key uuid, p_quantity text, p_day date, p_claims text)
returns uuid language plpgsql as $$
declare v_result jsonb;
begin
  perform shared._test_set_access_roles(p_claims);
  v_result := ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen', jsonb_build_array(jsonb_build_object(
    'client_key', p_key, 'item_id', (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1373-' || p_code),
    'quantity', p_quantity)), p_day);
  return (v_result -> 0 ->> 'line_id')::uuid;
end;
$$;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', w.id, w.name, u.id, array[u.id], 'RAW', true)
  from ops.wip_items w join ops.item_units u on u.wip_item_id = w.id
 where w.esb_product_id like 'SYNTH-ERP-P-1373-%';

-- The three held release candidates use distinct branch dates: one later ERP document, one
-- approved waste log without a document, and one date whose Expected snapshot is still current.
select set_config('app.f', pg_temp.submit_count('F', 'f1373000-0000-0000-0000-00000000000f', '2', current_date - 4,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}')::text, true);
select set_config('app.g', pg_temp.submit_count('G', 'f1373000-0000-0000-0000-000000000010', '2', current_date - 3,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}')::text, true);
select set_config('app.h', pg_temp.submit_count('H', 'f1373000-0000-0000-0000-000000000011', '2', current_date - 2,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}')::text, true);

reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1"}';
select ops.record_cafe_count_expected_balance(current_setting('app.f')::uuid, 1);
select ops.record_cafe_count_expected_balance(current_setting('app.g')::uuid, 1);
select ops.record_cafe_count_expected_balance(current_setting('app.h')::uuid, 1);
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.record_cafe_count_recount(current_setting('app.f')::uuid, 2);
select ops.record_cafe_count_reason(current_setting('app.f')::uuid, 'checked');
select ops.record_cafe_count_recount(current_setting('app.g')::uuid, 2);
select ops.record_cafe_count_reason(current_setting('app.g')::uuid, 'checked');
select ops.record_cafe_count_recount(current_setting('app.h')::uuid, 2);
select ops.record_cafe_count_reason(current_setting('app.h')::uuid, 'checked');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.confirm_cafe_count_line(current_setting('app.f')::uuid, 4);
select ops.confirm_cafe_count_line(current_setting('app.g')::uuid, 4);
select ops.confirm_cafe_count_line(current_setting('app.h')::uuid, 4);
reset role;
set local role service_role;
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 0,
  'FR-031 the default-off branch switch keeps non-zero confirmations held and out of the outbox');
reset role;

-- The exact two stale conditions: a posted ERP document after Expected, and an Approved waste
-- log without its ERP document. The third held line has neither and remains current.
reset role;
insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
                              wip_item_id, qty_porsi, status, source, submitted_by, reviewed_by, reviewed_at,
                              batch_id, posted_to_esb, esb_doc_num, posted_at)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', current_date - 4,
       '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce', null, w.id, 1, 'Approved', 'teable_import', null,
       '00000000-0000-0000-0000-0000000000d4', now(), 'COUNT-POSTED-AFTER-SNAPSHOT', true, 'ERP-COUNT-POSTED', now() + interval '1 minute'
  from ops.wip_items w where w.esb_product_id = 'SYNTH-ERP-P-1373-F';
insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
                              wip_item_id, item_unit_id, qty_porsi, status, source, submitted_by, reviewed_by, reviewed_at,
                              batch_id, posted_to_esb)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', current_date - 3,
       '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'waste', null, w.id,
       (select u.id from ops.item_units u where u.wip_item_id = w.id and u.source_active limit 1),
       1, 'Approved', 'teable_import', null,
       '00000000-0000-0000-0000-0000000000d4', now(), 'COUNT-HELD-WASTE-NO-ERP-DOC', false
  from ops.wip_items w where w.esb_product_id = 'SYNTH-ERP-P-1373-G';

-- Inbound transfers affect the destination's expected figure too.
savepoint inbound_probe;
insert into ops.cafe_destinations (org_id, origin_branch_id, origin_activity, destination_branch_id)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02',
        'kitchen', '00000000-0000-0000-0000-00000000bf01') on conflict do nothing;
insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action, destination_branch_id,
                              wip_item_id, qty_porsi, status, source, batch_id, posted_to_esb)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', current_date - 2,
       '00000000-0000-0000-0000-00000000bf02', 'kitchen', 'transfer',
       '00000000-0000-0000-0000-00000000bf01', w.id, 1, 'Approved', 'teable_import', 'COUNT-INBOUND', false
  from ops.wip_items w where w.esb_product_id = 'SYNTH-ERP-P-1373-H';
select ok(not ops._cafe_count_expected_is_current(line.org_id, line.branch_id, line.activity,
              line.count_date, line.expected_recorded_at),
  'AC-034 an approved inbound transfer without its document keeps the destination count held')
  from ops.cafe_count_lines line where line.id = current_setting('app.h')::uuid;
rollback to inbound_probe;

savepoint submitted_probe;
insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                              wip_item_id, qty_porsi, status, source, batch_id)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', current_date - 2,
       '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce', w.id, 1, 'Submitted', 'teable_import', 'COUNT-SUBMITTED'
  from ops.wip_items w where w.esb_product_id = 'SYNTH-ERP-P-1373-H';
select ok(not ops._cafe_count_expected_is_current(line.org_id, line.branch_id, line.activity,
              line.count_date, line.expected_recorded_at),
  'AC-034 an unsettled movement keeps the count held')
  from ops.cafe_count_lines line where line.id = current_setting('app.h')::uuid;
rollback to submitted_probe;

-- One confirmation action groups its three non-zero lines; zero-variance lines never become members.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select lives_ok($$select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  'AC-029 admin can enable the branch count-posting switch');
select ok((select posting_enabled from ops.cafe_count_posting_switches where branch_id = '00000000-0000-0000-0000-00000000bf01'),
  'AC-029 the branch switch is stored on');

select set_config('app.a', pg_temp.submit_count('A', 'f1373000-0000-0000-0000-00000000000a', '2', current_date,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}')::text, true);
select set_config('app.b', pg_temp.submit_count('B', 'f1373000-0000-0000-0000-00000000000b', '3', current_date,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}')::text, true);
select set_config('app.c', pg_temp.submit_count('C', 'f1373000-0000-0000-0000-00000000000c', '4', current_date,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}')::text, true);
select set_config('app.d', pg_temp.submit_count('D', 'f1373000-0000-0000-0000-00000000000d', '5', current_date,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}')::text, true);
select set_config('app.e', pg_temp.submit_count('E', 'f1373000-0000-0000-0000-00000000000e', '6', current_date,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}')::text, true);
reset role;
set local role service_role;
select ops.record_cafe_count_expected_balance(current_setting('app.a')::uuid, 1);
select ops.record_cafe_count_expected_balance(current_setting('app.b')::uuid, 2);
select ops.record_cafe_count_expected_balance(current_setting('app.c')::uuid, 3);
select ops.record_cafe_count_expected_balance(current_setting('app.d')::uuid, 5);
select ops.record_cafe_count_expected_balance(current_setting('app.e')::uuid, 6);
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select ops.record_cafe_count_recount(current_setting('app.a')::uuid, 2);
select ops.record_cafe_count_reason(current_setting('app.a')::uuid, 'checked');
select ops.record_cafe_count_recount(current_setting('app.b')::uuid, 3);
select ops.record_cafe_count_reason(current_setting('app.b')::uuid, 'checked');
select ops.record_cafe_count_recount(current_setting('app.c')::uuid, 4);
select ops.record_cafe_count_reason(current_setting('app.c')::uuid, 'checked');
reset role;
savepoint confirmation_gate;
insert into ops.kitchen_logs (org_id, business_unit_id, log_date, branch_id, activity, action,
                              wip_item_id, qty_porsi, status, source, batch_id)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bb01', current_date,
       '00000000-0000-0000-0000-00000000bf01', 'kitchen', 'produce', w.id, 1, 'Submitted', 'teable_import', 'COUNT-CONFIRM-GATE'
  from ops.wip_items w where w.esb_product_id = 'SYNTH-ERP-P-1373-A';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is(ops.confirm_cafe_count_line(current_setting('app.a')::uuid, 4) ->> 'posting_status', 'held',
  'AC-029 confirmation stays held while the movement gate is closed even with the switch on');
rollback to confirmation_gate;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select set_config('app.confirmed', ops.confirm_cafe_count_lines(jsonb_build_array(
  jsonb_build_object('line_id',current_setting('app.a'),'row_version',4),
  jsonb_build_object('line_id',current_setting('app.b'),'row_version',4),
  jsonb_build_object('line_id',current_setting('app.c'),'row_version',4),
  jsonb_build_object('line_id',current_setting('app.d'),'row_version',2),
  jsonb_build_object('line_id',current_setting('app.e'),'row_version',2)))::text, true);
reset role;
set local role service_role;
select is((select count(*)::int from integrations.esb_push_groups where source_module = 'cafe_count'), 1,
  'AC-029 one confirmation creates one group for its stream and date');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 3,
  'AC-029 three non-zero lines are group members and both zero-variance lines are omitted');
select ok((select count(distinct push_group_id)::int = 1 and count(distinct target_env)::int = 1
                  and count(distinct dedup_key)::int = 3
             from integrations.esb_push where source_module = 'cafe_count'),
  'AC-029 members share their group and environment and have unique line/environment keys');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'
            and payload ? 'mos_key' and payload ? 'variance' and payload ? 'item_unit_id'), 3,
  'AC-029 every member carries the stable MOS key, stock unit and signed variance');
select is((select count(*)::int from ops.cafe_count_lines where id in (current_setting('app.a')::uuid,
  current_setting('app.b')::uuid,current_setting('app.c')::uuid) and posting_status = 'queued'), 3,
  'AC-029 the non-zero confirmed lines show queued');
select is((select count(*)::int from ops.cafe_count_lines where id in (current_setting('app.d')::uuid,
  current_setting('app.e')::uuid) and posting_status = 'not_needed'), 2,
  'AC-029 zero-variance confirmations are closed as not needed');
select is((select count(*)::int from jsonb_array_elements(current_setting('app.confirmed')::jsonb) as outcomes(value)
            where value ->> 'posting_status' = 'queued'), 3,
  'AC-029 the confirmation response reports the queued state');
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is(ops.confirm_cafe_count_lines(jsonb_build_array(
  jsonb_build_object('line_id',current_setting('app.a'),'row_version',4))) -> 0 ->> 'reason',
  'CAFE_COUNT_NOT_SUBMITTED', 'AC-029 repeated confirmation is refused because the line is no longer Submitted');
reset role;
set local role service_role;
select is((select count(*)::int from integrations.esb_push_groups where source_module = 'cafe_count'), 1,
  'AC-029 the idempotent repeat leaves the one group unchanged');

update integrations.esb_push_groups set status = 'in_flight', posting_stage = 'awaiting_authorization', esb_doc_num = 'IJ-TEST-1'
 where source_module = 'cafe_count' and status = 'pending';
select is((select count(*)::int from ops.cafe_count_lines where id in (current_setting('app.a')::uuid,
  current_setting('app.b')::uuid,current_setting('app.c')::uuid) and posting_status = 'awaiting_authorization'), 3,
  'AC-032 the group write-back shows created-awaiting-authorization on each line');
select integrations.claim_esb_pushes(array(select id from integrations.esb_push where source_module = 'cafe_count'));
update integrations.esb_push set status = 'posted', esb_doc_num = 'IJ-TEST-1', posted_at = now()
 where source_module = 'cafe_count' and status = 'in_flight';
update integrations.esb_push_groups set status = 'posted', posting_stage = null, posted_at = now()
 where source_module = 'cafe_count' and status = 'in_flight';
select is((select count(*)::int from ops.cafe_count_lines where id in (current_setting('app.a')::uuid,
  current_setting('app.b')::uuid,current_setting('app.c')::uuid) and posting_status = 'posted'), 3,
  'AC-032 authorized group write-back marks every member posted');
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_count_posting_queue()), 0,
  'NFR-006 the floor cannot read reviewer count-posting figures or errors');
select throws_ok($$select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  '42501', 'CAFE_COUNT_POSTING_ADMIN_ONLY', 'FR-031 a floor member cannot enable count posting');
select throws_ok($$select ops.list_cafe_count_posting_switches()$$,
  '42501', 'CAFE_COUNT_POSTING_ADMIN_ONLY', 'FR-031 the posting switch reader is admin only');
select throws_ok($$select ops.release_cafe_count_posting('00000000-0000-0000-0000-00000000bf01')$$,
  '42501', 'CAFE_COUNT_POSTING_RELEASE_FORBIDDEN', 'AC-034 a floor member cannot release held counts');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01', false)$$,
  '42501', 'CAFE_COUNT_POSTING_ADMIN_ONLY', 'FR-031 an ops lead cannot change the admin switch');
select set_config('app.release_result', ops.release_cafe_count_posting('00000000-0000-0000-0000-00000000bf01')::text, true);
select is(current_setting('app.release_result')::jsonb ->> 'released_lines', '1',
  'AC-034 release enqueues the line whose branch/date Expected snapshot is still current');
select is(current_setting('app.release_result')::jsonb ->> 'expected_out_of_date_lines', '2',
  'AC-034 a later ERP document and an approved waste log without a document both remain held');
select is((select count(*)::int from ops.cafe_count_lines where id in (current_setting('app.f')::uuid,
  current_setting('app.g')::uuid) and posting_status = 'held'), 2,
  'AC-034 stale lines remain held rather than being posted against old Expected figures');
select is((select count(*)::int from ops.cafe_count_posting_queue() where expected_out_of_date), 2,
  'AC-034 reviewers can distinguish held lines labelled expected out of date');
select set_config('app.release_again', ops.release_cafe_count_posting('00000000-0000-0000-0000-00000000bf01')::text, true);
select is(current_setting('app.release_again')::jsonb ->> 'released_lines', '0',
  'AC-034 rerunning release does not enqueue a line twice');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 4,
  'AC-034 the rerun leaves one release member and the original three members');
select ok(not has_table_privilege('authenticated', 'integrations.esb_push', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_count_lines', 'UPDATE'),
  'NFR-006 the browser cannot write count posting or outbox state directly');

-- A sample org with an enabled switch still cannot mint a count group or an outbox row.
reset role;
update shared.people set email = 'count-' || id::text || '@sample.gordi.test'
 where org_id = '00000000-0000-0000-0000-0000000000a1';
update shared.orgs set name = 'Gordi Sample' where id = '00000000-0000-0000-0000-0000000000a1';
update shared.orgs set is_sample = true where id = '00000000-0000-0000-0000-0000000000a1';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select set_config('app.sample_line', pg_temp.submit_count('F', 'f1373000-0000-0000-0000-000000000012', '2', current_date,
  '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}')::text, true);
reset role;
set local role service_role;
select ops.record_cafe_count_expected_balance(current_setting('app.sample_line')::uuid, 1);
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.record_cafe_count_recount(current_setting('app.sample_line')::uuid, 2);
select ops.record_cafe_count_reason(current_setting('app.sample_line')::uuid, 'checked');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.confirm_cafe_count_line(current_setting('app.sample_line')::uuid, 4);
reset role;
set local role service_role;
select is((select posting_status from ops.cafe_count_lines where id = current_setting('app.sample_line')::uuid), 'held',
  'NFR-006 a sample-org confirmation stays held even when the branch switch is on');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 4,
  'NFR-006 a sample-org Count never adds a member to the guarded outbox');

reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a2","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_count_posting_queue()), 0,
  'NFR-006 another organization cannot read count posting state');

select * from finish();
rollback;
