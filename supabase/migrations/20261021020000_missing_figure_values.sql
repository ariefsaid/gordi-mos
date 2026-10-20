-- Keep absent snapshot values absent in reconciliation, stock and captured budget dates.
-- DOWN: run supabase/rollbacks/20261021020000_missing_figure_values.sql

alter table mos.budgets alter column cost_basis_as_of drop not null;

create or replace view mos.follow_up_recon_drift as
select
  coalesce(s.org_id, e.org_id)             as org_id,
  coalesce(s.counterparty, e.counterparty) as counterparty,
  coalesce(s.period, e.period)             as period,
  coalesce(s.mos_amount, 0)                as mos_amount,
  e.esb_reduction_amount::numeric          as esb_amount,
  coalesce(s.mos_amount, 0) - coalesce(e.esb_reduction_amount::numeric, 0) as drift,
  (coalesce(s.mos_amount, 0) <> coalesce(e.esb_reduction_amount::numeric, 0)) as is_drift
from mos.follow_up_recon_summary s
full outer join reporting.esb_ar_reduction e
  on e.org_id = s.org_id and e.counterparty = s.counterparty and e.period = s.period;

create or replace function ops.kitchen_stock_for_date(
  p_as_of date, p_branch_id uuid, p_activity text
)
returns table(wip_item_id uuid, usable_qty numeric(12,2), available_qty numeric(12,2))
language sql
stable
security invoker
set search_path = ''
as $$
  select
    item.id,
    stock.usable_qty::numeric(12,2),
    available.available_qty
    from ops.wip_items item
    left join ops.kitchen_stock stock
      on stock.wip_item_id = item.id
     and stock.log_date = p_as_of
     and stock.branch_id = p_branch_id
     and stock.activity = p_activity
    cross join lateral (
      select ops.stock_available_for_date(item.id, p_as_of, p_branch_id, p_activity) as available_qty
    ) available
   where item.flag_active
     and exists (
       select 1 from ops.stream_items stream_item
        where stream_item.org_id = item.org_id
          and stream_item.wip_item_id = item.id
          and stream_item.branch_id = p_branch_id
          and stream_item.activity = p_activity
     )
     and (
       (item.reference_source = 'manual' and item.kind = 'WIP')
       or (item.reference_source = 'erp_catalog' and exists (
         select 1 from ops.cafe_item_settings setting
          where setting.org_id = item.org_id
            and setting.wip_item_id = item.id
            and setting.branch_id = p_branch_id
            and setting.activity = p_activity
            and setting.kind in ('RAW', 'WIP')
            and (setting.is_active or coalesce(stock.usable_qty, 0) <> 0 or available.available_qty <> 0)
       ))
     )
$$;

comment on view mos.follow_up_recon_drift is
  'Reconciliation drift: MOS cash-landed against the ERP aggregate AR reduction, per counterparty and period. Any non-zero drift or unmatched side is a Finance exception.';
alter view mos.follow_up_recon_drift set (security_invoker = true);

comment on function ops.kitchen_stock_for_date(date, uuid, text) is
  'Per-stream stock for active manual WIP items and active, team-classified ERP items. An unrecorded stock balance remains null.';
grant execute on function ops.kitchen_stock_for_date(date, uuid, text) to authenticated;
