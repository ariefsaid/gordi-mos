\set ON_ERROR_STOP on
create materialized view if not exists public.mv_daily_margin_interim as
  select r.revenue_date as margin_date,
         r.esb_code,
         coalesce(nullif(btrim(coalesce(r.branch_code,'')),''), r.esb_code::text) as branch_code,
         max(r.branch_name)      as branch_name,
         sum(r.clean_revenue)    as revenue,
         max(c.sm_total)         as cogs_interim_sm,
         max(c.bom_total)        as cogs_budget_bom,
         max(c.bom_coverage_pct) as bom_coverage_pct
  from public.v_daily_revenue_unified r
  left join public.v_daily_cogs_comparison c
    on c.cogs_date = r.revenue_date
   and c.esb_code::text = r.esb_code::text
   and c.branch_code = coalesce(nullif(btrim(coalesce(r.branch_code,'')),''), r.esb_code::text)
  where r.channel = 'POS'
    and r.revenue_date >= current_date - interval '90 days'
  group by r.revenue_date, r.esb_code, 3
with data;
create unique index if not exists mv_daily_margin_interim_pk on public.mv_daily_margin_interim (margin_date, esb_code, branch_code);
create index if not exists mv_daily_margin_interim_date on public.mv_daily_margin_interim (margin_date);
select count(*) as mv_rows, min(margin_date) as from_date, max(margin_date) as to_date,
       count(*) filter (where cogs_interim_sm is not null) as rows_with_cogs
from public.mv_daily_margin_interim;
