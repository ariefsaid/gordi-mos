-- #1431 — procurement's Receipt issues: the admin-granted capability, who reads and acts on issues,
-- link to an open PO (re-matched on the #1429 posting path), close with a note, PO created after
-- delivery, and record history of receipts, lines, portions, issues and grants.
begin;
create extension if not exists pgtap with schema extensions;
select plan(92);
-- C8 counts calls of the per-receipt stream check, so a policy that runs it before procurement's
-- capability fails here at any volume.
set local track_functions = 'all';

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1431-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1431-BEAN-KG","name":"Issue coffee bean","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1431-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1431-BEAN-BAG","name":"Issue coffee bean","category":"KITCHEN","unit_name":"bag","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1431-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1431-MILK","name":"Issue milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1431-SUGAR","esb_product_detail_id":"SYNTH-ESB-PD-1431-SUGAR","name":"Issue sugar","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.bean_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1431-BEAN'), true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1431-MILK'), true);
select set_config('app.sugar_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1431-SUGAR'), true);
select set_config('app.bean_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1431-BEAN-KG'), true);
select set_config('app.bean_bag', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1431-BEAN-BAG'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1431-MILK'), true);
select set_config('app.sugar_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1431-SUGAR'), true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ESB-P-1431-%';
-- Yesterday in Asia/Jakarta: the receipt's arrival, the latest a shift member may backdate to.
select set_config('app.arrival', ((now() at time zone 'Asia/Jakarta')::date - 1)::text, true);

-- Personas: d5 kitchen shift member at bf01 (the receiver), d4 that stream's supervisor, d7 a shift
-- member at bf02, d2 ops lead, d3 admin, d6 a member who will hold the procurement capability, b4
-- an admin of another organisation.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d7'::uuid, 'rumah_rames_kitchen')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.bean_id')::uuid, 'Issue coffee bean',
  current_setting('app.bean_kg')::uuid, array[current_setting('app.bean_kg')::uuid, current_setting('app.bean_bag')::uuid], 'RAW', true);
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'Issue milk', current_setting('app.milk_l')::uuid, array[current_setting('app.milk_l')::uuid], 'RAW', true);
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.sugar_id')::uuid,
  'Issue sugar', current_setting('app.sugar_kg')::uuid, array[current_setting('app.sugar_kg')::uuid], 'RAW', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receiving_location('00000000-0000-0000-0000-00000000bf01', 'main_store');
reset role;

-- bf01's open POs at approval: bean (kg) 5 and milk 6, both on PO A; sugar is on no PO.
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1431-A', 'supplier_name', 'Synthetic supplier one',
    'po_date', (current_date - 10)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 5),
      jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'item_name', 'Milk (ESB)', 'unit_name', 'l', 'outstanding_quantity', 6)))));
reset role;

-- ── Structure: the grant table is RPC-only and every new definer is closed to PUBLIC and anon ──
select ok((select c.relrowsecurity and c.relforcerowsecurity
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops' and c.relname = 'cafe_receipt_issue_access'),
  'NFR-1001 the procurement grant table forces RLS');
select ok(not exists (select 1 from unnest(array['INSERT', 'UPDATE', 'DELETE']) p(privilege)
                       where has_table_privilege('authenticated', 'ops.cafe_receipt_issue_access', p.privilege)),
  'NFR-1001 no browser session writes a procurement grant');
select ok(not exists (
            select 1 from unnest(array[
              'ops.can_manage_cafe_receipt_issues()', 'ops.get_cafe_receipt_issue_access(uuid)',
              'ops.set_cafe_receipt_issue_access(uuid,boolean)', 'ops.cafe_receipt_issue_open_pos(uuid)',
              'ops.request_cafe_receipt_issue_po_refresh(uuid)', 'ops.link_cafe_receipt_issue(uuid,text)',
              'ops.close_cafe_receipt_issue(uuid,text)', 'ops._record_cafe_receipt_information_issues()']) f(sig)
             where has_function_privilege('public', f.sig, 'EXECUTE') or has_function_privilege('anon', f.sig, 'EXECUTE')),
  'NFR-1001 the new SECURITY DEFINER functions grant EXECUTE to neither PUBLIC nor anon');
select ok(not has_function_privilege('authenticated', 'ops._record_cafe_receipt_information_issues()', 'EXECUTE')
          and not has_function_privilege('service_role', 'ops._record_cafe_receipt_information_issues()', 'EXECUTE'),
  'NFR-1002 informational issues are recorded only by the matching trigger');

-- ── FR-1040 the capability: an admin grants it to another same-org person, in the database ────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is(ops.get_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6') ->> 'enabled', 'false',
  'FR-1040 a person starts without the procurement capability');
select is(ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', true) ->> 'enabled', 'true',
  'FR-1040 an admin grants the procurement capability to a same-org person');
select is(ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', true) ->> 'enabled', 'true',
  'FR-1040 granting again is harmless');
select throws_ok($$select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d3', true)$$,
  '42501', null, 'FR-1040 an admin cannot grant the capability to themselves');
select ok(not ops.can_manage_cafe_receipt_issues(), 'AC-1035 admin is not procurement without the capability');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select ok(ops.can_manage_cafe_receipt_issues(), 'FR-1040 the granted member holds the capability');
select throws_ok($$select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d5', true)$$,
  '42501', null, 'FR-1040 a procurement holder cannot grant the capability');
select throws_ok($$select ops.get_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d5')$$,
  '42501', null, 'FR-1040 a procurement holder cannot read others'' grants');
select is((select count(*)::int from ops.cafe_receipt_issue_access), 1, 'FR-1040 the holder reads their own grant');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', false)$$,
  '42501', null, 'FR-1040 a supervisor cannot change the capability');
