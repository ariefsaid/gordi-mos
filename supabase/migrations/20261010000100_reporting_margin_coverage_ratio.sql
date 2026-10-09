-- Keep warehouse snapshot rows and the linked sample-org fixture in one fractional unit.
-- The snapshot writer leaves branch_id null; the sample fixture links branches and already stores
-- a bounded fraction. Historical unlinked rows therefore still hold the warehouse's 0–100 value.
update reporting.sales_margin_daily
   set bom_coverage_pct = bom_coverage_pct / 100
 where branch_id is null
   and bom_coverage_pct is not null;

alter table reporting.sales_margin_daily
  add constraint sales_margin_daily_bom_coverage_ratio_check
  check (bom_coverage_pct between 0 and 10);

-- DOWN:
-- alter table reporting.sales_margin_daily
--   drop constraint sales_margin_daily_bom_coverage_ratio_check;
-- update reporting.sales_margin_daily
--    set bom_coverage_pct = bom_coverage_pct * 100
--  where branch_id is null
--    and bom_coverage_pct is not null;
