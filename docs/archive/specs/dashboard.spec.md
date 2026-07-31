# Spec - Dashboard (analytical KPI hub + drill-down)

- Feature: the analytical KPI hub for the director (and finance/admin), replacing `/sales` with a broader
  `/dashboard` that covers all warehouse-backed KPIs and supports filter-in-place + navigate-to-detail
  drill-down. First slice ships on revenue + interim gross margin/COGS; grows sections as warehouse facts
  arrive.
- Status: draft for owner sign-off.
- Authority: `docs/decisions.md` OD-DASH-1..6 (LOCKED 2026-07-07 grill-with-docs session);
  `docs/specs/reporting-sales-snapshot.spec.md`, `docs/specs/reporting-sales-margin.spec.md`;
  `docs/adr/0010-mos-platform-topology-hosting-operations.md` D5; `docs/adr/0017-agent-native-user-composed-ui.md`
  D3/D11; `docs/adr/0019-ia-north-star.md` (clarified by OD-DASH-2); `CONTEXT.md` (COGS / Gross margin);
  signed-off mockup `docs/design-mockups/dashboard-B-tabs.html`; `DESIGN.md`.
- Route: `/mos/dashboard` (replaces `/mos/sales`); detail sub-view at `/mos/dashboard/detail`.

## Overview

The director needs a fast analytical surface that answers: how is the business performing, why did a
number move, and where is the change concentrated — across revenue and gross margin/COGS, sliced by
branch/channel/activity, over a chosen window. The dashboard reads only the curated `reporting`
read-models (`sales_daily_revenue`, `sales_margin_daily`) snapshot-fed from the OLAP warehouse; it never
queries the warehouse directly and never writes financial data.

This issue supersedes the sales-only dashboard (`docs/specs/sales-dashboard.spec.md`): the route renames
`/sales` → `/dashboard`, broadens scope beyond sales to all backed KPIs, and adds the two missing
capabilities that made the prior dashboard feel "fixed" rather than analytical — **filter-in-place
drill-down** and a **parameterized detail sub-view**.

The slice also fixes the data spine: verifies/repairs the staging snapshot, merges the `a3a2015`
COGS-fact repoint to main/staging, wires snapshot alerting, corrects stale onboarding docs, and unblocks
local development by running the existing snapshot job against the local warehouse + local Supabase.

## Out of scope

- Deputy/agent natural-language drill-down and raw-OLAP analyst escalation (ADR-0017 D3 two-tier handoff) —
  deferred to a follow-up (OD-DASH-4, pattern C).
- New warehouse facts (opex, material usage, portion/waste, labor cost, roastery yield) — these require
  upstream OLAP schema + ESB-sync work and are a separate workstream. They appear only as honest
  "What's coming" stubs.
- GL-certified monthly COGS read-model (`margin_monthly_certified`) — documented follow-up to the interim
  margin model.
- Save/share/save-as-default on custom views — BI-tool territory, the D4 guardrail slope.
- Metabase or external BI (OD-DASH-1; deferred behind the D4 trigger).
- Production Supabase deployment of the dashboard — staging is the first target.

## Functional requirements

### Route & access

- **FR-001: Route rename.** The system shall serve the analytical dashboard at `/mos/dashboard` and shall
  retire the `/mos/sales` route (redirect `/mos/sales` → `/mos/dashboard` for back-compat during the
  transition window).
- **FR-002: Finance/admin route gate.** While a user is authenticated, when they navigate to `/mos/dashboard`
  or `/mos/dashboard/detail`, the system shall render the route only for users with `finance` or `admin`
  access role; other authenticated users shall be redirected to `/`.
- **FR-003: RLS-backed reporting read.** When the dashboard loads, the system shall read
  `reporting.sales_daily_revenue` and `reporting.sales_margin_daily` via the Supabase `reporting` schema
  client and rely on RLS as the security boundary.

### Data freshness & reporting-day window

- **FR-004: Snapshot freshness.** When reporting data is displayed, the system shall show the latest
  `snapshot_as_of` timestamp in the page header (a `FreshnessLabel`).
- **FR-005: Reporting-day window.** When computing current-period metrics, the system shall use the latest
  available `revenue_date` in the returned rows as the reporting day, not the browser's local calendar date.

### KPI summary (revenue-led, gross margin/COGS secondary, basis-labelled)

