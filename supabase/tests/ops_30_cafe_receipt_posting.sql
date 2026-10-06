-- #1430 — the worker posts each (receipt, PO) outbox group as one ESB goods receipt. The database
-- side: every receipt carries a MOS key, each group's members carry the branch code and the group's
-- document key (the receipt's key and a sequence), the group records the create-sent and
-- created-number checkpoints, and the worker returns what no longer fits a PO's fresh outstanding to
-- Receipt issues through one service-only RPC.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1430-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1430-BEAN-KG","name":"Matching coffee bean","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1430-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1430-BEAN-BAG","name":"Matching coffee bean","category":"KITCHEN","unit_name":"bag","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1430-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1430-MILK","name":"Matching milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1430-SUGAR","esb_product_detail_id":"SYNTH-ESB-PD-1430-SUGAR","name":"Matching sugar","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);

select set_config('app.bean_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1430-BEAN'), true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1430-MILK'), true);
select set_config('app.sugar_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1430-SUGAR'), true);
select set_config('app.bean_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1430-BEAN-KG'), true);
select set_config('app.bean_bag', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1430-BEAN-BAG'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1430-MILK'), true);
select set_config('app.sugar_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1430-SUGAR'), true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ESB-P-1430-%';

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
    jsonb_build_object('po_number', 'PO-SYNTH-1430-A', 'supplier_name', 'Synthetic supplier one',
      'po_date', (current_date - 10)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 5),
        jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'item_name', 'Milk (ESB)', 'unit_name', 'l', 'outstanding_quantity', 4))),
    jsonb_build_object('po_number', 'PO-SYNTH-1430-B', 'supplier_name', 'Synthetic supplier two',
      'po_date', (current_date - 3)::text, 'esb_created_at', null, 'esb_status', 'Receiving',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 4)))));
reset role;

-- A receipt of 7 kg bean and 4 l milk with posting on: PO A takes bean 5 and milk 4, PO B bean 2.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r1', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1430000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '7'),
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '4')))->>'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r1')::uuid, 1, 'DN 77');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.review_cafe_receipt(current_setting('app.r1')::uuid, 'approve', 2, null);
reset role;

select set_config('app.key', (select r.mos_key from ops.cafe_receipts r where r.id = current_setting('app.r1')::uuid), true);
select set_config('app.group_a', (select e.push_group_id::text from integrations.esb_push e
                                   where e.source_module = 'cafe_receipt' and e.payload ->> 'po_number' = 'PO-SYNTH-1430-A' limit 1), true);
select set_config('app.group_b', (select e.push_group_id::text from integrations.esb_push e
                                   where e.source_module = 'cafe_receipt' and e.payload ->> 'po_number' = 'PO-SYNTH-1430-B' limit 1), true);
select set_config('app.bean_a', (select e.id::text from integrations.esb_push e
                                  where e.push_group_id = current_setting('app.group_a')::uuid
                                    and e.payload ->> 'item_unit_id' = current_setting('app.bean_kg')), true);
select set_config('app.milk_a', (select e.id::text from integrations.esb_push e
                                  where e.push_group_id = current_setting('app.group_a')::uuid
                                    and e.payload ->> 'item_unit_id' = current_setting('app.milk_l')), true);
select set_config('app.bean_b', (select e.id::text from integrations.esb_push e
                                  where e.push_group_id = current_setting('app.group_b')::uuid), true);

-- ── FR-1046 the MOS key ─────────────────────────────────────────────────────────────────────
select matches(current_setting('app.key'), '^GR[0-9]{6,}$', 'FR-1046 an approved receipt carries a short ASCII MOS key');
select ok(exists (select 1 from pg_constraint c where c.conrelid = 'ops.cafe_receipts'::regclass and c.contype = 'u'
                     and c.conkey = array[(select a.attnum from pg_attribute a
                                            where a.attrelid = 'ops.cafe_receipts'::regclass and a.attname = 'mos_key')]::smallint[]),
          'FR-1046 a MOS key names one receipt across every organisation');
select is((select array_agg(distinct e.payload ->> 'mos_key' order by e.payload ->> 'mos_key') from integrations.esb_push e
            where e.source_module = 'cafe_receipt' and e.payload ->> 'receipt_id' = current_setting('app.r1')),
          array[current_setting('app.key') || '-1', current_setting('app.key') || '-2'],
          'FR-1046 each group of the receipt carries its own document key: the receipt''s key and a sequence');
