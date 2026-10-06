-- #1427 — the worker-owned open-PO cache: who reads cached rows with quantities, the floor's
-- identity-only read (DD-CAFE-MVP-6), the post-lock difference labels and the refresh request.
begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1427-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1427-BEAN-KG","name":"PO cache coffee bean","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1427-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1427-BEAN-BAG","name":"PO cache coffee bean","category":"KITCHEN","unit_name":"bag","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1427-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1427-MILK","name":"PO cache milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);

select set_config('app.bean_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1427-BEAN'), true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1427-MILK'), true);
select set_config('app.bean_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1427-BEAN-KG'), true);
select set_config('app.bean_bag', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1427-BEAN-BAG'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1427-MILK'), true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ESB-P-1427-%';

-- Personas. Gordi HQ (bf01) has kitchen and bar streams; Rumah Rames (bf02) is another branch.
--   d5 kitchen shift member at bf01; d4 kitchen stream supervisor at bf01; d6 bar stream
--   supervisor at bf01; d7 kitchen shift member at bf02; d2 ops lead; b4 admin of another org.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d6'::uuid, 'gordi_hq_bar'),
               ('00000000-0000-0000-0000-0000000000d7'::uuid, 'rumah_rames_kitchen')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.bean_id')::uuid,
  'PO cache coffee bean', current_setting('app.bean_kg')::uuid,
  array[current_setting('app.bean_kg')::uuid, current_setting('app.bean_bag')::uuid], 'RAW', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'PO cache milk', current_setting('app.milk_l')::uuid,
  array[current_setting('app.milk_l')::uuid], 'RAW', true);
reset role;

-- The cached POs the worker writes. bf01 holds two open POs: the bean is on both (5 + 4 = 9 kg
-- outstanding), milk on the older one (4 l), and one ESB product with no MOS product detail.
select set_config('app.bf01_pos', jsonb_build_array(
  jsonb_build_object('po_number', 'PO-SYNTH-1427-A', 'supplier_name', 'Synthetic supplier one',
    'po_date', (current_date - 10)::text, 'esb_created_at', (now() - interval '10 days')::text, 'esb_status', 'Authorized',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 5),
      jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'item_name', 'Milk (ESB)', 'unit_name', 'l', 'outstanding_quantity', 4))),
  jsonb_build_object('po_number', 'PO-SYNTH-1427-B', 'supplier_name', 'Synthetic supplier two',
    'po_date', (current_date - 3)::text, 'esb_created_at', null, 'esb_status', 'Receiving',
    'lines', jsonb_build_array(
      jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 4),
      jsonb_build_object('item_unit_id', null, 'item_name', 'An ESB product MOS does not list', 'unit_name', 'pcs', 'outstanding_quantity', 2)))
)::text, true);

-- ── Shape and the write boundary ─────────────────────────────────────────────────────────────
select ok((select bool_and(c.relrowsecurity and c.relforcerowsecurity)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops'
              and c.relname in ('cafe_open_po_branches', 'cafe_open_pos', 'cafe_open_po_lines')
           having count(*) = 3),
          'NFR-1001 the open-PO cache tables force RLS');
select ok(not has_table_privilege('authenticated', 'ops.cafe_open_pos', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_open_pos', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_open_pos', 'DELETE')
          and not has_table_privilege('authenticated', 'ops.cafe_open_po_lines', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_open_po_lines', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_open_po_branches', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_open_po_branches', 'UPDATE'),
          'NFR-1006 no browser session writes the open-PO cache');
select ok(not has_function_privilege('authenticated', 'ops.replace_cafe_open_pos(uuid, uuid, timestamptz, integer, jsonb)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'ops.mark_cafe_open_pos_stale(uuid, uuid, text)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'ops.cafe_open_po_refresh_targets(uuid, text[], boolean)', 'EXECUTE'),
          'NFR-1006 only the worker refreshes the cache or marks it stale');

-- ── FR-1012 an empty cache: the difference is not yet known ──────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.r1', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1427000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '3'),
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '5'),
    jsonb_build_object('item_unit_id', current_setting('app.bean_bag'), 'quantity', '1')))->>'receipt_id', true);
