-- #1422 — blind Café goods receipt: Count submit lock, receiving location, review, freeze, org seam.
begin;
create extension if not exists pgtap with schema extensions;
create function pg_temp.try_rename_cafe_receipt_photo() returns integer
language plpgsql set search_path = '' as $$
declare v_rows integer;
begin
  update storage.objects set name = name || '.moved'
   where bucket_id = 'cafe-receipt-photos'
     and name like current_setting('app.r1_photo_prefix') || '/%';
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

select plan(89);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1422-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1422-BEAN-KG","name":"Receipt coffee bean","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1422-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1422-BEAN-BAG","name":"Receipt coffee bean","category":"KITCHEN","unit_name":"bag","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1422-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1422-MILK","name":"Receipt milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1422-UNCONF","esb_product_detail_id":"SYNTH-ESB-PD-1422-UNCONF","name":"Receipt unconfirmed item","category":"KITCHEN","unit_name":"box","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1422-OFF","esb_product_detail_id":"SYNTH-ESB-PD-1422-OFF","name":"Receipt inactive unit item","category":"KITCHEN","unit_name":"case","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);

select set_config('app.bean_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1422-BEAN'), true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1422-MILK'), true);
select set_config('app.unconf_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1422-UNCONF'), true);
select set_config('app.off_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1422-OFF'), true);
select set_config('app.bean_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1422-BEAN-KG'), true);
select set_config('app.bean_bag', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1422-BEAN-BAG'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1422-MILK'), true);
select set_config('app.unconf_box', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1422-UNCONF'), true);
select set_config('app.off_case', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1422-OFF'), true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ESB-P-1422-%';

-- Personas. Every stream below is in Gordi HQ (bf01): kitchen and bar.
--   d5 shift member of the kitchen; d4 kitchen stream supervisor; d6 bar stream supervisor;
--   d2 and d7 ops leads; d3 and d1 admins.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d6'::uuid, 'gordi_hq_bar')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.bean_id')::uuid,
  'Receipt coffee bean', current_setting('app.bean_kg')::uuid,
  array[current_setting('app.bean_kg')::uuid, current_setting('app.bean_bag')::uuid], 'RAW', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'Receipt milk', current_setting('app.milk_l')::uuid,
  array[current_setting('app.milk_l')::uuid], 'RAW', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.unconf_id')::uuid,
  'Receipt unconfirmed item', current_setting('app.unconf_box')::uuid,
  array[current_setting('app.unconf_box')::uuid], 'RAW', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.off_id')::uuid,
  'Receipt inactive unit item', current_setting('app.off_case')::uuid,
  array[current_setting('app.off_case')::uuid], 'RAW', true);
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01',
        'bar', current_setting('app.milk_id')::uuid, 'manual')
on conflict (org_id, branch_id, activity, wip_item_id) do nothing;
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'bar', current_setting('app.milk_id')::uuid,
  'Receipt milk', current_setting('app.milk_l')::uuid,
  array[current_setting('app.milk_l')::uuid], 'RAW', true);
reset role;
update ops.item_units set confirmed_at = null where id = current_setting('app.unconf_box')::uuid;
update ops.item_units set source_active = false, is_default = false where id = current_setting('app.off_case')::uuid;

-- Baselines for AC-1039, captured before any receipt exists.
select set_config('app.count_lines_before', (select count(*)::text from ops.cafe_count_lines), true);
select set_config('app.stock_before', coalesce((
  select jsonb_agg(to_jsonb(s) order by s::text)::text
    from ops.kitchen_stock_for_date((now() at time zone 'Asia/Jakarta')::date,
                                    '00000000-0000-0000-0000-00000000bf01', 'kitchen') s), '[]'), true);
select set_config('app.outbox_before', (select count(*)::text from integrations.esb_push), true);

-- ── Shape and the org seam ───────────────────────────────────────────────────────────────────
select ok((select bool_and(c.relrowsecurity and c.relforcerowsecurity)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops'
              and c.relname in ('cafe_receipts', 'cafe_receipt_lines', 'cafe_receiving_locations')
           having count(*) = 3),
          'NFR-1001 receipts, receipt lines and receiving locations force RLS');