select is((select count(*)::int from ops.cafe_receipt_issue_access), 0, 'NFR-1001 a supervisor reads no one else''s grant');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select throws_ok($$select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', false)$$,
  '22023', null, 'NFR-1001 another organisation''s admin cannot change this organisation''s grant');
select throws_ok($$select ops.get_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6')$$,
  '22023', null, 'NFR-1001 another organisation''s admin cannot read this organisation''s grant');
reset role;
select is((select count(*)::int from ops.cafe_receipt_issue_access where revoked_at is null), 1,
  'FR-1040 exactly one active grant after the repeated grant');

-- ── A receipt through the real flow: count, explain, send, approve, match ─────────────────────
-- d5 receives yesterday's delivery: bean 7 kg (5 on PO A: 2 over), milk 4 (6 open: short 2),
-- sugar 3 (no PO) and 1 bag of bean (only kg is ordered: wrong unit), the bag damaged.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r1', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.arrival')::date,
  'f1431000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '7'),
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '4'),
    jsonb_build_object('item_unit_id', current_setting('app.sugar_kg'), 'quantity', '3'),
    jsonb_build_object('item_unit_id', current_setting('app.bean_bag'), 'quantity', '1', 'damaged_wrong', true))) ->> 'receipt_id', true);
select set_config('app.bag_line', (select id::text from ops.cafe_receipt_lines
  where receipt_id = current_setting('app.r1')::uuid and item_unit_id = current_setting('app.bean_bag')::uuid), true);
select set_config('app.sugar_line', (select id::text from ops.cafe_receipt_lines
  where receipt_id = current_setting('app.r1')::uuid and item_unit_id = current_setting('app.sugar_kg')::uuid), true);
select set_config('app.bean_line', (select id::text from ops.cafe_receipt_lines
  where receipt_id = current_setting('app.r1')::uuid and item_unit_id = current_setting('app.bean_kg')::uuid), true);
select ops.set_cafe_receipt_line_explanation(current_setting('app.bag_line')::uuid, true, 'Bag torn open on arrival');
reset role;
insert into storage.objects (bucket_id, name)
values ('cafe-receipt-photos', format('00000000-0000-0000-0000-0000000000a1/%s/%s/%s.jpg',
  current_setting('app.r1'), current_setting('app.bag_line'), gen_random_uuid()));
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select ops.send_cafe_receipt_for_review(current_setting('app.r1')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.review_cafe_receipt(current_setting('app.r1')::uuid, 'approve', 2, null);
-- r2 is sent but not decided: it stays with its receiver and the stream's reviewers.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r2', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1431000-0000-0000-0000-000000000002', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '1'))) ->> 'receipt_id', true);
select ops.send_cafe_receipt_for_review(current_setting('app.r2')::uuid, 1, null);
reset role;
select set_config('app.r2_line', (select id::text from ops.cafe_receipt_lines where receipt_id = current_setting('app.r2')::uuid), true);
select set_config('app.r2_photo', format('00000000-0000-0000-0000-0000000000a1/%s/%s/%s.jpg',
  current_setting('app.r2'), current_setting('app.r2_line'), gen_random_uuid()), true);
insert into storage.objects (bucket_id, name) values ('cafe-receipt-photos', current_setting('app.r2_photo'));
-- An issue row on a receipt that is not Approved cannot arise through matching; it is planted to
-- prove the issue read does not lean on that invariant.
insert into ops.cafe_receipt_issues (org_id, receipt_id, line_id, item_unit_id, kind, quantity)
values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.r2')::uuid, current_setting('app.r2_line')::uuid,
        current_setting('app.milk_l')::uuid, 'no_po', 1);

