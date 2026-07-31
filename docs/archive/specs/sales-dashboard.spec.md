# Spec - Sales dashboard (reporting read-model)

- Feature: a mobile-first sales dashboard over `reporting.sales_daily_revenue`, the first real
  reporting surface and the UI issue that births the reusable dashboard primitives.
- Status: draft for owner sign-off.
- Authority: `docs/specs/reporting-sales-snapshot.spec.md`, `docs/adr/0010-mos-platform-topology-hosting-operations.md`
  D5/A1, `docs/adr/0017-agent-native-user-composed-ui.md` D3/D11, `docs/platform-workstream-status.md`
  Current focus 2026-07-02, and `DESIGN.md`.
- Route proposal: `/mos/sales`.

## Overview

Finance/admin users need a fast sales control surface that answers: how much revenue is coming in, where
it comes from, whether the latest reported days are moving up or down, and which channel/branch/activity
is driving the change. The dashboard reads only the staging-proven `reporting.sales_daily_revenue`
snapshot; it never queries the warehouse directly and never writes financial data.

This issue also creates the first reusable dashboard primitives for the agent-native UI sequence:
`KPITile`, `ChartFrame`, a responsive sales chart, and a dense/mobile data table pattern. These are born
from the dashboard's real needs, not as a generic kit exercise.

## Out of scope

- Direct warehouse reads, Supabase writes, or new reporting tables.
- Customer-level, transaction-level, invoice-level, or GL-level drilldown.
- Agent/deputy querying over financial rows. This is a manual user dashboard only.
- Production Supabase deployment. The first target is staging.
- Metabase or external BI.

## Functional requirements

- **FR-001: Finance/admin route gate.** While a user is authenticated, when they navigate to the sales
  dashboard route, the system shall render the route only for users with `finance` or `admin` access
  role; other authenticated users shall be redirected home.
- **FR-002: RLS-backed reporting read.** When the dashboard loads, the system shall read
  `reporting.sales_daily_revenue` via the Supabase `reporting` schema client and rely on RLS as the
  security boundary.
- **FR-003: Snapshot freshness.** When reporting data is displayed, the system shall show the latest
  `snapshot_as_of` timestamp in the page header or KPI band.
- **FR-004: Reporting-day window.** When computing current-period metrics, the system shall use the
  latest available `revenue_date` in the returned rows as the reporting day, not the browser's local
  calendar date.
- **FR-005: KPI summary.** When data is available, the system shall show KPI tiles for trailing 7-day
  revenue, trailing 30-day revenue, latest reporting-day revenue, and channel mix.
- **FR-006: Comparison deltas.** When enough prior-period data exists, the system shall show deltas for
  trailing 7-day and 30-day revenue against the immediately preceding equal-length period; when prior
  data is absent, the system shall show a neutral "no comparison" state.
- **FR-007: Daily revenue chart.** When data is available, the system shall render a daily revenue chart
  grouped by channel with branch/activity filtering controls.
- **FR-008: Branch/activity cuts.** When a user switches the cut between Branch and Activity, the system
  shall keep the underlying reporting table source-faithful and apply any activity mapping in the
  dashboard layer only.
- **FR-009: Detail table.** When data is available, the system shall show a sortable detail table of
  revenue by branch/activity and channel for the selected window, including revenue, transaction count,
  share of total, and average revenue per transaction.
- **FR-010: Responsive layout.** While viewport width is below 768px, the system shall render the same
  metrics as a phone-first stacked view with compact KPI tiles, chart controls above the chart, and
  detail rows as scan-friendly cards; while viewport width is at least 768px, the system shall render a
  dense dashboard layout with KPI row, chart, and table.
- **FR-011: Empty state.** When the reporting query returns zero rows, the system shall render an empty
  state that names the reporting source and says no sales snapshot rows are available yet.
- **FR-012: Error state.** When the reporting query fails, the system shall render a non-secret error
  state with retry affordance and no raw connection details.
- **FR-013: Primitive extraction.** When implementing the dashboard, the system shall extract reusable
  primitives only where the dashboard proves the need: `KPITile`, `ChartFrame`, and a responsive
  `DataTable`/mobile-card pattern.

## Non-functional requirements

- **Security:** route visible only to `finance`/`admin`; RLS remains the hard boundary. No service-role
  key, DB password, or warehouse credential may enter the browser bundle.
- **Performance:** dashboard selectors over the 60-day window shall run client-side in under 50 ms on
  normal laptop hardware; the initial reporting query shall request only columns needed by the page.
- **Freshness:** every reporting-derived figure shall be visibly tied to `snapshot_as_of` per ADR-0017
  D11.
- **Design:** follow `DESIGN.md`: dense data-first layout, tabular numbers for all financial figures,
  restrained chart colors from existing tokens, one subtle rest shadow only on KPI/card surfaces.
- **Accessibility:** charts shall have text/table equivalents; controls shall be keyboard reachable and
  labelled.
- **Testing:** each AC id shall be covered at the lowest sufficient layer and named in the test title.

## Acceptance criteria