select ok(not has_table_privilege('authenticated', 'ops.cafe_receipts', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_receipts', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_receipts', 'DELETE')
          and not has_table_privilege('authenticated', 'ops.cafe_receipt_lines', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_receipt_lines', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_receipt_lines', 'DELETE')
          and not has_table_privilege('authenticated', 'ops.cafe_receiving_locations', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_receiving_locations', 'UPDATE'),
          'NFR-1001 browsers write receipts and locations only through the server functions');

-- ── FR-1043 receiving location is admin-only configuration ───────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf01', 'main_store')$$,
  '42501', null, 'FR-1043 an ops lead cannot set a branch receiving location');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select lives_ok($$select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf01', 'main_store')$$,
  'FR-1043 an admin sets the branch receiving location');
select throws_ok($$select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf09', 'main_store')$$,
  '22023', null, 'FR-1043 an admin cannot configure another organisation''s branch');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select location_key from ops.cafe_receiving_locations
            where branch_id = '00000000-0000-0000-0000-00000000bf01'),
          'main_store', 'NFR-1001 a same-organisation member reads the branch receiving location');

-- ── FR-1006 receivable items ─────────────────────────────────────────────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select array_agg(unit_name order by unit_name)
             from ops.cafe_receivable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')
            where item_id = current_setting('app.bean_id')::uuid),
          array['bag', 'kg'], 'FR-1007 both active confirmed ESB units of the bean are receivable');
select is((select unit_name from ops.cafe_receivable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')
            where item_id = current_setting('app.bean_id')::uuid and is_default_unit),
          'kg', 'FR-1007 the stream default unit is the one marked default');
select ok(not exists (select 1 from ops.cafe_receivable_items('00000000-0000-0000-0000-00000000bf01', 'kitchen')
                       where item_id in (current_setting('app.unconf_id')::uuid, current_setting('app.off_id')::uuid)),
          'FR-1006 unconfirmed and inactive product details are not offered');

-- ── AC-1004 a line for an unconfirmed or inactive detail is refused ──────────────────────────
select throws_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-0000000000a1', '[{"item_unit_id":"%s","quantity":"2"}]'::jsonb)$$,
  current_setting('app.unconf_box')), '23514', null,
  'AC-1004 a line for an unconfirmed product detail is refused');
select throws_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-0000000000a2', '[{"item_unit_id":"%s","quantity":"2"}]'::jsonb)$$,
  current_setting('app.off_case')), '23514', null,
  'AC-1004 a line for an inactive product detail is refused');
select is((select count(*)::int from ops.cafe_receipts), 0,
          'AC-1004 a refused line leaves no partial receipt behind');

-- ── AC-1007 / AC-1009 Count submit stamps the server fields and resolves the location ────────
select set_config('app.r1', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_bag'), 'quantity', '2,5',
      'org_id', '00000000-0000-0000-0000-0000000000b1', 'received_by', '00000000-0000-0000-0000-0000000000d3',
      'status', 'Approved', 'source', 'esb', 'receiving_location_key', 'client_pick',
      'item_name', 'Client renamed', 'unit_name', 'tonne'),
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '12')))::text, true);
select set_config('app.r1_id', current_setting('app.r1')::jsonb ->> 'receipt_id', true);
select is(current_setting('app.r1')::jsonb ->> 'outcome', 'created', 'AC-1007 the first Count submit creates the receipt');
select ok((select org_id = '00000000-0000-0000-0000-0000000000a1'
                  and received_by = '00000000-0000-0000-0000-0000000000d5'
                  and source = 'mos' and status = 'Counted' and row_version = 1
                  and arrival_date = (received_at at time zone 'Asia/Jakarta')::date
                  and reviewed_by is null and submitted_at is null
             from ops.cafe_receipts where id = current_setting('app.r1_id')::uuid),
          'AC-1007 organisation, receiver, source, status, time and today''s WIB arrival date are server-stamped');
select ok((select bool_and(org_id = '00000000-0000-0000-0000-0000000000a1')
                  and bool_or(item_unit_id = current_setting('app.bean_bag')::uuid and unit_name = 'bag'
                              and item_name = 'Receipt coffee bean' and received_quantity = 2.5)
             from ops.cafe_receipt_lines where receipt_id = current_setting('app.r1_id')::uuid),
          'FR-1007 the stored line keeps the chosen product detail and typed quantity unconverted; names come from the server');
