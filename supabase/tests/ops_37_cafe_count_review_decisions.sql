-- #1369 — Count review decisions: self-approval rule, stream scope, reject with a note, bulk confirm.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1369-A","esb_product_detail_id":"SYNTH-ERP-PD-1369-A","name":"Review item A","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1369-B","esb_product_detail_id":"SYNTH-ERP-PD-1369-B","name":"Review item B","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1369-C","esb_product_detail_id":"SYNTH-ERP-PD-1369-C","name":"Review item C","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1369-D","esb_product_detail_id":"SYNTH-ERP-PD-1369-D","name":"Review item D","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1369-E","esb_product_detail_id":"SYNTH-ERP-PD-1369-E","name":"Review item E","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ERP-P-1369-%';

-- Personas (Gordi HQ bf01): d4 kitchen supervisor, d6 bar supervisor, d5 kitchen member, d2 ops lead, d3 admin.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d6'::uuid, 'gordi_hq_bar')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

create function pg_temp.submit_as(p_claims text, p_code text, p_key uuid, p_qty text) returns uuid
language plpgsql as $$
begin
  perform shared._test_set_access_roles(p_claims);
  return (ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen', jsonb_build_array(jsonb_build_object(
    'client_key', p_key, 'item_id', (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1369-' || p_code),
    'quantity', p_qty))) -> 0 ->> 'line_id')::uuid;
end;
$$;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', w.id, w.name, u.id, array[u.id], 'RAW', true)
  from ops.wip_items w join ops.item_units u on u.wip_item_id = w.id
 where w.esb_product_id like 'SYNTH-ERP-P-1369-%';

-- A: counted by the kitchen supervisor. B: counted by the member, recounted by the supervisor.
-- C: counted by the ops lead. D and E: counted by the member, zero Variance.
select set_config('app.a', pg_temp.submit_as('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}', 'A', 'f1369000-0000-0000-0000-00000000000a', '2')::text, true);
select set_config('app.b', pg_temp.submit_as('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}', 'B', 'f1369000-0000-0000-0000-00000000000b', '3')::text, true);
select set_config('app.c', pg_temp.submit_as('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}', 'C', 'f1369000-0000-0000-0000-00000000000c', '4')::text, true);
select set_config('app.d', pg_temp.submit_as('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}', 'D', 'f1369000-0000-0000-0000-00000000000d', '5')::text, true);
select set_config('app.e', pg_temp.submit_as('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}', 'E', 'f1369000-0000-0000-0000-00000000000e', '6')::text, true);

reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1"}';
select ops.record_cafe_count_expected_balance(current_setting('app.a')::uuid, 2);
select ops.record_cafe_count_expected_balance(current_setting('app.b')::uuid, 4);
select ops.record_cafe_count_expected_balance(current_setting('app.c')::uuid, 4);
select ops.record_cafe_count_expected_balance(current_setting('app.d')::uuid, 5);
select ops.record_cafe_count_expected_balance(current_setting('app.e')::uuid, 6);
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.record_cafe_count_recount(current_setting('app.b')::uuid, 4);

-- AC-023 the submitter or recounter who holds only a stream-supervisor role is refused.
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.a')::uuid, 2)$$,
  '42501', 'CAFE_COUNT_SELF_APPROVAL', 'AC-023 a supervisor cannot confirm the line they counted');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.b')::uuid, 3)$$,
  '42501', 'CAFE_COUNT_SELF_APPROVAL', 'AC-023 a supervisor cannot confirm the line they recounted');
-- AC-023 a supervisor of another stream is refused.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.a')::uuid, 2)$$,
  '42501', 'CAFE_COUNT_REVIEW_FORBIDDEN', 'AC-023 a supervisor of another stream is refused');
select throws_ok($$select ops.reject_cafe_count_line(current_setting('app.a')::uuid, 2, 'wrong')$$,
  '42501', 'CAFE_COUNT_REVIEW_FORBIDDEN', 'AC-024 a supervisor of another stream cannot reject');
-- OD-2026-10-06-ERP-MIN default: an ops lead who counted the line is refused too (no self-approval fallback).
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.c')::uuid, 2)$$,
  '42501', 'CAFE_COUNT_SELF_APPROVAL', 'AC-023 an ops lead who counted the line does not approve it alone');
-- A second person approves: the ops lead confirms the supervisor's lines.
select is(ops.confirm_cafe_count_line(current_setting('app.a')::uuid, 2) ->> 'status', 'Confirmed',
  'AC-023 an ops lead confirms a line someone else counted');
