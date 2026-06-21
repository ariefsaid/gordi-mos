-- P4 Kitchen Module — per-date stock for ALL active items in ONE round-trip (FR-022/023 SPA read).
-- The SPA needs usable + available per item for a given as-of date without N calls. The scalar
-- ops.stock_available_for_date(item, date) only does one item; this set-returning view returns a row
-- per active wip_item in the caller's org, joining the stored end-of-day usable_qty (ops.kitchen_stock,
-- 0 when no row that day) and the start-of-day net available (the scalar, reused per row via LATERAL).
--
-- SECURITY INVOKER + set search_path='': RLS on ops.wip_items / ops.kitchen_stock (org_id =
-- shared.current_org_id()) naturally scopes the result to the caller's org — mirrors the read helpers
-- (ops.stock_available_for_date). No DEFINER, so no PUBLIC-execute escalation / no definer-revoke lint.
create or replace function ops.kitchen_stock_for_date(p_as_of date)
returns table(wip_item_id uuid, usable_qty numeric(12,2), available_qty numeric(12,2))
language sql
stable
security invoker
set search_path = ''
as $$
  select
    w.id,
    coalesce(s.usable_qty, 0)::numeric(12,2),
    av.available_qty
  from ops.wip_items w
  left join ops.kitchen_stock s
    on s.wip_item_id = w.id
   and s.log_date = p_as_of
  cross join lateral (
    select ops.stock_available_for_date(w.id, p_as_of) as available_qty
  ) av
  where w.flag_active
$$;
comment on function ops.kitchen_stock_for_date(date) is
  'Per-date stock for all active wip_items in the caller org (FR-022/023 SPA read): usable_qty from ops.kitchen_stock (0 if none) + available_qty from ops.stock_available_for_date. SECURITY INVOKER — RLS scopes the org.';

grant execute on function ops.kitchen_stock_for_date(date) to authenticated;

-- DOWN: drop function ops.kitchen_stock_for_date(date);
