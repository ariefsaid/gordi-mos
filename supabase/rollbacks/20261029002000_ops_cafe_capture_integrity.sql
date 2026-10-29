-- Restore the previous batch formatter and remove the captured-unit association constraint.

alter table ops.kitchen_logs drop constraint kitchen_logs_item_unit_item_fkey;
alter table ops.item_units drop constraint item_units_id_item_key;

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
revoke execute on function ops._approve_kitchen_log_impl(uuid,text) from public, anon, authenticated;