select set_config('app.r2', ops.submit_cafe_receipt('00000000-0000-0000-0000-00000000bf01', 'kitchen', null,
  'f1427000-0000-0000-0000-000000000002', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '9')))->>'receipt_id', true);
select is((select array_agg(distinct outcome)
             from ops.cafe_receipt_po_differences(array[current_setting('app.r1')::uuid, current_setting('app.r2')::uuid])),
          array['unknown'], 'FR-1012 with no cached POs for the branch every line is "not yet known"');
select is((select count(*)::int
             from ops.cafe_receipt_po_differences(array[current_setting('app.r1')::uuid, current_setting('app.r2')::uuid])),
          4, 'FR-1012 an unknown difference still answers for every line');
select is(ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf01') -> 'purchase_orders',
          '[]'::jsonb, 'AC-1030 an empty cache gives the floor an empty identity list');
select is((ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf01') ->> 'is_current')::boolean,
          false, 'FR-1032 an empty cache is not current');
reset role;

-- ── FR-1031 the worker writes one branch's cache atomically ──────────────────────────────────
set local role service_role;
select lives_ok($$select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf01', now(), 360, current_setting('app.bf01_pos')::jsonb)$$,
  'FR-1031 the worker stores a branch''s open POs with an as-of time');
select lives_ok($$select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf02', now(), 360, jsonb_build_array(
    jsonb_build_object('po_number', 'PO-SYNTH-1427-C', 'supplier_name', 'Synthetic supplier three',
      'po_date', current_date::text, 'esb_created_at', null, 'esb_status', 'Authorized',
      'lines', jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.bean_kg'),
        'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg', 'outstanding_quantity', 10)))))$$,
  'FR-1031 each branch keeps its own cache');
select throws_ok($$select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf03', now(), 360, jsonb_build_array(
    jsonb_build_object('po_number', 'PO-SYNTH-1427-X', 'supplier_name', 'Synthetic', 'po_date', current_date::text,
      'esb_created_at', null, 'esb_status', 'Closed', 'lines', '[]'::jsonb)))$$,
  '23514', null, 'FR-1031 a PO that is not Authorized or Receiving is refused');
select throws_ok($$select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf03', now(), 360, jsonb_build_array(
    jsonb_build_object('po_number', 'PO-SYNTH-1427-Y', 'supplier_name', 'Synthetic', 'po_date', current_date::text,
      'esb_created_at', null, 'esb_status', 'Authorized', 'lines', jsonb_build_array(jsonb_build_object(
        'item_unit_id', 'f1427000-0000-0000-0000-0000000000ff', 'item_name', 'x', 'unit_name', 'kg', 'outstanding_quantity', 1)))))$$,
  '22023', null, 'NFR-1001 a line naming a product detail outside the organisation is refused');
select throws_ok($$select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf09', now(), 360, '[]'::jsonb)$$,
  '22023', null, 'NFR-1001 a branch of another organisation is refused');
select is((select count(*)::int from ops.cafe_open_pos where branch_id = '00000000-0000-0000-0000-00000000bf03'), 0,
          'FR-1031 a refused refresh writes nothing');
reset role;

-- ── AC-1030 cached rows with quantities: reviewers yes, the floor no, another org no ─────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select sum(l.outstanding_quantity) from ops.cafe_open_po_lines l
             join ops.cafe_open_pos p on p.id = l.po_id
            where p.branch_id = '00000000-0000-0000-0000-00000000bf01'
              and l.item_unit_id = current_setting('app.bean_kg')::uuid),
          9::numeric, 'AC-1030 a stream supervisor of the branch reads cached PO lines with quantities');
select is((select count(*)::int from ops.cafe_open_pos where branch_id = '00000000-0000-0000-0000-00000000bf02'), 0,
          'AC-1030 a supervisor reads no other branch''s cached POs');
