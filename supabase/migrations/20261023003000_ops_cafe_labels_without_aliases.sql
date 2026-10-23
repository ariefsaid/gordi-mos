-- Café locations first, part 3 (no fragile rules in the database).
--   * Labels come from Location names. The "Bungur" alias goes: a Location named Bungur reads
--     "Transfer to Bungur"; a Branch with no Location reads its own name.
--   * Stream location defaults are no longer read by any decision in SQL (the table stays).
--   * A reviewed transfer or send inside one Branch, to a Location working in the same Activity,
--     keeps the Stream's stock; nothing is queued for ESB for a route whose switch is off.
--
-- DOWN: run supabase/rollbacks/20261023003000_ops_cafe_labels_without_aliases.sql.

create or replace function ops.kitchen_action_label(p_action text, p_destination_branch_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_action = 'produce' then 'Production'
    when p_action = 'waste' then 'Waste'
    when p_action = 'transfer' then
      'Transfer to ' || coalesce(
        (select b.name from shared.branches b where b.id = p_destination_branch_id),
        'another branch')
  end
$$;
comment on function ops.kitchen_action_label(text, uuid) is
  'Action label from action + destination Branch name. No alias: Location names come through the three-argument form.';

create function ops.kitchen_action_label(p_action text, p_destination_branch_id uuid, p_to_location_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when p_action = 'transfer' and p_to_location_id is not null and exists (select 1 from ops.locations l where l.id = p_to_location_id)
      then 'Transfer to ' || (select l.name from ops.locations l where l.id = p_to_location_id)
    else ops.kitchen_action_label(p_action, p_destination_branch_id)
  end
$$;
comment on function ops.kitchen_action_label(text, uuid, uuid) is
  'Action label that names the destination Location when the row has one, else the destination Branch.';
revoke execute on function ops.kitchen_action_label(text, uuid, uuid) from public, anon;
grant execute on function ops.kitchen_action_label(text, uuid, uuid) to authenticated;

create or replace function ops.action_label(ops.kitchen_logs) returns text
language sql stable security invoker set search_path = '' as $$
 select case when $1.action='outlet_send' then 'Send to ' || coalesce(
   (select b.name from shared.branches b where b.org_id=$1.org_id and b.id=$1.branch_id),'branch') || ' outlet'
 else ops.kitchen_action_label($1.action,$1.destination_branch_id,$1.to_storage_location_id) end
$$;
create or replace function ops.action_label(ops.kitchen_plans) returns text
language sql stable security invoker set search_path = '' as $$
 select case when $1.action='outlet_send' then 'Send to ' || coalesce(
   (select b.name from shared.branches b where b.org_id=$1.org_id and b.id=$1.branch_id),'branch') || ' outlet'
 else ops.kitchen_action_label($1.action,$1.destination_branch_id,$1.to_location_id) end
$$;

-- The old outlet-send rule, now read from Locations: the Stream's production Location (which must
-- also be able to hold stock) and the one other storage Location of its Branch.
create or replace function ops.cafe_outlet_send_places(p_branch uuid, p_activity text)
returns table(from_location_id uuid,to_location_id uuid)
language sql stable security invoker set search_path = '' as $$
 with src as (
  select l.id from ops.locations l
   where l.org_id = shared.current_org_id() and l.id = ops._cafe_stream_production_location(shared.current_org_id(), p_branch, p_activity)
     and l.use = 'both'
 ), choices as (
  select src.id as source, s.id as destination from src
   join ops.locations s on s.org_id = shared.current_org_id() and s.archived_at is null
                       and s.use in ('storage','both') and s.id <> src.id
   join ops.location_branches sb on sb.org_id = s.org_id and sb.location_id = s.id and sb.branch_id = p_branch
   where p_activity = 'kitchen'
     and exists (select 1 from shared.teams t join shared.branches b on b.org_id = t.org_id and b.id = t.branch_id and b.archived_at is null
                  where t.org_id = shared.current_org_id() and t.branch_id = p_branch and t.activity = p_activity
                    and t.produces and t.archived_at is null)
 ) select source,destination from choices where (select count(*) from choices)=1
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
  v_internal boolean;
begin
  if new.org_id is distinct from shared.current_org_id() then
    raise exception 'CAFE_LOCATION_MOVE_FORBIDDEN' using errcode = '42501';
  end if;
  v_internal := new.action = 'outlet_send'
    or (new.action = 'transfer' and new.from_storage_location_id is not null
        and ops._cafe_move_keeps_stream_stock(new.org_id, new.action, new.branch_id, new.activity,
                                               new.destination_branch_id, new.to_storage_location_id));
  if v_internal then
    perform ops._check_cafe_move_balance(new.org_id,new.branch_id,new.activity,new.item_unit_id,
      new.from_storage_location_id,new.log_date,new.qty_porsi);
    insert into ops.location_movements(org_id,branch_id,activity,item_id,item_unit_id,from_location_id,to_location_id,
      quantity,movement_date,kind,source_type,source_id,actor_id,note)
    values(new.org_id,new.branch_id,new.activity,new.wip_item_id,new.item_unit_id,new.from_storage_location_id,
      new.to_storage_location_id,new.qty_porsi,new.log_date,'move','log',new.id,shared.current_person_id(),new.notes)
    on conflict do nothing;
    return new;
  end if;
  -- The place stock sits at is the log's own: no place, no posting. Nothing is inferred from a
  -- stream default, so a log with no place stays in the book's unplaced balance.
  v_place := case when new.action='produce' then new.to_storage_location_id else new.from_storage_location_id end;
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
    'log',new.id,shared.current_person_id(),null)
  on conflict do nothing;
  return new;
