-- reporting_writer policy hardening review (audit finding A4 — Sec Med). DOCUMENTATION + rationale.
--
-- FINDING: the three reporting write policies use `using (true) with check (true)` for the
-- reporting_writer role, so a leaked reporting_writer credential = cross-org financial WRITE.
--
-- INVESTIGATION (Director, 2026-07-07): the two concerns collapse to different owners.
--   1) NULL / bogus / non-existent org_id injection — ALREADY PREVENTED by the schema, not RLS:
--      every reporting.* table declares `org_id uuid NOT NULL references shared.orgs(id)`. A NULL
--      org_id is rejected by the column (23502); a non-existent org_id is rejected by the FK (23503).
--      Neither requires the RLS WITH CHECK to re-validate. A first pass at this fix added
--      `with check (exists (select 1 from shared.orgs ...))` — that BROKE every writer INSERT with
--      `42501 permission denied for table orgs` (reporting_writer has no SELECT on shared.orgs, by
--      design), while adding nothing the FK + NOT NULL didn't already guarantee. Reverted.
--   2) Cross-org WRITE to a VALID other org by a leaked credential — the real residual risk. This
--      CANNOT be scoped at the RLS layer today: the snapshot job (scripts/reporting_snapshot.py) is
--      single-org-per-run (reads REPORTING_ORG_ID from env) but does NOT set a Postgres session org
--      context (no GUC / set_config), so a policy has no per-session org to scope `with check` to.
--
-- RESOLUTION: leave the policies functionally as-is (the schema already blocks null/bogus org; the
-- write bypass is required for the trusted batch feed), and record the residual cross-org-write risk
-- as an F/rollout hardening item with a concrete fix path. The mitigation until then is credential
-- CUSTODY (docs/reference/warehouse-online.md) — reporting_writer is a server-only snapshot credential,
-- never exposed to end users; it also has NO SELECT grant on these tables (write-only).
--
-- F FIX PATH (tracked in docs/backlog.md): the snapshot job sets `select set_config('app.reporting_org',
-- <org_id>, false)` at session start, and each write policy becomes
--   `with check (org_id = current_setting('app.reporting_org', true)::uuid)` — truly scoping the writer
-- to one org per run. Deferred because it changes + must redeploy the Python job (F/ops).
--
-- This migration only re-states the policy comments (unchanged predicate) documenting the above, so the
-- rationale lives next to the policy. No behavioral change. A4.

comment on policy ingredient_cost_lines_write_reporting_writer on reporting.ingredient_cost_lines is
  'Snapshot-writer bypass for FORCE RLS. A4 (2026-07): null/bogus org_id already blocked by NOT NULL + '
  'FK to shared.orgs; cross-org WRITE to a valid org is a residual risk mitigated by credential custody '
  '(write-only role, no SELECT). True per-run org scoping needs the job to set app.reporting_org (F).';

comment on policy bom_lines_write_reporting_writer on reporting.bom_lines is
  'Snapshot-writer bypass for FORCE RLS. A4 (2026-07): null/bogus org_id already blocked by NOT NULL + '
  'FK to shared.orgs; cross-org WRITE to a valid org is a residual risk mitigated by credential custody '
  '(write-only role, no SELECT). True per-run org scoping needs the job to set app.reporting_org (F).';

comment on policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily is
  'Snapshot-writer bypass for FORCE RLS. A4 (2026-07): null/bogus org_id already blocked by NOT NULL + '
  'FK to shared.orgs; cross-org WRITE to a valid org is a residual risk mitigated by credential custody '
  '(write-only role, no SELECT). True per-run org scoping needs the job to set app.reporting_org (F).';

-- DOWN: restore the prior (pre-A4) comments — cosmetic only, no policy change.
