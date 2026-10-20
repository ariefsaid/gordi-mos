-- Refuse narrowing the vocabulary while records depend on it. Export/migrate them explicitly first.
begin;
do $$ begin
 if exists(select 1 from ops.kitchen_logs where action='outlet_send') or exists(select 1 from ops.kitchen_plans where action='outlet_send') then
  raise exception 'outlet send records must be preserved before rollback';
 end if;
end $$;
drop trigger cafe_kitchen_log_a_outlet_guard on ops.kitchen_logs;
drop trigger cafe_kitchen_plan_outlet_guard on ops.kitchen_plans;
drop function ops._guard_cafe_outlet_send();
drop function ops.cafe_outlet_send_places(uuid,text);
create or replace function ops.move_cafe_stock(p_input jsonb, p_client_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id(); v_actor uuid := shared.current_person_id();
  v_branch uuid; v_activity text; v_unit uuid; v_item uuid; v_quantity numeric;
  v_from uuid; v_to uuid; v_date date; v_note text; v_hash text;
  v_existing ops.location_movements%rowtype; v_balance numeric; v_row ops.location_movements%rowtype;
  v_movement_id uuid := gen_random_uuid();
begin
  if v_org is null or v_actor is null or not shared.is_org_member()
     or not (shared.is_cafe_affiliated() or shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'CAFE_LOCATION_MOVE_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input->'stream') is distinct from 'object'
     or p_client_request_id is null then raise exception 'CAFE_LOCATION_MOVE_INVALID' using errcode = '22023'; end if;
  v_branch := (p_input->'stream'->>'branch_id')::uuid; v_activity := p_input->'stream'->>'activity';
  v_unit := (p_input->>'item_unit_id')::uuid; v_from := (p_input->>'from_location_id')::uuid; v_to := (p_input->>'to_location_id')::uuid;
  if coalesce(p_input->>'quantity','') !~ '^[0-9]{1,10}([.,][0-9]{1,4})?$' then
    raise exception 'CAFE_LOCATION_MOVE_INVALID' using errcode = '22023';
  end if;
  v_quantity := replace(p_input->>'quantity',',','.')::numeric; v_date := (p_input->>'movement_date')::date;
  v_note := nullif(btrim(p_input->>'note'),'');
  if v_branch is null or v_activity is null or v_activity not in ('kitchen','bar') or v_unit is null
     or v_from is null or v_to is null or v_from=v_to or v_quantity is null
     or v_quantity <= 0 or v_quantity > 9999999999.9999 or v_date is null
     or (v_note is not null and char_length(v_note)>500) then
    raise exception 'CAFE_LOCATION_MOVE_INVALID' using errcode = '22023';
  end if;
  v_hash := md5(jsonb_build_object('stream',jsonb_build_object('branch_id',v_branch,'activity',v_activity),
      'item_unit_id',v_unit,'quantity',v_quantity::text,'from_location_id',v_from,'to_location_id',v_to,
      'movement_date',v_date,'note',v_note)::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || v_actor::text || ':' || p_client_request_id::text, 0));
  select * into v_existing from ops.location_movements m where m.org_id=v_org and m.actor_id=v_actor and m.client_request_id=p_client_request_id;
  if found then
    if v_existing.payload_hash <> v_hash then raise exception 'CAFE_LOCATION_MOVE_REQUEST_CONFLICT' using errcode = '22023'; end if;
    return jsonb_build_object('movement_id',v_existing.id,'row_version',v_existing.row_version);
  end if;
  -- A stream membership permits help-out on another stream, matching Café capture; it does not grant admin settings rights.
  if not exists (select 1 from shared.teams t join shared.branches b on b.org_id=t.org_id and b.id=t.branch_id
    where t.org_id=v_org and t.branch_id=v_branch and t.activity=v_activity and t.archived_at is null and b.archived_at is null) then
    raise exception 'CAFE_LOCATION_MOVE_STREAM_INVALID' using errcode = '22023';
  end if;
  select unit.wip_item_id into v_item from ops.item_units unit
   join ops.wip_items item on item.id=unit.wip_item_id and item.org_id=unit.org_id and item.flag_active
   where unit.org_id=v_org and unit.id=v_unit and unit.confirmed_at is not null and unit.is_default;
  if v_item is null or not exists (select 1 from ops.stream_items si where si.org_id=v_org and si.branch_id=v_branch and si.activity=v_activity and si.wip_item_id=v_item) then
    raise exception 'CAFE_LOCATION_MOVE_ITEM_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from ops.locations l join ops.location_branches lb on lb.org_id=l.org_id and lb.location_id=l.id
      where l.org_id=v_org and l.id=v_from and l.archived_at is null and l.use in ('storage','both') and lb.branch_id=v_branch)
     or not exists (select 1 from ops.locations l join ops.location_branches lb on lb.org_id=l.org_id and lb.location_id=l.id
      where l.org_id=v_org and l.id=v_to and l.archived_at is null and l.use in ('storage','both') and lb.branch_id=v_branch) then
    raise exception 'CAFE_LOCATION_MOVE_LOCATION_INVALID' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text || ':' || v_branch::text || ':' || v_activity || ':' || v_unit::text, 0));
  if not exists(select 1 from ops.location_movements m where m.org_id=v_org and m.branch_id=v_branch
    and m.activity=v_activity and m.kind='opening' and m.movement_date<=v_date) then
    raise exception 'CAFE_LOCATION_MOVE_BALANCE_UNALLOCATED' using errcode = 'P0001';
  end if;
  -- Check the move-day balance and every later daily closing balance, not only today's stock.
  with daily as (
    select m.movement_date,
      sum(case when m.to_location_id=v_from then m.quantity else 0 end
        - case when m.from_location_id=v_from then m.quantity else 0 end) as delta
    from ops.location_movements m
    where m.org_id=v_org and m.branch_id=v_branch and m.activity=v_activity and m.item_unit_id=v_unit
    group by m.movement_date
  ), running as (
    select movement_date,sum(delta) over(order by movement_date) as balance from daily
  ), checked as (
    select balance from running where movement_date>v_date
    union all
    select coalesce(sum(delta),0) from daily where movement_date<=v_date
  ) select min(balance) into v_balance from checked;
  if v_balance < v_quantity then raise exception 'CAFE_LOCATION_MOVE_INSUFFICIENT_STOCK' using errcode = 'P0001'; end if;
  insert into ops.location_movements (id,org_id,branch_id,activity,item_id,item_unit_id,from_location_id,to_location_id,
    quantity,movement_date,kind,source_type,source_id,actor_id,client_request_id,payload_hash,note)
  values (v_movement_id,v_org,v_branch,v_activity,v_item,v_unit,v_from,v_to,v_quantity,v_date,'move','move',v_movement_id,v_actor,p_client_request_id,v_hash,v_note)
  returning * into v_row;
  return jsonb_build_object('movement_id',v_row.id,'row_version',v_row.row_version);