- **FR-006: Revenue KPI tiles.** When data is available, the system shall show revenue KPI tiles for:
  trailing 7-day revenue (+WoW delta), trailing 30-day revenue (+MoM delta), latest reporting-day revenue,
  and average check (revenue ÷ transactions).
- **FR-007: Channel mix tile.** When data is available, the system shall show a channel-mix tile as a
  string ("POS 77% · B2B 23%"), not a chart.
- **FR-008: Gross margin tiles (basis-labelled).** When margin data is available, the system shall show
  interim gross margin tiles: interim gross margin % (7d/30d), interim gross margin amount (7d/30d), and
  interim COGS amount (7d/30d). Every gross margin and COGS figure shall carry a basis label
  ("interim — stock-movement") and a DQ badge reflecting `bom_coverage_pct`. The system shall never
  display a bare "margin" or "COGS" figure without a basis qualifier.
- **FR-009: Comparison deltas.** When enough prior-period data exists, the system shall show deltas for
  trailing 7-day (WoW) and 30-day (MoM) revenue and gross margin against the immediately preceding
  equal-length period; when prior data is absent, the system shall show a neutral "no comparison" state.
- **FR-010: "What's coming" strip.** The system shall render one strip listing the not-yet-backed KPIs
  (Opex, Material usage, Labor cost %, Roastery yield) as honest "needs warehouse data" stubs — never
  faked numbers.

### Cut, window, and tab controls (the global toolbar)

- **FR-011: Global toolbar.** The system shall render one global toolbar above the tabs containing: the
  cut toggle, the time-window selector, and the freshness label. Changes to the cut or window shall
  re-filter both the Summary tab and the Detail tab.
- **FR-012: Cut toggle.** The system shall provide a segmented cut control with three options: Branch
  (default on load), Channel, and Activity. Switching the cut shall re-aggregate the chart and detail
  table. The underlying reporting tables stay source-faithful; Activity is a presentation-layer lookup
  (per the 2026-07-02 owner decision: Cafe Ops = POS branches, Roastery = B2B/GRI).
- **FR-013: Time-window presets.** The system shall provide preset window buttons: 7d, 30d (default), 60d.
  Selecting a preset shall re-filter all KPIs, chart, and table to that trailing window.
- **FR-014: Custom date picker.** The system shall provide a custom date range picker bounded to the
  available 60-day snapshot window (dates outside the window shall be disabled). For a custom range, the
  comparison shall be the same-length immediately preceding window, computed automatically (no separate
  compare-range picker).
- **FR-015: Tab switch.** The system shall provide two tabs: Summary (KPI tiles + chart) and Detail
  (full table). The active tab shall persist in the URL as `?tab=summary|detail` so refresh/share keeps
  the tab.
- **FR-016: Filter-in-place (drill pattern A).** When a user clicks a revenue KPI tile, the system shall
  filter the chart and detail table to that tile's window/scope in-place on the same screen (Summary tab
  scrolls-to/focuses the chart; Detail tab filters its table). No page load.

### Chart & detail table

- **FR-017: Daily revenue chart.** When data is available, the system shall render a daily revenue chart
  grouped by channel (or by the selected cut) within the chosen window, with a mandatory accessible
  `<table>` fallback.
- **FR-018: Detail table (Summary tab).** The Summary tab shall show a condensed detail table below the
  chart reflecting the current filter (cut + window + tile-click).
- **FR-019: Detail table (Detail tab / `/dashboard/detail`).** The Detail tab shall show the full sortable
  detail table of revenue + gross margin/COGS by the selected cut for the chosen window, including
  revenue, transaction count, share of total, avg check, interim COGS, interim gross margin, and margin %.
  The Detail tab is the parameterized `/dashboard/detail?window=…&branch=…&channel=…&cut=…` route
  (drill pattern B).

### States & responsiveness

- **FR-020: Responsive layout.** While viewport width is below 768px, the system shall render a
  phone-first layout: stacked compact KPI tiles, the global toolbar as a sticky rail, tab switch (no
  cockpit-over-table scroll stacking), and detail rows as scan-friendly cards. While viewport width is at
  least 768px, the system shall render a dense dashboard layout.
- **FR-021: Empty state.** When the reporting query returns zero rows, the system shall render an empty
  state that names the reporting source and says no snapshot rows are available yet — no misleading
  zero-revenue KPI.
