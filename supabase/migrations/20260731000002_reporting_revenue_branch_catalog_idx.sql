-- I-3 (code-quality review 2026-07-30, open follow-up in docs/reviews/dev.md "carried from the
-- previous window (code-quality): list_revenue_branches() lacks an index for its DISTINCT over the
-- growing revenue fact table"): give reporting.list_revenue_branches()
-- (20260729000004_supervisor_revenue_scope.sql:114-125) the covering index its DISTINCT needs.
--
-- The function is:
--     select distinct r.channel, r.branch_code, r.branch_name
--       from reporting.sales_daily_revenue r
--      where r.org_id = shared.current_org_id()
--      order by r.channel, r.branch_name
-- The table's existing indexes — (org_id, revenue_date desc) and (org_id, channel, revenue_date desc) —
-- do not carry branch_name/branch_code, so the DISTINCT cannot be served from them. It degenerates to a
-- Seq Scan + HashAggregate + Sort over the org's ENTIRE revenue history: reporting.sales_daily_revenue is
-- a fact table the VPS snapshot job appends to nightly (03:30 WIB) and NEVER prunes, so a People-page load
-- materialises every historical row to emit ~40 distinct branches. It runs on every admin People-page load
-- (NFR-303).
--
-- The covering index (org_id, channel, branch_name, branch_code) lets the planner serve the query as a
-- Unique node over an index-only scan: for a fixed org_id the index is already ordered by the DISTINCT set
-- {channel, branch_name, branch_code} AND by the ORDER BY (channel, branch_name), so it emits only the
-- distinct rows with zero heap access. EXPLAIN on a representative 58,480-row / 80-branch dataset:
--   BEFORE: Sort -> HashAggregate -> Seq Scan (reads all 58,480 rows; 121kB hash; sort).
--   AFTER : Unique -> Index Only Scan using sales_daily_revenue_branch_catalog_idx (Heap Fetches: 0;
--           no sort; no hash aggregate; emits 80 rows).
--
-- Read-only index — no write-path or RLS change. Mirrors the existing reporting index-naming convention.

create index sales_daily_revenue_branch_catalog_idx
  on reporting.sales_daily_revenue (org_id, channel, branch_name, branch_code);

-- DOWN:
-- drop index if exists reporting.sales_daily_revenue_branch_catalog_idx;
