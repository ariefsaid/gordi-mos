# Spec - Reporting sales margin (warehouse -> Supabase)

- Feature: the `reporting.sales_margin_daily` read-model for interim gross-margin snapshots
  from the warehouse, feeding the Home KPI v1 and future margin dashboards.
- Status: backfilled from docs/plans/2026-07-04-home-v1-margin.md (plan-first slice, ADR-0019 D14 item 1) — the plan §7a amendment is authoritative where texts conflict.
- Authority: `docs/plans/2026-07-04-home-v1-margin.md` §7a (corrected data contract + doctrine),
  `docs/adr/0010-mos-platform-topology-hosting-operations.md` D5, `docs/adr/0018-port-pmo-native-agent-stack.md` D6,
  `docs/adr/0019-ia-north-star.md` D3/D14, `docs/reference/warehouse-online.md`, and the certified oracle
  `gordi-esb-bak` `COGS-REPORT-WORKFLOW.md`.
- Non-goal: monthly GL-certified margin (tracked as `margin_monthly_certified`, a follow-up),
  B2B COGS (POS only at daily grain), production Supabase deployment.

## 1. Overview

MOS Home displays daily POS gross-margin metrics to finance/admin users. This slice creates the
`reporting.sales_margin_daily` read-model, a separate table (not a column-add) cloned from the
`sales_daily_revenue` pattern, at grain `(org_id, margin_date, esb_code, branch_code)` — POS only,
no channel column (COGS has no channel dimension).

The warehouse view `v_daily_cogs_comparison` joins BOM-method COGS (`bom_total`, budget) with
stock-movement POS consumption (`sm_total`, interim/not-yet-reconciled). Per gordi-esb-bak finance
doctrine, BOM is a budget check and interim stock-movement is NOT certified — never a GL actual.
The table stores both, labels interim clearly to the dashboard, and carries a `bom_coverage_pct`
data-quality badge. The certified monthly GL margin is a follow-up issue.

The snapshot job runs on the Tencent VPS after ESB sync, reads a trailing 60-day window from
`v_daily_revenue_unified` (POS revenue) LEFT JOINed with `v_daily_cogs_comparison`, computes
derived fields (margin, margin %, null-safe), and upserts idempotently.

## 2. Functional requirements (EARS)

- **FR-M01:** When the migration is applied, the system shall create `reporting.sales_margin_daily` at
  grain `(org_id, margin_date, esb_code, branch_code)` with FORCE RLS enabled.
- **FR-M02:** When a user lacks `finance` or `admin` in the JWT `access_roles` claim, the system shall
  return zero rows from `reporting.sales_margin_daily`.
- **FR-M03:** When a `finance` or `admin` user reads, the system shall allow same-org rows only.
- **FR-M04:** When any authenticated app user attempts INSERT, UPDATE, or DELETE, the system shall deny
  the write.
- **FR-M05:** When the snapshot job (as `reporting_writer` role) writes, the system shall allow
  INSERT/UPDATE under FORCE RLS via a scoped FOR-ALL policy (single-org job, no end-user exposure).
- **FR-M06:** When the snapshot job runs, it shall read `v_daily_revenue_unified` (POS channel only)
  LEFT JOINed with `v_daily_cogs_comparison` for a trailing window (default 60 days), normalize and
  compute `margin_interim = revenue − cogs_interim_sm` and `margin_interim_pct = revenue > 0 ?
  margin_interim / revenue : NULL`, and upsert by the primary key.
- **FR-M07:** When the source reports a missing branch code, the snapshot job shall normalize the key
  to `esb_code` before upsert (clone of revenue normalization).

## 3. Data contract

`reporting.sales_margin_daily` columns (corrected per plan §7a):

| Column | Type | Notes |
|---|---|---|
| `org_id` | uuid | Supabase tenant; refs `shared.orgs(id) on delete cascade`. |
| `margin_date` | date | Same calendar day as `revenue_date` in `sales_daily_revenue`. |
| `esb_code` | text | ESB tenant/company code. |
| `branch_code` | text | Non-null branch key; missing source → `esb_code`. |
| `branch_name` | text | Nullable display name from revenue side. |
| `revenue` | numeric(14,2) | POS `clean_revenue` from `v_daily_revenue_unified` channel=POS. |
| `cogs_interim_sm` | numeric(14,2) | Stock-movement POS consumption (`sm_total`) — **INTERIM/not-GL-certified**. |
| `cogs_budget_bom` | numeric(14,2) | BOM/recipe COGS (`bom_total`) — **budget**, recipe-cost check only. |
| `margin_interim` | numeric(14,2) | `revenue − cogs_interim_sm` (may be negative or NULL if cogs is NULL). |
| `margin_interim_pct` | numeric(8,4) | `margin_interim / revenue`, NULL when revenue ≤ 0 (not 0/NaN). |
| `bom_coverage_pct` | numeric(8,4) | Data-quality badge from source; NULL if absent. |
| `snapshot_as_of` | timestamptz | Shared timestamp for the snapshot run. |
| `source_contract_version` | text | Default `pos_margin_interim.v1` (§7a corrected). |
| `loaded_at` | timestamptz | Supabase load timestamp. |