select is((select count(distinct e.payload ->> 'mos_key')::int from integrations.esb_push e
            where e.push_group_id = current_setting('app.group_a')::uuid), 1,
          'FR-1024 every member of a group carries the same document key');
select ok((select bool_and(e.payload ->> 'mos_key' ~ '^[A-Z0-9-]{1,32}$') from integrations.esb_push e
            where e.source_module = 'cafe_receipt'),
          'AC-1022 the document key is ASCII and within 32 characters');
select is((select array_agg(distinct e.payload ->> 'branch_code') from integrations.esb_push e
            where e.source_module = 'cafe_receipt'),
          array[(select b.code from shared.branches b where b.id = '00000000-0000-0000-0000-00000000bf01')],
          'FR-1029 each member names its branch by MOS code, for the target environment''s id map');

-- ── FR-1025/1028 the group's checkpoints ───────────────────────────────────────────────────
select ok((select g.esb_create_sent_at is null and g.esb_created_num is null and g.esb_doc_num is null
             from integrations.esb_push_groups g where g.id = current_setting('app.group_a')::uuid),
          'FR-1028 a new group has sent no create and holds no ESB number');
select ok(has_column_privilege('service_role', 'integrations.esb_push_groups', 'esb_create_sent_at', 'UPDATE')
          and has_column_privilege('service_role', 'integrations.esb_push_groups', 'esb_created_num', 'UPDATE')
          and not has_column_privilege('authenticated', 'integrations.esb_push_groups', 'esb_created_num', 'UPDATE'),
          'FR-1025 only the worker records create-sent and created-awaiting-authorization');

-- ── FR-1026/1027 returning excess to Receipt issues ────────────────────────────────────────
select ok(not has_function_privilege('authenticated', 'ops.return_cafe_receipt_excess(uuid, jsonb)', 'EXECUTE')
          and not has_function_privilege('anon', 'ops.return_cafe_receipt_excess(uuid, jsonb)', 'EXECUTE')
          and has_function_privilege('service_role', 'ops.return_cafe_receipt_excess(uuid, jsonb)', 'EXECUTE'),
          'NFR-1006 only the worker returns excess to Receipt issues');

set local role service_role;
select throws_ok(format($$select ops.return_cafe_receipt_excess(%L, jsonb_build_array(jsonb_build_object('push_id', %L, 'fits', 6, 'kind', 'over')))$$,
                        current_setting('app.group_a'), current_setting('app.bean_a')),
  '22023', null, 'FR-1027 the worker cannot grow a portion above what was approved');
select throws_ok(format($$select ops.return_cafe_receipt_excess(%L, jsonb_build_array(jsonb_build_object('push_id', %L, 'fits', -1, 'kind', 'over')))$$,
                        current_setting('app.group_a'), current_setting('app.bean_a')),
  '22023', null, 'FR-1027 a negative fit is refused');
select throws_ok(format($$select ops.return_cafe_receipt_excess(%L, jsonb_build_array(jsonb_build_object('push_id', %L, 'fits', 1, 'kind', 'over')))$$,
                        current_setting('app.group_a'), current_setting('app.bean_b')),
  '22023', null, 'FR-1027 a member of another group is refused');
select throws_ok(format($$select ops.return_cafe_receipt_excess(%L, jsonb_build_array(jsonb_build_object('push_id', %L, 'fits', 1, 'kind', 'damaged')))$$,
                        current_setting('app.group_a'), current_setting('app.bean_a')),
  '22023', null, 'FR-1026 excess returns only as an over or no-PO issue');

-- AC-1024: the PO now has 3 bean outstanding and no milk line: bean posts 3, 2 returns as over;
-- milk returns whole as no PO and leaves the group.
select is(ops.return_cafe_receipt_excess(current_setting('app.group_a')::uuid, jsonb_build_array(
            jsonb_build_object('push_id', current_setting('app.bean_a'), 'fits', 3, 'kind', 'over'),
            jsonb_build_object('push_id', current_setting('app.milk_a'), 'fits', 0, 'kind', 'no_po'))),
          jsonb_build_array(jsonb_build_object('push_id', current_setting('app.bean_a')::uuid, 'quantity', 3.0000)),
          'AC-1024 what fits stays in the group and is returned to the worker');
