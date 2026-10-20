-- Expected queue and linked corrections use fabricated catalog items.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
select set_config('app.allow_test_seeds', 'on', true);
select shared._test_seed_directory();
select shared._test_seed_access_roles();
select ops._test_seed_cafe();
select set_config('app.cafe_reference_test_org_id', '00000000-0000-0000-0000-0000000000a1', true);
select ops.refresh_cafe_item_references('[{"esb_product_id":"SYNTH-EXPECTED","esb_product_detail_id":"SYNTH-EXPECTED-UNIT","name":"Expected fixture","category":"KITCHEN","unit_name":"kg","erp_category_type_name":"Inventory","is_stock":true,"has_active_bom_output":false,"is_active":true}]'::jsonb);
insert into ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
select org_id, '00000000-0000-0000-0000-00000000bf01', 'kitchen', id, 'manual'
  from ops.wip_items
 where org_id = '00000000-0000-0000-0000-0000000000a1' and esb_product_id = 'SYNTH-EXPECTED';
select set_config('app.allow_test_seeds', 'off', true);
update ops.item_units set confirmed_at = now() where esb_product_id = 'SYNTH-EXPECTED';
select set_config('app.esb_target_env', 'goo', true);
create function pg_temp.actor(p_role text) returns void language plpgsql as $$
begin
  perform shared._test_set_access_roles(jsonb_build_object('org_id','00000000-0000-0000-0000-0000000000a1',
    'person_id',case p_role when 'ops_lead' then '00000000-0000-0000-0000-0000000000d2'
      when 'admin' then '00000000-0000-0000-0000-0000000000d3' else '00000000-0000-0000-0000-0000000000d5' end,
    'access_roles',jsonb_build_array('member',p_role))::text);
end;
$$;
create temp table count_fixture(name text primary key,id uuid,original jsonb);
grant all on count_fixture to authenticated,service_role;
set local role authenticated;
select pg_temp.actor('ops_lead');
select ops.save_cafe_item_settings('00000000-0000-0000-0000-00000000bf01', 'kitchen', w.id, w.name, u.id, array[u.id], 'RAW', true)
from ops.wip_items w join ops.item_units u on u.wip_item_id = w.id where w.esb_product_id = 'SYNTH-EXPECTED';
insert into count_fixture(name,id) select 'original',(ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01', 'kitchen',
  jsonb_build_array(jsonb_build_object('client_key', 'e1371000-0000-0000-0000-000000000001',
    'item_id', (select id from ops.wip_items where esb_product_id = 'SYNTH-EXPECTED'), 'quantity', '2')),
  (clock_timestamp() at time zone 'Asia/Jakarta')::date - 1) -> 0 ->> 'line_id')::uuid;
reset role;

-- FR-016 is branch-wide, across both activities and both ends of a transfer.
insert into ops.cafe_destinations(org_id,origin_branch_id,origin_activity,destination_branch_id)
values('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000bf02','kitchen',
  '00000000-0000-0000-0000-00000000bf01') on conflict do nothing;
create function pg_temp.approved_movement() returns uuid language plpgsql as $$
declare v_log uuid;
begin
  insert into ops.kitchen_logs(org_id,business_unit_id,branch_id,activity,log_date,action,wip_item_id,qty_porsi,
    status,source,batch_id,posted_to_esb,esb_doc_num,posted_at)
  select line.org_id,'00000000-0000-0000-0000-00000000bb01',line.branch_id,'kitchen',line.count_date,'produce',line.wip_item_id,1,
    'Approved','teable_import','EXPECTED-APPROVED',true,'ERP-FIXTURE',clock_timestamp() - interval '1 hour'
  from ops.cafe_count_lines line where line.id = (select id from count_fixture where name = 'original') returning id into v_log;
  return v_log;
