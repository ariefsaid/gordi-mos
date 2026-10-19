begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references($source$[
  {"esb_product_id":"SYNTH-PR-HALT","esb_product_detail_id":"SYNTH-PR-HALT-KG","name":"Request resolution item","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}
]$source$::jsonb);
select set_config('app.allow_test_seeds', 'off', true);
select set_config('app.item', (select id::text from ops.wip_items where esb_product_id = 'SYNTH-PR-HALT'), true);
select set_config('app.unit', (select id::text from ops.item_units where esb_product_detail_id = 'SYNTH-PR-HALT-KG'), true);
update ops.item_units set confirmed_at = now() where id = current_setting('app.unit')::uuid;
set local app.esb_target_env = 'goo';
insert into shared.team_memberships (org_id, person_id, team_id, is_primary, effective_from)
select '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d5', t.id, true, current_date - 1
  from shared.teams t where t.org_id = '00000000-0000-0000-0000-0000000000a1' and t.code = 'gordi_hq_kitchen';
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', current_setting('app.item')::uuid,
  'Request resolution item', current_setting('app.unit')::uuid, array[current_setting('app.unit')::uuid], 'RAW', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_purchase_request_posting_enabled('00000000-0000-0000-0000-00000000bf01', true);
select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select set_config('app.request', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (now() at time zone 'Asia/Jakarta')::date + 3, null, 'f014c000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.unit'), 'quantity', '4')))->>'request_id', true);
select set_config('app.absent_request', ops.submit_cafe_purchase_request('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  (now() at time zone 'Asia/Jakarta')::date + 4, null, 'f014c000-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('item_unit_id', current_setting('app.unit'), 'quantity', '2')))->>'request_id', true);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select ops.review_cafe_purchase_request(current_setting('app.absent_request')::uuid, 'approve', 1, null);
select ops.review_cafe_purchase_request(current_setting('app.request')::uuid, 'approve', 1, null);
reset role;
select set_config('app.group', (select id::text from integrations.esb_push_groups
  where dedup_key = 'cafe-purchase-request|' || current_setting('app.request') || '|goo'), true);
select set_config('app.absent_group', (select id::text from integrations.esb_push_groups
  where dedup_key = 'cafe-purchase-request|' || current_setting('app.absent_request') || '|goo'), true);
set local role service_role;
select integrations.claim_esb_pushes(array(select id from integrations.esb_push where source_module = 'cafe_purchase_request'));
update integrations.esb_push set status = 'dead_letter', last_error = 'HALTED for a person: check the MOS key'
 where source_module = 'cafe_purchase_request';
update integrations.esb_push_groups set status = 'dead_letter', posting_stage = 'create_sent'
 where source_module = 'cafe_purchase_request';
reset role;
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::integer from ops.list_cafe_purchase_request_halted_groups()), 2,
  'Procurement discovers the halted request groups with the same receipt grant');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', false);
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select is((select count(*)::integer from ops.list_cafe_purchase_request_halted_groups()), 0,
  'Revoking procurement removes halted-group discovery');
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '42501', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_FORBIDDEN', 'Revoked procurement cannot resolve a halted group');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member","admin"]}');
select ops.set_cafe_receipt_issue_access('00000000-0000-0000-0000-0000000000d6', true);

-- Each ungranted role is refused, including elevated roles without procurement.
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member"]}');
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '42501', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_FORBIDDEN', 'A member without procurement cannot resolve');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","supervisor"]}');
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '42501', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_FORBIDDEN', 'A supervisor without procurement cannot resolve');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","ops_lead"]}');
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '42501', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_FORBIDDEN', 'An ops lead without procurement cannot resolve');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","admin"]}');
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '42501', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_FORBIDDEN', 'An admin without procurement cannot resolve');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d2","access_roles":["member","finance"]}');
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '42501', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_FORBIDDEN', 'Finance without procurement cannot resolve');
select is((select count(*)::integer from ops.list_cafe_purchase_request_halted_groups()), 0,
  'An ungranted person cannot list halted request groups');
reset role;
select ok(not has_function_privilege('anon', 'ops.resolve_cafe_purchase_request_halted_group(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'ops.list_cafe_purchase_request_halted_groups()', 'EXECUTE'),
  'Anonymous callers cannot list or resolve halted groups');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'ops.cafe_purchase_request_posting_resolutions'::regclass),
  'Resolution records force row-level security');
