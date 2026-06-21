-- Defer the cross-module Daily-Log mirror (parity-first). The OLD kitchen app has no Daily Log and
-- writes no ops.log_entries row; MOS's Daily Log UI is flag-hidden, so the mirror (spec FR-090/092,
-- ADR-0012) is net-new logic with no parity equivalent. Re-create ops.approve_kitchen_log with the
-- SAME body MINUS step (7) — the ops.log_entries summary INSERT — and minus the Kitchen-and-Bar BU
-- lookup + P0004 "BU not found" raise that existed ONLY to feed that INSERT. All other steps are
-- unchanged and in order: org-ownership check, not-found/role/status guards, status→Approved +
-- reviewed_by/at + review_note, batch_id mint, stock recompute, esb_push enqueue, returns batch_id.
-- Reversible: the -- DOWN: block restores the prior (mirror-included) body verbatim. AC-060/AC-061
-- (the mirror) are deferred; to be re-added when the Daily Log module ships.
--
-- NOTE: migration 20260620000010 widened the ops.log_entries.origin CHECK to admit 'kitchen'. With
-- the mirror gone nothing writes origin='kitchen', but that widened CHECK is harmless dead surface
-- and is intentionally LEFT AS-IS (reverting it could fail if any seeded/test row used 'kitchen';
-- leaving it is the simplest, safe choice and keeps re-adding the mirror a one-migration change).
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
begin
  -- (1) load + lock the log row.
  select * into v_log from ops.kitchen_logs where id = p_log_id for update;

  if v_log.id is null then
    raise exception 'kitchen log not found' using errcode = 'P0002';
  end if;

  -- (1a) cross-tenant guard. This RPC is SECURITY DEFINER (RLS-bypassing), so the load above can
  -- lock ANY org's log; an org-B ops_lead's JWT satisfies the role gate below. Enforce org ownership
  -- here, BEFORE the role check or any write, so neither existence nor role is an oracle.
  if v_log.org_id is distinct from shared.current_org_id() then
    raise exception 'cannot approve a log outside your org' using errcode = '42501';
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

  -- (7) Daily Log mirror DEFERRED (parity-first). No ops.log_entries write; the Kitchen-and-Bar BU
  -- lookup + P0004 raise that existed only to feed it are removed too. Re-add with the Daily Log module.

  return v_batch_id;
end;
$$;
comment on function ops.approve_kitchen_log(uuid, text) is
  'Atomic approval (FR-044/050/062/070): mints batch_id, recomputes stock, enqueues outbox. Daily Log mirror (FR-090/091) deferred parity-first — re-add with the Daily Log module. SECURITY DEFINER.';

revoke execute on function ops.approve_kitchen_log(uuid, text) from public, anon, authenticated;
grant execute on function ops.approve_kitchen_log(uuid, text) to authenticated;

