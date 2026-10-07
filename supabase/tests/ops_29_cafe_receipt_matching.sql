-- #1429 — approval matches receipt lines to the branch's open-PO outstanding, unmatched portions
-- become Receipt issues, a per-branch posting switch (default off, admin only) decides whether
-- matched portions reach the outbox as one group per receipt and PO, and an ops lead or admin
-- releases held receipts once posting is on.
begin;
create extension if not exists pgtap with schema extensions;
select plan(64);

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
reset role;

-- bf01's open POs: the bean (kg) is on the older PO A (5) and the newer PO B (4); milk on A (4).
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), 360,
  jsonb_build_array(
    jsonb_build_object('po_number', 'PO-SYNTH-1429-A', 'supplier_name', 'Synthetic supplier one',
      'po_date', (current_date - 10)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 5),
        jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'item_name', 'Milk (ESB)', 'unit_name', 'l', 'outstanding_quantity', 4))),
    jsonb_build_object('po_number', 'PO-SYNTH-1429-B', 'supplier_name', 'Synthetic supplier two',
      'po_date', (current_date - 3)::text, 'esb_created_at', null, 'esb_status', 'Receiving',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 4)))));
reset role;

-- ── AC-1019 the pure matching function ────────────────────────────────────────────────────────
select set_config('app.po_lines', jsonb_build_array(
  jsonb_build_object('po_number', 'B', 'po_date', '2026-10-05', 'item_unit_id', current_setting('app.bean_kg'), 'wip_item_id', current_setting('app.bean_id'), 'outstanding', 4),
  jsonb_build_object('po_number', 'A', 'po_date', '2026-10-01', 'item_unit_id', current_setting('app.bean_kg'), 'wip_item_id', current_setting('app.bean_id'), 'outstanding', 5))::text, true);
select is(ops.match_cafe_receipt_lines(jsonb_build_array(jsonb_build_object('line_id', 'l1',
            'item_unit_id', current_setting('app.bean_kg'), 'wip_item_id', current_setting('app.bean_id'), 'quantity', 7)),
          current_setting('app.po_lines')::jsonb),
          jsonb_build_array(
            jsonb_build_object('line_id', 'l1', 'kind', 'matched', 'po_number', 'A', 'po_date', '2026-10-01', 'quantity', 5),
            jsonb_build_object('line_id', 'l1', 'kind', 'matched', 'po_number', 'B', 'po_date', '2026-10-05', 'quantity', 2)),
          'AC-1019 7 received against 5 then 4 outstanding: 5 to the older PO, 2 to the newer, none unmatched');
select is(ops.match_cafe_receipt_lines(jsonb_build_array(jsonb_build_object('line_id', 'l1',
            'item_unit_id', current_setting('app.bean_kg'), 'wip_item_id', current_setting('app.bean_id'), 'quantity', 12)),
          current_setting('app.po_lines')::jsonb),
          jsonb_build_array(
            jsonb_build_object('line_id', 'l1', 'kind', 'matched', 'po_number', 'A', 'po_date', '2026-10-01', 'quantity', 5),
            jsonb_build_object('line_id', 'l1', 'kind', 'matched', 'po_number', 'B', 'po_date', '2026-10-05', 'quantity', 4),
            jsonb_build_object('line_id', 'l1', 'kind', 'over', 'po_number', null, 'po_date', null, 'quantity', 3)),
          'AC-1019 12 received: 5 and 4 match, 3 are unmatched excess');
select is(ops.match_cafe_receipt_lines(jsonb_build_array(jsonb_build_object('line_id', 'l1',
            'item_unit_id', current_setting('app.bean_bag'), 'wip_item_id', current_setting('app.bean_id'), 'quantity', 2)),
          current_setting('app.po_lines')::jsonb),
          jsonb_build_array(jsonb_build_object('line_id', 'l1', 'kind', 'wrong_unit', 'po_number', null, 'po_date', null, 'quantity', 2)),
          'AC-1019 a different unit of an ordered product is unmatched (wrong unit)');