select ok((select receiving_location_key = 'main_store' and posting_status = 'not_posted' and posting_hold_reason is null
             from ops.cafe_receipts where id = current_setting('app.r1_id')::uuid),
          'AC-1009 the location resolves from the branch and the client-supplied location is ignored');
select set_config('app.r1_retry', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '12'),
    jsonb_build_object('item_unit_id', current_setting('app.bean_bag'), 'quantity', '2.5')))::text, true);
select is(current_setting('app.r1_retry')::jsonb ->> 'outcome', 'existing', 'AC-1007 a repeated Count submit with key K returns the existing receipt');
select is(current_setting('app.r1_retry')::jsonb ->> 'receipt_id', current_setting('app.r1_id'),
          'AC-1007 the repeat names the original receipt');
select is((select count(*)::int from ops.cafe_receipts where client_key = 'f1422000-0000-0000-0000-000000000001'), 1,
          'AC-1007 no second receipt exists for key K');
select throws_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-000000000001', '[{"item_unit_id":"%s","quantity":"9"}]'::jsonb)$$,
  current_setting('app.milk_l')), '23505', null, 'AC-1007 key K with different lines is a conflict, never a second receipt');
select throws_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-0000000000a3', '[{"item_unit_id":"%s","quantity":"0"}]'::jsonb)$$,
  current_setting('app.milk_l')), '22023', null, 'FR-1008 a zero quantity is not a received line');
select throws_ok($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-0000000000a4', '[]'::jsonb)$$,
  '22023', null, 'FR-1008 a receipt needs at least one line');

-- ── AC-1002 arrival date window ──────────────────────────────────────────────────────────────
select lives_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (now() at time zone 'Asia/Jakarta')::date - 1,
  'f1422000-0000-0000-0000-0000000000b1', '[{"item_unit_id":"%s","quantity":"1"}]'::jsonb)$$,
  current_setting('app.milk_l')), 'AC-1002 a shift member may receive dated yesterday');
select throws_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (now() at time zone 'Asia/Jakarta')::date + 1,
  'f1422000-0000-0000-0000-0000000000b2', '[{"item_unit_id":"%s","quantity":"1"}]'::jsonb)$$,
  current_setting('app.milk_l')), '23514', null, 'AC-1002 a future arrival date is refused');
select throws_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (now() at time zone 'Asia/Jakarta')::date - 2,
  'f1422000-0000-0000-0000-0000000000b3', '[{"item_unit_id":"%s","quantity":"1"}]'::jsonb)$$,
  current_setting('app.milk_l')), '23514', null, 'AC-1002 a shift member cannot date a receipt two days back');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (now() at time zone 'Asia/Jakarta')::date - 9,
  'f1422000-0000-0000-0000-0000000000b4', '[{"item_unit_id":"%s","quantity":"1"}]'::jsonb)$$,
  current_setting('app.milk_l')), 'AC-1002 an ops lead may use an earlier past date');
select throws_ok(format($$select ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (now() at time zone 'Asia/Jakarta')::date + 1,
  'f1422000-0000-0000-0000-0000000000b5', '[{"item_unit_id":"%s","quantity":"1"}]'::jsonb)$$,
  current_setting('app.milk_l')), '23514', null, 'AC-1002 an ops lead still cannot use a future date');

-- ── AC-1009 a branch without a receiving location: accepted, posting held with a reason ──────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf01', null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r_held', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-0000000000c1',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '3')))::text, true);
select ok((select status = 'Counted' and receiving_location_key is null
                  and posting_status = 'held' and posting_hold_reason = 'receiving_location_missing'
             from ops.cafe_receipts where id = (current_setting('app.r_held')::jsonb ->> 'receipt_id')::uuid),
          'AC-1009 with no location the receipt is accepted and its posting is held with a reason');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf01', 'main_store');

-- ── AC-1008 a Counted receipt's lines are locked; its explanation can still be added ─────────
reset role;
select set_config('request.jwt.claims', '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5"}', true);
select throws_ok($$update ops.cafe_receipt_lines set received_quantity = 99
  where receipt_id = current_setting('app.r1_id')::uuid$$,
  '42501', null, 'AC-1008 a Counted line quantity cannot be changed, even by the table owner');
