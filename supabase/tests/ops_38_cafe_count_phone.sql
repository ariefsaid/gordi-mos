-- #1370 — Count date rule, a manager multiple stored in the default unit, and the excluded-items read.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ERP-P-1370-A","esb_product_detail_id":"SYNTH-ERP-PD-1370-A","name":"Phone item A","category":"KITCHEN","unit_name":"batch","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1370-B","esb_product_detail_id":"SYNTH-ERP-PD-1370-B","name":"Phone item B","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ERP-P-1370-X","esb_product_detail_id":"SYNTH-ERP-PD-1370-X","name":"Phone non-stock item","category":"KITCHEN","unit_name":"case","erp_category_type_name":"Inventory","is_stock":false,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ERP-P-1370-%';
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
 where w.esb_product_id like 'SYNTH-ERP-P-1370-%';
reset role;
update ops.cafe_item_settings set unit_multiples = array[0.5]::numeric[]
 where wip_item_id = (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1370-A');
set local role authenticated;

create function pg_temp.line(p_key text, p_code text, p_qty text, p_factor text default null) returns jsonb
language sql as $$
  select jsonb_strip_nulls(jsonb_build_object('client_key', p_key,
    'item_id', (select id from ops.wip_items where esb_product_id = 'SYNTH-ERP-P-1370-' || p_code),
    'quantity', p_qty, 'unit_factor', p_factor))
$$;
select set_config('app.today', ((now() at time zone 'Asia/Jakarta')::date)::text, true);

-- AC-002 the date rule, as a café member.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is(ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(pg_temp.line('f1370000-0000-0000-0000-000000000001', 'B', '1')), current_setting('app.today')::date - 1) -> 0 ->> 'outcome',
  'submitted', 'AC-002 a café member counts yesterday');
select ok((select count_date = current_setting('app.today')::date - 1 from ops.cafe_count_lines where client_key = 'f1370000-0000-0000-0000-000000000001'),
  'AC-002 the line is stored on the chosen date');
select is(ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(pg_temp.line('f1370000-0000-0000-0000-000000000002', 'B', '1'))) -> 0 ->> 'outcome',
  'submitted', 'AC-002 with no date the count is for today, and today is a separate day from yesterday');
select throws_ok($$select ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(pg_temp.line('f1370000-0000-0000-0000-000000000003', 'A', '1')), current_setting('app.today')::date + 1)$$,
  '23514', 'CAFE_COUNT_DATE_FUTURE', 'AC-002 a future date is refused');
select throws_ok($$select ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(pg_temp.line('f1370000-0000-0000-0000-000000000003', 'A', '1')), current_setting('app.today')::date - 2)$$,
  '23514', 'CAFE_COUNT_DATE_TOO_OLD', 'AC-002 two days back is refused for a café member');

-- AC-008 a manager multiple: typed 3 at 0.5 batch stores 1.5 batch with the multiple kept.
select is(ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(pg_temp.line('f1370000-0000-0000-0000-000000000004', 'A', '3', '0.5'))) -> 0 ->> 'outcome',
  'submitted', 'AC-008 a count typed in a manager multiple is accepted');
select ok((select counted_quantity = 1.5 and entry_quantity = 3 and entry_unit_factor = 0.5 and unit_name = 'batch'
             from ops.cafe_count_lines where client_key = 'f1370000-0000-0000-0000-000000000004'),
  'AC-008 the stored count is in the default unit, with the typed quantity and factor alongside');
select is(ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(pg_temp.line('f1370000-0000-0000-0000-000000000005', 'B', '3', '0.25'))) -> 0 ->> 'reason',
  'invalid_unit', 'AC-008 a factor the manager did not define is refused');

-- AC-002 an ops lead may count an earlier past date.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is(ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(pg_temp.line('f1370000-0000-0000-0000-000000000006', 'B', '2')), current_setting('app.today')::date - 5) -> 0 ->> 'outcome',
  'submitted', 'AC-002 an ops lead counts an earlier past date');
select throws_ok($$select ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(pg_temp.line('f1370000-0000-0000-0000-000000000007', 'B', '2')), current_setting('app.today')::date + 1)$$,
  '23514', 'CAFE_COUNT_DATE_FUTURE', 'AC-002 not even an ops lead counts a future date');

-- FR-005 the excluded items read: the stream reviewer sees them, a floor member and another stream do not.
select ok(exists (select 1 from ops.cafe_count_excluded_items('00000000-0000-0000-0000-00000000bf01', 'kitchen') where item_name = 'Phone non-stock item')
          and not exists (select 1 from ops.cafe_count_excluded_items('00000000-0000-0000-0000-00000000bf01', 'kitchen') where item_name like 'Phone item%'),
  'FR-005 an ops lead sees exactly the items Count does not offer');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ok(exists (select 1 from ops.cafe_count_excluded_items('00000000-0000-0000-0000-00000000bf01', 'kitchen') where item_name = 'Phone non-stock item'),
  'FR-005 the stream supervisor sees the excluded items');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select * from ops.cafe_count_excluded_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')$$,
  '42501', 'CAFE_COUNT_REVIEW_FORBIDDEN', 'FR-005 a floor member is refused the excluded list');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select throws_ok($$select * from ops.cafe_count_excluded_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')$$,
  '42501', 'CAFE_COUNT_REVIEW_FORBIDDEN', 'FR-005 a supervisor of another stream is refused');

select * from finish();
rollback;
