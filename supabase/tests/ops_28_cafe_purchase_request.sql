-- #1428 — Café purchase request: blank request from a stream, supervisor approval with no
-- self-approval (ops lead and admin included), the freeze and the org seam.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1428-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1428-BEAN-KG","name":"Request coffee bean","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1428-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1428-BEAN-BAG","name":"Request coffee bean","category":"KITCHEN","unit_name":"bag","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1428-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1428-MILK","name":"Request milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1428-UNCONF","esb_product_detail_id":"SYNTH-ESB-PD-1428-UNCONF","name":"Request unconfirmed item","category":"KITCHEN","unit_name":"box","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);

select set_config('app.bean_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1428-BEAN'), true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1428-MILK'), true);
select set_config('app.unconf_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1428-UNCONF'), true);
select set_config('app.bean_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1428-BEAN-KG'), true);
select set_config('app.bean_bag', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1428-BEAN-BAG'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1428-MILK'), true);
select set_config('app.unconf_box', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1428-UNCONF'), true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ESB-P-1428-%';
select set_config('app.today', ((now() at time zone 'Asia/Jakarta')::date)::text, true);

-- Personas. Every stream below is in Gordi HQ (bf01): kitchen and bar.
--   d5 kitchen shift member; d4 kitchen stream supervisor; d6 bar stream supervisor;
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
  'Request coffee bean', current_setting('app.bean_kg')::uuid,
  array[current_setting('app.bean_kg')::uuid, current_setting('app.bean_bag')::uuid], 'RAW', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'Request milk', current_setting('app.milk_l')::uuid,
  array[current_setting('app.milk_l')::uuid], 'RAW', true);
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.unconf_id')::uuid,
  'Request unconfirmed item', current_setting('app.unconf_box')::uuid,
  array[current_setting('app.unconf_box')::uuid], 'RAW', true);
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000bf01',
        'bar', current_setting('app.milk_id')::uuid, 'manual')
on conflict (org_id, branch_id, activity, wip_item_id) do nothing;
select ops.save_cafe_item_settings(
  '00000000-0000-0000-0000-00000000bf01', 'bar', current_setting('app.milk_id')::uuid,
  'Request milk', current_setting('app.milk_l')::uuid,
  array[current_setting('app.milk_l')::uuid], 'RAW', true);
reset role;
update ops.item_units set confirmed_at = null where id = current_setting('app.unconf_box')::uuid;
select set_config('app.outbox_before', (select count(*)::text from integrations.esb_push), true);

-- ── Shape and the org seam ───────────────────────────────────────────────────────────────────
select ok((select bool_and(c.relrowsecurity and c.relforcerowsecurity)
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops'
              and c.relname in ('cafe_purchase_requests', 'cafe_purchase_request_lines')
           having count(*) = 2),
          'NFR-1001 purchase requests and their lines force RLS');
select ok(not has_table_privilege('authenticated', 'ops.cafe_purchase_requests', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_purchase_requests', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_purchase_requests', 'DELETE')
          and not has_table_privilege('authenticated', 'ops.cafe_purchase_request_lines', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_purchase_request_lines', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_purchase_request_lines', 'DELETE'),
          'NFR-1001 browsers write requests only through the server functions');
select ok(not exists (
            select 1 from information_schema.columns
             where table_schema = 'ops' and table_name in ('cafe_purchase_requests', 'cafe_purchase_request_lines')
               and (column_name ~ '(process|purchase_type|transfer|price|supplier)')),
          'FR-1052 a request stores no purchase-versus-transfer, process, supplier or price choice');

-- ── FR-1051 who may raise, and which items ───────────────────────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000b8","access_roles":["member"]}');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  '%s', null, 'f1428000-0000-0000-0000-0000000000e1', '[{"item_unit_id":"%s","quantity":"2"}]'::jsonb)$$,
  current_setting('app.today'), current_setting('app.milk_l')), '42501', null,
  'FR-1051 a person outside the café cannot raise a request');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  '%s', null, 'f1428000-0000-0000-0000-0000000000a1', '[{"item_unit_id":"%s","quantity":"2"}]'::jsonb)$$,
  current_setting('app.today'), current_setting('app.unconf_box')), '23514', null,
  'FR-1051 a line for an unconfirmed ESB product detail is refused');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'bar',
  '%s', null, 'f1428000-0000-0000-0000-0000000000a2', '[{"item_unit_id":"%s","quantity":"2"}]'::jsonb)$$,
  current_setting('app.today'), current_setting('app.bean_kg')), '23514', null,
  'FR-1051 a line for an item outside the stream is refused');