select throws_ok(format($$update ops.cafe_receipt_lines set item_unit_id = '%s'
  where receipt_id = current_setting('app.r1_id')::uuid and item_unit_id = '%s'$$,
  current_setting('app.bean_kg'), current_setting('app.bean_bag')),
  '42501', null, 'AC-1008 a Counted line item cannot be changed');
select throws_ok(format($$insert into ops.cafe_receipt_lines (org_id, receipt_id, wip_item_id, item_unit_id, received_quantity)
  values ('00000000-0000-0000-0000-0000000000a1', '%s', '%s', '%s', 1)$$,
  current_setting('app.r1_id'), current_setting('app.bean_id'), current_setting('app.bean_kg')),
  '42501', null, 'AC-1008 no line can be added after Count submit');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.send_cafe_receipt_for_review(current_setting('app.r1_id')::uuid, 1, null)$$,
  '42501', null, 'FR-1016 only the receiver sends their receipt for review');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r1_line', (select id::text from ops.cafe_receipt_lines
  where receipt_id = current_setting('app.r1_id')::uuid and item_unit_id = current_setting('app.bean_bag')::uuid), true);
select set_config('app.r1_photo_prefix', format('%s/%s/%s', '00000000-0000-0000-0000-0000000000a1',
  current_setting('app.r1_id'), current_setting('app.r1_line')), true);
reset role;
select is((select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'cafe-receipt-photos'),
  row(false, 5242880, array['image/jpeg','image/png','image/webp'])::text,
  'AC-1013 receipt evidence is private, capped at 5 MB, and accepts JPEG/PNG/WebP');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'cafe_receipt_photos_no_%' and permissive = 'RESTRICTIVE'
  and upper(cmd) in ('UPDATE','DELETE')), 2,
  'AC-1013 restrictive policies defeat shared storage write grants for update and delete');
set local role authenticated;
select is(ops.cafe_receipt_photo_line_id(current_setting('app.r1_photo_prefix') || '/00000000-0000-0000-0000-00000000f501.jpg'),
  current_setting('app.r1_line')::uuid, 'AC-1013 the canonical org/receipt/line/photo path binds to one line');
select is(ops.cafe_receipt_photo_line_id('00000000-0000-0000-0000-0000000000a1/../notes.pdf'), null::uuid,
  'AC-1013 malformed paths do not resolve to a receipt line');
select lives_ok($$select ops.set_cafe_receipt_line_explanation(current_setting('app.r1_line')::uuid, true, null)$$,
  'AC-1011 a receiver can flag damaged/wrong after Count submit');
select is((select conditions from ops.cafe_receipt_lines where id = current_setting('app.r1_line')::uuid),
  array['damaged_wrong']::text[], 'AC-1011 the condition is stored on the counted line');
select throws_ok($$select ops.send_cafe_receipt_for_review(current_setting('app.r1_id')::uuid, 1, null)$$,
  '23514', null, 'AC-1011 Send refuses a conditioned line missing both reason and photo');
select lives_ok($$select ops.set_cafe_receipt_line_explanation(current_setting('app.r1_line')::uuid, true, '  Seal is torn  ')$$,
  'AC-1011 the receiver can save a bounded reason on their Counted line');
select is((select row(condition_reason, received_quantity)::text from ops.cafe_receipt_lines
  where id = current_setting('app.r1_line')::uuid), row('Seal is torn', 2.5000::numeric(14,4))::text,
  'AC-1011 the reason is trimmed and the accepted quantity stays locked');
