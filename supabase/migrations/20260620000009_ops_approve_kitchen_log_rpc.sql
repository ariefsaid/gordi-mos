-- The atomic approval RPC (FR-044/050/062/070/090). One SECURITY DEFINER, the single audited
-- multi-write point: (1) load + lock the log; (2) defense-in-depth role gate; (3) mint batch_id;
-- (4) flip Approved + stamps; (5) recompute kitchen_stock end-of-day; (6) enqueue the esb_push row;
-- (7) write the Daily Log summary mirror — all in one tx. The mirror insert (step 7) must satisfy
-- ops.log_entries's live log_entries_guard (I4): resolves the Kitchen-and-Bar BU under v_log.org_id
-- and raises P0004 if absent, so a NULL/foreign-org business_unit_id can never abort the tx.
create or replace function ops.approve_kitchen_log(p_log_id uuid, p_review_note text)
returns text  -- the minted batch_id
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log        ops.kitchen_logs;
  v_prefix     text;
  v_next_n     integer;
  v_batch_id   text;
  v_endpoint   text;
  v_payload    jsonb;
  v_target     text;
  v_dedup      text;
  v_stock_qty  numeric(12,2);
  v_wip        ops.wip_items;
  v_bu_kitchen uuid;
begin
  -- (1) load + lock the log row.
  select * into v_log from ops.kitchen_logs where id = p_log_id for update;

  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;

  if v_log.status <> 'Submitted' then
    raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003';
  end if;

  -- (2) defense-in-depth role gate (RLS already enforces; the RPC is the single audited point).
  if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
    raise exception 'only ops_lead/admin may approve' using errcode = '42501';
  end if;

  -- (3) mint batch_id (KQ-5). prefix by action_type (FR-050).
  v_prefix := case v_log.action_type
    when 'Production'           then 'PR'
    when 'Transfer to Radiant'  then 'TR'
    when 'Transfer to Bungur'   then 'TB' end;

  insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
  values (v_log.org_id, v_prefix, v_log.log_date, 1)
  on conflict (org_id, prefix, log_date) do update
    set last_n = ops.kitchen_batch_seq.last_n + 1
  returning last_n into v_next_n;

  v_batch_id := v_prefix || '-' || to_char(v_log.log_date, 'YYYYMMDD') || '-' || lpad(v_next_n::text, 3, '0');

  -- (4) flip Approved + stamps.
  update ops.kitchen_logs
     set status = 'Approved',
         reviewed_by = shared.current_person_id(),
         reviewed_at = now(),
         review_note = p_review_note,
         batch_id = v_batch_id
   where id = p_log_id;

  -- (5) recompute kitchen_stock end-of-day for (date, item) — net of ALL approved logs that day (FR-062).
  select coalesce(sum(
    case when action_type = 'Production' then qty_porsi else -qty_porsi end
  ), 0)::numeric(12,2)
    into v_stock_qty
    from ops.kitchen_logs
   where org_id = v_log.org_id and wip_item_id = v_log.wip_item_id
     and log_date = v_log.log_date and status = 'Approved';

  insert into ops.kitchen_stock (org_id, log_date, wip_item_id, usable_qty)
  values (v_log.org_id, v_log.log_date, v_log.wip_item_id, v_stock_qty)
  on conflict (org_id, log_date, wip_item_id) do update
    set usable_qty = excluded.usable_qty, updated_at = now();

  -- (6) enqueue the outbox row (FR-070). endpoint + payload by action_type (FR-071); Bungur = noop.
  select * into v_wip from ops.wip_items where id = v_log.wip_item_id;
  v_endpoint := case v_log.action_type
    when 'Production'           then 'assembly-actual'
    when 'Transfer to Radiant'  then 'simple-transfer'
    when 'Transfer to Bungur'   then 'noop' end;
  v_payload := jsonb_build_object(
    'batch_id', v_batch_id,
    'wip_item_id', v_log.wip_item_id,
    'esb_bom_id', v_wip.esb_bom_id,
    'esb_product_detail_id_porsi', v_wip.esb_product_detail_id_porsi,
    'qty_porsi', v_log.qty_porsi,
    'action_type', v_log.action_type,
    'log_date', v_log.log_date);
  v_target := integrations.current_esb_target_env();
  v_dedup  := 'kitchen|' || v_batch_id || '|' || v_target;

  insert into integrations.esb_push
    (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key)
  values (v_log.org_id, 'kitchen', v_batch_id, v_endpoint, v_payload, v_target, v_dedup)
  on conflict (dedup_key) do nothing;  -- idempotent enqueue (FR-092-shape for the push row)

  -- (7) summary mirror into ops.log_entries (FR-090/092). Idempotent per batch (partial unique idx).
  --  The mirror carries NO owner/RACI/status fields (FR-091/AC-061) — only org, BU, origin,
  --  event_type, title, detail, occurred_at. business_unit_id is the Kitchen-and-Bar BU resolved
  --  under v_log.org_id; if absent, raise (I4) — never insert a NULL/foreign-org BU that would trip
  --  the live ops.log_entries log_entries_guard (23514/23502) and abort this atomic tx.
  select id into v_bu_kitchen from shared.business_units
   where org_id = v_log.org_id and name = 'Kitchen and Bar' limit 1;
  if v_bu_kitchen is null then
    raise exception 'Kitchen and Bar business unit not found for org % — cannot mirror to Daily Log', v_log.org_id
      using errcode = 'P0004';
  end if;

  insert into ops.log_entries
    (org_id, business_unit_id, origin, event_type, title, detail, occurred_at)
  values (v_log.org_id, v_bu_kitchen, 'kitchen', 'production',
    'Production: ' || v_log.qty_porsi || ' portions approved (' || v_batch_id || ')',
    jsonb_build_object('batch_id', v_batch_id, 'wip_item_id', v_log.wip_item_id,
                       'qty_porsi', v_log.qty_porsi, 'action_type', v_log.action_type)::text,
    now())
  on conflict (org_id, ((detail::jsonb)->>'batch_id')) where origin = 'kitchen' do nothing;

  return v_batch_id;
end;
$$;
comment on function ops.approve_kitchen_log(uuid, text) is
  'Atomic approval (FR-044/050/062/070/090): mints batch_id, recomputes stock, enqueues outbox, writes Daily Log mirror (no R/A/status — FR-091). SECURITY DEFINER.';

revoke execute on function ops.approve_kitchen_log(uuid, text) from public, anon, authenticated;
grant execute on function ops.approve_kitchen_log(uuid, text) to authenticated;

-- DOWN: revoke execute on function ops.approve_kitchen_log(uuid, text) from authenticated;
--       drop function ops.approve_kitchen_log(uuid, text);
