-- #1432 — the database side of purchase-request posting: the admin-only request-posting switch
-- (default off), the enqueue at approval only while it is on, the member payload the worker
-- composes from, and the posting read.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-ESB-P-1432-BEAN","esb_product_detail_id":"SYNTH-ESB-PD-1432-BEAN-KG","name":"Posting request bean","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true},
  {"esb_product_id":"SYNTH-ESB-P-1432-MILK","esb_product_detail_id":"SYNTH-ESB-PD-1432-MILK","name":"Posting request milk","category":"KITCHEN","unit_name":"l","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select ops.refresh_cafe_stream_items((select jsonb_agg(jsonb_build_object('esb_product_id', item.esb_product_id, 'branch_code', branch))
  from ops.wip_items item cross join unnest(array['gordi_hq','rumah_rames']) branch
  where item.org_id='00000000-0000-0000-0000-0000000000a1' and item.esb_product_id like 'SYNTH-ESB-P-1432-%'));
select set_config('app.allow_test_seeds', 'off', true);

select set_config('app.bean_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1432-BEAN'), true);
select set_config('app.milk_id', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-ESB-P-1432-MILK'), true);
select set_config('app.bean_kg', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1432-BEAN-KG'), true);
select set_config('app.milk_l', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-ESB-PD-1432-MILK'), true);
update ops.item_units set confirmed_at = now() where esb_product_id like 'SYNTH-ESB-P-1432-%';
select set_config('app.today', ((now() at time zone 'Asia/Jakarta')::date)::text, true);
set local app.esb_target_env = 'goo';

-- Personas: d5 kitchen shift member at bf01, d4 its stream supervisor, d2 ops lead, d3 admin.
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', p.person_id, t.id, true, current_date - 1
  from (values ('00000000-0000-0000-0000-0000000000d5'::uuid, 'gordi_hq_kitchen'),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 'gordi_hq_kitchen')) as p(person_id, team_code)
  join shared.teams t on t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = p.team_code;

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.bean_id')::uuid,
  'Posting request bean', current_setting('app.bean_kg')::uuid, array[current_setting('app.bean_kg')::uuid], 'RAW', true);
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.milk_id')::uuid,
  'Posting request milk', current_setting('app.milk_l')::uuid, array[current_setting('app.milk_l')::uuid], 'RAW', true);

-- Three requests from the shift member: q1 is approved while posting is off, q2 while it is on,
-- q3 is rejected while it is on.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.q1', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  current_setting('app.today')::date + 3, null, 'f1432000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '4')))->>'request_id', true);
select set_config('app.q2', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  current_setting('app.today')::date + 5, 'For the weekend', 'f1432000-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.bean_kg'), 'quantity', '2,5'),
                    jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '12')))->>'request_id', true);
select set_config('app.q3', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  current_setting('app.today')::date + 1, null, 'f1432000-0000-0000-0000-000000000003',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.milk_l'), 'quantity', '1')))->>'request_id', true);
reset role;

-- ── The switch: fail closed, admin-only, written only through the RPC ───────────────────────
select ok((select c.relrowsecurity and c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'ops' and c.relname = 'cafe_purchase_request_posting_switches'),
          'NFR-1001 the request-posting switch forces RLS');
select ok(not has_table_privilege('authenticated', 'ops.cafe_purchase_request_posting_switches', 'INSERT')
          and not has_table_privilege('authenticated', 'ops.cafe_purchase_request_posting_switches', 'UPDATE')
          and not has_table_privilege('authenticated', 'ops.cafe_purchase_request_posting_switches', 'DELETE')
          and not has_table_privilege('service_role', 'ops.cafe_purchase_request_posting_switches', 'UPDATE'),
          'FR-1055 nobody writes the switch table directly, the worker included');
select ok(not has_function_privilege('authenticated', 'ops._enqueue_cafe_purchase_request(uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'ops._enqueue_cafe_purchase_request(uuid)', 'EXECUTE')
          and not has_function_privilege('anon', 'ops._enqueue_cafe_purchase_request(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'ops._enqueue_approved_cafe_purchase_request()', 'EXECUTE'),
          'FR-1054 the enqueue is reachable only through the approval trigger');
select ok(not has_function_privilege('anon', 'ops.set_cafe_purchase_request_posting_enabled(uuid, boolean)', 'EXECUTE')
          and not has_function_privilege('anon', 'ops.cafe_purchase_request_posting(ops.cafe_purchase_requests)', 'EXECUTE'),
          'NFR-1001 the switch writer and the posting read are closed to anon');
select is((select count(*)::int from ops.cafe_purchase_request_posting_switches), 0,
          'FR-1055 no branch has a request-posting switch row until an admin writes one');

set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.set_cafe_purchase_request_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  '42501', 'CAFE_PURCHASE_REQUEST_POSTING_ADMIN_ONLY', 'FR-1055 an ops lead cannot turn request posting on');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.set_cafe_purchase_request_posting_enabled('00000000-0000-0000-0000-00000000bf01', true)$$,
  '42501', 'CAFE_PURCHASE_REQUEST_POSTING_ADMIN_ONLY', 'FR-1055 a stream supervisor cannot turn request posting on');

-- ── FR-1055 approved with the switch off: nothing enqueued, approved, not posted ────────────
select ops.review_cafe_purchase_request(current_setting('app.q1')::uuid, 'approve', 1, null);
reset role;
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_purchase_request')
          + (select count(*)::int from integrations.esb_push_groups where source_module = 'cafe_purchase_request'), 0,
          'FR-1055 a request approved while posting is off writes nothing to the outbox');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select ops.cafe_purchase_request_posting(r) from ops.cafe_purchase_requests r where r.id = current_setting('app.q1')::uuid),
          '{"state": "not_posted"}'::jsonb, 'FR-1055 its requester reads it as approved, not posted');