end;
$$;
revoke execute on function ops._post_cafe_log_location() from public, anon, authenticated, service_role;

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
  if v_log.action in ('transfer','outlet_send') and exists (
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

  -- Physical sends are reviewed records, not changes to the stream book or ERP documents.
  if v_log.action = 'outlet_send' then
    update ops.kitchen_logs set status='Approved', reviewed_by=shared.current_person_id(), reviewed_at=now(),
      review_note=p_review_note where id=p_log_id;
    return null;
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
  select coalesce(sum(case when l.action = 'produce' then l.qty_porsi
    when ops._cafe_move_keeps_stream_stock(l.org_id, l.action, l.branch_id, l.activity, l.destination_branch_id, l.to_storage_location_id) then 0
    else -l.qty_porsi end), 0)::numeric(12,2)
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
  v_endpoint := ops.esb_endpoint_for_movement(v_log.action, v_log.branch_id, v_log.activity, v_log.destination_branch_id);
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
revoke execute on function ops._approve_kitchen_log_impl(uuid,text) from public, anon, authenticated, service_role;

create or replace function ops.stock_available_for_date(
  p_wip_item_id uuid, p_as_of date, p_branch_id uuid, p_activity text)
returns numeric(12,2)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(
    case when l.action = 'produce' then l.qty_porsi
      when ops._cafe_move_keeps_stream_stock(l.org_id, l.action, l.branch_id, l.activity, l.destination_branch_id, l.to_storage_location_id) then 0
      else -l.qty_porsi end
  ), 0)::numeric(12,2)
  from ops.kitchen_logs l
  where l.org_id = shared.current_org_id()
    and l.wip_item_id = p_wip_item_id
    and l.branch_id = p_branch_id
    and l.activity = p_activity
    and l.status = 'Approved'
    and l.log_date < p_as_of
$$;