select is(ops.match_cafe_receipt_lines(jsonb_build_array(jsonb_build_object('line_id', 'l1',
            'item_unit_id', current_setting('app.sugar_kg'), 'wip_item_id', current_setting('app.sugar_id'), 'quantity', 1.5)),
          current_setting('app.po_lines')::jsonb),
          jsonb_build_array(jsonb_build_object('line_id', 'l1', 'kind', 'no_po', 'po_number', null, 'po_date', null, 'quantity', 1.5)),
          'FR-1022 a product detail on no open-PO line is unmatched (no PO)');
select is(ops.match_cafe_receipt_lines(jsonb_build_array(jsonb_build_object('line_id', 'l1',
            'item_unit_id', current_setting('app.bean_kg'), 'wip_item_id', current_setting('app.bean_id'), 'quantity', 5)),
          jsonb_build_array(
            jsonb_build_object('po_number', 'A', 'po_date', '2026-10-01', 'item_unit_id', current_setting('app.bean_kg'), 'wip_item_id', current_setting('app.bean_id'), 'outstanding', 0),
            jsonb_build_object('po_number', 'B', 'po_date', '2026-10-05', 'item_unit_id', current_setting('app.bean_kg'), 'wip_item_id', current_setting('app.bean_id'), 'outstanding', 5))),
          jsonb_build_array(jsonb_build_object('line_id', 'l1', 'kind', 'matched', 'po_number', 'B', 'po_date', '2026-10-05', 'quantity', 5)),
          'FR-1022 a PO line with nothing outstanding takes no portion');

-- ── FR-1023 the per-branch switch: default off, admin only, org-scoped ────────────────────────
select ok((select bool_and(c.relrowsecurity and c.relforcerowsecurity)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops'
              and c.relname in ('cafe_receipt_posting_switches', 'cafe_receipt_matches', 'cafe_receipt_portions', 'cafe_receipt_issues')
           having count(*) = 4),
          'NFR-1001 the switch, match, portion and issue tables force RLS');
select ok(not exists (
            select 1 from unnest(array['ops.cafe_receipt_posting_switches', 'ops.cafe_receipt_matches',
                                       'ops.cafe_receipt_portions', 'ops.cafe_receipt_issues']) t(name)
                    cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) p(privilege)
             where has_table_privilege('authenticated', t.name, p.privilege)),
          'NFR-1001 no browser session writes the switch, matches, portions or issues');
select ok(not has_function_privilege('authenticated', 'ops.match_cafe_receipt_lines(jsonb, jsonb)', 'EXECUTE')
          and has_function_privilege('service_role', 'ops.match_cafe_receipt_lines(jsonb, jsonb)', 'EXECUTE'),
          'FR-1026 the worker shares the matching function; browsers do not call it');
select ok(not has_function_privilege('authenticated', 'ops._match_cafe_receipt(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'ops._match_cafe_receipt(uuid)', 'EXECUTE'),
          'NFR-1002 approval-time matching runs only inside the database');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  '42501', null, 'AC-1020 an ops lead cannot change the receipt-posting switch');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  '42501', null, 'AC-1020 a stream supervisor cannot change the receipt-posting switch');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select throws_ok($$select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  '22023', null, 'NFR-1001 another organisation''s admin cannot switch this organisation''s branch');
select is((select count(*)::int from ops.cafe_receipt_posting_switches), 0,
  'FR-1023 no switch row means posting is off');

-- ── AC-1020 switch off: Approved with matched and unmatched portions, nothing in the outbox ───
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r1', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1429000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '12'),
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '4'),
    jsonb_build_object('item_unit_id', current_setting('app.bean_bag'), 'quantity', '1'),
    jsonb_build_object('item_unit_id', current_setting('app.sugar_kg'), 'quantity', '2')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r1')::uuid, 1, null);
select is((select ops.cafe_receipt_posting(r) from ops.cafe_receipts r where r.id = current_setting('app.r1')::uuid),
  null::jsonb, 'FR-1042 a Submitted receipt has no posting state yet');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is(ops.review_cafe_receipt(current_setting('app.r1')::uuid, 'approve', 2, null) ->> 'status', 'Approved',
  'AC-1020 the stream supervisor approves the receipt');
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_receipt')
          + (select count(*)::int from integrations.esb_push_groups where source_module = 'cafe_receipt'), 0,
  'AC-1020 with posting off an Approved receipt creates no outbox row or group');