select throws_ok($$select ops.send_cafe_receipt_for_review(current_setting('app.r1_id')::uuid, 1, null)$$,
  '23514', null, 'AC-1011 Send still refuses a conditioned line missing its photo');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values
  ('cafe-receipt-photos', '%s/notes.pdf')$$, current_setting('app.r1_photo_prefix')),
  '42501', null, 'AC-1013 only canonical image paths may be uploaded');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values
  ('cafe-receipt-photos', '00000000-0000-0000-0000-0000000000b1/%s/%s/00000000-0000-0000-0000-00000000f599.jpg')$$,
  current_setting('app.r1_id'), current_setting('app.r1_line')),
  '42501', null, 'AC-1013 another organisation cannot upload to this receipt line');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values
  ('cafe-receipt-photos', '%s/00000000-0000-0000-0000-00000000f501.jpg'),
  ('cafe-receipt-photos', '%s/00000000-0000-0000-0000-00000000f502.png'),
  ('cafe-receipt-photos', '%s/00000000-0000-0000-0000-00000000f503.webp'),
  ('cafe-receipt-photos', '%s/00000000-0000-0000-0000-00000000f504.jpg')$$,
  current_setting('app.r1_photo_prefix'), current_setting('app.r1_photo_prefix'),
  current_setting('app.r1_photo_prefix'), current_setting('app.r1_photo_prefix')),
  'AC-1013 the receiver may upload up to four immutable images to their own counted line');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values
  ('cafe-receipt-photos', '%s/00000000-0000-0000-0000-00000000f505.jpg')$$, current_setting('app.r1_photo_prefix')),
  '42501', null, 'AC-1013 a fifth image per line is refused');
select is((select count(*)::int from ops.cafe_receipt_line_photos where line_id = current_setting('app.r1_line')::uuid),
  4, 'AC-1013 the receiver reads their four private line photos');
select is(pg_temp.try_rename_cafe_receipt_photo(), 0, 'AC-1013 stored evidence cannot be renamed');
select throws_ok(format($$delete from storage.objects where bucket_id = 'cafe-receipt-photos' and name like '%s/%%'$$,
  current_setting('app.r1_photo_prefix')), '42501', null, 'AC-1013 stored evidence cannot be deleted');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select count(*)::int from storage.objects where bucket_id = 'cafe-receipt-photos'), 0,
  'AC-1013 a same-org peer cannot read photos while the receipt is Counted');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values
  ('cafe-receipt-photos', '%s/00000000-0000-0000-0000-00000000f598.jpg')$$, current_setting('app.r1_photo_prefix')),
  '42501', null, 'AC-1013 a peer cannot add a photo to the receiver''s counted receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from storage.objects where bucket_id = 'cafe-receipt-photos'), 0,
  'AC-1013 another organization reads no receipt photos');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.send_cafe_receipt_for_review(current_setting('app.r1_id')::uuid, 7, null)$$,
  'P0019', null, 'FR-1019 sending needs the current version');
select set_config('app.r1_sent', ops.send_cafe_receipt_for_review(
  current_setting('app.r1_id')::uuid, 1, '  DN-0042  ')::text, true);
select ok((select status = 'Submitted' and delivery_note_number = 'DN-0042' and submitted_at is not null and row_version = 2
             from ops.cafe_receipts where id = current_setting('app.r1_id')::uuid),
          'AC-1008 the receiver adds the delivery-note explanation and sends the Counted receipt for review');
select ok((select sum(received_quantity) = 14.5 from ops.cafe_receipt_lines where receipt_id = current_setting('app.r1_id')::uuid),
          'AC-1008 sending for review leaves every counted quantity unchanged');