-- DOWN: restore the prior (mirror-included) body — re-adds step (7) plus the Kitchen-and-Bar BU
--       lookup + P0004 raise. Inverse of this migration.
--   create or replace function ops.approve_kitchen_log(p_log_id uuid, p_review_note text)
--   returns text language plpgsql security definer set search_path = '' as $$
--   declare
--     v_log ops.kitchen_logs; v_prefix text; v_next_n integer; v_batch_id text; v_endpoint text;
--     v_payload jsonb; v_target text; v_dedup text; v_stock_qty numeric(12,2); v_wip ops.wip_items;
--     v_bu_kitchen uuid;
--   begin
--     select * into v_log from ops.kitchen_logs where id = p_log_id for update;
--     if v_log.id is null then raise exception 'kitchen log not found' using errcode = 'P0002'; end if;
--     if v_log.org_id is distinct from shared.current_org_id() then
--       raise exception 'cannot approve a log outside your org' using errcode = '42501'; end if;
--     if v_log.status <> 'Submitted' then
--       raise exception 'log is not Submitted (current: %)', v_log.status using errcode = 'P0003'; end if;
--     if not (shared.has_access_role('ops_lead') or shared.has_access_role('admin')) then
--       raise exception 'only ops_lead/admin may approve' using errcode = '42501'; end if;
--     v_prefix := case v_log.action_type when 'Production' then 'PR'
--       when 'Transfer to Radiant' then 'TR' when 'Transfer to Bungur' then 'TB' end;
--     insert into ops.kitchen_batch_seq (org_id, prefix, log_date, last_n)
--     values (v_log.org_id, v_prefix, v_log.log_date, 1)
--     on conflict (org_id, prefix, log_date) do update set last_n = ops.kitchen_batch_seq.last_n + 1
--     returning last_n into v_next_n;
--     v_batch_id := v_prefix || '-' || to_char(v_log.log_date, 'YYYYMMDD') || '-' || lpad(v_next_n::text, 3, '0');
--     update ops.kitchen_logs set status = 'Approved', reviewed_by = shared.current_person_id(),
--       reviewed_at = now(), review_note = p_review_note, batch_id = v_batch_id where id = p_log_id;
--     select coalesce(sum(case when action_type = 'Production' then qty_porsi else -qty_porsi end),0)::numeric(12,2)
--       into v_stock_qty from ops.kitchen_logs where org_id = v_log.org_id and wip_item_id = v_log.wip_item_id
--       and log_date = v_log.log_date and status = 'Approved';
--     insert into ops.kitchen_stock (org_id, log_date, wip_item_id, usable_qty)
--     values (v_log.org_id, v_log.log_date, v_log.wip_item_id, v_stock_qty)
--     on conflict (org_id, log_date, wip_item_id) do update set usable_qty = excluded.usable_qty, updated_at = now();
--     select * into v_wip from ops.wip_items where id = v_log.wip_item_id;
--     v_endpoint := case v_log.action_type when 'Production' then 'assembly-actual'
--       when 'Transfer to Radiant' then 'simple-transfer' when 'Transfer to Bungur' then 'noop' end;
--     v_payload := jsonb_build_object('batch_id', v_batch_id, 'wip_item_id', v_log.wip_item_id,
--       'esb_bom_id', v_wip.esb_bom_id, 'esb_product_detail_id_porsi', v_wip.esb_product_detail_id_porsi,
--       'qty_porsi', v_log.qty_porsi, 'action_type', v_log.action_type, 'log_date', v_log.log_date);
--     v_target := integrations.current_esb_target_env();
--     v_dedup := 'kitchen|' || v_batch_id || '|' || v_target;
--     insert into integrations.esb_push (org_id, source_module, source_ref, endpoint, payload, target_env, dedup_key)
--     values (v_log.org_id, 'kitchen', v_batch_id, v_endpoint, v_payload, v_target, v_dedup)
--     on conflict (dedup_key) do nothing;
--     select id into v_bu_kitchen from shared.business_units
--       where org_id = v_log.org_id and name = 'Kitchen and Bar' limit 1;
--     if v_bu_kitchen is null then
--       raise exception 'Kitchen and Bar business unit not found for org % — cannot mirror to Daily Log', v_log.org_id
--         using errcode = 'P0004'; end if;
--     insert into ops.log_entries (org_id, business_unit_id, origin, event_type, title, detail, occurred_at)
--     values (v_log.org_id, v_bu_kitchen, 'kitchen', 'production',
--       'Production: ' || v_log.qty_porsi || ' portions approved (' || v_batch_id || ')',
--       jsonb_build_object('batch_id', v_batch_id, 'wip_item_id', v_log.wip_item_id,
--         'qty_porsi', v_log.qty_porsi, 'action_type', v_log.action_type)::text, now())
--     on conflict (org_id, ((detail::jsonb)->>'batch_id')) where origin = 'kitchen' do nothing;
--     return v_batch_id;
--   end; $$;
--   revoke execute on function ops.approve_kitchen_log(uuid, text) from public, anon, authenticated;
--   grant execute on function ops.approve_kitchen_log(uuid, text) to authenticated;
