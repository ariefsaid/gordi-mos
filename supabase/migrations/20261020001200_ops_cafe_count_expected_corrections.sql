-- Worker-owned dated Expected snapshots and new linked corrections.
-- DOWN: supabase/rollbacks/20261020001200_ops_cafe_count_expected_corrections.sql.
begin;

alter table ops.cafe_count_lines
  add column correction_of uuid,
  add column expected_as_of timestamptz,
  add column expected_unit_id uuid,
  add column expected_unavailable_reason text,
  add constraint cafe_count_correction_original_fk foreign key (org_id, correction_of)
    references ops.cafe_count_lines(org_id, id),
  add constraint cafe_count_correction_not_self check (correction_of is distinct from id);
drop index ops.cafe_count_lines_live_branch_item_day_location_uidx;
create unique index cafe_count_lines_live_branch_item_day_location_uidx
  on ops.cafe_count_lines(org_id, branch_id, count_date, wip_item_id, storage_location_id)
  nulls not distinct where status in ('Submitted', 'Confirmed') and correction_of is null;
create unique index cafe_count_one_open_correction
  on ops.cafe_count_lines(org_id, correction_of) where status = 'Submitted' and correction_of is not null;
alter table ops.cafe_count_lines drop constraint cafe_count_lines_expected_status_check;
alter table ops.cafe_count_lines add constraint cafe_count_lines_expected_status_check
  check (expected_status in ('waiting', 'ready', 'unavailable'));
alter table ops.cafe_count_lines drop constraint cafe_count_lines_expected_snapshot_check;
alter table ops.cafe_count_lines add constraint cafe_count_lines_expected_snapshot_check check (
  (expected_status = 'waiting' and expected_balance is null and expected_recorded_at is null)
  or (expected_status = 'ready' and expected_balance is not null and expected_recorded_at is not null)
  or (expected_status = 'unavailable' and expected_balance is null and expected_unavailable_reason is not null)
);
-- No grant on the new snapshot metadata: only the reviewer RPC exposes it.
grant select (correction_of) on ops.cafe_count_lines to authenticated;

alter table integrations.esb_push drop constraint esb_push_source_module_check;
alter table integrations.esb_push add constraint esb_push_source_module_check
  check (source_module in ('kitchen','roastery','cafe_receipt','cafe_purchase_request','cafe_count','cafe_count_expected'));
alter table integrations.esb_push drop constraint esb_push_endpoint_check;
alter table integrations.esb_push add constraint esb_push_endpoint_check
  check (endpoint in ('assembly-actual','simple-transfer','noop','goods-receipt','purchase-request','count-journal','count-expected'));
alter table integrations.esb_push_groups
  add column correction_of_line_id uuid,
  add column correction_of_group_id uuid,
  add constraint cafe_count_correction_group_line_fk foreign key (org_id, correction_of_line_id)
    references ops.cafe_count_lines(org_id, id);
alter table integrations.esb_push_groups add constraint esb_push_groups_org_id_id_unique unique(org_id,id);
alter table integrations.esb_push_groups add constraint cafe_count_correction_group_fk
  foreign key (org_id,correction_of_group_id) references integrations.esb_push_groups(org_id,id);