select ok((select as_of is not null and not is_stale from ops.cafe_open_po_branches
            where branch_id = '00000000-0000-0000-0000-00000000bf01'),
          'FR-1032 a reviewer reads the branch cache''s as-of time');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select is((select count(*)::int from ops.cafe_open_pos where branch_id = '00000000-0000-0000-0000-00000000bf01'), 2,
          'AC-1030 the supervisor of another stream of the same branch reads its cached POs');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select is((select count(*)::int from ops.cafe_open_pos), 3, 'AC-1030 an ops lead reads every branch''s cached POs');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_open_pos) + (select count(*)::int from ops.cafe_open_po_lines)
          + (select count(*)::int from ops.cafe_open_po_branches), 0,
          'AC-1030 a floor member reads none of the cached PO rows');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_open_pos) + (select count(*)::int from ops.cafe_open_po_lines)
          + (select count(*)::int from ops.cafe_open_po_branches), 0,
          'AC-1030 another organisation''s admin reads no cached PO rows');
select throws_ok($$select ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf01')$$,
  '42501', null, 'AC-1030 another organisation''s identity read is refused');

-- ── AC-1030 / FR-1057 the floor's identity-only read of its own branch ───────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.ids', ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf01')::text, true);
select is((select array_agg(po ->> 'po_number' order by po ->> 'po_number')
             from jsonb_array_elements(current_setting('app.ids')::jsonb -> 'purchase_orders') po),
          array['PO-SYNTH-1427-A', 'PO-SYNTH-1427-B'],
          'AC-1030 a floor member lists their own branch''s open POs');
select is((select po -> 'items' from jsonb_array_elements(current_setting('app.ids')::jsonb -> 'purchase_orders') po
            where po ->> 'po_number' = 'PO-SYNTH-1427-B'),
          jsonb_build_array(
            jsonb_build_object('item_unit_id', null, 'item_name', 'An ESB product MOS does not list', 'unit_name', 'pcs'),
            jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'item_name', 'Coffee bean (ESB)', 'unit_name', 'kg')),
          'FR-1057 the identity read names each expected item and its unit');
select ok((select bool_and(po ? 'supplier_name' and po ? 'po_date' and po ? 'esb_created_at')
             from jsonb_array_elements(current_setting('app.ids')::jsonb -> 'purchase_orders') po),
          'FR-1057 the identity read carries supplier, PO date and ESB creation date');
select ok(current_setting('app.ids') !~* '(outstanding|quantit|price)',
          'AC-1030 the identity read carries no quantity or price');
select throws_ok($$select ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf02')$$,
  '42501', null, 'AC-1030 a floor member cannot read another branch''s open POs');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}');
select throws_ok($$select ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf01')$$,
  '42501', null, 'AC-1030 a floor member of another branch cannot read this branch''s open POs');
select is(jsonb_array_length(ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf02') -> 'purchase_orders'), 1,
          'AC-1030 ...and reads their own branch''s');
select shared._test_set_access_roles('{}');
select throws_ok($$select ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf01')$$,
  '42501', null, 'NFR-1001 a session with no organisation is refused');

-- ── FR-1012 after Lock counts: labels against summed outstanding, never a quantity ───────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select jsonb_object_agg(item_unit_id::text, outcome)
             from ops.cafe_receipt_po_differences(array[current_setting('app.r1')::uuid])),
          jsonb_build_object(current_setting('app.bean_kg'), 'short', current_setting('app.milk_l'), 'over',
                             current_setting('app.bean_bag'), 'no_open_po'),
          'FR-1012 3 kg against 5 + 4 kg is short, 5 l against 4 l is over, and another unit of an ordered product has no open PO');
select is((select outcome from ops.cafe_receipt_po_differences(array[current_setting('app.r2')::uuid])),
          'matches', 'FR-1012 9 kg against 5 + 4 kg outstanding matches');
select is((select string_agg(a, ',' order by n)
             from unnest((select proargnames from pg_proc where proname = 'cafe_receipt_po_differences'),
                         (select proargmodes::text[] from pg_proc where proname = 'cafe_receipt_po_differences')) with ordinality as u(a, m, n)
            where m = 't'),
          'receipt_id,line_id,item_unit_id,outcome,cache_as_of',
          'FR-1012 the difference returns labels and the as-of time, never an outstanding quantity');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member"]}');
