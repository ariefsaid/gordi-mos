# Spec - Home v1 (phone-first surface + shell regroup + i18n seam)

- Feature: the new Home surface at `/` (replacing My-Week-only route), the phone **bottom-tab bar shell**,
  the **five-destination model** (Home/Work/Operate/Plan/Inbox), and the **bilingual i18n catalog seam** (typed,
  hand-rolled).
- Status: backfilled from docs/plans/2026-07-04-home-v1-margin.md (plan-first slice, ADR-0019 D14 item 1) — the plan §7a amendment is authoritative where texts conflict.
- Authority: `docs/adr/0019-ia-north-star.md` (D2 Home/Destinations, D3 coded v1, D8 bottom tabs, D12 i18n, D14 sequencing),
  `docs/adr/0021-i18n-typed-hand-rolled-catalog.md` (the seam this slice lands), `docs/specs/reporting-sales-margin.spec.md`,
  `docs/specs/reporting-sales-snapshot.spec.md`, `CONTEXT.md`, and `DESIGN.md` tokens.
- Non-goal: the agent port (ADR-0018, separate slice), the `/sales` margin view (drill target only),
  retrofitting i18n across existing 50 surfaces (incremental per D12).

## 1. Overview

Home v1 launches the agent-native UI destination model: a phone-first shell that organizes the app
around five destinations (Home, Work, Operate, Plan, Inbox), each backed by live routes today (Home,
Tasks, Kitchen sub-routes) or held empty for future expansion. The Home page itself is a **slot-composed
surface** of KPI tiles + a My Week panel, displaying finance metrics (revenue, margin) gated by role,
ops and task counts for everyone, and a My Week panel extracted from the prior My-Week-only route.

The margin KPI is labeled **(interim)** per finance doctrine — the certified monthly GL margin is a
follow-up. The shell gains a mobile **bottom-tab bar** at ≤919.98px (3 live tabs: Home/Work/Operate)
and desktop **rail regrouping** of Kitchen under Operate, Tasks under Work. A new i18n seam (en/id
typed catalog) is wired into the shell + Home, seeding the bilingual commitment (ADR-0021).

## 2. Design decisions (behavior statements)

- **2.1 Slot composition.** Home renders KPI tiles (revenue + margin for finance/admin; tasks + ops for
  all) + My Week panel. Each slot = one read-model query + one kit primitive. Routing is owned by the
  page, not the primitive (tiles wrap in `<Link>` at the page layer).
- **2.2 Role-guarded fetch.** Home only fetches reporting rows when the viewer holds `finance`/`admin`
  (no query for members) → finance tiles absent, not blank/zero. RLS is the hard boundary. Per-role empty
  handling: member sees My Week + ops, never a blank page.
- **2.3 MyWeekPanel extract.** The existing `MyWeek` component's body (MyTasksCard + strips + TeamModule)
  is extracted into `<MyWeekPanel />` (no frame/head). The `MyWeek` page becomes a thin wrapper that
  keeps tests green; the router's index route swaps to `<HomePage/>` (which embeds `<MyWeekPanel/>`).
  The component export survives (reusable, no routing).
- **2.4 DESTINATIONS single source.** One `DESTINATIONS` object exports five slots (Home/Work/Operate/
  Plan/Inbox), each with id, label key, icon, and live links. A destination is **live** iff `links.length > 0`.
  Today: Home `/`, Work = `[Tasks]`, Operate = `[Kitchen log/plan/stock/review/pushes]`, Plan = `[]`,
  Inbox = `[]`.
- **2.5 Phone + desktop chrome.** Bottom-tab bar (phone, ≤919.98px): one tab per live destination, 3
  tabs visible, active = border-top + primary tint. Desktop rail (regrouped): live destination groups
  (Home label omitted as single-tile group, Operate/Kitchen/Kitchen-sub group, Work/Tasks group) + Admin
  below (manage, not a destination). The drawer stays (Admin, locale, secondary surfaces). Sales leaves
  primary nav (drill-only via Home KPI).
- **2.6 i18n = typed hand-rolled.** No library. One `messages.ts` catalog (`{ en, id }`), `I18nProvider`
  (locale in context, persisted to localStorage `'mos.locale'`, default `'en'`), `useT()` hook (`${n}`
  interpolation, key-fallback). Wired in `app.tsx` around router. New strings only (destinations, Home,
  KPI labels, locale toggle); existing strings untouched this slice.
- **2.7 Margin label clarity.** The Home margin tile shows **"Gross margin (interim)"** (en) / **"Margin kotor (interim)"** (id),
  sub-line shows `margin_interim_pct`, matching the finance doctrine that mid-month stock-movement is
  not GL-certified (plan §7a). The certified monthly margin is a follow-up read-model.

## 3. Functional requirements (EARS)

### Home page

- **FR-H01:** When a `finance` or `admin` viewer navigates to `/`, the system shall render the Home page
  with revenue and margin KPI tiles, each linking to `/sales` (drill target).