end;
$$;
create or replace function ops._post_cafe_log_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid := new.item_unit_id;
  v_place uuid;
  v_default boolean := false;
begin
  if new.org_id is distinct from shared.current_org_id() then
    raise exception 'CAFE_LOCATION_MOVE_FORBIDDEN' using errcode = '42501';
  end if;
  v_place := case when new.action='produce' then new.to_storage_location_id else new.from_storage_location_id end;
  if v_place is null then
    select d.storage_location_id into v_place from ops.stream_location_defaults d
     join ops.locations l on l.org_id=d.org_id and l.id=d.storage_location_id
     join ops.location_branches b on b.org_id=l.org_id and b.location_id=l.id and b.branch_id=d.branch_id
     where d.org_id=new.org_id and d.branch_id=new.branch_id and d.activity=new.activity
       and l.archived_at is null and l.use in ('storage','both');
    v_default := v_place is not null;
  end if;
  if v_place is null then return new; end if;
  if v_unit is null then
    select id into v_unit from ops.item_units
     where org_id=new.org_id and wip_item_id=new.wip_item_id and is_default and confirmed_at is not null;
  end if;
  if v_unit is null then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.org_id::text || ':' || new.branch_id::text || ':' || new.activity || ':' || v_unit::text,0));
  insert into ops.location_movements(org_id,branch_id,activity,item_id,item_unit_id,from_location_id,to_location_id,
    quantity,movement_date,kind,source_type,source_id,actor_id,note)
  values(new.org_id,new.branch_id,new.activity,new.wip_item_id,v_unit,
    case when new.action<>'produce' then v_place end,case when new.action='produce' then v_place end,
    new.qty_porsi,new.log_date,case when new.action='produce' then 'production' else new.action end,
    'log',new.id,shared.current_person_id(),case when v_default then 'default place' end)
  on conflict do nothing;
  return new;
