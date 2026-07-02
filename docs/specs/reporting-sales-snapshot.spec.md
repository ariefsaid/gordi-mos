# Spec - Reporting sales snapshot (warehouse -> Supabase)

- Feature: the first `reporting` read-model for ESB sales revenue, copied from the Tencent VPS
  warehouse into Supabase staging as a bounded aggregate for the future sales dashboard.
- Status: approved scope, ready for implementation.
- Authority: `docs/decisions.md` OD-P4-2, `docs/adr/0010-mos-platform-topology-hosting-operations.md`
  D5/A1, `docs/adr/0017-agent-native-user-composed-ui.md` D3/D11, and
  `docs/reference/warehouse-online.md`.
- Non-goal: dashboard UI, activity taxonomy, customer/transaction grain, generic BI framework, direct
  read-through from MOS to the warehouse, production Supabase deployment.

## 1. Overview

MOS needs a finance/admin-readable sales read-model without putting the application in the live
warehouse path. This slice creates the additive `reporting` schema, exposes it through PostgREST, and
adds one table: daily sales revenue at source-faithful branch/channel/ESB grain.

The warehouse remains the source of truth. A VPS cron job runs after the 03:05 WIB ESB warehouse sync,
reads `public.v_daily_revenue_unified`, aggregates a trailing 60-day window, and upserts that window
into Supabase staging. The trailing window is required because ESB postings can land late; a
yesterday-only snapshot would silently preserve stale dashboard rows after warehouse corrections.

Every row carries `snapshot_as_of` for ADR-0017 D11 freshness display and `source_contract_version`
for the OD-P4-2 warehouse-to-reporting contract.

## 2. Requirements

### Functional

- FR-001: When the migration is applied, the system shall create schema `reporting` if it does not
  already exist.
- FR-002: When Supabase serves PostgREST, the system shall expose `reporting` in
  `supabase/config.toml [api].schemas`.
- FR-003: When the migration is applied, the system shall create `reporting.sales_daily_revenue` as a
  bounded aggregate table at grain `(org_id, revenue_date, channel, esb_code, branch_code)`.
- FR-004: When a user reads `reporting.sales_daily_revenue`, the system shall return rows only for
  `shared.current_org_id()`.
- FR-005: When a user lacks `finance` and `admin` in the JWT `access_roles` claim, the system shall
  return zero `reporting.sales_daily_revenue` rows.
- FR-006: When a user has `finance` or `admin` in the JWT `access_roles` claim, the system shall allow
  read access to same-org rows.
- FR-007: When an authenticated app user attempts to insert, update, or delete reporting rows, the
  system shall deny the write.
- FR-008: When the snapshot job runs, it shall target Supabase staging first, not production.
- FR-009: When the snapshot job runs, it shall read a trailing 60-day window from
  `public.v_daily_revenue_unified`.
- FR-010: When the snapshot job writes rows, it shall upsert by
  `(org_id, revenue_date, channel, esb_code, branch_code)` so repeated runs are idempotent.
- FR-011: When the source reports a missing branch code, the snapshot job shall normalize the key to
  `esb_code` before upsert so B2B/Roastery rows remain bounded and non-null.
- FR-012: When the snapshot job writes a run, all rows in that run shall carry one shared
  `snapshot_as_of` timestamp.
- FR-013: When the snapshot job writes rows, it shall preserve source-faithful dimensions only:
  `revenue_date`, `channel`, `esb_code`, `branch_code`, and `branch_name`.
- FR-014: When the dashboard later needs Cafe/Kitchen-Bar/Roastery/Sales-CRM labels, that activity
  mapping shall live outside this table.

### Non-functional

- NFR-001: The job shall not read `.env`, `~/.op-token`, or token-bearing local files; privileged
  credentials are supplied by the caller environment via `op run` or equivalent op-native injection.
- NFR-002: The table shall enable and force RLS.
- NFR-003: The table shall grant only schema usage and table select to `authenticated`; no
  authenticated write grant.
- NFR-004: The snapshot job shall use explicit environment variables for both database targets and
  fail fast when required variables are absent.