- **AC-001 (route/unit): Finance/admin can reach dashboard.** Given an authenticated user with `finance`
  or `admin`, when they navigate to `/mos/sales`, then the dashboard route renders.
- **AC-002 (route/unit): Member is redirected.** Given an authenticated user with only `member`, when
  they navigate to `/mos/sales`, then they are redirected to `/`.
- **AC-003 (data/unit): Reporting schema is used.** Given the dashboard data loader runs, when it queries
  Supabase, then it calls `supabase.schema('reporting').from('sales_daily_revenue')`.
- **AC-004 (selector/unit): Latest reporting date drives current metrics.** Given rows whose latest
  `revenue_date` is before today, when KPIs are computed, then latest-day revenue uses that max source
  date.
- **AC-005 (selector/unit): Deltas compare equal windows.** Given at least 60 days of rows, when 7-day
  and 30-day metrics are computed, then each delta compares against the immediately preceding equal
  window.
- **AC-006 (selector/unit): B2B/Roastery remains visible.** Given rows with `channel=B2B`,
  `esb_code=GRI`, and `branch_code=GRI`, when dashboard aggregates are computed, then the B2B/Roastery
  revenue appears in KPI, chart, and table totals.
- **AC-007 (render/unit): Snapshot freshness is shown.** Given rows with `snapshot_as_of`, when the page
  renders, then the user can see an "as of" timestamp.
- **AC-008 (render/unit): Empty state is explicit.** Given the reporting query returns an empty list,
  when the page renders, then it shows a no-snapshot-data state and no misleading zero-revenue KPI.
- **AC-009 (render/unit): Error state is non-secret.** Given the reporting query fails, when the page
  renders, then it shows a retryable error without DSN, token, SQL, or stack trace text.
- **AC-010 (visual/e2e): Mobile layout is usable.** Given the dashboard has sample reporting rows, when
  viewed at phone width, then KPI values, chart controls, and detail cards are visible without horizontal
  scrolling or text overlap.
- **AC-011 (visual/e2e): Desktop layout is dense and scannable.** Given the dashboard has sample
  reporting rows, when viewed at desktop width, then KPI row, chart, and table are visible above/near the
  fold and all numeric columns use tabular styling.

## Error handling

| Error condition | User-facing behavior |
|---|---|
| User lacks finance/admin | Redirect home; route is absent from role-aware nav. |
| Reporting query denied by RLS | Show access/empty-safe state; do not expose raw PostgREST payload. |
| Reporting query network failure | Show retryable error state. |
| No rows in reporting table | Show explicit no-snapshot-data empty state. |
| Prior comparison window missing | Show neutral delta state, not `0%` or `NaN`. |
| Unknown branch/activity mapping | Display source branch/channel and group under `Unmapped` only in Activity view. |

## Implementation TODO

### Data

- [ ] Add `mos-app/src/lib/db/sales-reporting.ts` using `supabase.schema('reporting')`.
- [ ] Add `mos-app/src/lib/db/sales-reporting.types.ts`.
- [ ] Add pure selectors in `mos-app/src/lib/sales-dashboard.ts` for KPIs, series, table rows, and
  activity mapping.
- [ ] Add selector tests covering AC-004, AC-005, AC-006, empty data, and missing prior windows.

### UI

- [ ] Add `/mos/sales` route behind `RequireAccessRole anyOf={['finance','admin']}`.
- [ ] Add a role-aware nav entry for finance/admin users.
- [ ] Add `SalesDashboardPage` plus page CSS following `DESIGN.md`.
- [ ] Extract `KPITile`, `ChartFrame`, and the responsive table/card primitive only as needed by this
  page.
- [ ] Render mobile and desktop states with Playwright screenshots before review.

### Testing

- [ ] Unit-test route authorization.
- [ ] Unit-test data loader schema usage with mocked Supabase client.
- [ ] Unit-test selector math with B2B/Roastery fixture rows.
- [ ] RTL-test loading, empty, error, and populated render states.
- [ ] Playwright-check mobile and desktop layout for no overlap/no horizontal scroll.

## Resolved owner decision (2026-07-02)

- **Activity mapping — v1 = 2 activities (owner, 2026-07-02).** The reporting table is grained by
  branch/channel, which cleanly backs only two activities; the dashboard-layer Activity lookup is:
  - **Cafe Ops** = `channel=POS` (branches: `GHQ` Gordi HQ · `SKC` Gordi Cikal · `GGS` Gordi Radiant ·
    `RRS` Rumah Rames — drillable).
  - **Roastery** = `channel=B2B` / `esb_code=GRI` (Gordi Roastery wholesale).
  - **Deferred:** **Kitchen-Bar** (a product *category* within cafe POS — not expressible at branch/channel
    grain; needs a later `sales_daily_by_category` reporting slice) and **Sales-CRM** (a function/pipeline,
    not a booked-revenue line in this table — clarify its revenue meaning before adding).
  - The data model does not change; Activity is a presentation-layer lookup. Branch stays the default
    source-faithful cut; Activity view groups POS branches under **Cafe Ops** and B2B under **Roastery**.
    Any future/unknown branch groups under `Unmapped` in Activity view (see Edge cases).
