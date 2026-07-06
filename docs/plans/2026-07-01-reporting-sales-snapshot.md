# Reporting Sales Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Add the first finance/admin `reporting` read-model and a staging-first VPS snapshot job that
upserts a 60-day trailing sales window from the ESB warehouse.

**Architecture:** Supabase owns the read-model contract (`reporting.sales_daily_revenue`) and RLS.
The VPS job owns cross-box data movement, reading `public.v_daily_revenue_unified` and writing only
branch/channel/ESB daily aggregates to staging Supabase. Dashboard activity labels stay out of this
table.

**Tech Stack:** Supabase Postgres migrations, pgTAP, Python 3 standard library plus `psycopg` for the
snapshot job, stdlib `unittest` for script tests.

## Global Constraints

- Work on `dev`.
- Never read `.env`, `~/.op-token`, or token-bearing local files; secrets are injected through op.
- Target staging Supabase first: project `hvnwcsmkdeqmgqlbwflm`.
- Snapshot a trailing 60-day window by default.
- Upsert grain is `(org_id, revenue_date, channel, esb_code, branch_code)`.
- RLS allows read only for same-org `finance` or `admin`; authenticated users get no write grant.

---

### Task 1: Supabase reporting schema and RLS

**Files:**
- Modify: `supabase/config.toml`
- Modify: `supabase/tests/00_schemas.sql`
- Modify: `supabase/tests/01_rls_enabled.sql`
- Create: `supabase/tests/60_reporting_sales_daily_rls.sql`
- Create: `supabase/migrations/20260701000001_reporting_sales_daily_revenue.sql`

**Interfaces:**
- Consumes: `shared.current_org_id()`, `shared.has_access_role(text)`.
- Produces: `reporting.sales_daily_revenue`.

- [ ] Write failing pgTAP assertions for schema presence, forced RLS, finance/admin read, member/cross-org
  denial, and authenticated write denial.
- [ ] Run the targeted pgTAP tests and verify they fail because `reporting` does not exist.
- [ ] Add the migration and expose `reporting` in `supabase/config.toml [api].schemas`.
- [ ] Re-run the targeted pgTAP tests and verify they pass.

### Task 2: Snapshot job configuration and row normalization

**Files:**
- Create: `scripts/reporting_snapshot.py`
- Create: `scripts/test_reporting_snapshot.py`

**Interfaces:**
- Produces: `SnapshotConfig.from_env(environ)`, `normalize_row(row, snapshot_as_of, org_id,
  source_contract_version)`, `build_upsert_sql()`.

- [ ] Write failing unittest coverage for required env validation, default 60-day window, branch-code
  normalization to `esb_code` for null-source B2B rows, and upsert conflict target.
- [ ] Run `python3 scripts/test_reporting_snapshot.py` and verify the tests fail because the script does
  not exist.
- [ ] Implement minimal configuration, normalization, SQL builder, and main job entrypoint.
- [ ] Re-run `python3 scripts/test_reporting_snapshot.py` and verify it passes.

### Task 3: Verification

**Files:**
- Verify: `docs/specs/reporting-sales-snapshot.spec.md`
- Verify: `docs/plans/2026-07-01-reporting-sales-snapshot.md`
- Verify: `supabase/*`
- Verify: `scripts/*reporting_snapshot*`

- [ ] Run the targeted pgTAP tests.
- [ ] Run the snapshot script unit tests.
- [ ] Run repo pre-merge checks if the local stack/dependencies allow it.
- [ ] Report any blocked verification explicitly.
