-- DOWN for 20261020006000. Keep ledger history, including imported allocations.
begin;
lock table ops.location_movements in access exclusive mode;
do $$ begin
  if not exists(select 1 from ops.location_movements where source_type='import') then
    alter table ops.location_movements drop constraint location_movements_source_type_check;
    alter table ops.location_movements add constraint location_movements_source_type_check
      check (source_type in ('opening','log','count','receipt','move'));
  else
    raise notice 'Keeping import source type to preserve movement history; export before any separate archival operation';
  end if;
end $$;
drop trigger cafe_log_location_approved on ops.kitchen_logs;
drop function ops._post_cafe_log_location();
drop function ops.place_cafe_unassigned_stock(jsonb,uuid);
create or replace function ops.cafe_location_balances(p_as_of date, p_branch_id uuid, p_activity text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_org uuid := shared.current_org_id();
  v_rows jsonb;
  v_unassigned boolean;
  v_bad_unit boolean;
  v_overallocated boolean;
  v_coverage text;
  v_reason text;
begin
  if v_org is null or not shared.is_org_member() then raise exception 'CAFE_LOCATION_FORBIDDEN' using errcode = '42501'; end if;
  if p_as_of is null or p_activity not in ('kitchen','bar') then
    raise exception 'CAFE_LOCATION_BALANCE_INVALID' using errcode = '22023';
  end if;
  if not exists (select 1 from shared.teams t where t.org_id=v_org and t.branch_id=p_branch_id and t.activity=p_activity and t.archived_at is null) then
    return jsonb_build_object('rows','[]'::jsonb,'as_of',clock_timestamp(),'coverage','unavailable','reason','stream_unavailable');
  end if;
  with stock as materialized (
    select * from ops.kitchen_stock_for_date(p_as_of,p_branch_id,p_activity)
  ), book as materialized (
    select stock.wip_item_id as item_id, unit.id as item_unit_id,
           stock.usable_qty, stock.available_qty
      from stock
      join ops.item_units unit on unit.wip_item_id=stock.wip_item_id and unit.org_id=v_org and unit.is_default
  ), location_balances as materialized (
    select m.item_id, m.item_unit_id, place.location_id,
           sum(case when m.to_location_id=place.location_id then m.quantity else 0 end)
             - sum(case when m.from_location_id=place.location_id then m.quantity else 0 end) as usable_qty,
           sum(case when m.movement_date<p_as_of and m.to_location_id=place.location_id then m.quantity else 0 end)
             - sum(case when m.movement_date<p_as_of and m.from_location_id=place.location_id then m.quantity else 0 end) as available_qty
      from ops.location_movements m
      cross join lateral (values (m.from_location_id),(m.to_location_id)) as place(location_id)
     where m.org_id=v_org and m.branch_id=p_branch_id and m.activity=p_activity
       and place.location_id is not null and m.movement_date<=p_as_of
     group by m.item_id,m.item_unit_id,place.location_id
  ), residuals as materialized (
    select null::uuid as location_id, book.item_id, book.item_unit_id,
           book.usable_qty-coalesce(sum(location_balances.usable_qty),0) as usable_qty,
           book.available_qty-coalesce(sum(location_balances.available_qty),0) as available_qty
      from book left join location_balances using (item_id,item_unit_id)
     group by book.item_id,book.item_unit_id,book.usable_qty,book.available_qty
  ), all_rows as materialized (
    select location_id,item_id,item_unit_id,usable_qty,available_qty from location_balances
    union all
    select location_id,item_id,item_unit_id,usable_qty,available_qty from residuals
     where usable_qty is null or available_qty is null or usable_qty<>0 or available_qty<>0
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'location_id',all_rows.location_id,'item_id',all_rows.item_id,'item_unit_id',all_rows.item_unit_id,
           'usable_qty',all_rows.usable_qty::text,'available_qty',all_rows.available_qty::text
         ) order by all_rows.item_id,all_rows.item_unit_id,all_rows.location_id nulls first),'[]'::jsonb),
         exists(select 1 from residuals where usable_qty<>0 or available_qty<>0),
         exists(select 1 from residuals where usable_qty<0 or available_qty<0),
         exists(select 1 from stock where available_qty is null or not exists (
           select 1 from ops.item_units unit where unit.wip_item_id=stock.wip_item_id and unit.org_id=v_org and unit.is_default
         )) or exists(select 1 from location_balances lb where not exists (
           select 1 from book where book.item_id=lb.item_id and book.item_unit_id=lb.item_unit_id
         ))
    into v_rows,v_unassigned,v_overallocated,v_bad_unit
    from all_rows;
  if v_bad_unit or v_overallocated then
    v_coverage := 'unavailable'; v_reason := case when v_bad_unit then 'historical_unit_unavailable' else 'location_balance_exceeds_stream' end;
  elsif v_unassigned then
    v_coverage := 'unallocated'; v_reason := 'opening_allocation_required';
  else
    v_coverage := 'complete'; v_reason := null;
  end if;
  return jsonb_build_object('rows',v_rows,'as_of',statement_timestamp(),'coverage',v_coverage,'reason',v_reason);
end;
$$;
comment on function ops.cafe_location_balances(date, uuid, text) is
  'Returns the existing stream usable/available totals only in Unassigned until opening allocation history exists. It never reconstructs a physical place from old production, a branch, a Site, or a default.';
revoke execute on function ops.cafe_location_balances(date, uuid, text) from public, anon, service_role;
grant execute on function ops.cafe_location_balances(date, uuid, text) to authenticated;

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
  select coalesce(sum(case when m.to_location_id=v_from then m.quantity else 0 end)
                   - sum(case when m.from_location_id=v_from then m.quantity else 0 end),0)
    into v_balance from ops.location_movements m
   where m.org_id=v_org and m.branch_id=v_branch and m.activity=v_activity and m.item_unit_id=v_unit and m.movement_date<=v_date;
  if v_balance < v_quantity then raise exception 'CAFE_LOCATION_MOVE_INSUFFICIENT_STOCK' using errcode = 'P0001'; end if;
  if (ops.cafe_location_balances(v_date,v_branch,v_activity)->>'coverage') <> 'complete' then
    raise exception 'CAFE_LOCATION_MOVE_BALANCE_UNALLOCATED' using errcode = 'P0001';
  end if;
  insert into ops.location_movements (id,org_id,branch_id,activity,item_id,item_unit_id,from_location_id,to_location_id,
    quantity,movement_date,kind,source_type,source_id,actor_id,client_request_id,payload_hash,note)
  values (v_movement_id,v_org,v_branch,v_activity,v_item,v_unit,v_from,v_to,v_quantity,v_date,'move','move',v_movement_id,v_actor,p_client_request_id,v_hash,v_note)
  returning * into v_row;
  return jsonb_build_object('movement_id',v_row.id,'row_version',v_row.row_version);
end;
$$;
comment on function ops.move_cafe_stock(jsonb, uuid) is
  'Posts one atomic, idempotent, same-stream physical move after checking complete location coverage and the exact item-unit source balance. It writes no ESB transaction.';
revoke execute on function ops.move_cafe_stock(jsonb, uuid) from public, anon, service_role;
grant execute on function ops.move_cafe_stock(jsonb, uuid) to authenticated;


commit;