- **FR-H02:** When a `member`-only viewer navigates to `/`, the system shall render Home with tasks and
  ops tiles only; the finance row is not rendered (role-guarded fetch skipped) so the page is never blank.
- **FR-H03:** When Home renders, the system shall display the My Week panel (extracted from `<MyWeek />`).
- **FR-H04:** When the reporting fetch is in-flight, the system shall show finance tiles in `state="loading"`
  (skeleton); tasks/My-Week tiles render independently (no cascade blocking).
- **FR-H05:** When the reporting fetch errors, the system shall degrade that row (show an error state on
  affected tiles) while tasks/My-Week tiles render normally (no page-level crash).
- **FR-H06:** When Home renders, the system shall display a tasks tile linked to `/tasks`, showing the
  count of open tasks (Responsibility/Accountability, non-Done status).
- **FR-H07:** When a `finance` viewer with reporting rows renders Home, the system shall compute the
  trailing 7-day margin, display it with `formatIDRCompact` format + delta + `margin_interim_pct` sub,
  and label it **"Gross margin (interim)"** per finance doctrine.

### Shell + Destinations

- **FR-S01:** When the viewport width is ≤919.98px (phone), the system shall render a bottom-tab bar with
  one tab per **live** destination; when width ≥920px (desktop), the system shall render no bottom bar
  (rail only).
- **FR-S02:** When the tab bar renders at phone width, the system shall show exactly 3 tabs (Home, Work,
  Operate) and no Plan/Inbox tab (they are not live today).
- **FR-S03:** When a user navigates to a route (e.g., `/tasks`), the system shall highlight the owning
  destination's tab (Work) and update breadcrumbs to show destination label (`"Work › Tasks"`).
- **FR-S04:** When the desktop rail renders, the system shall group Kitchen routes under the "Operate"
  destination label, Tasks under "Work", and Home as a single-link group; `Admin` shall stay below as
  a role-gated entry (not a destination).
- **FR-S05:** When `DESTINATIONS` is filtered by `isLive(roles)`, the system shall include only
  destinations with ≥1 live link and a satisfied `anyOf` role gate; Plan/Inbox shall not render.

### i18n

- **FR-I01:** When the app starts, the system shall read `localStorage['mos.locale']` (default `'en'`),
  wrap the router in `I18nProvider`, and provide a `useT()` hook for all new strings.
- **FR-I02:** When a string key is missing from the current locale, the system shall fall back to `en`
  (and return the key itself if also missing in `en`).
- **FR-I03:** When a user toggles locale via `LocaleToggle`, the system shall persist the choice to
  localStorage, re-render with the new locale, and preserve app state (route, scroll, open panels).

## 4. Acceptance criteria

### Home (Vitest/RTL — `home-page.test.tsx`, `home-kpis.test.ts`)

- **AC-H01 (render/unit):** Given a `finance` viewer, when Home renders, then revenue and margin KPI
  tiles appear and each wraps a `<Link to="/sales">`.
- **AC-H02 (render/unit):** Given a `member`-only viewer, when Home renders, then no revenue/margin tiles
  are rendered (finance row absent) and the My Week panel + tasks tile render (never blank).
- **AC-H03 (render/unit):** Given any viewer, when Home renders, then the My Week panel (MyTasksCard) is
  present.
- **AC-H04 (render/unit):** Given the reporting fetch is loading, when Home renders, then finance tiles
  show `state="loading"` (skeleton) and tasks/My-Week tiles render independently.
- **AC-H05 (render/unit):** Given the reporting fetch errors, when Home renders, then the finance tiles
  degrade (no crash) and tasks/My-Week tiles still render.
- **AC-H06 (render/unit):** Given a tasks tile, when Home renders, then it links to `/tasks` and shows
  the open-task count (R/A, non-Done).
- **AC-H07 (render/unit):** Given a `finance` viewer with reporting rows, when margin is computed, then
  the margin tile shows `formatIDRCompact` margin + delta + `margin_interim_pct` sub, and the label is
  **"Gross margin (interim)"** per finance doctrine.

### Home KPI selectors (Vitest — `home-kpis.test.ts`)

- **AC-HK01 (selector):** Given margin rows with a latest date, when `trailingMargin(rows, latestDate, days)`
  runs, then it sums `gross_margin` over the trailing window and returns a prior window or null (clone of
  revenue `trailingWindow` pattern).
- **AC-HK02 (selector):** Given margin rows where revenue is 0, when `margin_interim_pct` is computed,
  then pct is null (not NaN or 0) and `formatDelta(window)` shows "no comparison".

### Shell — bottom-tab bar (Vitest/RTL — `bottom-tab-bar.test.tsx`)

- **AC-T01 (render/unit):** Given a phone viewport (≤919.98px), when the shell renders, then the bottom
  tab bar shows exactly 3 tabs (Home/Work/Operate) and no Plan/Inbox tab.