select is((select array_agg(i.kind || ':' || trim_scale(i.quantity)::text || ':' || i.status order by i.kind)
             from ops.cafe_receipt_issues i where i.receipt_id = current_setting('app.r1')::uuid),
  array['damaged_wrong:1:open', 'no_po:3:open', 'over:2:open', 'short:2:open', 'wrong_unit:1:open'],
  'FR-1034 matching records the blocking excess, PO-less and wrong-unit portions and the informational short and damaged lines');
select is((select count(*)::int from ops.cafe_receipt_portions where receipt_id = current_setting('app.r1')::uuid and state = 'held'), 2,
  'FR-1034 informational issues do not change the matched portions');
select set_config('app.no_po', (select id::text from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid and kind = 'no_po'), true);
select set_config('app.over', (select id::text from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid and kind = 'over'), true);
select set_config('app.wrong_unit', (select id::text from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid and kind = 'wrong_unit'), true);
select set_config('app.short', (select id::text from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid and kind = 'short'), true);
select set_config('app.damaged', (select id::text from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid and kind = 'damaged_wrong'), true);

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select ops.cafe_receipt_posting(r) - 'state' from ops.cafe_receipts r where r.id = current_setting('app.r1')::uuid),
  jsonb_build_object('matched', true, 'unmatched', 3, 'open_issues', 5),
  'FR-1042 the receipt counts its blocking issues as unmatched and every open issue as open');

-- ── AC-1035 who reads and who acts ───────────────────────────────────────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid), 5,
  'AC-1035 procurement reads every issue of an Approved receipt');
select is((select count(*)::int from ops.cafe_receipt_lines where receipt_id = current_setting('app.r1')::uuid), 4,
  'AC-1035 procurement reads the lines of an Approved receipt with issues');
select ok((select count(*) > 0 from ops.cafe_receipt_portions where receipt_id = current_setting('app.r1')::uuid),
  'DD-CAFE-MVP-6 procurement reads the matched portions');
select is((select jsonb_array_length(photos) from ops.list_cafe_receipt_photos(array[current_setting('app.r1')::uuid])), 1,
  'FR-1034 procurement reads the receipt''s photo evidence');
select ok(ops.can_read_cafe_receipt_photo((select name from storage.objects where bucket_id = 'cafe-receipt-photos'
                                            and name like '%' || current_setting('app.bag_line') || '%')),
  'FR-1034 procurement may sign the private photo');
select throws_ok($$select ops.close_cafe_receipt_issue('00000000-0000-0000-0000-0000000000ff', 'handled')$$,
  '22023', null, 'NFR-1001 an issue outside the organisation is not found');
select is((select count(*)::int from ops.cafe_receipts where id = current_setting('app.r2')::uuid)
          + (select count(*)::int from ops.cafe_receipt_lines where receipt_id = current_setting('app.r2')::uuid)
          + (select count(*)::int from ops.cafe_receipt_issues where receipt_id = current_setting('app.r2')::uuid), 0,
  'NFR-1001 procurement reads no Submitted receipt, none of its lines and none of its issues');
select is((select count(*)::int from ops.list_cafe_receipt_photos(array[current_setting('app.r2')::uuid])), 0,
  'NFR-1001 procurement lists no photo of a Submitted receipt');
select ok(not ops.can_read_cafe_receipt_photo(current_setting('app.r2_photo')),
  'NFR-1001 procurement may not sign a Submitted receipt''s photo');
-- C8: more Approved receipts, each with an open no-PO issue, then procurement's three reads. The
-- stream check may run only for receipts that are not Approved; a policy that tests it before the
-- capability runs it for every Approved receipt as well.
do $$
declare
  v_receipt uuid;