end;
$$;
create function pg_temp.gate_matrix() returns text[] language plpgsql as $$
declare v_action text; v_status text; v_results text[] := '{}'; v_log uuid;
begin
  foreach v_action in array array['produce','transfer','waste'] loop
    insert into ops.kitchen_logs(org_id,business_unit_id,branch_id,destination_branch_id,activity,log_date,
      action,wip_item_id,item_unit_id,qty_porsi,status,source,batch_id)
    select line.org_id,'00000000-0000-0000-0000-00000000bb01',
      case when v_action = 'transfer' then '00000000-0000-0000-0000-00000000bf02'::uuid else line.branch_id end,
      case when v_action = 'transfer' then line.branch_id end,'kitchen',line.count_date,
      v_action,line.wip_item_id,line.item_unit_id,1,'Submitted','teable_import','EXPECTED-GATE-' || v_action
    from ops.cafe_count_lines line where line.id = (select id from count_fixture where name = 'original') returning id into v_log;
    v_results := array_append(v_results,(select count(*)::text from ops.cafe_count_expected_queue('goo',50)));
    delete from ops.kitchen_logs where id = v_log;
  end loop;
  foreach v_status in array array['pending','in_flight','failed','dead_letter'] loop
    insert into integrations.esb_push(org_id,source_module,source_ref,endpoint,target_env,dedup_key,status)
    values('00000000-0000-0000-0000-0000000000a1','kitchen','EXPECTED-APPROVED','assembly-actual','goo','EXPECTED-MOVEMENT',v_status);
    v_log := pg_temp.approved_movement();
    v_results := array_append(v_results,(select count(*)::text from ops.cafe_count_expected_queue('goo',50)));
    delete from ops.kitchen_logs where id = v_log;
    delete from integrations.esb_push where dedup_key = 'EXPECTED-MOVEMENT';
  end loop;
  v_log := pg_temp.approved_movement();
  v_results := array_append(v_results,(select count(*)::text from ops.cafe_count_expected_queue('goo',50)));
  delete from ops.kitchen_logs where id = v_log;
  return v_results;
end;
$$;
savepoint sample_expected;
update shared.orgs set name = 'Gordi Sample' where id = '00000000-0000-0000-0000-0000000000a1';
update shared.people set email = 'fixture-' || id || '@sample.gordi.test' where org_id = '00000000-0000-0000-0000-0000000000a1';
update shared.orgs set is_sample = true where id = '00000000-0000-0000-0000-0000000000a1';
select is((select count(*)::integer from ops.cafe_count_expected_queue('goo',50)),0,'sample Count lines are never offered for ERP reads');
select is((select count(*)::integer from integrations.esb_push where source_module = 'cafe_count_expected'),0,'sample Count lines never enter the shared outbox');
rollback to sample_expected;
select is(pg_temp.gate_matrix(),array['0','0','0','0','0','0','0','1'],
  'AC-013 Submitted production, inbound transfer and waste plus every unresolved Approved outbox state block the read; settled logs allow it');

set local role authenticated;
select pg_temp.actor('member');
select throws_ok($$select ops.cafe_count_expected_queue('goo',50)$$,'42501',null,'the floor cannot enumerate worker jobs');
select throws_ok($$select ops.refresh_cafe_count_expected((select id from count_fixture where name = 'original'))$$,
  '42501','CAFE_COUNT_REVIEW_FORBIDDEN','only a reviewer can request Expected refresh');
reset role;
set local role service_role;
insert into count_fixture(name,id) select 'job',push_id from ops.cafe_count_expected_queue('goo',50);
select ok(ops.claim_cafe_count_expected((select id from count_fixture where name = 'job')),'the worker claims its Expected job through the shared lease');
select is(ops.complete_cafe_count_expected((select id from count_fixture where name = 'job'),1,null,null,'unavailable')->>'applied','true',
  'an ERP read failure completes unavailable without a guessed balance');
reset role;
select ok((select expected_status = 'unavailable' and expected_balance is null and expected_unavailable_reason is not null
  from ops.cafe_count_lines where id = (select id from count_fixture where name = 'original')),'unavailable snapshots carry a reason and no figure');
set local role authenticated;
select pg_temp.actor('ops_lead');
select lives_ok($$select ops.refresh_cafe_count_expected((select id from count_fixture where name = 'original'))$$,'a reviewer refreshes an unconfirmed line');
reset role;
set local role service_role;
insert into count_fixture(name,id) select 'ready-job',push_id from ops.cafe_count_expected_queue('goo',50);
select ops.claim_cafe_count_expected((select id from count_fixture where name = 'ready-job'));
select ops.complete_cafe_count_expected((select id from count_fixture where name = 'ready-job'),3,1,
  ((clock_timestamp() at time zone 'Asia/Jakarta')::date)::timestamp at time zone 'Asia/Jakarta',null);
reset role;
select ok((select expected_status = 'ready' and expected_balance = 1 and expected_unit_id = item_unit_id
  and expected_as_of = ((count_date + 1)::timestamp at time zone 'Asia/Jakarta')
  from ops.cafe_count_lines where id = (select id from count_fixture where name = 'original')),'ready Expected stores the line unit and end-of-day as-of');