Primary key: `(org_id, margin_date, esb_code, branch_code)` — **no channel column** (POS-only).

Indexes (clone of revenue model): `(org_id, margin_date desc)`, `(org_id, esb_code, margin_date desc)`.

## 4. Snapshot job

The job runs on the Tencent VPS after `scripts/esb-sync-cron.sh` completes. Required env:

- `WAREHOUSE_DB_URL`: warehouse Postgres DSN, resolved on the VPS.
- `SUPABASE_REPORTING_DB_URL`: staging Supabase Postgres DSN, resolved via op.
- `REPORTING_ORG_ID`: target MOS org id.

Optional env:

- `REPORTING_WINDOW_DAYS`: default `60`.
- `SOURCE_MARGIN_CONTRACT_VERSION`: default `pos_margin_interim.v1`.

The source query reads rows where `r.channel = 'POS'` and `r.revenue_date >= %(since)s`, LEFT JOINs
to `v_daily_cogs_comparison` (joining on `cogs_date`, `esb_code`, and the branch-normalized key),
and aggregates by date/ESB/branch. NULL COGS days (sync gaps) yield NULL margin fields, never a fake
100% margin. The query is detailed in Plan §7a.

## 5. Acceptance criteria

**Margin RLS (pgTAP — `supabase/tests/61_reporting_sales_margin_rls.sql`):**

- **AC-M01 (pgTAP):** Given a migrated DB, when schema tests run, then `reporting.sales_margin_daily`
  exists with RLS enabled + forced and PK is `(org_id, margin_date, esb_code, branch_code)`.
- **AC-M02 (pgTAP):** Given a same-org `finance` user, when they SELECT, then same-org rows are visible.
- **AC-M03 (pgTAP):** Given a same-org `admin` user, when they SELECT, then same-org rows are visible.
- **AC-M04 (pgTAP):** Given a same-org `member`-only user, when they SELECT, then zero rows are visible.
- **AC-M05 (pgTAP):** Given a cross-org `finance` user, when they SELECT, then zero rows from the other
  org are visible.
- **AC-M06 (pgTAP):** Given an authenticated `finance` user, when they INSERT/UPDATE/DELETE, then the
  write is denied (error code 42501).
- **AC-M07 (pgTAP):** Given the `reporting_writer` role, when it INSERTs/UPDATEs under FORCE RLS, then
  it succeeds (the scoped FOR-ALL bypass works).

**Margin snapshot (python unit — `scripts/test_reporting_snapshot.py`):**

- **AC-SN01 (py unit):** Given missing required env, when config loads, then it fails before opening DB
  connections (clone of revenue AC-SN01).
- **AC-SN02 (py unit):** Given a B2B row with a missing branch code, when `normalize_margin_row` runs,
  then `branch_code` = `esb_code`.
- **AC-SN03 (py unit):** Given the margin source query, when built, then it reads from
  `v_daily_revenue_unified` (POS channel only) LEFT JOINed to `v_daily_cogs_comparison`, computes
  `gross_margin = revenue − cogs`, and `gross_margin_pct = CASE WHEN revenue > 0 THEN … ELSE NULL END`.
- **AC-SN04 (py unit):** Given the margin upsert SQL, when built, then it upserts by
  `(org_id, margin_date, esb_code, branch_code)` with conflict target and refreshes mutable metrics +
  freshness.
- **AC-SN05 (py unit):** Given the default config, when `source_contract_version` for margin is unset,
  then it is `pos_margin_interim.v1`.
- **AC-SN06 (py unit):** Given a day with POS revenue but NULL COGS (sync gap), when `normalize_margin_row`
  runs, then `margin_interim` and `margin_interim_pct` are both NULL (not fake 100%).

## 6. Test layer ownership

| AC | Owning test | Layer |
|---|---|---|
| AC-M01–M07 | `supabase/tests/61_reporting_sales_margin_rls.sql` | pgTAP (Integration) |
| AC-SN01–SN06 | `scripts/test_reporting_snapshot.py` | Python unit |

## 7. Notes

- **Finance doctrine.** Per `gordi-esb-bak` `COGS-REPORT-WORKFLOW.md`, ONE actual COGS is GL account 5
  (monthly, stock-movement reconciled to opname). BOM is budget; mid-month stock-movement is interim
  and must be labeled so. This table carries both; the dashboard labels interim. The certified monthly
  GL margin (`margin_monthly_certified`) is a follow-up issue.
- **B2B COGS.** COGS exists for POS only (both BOM and SM methods). B2B/Roastery has no daily COGS at
  this grain. If B2B COGS is added upstream, the table schema can add a channel column and replicate
  both revenue and margin columns per channel (out of scope for this slice).
- **Null safety.** When revenue is 0 or NULL, `margin_interim_pct` is NULL (not 0 or NaN). When COGS is
  NULL (e.g., sync gap), margin fields are NULL — no fake margin is computed.