begin
  for i in 1..30 loop
    perform shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
    v_receipt := (ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
      gen_random_uuid(), jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.sugar_kg'), 'quantity', '1'))) ->> 'receipt_id')::uuid;
    perform ops.send_cafe_receipt_for_review(v_receipt, 1, null);
    perform shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
    perform ops.review_cafe_receipt(v_receipt, 'approve', 2, null);
  end loop;
end;
$$;
reset role;
select set_config('app.not_approved', (select count(*)::text from ops.cafe_receipts
  where org_id = '00000000-0000-0000-0000-0000000000a1' and status <> 'Approved'), true);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select set_config('app.stream_calls', pg_stat_get_xact_function_calls('ops.can_review_stream(uuid,text)'::regprocedure)::text, true);
select count(*) from ops.cafe_receipts;
select cmp_ok(pg_stat_get_xact_function_calls('ops.can_review_stream(uuid,text)'::regprocedure) - current_setting('app.stream_calls')::bigint,
  '<=', current_setting('app.not_approved')::bigint,
  'C8 procurement reads the receipts with the per-row stream check only for those not Approved');
select set_config('app.stream_calls', pg_stat_get_xact_function_calls('ops.can_review_stream(uuid,text)'::regprocedure)::text, true);
select count(*) from ops.cafe_receipt_issues where status = 'open';
select cmp_ok(pg_stat_get_xact_function_calls('ops.can_review_stream(uuid,text)'::regprocedure) - current_setting('app.stream_calls')::bigint,
  '<=', current_setting('app.not_approved')::bigint,
  'C8 procurement counts the open issues with the per-row stream check only for receipts not Approved');
select set_config('app.stream_calls', pg_stat_get_xact_function_calls('ops.can_review_stream(uuid,text)'::regprocedure)::text, true);
select count(*) from ops.cafe_receipt_portions;
select cmp_ok(pg_stat_get_xact_function_calls('ops.can_review_stream(uuid,text)'::regprocedure) - current_setting('app.stream_calls')::bigint,
  '<=', current_setting('app.not_approved')::bigint,
  'C8 procurement reads the portions with the per-row stream check only for receipts not Approved');

select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipt_issues where receipt_id = current_setting('app.r1')::uuid), 5,
  'AC-1035 the receiver reads the issues on their own receipt');
select throws_ok($$select ops.close_cafe_receipt_issue(current_setting('app.short')::uuid, 'handled')$$,
  '42501', null, 'AC-1035 the receiver cannot close an issue');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipt_issues), 0, 'AC-1035 another floor member reads none of these issues');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.link_cafe_receipt_issue(current_setting('app.no_po')::uuid, 'PO-SYNTH-1431-A')$$,
  '42501', null, 'AC-1035 the stream supervisor cannot link an issue');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.close_cafe_receipt_issue(current_setting('app.short')::uuid, 'handled')$$,
  '42501', null, 'AC-1035 an ops lead cannot close an issue');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select throws_ok($$select ops.cafe_receipt_issue_open_pos(current_setting('app.no_po')::uuid)$$,
  '42501', null, 'AC-1035 an admin without the capability cannot use the PO picker');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_receipt_issues) + (select count(*)::int from ops.cafe_receipts), 0,
  'AC-1035 another organisation''s admin reads no issue or receipt');
select throws_ok($$select ops.close_cafe_receipt_issue(current_setting('app.short')::uuid, 'handled')$$,
  '42501', null, 'AC-1035 another organisation''s admin cannot act on an issue');
reset role;

-- ── The PO data must be current; procurement may ask for a refresh ───────────────────────────
set local role service_role;
select ops.mark_cafe_open_pos_stale('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', 'timeout');
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select throws_ok($$select ops.link_cafe_receipt_issue(current_setting('app.no_po')::uuid, 'PO-SYNTH-1431-A')$$,
  '55000', null, 'FR-1035 a link refuses PO data that is not current');
select is((ops.cafe_receipt_issue_open_pos(current_setting('app.no_po')::uuid) ->> 'is_current')::boolean, false,
  'FR-1035 the picker says the PO data is not current');
select ok(ops.request_cafe_receipt_issue_po_refresh(current_setting('app.no_po')::uuid) ->> 'requested_at' is not null,
  'FR-1032 procurement asks the worker to refresh the branch''s PO data');
reset role;