set local role authenticated;
select pg_temp.actor('ops_lead');
select ops.record_cafe_count_recount((select id from count_fixture where name = 'original'),2);
select ops.record_cafe_count_reason((select id from count_fixture where name = 'original'),'checked');
select pg_temp.actor('admin');
select ops.confirm_cafe_count_line((select id from count_fixture where name = 'original'),6);
reset role;
update count_fixture set original = (select to_jsonb(line) from ops.cafe_count_lines line where line.id = count_fixture.id) where name = 'original';
set local role authenticated;
select pg_temp.actor('admin');
select throws_ok($$select ops.refresh_cafe_count_expected((select id from count_fixture where name = 'original'))$$,
  '42501','CAFE_COUNT_FROZEN','confirmed Expected cannot be refreshed');
select pg_temp.actor('member');
select throws_ok($$select ops.start_cafe_count_correction((select id from count_fixture where name = 'original'),3,'e1372000-0000-0000-0000-000000000001')$$,
  '42501','CAFE_COUNT_CORRECTION_FORBIDDEN','only stream reviewers start corrections');
select pg_temp.actor('ops_lead');
insert into count_fixture(name,id) select 'correction',(ops.start_cafe_count_correction((select id from count_fixture where name = 'original'),3,
  'e1372000-0000-0000-0000-000000000001')->>'line_id')::uuid;
select throws_ok($$select ops.start_cafe_count_correction((select id from count_fixture where name = 'original'),3,'e1372000-0000-0000-0000-000000000002')$$,
  'P0018','CAFE_COUNT_CORRECTION_UNAVAILABLE','AC-006 a second open correction for the confirmed original is refused');
select is((ops.start_cafe_count_correction((select id from count_fixture where name = 'original'),3,
  'e1372000-0000-0000-0000-000000000001')->>'line_id')::uuid,(select id from count_fixture where name = 'correction'),
  'retrying the same correction submission returns the same line');
reset role;
set local role service_role;
select ops.record_cafe_count_expected_balance((select id from count_fixture where name = 'correction'),1);
reset role;
set local role authenticated;
select pg_temp.actor('ops_lead');
select ops.record_cafe_count_recount((select id from count_fixture where name = 'correction'),3);
select ops.record_cafe_count_reason((select id from count_fixture where name = 'correction'),'checked again');
select pg_temp.actor('admin');
select ops.confirm_cafe_count_line((select id from count_fixture where name = 'correction'),4);
select ok((select superseded from ops.cafe_count_review_metadata(array[(select id from count_fixture where name = 'original')])),
  'AC-026 a confirmed correction derives superseded without updating the held original');
select ops.set_cafe_count_posting_enabled('00000000-0000-0000-0000-00000000bf01',true);
select is(ops.release_cafe_count_posting('00000000-0000-0000-0000-00000000bf01')->>'released_lines','1',
  'AC-026 release queues only the correction, never its superseded original');
reset role;
select is((select count(*)::integer from integrations.esb_push where source_module = 'cafe_count'
  and source_ref = (select id::text from count_fixture where name = 'original')),0,'the held original never enters the posting outbox');
select is((select to_jsonb(line) from ops.cafe_count_lines line where id = (select id from count_fixture where name = 'original')),
  (select original from count_fixture where name = 'original'),'the original stays byte-for-byte unchanged');
insert into count_fixture(name,id) select 'posted-group',push_group_id from integrations.esb_push
  where source_module = 'cafe_count' and source_ref = (select id::text from count_fixture where name = 'correction');
create function pg_temp.refusal_states() returns text[] language plpgsql as $$
declare v_state text; v_results text[] := '{}';
begin
  foreach v_state in array array['pending','in_flight','failed','awaiting_authorization'] loop
    update integrations.esb_push_groups set status = case when v_state = 'awaiting_authorization' then 'in_flight' else v_state end,
      posting_stage = case when v_state = 'awaiting_authorization' then 'awaiting_authorization' end,
      esb_doc_num = case when v_state = 'awaiting_authorization' then 'ERP-UNAUTHORIZED-FIXTURE' end
      where id = (select id from count_fixture where name = 'posted-group');
    perform pg_temp.actor('ops_lead');
    begin
      perform ops.start_cafe_count_correction((select id from count_fixture where name = 'correction'),4,gen_random_uuid());
      v_results := array_append(v_results,'allowed');
    exception when sqlstate 'P0018' then v_results := array_append(v_results,'refused'); end;
  end loop;
  return v_results;
end;
$$;
select is(pg_temp.refusal_states(),array['refused','refused','refused','refused'],
  'AC-026 queued, in-flight, failed and awaiting-authorization originals cannot be corrected');
update integrations.esb_push_groups set status = 'posted',posting_stage = null,esb_doc_num = 'ERP-IJ-FIXTURE',
  posted_at = clock_timestamp() where id = (select id from count_fixture where name = 'posted-group');