select ok(not has_table_privilege('authenticated', 'ops.cafe_purchase_request_posting_resolutions', 'INSERT')
  and not has_table_privilege('authenticated', 'ops.cafe_purchase_request_posting_resolutions', 'UPDATE')
  and not has_table_privilege('authenticated', 'ops.cafe_purchase_request_posting_resolutions', 'DELETE')
  and not has_table_privilege('service_role', 'ops.cafe_purchase_request_posting_resolutions', 'INSERT'),
  'Only the resolver writes the append-only resolution records');
select is((select proowner from pg_proc where oid = 'ops.resolve_cafe_purchase_request_halted_group(uuid,text,text)'::regprocedure),
  (select proowner from pg_proc where oid = 'ops.resolve_cafe_receipt_halted_group(uuid,text,text)'::regprocedure),
  'The existing outbox guard recognizes the same resolver owner');
set local role service_role;
select throws_ok($$update integrations.esb_push set status = 'pending' where push_group_id = current_setting('app.group')::uuid$$,
  '42501', null, 'The worker cannot directly requeue a terminal member');
reset role;

-- Same-org procurement is required even when the caller knows the group id.
insert into ops.cafe_receipt_issue_access (org_id, person_id, granted_by)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000b4');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::integer from ops.list_cafe_purchase_request_halted_groups()), 0, 'Cross-org procurement sees no groups');
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '55000', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE', 'Cross-org procurement cannot resolve a known group');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d6","access_roles":["member"]}');
select throws_ok(format($$select ops.resolve_cafe_purchase_request_halted_group(%L, %L, %L)$$,
  current_setting('app.group'), resolution, number), '22023', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_INVALID', label)
 from (values ('record_number', null::text, 'A found number is required'),
              ('record_number', '   ', 'A blank number is refused'),
              ('record_number', repeat('x', 129), 'An overlong number is refused'),
              ('record_number', E'PR\nSYNTH', 'Control characters are refused'),
              ('confirm_absent', 'PR-SYNTH', 'Absence cannot carry a number'),
              ('other', null, 'Unknown resolutions are refused'),
              (null, null, 'A resolution is required')) cases(resolution, number, label);
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(null, 'confirm_absent')$$,
  '22023', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_INVALID', 'A group id is required');
reset role;

-- A null stage, a nonhalted refusal, a live group and a different family are not resolvable.
update integrations.esb_push_groups set posting_stage = null where id = current_setting('app.group')::uuid;
set local role authenticated;
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '55000', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE', 'A group without an uncertain create is not resolvable');
reset role;
update integrations.esb_push_groups set posting_stage = 'create_sent', status = 'pending' where id = current_setting('app.group')::uuid;
set local role authenticated;
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '55000', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE', 'A live group is not resolvable');
reset role;
update integrations.esb_push_groups set status = 'dead_letter', source_module = 'cafe_receipt' where id = current_setting('app.group')::uuid;
set local role authenticated;
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '55000', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE', 'The request resolver does not resolve receipt groups');
reset role;
update integrations.esb_push_groups set source_module = 'cafe_purchase_request', posting_stage = 'awaiting_authorization', esb_doc_num = 'PR-SYNTH-CREATED'
 where id = current_setting('app.group')::uuid;
set local role authenticated;
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '55000', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE', 'An already created number cannot be cleared for another create');
reset role;
update integrations.esb_push_groups set posting_stage = 'create_sent', esb_doc_num = null where id = current_setting('app.group')::uuid;
update integrations.esb_push set last_error = 'Definitive refusal' where push_group_id = current_setting('app.group')::uuid;
set local role authenticated;
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '55000', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE', 'A dead letter without the human-halt marker cannot be requeued');
reset role;
update integrations.esb_push set last_error = 'HALTED for a person: check the MOS key' where push_group_id = current_setting('app.group')::uuid;
insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key, push_group_id, status, last_error)
values ('00000000-0000-0000-0000-0000000000a1', 'cafe_purchase_request', 'synthetic-refused-line', 'purchase-request', '{}', 'goo',
  'synthetic-refused-member', current_setting('app.group')::uuid, 'dead_letter', 'Definitive refusal');
set local role authenticated;
select lives_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid,
  'record_number', ' PR-SYNTH-FOUND ' )$$, 'Procurement records the ESB request number it found');