select is((select ops.cafe_receipt_posting(r) from ops.cafe_receipts r where r.id = current_setting('app.r1')::uuid),
  jsonb_build_object('state', 'not_posted', 'matched', true, 'unmatched', 3, 'open_issues', 3),
  'AC-1020 the receipt reads "approved, not posted" with its unmatched portions');
select is((select array_agg(i.kind || ':' || i.quantity::text || ':' || i.status order by i.kind)
             from ops.cafe_receipt_issues i where i.receipt_id = current_setting('app.r1')::uuid),
          array['no_po:2.0000:open', 'over:3.0000:open', 'wrong_unit:1.0000:open'],
  'AC-1020 the excess, the wrong unit and the PO-less line are open Receipt issues');
select is((select array_agg(p.po_number || ':' || p.quantity::text || ':' || p.state || ':' || p.hold_reason
                            order by p.po_number, p.quantity)
             from ops.cafe_receipt_portions p where p.receipt_id = current_setting('app.r1')::uuid),
          array['PO-SYNTH-1429-A:4.0000:held:posting_off', 'PO-SYNTH-1429-A:5.0000:held:posting_off',
                'PO-SYNTH-1429-B:4.0000:held:posting_off'],
  'FR-1023 matched portions are held while posting is off');
select is((select count(*)::int from ops.cafe_receipt_portions where receipt_id = current_setting('app.r1')::uuid), 3,
  'NFR-1001 a stream supervisor reads the receipt''s matched portions');

-- The receiver reads the issues on their own receipt, but not the matched portions (blind count).
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid), 3,
  'FR-1040 a shift member reads the issues on a receipt they received');
select is((select count(*)::int from ops.cafe_receipt_portions) + (select count(*)::int from ops.cafe_receipt_matches), 0,
  'NFR-1002 a shift member reads no matched portion with its PO quantity');
select is((select ops.cafe_receipt_posting(r) ->> 'state' from ops.cafe_receipts r where r.id = current_setting('app.r1')::uuid),
  'not_posted', 'FR-1042 the receiver reads the receipt''s posting state as text');
select is(ops.cafe_receipt_posting(jsonb_populate_record(null::ops.cafe_receipts, jsonb_build_object(
            'id', current_setting('app.r1'), 'status', 'Submitted', 'posting_status', 'held'))) ->> 'state',
  'not_posted', 'FR-1042 the posting state is read from the stored receipt, not the row the caller passes');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}');
select is(ops.cafe_receipt_posting(jsonb_populate_record(null::ops.cafe_receipts, jsonb_build_object(
            'id', current_setting('app.r1'), 'org_id', '00000000-0000-0000-0000-0000000000a1', 'status', 'Approved',
            'received_by', '00000000-0000-0000-0000-0000000000d7'))),
  null::jsonb, 'NFR-1001 a person who cannot read the receipt learns nothing of its posting state');
select is((select count(*)::int from ops.cafe_receipt_issues) + (select count(*)::int from ops.cafe_receipt_portions), 0,
  'NFR-1001 a shift member of another branch reads none of these issues or portions');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_receipt_issues) + (select count(*)::int from ops.cafe_receipt_portions)
          + (select count(*)::int from ops.cafe_receipt_matches), 0,
  'NFR-1001 another organisation''s admin reads no issue, portion or match');

-- ── AC-1021 switch on: one group per PO, unique per environment, re-approval creates nothing ──
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is(ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true) ->> 'posting_enabled', 'true',
  'AC-1020 an admin turns receipt posting on for a branch');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r2', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1429000-0000-0000-0000-000000000002', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '7'),
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '4')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r2')::uuid, 1, 'DN 77');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.review_cafe_receipt(current_setting('app.r2')::uuid, 'approve', 2, null);
reset role;
select is((select count(*)::int from integrations.esb_push_groups g
            where g.source_module = 'cafe_receipt' and g.dedup_key like 'cafe-receipt|' || current_setting('app.r2') || '|%'), 2,
  'AC-1021 matched portions on two POs make exactly two groups');