-- ── The admin turns the branch on ───────────────────────────────────────────────────────────
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select throws_ok($$select ops.set_cafe_purchase_request_posting_enabled('00000000-0000-0000-0000-0000000000ff', true)$$,
  '22023', 'CAFE_PURCHASE_REQUEST_POSTING_BRANCH_INVALID', 'FR-1055 a branch outside the org is refused');
select is(ops.set_cafe_purchase_request_posting_enabled('00000000-0000-0000-0000-00000000bf01', true) ->> 'posting_enabled', 'true',
          'FR-1055 an admin turns request posting on for a branch');
reset role;
select is((select count(*)::int from integrations.esb_push where source_module = 'cafe_purchase_request'), 0,
          'FR-1055 turning the switch on enqueues nothing by itself, not even a request approved earlier');

-- ── FR-1054 approved with the switch on: one group, one member per line ─────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select ops.review_cafe_purchase_request(current_setting('app.q2')::uuid, 'approve', 1, null);
select ops.review_cafe_purchase_request(current_setting('app.q3')::uuid, 'reject', 1, 'Not needed this week');
reset role;
select set_config('app.g2', (select id::text from integrations.esb_push_groups
                               where source_module = 'cafe_purchase_request'
                                 and dedup_key = 'cafe-purchase-request|' || current_setting('app.q2') || '|goo'), true);
select is((select count(*)::int from integrations.esb_push_groups where source_module = 'cafe_purchase_request'), 1,
          'FR-1054 only the request approved while posting is on is enqueued: one group, none for the rejected one');
select ok((select g.org_id = '00000000-0000-0000-0000-0000000000a1' and g.target_env = 'goo' and g.status = 'pending'
                  and g.esb_doc_num is null and g.posting_stage is null
             from integrations.esb_push_groups g where g.id = current_setting('app.g2')::uuid),
          'FR-1054 the group is pending for this environment with nothing in ESB yet');
select is((select count(*)::int from integrations.esb_push e where e.push_group_id = current_setting('app.g2')::uuid), 2,
          'FR-1054 the group has one member per request line');
select ok((select bool_and(e.endpoint = 'purchase-request' and e.source_module = 'cafe_purchase_request'
                           and e.target_env = 'goo' and e.status = 'pending'
                           and e.org_id = '00000000-0000-0000-0000-0000000000a1'
                           and e.source_ref = l.id::text
                           and e.dedup_key = 'cafe-purchase-request-line|' || l.id || '|goo')
             from integrations.esb_push e
             join ops.cafe_purchase_request_lines l on l.id::text = e.payload ->> 'line_id'
            where e.push_group_id = current_setting('app.g2')::uuid),
          'FR-1054 each member names its line, the purchase-request endpoint and a per-line, per-environment key');