end;
$$;
create or replace function ops._approve_kitchen_log_impl(p_log_id uuid, p_review_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log ops.kitchen_logs;
  v_wip ops.wip_items;
  v_item_unit ops.item_units;
  v_prefix text;
  v_next_n integer;
  v_batch_id text;
  v_endpoint text;
  v_payload jsonb;
  v_target text;
  v_dedup text;
  v_stock_qty numeric(12,2);
  v_branch_code text;
  v_dest_code text;
begin
  select * into v_log from ops.kitchen_logs where id = p_log_id for update;
  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if v_log.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot approve a log outside your org' using errcode = '42501';
  end if;
  if v_log.status <> 'Submitted' then
    raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003';
  end if;
  if not ops.can_review_stream(v_log.branch_id, v_log.activity) then
    raise exception 'only the stream''s supervisor or ops_lead/admin may approve' using errcode = '42501';
  end if;
  if v_log.action = 'transfer' and exists (
    select 1 from ops.kitchen_logs l
     where l.org_id = v_log.org_id and l.branch_id = v_log.branch_id
       and l.activity = v_log.activity and l.log_date = v_log.log_date
       and l.action = 'produce' and l.status = 'Submitted'
  ) then
    raise exception 'transfer approval is locked while the stream''s production is still Submitted for the day'
      using errcode = 'P0004';
  end if;
  if v_log.action = 'waste' and not exists (
    select 1 from storage.objects photo
    where photo.bucket_id = 'waste-photos'
      and ops.cafe_waste_photo_log_id(photo.name) = v_log.id
  ) then
    raise exception 'a waste log needs at least one uploaded photo before approval' using errcode = '23514';
  end if;

  if v_log.action <> 'waste' then
    v_prefix := ops.kitchen_batch_prefix(v_log.action, v_log.branch_id, v_log.destination_branch_id);
    insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
    values (v_log.org_id, v_prefix, v_log.log_date, 1)
    on conflict (org_id, prefix, log_date) do update
      set last_n = ops.kitchen_batch_seq.last_n + 1
    returning last_n into v_next_n;
    v_batch_id := v_prefix || '-' || to_char(v_log.log_date, 'YYYYMMDD') || '-'
                  || lpad(v_next_n::text, 3, '0');
  end if;

  update ops.kitchen_logs
     set status = 'Approved', reviewed_by = shared.current_person_id(), reviewed_at = now(),
         review_note = p_review_note, batch_id = v_batch_id
   where id = p_log_id;

  -- Quantities are summed as recorded in their bound item_unit_id; no unit conversion is applied.
  -- Waste consumes the recorded stock just like a transfer, while production adds it.
  select coalesce(sum(case when l.action = 'produce' then l.qty_porsi else -l.qty_porsi end), 0)::numeric(12,2)
    into v_stock_qty
    from ops.kitchen_logs l
   where l.org_id = v_log.org_id and l.wip_item_id = v_log.wip_item_id
     and l.branch_id = v_log.branch_id and l.activity = v_log.activity
     and l.log_date = v_log.log_date and l.status = 'Approved';
  insert into ops.kitchen_stock (org_id, log_date, wip_item_id, branch_id, activity, usable_qty)
  values (v_log.org_id, v_log.log_date, v_log.wip_item_id, v_log.branch_id, v_log.activity, v_stock_qty)
  on conflict (org_id, log_date, wip_item_id, branch_id, activity) do update
    set usable_qty = excluded.usable_qty, updated_at = now();

  -- Waste remains a reviewed MOS record, but its verified ERP mapping is intentionally absent.
  -- Return NULL and exit before the sole outbox insert; no batch sequence is consumed.
  if v_log.action = 'waste' then
    return null;
  end if;

  select * into v_wip from ops.wip_items where id = v_log.wip_item_id;
  if v_log.item_unit_id is not null then
    select * into v_item_unit from ops.item_units
     where id = v_log.item_unit_id
       and org_id = v_log.org_id
       and wip_item_id = v_log.wip_item_id;
  end if;
  select b.code into v_branch_code from shared.branches b where b.id = v_log.branch_id;
  select b.code into v_dest_code from shared.branches b where b.id = v_log.destination_branch_id;
  v_endpoint := ops.esb_endpoint_for(v_log.action, v_log.branch_id, v_log.destination_branch_id);
  v_payload := jsonb_build_object(
    'batch_id', v_batch_id, 'log_date', v_log.log_date, 'wip_item_id', v_log.wip_item_id,
    'esb_bom_id', v_wip.esb_bom_id,
    'esb_product_detail_id_porsi', coalesce(
      v_item_unit.esb_product_detail_id,
      v_wip.esb_product_detail_id_porsi
    ),
    'qty_porsi', v_log.qty_porsi, 'action', v_log.action, 'activity', v_log.activity,
    'branch_id', v_log.branch_id, 'branch_code', v_branch_code,
    'destination_branch_id', v_log.destination_branch_id, 'destination_branch_code', v_dest_code);
  v_target := integrations.current_esb_target_env();
  v_dedup := 'kitchen|' || v_batch_id || '|' || v_target;
  insert into integrations.esb_push
    (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key)
  values (v_log.org_id, 'kitchen', v_batch_id, v_endpoint, v_payload, v_target, v_dedup)
  on conflict (org_id, dedup_key) do nothing;
  return v_batch_id;
end;
$$;
create or replace function ops.stock_available_for_date(
  p_wip_item_id uuid, p_as_of date, p_branch_id uuid, p_activity text)
returns numeric(12,2)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(
    case when l.action = 'produce' then l.qty_porsi else -l.qty_porsi end
  ), 0)::numeric(12,2)
  from ops.kitchen_logs l
  where l.org_id = shared.current_org_id()
    and l.wip_item_id = p_wip_item_id
    and l.branch_id = p_branch_id
    and l.activity = p_activity
    and l.status = 'Approved'
    and l.log_date < p_as_of