- **FR-022: Loading state.** While the reporting query is in flight, the system shall render skeleton KPI
  tiles and a skeleton chart/table.
- **FR-023: Error state.** When the reporting query fails, the system shall render a non-secret error
  state with retry affordance and no raw connection details.
- **FR-024: DQ/interim-basis state.** When BOM coverage is partial (`bom_coverage_pct` below threshold),
  the system shall render a data-quality badge on the gross margin/COGS tiles and a footnote clarifying
  "interim — stock-movement, not GL-certified."

## Non-functional requirements

- **Security:** route visible only to `finance`/`admin`; RLS remains the hard boundary. No service-role
  key, DB password, or warehouse credential may enter the browser bundle.
- **Performance:** dashboard selectors over the 60-day window shall run client-side in under 50 ms on
  normal laptop hardware; the initial reporting query shall request only columns needed by the page.
- **Freshness:** every reporting-derived figure shall be visibly tied to `snapshot_as_of` per ADR-0017 D11.
- **Design:** follow `DESIGN.md` (adopted from PMO) + the signed-off Variant B mockup. Every visual
  decision names a token. Ratify two semantic token reuses: `--basis-chip` (neutral badge variant for
  COGS-basis labels) and DQ-as-warning/success. Tabular numbers for all financial figures; one subtle
  rest shadow only on KPI/card surfaces.
- **Accessibility:** WCAG-AA. Charts have text/table equivalents; the cut toggle and tab strip are
  keyboard-reachable with arrow-key nav; the date picker is keyboard-operable; all controls labelled.
- **Testing:** each AC id is covered at the lowest sufficient layer and named in the test title (per
  AGENTS.md test-pyramid rule).

## Acceptance criteria

### Route & access

- **AC-001 (route/unit): `/sales` redirects to `/dashboard`.** Given the app is running, when a user
  navigates to `/mos/sales`, then they are redirected to `/mos/dashboard`.
- **AC-002 (route/unit): Finance/admin can reach dashboard.** Given an authenticated user with `finance`
  or `admin`, when they navigate to `/mos/dashboard`, then the dashboard renders.
- **AC-003 (route/unit): Member is redirected.** Given an authenticated user with only `member`, when
  they navigate to `/mos/dashboard`, then they are redirected to `/`.
- **AC-004 (data/unit): Reporting schema is used.** Given the dashboard data loader runs, when it queries
  Supabase, then it calls `supabase.schema('reporting')` for both `sales_daily_revenue` and
  `sales_margin_daily`.

### KPIs & basis-labelling

- **AC-005 (selector/unit): Revenue tiles compute from reporting-day window.** Given rows whose latest
  `revenue_date` is before today, when revenue KPIs are computed, then trailing 7d/30d/latest-day use the
  max source date as "today".
- **AC-006 (selector/unit): Deltas compare equal windows.** Given at least 60 days of rows, when 7-day
  (WoW) and 30-day (MoM) deltas are computed, then each compares against the immediately preceding equal
  window.
- **AC-007 (selector/unit): B2B/Roastery remains visible.** Given rows with `channel=B2B`,
  `esb_code=GRI`, when aggregates are computed, then B2B/Roastery revenue appears in KPI, chart, and table.
- **AC-008 (render/unit): Gross margin tiles carry basis label.** Given margin data is available, when
  the gross margin tiles render, then each shows the basis label "interim — stock-movement" and a DQ badge
  derived from `bom_coverage_pct`; no bare "margin" or "COGS" appears without a basis qualifier.
- **AC-009 (render/unit): Channel mix is a string.** Given data with POS and B2B channels, when the
  channel-mix tile renders, then it shows a string like "POS 77% · B2B 23%", not a chart.
- **AC-010 (render/unit): "What's coming" strip lists not-yet-backed KPIs.** When the dashboard renders,
  then a single strip lists Opex, Material usage, Labor cost %, Roastery yield as "needs warehouse data"
  stubs, and none show faked numbers.

### Cut, window, tabs

- **AC-011 (render/unit): Global toolbar above tabs.** When the dashboard renders, then the cut toggle,
  window selector, and freshness label appear in one toolbar above the Summary/Detail tabs; both tabs
  respond to changes in it.
- **AC-012 (selector/unit): Cut toggle re-aggregates.** Given rows for multiple branches and channels,
  when the user switches the cut between Branch/Channel/Activity, then the chart and detail table
  re-aggregate by the selected cut.