create or replace function ops._cafe_count_movements_settled(p_org_id uuid, p_branch_id uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_day < (statement_timestamp() at time zone 'Asia/Jakarta')::date
    and not exists (
      select 1 from ops.kitchen_logs log
       where log.org_id = p_org_id and log.log_date = p_day
         and (log.branch_id = p_branch_id or log.destination_branch_id = p_branch_id)
         and (log.status = 'Submitted' or (log.status = 'Approved'
           and coalesce(ops.esb_endpoint_for(log.action, log.branch_id, log.destination_branch_id),'unmapped') <> 'noop'
           and (not log.posted_to_esb or nullif(log.esb_doc_num, '') is null or log.posted_at is null
             or exists (select 1 from integrations.esb_push push where push.org_id = log.org_id
               and push.source_module = 'kitchen' and push.source_ref = log.batch_id
               and push.status in ('pending','in_flight','failed','dead_letter')))))
    )
$$;
revoke all on function ops._cafe_count_movements_settled(uuid,uuid,date) from public,anon,authenticated,service_role;

create or replace function ops._cafe_count_correction_allowed(p_line_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select original.status = 'Confirmed'
    and original.posting_status in ('held','not_needed','posted')
    and not exists (select 1 from ops.cafe_count_lines correction
      where correction.org_id = original.org_id and correction.correction_of = original.id
        and correction.status in ('Submitted','Confirmed'))
    and not exists (select 1 from integrations.esb_push push
      left join integrations.esb_push_groups grp on grp.id = push.push_group_id and grp.org_id = push.org_id
      where push.org_id = original.org_id and push.source_module = 'cafe_count'
        and push.source_ref = original.id::text
        and (grp.id is null or grp.status <> 'posted' or grp.posting_stage is not null
          or nullif(grp.esb_doc_num,'') is null or grp.posted_at is null))
  from ops.cafe_count_lines original where original.id = p_line_id
$$;
revoke all on function ops._cafe_count_correction_allowed(uuid) from public,anon,authenticated,service_role;

create or replace function ops._guard_cafe_count_line()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  v_action text := coalesce(current_setting('app.cafe_count_action', true), '');
  v_today date := (clock_timestamp() at time zone 'Asia/Jakarta')::date;
  v_original ops.cafe_count_lines%rowtype;
  v_columns text[];
begin
  if tg_op = 'INSERT' then
    new.org_id := shared.current_org_id();
    new.submitted_by := shared.current_person_id();
    new.submitted_at := clock_timestamp();
    new.count_date := coalesce(new.count_date, v_today);
    new.source := 'mos'; new.status := 'Submitted'; new.posting_status := 'not_posted';
    new.expected_balance := null; new.expected_status := 'waiting'; new.expected_recorded_at := null;
    new.expected_as_of := null; new.expected_unit_id := null; new.expected_unavailable_reason := null;
    new.recounted_quantity := null; new.recounted_by := null; new.recounted_at := null;
    new.reason := null; new.reason_entered_by := null; new.reason_entered_at := null;
    new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
    new.row_version := 1; new.updated_at := clock_timestamp();
    if new.org_id is null or new.submitted_by is null then
      raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
    end if;
    if new.correction_of is not null then
      select * into v_original from ops.cafe_count_lines where id = new.correction_of and org_id = new.org_id for update;
      if not found or v_action <> 'correction' or not ops.can_review_stream(v_original.branch_id,v_original.activity)
         or not coalesce(ops._cafe_count_correction_allowed(v_original.id), false)
         or (new.branch_id,new.activity,new.count_date,new.wip_item_id,new.item_unit_id,new.item_name,new.unit_name,new.item_kind)
            is distinct from (v_original.branch_id,v_original.activity,v_original.count_date,v_original.wip_item_id,
              v_original.item_unit_id,v_original.item_name,v_original.unit_name,v_original.item_kind) then
        raise exception 'CAFE_COUNT_CORRECTION_UNAVAILABLE' using errcode = 'P0018';
      end if;
    else
      if new.count_date > v_today then raise exception 'CAFE_COUNT_DATE_FUTURE' using errcode = '23514'; end if;
      if new.count_date < v_today - 7 or (new.count_date < v_today - 1
        and not (shared.has_access_role('ops_lead') or shared.has_access_role('admin'))) then
        raise exception 'CAFE_COUNT_DATE_TOO_OLD' using errcode = '23514';
      end if;
      if not exists (select 1 from ops.cafe_countable_items(new.branch_id,new.activity) item
        where item.item_id = new.wip_item_id and item.item_unit_id = new.item_unit_id
          and item.item_name = new.item_name and item.item_kind = new.item_kind) then
        raise exception 'CAFE_COUNT_ITEM_NOT_COUNTABLE' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;
  if v_action = 'posting' and old.status = 'Confirmed'
    and old.posting_status in ('held','queued','awaiting_authorization','failed')
    and new.posting_status in ('held','queued','awaiting_authorization','posted','failed')
    and new.posting_status is distinct from old.posting_status and new.row_version = old.row_version
    and (to_jsonb(new) - array['posting_status','updated_at','variance'])
      is not distinct from (to_jsonb(old) - array['posting_status','updated_at','variance']) then
    new.updated_at := clock_timestamp(); return new;
  end if;
  if old.status in ('Confirmed','Rejected') then raise exception 'CAFE_COUNT_FROZEN' using errcode = '42501'; end if;
  if v_action in ('expected','expected_job','refresh_expected') then
    v_columns := array['expected_balance','expected_status','expected_recorded_at','expected_as_of','expected_unit_id','expected_unavailable_reason'];
    if v_action = 'expected' and (old.recounted_quantity is not null or new.expected_status <> 'ready') then
      raise exception 'CAFE_COUNT_EXPECTED_SNAPSHOT_FROZEN' using errcode = 'P0018';
    end if;
  elsif v_action = 'recount' and old.recounted_quantity is null and new.recounted_quantity is not null
    and new.recounted_by = shared.current_person_id() and new.recounted_at is not null then
    v_columns := array['recounted_quantity','recounted_by','recounted_at'];
  elsif v_action = 'reason' and new.reason is not null and new.reason_entered_by = shared.current_person_id()
    and new.reason_entered_at is not null then
    v_columns := array['reason','reason_entered_by','reason_entered_at'];
  elsif v_action in ('confirm','reject') and old.status = 'Submitted'
    and new.status = (case v_action when 'confirm' then 'Confirmed' else 'Rejected' end)
    and new.reviewed_by = shared.current_person_id() and new.reviewed_by is distinct from old.submitted_by
    and new.reviewed_by is distinct from old.recounted_by and new.reviewed_at is not null
    and new.posting_status = (case when v_action = 'reject' then old.posting_status when old.variance = 0 then 'not_needed' else 'held' end)
    and (v_action = 'reject') = (new.review_note is not null) then
    if v_action = 'confirm' and old.correction_of is not null and exists (
      select 1 from integrations.esb_push push join integrations.esb_push_groups grp on grp.id = push.push_group_id
      where push.org_id = old.org_id and push.source_module = 'cafe_count' and push.source_ref = old.correction_of::text
        and (grp.status <> 'posted' or grp.posting_stage is not null or grp.posted_at is null
          or old.expected_recorded_at <= grp.posted_at)) then
      raise exception 'CAFE_COUNT_EXPECTED_AFTER_POSTING_REQUIRED' using errcode = 'P0018';
    end if;
    v_columns := array['status','posting_status','reviewed_by','reviewed_at','review_note'];
  else
    raise exception 'CAFE_COUNT_UPDATE_REQUIRES_SERVER_ACTION' using errcode = '42501';
  end if;
  if new.row_version <> old.row_version + 1 or (to_jsonb(new) - v_columns - array['row_version','updated_at','variance'])
    is distinct from (to_jsonb(old) - v_columns - array['row_version','updated_at','variance']) then
    raise exception 'CAFE_COUNT_FACTS_IMMUTABLE' using errcode = '42501';
  end if;
  new.updated_at := clock_timestamp(); return new;
end;
$$;
revoke all on function ops._guard_cafe_count_line() from public,anon,authenticated,service_role;

create function ops.start_cafe_count_correction(p_line_id uuid,p_quantity numeric,p_client_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_original ops.cafe_count_lines%rowtype; v_new ops.cafe_count_lines%rowtype;
begin
  select * into v_original from ops.cafe_count_lines where id = p_line_id and org_id = shared.current_org_id() for update;
  if not found or shared.current_person_id() is null or not ops.can_review_stream(v_original.branch_id,v_original.activity) then
    raise exception 'CAFE_COUNT_CORRECTION_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_new from ops.cafe_count_lines where org_id = v_original.org_id and client_key = p_client_key;
  if found and v_new.correction_of = p_line_id and v_new.counted_quantity = p_quantity then
    return jsonb_build_object('line_id',v_new.id,'status',v_new.status);
  end if;
  if not coalesce(ops._cafe_count_correction_allowed(p_line_id),false) then
    raise exception 'CAFE_COUNT_CORRECTION_UNAVAILABLE' using errcode = 'P0018';
  end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 9999999999.99 or p_quantity <> trunc(p_quantity,2) or p_client_key is null then
    raise exception 'CAFE_COUNT_QUANTITY_INVALID' using errcode = '22023';
  end if;
  perform set_config('app.cafe_count_action','correction',true);
  insert into ops.cafe_count_lines(org_id,branch_id,activity,count_date,wip_item_id,item_name,item_category,item_kind,
    item_unit_id,unit_name,counted_quantity,entry_quantity,entry_unit_factor,client_key,submitted_by,correction_of,storage_location_id)
  values (v_original.org_id,v_original.branch_id,v_original.activity,v_original.count_date,v_original.wip_item_id,
    v_original.item_name,v_original.item_category,v_original.item_kind,v_original.item_unit_id,v_original.unit_name,
    p_quantity,p_quantity,1,p_client_key,shared.current_person_id(),p_line_id,v_original.storage_location_id) returning * into v_new;
  return jsonb_build_object('line_id',v_new.id,'status',v_new.status);
end;
$$;
revoke all on function ops.start_cafe_count_correction(uuid,numeric,uuid) from public,anon,service_role;
grant execute on function ops.start_cafe_count_correction(uuid,numeric,uuid) to authenticated;

-- Retain A1's fail-closed enqueue; corrections get their own linked group.
alter function ops._enqueue_cafe_count_line(uuid,uuid,text) rename to _enqueue_cafe_count_line_base;
create function ops._enqueue_cafe_count_line(p_line_id uuid,p_action_id uuid,p_action text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_line ops.cafe_count_lines%rowtype; v_group uuid; v_original_group uuid;
begin
  select * into v_line from ops.cafe_count_lines where id = p_line_id for update;
  if exists (select 1 from ops.cafe_count_lines correction where correction.org_id = v_line.org_id
    and correction.correction_of = v_line.id and correction.status in ('Submitted','Confirmed')) then return null; end if;
  if v_line.correction_of is not null then
    select push.push_group_id into v_original_group from integrations.esb_push push
      where push.org_id = v_line.org_id and push.source_module = 'cafe_count' and push.source_ref = v_line.correction_of::text
      order by push.created_at desc limit 1;
  end if;
  v_group := ops._enqueue_cafe_count_line_base(p_line_id,
    case when v_line.correction_of is null then p_action_id else v_line.id end,p_action);
  if v_group is not null and v_line.correction_of is not null then
    update integrations.esb_push_groups set correction_of_line_id = v_line.correction_of,
      correction_of_group_id = v_original_group where id = v_group and org_id = v_line.org_id;
  end if;
  return v_group;
end;
$$;
revoke all on function ops._enqueue_cafe_count_line(uuid,uuid,text) from public,anon,authenticated,service_role;

create function ops._cafe_count_expected_can_read(p_line_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select line.status = 'Submitted' and line.expected_status = 'waiting' and not shared.is_sample_org(line.org_id)
    and ops._cafe_count_movements_settled(line.org_id,line.branch_id,line.count_date)
    and not exists(select 1 from integrations.esb_push push join integrations.esb_push_groups grp on grp.id = push.push_group_id
      where push.org_id = line.org_id and push.source_module = 'cafe_count' and push.source_ref = line.correction_of::text
        and (grp.status <> 'posted' or grp.posting_stage is not null or grp.posted_at is null or grp.posted_at >= statement_timestamp()))
  from ops.cafe_count_lines line where line.id = p_line_id
$$;
revoke all on function ops._cafe_count_expected_can_read(uuid) from public,anon,authenticated,service_role;

create function ops.claim_cafe_count_expected(p_push_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_push integrations.esb_push%rowtype; v_line ops.cafe_count_lines%rowtype;
begin
  select * into v_push from integrations.esb_push where id = p_push_id and source_module = 'cafe_count_expected' for update;
  if not found or v_push.target_env <> integrations.current_esb_target_env() then return false; end if;
  select * into v_line from ops.cafe_count_lines where org_id = v_push.org_id and id::text = v_push.source_ref for update;
  if not found or not coalesce(ops._cafe_count_expected_can_read(v_line.id),false)
    or (v_push.payload->>'row_version')::integer <> v_line.row_version then return false; end if;
  return exists(select 1 from integrations.claim_esb_pushes(array[p_push_id]));
end;
$$;
revoke all on function ops.claim_cafe_count_expected(uuid) from public,anon,authenticated;
grant execute on function ops.claim_cafe_count_expected(uuid) to service_role;

create function ops.cafe_count_expected_queue(p_target_env text,p_limit integer default 50)
returns table(push_id uuid,line_id uuid,branch_code text,item_unit_id uuid,count_date date,row_version integer,storage_location_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if p_target_env <> integrations.current_esb_target_env() or p_target_env = 'dry_run' then
    raise exception 'CAFE_COUNT_EXPECTED_TARGET_INVALID' using errcode = '22023';
  end if;
  insert into integrations.esb_push(org_id,source_module,source_ref,endpoint,target_env,dedup_key,payload)
  select line.org_id,'cafe_count_expected',line.id::text,'count-expected',p_target_env,
    'count-expected|' || line.id || '|' || line.row_version || '|' || p_target_env,
    jsonb_build_object('row_version',line.row_version)
  from ops.cafe_count_lines line where ops._cafe_count_expected_can_read(line.id)
  order by line.submitted_at,line.id limit least(greatest(p_limit,1),200)
  on conflict(org_id,dedup_key) do nothing;
  return query select push.id,line.id,branch.code,line.item_unit_id,line.count_date,line.row_version,line.storage_location_id
    from integrations.esb_push push join ops.cafe_count_lines line
      on line.id::text = push.source_ref and line.org_id = push.org_id
    join shared.branches branch on branch.id = line.branch_id and branch.org_id = line.org_id
    where push.source_module = 'cafe_count_expected' and push.target_env = p_target_env and push.status = 'pending'
      and (push.payload->>'row_version')::integer = line.row_version and ops._cafe_count_expected_can_read(line.id)
    order by push.created_at,push.id limit least(greatest(p_limit,1),200);
end;
$$;
revoke all on function ops.cafe_count_expected_queue(text,integer) from public,anon,authenticated;
grant execute on function ops.cafe_count_expected_queue(text,integer) to service_role;

create function ops.complete_cafe_count_expected(p_push_id uuid,p_expected_version integer,p_balance numeric,
  p_as_of timestamptz,p_unavailable_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_push integrations.esb_push%rowtype; v_line ops.cafe_count_lines%rowtype;
begin
  select * into v_push from integrations.esb_push where id = p_push_id for update;
  if not found or v_push.source_module <> 'cafe_count_expected' or v_push.status <> 'in_flight'
    or v_push.target_env <> integrations.current_esb_target_env() then
    raise exception 'CAFE_COUNT_EXPECTED_JOB_INVALID' using errcode = 'P0018';
  end if;
  select * into v_line from ops.cafe_count_lines where org_id = v_push.org_id and id::text = v_push.source_ref for update;
  if not found or v_line.status <> 'Submitted' or v_line.row_version <> p_expected_version
    or (v_push.payload->>'row_version')::integer <> p_expected_version
    or not coalesce(ops._cafe_count_expected_can_read(v_line.id),false) then
    update integrations.esb_push set status = 'dead_letter',last_error = 'expected_request_changed' where id = p_push_id;
    return jsonb_build_object('applied',false);
  end if;
  if p_unavailable_reason is null and (p_balance is null or abs(p_balance) > 9999999999.9999
    or p_balance <> trunc(p_balance,4) or p_as_of is distinct from ((v_line.count_date + 1)::timestamp at time zone 'Asia/Jakarta')) then
    raise exception 'CAFE_COUNT_EXPECTED_BALANCE_INVALID' using errcode = '22023';
  end if;
  perform set_config('app.cafe_count_action','expected_job',true);
  update ops.cafe_count_lines set expected_balance = case when p_unavailable_reason is null then p_balance end,
    expected_status = case when p_unavailable_reason is null then 'ready' else 'unavailable' end,
    expected_recorded_at = clock_timestamp(),expected_as_of = case when p_unavailable_reason is null then p_as_of end,
    expected_unit_id = case when p_unavailable_reason is null then v_line.item_unit_id end,
    expected_unavailable_reason = case when p_unavailable_reason is not null then 'erp_balance_or_conversion_unavailable' end,
    row_version = row_version + 1 where id = v_line.id;
  update integrations.esb_push set status = 'posted',posted_at = clock_timestamp(),last_error = null where id = p_push_id;
  return jsonb_build_object('applied',true);
end;
$$;
revoke all on function ops.complete_cafe_count_expected(uuid,integer,numeric,timestamptz,text) from public,anon,authenticated;
grant execute on function ops.complete_cafe_count_expected(uuid,integer,numeric,timestamptz,text) to service_role;

create function ops.refresh_cafe_count_expected(p_line_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_line ops.cafe_count_lines%rowtype;
begin
  select * into v_line from ops.cafe_count_lines where id = p_line_id and org_id = shared.current_org_id() for update;
  if not found or shared.current_person_id() is null or not ops.can_review_stream(v_line.branch_id,v_line.activity) then
    raise exception 'CAFE_COUNT_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  if v_line.status <> 'Submitted' then raise exception 'CAFE_COUNT_FROZEN' using errcode = '42501'; end if;
  perform set_config('app.cafe_count_action','refresh_expected',true);
  update ops.cafe_count_lines set expected_balance = null,expected_status = 'waiting',expected_recorded_at = null,
    expected_as_of = null,expected_unit_id = null,expected_unavailable_reason = null,row_version = row_version + 1
    where id = p_line_id;
end;
$$;
revoke all on function ops.refresh_cafe_count_expected(uuid) from public,anon,service_role;
grant execute on function ops.refresh_cafe_count_expected(uuid) to authenticated;

create function ops.cafe_count_review_metadata(p_line_ids uuid[])
returns table(line_id uuid,expected_state text,expected_as_of timestamptz,expected_unit_id uuid,
  unavailable_reason text,correction_of uuid,superseded boolean,can_correct boolean)
language sql stable security definer set search_path = '' as $$
  select line.id,case when line.expected_status <> 'waiting' then line.expected_status
      when ops._cafe_count_movements_settled(line.org_id,line.branch_id,line.count_date) then 'pending' else 'waiting_movements' end,
    line.expected_as_of,line.expected_unit_id,line.expected_unavailable_reason,line.correction_of,
    exists(select 1 from ops.cafe_count_lines correction where correction.org_id = line.org_id
      and correction.correction_of = line.id and correction.status = 'Confirmed'),
    coalesce(ops._cafe_count_correction_allowed(line.id),false)
  from ops.cafe_count_lines line where line.id = any(p_line_ids[1:2000]) and line.org_id = shared.current_org_id()
    and shared.current_person_id() is not null and ops.can_review_stream(line.branch_id,line.activity)
$$;
revoke all on function ops.cafe_count_review_metadata(uuid[]) from public,anon,service_role;
grant execute on function ops.cafe_count_review_metadata(uuid[]) to authenticated;

drop function ops.cafe_count_review_figures(uuid[]);
create function ops.cafe_count_review_figures(p_line_ids uuid[])
returns table(id uuid,expected_balance numeric,variance numeric,review_note text,expected_state text,
  expected_as_of timestamptz,unavailable_reason text,correction_of uuid)
language sql stable security definer set search_path = '' as $$
  select line.id,line.expected_balance,line.variance,line.review_note,meta.expected_state,
    meta.expected_as_of,meta.unavailable_reason,line.correction_of
  from ops.cafe_count_lines line join ops.cafe_count_review_metadata(p_line_ids) meta on meta.line_id = line.id
  where coalesce(cardinality(p_line_ids),0) <= 500
$$;
revoke all on function ops.cafe_count_review_figures(uuid[]) from public,anon,service_role;
grant execute on function ops.cafe_count_review_figures(uuid[]) to authenticated;

drop function ops.cafe_count_posting_queue();
create function ops.cafe_count_posting_queue()
returns table(line_id uuid,branch_id uuid,branch_name text,activity text,count_date date,item_name text,unit_name text,
  posting_status text,esb_doc_num text,posting_error text,expected_out_of_date boolean,posting_enabled boolean,
  correction_of uuid,superseded boolean,can_correct boolean)
language sql stable security definer set search_path = '' as $$
  select line.id,line.branch_id,branch.name,line.activity,line.count_date,line.item_name,line.unit_name,
    line.posting_status,posting.esb_doc_num,posting.posting_error,
    line.posting_status = 'held' and not ops._cafe_count_expected_is_current(
      line.org_id,line.branch_id,line.activity,line.count_date,line.expected_recorded_at),
    coalesce(switch.posting_enabled,false),line.correction_of,
    exists(select 1 from ops.cafe_count_lines correction where correction.org_id = line.org_id
      and correction.correction_of = line.id and correction.status = 'Confirmed'),
    coalesce(ops._cafe_count_correction_allowed(line.id),false)
  from ops.cafe_count_lines line join shared.branches branch on branch.id = line.branch_id and branch.org_id = line.org_id
  left join ops.cafe_count_posting_switches switch on switch.org_id = line.org_id and switch.branch_id = line.branch_id
  left join lateral(select grp.esb_doc_num,coalesce(grp.last_error,push.last_error) posting_error
    from integrations.esb_push push left join integrations.esb_push_groups grp on grp.id = push.push_group_id and grp.org_id = push.org_id
    where push.org_id = line.org_id and push.source_module = 'cafe_count' and push.source_ref = line.id::text
    order by push.created_at desc,push.id desc limit 1) posting on true
  where line.org_id = shared.current_org_id() and shared.current_person_id() is not null and line.status = 'Confirmed'
    and (line.posting_status <> 'posted' or line.count_date >= (statement_timestamp() at time zone 'Asia/Jakarta')::date - 7)
    and ops.can_review_stream(line.branch_id,line.activity)
  order by (line.posting_status = 'posted'),line.count_date desc,branch.name,line.activity,line.item_name,line.id limit 2000
$$;
revoke all on function ops.cafe_count_posting_queue() from public,anon,service_role;
grant execute on function ops.cafe_count_posting_queue() to authenticated;

-- Release skips originals with an open or confirmed correction, before counting held candidates.
create or replace function ops.release_cafe_count_posting(p_branch_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := shared.current_org_id(); v_action uuid := gen_random_uuid();
  v_line ops.cafe_count_lines%rowtype; v_released integer := 0; v_stale integer := 0; v_held integer := 0;
begin
  if v_org is null or shared.current_person_id() is null
    or not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_POSTING_RELEASE_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists(select 1 from shared.branches where id = p_branch_id and org_id = v_org) then
    raise exception 'CAFE_COUNT_POSTING_BRANCH_INVALID' using errcode = '22023';
  end if;
  if not coalesce((select posting_enabled from ops.cafe_count_posting_switches where org_id = v_org and branch_id = p_branch_id),false) then
    raise exception 'CAFE_COUNT_POSTING_OFF' using errcode = '42501';
  end if;
  if integrations.current_esb_target_env() = 'dry_run' or shared.is_sample_org(v_org) then
    raise exception 'CAFE_COUNT_POSTING_GATE_CLOSED' using errcode = '55000';
  end if;
  for v_line in select line.* from ops.cafe_count_lines line where line.org_id = v_org and line.branch_id = p_branch_id
    and line.status = 'Confirmed' and line.posting_status = 'held' and line.variance <> 0
    and not exists(select 1 from ops.cafe_count_lines correction where correction.org_id = line.org_id
      and correction.correction_of = line.id and correction.status in ('Submitted','Confirmed'))
    order by line.count_date,line.activity,line.submitted_at,line.id for update
  loop
    if ops._cafe_count_expected_is_current(v_line.org_id,v_line.branch_id,v_line.activity,v_line.count_date,v_line.expected_recorded_at) then
      if ops._enqueue_cafe_count_line(v_line.id,v_action,'release') is not null then v_released := v_released + 1; end if;
    else v_stale := v_stale + 1;
    end if;
  end loop;
  select count(*)::integer into v_held from ops.cafe_count_lines line where line.org_id = v_org and line.branch_id = p_branch_id
    and line.status = 'Confirmed' and line.posting_status = 'held' and line.variance <> 0
    and not exists(select 1 from ops.cafe_count_lines correction where correction.org_id = line.org_id
      and correction.correction_of = line.id and correction.status in ('Submitted','Confirmed'));
  return jsonb_build_object('released_lines',v_released,'expected_out_of_date_lines',v_stale,'held_lines',v_held);
end;
$$;
revoke all on function ops.release_cafe_count_posting(uuid) from public,anon,service_role;
grant execute on function ops.release_cafe_count_posting(uuid) to authenticated;

drop function ops.cafe_count_floor_lines(uuid,text,date);
create function ops.cafe_count_floor_lines(p_branch_id uuid,p_activity text,p_count_date date)
returns table(id uuid,wip_item_id uuid,state text,row_version integer,correction_of uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if shared.current_org_id() is null or shared.current_person_id() is null
    or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_COUNT_FORBIDDEN' using errcode = '42501';
  end if;
  return query select line.id,line.wip_item_id,case
    when line.status = 'Confirmed' then case when line.posting_status = 'held' then 'held' else 'confirmed' end
    when line.expected_status <> 'ready' or line.variance is null then 'waiting'
    when line.counted_quantity <> line.expected_balance and line.recounted_quantity is null then 'needs_recount'
    when line.variance <> 0 and line.reason is null then 'needs_reason' else 'with_reviewer' end,
    line.row_version,line.correction_of
  from ops.cafe_count_lines line where line.org_id = shared.current_org_id() and line.branch_id = p_branch_id
    and line.activity = p_activity and line.count_date = p_count_date and line.status in ('Submitted','Confirmed')
    and not exists(select 1 from ops.cafe_count_lines correction where correction.org_id = line.org_id
      and correction.correction_of = line.id and correction.status in ('Submitted','Confirmed'));
end;
$$;
revoke all on function ops.cafe_count_floor_lines(uuid,text,date) from public,anon,service_role;
grant execute on function ops.cafe_count_floor_lines(uuid,text,date) to authenticated;

commit;
