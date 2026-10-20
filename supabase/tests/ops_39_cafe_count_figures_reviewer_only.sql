-- #1368 — Count figures are readable only by reviewers: the floor and other streams get no Expected
-- balance or Variance by any route (table, history, functions); recount and reason stay in the stream.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1368-BLIND","esb_product_detail_id":"SYNTH-ERP-PD-1368-BLIND","name":"Blind item","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select ops.refresh_cafe_stream_items('[{"esb_product_id":"SYNTH-ERP-P-1368-BLIND","branch_code":"gordi_hq"}]');
select set_config('app.allow_test_seeds', 'off', true);
update ops.item_units set confirmed_at = now() where esb_product_id = 'SYNTH-ERP-P-1368-BLIND';
-- d5 kitchen member (floor), d4 kitchen supervisor, d6 bar supervisor (another stream), d2 ops lead.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d6'::uuid, 'gordi_hq_bar')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', w.id, w.name, u.id, array[u.id], 'RAW', true)
  from ops.wip_items w join ops.item_units u on u.wip_item_id = w.id
 where w.esb_product_id = 'SYNTH-ERP-P-1368-BLIND';
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.line', (ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen', jsonb_build_array(jsonb_build_object(
  'client_key', 'f1368000-0000-0000-0000-0000000000b1',
  'item_id', (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1368-BLIND'), 'quantity', '12'))) -> 0 ->> 'line_id'), true);
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role","org_id":"00000000-0000-0000-0000-0000000000a1"}';
select ops.record_cafe_count_expected_balance(current_setting('app.line')::uuid, 15);
reset role;
set local role authenticated;

-- The browser role holds no read on the figure columns.
select ok(not has_column_privilege('authenticated', 'ops.cafe_count_lines', 'expected_balance', 'SELECT')
          and not has_column_privilege('authenticated', 'ops.cafe_count_lines', 'variance', 'SELECT'),
  'blind: the browser role cannot read the Expected balance or Variance columns');
select ok(has_column_privilege('authenticated', 'ops.cafe_count_lines', 'counted_quantity', 'SELECT')
          and has_column_privilege('authenticated', 'ops.cafe_count_lines', 'expected_status', 'SELECT'),
  'blind: the floor still reads its own count and whether the system check is ready');

-- A floor member: table reads of the figures are refused.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select expected_balance from ops.cafe_count_lines$$, '42501', null,
  'blind: a floor member cannot select the Expected balance from the table');
select throws_ok($$select variance from ops.cafe_count_lines$$, '42501', null,
  'blind: a floor member cannot select the Variance from the table');
select throws_ok($$select * from ops.cafe_count_lines$$, '42501', null,
  'blind: a floor member cannot select every column at once');
select throws_ok($$select id from ops.cafe_count_lines where variance < 0$$, '42501', null,
  'blind: a floor member cannot filter on the Variance to learn its direction');
select is((select count(*)::int from ops.cafe_count_review_figures(array[current_setting('app.line')::uuid])), 0,
  'blind: the reviewer figures read returns nothing to a floor member');
select is((select state from ops.cafe_count_floor_lines('00000000-0000-0000-0000-00000000bf01', 'kitchen', (now() at time zone 'Asia/Jakarta')::date)
            where id = current_setting('app.line')::uuid), 'needs_recount',
  'blind: the floor reads only the state word for its line');
select ok(position('expected' in pg_get_function_result('ops.cafe_count_floor_lines(uuid,text,date)'::regprocedure)) = 0
          and position('variance' in pg_get_function_result('ops.cafe_count_floor_lines(uuid,text,date)'::regprocedure)) = 0,
  'blind: the floor read returns no figure column');
select is((select count(*)::int from shared.record_history
            where schema_name = 'ops' and table_name = 'cafe_count_lines' and record_key = current_setting('app.line')
              and field_name in ('expected_balance', 'variance')
              and (old_value is not null or new_value is not null)), 0,
  'blind: record history holds no Expected balance or Variance value');
select ok(exists (select 1 from shared.record_history
                   where schema_name = 'ops' and table_name = 'cafe_count_lines' and record_key = current_setting('app.line')
                     and field_name = 'expected_balance'),
  'blind: record history still says the Expected balance changed');

-- A supervisor of another stream gets nothing either, and cannot recount there.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select throws_ok($$select expected_balance from ops.cafe_count_lines$$, '42501', null,
  'blind: a supervisor of another stream cannot select the Expected balance');
select is((select count(*)::int from ops.cafe_count_review_figures(array[current_setting('app.line')::uuid])), 0,
  'blind: the reviewer figures read returns nothing to a supervisor of another stream');
select throws_ok($$select ops.record_cafe_count_recount(current_setting('app.line')::uuid, 15)$$,
  '42501', 'CAFE_COUNT_STREAM_FORBIDDEN', 'a member of another stream cannot recount the line');
select throws_ok($$select ops.record_cafe_count_reason(current_setting('app.line')::uuid, 'not mine')$$,
  '42501', 'CAFE_COUNT_STREAM_FORBIDDEN', 'a member of another stream cannot give the reason');

-- The line's own reviewer and an ops lead read the figures.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ok((select expected_balance = 15 and variance = -3 from ops.cafe_count_review_figures(array[current_setting('app.line')::uuid])),
  'the stream reviewer reads the Expected balance and Variance');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((select count(*)::int from ops.cafe_count_review_figures(array[current_setting('app.line')::uuid])), 1,
  'an ops lead reads the figures of any stream');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_count_review_figures(array[current_setting('app.line')::uuid])), 0,
  'NFR-001 an admin of another organisation reads no figures');
select ok(not has_function_privilege('anon', 'ops.cafe_count_review_figures(uuid[])', 'EXECUTE')
          and not has_function_privilege('anon', 'ops.cafe_count_floor_lines(uuid,text,date)', 'EXECUTE'),
  'NFR-001 anonymous callers cannot read count lines through either function');

select * from finish();
rollback;