select is((select count(*)::int from ops.cafe_purchase_requests), 0,
          'FR-1051 a refused line leaves no partial request behind');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  '%s', null, 'f1428000-0000-0000-0000-0000000000a3', '[{"item_unit_id":"%s","quantity":"0"}]'::jsonb)$$,
  current_setting('app.today'), current_setting('app.milk_l')), '22023', null,
  'FR-1051 a zero quantity is not a requested line');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  '%s', null, 'f1428000-0000-0000-0000-0000000000a4', '[]'::jsonb)$$,
  current_setting('app.today')), '22023', null, 'FR-1051 a request needs at least one line');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  null, null, 'f1428000-0000-0000-0000-0000000000a5', '[{"item_unit_id":"%s","quantity":"1"}]'::jsonb)$$,
  current_setting('app.milk_l')), '22023', null, 'FR-1051 a request needs a required-by date');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  '%s'::date - 1, null, 'f1428000-0000-0000-0000-0000000000a6', '[{"item_unit_id":"%s","quantity":"1"}]'::jsonb)$$,
  current_setting('app.today'), current_setting('app.milk_l')), '23514', null,
  'FR-1051 a required-by date in the past is refused');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  '%s'::date + 91, null, 'f1428000-0000-0000-0000-0000000000a7', '[{"item_unit_id":"%s","quantity":"1"}]'::jsonb)$$,
  current_setting('app.today'), current_setting('app.milk_l')), '23514', null,
  'FR-1051 a required-by date more than 90 days ahead is refused');

-- ── FR-1051 / NFR-1001 create: server-stamped, straight to Submitted, idempotent ────────────
select set_config('app.q1', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  current_setting('app.today')::date + 2, '  For the weekend menu  ',
  'f1428000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.bean_bag'), 'quantity', '2,5',
      'org_id', '00000000-0000-0000-0000-0000000000b1', 'requested_by', '00000000-0000-0000-0000-0000000000d3',
      'status', 'Approved', 'source', 'esb', 'process', 'transfer',
      'item_name', 'Client renamed', 'unit_name', 'tonne'),
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '12')))::text, true);
select set_config('app.q1_id', current_setting('app.q1')::jsonb ->> 'request_id', true);
select is(current_setting('app.q1')::jsonb ->> 'outcome', 'created', 'FR-1051 the first send creates the request');
select ok((select org_id = '00000000-0000-0000-0000-0000000000a1'
                  and requested_by = '00000000-0000-0000-0000-0000000000d5'
                  and source = 'mos' and status = 'Submitted' and row_version = 1
                  and required_by = current_setting('app.today')::date + 2
                  and note = 'For the weekend menu'
                  and reviewed_by is null and reviewed_at is null
             from ops.cafe_purchase_requests where id = current_setting('app.q1_id')::uuid),
          'NFR-1001 organisation, requester, source and status are server-stamped; the request routes for approval at once');
select ok((select bool_and(org_id = '00000000-0000-0000-0000-0000000000a1')
                  and bool_or(item_unit_id = current_setting('app.bean_bag')::uuid and unit_name = 'bag'
                              and item_name = 'Request coffee bean' and quantity = 2.5)
                  and count(*) = 2
             from ops.cafe_purchase_request_lines where request_id = current_setting('app.q1_id')::uuid),
          'FR-1051 each line keeps the chosen ESB product detail and typed quantity; names come from the server');
select set_config('app.q1_retry', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  current_setting('app.today')::date + 2, 'For the weekend menu',
  'f1428000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '12'),
    jsonb_build_object('item_unit_id', current_setting('app.bean_bag'), 'quantity', '2.5')))::text, true);