create or replace function ops.approve_kitchen_logs(
  p_log_ids uuid[],
  p_review_note text,
  p_expected_updated_at timestamptz[]
) returns table(group_id uuid, batch_ids text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := gen_random_uuid();
  v_env text := integrations.current_esb_target_env();
  v_endpoint text;
  v_org uuid;
  v_log_id uuid;
  v_ids uuid[];
  v_versions timestamptz[];
  v_batch_id text;
  v_batch_ids text[] := '{}';
  v_dedup text;
  v_first_branch uuid;
  v_first_activity text;
  v_first_destination uuid;
  v_first_log_date date;
  v_index integer;
begin
  if p_log_ids is null or cardinality(p_log_ids) = 0
     or p_expected_updated_at is null
     or cardinality(p_log_ids) <> cardinality(p_expected_updated_at) then
    raise exception 'bulk approval requires one row version per log' using errcode = '22023';
  end if;
  if (select count(distinct submitted.id) from unnest(p_log_ids) as submitted(id)) <> cardinality(p_log_ids) then
    raise exception 'bulk approval requires distinct log ids' using errcode = '22023';
  end if;

  select array_agg(submitted.id order by submitted.id),
         array_agg(submitted.version order by submitted.id)
    into v_ids, v_versions
    from unnest(p_log_ids, p_expected_updated_at) as submitted(id, version);

  select l.org_id, ops.esb_endpoint_for_movement(l.action, l.branch_id, l.activity, l.destination_branch_id),
         l.branch_id, l.activity, l.destination_branch_id, l.log_date
    into v_org, v_endpoint, v_first_branch, v_first_activity, v_first_destination, v_first_log_date
    from ops.kitchen_logs l where l.id = v_ids[1];
  if v_org is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from ops.kitchen_logs l
     where l.id = any(v_ids)
       and (l.org_id is distinct from (select shared.current_org_id()) or l.status <> 'Submitted')
  ) or (select count(*) from ops.kitchen_logs where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'bulk approval contains a log that is not eligible' using errcode = 'P0003';
  end if;
  if exists (
    select 1 from ops.kitchen_logs l
     where l.id = any(v_ids)
       and (ops.esb_endpoint_for_movement(l.action, l.branch_id, l.activity, l.destination_branch_id) <> v_endpoint
         or l.destination_branch_id is distinct from v_first_destination
         or l.branch_id is distinct from v_first_branch
         or l.activity is distinct from v_first_activity
         or l.log_date is distinct from v_first_log_date)
  ) then
    raise exception 'bulk approval requires one ERP endpoint, stream, and date per document' using errcode = '22023';
  end if;
  if exists (select 1 from ops.kitchen_logs l where l.id = any(v_ids) and l.action = 'waste') then
    raise exception 'waste logs must be approved individually; ERP posting is held' using errcode = '22023';
  end if;
  if v_endpoint = 'noop' then
    raise exception 'bulk approval cannot mint a document for noop-only movements' using errcode = '22023';
  end if;
  if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'only ops_lead/admin may approve' using errcode = '42501';
  end if;

  v_dedup := 'kitchen-group|' || v_group::text || '|' || v_env;
  insert into integrations.esb_push_groups(id, org_id, target_env, dedup_key)
    values (v_group, v_org, v_env, v_dedup);

  for v_index in 1..cardinality(v_ids) loop
    v_log_id := v_ids[v_index];
    select ops.approve_kitchen_log(v_log_id, p_review_note, v_versions[v_index]) into v_batch_id;
    v_batch_ids := array_append(v_batch_ids, v_batch_id);
    update ops.kitchen_logs set push_group_id = v_group where id = v_log_id;
    update integrations.esb_push set push_group_id = v_group
     where org_id = v_org and source_module = 'kitchen'
       and source_ref = (select l.batch_id from ops.kitchen_logs l where l.id = v_log_id);
  end loop;

  return query select v_group, v_batch_ids;
end;
$$;

create or replace function ops._cafe_count_movements_settled(p_org_id uuid, p_branch_id uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_day < (statement_timestamp() at time zone 'Asia/Jakarta')::date
    and not exists (
      select 1 from ops.kitchen_logs log
       where log.org_id = p_org_id and log.log_date = p_day
         and (log.branch_id = p_branch_id or log.destination_branch_id = p_branch_id)
         and (log.status = 'Submitted' or (log.status = 'Approved'
           and coalesce(ops.esb_endpoint_for_movement(log.action, log.branch_id, log.activity, log.destination_branch_id),'unmapped') <> 'noop'
           and (not log.posted_to_esb or nullif(log.esb_doc_num, '') is null or log.posted_at is null
             or exists (select 1 from integrations.esb_push push where push.org_id = log.org_id
               and push.source_module = 'kitchen' and push.source_ref = log.batch_id
               and push.status in ('pending','in_flight','failed','dead_letter')))))
    )
$$;
revoke all on function ops._cafe_count_movements_settled(uuid,uuid,date) from public,anon,authenticated,service_role;