select is((select array_agg(x order by x) from (
             select p.po_number || ':' || string_agg(e.payload ->> 'quantity', ',' order by (e.payload ->> 'quantity')::numeric) as x
               from integrations.esb_push e
               join ops.cafe_receipt_portions p on p.push_id = e.id
              where p.receipt_id = current_setting('app.r2')::uuid
              group by p.po_number, e.push_group_id) members),
          array['PO-SYNTH-1429-A:4.0000,5.0000', 'PO-SYNTH-1429-B:2.0000'],
  'AC-1021 each group holds that PO''s matched portions');
select ok((select bool_and(g.dedup_key like '%|' || g.target_env and g.target_env = 'dry_run')
             from integrations.esb_push_groups g where g.source_module = 'cafe_receipt')
          and (select count(distinct g.dedup_key) = count(*) from integrations.esb_push_groups g where g.source_module = 'cafe_receipt'),
  'AC-1021 each group''s dedupe key is unique and names its target environment');
select ok((select bool_and(e.endpoint = 'goods-receipt' and e.status = 'pending' and e.dedup_key like '%|' || e.target_env
                           and e.payload ->> 'po_number' is not null and e.payload ->> 'arrival_date' = (select r.arrival_date::text from ops.cafe_receipts r where r.id = current_setting('app.r2')::uuid)
                           and e.payload ->> 'receiving_location_key' = 'main_store'
                           and e.payload ->> 'delivery_note_number' = 'DN 77')
             from integrations.esb_push e where e.source_module = 'cafe_receipt'),
  'FR-1024 each member carries the PO, arrival date, receiving location and delivery note');
-- 7 kg of bean is below the 9 open on the two POs: one informational short issue (#1431), not unmatched.
select is((select ops.cafe_receipt_posting(r) from ops.cafe_receipts r where r.id = current_setting('app.r2')::uuid),
  jsonb_build_object('state', 'queued', 'matched', true, 'unmatched', 0, 'open_issues', 1),
  'FR-1042 the receipt reads queued');
select lives_ok($$select ops._match_cafe_receipt(current_setting('app.r2')::uuid)$$, 'AC-1021 matching again is harmless');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.review_cafe_receipt(current_setting('app.r2')::uuid, 'approve', 3, null)$$,
  'P0018', null, 'AC-1021 a decided receipt cannot be approved again');
reset role;
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_receipt')
          || '/' || (select count(*)::int from integrations.esb_push_groups where source_module = 'cafe_receipt'),
  '3/2', 'AC-1021 re-approving and re-matching create nothing');

-- The worker's outcome becomes the receipt's state.
set local role service_role;
select is((select count(*)::int from integrations.claim_esb_pushes(array(
  select push_id from ops.cafe_receipt_portions
   where receipt_id = current_setting('app.r2')::uuid and push_id is not null))), 3,
  'the worker atomically claims the receipt portions');
update integrations.esb_push set status = 'failed', retry_count = retry_count + 1,
       last_error = 'synthetic retryable failure'
 where id = (select push_id from ops.cafe_receipt_portions where receipt_id = current_setting('app.r2')::uuid
              and po_number = 'PO-SYNTH-1429-B');
reset role;
select is((select ops.cafe_receipt_posting(r) ->> 'state' from ops.cafe_receipts r where r.id = current_setting('app.r2')::uuid),
  'failed', 'FR-1042 a failed portion reads failed');
set local role service_role;
update integrations.esb_push set next_attempt_at = clock_timestamp() - interval '1 second'
 where id = (select push_id from ops.cafe_receipt_portions where receipt_id = current_setting('app.r2')::uuid
              and po_number = 'PO-SYNTH-1429-B');
select is(integrations.reap_esb_pushes(), 1, 'the worker reaper promotes the due receipt retry');
select is((select count(*)::int from integrations.claim_esb_pushes(array(
  select push_id from ops.cafe_receipt_portions where receipt_id = current_setting('app.r2')::uuid
    and po_number = 'PO-SYNTH-1429-B'))), 1, 'the retried receipt portion can be claimed again');
update integrations.esb_push set status = 'posted', posted_at = clock_timestamp()
 where id in (select push_id from ops.cafe_receipt_portions where receipt_id = current_setting('app.r2')::uuid);