-- Procurement raised POs in ESB; the worker's refresh brings them in. LATE is dated yesterday
-- (the arrival date) but ESB created it today; EQUAL was created on the arrival date; FUTURE is
-- dated the day after arrival; bf02 has its own sugar PO.
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01', now(), 360,
  jsonb_build_array(
    jsonb_build_object('po_number', 'PO-SYNTH-1431-A', 'supplier_name', 'Synthetic supplier one',
      'po_date', (current_date - 10)::text, 'esb_created_at', null, 'esb_status', 'Receiving',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 5),
        jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'item_name', 'Milk (ESB)', 'unit_name', 'l', 'outstanding_quantity', 6))),
    jsonb_build_object('po_number', 'PO-SYNTH-1431-LATE', 'supplier_name', 'Synthetic supplier two',
      'po_date', current_setting('app.arrival'), 'esb_created_at', now()::text, 'esb_status', 'Authorized',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.sugar_kg'), 'item_name', 'Sugar (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 10),
        jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 1))),
    jsonb_build_object('po_number', 'PO-SYNTH-1431-EQUAL', 'supplier_name', 'Synthetic supplier three',
      'po_date', current_setting('app.arrival'), 'esb_created_at', current_setting('app.arrival') || ' 09:00:00+07', 'esb_status', 'Authorized',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 10),
        jsonb_build_object('item_unit_id', current_setting('app.bean_bag'), 'item_name', 'Coffee bean bag (ESB)', 'unit_name', 'bag', 'outstanding_quantity', 5))),
    jsonb_build_object('po_number', 'PO-SYNTH-1431-OLD', 'supplier_name', 'Synthetic supplier six',
      'po_date', (current_setting('app.arrival')::date - 5)::text, 'esb_created_at', null, 'esb_status', 'Receiving',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.sugar_kg'), 'item_name', 'Sugar (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 10),
        jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 10))),
    jsonb_build_object('po_number', 'PO-SYNTH-1431-FUTURE', 'supplier_name', 'Synthetic supplier four',
      'po_date', (current_setting('app.arrival')::date + 1)::text, 'esb_created_at', now()::text, 'esb_status', 'Authorized',
      'lines', jsonb_build_array(
        jsonb_build_object('item_unit_id', current_setting('app.sugar_kg'), 'item_name', 'Sugar (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 10)))));
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf02', now(), 360,
  jsonb_build_array(jsonb_build_object('po_number', 'PO-SYNTH-1431-BF02', 'supplier_name', 'Synthetic supplier five',
    'po_date', (current_date - 5)::text, 'esb_created_at', null, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.sugar_kg'), 'item_name', 'Sugar (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 10)))));
reset role;

-- ── AC-1032 / AC-1033 link ───────────────────────────────────────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select jsonb_agg(o ->> 'po_number' || ':' || (o ->> 'available') || ':' || (o ->> 'date_eligible') || ':' || (o ->> 'created_after_delivery') order by o ->> 'po_number')
             from jsonb_array_elements(ops.cafe_receipt_issue_open_pos(current_setting('app.no_po')::uuid) -> 'options') o),
  '["PO-SYNTH-1431-FUTURE:10:false:true", "PO-SYNTH-1431-LATE:10:true:true", "PO-SYNTH-1431-OLD:10:true:false"]'::jsonb,
  'FR-1035 the picker offers only same-branch open POs holding the item, with what each has left and which dates allow the link');
select is((select o ->> 'available' from jsonb_array_elements(ops.cafe_receipt_issue_open_pos(current_setting('app.over')::uuid) -> 'options') o
            where o ->> 'po_number' = 'PO-SYNTH-1431-A'), '0',
  'FR-1035 a PO whose outstanding is held by the receipt''s own matched portion has nothing left to link');
select throws_ok($$select ops.cafe_receipt_issue_open_pos(current_setting('app.short')::uuid)$$,
  '22023', null, 'FR-1034 an informational issue is not linked to a PO');
select throws_ok($$select ops.link_cafe_receipt_issue(current_setting('app.no_po')::uuid, 'PO-SYNTH-1431-FUTURE')$$,
  '22023', 'CAFE_RECEIPT_ISSUE_PO_AFTER_ARRIVAL: the PO must be dated on or before the arrival date',
  'AC-1032 a PO dated after arrival is refused with a plain explanation');
select throws_ok($$select ops.link_cafe_receipt_issue(current_setting('app.no_po')::uuid, 'PO-SYNTH-1431-BF02')$$,
  '22023', null, 'AC-1032 a PO of another branch is refused');
select throws_ok($$select ops.link_cafe_receipt_issue(current_setting('app.no_po')::uuid, 'PO-SYNTH-1431-A')$$,
  '22023', null, 'AC-1032 a PO without the item is refused');
select throws_ok($$select ops.link_cafe_receipt_issue(current_setting('app.no_po')::uuid, 'PO-SYNTH-1431-CLOSED')$$,
  '22023', null, 'AC-1032 a PO that is not open is refused');
select is(ops.link_cafe_receipt_issue(current_setting('app.no_po')::uuid, ' PO-SYNTH-1431-LATE ') - 'linked_po_number',
  jsonb_build_object('status', 'linked', 'matched_quantity', '3', 'remaining_quantity', '0', 'posting', 'held',
                     'po_created_after_delivery', true),
  'AC-1032 procurement links the PO-less sugar; with posting off its portion is held');
select ok((select status = 'linked' and linked_po_number = 'PO-SYNTH-1431-LATE' and linked_po_date = current_setting('app.arrival')::date
                  and linked_po_created_at is not null and po_created_after_delivery
                  and resolved_by = '00000000-0000-0000-0000-0000000000d6' and resolved_at is not null
             from ops.cafe_receipt_issues where id = current_setting('app.no_po')::uuid),
  'AC-1033 the issue records the PO, who linked it, when, and PO created after delivery');
select ok((select ops.cafe_receipt_line_po_created_after_delivery(l) from ops.cafe_receipt_lines l
            where l.id = current_setting('app.sugar_line')::uuid)
          and (select bool_and(q.po_created_after_delivery) from ops.cafe_receipt_portions q
                where q.line_id = current_setting('app.sugar_line')::uuid),
  'AC-1033 the receipt line and its posting portion read PO created after delivery');