- **AC-013 (selector/unit): Window preset re-filters.** Given 60 days of rows, when the user selects
  7d/30d/60d, then KPIs, chart, and table re-filter to that trailing window.
- **AC-014 (selector/unit): Custom date picker bounded.** Given the snapshot window is 60 days, when the
  user opens the date picker, then dates outside the available window are disabled; when they pick a
  custom range, the comparison is the same-length prior window.
- **AC-015 (route/unit): Tab persists in URL.** Given the user is on the Detail tab, when they refresh,
  then the URL `?tab=detail` keeps them on the Detail tab.
- **AC-016 (render/unit): Filter-in-place on tile click.** Given the Summary tab is showing, when the
  user clicks the 7-day revenue tile, then the chart and detail table filter to the 7-day window in-place
  without a page load.

### Detail sub-view & chart

- **AC-017 (route/unit): Detail route is parameterized.** Given the user navigates to
  `/mos/dashboard/detail?window=7d&cut=branch`, then the full detail table renders for that window and cut.
- **AC-018 (render/unit): Detail table columns.** Given data is available, when the Detail tab renders,
  then it shows columns for the selected cut, revenue, transaction count, share of total, avg check,
  interim COGS, interim gross margin, and margin %.
- **AC-019 (render/unit): Chart has accessible fallback.** Given the daily revenue chart renders, then an
  accessible `<table>` equivalent is present for screen readers.

### States

- **AC-020 (render/unit): Freshness is shown.** Given rows with `snapshot_as_of`, when the page renders,
  then the user can see an "as of" timestamp.
- **AC-021 (render/unit): Empty state is explicit.** Given the reporting query returns an empty list,
  when the page renders, then it shows a no-snapshot-data state and no misleading zero-revenue KPI.
- **AC-022 (render/unit): Loading skeleton.** While the reporting query is in flight, when the page
  renders, then skeleton KPI tiles and skeleton chart/table appear (not blank, not spinners).
- **AC-023 (render/unit): Error state is non-secret.** Given the reporting query fails, when the page
  renders, then it shows a retryable error without DSN, token, SQL, or stack trace text.
- **AC-024 (render/unit): DQ badge on partial BOM coverage.** Given `bom_coverage_pct` is below
  threshold, when the gross margin tiles render, then a data-quality badge and an interim-basis footnote
  appear.

### Responsiveness (visual)

- **AC-025 (visual/e2e): Mobile layout is usable.** Given the dashboard has sample reporting rows, when
  viewed at phone width (390px), then KPI values, the sticky toolbar, tab switch, and detail cards are
  visible without horizontal scrolling or text overlap.
- **AC-026 (visual/e2e): Desktop layout is dense and scannable.** Given the dashboard has sample reporting
  rows, when viewed at desktop width (≥1280px), then KPI rows, chart, and table are visible above/near the
  fold and all numeric columns use tabular styling.

### Data spine (staging verify/fix + local unblock)

- **AC-027 (integration): Staging margin rows verified post-repoint.** Given the `a3a2015` COGS-fact
  repoint deployed to the VPS, when the snapshot runs, then `reporting.sales_margin_daily` on staging
  has rows with `max(snapshot_as_of)` within 24h and non-null `cogs_interim_sm` for POS days.
- **AC-028 (integration): `a3a2015` merged to main/staging.** Given the COGS-fact repoint commit, when
  `origin/main` and `origin/staging` are checked, then `reporting_snapshot.py` reads
  `fact_daily_cogs_interim` (not `v_daily_cogs_comparison`).
- **AC-029 (integration): Snapshot alerting wired.** Given the snapshot cron runs on the VPS, when it
  succeeds or fails, then a Telegram message is sent (mirrors the existing `resource-watch.sh` pattern).
- **AC-030 (integration): Local snapshot wrapper works.** Given the local warehouse (`gordi-esb-pg` on
  `:5432`) and local Supabase (`:44322`) are running, when `scripts/reporting-snapshot-local.sh` runs,
  then local `reporting.sales_daily_revenue` and `reporting.sales_margin_daily` are populated with real
  rows from the local warehouse.