reset role;
select is((select ops.cafe_receipt_posting(r) ->> 'state' from ops.cafe_receipts r where r.id = current_setting('app.r2')::uuid),
  'posted', 'FR-1042 every portion posted reads posted');

-- ── AC-1028 releasing held receipts once posting is on ───────────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok($$select ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01')$$,
  '42501', null, 'AC-1028 a floor member cannot release');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01')$$,
  '42501', null, 'FR-1030 a stream supervisor cannot release');
select is((select count(*)::int from ops.cafe_held_receipts()), 0, 'FR-1030 a stream supervisor sees no release list');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((select held_receipts::text || '/' || posting_enabled::text from ops.cafe_held_receipts()
            where branch_id = '00000000-0000-0000-0000-00000000bf01'),
  '1/true', 'FR-1030 an ops lead sees the branch''s held receipt once posting is on');
-- What is left on the cache after r2's queued portions: 2 kg of bean on PO B, nothing else.
select is(ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01'),
  jsonb_build_object('released_receipts', 1, 'queued_portions', 1, 'held_portions', 2, 'held_receipts', 1, 'held_location_missing', 0),
  'AC-1028 a release enqueues what still fits and holds the rest');
reset role;
select is((select array_agg(coalesce(p.po_number, '-') || ':' || p.quantity::text || ':' || p.state || ':' || coalesce(p.hold_reason, '-')
                            order by p.state, p.quantity)
             from ops.cafe_receipt_portions p
            where p.receipt_id = current_setting('app.r1')::uuid and p.state <> 'superseded'),
          array['-:4.0000:held:no_longer_fits', '-:7.0000:held:no_longer_fits', 'PO-SYNTH-1429-B:2.0000:queued:-'],
  'AC-1028 the portion that fits is queued on its PO; the rest stay held with a reason');
select is((select count(*)::int from integrations.esb_push_groups g
            where g.dedup_key like 'cafe-receipt|' || current_setting('app.r1') || '|%'), 1,
  'AC-1028 the release makes one group for the PO that fits');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is(ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01'),
  jsonb_build_object('released_receipts', 0, 'queued_portions', 0, 'held_portions', 2, 'held_receipts', 1, 'held_location_missing', 0),
  'AC-1028 an admin''s rerun enqueues nothing new');
reset role;
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_receipt')
          || '/' || (select count(*)::int from integrations.esb_push_groups where source_module = 'cafe_receipt'),
  '4/3', 'AC-1028 the outbox is unchanged by the rerun');
select is((select count(*)::int from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid), 3,
  'AC-1028 a release leaves the Receipt issues as they were');

-- A fresh cache with room for everything releases the rest, once.
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1429-C', 'supplier_name', 'Synthetic supplier three',
    'po_date', (current_date - 1)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 20),
      jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'item_name', 'Milk (ESB)', 'unit_name', 'l', 'outstanding_quantity', 20)))));
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is(ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01'),
  jsonb_build_object('released_receipts', 1, 'queued_portions', 2, 'held_portions', 0, 'held_receipts', 0, 'held_location_missing', 0),
  'FR-1030 a release after a refresh enqueues the held rest');
select is(ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01'),
  jsonb_build_object('released_receipts', 0, 'queued_portions', 0, 'held_portions', 0, 'held_receipts', 0, 'held_location_missing', 0),
  'FR-1030 and a rerun still enqueues nothing new');
reset role;
select is((select string_agg(p.po_number || ':' || p.quantity::text, ',' order by p.po_number, p.quantity)
             from ops.cafe_receipt_portions p
            where p.receipt_id = current_setting('app.r1')::uuid and p.state = 'queued'),
  'PO-SYNTH-1429-B:2.0000,PO-SYNTH-1429-C:4.0000,PO-SYNTH-1429-C:7.0000',
  'FR-1030 every portion of the released receipt is queued once');

-- ── FR-1032 / NFR-1006 no current PO data: matching waits for the refresh it asked for ────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf02', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}');
select set_config('app.r3', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf02', 'kitchen', null,
  'f1429000-0000-0000-0000-000000000003', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '3')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r3')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.review_cafe_receipt(current_setting('app.r3')::uuid, 'approve', 2, null);