select is((select array_agg(q.po_number || ':' || trim_scale(q.quantity)::text || ':' || q.state || ':' || q.hold_reason)
             from ops.cafe_receipt_portions q where q.line_id = current_setting('app.sugar_line')::uuid),
  array['PO-SYNTH-1431-LATE:3:held:posting_off'],
  'AC-1032 the link re-matches the portion once onto the PO, held while the branch posts nothing');
select throws_ok($$select ops.link_cafe_receipt_issue(current_setting('app.no_po')::uuid, 'PO-SYNTH-1431-LATE')$$,
  '22023', null, 'AC-1032 a linked issue cannot be linked again');

-- The over-delivered 2 kg of bean: LATE still has 1 kg, so 1 matches and 1 stays an open issue.
select is(ops.link_cafe_receipt_issue(current_setting('app.over')::uuid, 'PO-SYNTH-1431-LATE') ->> 'remaining_quantity', '1',
  'FR-1035 a link takes what the PO still has');
select is((select kind || ':' || trim_scale(quantity)::text || ':' || status from ops.cafe_receipt_issues where id = current_setting('app.over')::uuid),
  'over:1:open', 'FR-1035 the rest stays an open over-delivery issue');
select ok((select po_created_after_delivery from ops.cafe_receipt_issues where id = current_setting('app.over')::uuid)
          and (select po_created_after_delivery and issue_id = current_setting('app.over')::uuid from ops.cafe_receipt_portions
                where line_id = current_setting('app.bean_line')::uuid and po_number = 'PO-SYNTH-1431-LATE')
          and (select ops.cafe_receipt_line_po_created_after_delivery(l) from ops.cafe_receipt_lines l
                where l.id = current_setting('app.bean_line')::uuid),
  'AC-1033 a partial link to a PO created after delivery records it on the issue, its portion and the receipt line');
select throws_ok($$select ops.link_cafe_receipt_issue(current_setting('app.over')::uuid, 'PO-SYNTH-1431-LATE')$$,
  '22023', null, 'FR-1035 a PO with nothing left for the item is refused');
select is(ops.link_cafe_receipt_issue(current_setting('app.over')::uuid, 'PO-SYNTH-1431-EQUAL') ->> 'po_created_after_delivery', 'false',
  'AC-1033 a PO created on the arrival date records no flag');
select ok((select not po_created_after_delivery from ops.cafe_receipt_portions
            where issue_id = current_setting('app.over')::uuid and po_number = 'PO-SYNTH-1431-EQUAL'),
  'AC-1033 the portion linked to a PO created on the arrival date carries no flag');