- **AC-031 (doc): Stale onboarding docs corrected.** Given `AGENTS.md` and `CLAUDE.md`, when the
  `reporting` schema note is checked, then it no longer says "migration not yet written" (the migration
  shipped 2026-07-01).

## Error handling

| Error condition | User-facing behavior |
|---|---|
| User lacks finance/admin | Redirect to `/`; route absent from role-aware nav. |
| Reporting query denied by RLS | Show access/empty-safe state; do not expose raw PostgREST payload. |
| Reporting query network failure | Show retryable error state. |
| No rows in reporting table | Show explicit no-snapshot-data empty state. |
| Prior comparison window missing | Show neutral delta state, not `0%` or `NaN`. |
| Margin data NULL (sync-gap day) | Show margin tile as "interim unavailable" with basis footnote; never a fake 100% margin. |
| Custom date range outside window | Dates disabled in picker; if somehow submitted, clamp to available window. |
| Unknown branch/activity mapping | Display source branch/channel; group under `Unmapped` only in Activity view. |

## Implementation TODO

### Data spine (staging + local)

- [ ] SSH to VPS; verify `reporting.sales_margin_daily` row count + `max(snapshot_as_of)` on staging; record result.
- [ ] Merge `a3a2015` (COGS-fact repoint) to `main` + `staging`.
- [ ] Wire Telegram success/failure alerting into `scripts/reporting-snapshot-cron.sh` (mirror `resource-watch.sh`).
- [ ] Add `scripts/reporting-snapshot-local.sh` wrapper: sets `WAREHOUSE_DB_URL`, `SUPABASE_REPORTING_DB_URL`,
  `REPORTING_ORG_ID` for local targets; runs `python scripts/reporting_snapshot.py`.
- [ ] Correct `AGENTS.md` + `CLAUDE.md` stale "migration not yet written" lines.

### Data layer (app)

- [ ] Broaden `mos-app/src/lib/db/reporting.ts` (+ `reporting-margin.ts`) to support window/cut parameters
  (not just `sinceDays`).
- [ ] Add pure selectors in `mos-app/src/lib/sales-dashboard.ts` for the new KPI set (revenue tiles, gross
  margin tiles with basis, channel mix, custom-window compare, cut aggregation).
- [ ] Add selector tests covering AC-005..007, AC-012..014, AC-024, empty data, missing prior windows,
  NULL margin.

### UI

- [ ] Rename route `/mos/sales` → `/mos/dashboard`; add `/mos/sales` → `/mos/dashboard` redirect.
- [ ] Add `/mos/dashboard/detail` parameterized route.
- [ ] Add global toolbar component (cut toggle + window presets + custom picker + freshness).
- [ ] Add tab strip (Summary/Detail) with `?tab=` URL persistence.
- [ ] Rebuild `DashboardPage` per Variant B mockup (`docs/design-mockups/dashboard-B-tabs.html`).
- [ ] Extend `KPITile` to support an `onClick` (filter-in-place) and a basis-label/DQ-badge slot.
- [ ] Extend `DataTable` to support the gross-margin/COGS columns + the cut-aggregation rows.
- [ ] Render loading/empty/error/DQ states.
- [ ] Ratify `--basis-chip` + DQ-as-warning/success token roles in `DESIGN.md`.
- [ ] Update Home v1 finance-tile links `/sales` → `/dashboard`.

### Testing

- [ ] Unit-test route authorization (AC-001..003, AC-015, AC-017).
- [ ] Unit-test data loader schema usage with mocked Supabase client (AC-004).
- [ ] Unit-test selector math with B2B/Roastery + NULL-margin fixtures (AC-005..007, AC-012..014, AC-024).
- [ ] RTL-test loading, empty, error, DQ, populated render states (AC-008..011, AC-016, AC-018..024).
- [ ] Playwright-check mobile (390px) and desktop (≥1280px) layout for no overlap/no horizontal scroll
  (AC-025, AC-026).
- [ ] pgTAP / integration: verify staging margin rows (AC-027); local snapshot wrapper populates (AC-030).

## Resolved owner decisions (2026-07-07 grill)

- All decisions in `docs/decisions.md` OD-DASH-1..6 are binding on this spec.
- Activity mapping inherits the 2026-07-02 decision (Cafe Ops = POS branches, Roastery = B2B/GRI).
- Glossary terms COGS + Gross margin are canonized in `CONTEXT.md` (basis-aware; bare "margin" = _Avoid_).