select is(current_setting('app.q1_retry')::jsonb ->> 'request_id', current_setting('app.q1_id'),
          'FR-1051 a repeated send with the same key returns the existing request');
select is((select count(*)::int from ops.cafe_purchase_requests where client_key = 'f1428000-0000-0000-0000-000000000001'), 1,
          'FR-1051 a double tap never creates a second request');
select throws_ok(format($$select ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  '%s', null, 'f1428000-0000-0000-0000-000000000001', '[{"item_unit_id":"%s","quantity":"9"}]'::jsonb)$$,
  current_setting('app.today'), current_setting('app.milk_l')), '23505', null,
  'FR-1051 the same key with different lines is a conflict, never a second request');

-- Requests raised by a supervisor (kitchen), an ops lead (kitchen), an admin (bar) and a bar supervisor.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select set_config('app.q_sup', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  current_setting('app.today')::date, null, 'f1428000-0000-0000-0000-0000000000d4',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '7')))::jsonb ->> 'request_id', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select set_config('app.q_lead', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  current_setting('app.today')::date, null, 'f1428000-0000-0000-0000-0000000000d2',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '4')))::jsonb ->> 'request_id', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select set_config('app.q_admin', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'bar',
  current_setting('app.today')::date, null, 'f1428000-0000-0000-0000-0000000000d3',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '5')))::jsonb ->> 'request_id', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select set_config('app.q_bar', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'bar',
  current_setting('app.today')::date, null, 'f1428000-0000-0000-0000-0000000000d6',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '6')))::jsonb ->> 'request_id', true);

-- ── FR-1053 routing: the stream's supervisor, ops lead and admin as fallback ─────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select set_eq($$select id from ops.cafe_purchase_requests where status = 'Submitted'$$,
  format($$values ('%s'::uuid), ('%s'::uuid), ('%s'::uuid)$$,
         current_setting('app.q1_id'), current_setting('app.q_sup'), current_setting('app.q_lead')),
  'FR-1053 a kitchen supervisor''s queue holds only kitchen requests');
select is((select count(*)::int from ops.cafe_purchase_request_lines where request_id = current_setting('app.q1_id')::uuid), 2,
          'FR-1053 the supervisor reads the request''s lines');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select set_eq($$select id from ops.cafe_purchase_requests where status = 'Submitted'$$,
  format($$values ('%s'::uuid), ('%s'::uuid)$$, current_setting('app.q_admin'), current_setting('app.q_bar')),
  'FR-1053 a bar supervisor''s queue holds only bar requests');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member","ops_lead"]}');
select is((select count(*)::int from ops.cafe_purchase_requests where status = 'Submitted'), 5,
          'FR-1053 an ops lead sees every stream''s requests');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_eq($$select id from ops.cafe_purchase_requests$$,
  format($$values ('%s'::uuid)$$, current_setting('app.q1_id')),
  'NFR-1001 a shift member reads only their own requests');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_sup')::uuid, 'approve', 1, null)$$,
  'P0002', null, 'FR-1053 a shift member cannot see, let alone decide, another person''s request');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_purchase_requests) + (select count(*)::int from ops.cafe_purchase_request_lines), 0,
          'NFR-1001 another organisation reads no requests or lines');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q1_id')::uuid, 'approve', 1, null)$$,
  'P0002', null, 'NFR-1001 another organisation cannot decide a request');
select shared._test_set_access_roles('{}');
select is((select count(*)::int from ops.cafe_purchase_requests), 0, 'NFR-1001 a missing org claim fails closed');

-- ── NFR-1002 decisions only through the versioned review function ────────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$update ops.cafe_purchase_requests set status = 'Approved' where id = current_setting('app.q1_id')::uuid$$,
  '42501', null, 'NFR-1002 a direct UPDATE to Approved is refused');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q1_id')::uuid, 'approve', 7, null)$$,
  'P0019', null, 'NFR-1002 a stale version token is refused');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q1_id')::uuid, 'approve', 1, null)$$,
  'P0002', null, 'FR-1053 another stream''s supervisor cannot see or approve the request');