-- With posting on and a receiving location, a link enqueues its portion once.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_posting_enabled('00000000-0000-0000-0000-00000000bf01', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is(ops.link_cafe_receipt_issue(current_setting('app.wrong_unit')::uuid, 'PO-SYNTH-1431-EQUAL') ->> 'posting', 'queued',
  'AC-1032 with posting on, the linked portion is queued');
select ok((select status = 'linked' and not po_created_after_delivery from ops.cafe_receipt_issues where id = current_setting('app.wrong_unit')::uuid),
  'AC-1033 an issue linked only to a PO created on the arrival date carries no flag');
reset role;
select is((select count(*)::int || '/' || count(distinct e.push_group_id)::int from integrations.esb_push e
            where e.source_module = 'cafe_receipt' and e.payload ->> 'receipt_id' = current_setting('app.r1')),
  '1/1', 'AC-1032 the linked portion is enqueued exactly once, in its own group');
select ok((select e.payload ->> 'po_number' = 'PO-SYNTH-1431-EQUAL' and e.payload ->> 'item_unit_id' = current_setting('app.bean_bag')
                  and (e.payload ->> 'quantity')::numeric = 1 and e.payload ->> 'arrival_date' = current_setting('app.arrival')
             from integrations.esb_push e where e.source_module = 'cafe_receipt' and e.payload ->> 'receipt_id' = current_setting('app.r1')),
  'FR-1024 the member carries the linked PO, the product detail, the quantity and the arrival date');

-- ── AC-1034 close ────────────────────────────────────────────────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select throws_ok($$select ops.close_cafe_receipt_issue(current_setting('app.short')::uuid, '   ')$$,
  '22023', null, 'AC-1034 closing without a note is refused');
select throws_ok($$select ops.close_cafe_receipt_issue(current_setting('app.short')::uuid, repeat('x', 501))$$,
  '22023', null, 'AC-1034 a note over 500 characters is refused');
select is(ops.close_cafe_receipt_issue(current_setting('app.damaged')::uuid, '  Supplier credits the torn bag  ') ->> 'status', 'closed',
  'AC-1034 procurement closes an issue with a note');
select ok((select status = 'closed' and closed_note = 'Supplier credits the torn bag'
                  and resolved_by = '00000000-0000-0000-0000-0000000000d6' and resolved_at is not null
             from ops.cafe_receipt_issues where id = current_setting('app.damaged')::uuid),
  'AC-1034 the closed issue keeps its note, who closed it and when');
reset role;
select ok((select received_quantity = 1 and conditions = array['damaged_wrong'] and condition_reason = 'Bag torn open on arrival'
             from ops.cafe_receipt_lines where id = current_setting('app.bag_line')::uuid)
          and (select count(*) = 1 from storage.objects where bucket_id = 'cafe-receipt-photos'
                and name like '%/' || current_setting('app.bag_line') || '/%'),
  'AC-1034 closing leaves the receipt line, its reason and its photo unchanged');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select throws_ok($$select ops.close_cafe_receipt_issue(current_setting('app.damaged')::uuid, 'again')$$,
  '22023', null, 'AC-1034 a closed issue cannot be closed again');

-- Revoking the capability ends it at once.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is(ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', false) ->> 'enabled', 'false',
  'FR-1040 an admin revokes the capability');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select throws_ok($$select ops.close_cafe_receipt_issue(current_setting('app.short')::uuid, 'handled')$$,
  '42501', null, 'FR-1040 a revoked holder cannot act');
select is((select count(*)::int from ops.cafe_receipt_issues), 0, 'FR-1040 a revoked holder reads no issue');

-- ── AC-1036 record history: approve, link, close, release and the grants leave who and when ──
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
-- LATE has since been received elsewhere for bean; sugar still fits on it. OLD, an older PO, has room for both.
reset role;
update ops.cafe_open_po_lines l set outstanding_quantity = 0
  from ops.cafe_open_pos p
 where p.id = l.po_id and p.po_number = 'PO-SYNTH-1431-LATE' and l.item_unit_id = current_setting('app.bean_kg')::uuid;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01');
reset role;
select is((select array_agg(q.po_number || ':' || trim_scale(q.quantity)::text || ':' || q.state || ':' || q.po_created_after_delivery order by q.created_at)
             from ops.cafe_receipt_portions q where q.line_id = current_setting('app.sugar_line')::uuid and q.state <> 'superseded'),
  array['PO-SYNTH-1431-LATE:3:queued:true'],
  'S1 a release posts a linked portion on the PO procurement picked, never an older one, and keeps its flag');
select is((select e.payload ->> 'po_number' from integrations.esb_push e
             join ops.cafe_receipt_portions q on q.push_id = e.id
            where q.line_id = current_setting('app.sugar_line')::uuid and q.state = 'queued'),
  'PO-SYNTH-1431-LATE', 'S1 the outbox member names the linked PO');
select is((select array_agg(q.po_number || ':' || trim_scale(q.quantity)::text || ':' || q.state || ':' || coalesce(q.hold_reason, '-') order by q.po_number)
             from ops.cafe_receipt_portions q
            where q.line_id = current_setting('app.bean_line')::uuid and q.issue_id is not null and q.state <> 'superseded'),
  array['PO-SYNTH-1431-EQUAL:1:queued:-'],
  'S8 a linked part its PO no longer has room for leaves the posting path; the part that fits stays queued');
select is((select kind || ':' || trim_scale(quantity)::text || ':' || status || ':' || coalesce(linked_po_number, '-') || ':'
                  || coalesce(reopened_po_number, '-') || ':' || (resolved_by is null and resolved_at is null)
             from ops.cafe_receipt_issues where id = current_setting('app.over')::uuid),
  'over:1:open:-:PO-SYNTH-1431-LATE:true',
  'S8 that part is an open over-delivery issue again, naming the PO that had no room');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select ops.cafe_receipt_posting(r) ->> 'po_created_after_delivery' from ops.cafe_receipts r where r.id = current_setting('app.r1')::uuid),
  'true', 'FR-1038 the receipt''s posting state says a PO it posts against was created after delivery');
reset role;
select ok(exists (select 1 from shared.record_history h
                   where h.schema_name = 'ops' and h.table_name = 'cafe_receipts' and h.record_key = current_setting('app.r1')
                     and h.field_name = 'status' and h.new_value = 'Approved'
                     and h.actor_person_id = '00000000-0000-0000-0000-0000000000d4' and h.occurred_at is not null)
          and exists (select 1 from shared.record_history h
                   where h.table_name = 'cafe_receipt_lines' and h.record_key = current_setting('app.bag_line')
                     and h.action = 'insert' and h.actor_person_id = '00000000-0000-0000-0000-0000000000d5'),
  'AC-1036 the receipt''s approval and its lines'' capture record who and when');