-- A second Submitted receipt on the bar stream, received by the bar supervisor, and one by the ops lead.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select set_config('app.r_bar', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'bar', null,
  'f1422000-0000-0000-0000-0000000000d1',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '6')))::jsonb ->> 'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r_bar')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select set_config('app.r_lead', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-0000000000d2',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '4')))::jsonb ->> 'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r_lead')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select set_config('app.r_admin', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'bar', null,
  'f1422000-0000-0000-0000-0000000000d3',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '5')))::jsonb ->> 'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r_admin')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select set_config('app.r_sup', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1422000-0000-0000-0000-0000000000d4',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '7')))::jsonb ->> 'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r_sup')::uuid, 1, null);

-- ── AC-1040 supervisors can read old Counted receipts, never Submitted rows in the stale nudge ─
reset role;
alter table ops.cafe_receipts disable trigger cafe_receipts_guard;
update ops.cafe_receipts
   set received_at = clock_timestamp() - interval '25 hours'
 where id = any(array[
   (current_setting('app.r_held')::jsonb ->> 'receipt_id')::uuid,
   current_setting('app.r1_id')::uuid
 ]);
alter table ops.cafe_receipts enable trigger cafe_receipts_guard;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select set_eq($$select id from ops.cafe_receipts where status = 'Counted' and received_at < clock_timestamp() - interval '1 day'$$,
  format($$values ('%s'::uuid)$$, current_setting('app.r_held')::jsonb ->> 'receipt_id'),
  'AC-1040 a supervisor reads an older Counted receipt on their stream');
select is((select count(*)::int from ops.cafe_receipts
  where status = 'Submitted' and received_at < clock_timestamp() - interval '1 day'), 1,
  'AC-1040 an old Submitted receipt exists but is not a Counted stale receipt');

-- ── AC-1014 the review queue is stream-scoped for supervisors, org-wide for ops lead and admin ─
select set_eq($$select id from ops.cafe_receipts where status = 'Submitted'$$,
  format($$values ('%s'::uuid), ('%s'::uuid), ('%s'::uuid)$$,
         current_setting('app.r1_id'), current_setting('app.r_lead'), current_setting('app.r_sup')),
  'AC-1014 a kitchen supervisor''s queue holds only kitchen receipts');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select set_eq($$select id from ops.cafe_receipts where status = 'Submitted'$$,
  format($$values ('%s'::uuid), ('%s'::uuid)$$, current_setting('app.r_bar'), current_setting('app.r_admin')),
  'AC-1014 a bar supervisor''s queue holds only bar receipts');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member","ops_lead"]}');
select is((select count(*)::int from ops.cafe_receipts where status = 'Submitted'), 5,
          'AC-1014 an ops lead sees every stream''s queue');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_receipts where status = 'Submitted'), 5,
          'AC-1014 an admin sees every stream''s queue');
select is((select count(*)::int from ops.cafe_receipt_lines
            where receipt_id = current_setting('app.r1_id')::uuid), 2,
          'FR-1018 a reviewer reads the receipt''s lines');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_eq($$select id from ops.cafe_receipts$$,
  $$select id from ops.cafe_receipts where received_by = '00000000-0000-0000-0000-0000000000d5'$$,
  'NFR-1001 a shift member reads only their own receipts');
select ok((select count(*) from ops.cafe_receipts) > 0, 'NFR-1001 a shift member still reads their own receipts');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_receipts) + (select count(*)::int from ops.cafe_receipt_lines)
          + (select count(*)::int from ops.cafe_receiving_locations), 0,
          'NFR-1001 another organisation reads no receipts, lines or locations');
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r1_id')::uuid, 'approve', 2, null)$$,
  'P0002', null, 'NFR-1001 another organisation cannot decide a receipt');
select shared._test_set_access_roles('{}');
select is((select count(*)::int from ops.cafe_receipts), 0, 'NFR-1001 a missing org claim fails closed');

-- ── AC-1015 approval through the versioned review function only ──────────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$update ops.cafe_receipts set status = 'Approved' where id = current_setting('app.r1_id')::uuid$$,
  '42501', null, 'AC-1015 a direct UPDATE to Approved is refused');
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r1_id')::uuid, 'approve', 1, null)$$,
  'P0019', null, 'AC-1015 a stale version token is refused');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r1_id')::uuid, 'approve', 2, null)$$,
  '42501', null, 'AC-1015 another stream''s supervisor cannot approve');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select set_config('app.r1_decision', ops.review_cafe_receipt(current_setting('app.r1_id')::uuid, 'approve', 2, null)::text, true);
select ok((select status = 'Approved' and reviewed_by = '00000000-0000-0000-0000-0000000000d4'
                  and reviewed_at is not null and row_version = 3 and posting_status = 'not_posted'
             from ops.cafe_receipts where id = current_setting('app.r1_id')::uuid),
          'AC-1015 the stream supervisor approves with the current token; reviewer and time are stamped, not posted');

-- ── AC-1016 nobody approves their own receipt, ops lead and admin included ───────────────────
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r_sup')::uuid, 'approve', 2, null)$$,
  '42501', null, 'AC-1016 a supervisor receiver cannot approve their own receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r_lead')::uuid, 'approve', 2, null)$$,
  '42501', null, 'AC-1016 an ops lead receiver cannot approve their own receipt');