-- ── AC-1041 the requester never approves, ops lead and admin included ────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_sup')::uuid, 'approve', 1, null)$$,
  '42501', null, 'AC-1041 a supervisor requester cannot approve their own request');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_lead')::uuid, 'approve', 1, null)$$,
  '42501', null, 'AC-1041 an ops lead requester cannot approve their own request');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_admin')::uuid, 'approve', 1, null)$$,
  '42501', null, 'AC-1041 an admin requester cannot approve their own request');
reset role;
select set_config('request.jwt.claims', '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3"}', true);
select set_config('app.cafe_purchase_request_action', 'decide', true);
select throws_ok($$update ops.cafe_purchase_requests
  set status = 'Approved', reviewed_by = '00000000-0000-0000-0000-0000000000d3', reviewed_at = now(), row_version = row_version + 1
  where id = current_setting('app.q_admin')::uuid$$,
  '42501', null, 'AC-1041 the table itself refuses a self-approval, whatever path reaches it');
select set_config('app.cafe_purchase_request_action', '', true);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select set_config('app.q1_decision', ops.review_cafe_purchase_request(current_setting('app.q1_id')::uuid, 'approve', 1, null)::text, true);
select ok((select status = 'Approved' and reviewed_by = '00000000-0000-0000-0000-0000000000d4'
                  and reviewed_at is not null and row_version = 2
             from ops.cafe_purchase_requests where id = current_setting('app.q1_id')::uuid),
          'AC-1041 another supervisor of the stream approves; reviewer and time are stamped');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select lives_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_sup')::uuid, 'approve', 1, null)$$,
  'AC-1041 an ops lead approves the supervisor''s request as fallback');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d1","access_roles":["member","admin"]}');
select lives_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_admin')::uuid, 'approve', 1, null)$$,
  'AC-1041 another admin approves the admin''s request');

-- ── Reject needs a note; the requester may withdraw (reject) their own ──────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_bar')::uuid, 'reject', 1, '   ')$$,
  '22023', null, 'FR-1053 a reject without a note is refused');
select lives_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_bar')::uuid, 'reject', 1, 'Raised twice; keep the other one')$$,
  'FR-1053 a requester who reviews the stream may withdraw their own request with a note');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d7","access_roles":["member","ops_lead"]}');
select lives_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_lead')::uuid, 'reject', 1, 'Order through the weekly list')$$,
  'FR-1053 another ops lead rejects the ops lead''s request with a note');

-- ── AC-1041 / FR-1056 Approved and Rejected are frozen ───────────────────────────────────────
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q_lead')::uuid, 'approve', 2, null)$$,
  'P0018', null, 'FR-1056 a Rejected request cannot be decided again');
select throws_ok($$select ops.review_cafe_purchase_request(current_setting('app.q1_id')::uuid, 'reject', 2, 'late')$$,
  'P0018', null, 'FR-1056 an Approved request cannot be decided again');
reset role;
select set_config('request.jwt.claims', '{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2"}', true);
select throws_ok($$update ops.cafe_purchase_requests set note = 'changed' where id = current_setting('app.q1_id')::uuid$$,
  '42501', null, 'AC-1041 an Approved request''s facts cannot be updated, even by the table owner');
select throws_ok($$update ops.cafe_purchase_requests set required_by = required_by + 1 where id = current_setting('app.q_lead')::uuid$$,
  '42501', null, 'AC-1041 a Rejected request cannot be updated');
select set_config('app.cafe_purchase_request_action', 'decide', true);
select throws_ok($$update ops.cafe_purchase_requests set status = 'Rejected' where id = current_setting('app.q1_id')::uuid$$,
  '42501', null, 'AC-1041 even the decision action cannot reopen an Approved request');
select set_config('app.cafe_purchase_request_action', '', true);
select throws_ok($$update ops.cafe_purchase_request_lines set quantity = 1
  where request_id = current_setting('app.q1_id')::uuid$$,
  '42501', null, 'FR-1056 a request''s lines cannot be updated');

select is((select count(*)::text from integrations.esb_push), current_setting('app.outbox_before'),
          'FR-1055 an approved request writes nothing to the ESB outbox while posting is off');

select * from finish();
rollback;