reset role;
select is((select p.quantity from ops.cafe_receipt_portions p where p.push_id = current_setting('app.bean_a')::uuid)::text
          || '/' || (select e.payload ->> 'quantity' from integrations.esb_push e where e.id = current_setting('app.bean_a')::uuid),
          '3.0000/3.0000', 'AC-1024 the portion and its outbox member now carry only the part that fits');
select is((select string_agg(i.kind || ':' || i.quantity::text, ',' order by i.kind) from ops.cafe_receipt_issues i
            where i.receipt_id = current_setting('app.r1')::uuid),
          'no_po:4.0000,over:2.0000', 'AC-1024 the excess is a Receipt issue: bean over 2, milk no PO 4');
select ok((select p.state = 'superseded' and p.push_id is null from ops.cafe_receipt_portions p
            where p.line_id = (select l.id from ops.cafe_receipt_lines l
                                where l.receipt_id = current_setting('app.r1')::uuid and l.item_unit_id = current_setting('app.milk_l')::uuid)),
          'AC-1025 a portion with nothing left to fit leaves the queue');
select ok((select e.push_group_id is null and e.status = 'dead_letter' and e.last_error like '%Receipt issue%'
             from integrations.esb_push e where e.id = current_setting('app.milk_a')::uuid),
          'AC-1025 its outbox member leaves the group and is never sent');
select is((select count(*)::int from integrations.esb_push e where e.push_group_id = current_setting('app.group_a')::uuid), 1,
          'AC-1025 the group keeps only the member that fits');

-- A second shortfall on the same line adds to its over issue; an unchanged fit changes nothing.
set local role service_role;
select is(ops.return_cafe_receipt_excess(current_setting('app.group_a')::uuid, jsonb_build_array(
            jsonb_build_object('push_id', current_setting('app.bean_a'), 'fits', 2, 'kind', 'over'))),
          jsonb_build_array(jsonb_build_object('push_id', current_setting('app.bean_a')::uuid, 'quantity', 2.0000)),
          'FR-1026 a later re-match can return more');
select is(ops.return_cafe_receipt_excess(current_setting('app.group_a')::uuid, jsonb_build_array(
            jsonb_build_object('push_id', current_setting('app.bean_a'), 'fits', 2, 'kind', 'over'))),
          jsonb_build_array(jsonb_build_object('push_id', current_setting('app.bean_a')::uuid, 'quantity', 2.0000)),
          'FR-1026 re-running the same fit changes nothing');
reset role;
select is((select i.quantity from ops.cafe_receipt_issues i
            where i.receipt_id = current_setting('app.r1')::uuid and i.kind = 'over'), 3.0000::numeric,
          'FR-1026 the over issue holds all the returned excess for the line');
select is((select ops.cafe_receipt_posting(r) ->> 'unmatched' from ops.cafe_receipts r where r.id = current_setting('app.r1')::uuid), '2',
          'FR-1042 the receipt shows its returned excess as unmatched');

-- A member that already posted is never shrunk.
update integrations.esb_push set status = 'posted', esb_doc_num = 'GR-SYNTH-1', posted_at = clock_timestamp()
 where id = current_setting('app.bean_b')::uuid;
set local role service_role;
select throws_ok(format($$select ops.return_cafe_receipt_excess(%L, jsonb_build_array(jsonb_build_object('push_id', %L, 'fits', 1, 'kind', 'over')))$$,
                        current_setting('app.group_b'), current_setting('app.bean_b')),
  '22023', null, 'FR-1025 a posted portion is never returned');
reset role;

-- The worker never posts a member without a group: a re-match that empties a group leaves no member.
set local role service_role;
select is(ops.return_cafe_receipt_excess(current_setting('app.group_a')::uuid, jsonb_build_array(
            jsonb_build_object('push_id', current_setting('app.bean_a'), 'fits', 0, 'kind', 'no_po'))),
          '[]'::jsonb, 'AC-1025 when nothing fits, nothing remains to send');
reset role;
select ok((select g.status = 'dead_letter' and g.last_error like '%Receipt issue%' from integrations.esb_push_groups g
            where g.id = current_setting('app.group_a')::uuid),
          'AC-1025 an emptied group is closed with the reason, never sent');

select * from finish();
rollback;
