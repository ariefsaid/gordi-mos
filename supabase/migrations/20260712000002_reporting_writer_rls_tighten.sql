-- Tighten reporting_writer RLS policies (audit finding A4 — Sec Med).
--
-- CONTEXT:
-- The snapshot job (scripts/reporting_snapshot.py) is single-org per run: it reads REPORTING_ORG_ID
-- from env and writes that org_id into every row. The job does NOT set a Postgres session-level
-- org context (no GUC, no set_config), so RLS cannot scope writes to a specific org_id at runtime.
--
-- PRIOR STATE (VULNERABLE):
-- All three policies used `using (true) with check (true)`, meaning a leak of the reporting_writer
-- credential = unbounded cross-org financial READ+WRITE (any org_id, including NULL/bogus values).
--
-- FIX:
-- Replace `with check (true)` with a predicate that validates org_id:
--   - org_id must be NOT NULL (rejects NULL-org rows)
--   - org_id must exist in shared.orgs (rejects bogus/non-existent orgs)
--
-- LIMITATIONS (why this is the tightest feasible fix):
--   1. No session-level org context → RLS cannot scope to a single org at runtime
--   2. The job legitimately needs to UPDATE rows it previously inserted (same org)
--   3. UPDATE path keeps `using (true)` because:
--      - Conflict targets include org_id, so the job only updates rows it wrote
--      - WITH CHECK still validates the new row data
--   4. A credential leak still allows writes to ANY valid org (all orgs that exist)
--
-- MITIGATION (beyond RLS):
--   - Credential custody is an F/ops control (docs/reference/warehouse-online.md)
--   - SELECT policies are org-scoped to shared.current_org_id(), so read exposure is contained
--   - reporting_writer has no SELECT grant on these tables (write-only, no read privilege)
--
-- This fix closes the immediate vulnerability (NULL/bogus org injection) while accepting the
-- cross-org WRITE risk as a credential-custody issue. A full fix would require changing the
-- snapshot job to set a session GUC and scoping RLS to that GUC, which is outside the scope
-- of this security-hardening round.

-- ── reporting.ingredient_cost_lines ────────────────────────────────────────────
drop policy if exists ingredient_cost_lines_write_reporting_writer
  on reporting.ingredient_cost_lines;

create policy ingredient_cost_lines_write_reporting_writer
  on reporting.ingredient_cost_lines
  for all
  to reporting_writer
  using (true)  -- UPDATE path: job only updates rows it previously inserted (org_id in conflict target)
  with check (
    org_id is not null
    and exists (select 1 from shared.orgs o where o.id = org_id)
  );

comment on policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines is
  'Scoped snapshot-writer role bypass for FORCE RLS. Tightened (A4): requires org_id NOT NULL and '
  'exists in shared.orgs. UPDATE path keeps using(true) because conflict target includes org_id, '
  'so the job only updates rows it previously inserted. Cross-org WRITE risk remains if credential '
  'leaks (F/ops mitigation). No SELECT privilege on this table.';

-- ── reporting.bom_lines ────────────────────────────────────────────────────────
drop policy if exists bom_lines_write_reporting_writer
  on reporting.bom_lines;

create policy bom_lines_write_reporting_writer
  on reporting.bom_lines
  for all
  to reporting_writer
  using (true)  -- UPDATE path: job only updates rows it previously inserted (org_id in conflict target)
  with check (
    org_id is not null
    and exists (select 1 from shared.orgs o where o.id = org_id)
  );

comment on policy bom_lines_write_reporting_writer on reporting.bom_lines is
  'Scoped snapshot-writer role bypass for FORCE RLS. Tightened (A4): requires org_id NOT NULL and '
  'exists in shared.orgs. UPDATE path keeps using(true) because conflict target includes org_id, '
  'so the job only updates rows it previously inserted. Cross-org WRITE risk remains if credential '
  'leaks (F/ops mitigation). No SELECT privilege on this table.';

-- ── reporting.sales_margin_daily ────────────────────────────────────────────────
drop policy if exists sales_margin_daily_write_reporting_writer
  on reporting.sales_margin_daily;

create policy sales_margin_daily_write_reporting_writer
  on reporting.sales_margin_daily
  for all
  to reporting_writer
  using (true)  -- UPDATE path: job only updates rows it previously inserted (org_id in conflict target)
  with check (
    org_id is not null
    and exists (select 1 from shared.orgs o where o.id = org_id)
  );

comment on policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily is
  'Scoped snapshot-writer role bypass for FORCE RLS. Tightened (A4): requires org_id NOT NULL and '
  'exists in shared.orgs. UPDATE path keeps using(true) because conflict target includes org_id, '
  'so the job only updates rows it previously inserted. Cross-org WRITE risk remains if credential '
  'leaks (F/ops mitigation). No SELECT privilege on this table.';

-- DOWN: recreate original permissive policies
-- drop policy if exists sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily;
-- drop policy if exists bom_lines_write_reporting_writer on reporting.bom_lines;
-- drop policy if exists ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines;
-- create policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines
--   for all to reporting_writer using (true) with check (true);
-- create policy bom_lines_write_reporting_writer on reporting.bom_lines
--   for all to reporting_writer using (true) with check (true);
-- create policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily
--   for all to reporting_writer using (true) with check (true);
-- comment on policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines is
--   'Scoped snapshot-writer role bypass for FORCE RLS (warehouse→Supabase job). No SELECT-policy exposure to end users.';
-- comment on policy bom_lines_write_reporting_writer on reporting.bom_lines is
--   'Scoped snapshot-writer role bypass for FORCE RLS (warehouse→Supabase job). No SELECT-policy exposure to end users.';
-- comment on policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily is
--   'Scoped snapshot-writer role bypass for FORCE RLS. Grain-narrowing happens at the app/query layer '
--   '(single-org snapshot job); this role has no SELECT-policy exposure to end users.';