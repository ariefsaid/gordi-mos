-- Reporting dashboard reads use the grain the screens render, not the underlying ESB-code grain.
-- The invoker option is load-bearing: these views must evaluate the source tables' forced RLS as
-- the authenticated caller.
-- DOWN:
--   drop view if exists reporting.sales_margin_daily_rollup;
--   drop view if exists reporting.sales_daily_revenue_rollup;

create view reporting.sales_daily_revenue_rollup
  with (security_invoker = true)
as
select
  revenue_date,
  channel,
  branch_code,
  branch_name,
  branch_id,
  min(esb_code) as esb_code,
  array_agg(distinct esb_code order by esb_code) as esb_codes,
  sum(transactions)::bigint as transactions,
  sum(clean_revenue)::numeric(14,2) as clean_revenue,
  max(snapshot_as_of) as snapshot_as_of,
  max(source_contract_version) as source_contract_version
from reporting.sales_daily_revenue
group by revenue_date, channel, branch_code, branch_name, branch_id;

grant select on reporting.sales_daily_revenue_rollup to authenticated;

create view reporting.sales_margin_daily_rollup
  with (security_invoker = true)
as
select
  margin_date,
  branch_code,
  branch_name,
  branch_id,
  min(esb_code) as esb_code,
  array_agg(distinct esb_code order by esb_code) as esb_codes,
  sum(revenue)::numeric(14,2) as revenue,
  case when bool_or(cogs_interim_sm is null) then null else sum(cogs_interim_sm)::numeric(14,2) end as cogs_interim_sm,
  case when bool_or(cogs_budget_bom is null) then null else sum(cogs_budget_bom)::numeric(14,2) end as cogs_budget_bom,
  case when bool_or(margin_interim is null) then null else sum(margin_interim)::numeric(14,2) end as margin_interim,
  avg(bom_coverage_pct)::numeric(8,4) as bom_coverage_pct,
  sum(bom_coverage_pct)::numeric(12,4) as bom_coverage_pct_sum,
  count(bom_coverage_pct)::integer as bom_coverage_count,
  max(snapshot_as_of) as snapshot_as_of,
  max(source_contract_version) as source_contract_version
from reporting.sales_margin_daily
group by margin_date, branch_code, branch_name, branch_id;

grant select on reporting.sales_margin_daily_rollup to authenticated;