select lives_ok($$select ops.review_cafe_receipt(current_setting('app.r_sup')::uuid, 'approve', 2, null)$$,
  'AC-1016 another person (an ops lead) approves the supervisor''s receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r_admin')::uuid, 'approve', 2, null)$$,
  '42501', null, 'AC-1016 an admin receiver cannot approve their own receipt');
select lives_ok($$select ops.review_cafe_receipt(current_setting('app.r_lead')::uuid, 'approve', 2, null)$$,
  'AC-1016 an admin approves another ops lead''s receipt');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}');
select lives_ok($$select ops.review_cafe_receipt(current_setting('app.r_admin')::uuid, 'approve', 2, null)$$,
  'AC-1016 another admin approves the admin''s receipt');

-- ── AC-1017 reject needs a note; a decision never changes a figure ───────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r_bar')::uuid, 'reject', 2, '   ')$$,
  '22023', null, 'AC-1017 a reject without a note is refused');
reset role;
select set_config('request.jwt.claims', '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}', true);
select set_config('app.cafe_receipt_action', 'decide', true);
select throws_ok($$update ops.cafe_receipts
  set status = 'Rejected', review_note = 'wrong', reviewed_by = '00000000-0000-0000-0000-0000000000d2',
      reviewed_at = now(), row_version = row_version + 1, arrival_date = arrival_date - 1
  where id = current_setting('app.r_bar')::uuid$$,
  '42501', null, 'AC-1017 a decision that also changes a receipt fact is refused');
select set_config('app.cafe_receipt_action', '', true);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok($$select ops.review_cafe_receipt(current_setting('app.r_bar')::uuid, 'reject', 2, 'Milk was counted in crates; re-enter in litres')$$,
  'AC-1017 a reject with a note succeeds');
select ok((select status = 'Rejected' and review_note like 'Milk was counted%' and reviewed_by = '00000000-0000-0000-0000-0000000000d2'
             from ops.cafe_receipts where id = current_setting('app.r_bar')::uuid),
          'AC-1017 the receipt is Rejected with its note and reviewer');
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r_bar')::uuid, 'approve', 3, null)$$,
  'P0018', null, 'AC-1017 a Rejected receipt cannot be decided again');

-- ── AC-1018 Approved and Rejected receipts are frozen ────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}', true);
select throws_ok($$update ops.cafe_receipts set delivery_note_number = 'DN-9' where id = current_setting('app.r1_id')::uuid$$,
  '42501', null, 'AC-1018 an Approved receipt''s facts cannot be updated');
select throws_ok($$update ops.cafe_receipts set review_note = 'changed' where id = current_setting('app.r_bar')::uuid$$,
  '42501', null, 'AC-1018 a Rejected receipt cannot be updated');
select set_config('app.cafe_receipt_action', 'decide', true);
select throws_ok($$update ops.cafe_receipts set status = 'Rejected' where id = current_setting('app.r1_id')::uuid$$,
  '42501', null, 'AC-1018 even the decision action cannot reopen an Approved receipt');
select set_config('app.cafe_receipt_action', '', true);
select throws_ok($$update ops.cafe_receipt_lines set received_quantity = 1
  where receipt_id = current_setting('app.r1_id')::uuid$$,
  '42501', null, 'AC-1018 an Approved receipt''s lines cannot be updated');

-- ── AC-1039 receipts never touch calculated Stock, the daily Count or the outbox ─────────────
select is((select count(*)::text from ops.cafe_count_lines), current_setting('app.count_lines_before'),
          'AC-1039 the daily Count is unchanged by receiving, review and decisions');
select is(coalesce((select jsonb_agg(to_jsonb(s) order by s::text)::text
             from ops.kitchen_stock_for_date((now() at time zone 'Asia/Jakarta')::date,
                                             '00000000-0000-0000-0000-00000000bf01', 'kitchen') s), '[]'),
          current_setting('app.stock_before'),
          'AC-1039 calculated Stock is identical before and after receipts in every state');
select is((select count(*)::text from integrations.esb_push), current_setting('app.outbox_before'),
          'FR-1003 an approved receipt writes nothing to the ESB outbox while posting is off');

select * from finish();
rollback;