select ok(exists (select 1 from shared.record_history h
                   where h.table_name = 'cafe_receipt_issues' and h.record_key = current_setting('app.no_po')
                     and h.field_name = 'status' and h.new_value = 'linked'
                     and h.actor_person_id = '00000000-0000-0000-0000-0000000000d6')
          and exists (select 1 from shared.record_history h
                   where h.table_name = 'cafe_receipt_issues' and h.record_key = current_setting('app.damaged')
                     and h.field_name = 'status' and h.new_value = 'closed'
                     and h.actor_person_id = '00000000-0000-0000-0000-0000000000d6'),
  'AC-1036 link and close record who and when on the issue');
select ok(exists (select 1 from shared.record_history h
                   join ops.cafe_receipt_portions q on q.id::text = h.record_key
                   where h.table_name = 'cafe_receipt_portions' and h.action = 'insert'
                     and q.line_id = current_setting('app.sugar_line')::uuid and q.po_number = 'PO-SYNTH-1431-LATE'
                     and h.actor_person_id = '00000000-0000-0000-0000-0000000000d6')
          and exists (select 1 from shared.record_history h
                   join ops.cafe_receipt_portions q on q.id::text = h.record_key
                   where h.table_name = 'cafe_receipt_portions' and q.receipt_id = current_setting('app.r1')::uuid
                     and h.actor_person_id = '00000000-0000-0000-0000-0000000000d2'),
  'AC-1036 the linked portion and the release''s re-match record who and when');
select is((select array_agg(coalesce(h.field_name, h.action) || ':' || h.actor_person_id::text order by h.action, h.field_name)
             from shared.record_history h where h.table_name = 'cafe_receipt_issue_access'),
  array['insert:00000000-0000-0000-0000-0000000000d3', 'revoked_at:00000000-0000-0000-0000-0000000000d3',
        'revoked_by:00000000-0000-0000-0000-0000000000d3'],
  'AC-1036 the capability''s grant and revoke record who and when');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ok((select count(*) > 0 from shared.record_history where table_name = 'cafe_receipt_issues'),
  'AC-1036 the stream supervisor reads the issues'' history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}');
select is((select count(*)::int from shared.record_history
            where table_name in ('cafe_receipts', 'cafe_receipt_lines', 'cafe_receipt_issues', 'cafe_receipt_portions', 'cafe_receipt_issue_access')),
  0, 'NFR-1001 a member who cannot read the receipt reads none of its history');
reset role;

-- ── S8 procurement links the re-opened part again ─────────────────────────────────────────────
select ok(exists (select 1 from shared.record_history h
                   where h.table_name = 'cafe_receipt_issues' and h.record_key = current_setting('app.over')
                     and h.field_name = 'status' and h.old_value = 'linked' and h.new_value = 'open'
                     and h.actor_person_id = '00000000-0000-0000-0000-0000000000d2'),
  'S8 the re-open records who and when, and history keeps the link it replaced');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is(ops.link_cafe_receipt_issue(current_setting('app.over')::uuid, 'PO-SYNTH-1431-OLD') - 'linked_po_number',
  jsonb_build_object('status', 'linked', 'matched_quantity', '1', 'remaining_quantity', '0', 'posting', 'queued',
                     'po_created_after_delivery', false),
  'S8 procurement links the re-opened part to another PO, and it is queued');
reset role;
select is((select array_agg(e.payload ->> 'po_number' || ':' || trim_scale((e.payload ->> 'quantity')::numeric)::text order by e.payload ->> 'po_number')
             from integrations.esb_push e
            where e.source_module = 'cafe_receipt' and e.payload ->> 'receipt_id' = current_setting('app.r1')
              and e.payload ->> 'item_unit_id' = current_setting('app.bean_kg')),
  array['PO-SYNTH-1431-A:5', 'PO-SYNTH-1431-EQUAL:1', 'PO-SYNTH-1431-OLD:1'],
  'S8 the re-linked part posts once, on the new PO, and nothing posts on the PO that had no room');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((ops.release_cafe_receipts('00000000-0000-0000-0000-00000000bf01') ->> 'queued_portions')::int, 0,
  'S8 a later release enqueues nothing new');
reset role;

-- A person archived while holding the capability can still have it removed.
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d1', true);
reset role;
update shared.people set archived_at = now() where id = '00000000-0000-0000-0000-0000000000d1';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select is(ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d1', false) ->> 'enabled', 'false',
  'FR-1040 an admin removes the capability from an archived person');
select throws_ok($$select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d1', true)$$,
  '22023', null, 'FR-1040 an archived person cannot be granted it');
reset role;

select * from finish();
rollback;