select throws_ok($$select ops.resolve_cafe_purchase_request_halted_group(current_setting('app.group')::uuid, 'confirm_absent')$$,
  '55000', 'CAFE_PURCHASE_REQUEST_HALTED_GROUP_NOT_RESOLVABLE', 'A resolved group cannot be requeued again');
select ok(exists (select 1 from ops.cafe_purchase_request_posting_resolutions x
  join shared.record_history h on h.record_key = x.id::text and h.table_name = 'cafe_purchase_request_posting_resolutions'
  where x.push_group_id = current_setting('app.group')::uuid and x.request_id = current_setting('app.request')::uuid
    and x.resolution = 'recorded_number' and x.esb_doc_num = 'PR-SYNTH-FOUND'
    and x.resolved_by = '00000000-0000-0000-0000-0000000000d6' and x.resolved_at is not null
    and h.actor_person_id = x.resolved_by and h.action = 'insert'), 'The request records the found number, actor and time in history');
select is(ops.resolve_cafe_purchase_request_halted_group(current_setting('app.absent_group')::uuid, 'confirm_absent')->>'resolution',
  'confirm_absent', 'Procurement confirms absence and requeues the same group');
select ok(exists (select 1 from ops.cafe_purchase_request_posting_resolutions x
  join shared.record_history h on h.record_key = x.id::text and h.table_name = 'cafe_purchase_request_posting_resolutions'
  where x.push_group_id = current_setting('app.absent_group')::uuid and x.resolution = 'confirmed_absent' and x.esb_doc_num is null
    and h.actor_person_id = x.resolved_by and h.action = 'insert'), 'Confirmed absence is also audited');
select is((select count(*)::integer from ops.list_cafe_purchase_request_halted_groups()), 0, 'Resolved groups leave the halted list');
reset role;
select is((select status || ':' || posting_stage || ':' || esb_doc_num from integrations.esb_push_groups where id = current_setting('app.group')::uuid),
  'pending:operator_confirmed:PR-SYNTH-FOUND', 'The worker adopts the verified number without creating another request');
select is((select count(*)::integer from integrations.esb_push where push_group_id = current_setting('app.group')::uuid and status = 'pending' and last_error is null),
  1, 'Only the human-halted member is requeued');
select is((select status from integrations.esb_push where dedup_key = 'synthetic-refused-member'), 'dead_letter', 'A nonhalted sibling stays terminal');
select ok((select status = 'pending' and posting_stage is null and esb_doc_num is null from integrations.esb_push_groups
  where id = current_setting('app.absent_group')::uuid), 'Confirmed absence clears the stage for a fresh create');
select is((select count(*)::integer from integrations.esb_push_groups where source_module = 'cafe_purchase_request'), 2, 'Resolution creates no duplicate groups');
select is((select count(*)::integer from ops.cafe_purchase_request_posting_resolutions), 2, 'Each decision writes one resolution');
select throws_ok($$select ops._enqueue_cafe_purchase_request(current_setting('app.request')::uuid)$$,
  '23505', null, 'The resolved request still cannot be enqueued twice');
set local role authenticated;
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d5","access_roles":["member"]}');
select is((select count(*)::integer from ops.cafe_purchase_request_posting_resolutions), 2, 'The requester can read their resolution records');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000a1","person_id":"00000000-0000-0000-0000-0000000000d3","access_roles":["member"]}');
select is((select count(*)::integer from ops.cafe_purchase_request_posting_resolutions), 0,
  'An unrelated same-org member cannot read resolution records');
select is((select count(*)::integer from shared.record_history where table_name = 'cafe_purchase_request_posting_resolutions'), 0,
  'An unrelated same-org member cannot read resolution history');
select shared._test_set_access_roles('{"org_id":"00000000-0000-0000-0000-0000000000b1","person_id":"00000000-0000-0000-0000-0000000000b4","access_roles":["member","admin"]}');
select is((select count(*)::integer from ops.cafe_purchase_request_posting_resolutions), 0, 'Cross-org procurement cannot read resolution records');
select is((select count(*)::integer from shared.record_history where table_name = 'cafe_purchase_request_posting_resolutions'), 0,
  'Cross-org procurement cannot read resolution history');
reset role;
select * from finish();
rollback;