$$;
create or replace function ops.esb_endpoint_for(
  p_action text, p_branch_id uuid, p_destination_branch_id uuid)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_action = 'produce'                  then 'assembly-actual'
    when p_destination_branch_id = p_branch_id then 'noop'
    when p_action = 'transfer'                 then 'simple-transfer'
  end
$$;
create or replace function ops.action_label(ops.kitchen_logs)
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select ops.kitchen_action_label($1.action, $1.destination_branch_id) $$;
comment on function ops.action_label(ops.kitchen_logs) is
  'Virtual column: the derived action label for a kitchen log (DD-WAY-13). There is no stored action_type.';

create or replace function ops.action_label(ops.kitchen_plans)
returns text
language sql
stable
security invoker
set search_path = ''
as $$ select ops.kitchen_action_label($1.action, $1.destination_branch_id) $$;
comment on function ops.action_label(ops.kitchen_plans) is
  'Virtual column: the derived action label for a kitchen plan (DD-WAY-13). There is no stored action_type.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The batch_id prefix — derived, not stored
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PR / TR / TB were the incumbent's prefixes and they are kept, so an operator reading a batch id
-- sees what they have always seen (FR-051). They are derived here from the same three inputs as the
-- label, which is what makes ops.kitchen_batch_seq's CHECK a counter namespace rather than a second
-- home for the banned literals: no fact row stores a prefix.
create or replace function ops.kitchen_batch_prefix(
  p_action text, p_branch_id uuid, p_destination_branch_id uuid)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_action = 'produce'                        then 'PR'
    when p_destination_branch_id = p_branch_id       then 'TB'
    when p_action = 'transfer'                       then 'TR'
  end
$$;
create or replace function ops.action_label(ops.kitchen_plans) returns text language sql stable security invoker set search_path = '' as $$ select ops.kitchen_action_label($1.action,$1.destination_branch_id) $$;
drop function ops._check_cafe_move_balance(uuid,uuid,text,uuid,uuid,date,numeric);
alter table ops.kitchen_logs drop constraint kitchen_logs_action_check,drop constraint kitchen_logs_destination_matches_action,
 add constraint kitchen_logs_action_check check(action in ('produce','transfer','waste')),
 add constraint kitchen_logs_destination_matches_action check((action='transfer' and destination_branch_id is not null) or (action in ('produce','waste') and destination_branch_id is null));
alter table ops.kitchen_plans drop constraint kitchen_plans_action_check,drop constraint kitchen_plans_destination_matches_action,
 add constraint kitchen_plans_action_check check(action in ('produce','transfer')),
 add constraint kitchen_plans_destination_matches_action check((action='transfer' and destination_branch_id is not null) or (action='produce' and destination_branch_id is null));
drop policy kitchen_logs_insert_member on ops.kitchen_logs;
create policy kitchen_logs_insert_member on ops.kitchen_logs for insert to authenticated with check (
 org_id=(select shared.current_org_id()) and submitted_by=(select shared.current_person_id()) and source='mos'
 and ((select shared.is_cafe_affiliated()) or (select shared.has_access_role('ops_lead')) or (select shared.has_access_role('admin'))) and ((status='Submitted' and action in ('produce','transfer')) or (status='Draft' and action='waste')));
revoke execute on function ops._approve_kitchen_log_impl(uuid,text) from public, anon, authenticated, service_role;
revoke execute on function ops._post_cafe_log_location() from public, anon, authenticated, service_role;
commit;
