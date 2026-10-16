-- reporting: normalize remaining BOM coverage values and keep the stored unit bounded.
-- DOWN: alter table reporting.sales_margin_daily drop constraint sales_margin_daily_bom_coverage_ratio_check; leave converted values as ratios because historical and later ratio writes cannot be distinguished.
begin;

-- No real ratio exceeds 10; values above it are legacy percentage points.
update reporting.sales_margin_daily
   set bom_coverage_pct = bom_coverage_pct / 100
 where bom_coverage_pct > 10;

alter table reporting.sales_margin_daily
  drop constraint if exists sales_margin_daily_bom_coverage_ratio_check;

alter table reporting.sales_margin_daily
  add constraint sales_margin_daily_bom_coverage_ratio_check
  check (bom_coverage_pct is null or bom_coverage_pct between 0 and 10);

commit;