select is((select ops.cafe_receipt_posting(r) from ops.cafe_receipts r where r.id = current_setting('app.r3')::uuid),
  jsonb_build_object('state', 'held', 'matched', false, 'unmatched', 0, 'open_issues', 0),
  'NFR-1006 with no PO data the receipt is approved and not matched: no issue is guessed');
select is(ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf02'),
  jsonb_build_object('released_receipts', 0, 'queued_portions', 0, 'held_portions', 0, 'held_receipts', 0, 'held_location_missing', 0,
                     'reason', 'po_data_not_current'),
  'FR-1030 a release without current PO data enqueues nothing and says why');
reset role;
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1429-D', 'supplier_name', 'Synthetic supplier four',
    'po_date', current_date::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 2)))));
reset role;
select is((select p.quantity::text || ':' || p.state || ':' || p.hold_reason from ops.cafe_receipt_portions p
            where p.receipt_id = current_setting('app.r3')::uuid),
  '2.0000:held:receiving_location_missing',
  'FR-1003 the refresh matches the waiting receipt; with no receiving location its portion is held');
select is((select i.kind || ':' || i.quantity::text from ops.cafe_receipt_issues i where i.receipt_id = current_setting('app.r3')::uuid),
  'over:1.0000', 'FR-1022 the refresh records the excess as a Receipt issue');
select is((select count(*)::int from integrations.esb_push e join ops.cafe_receipt_portions p on p.push_id = e.id
            where p.receipt_id = current_setting('app.r3')::uuid), 0,
  'FR-1023 a branch without a receiving location enqueues nothing');

-- ── FR-1027 a refresh read before ESB posted a queued portion does not give its quantity twice ─
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1429-E', 'supplier_name', 'Synthetic supplier five',
    'po_date', (current_date - 1)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 9)))));
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r4', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1429000-0000-0000-0000-000000000004', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '7')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r4')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.review_cafe_receipt(current_setting('app.r4')::uuid, 'approve', 2, null);
reset role;
-- The worker refreshes after r4 was queued but before ESB posted it: ESB still reports 9.
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', clock_timestamp(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1429-E', 'supplier_name', 'Synthetic supplier five',
    'po_date', (current_date - 1)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 9)))));
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r5', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1429000-0000-0000-0000-000000000005', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '7')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r5')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.review_cafe_receipt(current_setting('app.r5')::uuid, 'approve', 2, null);
reset role;
select is((select string_agg(p.po_number || ':' || p.quantity::text, ',') from ops.cafe_receipt_portions p
            where p.receipt_id = current_setting('app.r5')::uuid and p.state = 'queued')
          || ' / ' || (select string_agg(i.kind || ':' || i.quantity::text, ',') from ops.cafe_receipt_issues i
                        where i.receipt_id = current_setting('app.r5')::uuid),
  'PO-SYNTH-1429-E:2.0000 / over:5.0000',
  'FR-1027 a portion queued but not yet posted still counts against the outstanding a later refresh reads');

select set_config('app.retention_push_id', (select push_id::text from ops.cafe_receipt_portions
  where receipt_id = current_setting('app.r2')::uuid and push_id is not null limit 1), true);
select set_config('app.retention_portion_id', (select id::text from ops.cafe_receipt_portions
  where push_id = current_setting('app.retention_push_id')::uuid), true);
set local role service_role;
update integrations.esb_push set posted_at = clock_timestamp() - interval '31 days'
 where id = current_setting('app.retention_push_id')::uuid;
select is(integrations.prune_esb_pushes(), 0,
  'retention leaves a sent receipt row that a portion still references');
reset role;
select is((select count(*)::int from ops.cafe_receipt_portions
            where push_id = current_setting('app.retention_push_id')::uuid), 1,
  'the portion keeps its link to the sent row');
select is((select count(*)::int from integrations.esb_push
            where id = current_setting('app.retention_push_id')::uuid), 1,
  'the aged sent receipt row is kept');
select ops._enqueue_cafe_receipt_portions(current_setting('app.r2')::uuid, 'TEST-LOC');
select is((select count(*)::int from integrations.esb_push
            where source_module = 'cafe_receipt' and source_ref = current_setting('app.retention_portion_id')
              and status <> 'posted'), 0,
  'a later link or release does not enqueue an aged sent portion again');

select * from finish();
rollback;
