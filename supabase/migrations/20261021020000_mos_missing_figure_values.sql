-- Keep absent snapshot values absent in reconciliation, stock and captured budget dates.
-- DOWN: run supabase/rollbacks/20261021020000_mos_missing_figure_values.sql

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
    -- The stock reader keeps an absent snapshot NULL; Locations retains its known start-of-day book.
    select stock.wip_item_id as item_id, unit.id as item_unit_id,
           stock.available_qty + coalesce(stock.usable_qty, 0) as usable_qty, stock.available_qty
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
         exists(select 1 from residuals where usable_qty<>0),
         exists(select 1 from residuals where usable_qty<0),
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
comment on function ops.cafe_location_balances(date,uuid,text) is
  'Place balances through the date and before the date, plus the corresponding Unassigned book remainders. Coverage describes the through-date allocation.';
grant execute on function ops.cafe_location_balances(date,uuid,text) to authenticated;

comment on view mos.follow_up_recon_drift is
  'Reconciliation drift: MOS cash-landed against the ERP aggregate AR reduction, per counterparty and period. Any non-zero drift or unmatched side is a Finance exception.';
alter view mos.follow_up_recon_drift set (security_invoker = true);

comment on function ops.kitchen_stock_for_date(date, uuid, text) is
  'Per-stream stock for active manual WIP items and active, team-classified ERP items. An unrecorded stock balance remains null.';
grant execute on function ops.kitchen_stock_for_date(date, uuid, text) to authenticated;