select ok((select bool_and(e.payload ->> 'request_id' = current_setting('app.q2')
                           and e.payload ->> 'branch_code' = b.code
                           and e.payload ->> 'required_date' = (current_setting('app.today')::date + 5)::text
                           and e.payload ->> 'request_date' = ((r.reviewed_at at time zone 'Asia/Jakarta')::date)::text
                           and e.payload ->> 'mos_key' = ops.cafe_receipt_mos_key(r.id, e.push_group_id)
                           and e.payload ->> 'item_unit_id' = l.item_unit_id::text
                           and (e.payload ->> 'quantity')::numeric = l.quantity)
             from integrations.esb_push e
             join ops.cafe_purchase_request_lines l on l.id::text = e.payload ->> 'line_id'
             join ops.cafe_purchase_requests r on r.id = l.request_id
             join shared.branches b on b.id = r.branch_id
            where e.push_group_id = current_setting('app.g2')::uuid),
          'AC-1042 each member carries the branch code, request and required dates, the MOS key, the product detail and the typed quantity');
select ok((select bool_and(not (e.payload ?| array['process', 'request_process', 'purchase_type', 'transfer', 'note', 'requested_by']))
             from integrations.esb_push e where e.push_group_id = current_setting('app.g2')::uuid),
          'FR-1052 the payload carries no purchase-versus-transfer choice, no note and no person');
select ok((select (e.payload ->> 'quantity')::numeric = 2.5 from integrations.esb_push e
            where e.push_group_id = current_setting('app.g2')::uuid
              and e.payload ->> 'item_unit_id' = current_setting('app.bean_kg')),
          'FR-1054 a typed "2,5" travels as the decimal quantity 2.5, never converted');
select is((select count(*)::int from integrations.esb_push where payload ->> 'request_id' = current_setting('app.q1')), 0,
          'FR-1055 the request approved while posting was off stays out of the outbox');

-- The outbox keys refuse a second enqueue of the same request.
select throws_ok($$select ops._enqueue_cafe_purchase_request(current_setting('app.q2')::uuid)$$,
  '23505', null, 'FR-1054 the outbox deduplicates the request: a second enqueue is refused');

-- ── The posting read ────────────────────────────────────────────────────────────────────────
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select ops.cafe_purchase_request_posting(r) from ops.cafe_purchase_requests r where r.id = current_setting('app.q2')::uuid),
          '{"state": "queued", "esb_number": null}'::jsonb, 'FR-1054 the requester reads an enqueued request as queued');
select is((select ops.cafe_purchase_request_posting(r) from ops.cafe_purchase_requests r where r.id = current_setting('app.q3')::uuid),
          null::jsonb, 'FR-1056 a rejected request has no posting state');
reset role;
set local role service_role;
update integrations.esb_push_groups set status = 'posted', esb_doc_num = 'PR-SYNTH-0001', posted_at = now()
 where id = current_setting('app.g2')::uuid;
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d4","access_roles":["member","supervisor"]}');
select is((select ops.cafe_purchase_request_posting(r) from ops.cafe_purchase_requests r where r.id = current_setting('app.q2')::uuid),
          '{"state": "posted", "esb_number": "PR-SYNTH-0001"}'::jsonb,
          'FR-1054 the reviewer reads a posted request with the returned ESB request number');
reset role;
set local role service_role;
update integrations.esb_push_groups set status = 'dead_letter', esb_doc_num = null, posted_at = null
 where id = current_setting('app.g2')::uuid;
reset role;
set local role authenticated;
select is((select ops.cafe_purchase_request_posting(r) -> 'state' from ops.cafe_purchase_requests r
            where r.id = current_setting('app.q2')::uuid), '"failed"'::jsonb,
          'FR-1054 a refused request reads as failed');

-- ── The org seam ────────────────────────────────────────────────────────────────────────────
reset role;
select set_config('app.q2_row', (select to_jsonb(r)::text from ops.cafe_purchase_requests r
                                  where r.id = current_setting('app.q2')::uuid), true);
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::int from ops.cafe_purchase_request_posting_switches), 0,
          'NFR-1001 another org''s admin cannot read this org''s switch');
select throws_ok($$select ops.set_cafe_purchase_request_posting_enabled('00000000-0000-0000-0000-00000000bf01', false)$$,
  '22023', 'CAFE_PURCHASE_REQUEST_POSTING_BRANCH_INVALID', 'NFR-1001 another org''s admin cannot switch this org''s branch');
select is(ops.cafe_purchase_request_posting(jsonb_populate_record(null::ops.cafe_purchase_requests,
            current_setting('app.q2_row')::jsonb)), null::jsonb,
          'NFR-1001 the posting read, handed a copy of another org''s request, tells nothing about it');
reset role;
select ok((select posting_enabled from ops.cafe_purchase_request_posting_switches
            where branch_id = '00000000-0000-0000-0000-00000000bf01'),
          'NFR-1001 the refused cross-org write left the switch as this org''s admin set it');

select * from finish();
rollback;