select is(ops.confirm_cafe_count_line(current_setting('app.b')::uuid, 3) ->> 'posting_status', 'not_needed',
  'AC-023 an ops lead confirms a line someone else recounted');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is(ops.confirm_cafe_count_line(current_setting('app.c')::uuid, 2) ->> 'status', 'Confirmed',
  'AC-023 an admin confirms the line the ops lead counted');

-- FR-027 chosen lines in one action, each with its own version token; one refusal never blocks another.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select set_config('app.bulk', ops.confirm_cafe_count_lines(jsonb_build_array(
  jsonb_build_object('line_id', current_setting('app.d'), 'row_version', 2),
  jsonb_build_object('line_id', current_setting('app.e'), 'row_version', 1),
  jsonb_build_object('line_id', current_setting('app.a'), 'row_version', 3),
  jsonb_build_object('line_id', 'not-a-line', 'row_version', 1)
))::text, true);
select is(current_setting('app.bulk')::jsonb -> 0 ->> 'outcome', 'confirmed', 'FR-027 a current zero-Variance line is confirmed in the batch');
select is(current_setting('app.bulk')::jsonb -> 1 ->> 'reason', 'CAFE_COUNT_VERSION_STALE', 'FR-027 a stale token refuses only its own line');
select is(current_setting('app.bulk')::jsonb -> 2 ->> 'reason', 'CAFE_COUNT_SELF_APPROVAL', 'AC-023 the batch applies the self-approval rule per line');
select is(current_setting('app.bulk')::jsonb -> 3 ->> 'reason', 'CAFE_COUNT_LINE_INVALID', 'FR-027 a malformed entry is refused, not fatal');
select ok((select status = 'Confirmed' from ops.cafe_count_lines where id = current_setting('app.d')::uuid)
          and (select status = 'Submitted' from ops.cafe_count_lines where id = current_setting('app.e')::uuid),
  'FR-027 the batch stores each line''s own outcome');
select throws_ok($$select ops.confirm_cafe_count_lines((select jsonb_agg(jsonb_build_object('line_id', gen_random_uuid(), 'row_version', 1)) from generate_series(1, 201)))$$,
  '22023', null, 'FR-027 a batch over 200 lines is refused');

-- AC-024 reject: a note is required; with a note the line is Rejected, frozen, and frees the item.
select throws_ok($$select ops.reject_cafe_count_line(current_setting('app.e')::uuid, 2, '   ')$$,
  '22023', 'CAFE_COUNT_REJECT_NOTE_REQUIRED', 'AC-024 a reject without a note is refused');
select ok((select status = 'Submitted' from ops.cafe_count_lines where id = current_setting('app.e')::uuid),
  'AC-024 the refused reject leaves the line Submitted');
select throws_ok($$select ops.reject_cafe_count_line(current_setting('app.e')::uuid, 1, 'Typed 6, the shelf holds 60')$$,
  'P0019', 'CAFE_COUNT_VERSION_STALE', 'AC-024 a reject needs the current version');
select is(ops.reject_cafe_count_line(current_setting('app.e')::uuid, 2, '  Typed 6, the shelf holds 60 ') ->> 'status', 'Rejected',
  'AC-024 a reject with a note is stored');
select ok((select status = 'Rejected' and review_note = 'Typed 6, the shelf holds 60' and counted_quantity = 6
                  and reviewed_by = '00000000-0000-0000-0000-0000000000d4' and posting_status = 'not_posted'
             from ops.cafe_count_lines where id = current_setting('app.e')::uuid),
  'AC-024 the note and reviewer are stored and no figure changes');
select throws_ok($$select ops.confirm_cafe_count_line(current_setting('app.e')::uuid, 3)$$,
  'P0018', 'CAFE_COUNT_NOT_SUBMITTED', 'AC-024 a Rejected line is frozen against review');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.e')::uuid, 'late')$$,
  'P0018', 'CAFE_COUNT_LINE_NOT_SUBMITTED', 'AC-024 a Rejected line is frozen against the floor');
select is(ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen', jsonb_build_array(jsonb_build_object(
    'client_key', 'f1369000-0000-0000-0000-0000000000e2',
    'item_id', (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1369-E'), 'quantity', '60'))) -> 0 ->> 'outcome',
  'submitted', 'AC-006 after a Rejected first line the counter enters the item again as a new line');
select ok(not has_function_privilege('anon', 'ops.reject_cafe_count_line(uuid,integer,text)', 'EXECUTE')
          and not has_function_privilege('anon', 'ops.confirm_cafe_count_lines(jsonb)', 'EXECUTE'),
  'NFR-001 anonymous callers cannot decide Count lines');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_count'), 0,
  'FR-031 review decisions write nothing to the outbox');

select * from finish();
rollback;