update count_fixture set original = (select to_jsonb(line) from ops.cafe_count_lines line where line.id = count_fixture.id) where name = 'correction';
set local role authenticated;
select pg_temp.actor('ops_lead');
insert into count_fixture(name,id) select 'posted-correction',(ops.start_cafe_count_correction((select id from count_fixture where name = 'correction'),4,
  'e1376000-0000-0000-0000-000000000001')->>'line_id')::uuid;
reset role;
set local role service_role;
insert into count_fixture(name,id) select 'posted-job',push_id from ops.cafe_count_expected_queue('goo',50);
select ops.claim_cafe_count_expected((select id from count_fixture where name = 'posted-job'));
select ops.complete_cafe_count_expected((select id from count_fixture where name = 'posted-job'),1,3,
  ((clock_timestamp() at time zone 'Asia/Jakarta')::date)::timestamp at time zone 'Asia/Jakarta',null);
reset role;
set local role authenticated;
select pg_temp.actor('ops_lead');
select ops.record_cafe_count_recount((select id from count_fixture where name = 'posted-correction'),4);
select ops.record_cafe_count_reason((select id from count_fixture where name = 'posted-correction'),'checked after posting');
reset role;
savepoint stale_posted_snapshot;
select set_config('app.cafe_count_action','expected_job',true);
update ops.cafe_count_lines set expected_recorded_at = (select posted_at - interval '1 second'
  from integrations.esb_push_groups where id = (select id from count_fixture where name = 'posted-group')),
  row_version = row_version + 1 where id = (select id from count_fixture where name = 'posted-correction');
set local role authenticated;
select pg_temp.actor('admin');
select throws_ok($$select ops.confirm_cafe_count_line((select id from count_fixture where name = 'posted-correction'),5)$$,
  'P0018','CAFE_COUNT_EXPECTED_AFTER_POSTING_REQUIRED','AC-027 a snapshot predating the original posting cannot be confirmed');
reset role;
rollback to stale_posted_snapshot;
set local role authenticated;
select pg_temp.actor('admin');
select ops.confirm_cafe_count_line((select id from count_fixture where name = 'posted-correction'),4);
reset role;
select ok((select new_group.id <> old_group.id and new_group.correction_of_group_id = old_group.id
  and new_group.correction_of_line_id = original.id and correction.expected_recorded_at > old_group.posted_at
  and correction.variance = 1 and to_jsonb(original) = (select original from count_fixture where name = 'correction')
  from ops.cafe_count_lines correction join ops.cafe_count_lines original on original.id = correction.correction_of
  join integrations.esb_push push on push.source_module = 'cafe_count' and push.source_ref = correction.id::text
  join integrations.esb_push_groups new_group on new_group.id = push.push_group_id
  join integrations.esb_push_groups old_group on old_group.id = (select id from count_fixture where name = 'posted-group')
  where correction.id = (select id from count_fixture where name = 'posted-correction')),
  'AC-027 a posted correction uses a later snapshot, a new linked journal group and leaves its original unchanged');
-- A refresh fences off a worker answer already in flight without rewriting its observation.
set local role authenticated;
select pg_temp.actor('ops_lead');
insert into count_fixture(name,id) select 'stale',(ops.submit_cafe_counts('00000000-0000-0000-0000-00000000bf01','kitchen',
  jsonb_build_array(jsonb_build_object('client_key','e1371000-0000-0000-0000-000000000002',
    'item_id',(select id from ops.wip_items where esb_product_id = 'SYNTH-EXPECTED'),'quantity','2')),
  (clock_timestamp() at time zone 'Asia/Jakarta')::date - 2)->0->>'line_id')::uuid;
reset role;
set local role service_role;
insert into count_fixture(name,id) select 'stale-job',push_id from ops.cafe_count_expected_queue('goo',50)
  where line_id = (select id from count_fixture where name = 'stale');
select ops.claim_cafe_count_expected((select id from count_fixture where name = 'stale-job'));
reset role;
set local role authenticated;
select pg_temp.actor('ops_lead');
select ops.refresh_cafe_count_expected((select id from count_fixture where name = 'stale'));
reset role;
set local role service_role;
select is(ops.complete_cafe_count_expected((select id from count_fixture where name = 'stale-job'),1,1,
  ((clock_timestamp() at time zone 'Asia/Jakarta')::date - 1)::timestamp at time zone 'Asia/Jakarta',null)->>'applied','false',
  'a refresh invalidates an already-claimed worker result');
reset role;
select ok((select expected_balance is null and expected_status = 'waiting' from ops.cafe_count_lines
  where id = (select id from count_fixture where name = 'stale')),'the stale answer never restores a figure');

select * from finish();
rollback;