- NFR-005: The first implementation shall run against staging Supabase project
  `hvnwcsmkdeqmgqlbwflm`; production retargeting is a later owner-gated deploy step.
- NFR-006: The snapshot job shall not carry customer-level or transaction-level records into Supabase.

## 3. Data contract

`reporting.sales_daily_revenue` columns:

| Column | Type | Notes |
|---|---|---|
| `org_id` | uuid | Supabase tenant. |
| `revenue_date` | date | Source `v_daily_revenue_unified.revenue_date`. |
| `channel` | text | Source channel, expected `POS` or `B2B` but stored source-faithfully. |
| `esb_code` | text | ESB tenant/company code. |
| `branch_code` | text | Non-null branch key; missing source branch becomes `esb_code`. |
| `branch_name` | text | Nullable display name. |
| `transactions` | bigint | Sum of source transactions. |
| `clean_revenue` | numeric(14,2) | Sum of source `clean_revenue`. |
| `snapshot_as_of` | timestamptz | Shared timestamp for the snapshot run. |
| `source_contract_version` | text | Default `v_daily_revenue_unified.v1`. |
| `loaded_at` | timestamptz | Supabase load timestamp. |

Primary key: `(org_id, revenue_date, channel, esb_code, branch_code)`.

## 4. Snapshot job

The job runs on the Tencent VPS after `scripts/esb-sync-cron.sh` completes successfully. Required env:

- `WAREHOUSE_DB_URL`: warehouse Postgres DSN, resolved on the VPS.
- `SUPABASE_REPORTING_DB_URL`: staging Supabase Postgres DSN, resolved via op.
- `REPORTING_ORG_ID`: target MOS org id.

Optional env:

- `REPORTING_WINDOW_DAYS`: default `60`.
- `SOURCE_CONTRACT_VERSION`: default `v_daily_revenue_unified.v1`.

The query reads rows where `revenue_date >= current_date - (REPORTING_WINDOW_DAYS - 1)`, aggregates by
date/channel/ESB/branch, and upserts in one transaction. It does not delete rows outside the trailing
window. It may replace rows inside the window because late ESB postings are expected.

## 5. Acceptance criteria

- AC-001 (pgTAP): Given a migrated database, when schema tests run, then `reporting` exists and RLS is
  enabled/forced on `reporting.sales_daily_revenue`.
- AC-002 (pgTAP): Given a same-org user with `finance`, when they select from
  `reporting.sales_daily_revenue`, then same-org rows are visible.
- AC-003 (pgTAP): Given a same-org user with `admin`, when they select from
  `reporting.sales_daily_revenue`, then same-org rows are visible.
- AC-004 (pgTAP): Given a same-org user with only `member`, when they select from
  `reporting.sales_daily_revenue`, then zero rows are visible.
- AC-005 (pgTAP): Given a cross-org user with `finance`, when they select from
  `reporting.sales_daily_revenue`, then zero rows from the other org are visible.
- AC-006 (pgTAP): Given an authenticated finance user, when they insert, update, or delete reporting
  rows, then the write is denied.
- AC-007 (script unit): Given raw B2B warehouse rows with a missing branch code, when rows are
  normalized, then the upsert key uses `esb_code`.
- AC-008 (script unit): Given a snapshot run, when the upsert SQL is built, then it upserts by
  `(org_id, revenue_date, channel, esb_code, branch_code)` and updates mutable metrics/freshness.
- AC-009 (script unit): Given no `REPORTING_WINDOW_DAYS`, when config loads, then the trailing window
  is 60 days.
- AC-010 (script unit): Given missing required environment, when config loads, then the job fails before
  opening database connections.
- AC-011 (pgTAP): Given a B2B row normalized to an `esb_code` branch key (FR-011), when it is inserted
  into `reporting.sales_daily_revenue`, then the row is stored and readable with that branch key, non-null.

## 6. Open follow-up

The first dashboard can derive activity labels from branch/channel through a small lookup in the
dashboard layer. If the next issue needs that mapping ready, add it as a dashboard-side lookup/spec,
not as a column in `reporting.sales_daily_revenue`.