- **AC-T02 (render/unit):** Given the viewer is on `/tasks`, when the tab bar renders, then the Work tab
  is active (primary tint, border-top).
- **AC-T03 (render/unit):** Given a desktop viewport (≥920px), when the shell renders, then no bottom
  tab bar is rendered (rail only).

### Shell — destinations model (Vitest — `destinations.test.ts`)

- **AC-D01 (filter):** Given `DESTINATIONS` and a role list, when `isLive(dest, roles)` is called, then
  only destinations with ≥1 link and satisfied `anyOf` are live; Plan/Inbox are not live today.

### Shell — rail regroup (Vitest/RTL — `rail-nav.test.tsx`)

- **AC-RG01 (regroup):** Given the regrouped rail, when it renders, then Kitchen links appear under the
  "Operate" group label, Tasks under "Work", and Admin gated below (regroup verified).

### i18n (Vitest — `messages.test.ts`)

- **AC-I01 (catalog):** Given `messages.en` and `messages.id`, when key sets are compared, then they are
  identical (no missing keys).
- **AC-I02 (lookup):** Given `locale='id'`, when `t('dest.home')` is called, then it returns `'Beranda'`.
- **AC-I03 (fallback):** Given a missing key in a locale, when `t(key)` is called, then it returns the
  `en` value (or the key if also missing in `en`), never throws.

## 5. Data model integration

Home reads two reporting queries (role-gated, fetch skipped for non-finance):

- `listSalesDailyRevenue({ sinceDays: 60 })` — from `docs/specs/reporting-sales-snapshot.spec.md`.
- `listSalesMarginDaily({ sinceDays: 60 })` — from `docs/specs/reporting-sales-margin.spec.md`.

Tasks and ops are fetched from existing DALs (no schema change). KPI selectors in `home-kpis.ts`
compute trailing 7-day revenue and margin (clone of sales-dashboard patterns), latest-day figures,
and deltas.

## 6. Test layer ownership

| AC | Owning test | Layer |
|---|---|---|
| AC-H01–H07, AC-HK01–HK02 | `mos-app/src/pages/home-page.test.tsx` + `mos-app/src/lib/home-kpis.test.ts` | Vitest/RTL (Unit) |
| AC-T01–T03 | `mos-app/src/shell/bottom-tab-bar.test.tsx` | Vitest/RTL (Unit) |
| AC-D01 | `mos-app/src/shell/destinations.test.ts` | Vitest (Unit) |
| AC-RG01 | `mos-app/src/shell/rail-nav.test.tsx` | Vitest/RTL (Unit) |
| AC-I01–I03 | `mos-app/src/i18n/messages.test.ts` | Vitest (Unit) |
| (visual, curated e2e) | `mos-app/e2e/home-shell-mobile.spec.ts` | Playwright |

## 7. Edge cases + error handling

| Scenario | Behavior |
|---|---|
| User lacks `finance`/`admin` | Finance row absent; member never issues reporting query (role-guarded). RLS is hard boundary. |
| Reporting query denied by RLS | Degrade that row; do not expose raw PostgREST payload. |
| Reporting query network failure | Show retry-able error state on affected tiles. |
| No rows in reporting table | Finance tiles show "no data" state; tasks/My-Week render normally. |
| Prior comparison window missing | Show neutral delta state ("—" or "no comparison"), not `0%` or `NaN`. |
| Revenue is 0, COGS is NULL | `margin_interim_pct` is NULL (not 0/NaN); `formatDelta` treats as "no comparison". |
| Locale key missing | Fall back to `en` value; if also missing, return the key itself (never throw). |
| Drawer closed, bottom tabs active | Both chrome elements coexist; drawer is "more" surface, tabs are primary nav. |

## 8. Notes

- **My Week component survives.** The `<MyWeek />` page export stays, kept as a thin wrapper around
  `<MyWeekPanel />` so existing tests (`my-week.test.tsx`, `my-week.hidden.test.tsx`) remain green
  (ADR-0019 D2: "component survives").
- **Sales drill target.** Margin KPI drills to `/sales` (the finance surface). The sales dashboard does
  not yet display margin — the drill lands the user in the finance surface, acceptable per D2 "no dead-end."
  A follow-up issue should add a margin view/section to `/sales`.
- **i18n retrofit scope.** Only NEW strings (destinations, Home, KPI labels, locale toggle) are catalogued
  this slice. My Week panel strings are existing → English until a dedicated i18n-sweep issue (ADR-0019
  D12 / ADR-0021 record this as deliberate).
- **Ops KPI.** Shown when `SHOW_DAILY_LOG=true`; hidden when off (same as `OpsStrip`). Not blocking.
- **Brand/reference firewall.** No external/brand/AGPL references in any artifact (per de-reference
  firewall memo). Design tokens come from `DESIGN.md`, not external kits.