select is((select count(*)::int from ops.cafe_receipt_po_differences(array[current_setting('app.r1')::uuid])), 0,
          'NFR-1001 another floor member gets no difference for a receipt they cannot read');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select count(*)::int from ops.cafe_receipt_po_differences(array[current_setting('app.r1')::uuid])
            where cache_as_of is not null), 3,
          'FR-1032 the stream reviewer reads the difference with the cache as-of time');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_receipt_po_differences(array[current_setting('app.r1')::uuid])), 0,
          'NFR-1001 another organisation gets no difference');
reset role;

-- ── FR-1032 a failed read keeps the previous cache, marked stale; an old cache is not known ──
set local role service_role;
select lives_ok($$select ops.mark_cafe_open_pos_stale('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf01', 'ESB list read failed: HTTP 503')$$,
  'FR-1032 the worker marks a branch stale after a failed read');
select is((select count(*)::int from ops.cafe_open_pos where branch_id = '00000000-0000-0000-0000-00000000bf01'), 2,
          'FR-1032 the previous cache is kept');
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select array_agg(distinct outcome) from ops.cafe_receipt_po_differences(array[current_setting('app.r1')::uuid])),
          array['unknown'], 'FR-1032 a stale cache makes the difference "not yet known" for the receiver');
select is((ops.cafe_open_po_identities('00000000-0000-0000-0000-00000000bf01') ->> 'is_current')::boolean, false,
          'FR-1032 the identity read says a stale cache is not current');
select is((select count(*)::int from ops.cafe_open_pos), 0,
          'AC-1030 with a stale cache a floor member still reads no cached PO rows');
reset role;
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf01', now() - interval '7 hours', 360, current_setting('app.bf01_pos')::jsonb);
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select array_agg(distinct outcome) from ops.cafe_receipt_po_differences(array[current_setting('app.r2')::uuid])),
          array['unknown'], 'FR-1032 a cache older than its configured age is "not yet known"');
reset role;

-- ── FR-1032 approving a receipt asks the worker to refresh that branch ───────────────────────
set local role service_role;
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf01', now(), 360, current_setting('app.bf01_pos')::jsonb);
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select ops.send_cafe_receipt_for_review(current_setting('app.r2')::uuid, 1, null);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select refresh_requested_at from ops.cafe_open_po_branches where branch_id = '00000000-0000-0000-0000-00000000bf01'),
          null, 'FR-1032 a fresh cache has no refresh outstanding');
select ops.review_cafe_receipt(current_setting('app.r2')::uuid, 'approve', 2, null);
select ok((select refresh_requested_at is not null from ops.cafe_open_po_branches
            where branch_id = '00000000-0000-0000-0000-00000000bf01'),
          'FR-1032 approving a receipt requests a refresh of its branch''s cache');
reset role;
set local role service_role;
select is((select array_agg(branch_code order by branch_code)
             from ops.cafe_open_po_refresh_targets('00000000-0000-0000-0000-0000000000a1',
                    array['gordi_hq', 'rumah_rames', 'b_branch'], true)),
          array['gordi_hq'], 'FR-1032 the worker''s on-demand pass finds only the branch with a refresh request');
select is((select array_agg(branch_code order by branch_code)
             from ops.cafe_open_po_refresh_targets('00000000-0000-0000-0000-0000000000a1',
                    array['gordi_hq', 'rumah_rames', 'b_branch'], false)),
          array['gordi_hq', 'rumah_rames'], 'FR-1032 the scheduled pass resolves the mapped codes within one organisation only');
-- The worker's as-of is when its read began, which is after the request.
select ops.replace_cafe_open_pos('00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-00000000bf01', clock_timestamp(), 360, current_setting('app.bf01_pos')::jsonb);
select ok((select refresh_requested_at is null and not is_stale and last_error is null
             from ops.cafe_open_po_branches where branch_id = '00000000-0000-0000-0000-00000000bf01'),
          'FR-1032 a successful refresh clears the request and the stale mark');
reset role;

select * from finish();
rollback;
