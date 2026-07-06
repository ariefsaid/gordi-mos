# Plan — Home v1 + `reporting.sales_margin_daily` (2026-07-04)

- Feature: the **My-Week-replacement Home surface** at `/` (ADR-0019 D2/D3 coded-v1) + the
  **`sales_margin_daily` reporting read-model** (ADR-0018 D6 prerequisite), the phone-first
  **bottom-tab shell** (ADR-0019 D8), and the **bilingual i18n seam** (ADR-0019 D12 / ADR-0021).
  This is the first slice of ADR-0019's sequencing (D14 item 1).
- Authority: `docs/adr/0019-ia-north-star.md` (D2 Home/Destinations, D3 coded v1, D8 bottom tabs,
  D12 i18n, D14 sequencing), `docs/adr/0018-port-pmo-native-agent-stack.md` D6 (the margin read-model
  must land before the agent port), `docs/adr/0010-…md` D5 (reporting read-model pattern),
  `docs/adr/0021-i18n-typed-hand-rolled-catalog.md` (the seam this slice lands), `CONTEXT.md`
  (Home, My Week, Activity, Revenue stream, Read-model), `DESIGN.md` tokens.
- Patterns cloned: `supabase/migrations/20260701000001_reporting_sales_daily_revenue.sql`,
  `supabase/migrations/20260704000001_reporting_writer_role_policy.sql`, `scripts/reporting_snapshot.py`,
  `mos-app/src/lib/db/reporting.ts`, `mos-app/src/lib/sales-dashboard.ts`,
  `mos-app/src/pages/sales-dashboard-page.tsx`, `mos-app/src/components/dashboard/*` (the 5 kit primitives).
- Do NOT touch: the agent port (ADR-0018 trains P1–P3). This slice ships the prerequisite read-model
  + the Home/destinations shell only.

## 0. Scope, non-goals, spec-gap note

**In scope (one slice):**
1. `reporting.sales_margin_daily` — migration (clone of `sales_daily_revenue` shape: org_id + PK +
   FORCE RLS + finance/admin SELECT policy + `reporting_writer` FOR-ALL bypass), snapshot extension in
   `scripts/reporting_snapshot.py` sourcing warehouse `v_daily_cogs_comparison`, pgTAP contract tests.
2. Home v1 at `/` — slot layout (each slot = one read-model/DAL query + one existing kit primitive),
   KPI row (revenue + margin finance/admin-gated via role-guarded fetch + RLS-empty handling; tasks +
   ops counts for everyone), My Week **panel** (extracted from the existing `MyWeek` page, demoted from
   route to panel — component survives), per-role empty handling (member → My Week + ops dominant,
   never blank), every KPI tile declares a drill target (revenue/margin → `/sales`, tasks → `/tasks`).
3. Shell regroup — phone **bottom-tab bar** (Home/Work/Operate/Plan/Inbox; render only destinations
   with a live route today: Home + Work/Tasks + Operate/Kitchen), desktop **rail** regrouped to the
   same five destination groups (Kitchen folds under Operate). All existing routes keep working.
4. i18n seam — typed hand-rolled catalog (en + id) wired into shell + Home slice; every **new** string
   through the catalog; ADR-0021 records the approach.
5. Test plan per pyramid: Vitest/RTL for Home slots + bottom-tab bar; pgTAP for margin RLS + writer
   bypass; python unit for the snapshot extension. AC-ids tagged in owning tests.

**Out of scope (explicit):**
- The agent port (registry/DSL/runtime — ADR-0018). No `user_views`, no deputy, no Inbox machinery.
- A `/sales` margin view (the margin **read-model** lands; the sales dashboard *showing* margin is a
  follow-up). Margin KPI drills to `/sales` (the finance surface) — acceptable per D2 "no dead-end."
- Retrofitting i18n across the existing 50 surfaces (ADR-0019 D12 names this the expensive path).
- Plan / Inbox destinations beyond "render only destinations that exist today" (no routes yet).
- Removing the mobile hamburger drawer (it stays for Admin / locale / secondary surfaces).

**Spec-gap note (for the Director — this plan does NOT write specs, per instructions):**
No `docs/specs/home-v1.spec.md` or `docs/specs/reporting-sales-margin.spec.md` exists. The binding
inputs are ADRs + the two existing specs (`sales-dashboard`, `reporting-sales-snapshot`) used as
**patterns to follow**. This plan embeds EARS-style FRs + Given/When/Then AC-ids so the build proceeds
against this plan; if the Director wants formal specs, `feature-forge`/`spec-miner` backfill them from
this plan's §6 before build (the plan is spec-shaped). **Primary open question:** confirm
`v_daily_cogs_comparison`'s exact columns against the live warehouse (Task 1.0) — the snapshot query is
written against an assumed shape; residual risk if the view differs.

## 1. Design decisions (brainstorm output)

### 1.1 The margin read-model is a *clone*, not a column-add
ADR-0018 D6 names `sales_margin_daily` as a distinct read-model (OD-AN-2 `margin_daily`). It is a
separate table, separately snapshotted (its own `source_contract_version =
v_daily_cogs_comparison.v1`), grain `(org_id, margin_date, channel, esb_code, branch_code)` — the same
key shape as `sales_daily_revenue` so Home can correlate revenue + margin by day. RLS is identical
(finance/admin SELECT, FORCE RLS). The `reporting_writer` bypass is a **new per-table FOR-ALL policy**
(mirroring the Sec-M1 migration) so the snapshot job can INSERT/UPDATE under FORCE RLS. Putting the
table + its writer policy in **one** migration is cleaner than the revenue model's split retrofit.

### 1.2 Margin math lives in the warehouse view, not the snapshot job
`gross_margin = revenue − cogs` and `gross_margin_pct = revenue > 0 ? margin/revenue : NULL` are
computed in the snapshot's source SELECT (SQL) so the read-model stores derived figures verbatim and the
dashboard never re-derives. `gross_margin_pct` is NULL (not 0/NaN) when revenue is 0/absent — the
dashboard's delta formatter already treats null as "no comparison" (clone of `formatDelta`).

### 1.3 Home = slot composition; each slot = (DAL query + kit primitive + drill target)
D3's "each slot = one read-model query + one kit primitive" is taken literally. Home renders a KPI row
of `KPITile`s (the existing primitive) + a `MyWeekPanel`. Crucially the **routing** is composition-owned,
not primitive-owned: each tile is wrapped in a `<Link>` in `HomePage` (KPITile stays presentation-only —
consistent with its "never knows revenue" philosophy; it must not learn router either). Per-role empty
handling is driven by a **role-guarded fetch**: Home only fetches reporting rows when the viewer holds
`finance`/`admin` (mirrors `RequireAccessRole`); a member never issues the reporting query, so the
revenue/margin tiles are simply not rendered → "My Week + ops dominant, never blank" with no role-check
branch in the tile layer. RLS remains the real boundary (a member who somehow called the DAL gets `[]`).

### 1.4 MyWeek → MyWeekPanel extract (component survives, route changes)
`MyWeek` currently renders `PageFrame + PageHead` then its body (MyTasksCard + WeeklyUpdateStrip +
OpsStrip + TeamModule). Extract the body into `mos-app/src/components/weekly/my-week-panel.tsx`
(`<MyWeekPanel />`, no frame/head). `MyWeek` becomes a 4-line wrapper (`PageFrame surfaceWash` +
`PageHead title="My Week"` + `<MyWeekPanel/>`) so `my-week.test.tsx` / `my-week.hidden.test.tsx` stay
green (they render `<MyWeek/>` directly). The router's index route swaps `<MyWeek/>` → `<HomePage/>`
(which renders `<PageFrame><PageHead title="Home"/><KpiRow/><MyWeekPanel/></PageFrame>`). The `MyWeek`
component export survives (ADR-0019 D2: "component survives") — it is no longer routed but still tested.

### 1.5 DESTINATIONS is the single source of truth for both chromes
A new `mos-app/src/shell/destinations.tsx` exports `DESTINATIONS`: the five slots (Home/Work/Operate/
Plan/Inbox), each `{ id, labelKey, Icon, links: Section[], anyOf? }`. "Render only destinations that
exist today" = a destination is **live** iff `links.length > 0` (Home is always live: `{ path: '/' }`).
Today: Home `/`, Work = `[Tasks]`, Operate = `[Kitchen log/plan/stock/review/pushes]`, Plan = `[]`,
Inbox = `[]`. The desktop `RailNav` renders live destination groups (replacing the Workspace/Kitchen
hardcode); the new `BottomTabBar` renders one tab per live destination (primary link = first Section).
`Admin` stays as a role-gated rail entry **below** the destination groups (manage surface, not a
destination — D2). `Sales` leaves primary nav (reached via Home KPI drill + ⌘K); `SALES_SECTIONS` stays
in `sections.tsx` for `sectionForPath` breadcrumb resolution. Breadcrumb titles for regrouped routes
resolve to the destination label.

### 1.6 i18n = typed hand-rolled catalog (ADR-0021)
No library. `mos-app/src/i18n/messages.ts` (`{ en, id }`, `MessageKey = keyof typeof en`), `I18nProvider`
(locale in context, persisted to `localStorage['mos.locale']`, default `'en'`), `useT()` (`(key, vars?)
=> string`, `${n}` interpolation, key-fallback). Wired in `app.tsx` inside `ThemeProvider`. New strings
(destination labels, Home title, KPI labels, locale toggle) → `t()`. Existing strings untouched.

### 1.7 Phone chrome: bottom tabs + keep the drawer
AppShell grid gains a `tabbar` row at narrow (`useIsNarrow()`, ≤919.98px): `'"topbar" "main" "tabbar"'`
with `--tabbar-h: 60px` (+ `env(safe-area-inset-bottom)`). The bottom bar renders 3 tabs today
(Home/Work/Operate). The hamburger drawer **stays** (Admin, locale toggle, secondary surfaces) — D8's
"bottom tab bar of the five destinations" is the *primary* phone nav; the drawer is the "more" surface.
Lowest churn, keeps AC-014 (drawer) green, keeps every route reachable on phone.

## 2. Architecture / files touched (map)

**New files:**
- `supabase/migrations/20260704000002_reporting_sales_margin_daily.sql` — table + RLS + writer bypass.
- `supabase/tests/61_reporting_sales_margin_rls.sql` — pgTAP (AC-M01…M07).
- `scripts/reporting_snapshot.py` — extended (margin functions) — *edited*, not new.
- `scripts/test_reporting_snapshot.py` — extended (AC-SN01…SN05) — *edited*.
- `mos-app/src/i18n/messages.ts`, `i18n/I18nProvider.tsx`, `i18n/use-t.ts`, `i18n/messages.test.ts`.
- `mos-app/src/lib/db/reporting-margin.ts` — `listSalesMarginDaily` + `SalesMarginDailyRow`.
- `mos-app/src/lib/home-kpis.ts` + `home-kpis.test.ts` — revenue + margin KPI selectors for Home.
- `mos-app/src/components/weekly/my-week-panel.tsx` — extracted body (MyWeek wraps it).
- `mos-app/src/pages/home-page.tsx` + `home-page.test.tsx` + `home-page.css`.
- `mos-app/src/shell/destinations.tsx` + `destinations.test.ts`.
- `mos-app/src/shell/bottom-tab-bar.tsx` + `bottom-tab-bar.css` + `bottom-tab-bar.test.tsx`.
- `mos-app/src/shell/locale-toggle.tsx` (+ test) — minimal `en|id` switch.

**Edited files:**
- `mos-app/src/app.tsx` — wrap router in `I18nProvider`.
- `mos-app/src/router.tsx` — index route `<MyWeek/>` → `<HomePage/>`.
- `mos-app/src/shell/sections.tsx` — `sectionForPath` resolves under destination labels; `SALES_SECTIONS`
  stays for breadcrumb, leaves primary nav.
- `mos-app/src/shell/rail-nav.tsx` — render `DESTINATIONS` live groups + Admin entry (regroup).
- `mos-app/src/shell/rail-nav.test.tsx`, `sections.test.ts` — rewritten to the destination model.
- `mos-app/src/shell/app-shell.tsx` — add `tabbar` grid row at narrow; render `<BottomTabBar/>`.
- `mos-app/src/shell/icons.tsx` — add Home/Inbox/Plan icons (Work reuses Tasks, Operate reuses Kitchen).
- `mos-app/src/index.css` — add `--tabbar-h` var (+ safe-area) + `.bottom-tab-bar` baseline (token-only).
- `mos-app/src/pages/my-week.tsx` — body → `<MyWeekPanel/>` (thin wrapper).

## 3. Data layer — `reporting.sales_margin_daily`

### 3.1 EARS requirements (data)
- **FR-M01:** When the migration is applied, the system shall create `reporting.sales_margin_daily` at
  grain `(org_id, margin_date, channel, esb_code, branch_code)` with FORCE RLS.
- **FR-M02:** When a user lacks `finance`/`admin`, the system shall return zero rows.
- **FR-M03:** When a `finance`/`admin` user reads, the system shall allow same-org rows only.
- **FR-M04:** When any `authenticated` user attempts INSERT/UPDATE/DELETE, the system shall deny it.
- **FR-M05:** When the snapshot job (as `reporting_writer`) writes, the system shall allow it under FORCE
  RLS via a scoped FOR-ALL policy (grain-narrowed at the app layer, single-org job).
- **FR-M06:** When the snapshot job runs, it shall read `v_daily_cogs_comparison` for a trailing
  `window_days` (default 60), compute `gross_margin = revenue − cogs` and
  `gross_margin_pct = revenue > 0 ? margin/revenue : NULL`, and upsert by the PK.
- **FR-M07:** When the source reports a missing branch code, the snapshot job shall normalize the key to
  `esb_code` (clone of revenue normalization).

### 3.2 `reporting.sales_margin_daily` column contract
| Column | Type | Notes |
|---|---|---|
| `org_id` | uuid | references `shared.orgs(id) on delete cascade` |
| `margin_date` | date | same calendar day as `revenue_date` in the sibling model |
| `channel` | text | `POS`/`B2B` source-faithful |
| `esb_code` | text | ESB tenant |
| `branch_code` | text | non-null; missing source → `esb_code` |
| `branch_name` | text | nullable |
| `revenue` | numeric(14,2) | from `v_daily_cogs_comparison` |
| `cogs` | numeric(14,2) | from `v_daily_cogs_comparison` |
| `gross_margin` | numeric(14,2) | `revenue − cogs` (may be negative) |
| `gross_margin_pct` | numeric(8,4) | `margin/revenue`, NULL when revenue ≤ 0 |
| `snapshot_as_of` | timestamptz | shared run timestamp |
| `source_contract_version` | text | default `v_daily_cogs_comparison.v1` |
| `loaded_at` | timestamptz | default `now()` |

PK: `(org_id, margin_date, channel, esb_code, branch_code)`. Indexes: `(org_id, margin_date desc)`,
`(org_id, channel, margin_date desc)` (clone of revenue).

## 4. Shell + Home design (UI)

### 4.1 DESTINATIONS model (`mos-app/src/shell/destinations.tsx`)
```ts
import type { Section } from './sections'
import { HomeIcon, TasksIcon, KitchenIcon, /* new */ PlanIcon, InboxIcon } from './icons'
// plus the existing KITCHEN_SECTIONS import

export type DestinationId = 'home' | 'work' | 'operate' | 'plan' | 'inbox'

export interface Destination {
  id: DestinationId
  labelKey: 'dest.home' | 'dest.work' | 'dest.operate' | 'dest.plan' | 'dest.inbox'
  Icon: React.FC
  /** live links under this destination; [] = destination not yet rolled in */
  links: Section[]
  /** optional access gate applied to ALL links (rail/bottom-bar hide when unsatisfied) */
  anyOf?: string[]
  /** primary route a bottom-tab taps (defaults to links[0].path) */
  primaryPath?: string
}

export const DESTINATIONS: Destination[] = [
  { id: 'home', labelKey: 'dest.home', Icon: HomeIcon, links: [{ path: '/', label: 'Home', Icon: HomeIcon }], primaryPath: '/' },
  { id: 'work', labelKey: 'dest.work', Icon: TasksIcon,
    links: [{ path: '/tasks', label: 'Tasks', Icon: TasksIcon }] },
  { id: 'operate', labelKey: 'dest.operate', Icon: KitchenIcon, links: KITCHEN_SECTIONS },
  { id: 'plan', labelKey: 'dest.plan', Icon: PlanIcon, links: [] },
  { id: 'inbox', labelKey: 'dest.inbox', Icon: InboxIcon, links: [] },
]

/** A destination renders (rail group / bottom tab) iff it has ≥1 live link. Home is always live. */
export function isLive(d: Destination, accessRoles: string[]): boolean {
  if (d.anyOf && !d.anyOf.some(r => accessRoles.includes(r))) return false
  return d.links.length > 0
}
```
`sectionForPath` is updated to return the **owning destination's** `labelKey` for breadcrumb (so
`/kitchen/log` breadcrumb reads "Operate › Log", `/tasks/123` reads "Work › Tasks").

### 4.2 Rail regroup (`rail-nav.tsx`)
`RailNav` maps over `DESTINATIONS`, skips non-live (via `isLive`), renders each live destination as a
group (`<div className="…group-label">{t(d.labelKey)}</div>` + its links via the existing `NavItem`).
`Admin` stays below as today (gated). `Sales` is **not** rendered (drill-only). `onNavigate` unchanged.

### 4.3 Bottom tab bar (`bottom-tab-bar.tsx`) — phone-first ≤380px
- Renders iff `useIsNarrow()`. Reads `DESTINATIONS.filter(isLive)`. One `<NavLink end>` per destination
  → `d.primaryPath ?? d.links[0].path`. Active = `primary` tint icon + 2px `border-top: 2px solid
  var(--primary)`; inactive = `muted-foreground`. Icon 22px + label 10px (DM Sans, `overline` token).
  `aria-label={t(d.labelKey)}`. Fixed `--tabbar-h` (60px) + `padding-bottom: env(safe-area-inset-bottom)`.
- At ≤380px: 3 tabs (Home/Work/Operate) each ≥ ~110px — fits with no overflow (verified by Playwright).

### 4.4 AppShell grid (`app-shell.tsx`)
```ts
gridTemplateRows: isNarrow ? 'var(--header-h) 1fr var(--tabbar-h)' : 'var(--header-h) 1fr',
gridTemplateAreas: isNarrow
  ? '"topbar" "main" "tabbar"'
  : '"topbar topbar" "rail main"',
// + render {isNarrow && <BottomTabBar/>} alongside the existing <MobileDrawer/>
```
`index.css`: `--tabbar-h: 60px;` (near `--header-h`). No content padding needed — the tabbar is a grid
row, so `main` scrolls above it (no overlay occlusion).

### 4.5 Home page (`home-page.tsx`) — slot composition
```
<PageFrame surfaceWash>
  <PageHead title={t('home.title')} subtitle={t('home.subtitle')} />
  <KpiRow>  {/* finance/admin-gated; absent entirely for members */}
    <Link to="/sales"><KPITile label={t('home.kpi.revenue')} value=… delta=…/></Link>
    <Link to="/sales"><KPITile label={t('home.kpi.margin')} value=… delta=… sub=…/></Link>
  </KpiRow>
  <KpiRow>  {/* everyone */}
    <Link to="/tasks"><KPITile label={t('home.kpi.tasks')} value={openCount}/></Link>
    {SHOW_DAILY_LOG && <Link to="/ops"><KPITile label={t('home.kpi.ops')} value=…/></Link>}
  </KpiRow>
  {snapshotAsOf && <FreshnessLabel asOf={snapshotAsOf} />}
  <MyWeekPanel />   {/* demoted from route */}
</PageFrame>
```
- Reporting fetch is **role-guarded**: `const canSeeFinance = accessRoles.includes('finance') ||
  accessRoles.includes('admin')`; only then `listSalesDailyRevenue({sinceDays:60})` +
  `listSalesMarginDaily({sinceDays:60})` run. Otherwise the finance `KpiRow` is not rendered (member
  sees only the tasks/ops row + My Week panel → never blank). RLS is still the boundary.
- `KpiRow` is a simple flex row (`.home-kpi-grid`: `repeat(auto-fit, minmax(160px,1fr))`), token-only.
- Tasks count: reuse `listTasks({})` + `raciOwner` filter + non-Done count (clone MyTasksCard's filter,
  extracted to `home-kpis.ts#openTaskCount(tasks, viewerId)`). Ops count: reuse `getTodayOpsSummary`
  (already in MyWeek) — pass through. Loading: `KPITile state="loading"`; error: scoped (one tile's
  error does not blank the page — degrade that tile, keep others).

### 4.6 i18n catalog (`mos-app/src/i18n/messages.ts`)
```ts
export const messages = {
  en: {
    'dest.home': 'Home', 'dest.work': 'Work', 'dest.operate': 'Operate',
    'dest.plan': 'Plan', 'dest.inbox': 'Inbox',
    'home.title': 'Home', 'home.subtitle': 'Your week at a glance',
    'home.kpi.revenue': 'Trailing 7-day revenue',
    'home.kpi.margin': 'Trailing 7-day gross margin',
    'home.kpi.tasks': 'My open tasks',
    'home.kpi.ops': "Today's log entries",
    'locale.toggle.label': 'Language', 'locale.en': 'English', 'locale.id': 'Bahasa Indonesia',
  },
  id: {
    'dest.home': 'Beranda', 'dest.work': 'Kerja', 'dest.operate': 'Operasi',
    'dest.plan': 'Rencana', 'dest.inbox': 'Kotak Masuk',
    'home.title': 'Beranda', 'home.subtitle': 'Minggu Anda sekilas',
    'home.kpi.revenue': 'Pendapatan 7 hari terakhir',
    'home.kpi.margin': 'Margin kotor 7 hari terakhir',
    'home.kpi.tasks': 'Tugas saya yang terbuka',
    'home.kpi.ops': 'Entri log hari ini',
    'locale.toggle.label': 'Bahasa', 'locale.en': 'English', 'locale.id': 'Bahasa Indonesia',
  },
} as const
export type MessageKey = keyof typeof messages.en
```
`I18nProvider`: `useState<'en'|'id'>(() => localStorage.getItem('mos.locale') === 'id' ? 'id' : 'en')`,
effect persists. `useT()` returns `(key, vars?) => messages[locale][key] ?? messages.en[key] ?? key`,
with `${name}` replace. `LocaleToggle`: a 2-button group (`en`/`id`) rendered in the rail + drawer
footer — minimal, proves the seam.

## 5. Acceptance criteria (Given/When/Then, tagged in owning tests)

**Margin RLS (pgTAP — `supabase/tests/61_reporting_sales_margin_rls.sql`):**
- **AC-M01:** Given a migrated DB, when schema tests run, then `reporting.sales_margin_daily` exists with
  RLS enabled + forced and PK `(org_id, margin_date, channel, esb_code, branch_code)`.
- **AC-M02:** Given a same-org `finance` user, when they SELECT, then same-org rows are visible.
- **AC-M03:** Given a same-org `admin` user, when they SELECT, then same-org rows are visible.
- **AC-M04:** Given a same-org `member`-only user, when they SELECT, then zero rows are visible.
- **AC-M05:** Given a cross-org `finance` user, when they SELECT, then zero org-A rows are visible.
- **AC-M06:** Given an authenticated `finance` user, when they INSERT/UPDATE/DELETE, then denied (`42501`).
- **AC-M07:** Given the `reporting_writer` role, when it INSERTs/UPDATEs under FORCE RLS, then it
  succeeds (the scoped FOR-ALL bypass works).

**Margin snapshot (python unit — `scripts/test_reporting_snapshot.py`):**
- **AC-SN01:** Given missing required env, when config loads, then it fails before opening DB connections
  (clone of AC-010; now shared by both snapshot paths).
- **AC-SN02:** Given a B2B row with a missing branch code, when `normalize_margin_row` runs, then
  `branch_code` = `esb_code`.
- **AC-SN03:** Given the margin source query, when built, then it computes
  `gross_margin = revenue − cogs` and `gross_margin_pct = CASE WHEN revenue > 0 THEN … ELSE NULL END`
  and reads from `v_daily_cogs_comparison`.
- **AC-SN04:** Given the margin upsert SQL, when built, then it `on conflict
  (org_id, margin_date, channel, esb_code, branch_code)` and refreshes mutable metrics + freshness.
- **AC-SN05:** Given the default config, when `source_contract_version` for margin is unset, then it is
  `v_daily_cogs_comparison.v1`.

**Home (Vitest/RTL — `home-page.test.tsx`, `home-kpis.test.ts`):**
- **AC-H01:** Given a `finance` viewer, when Home renders, then revenue + margin KPI tiles appear and
  each is a link to `/sales` (drill target declared).
- **AC-H02:** Given a `member`-only viewer, when Home renders, then no revenue/margin tile is rendered
  (RLS-empty handling: the finance fetch is skipped → tile absent, not a misleading zero) and the My
  Week panel + tasks tile render (never blank).
- **AC-H03:** Given any viewer, when Home renders, then the My Week panel (MyTasksCard) is present.
- **AC-H04:** Given the reporting fetch is loading, when Home renders, then the finance tiles show
  `state="loading"` (skeleton) and the tasks/My-Week tiles render independently.
- **AC-H05:** Given the reporting fetch errors, when Home renders, then the finance tiles degrade (no
  crash) and the tasks/My-Week tiles still render.
- **AC-H06:** Given a tasks tile, when Home renders, then it links to `/tasks` and shows the open-task
  count (R/A, non-Done).
- **AC-H07:** Given a `finance` viewer with reporting rows, when margin is computed, then the margin
  tile shows `formatIDRCompact` margin + a delta + `gross_margin_pct` sub.
- **AC-HK01 (selector):** Given margin rows with a latest date, when `trailingMargin` runs, then it sums
  `gross_margin` over the trailing window and returns a prior window or null (clone of `trailingWindow`).
- **AC-HK02 (selector):** Given margin rows where revenue is 0, when pct is computed, then pct is null
  (not NaN) and `formatDelta` shows "no comparison".

**Shell (Vitest/RTL — `bottom-tab-bar.test.tsx`, `destinations.test.ts`, `rail-nav.test.tsx`):**
- **AC-T01:** Given a phone viewport, when the shell renders, then the bottom tab bar shows one tab per
  **live** destination (Home, Work, Operate) and no Plan/Inbox tab.
- **AC-T02:** Given the viewer is on `/tasks`, when the tab bar renders, then the Work tab is active.
- **AC-T03:** Given a desktop viewport, when the shell renders, then no bottom tab bar renders (rail only).
- **AC-D01:** Given `DESTINATIONS`, when filtered by `isLive(roles)`, then only destinations with ≥1 link
  (and a satisfied `anyOf`) are live; Plan/Inbox are not live today.
- **AC-RG01 (rail):** Given the regrouped rail, when it renders, then Kitchen links appear under the
  "Operate" group label and Tasks under "Work" (regroup verified).

**i18n (Vitest — `messages.test.ts`):**
- **AC-I01:** Given `messages.en` and `messages.id`, when key sets are compared, then they are identical.
- **AC-I02:** Given `locale='id'`, when `t('dest.home')` is called, then it returns `'Beranda'`.
- **AC-I03:** Given a missing key in a locale, when `t(key)` is called, then it returns the `en` value
  (or the key if also missing in `en`), never throws.

## 6. Tasks (2–5 min each, exact paths + real code + verify)

> TDD-first: every behavior task writes the failing test **first** (named in the task), watches it fail,
> then implements. Verify command per task. All commands run from repo root unless noted (`mos-app/`
> commands inside `mos-app`).

### Phase 0 — pre-build verification

**Task 0.1 — Confirm `v_daily_cogs_comparison` columns (unblocks Task 1.3).**
- Command (read-only, against the live Tencent VPS warehouse):
  ```bash
  ssh arief@43.153.213.28 "docker exec gordi-esb-pg psql -U gordi -d gordi_esb -c '\d v_daily_cogs_comparison'"
  ```
- Confirm columns include `revenue_date, channel, esb_code, branch_code, branch_name, clean_revenue
  (or revenue), cogs`. If names differ, adjust Task 1.3's `build_margin_source_query()` column list and
  Task 1.1's `revenue`/`cogs` casts; record the real names in this plan's §3.2 margin.
- **Residual risk if the view is absent/different:** the margin snapshot cannot ship; escalate to the
  Director (the task brief says "daily COGS confirmed available" — verify before building on it).

### Phase 1 — margin read-model + snapshot

**Task 1.1 — pgTAP test (red) `supabase/tests/61_reporting_sales_margin_rls.sql`.**
Clone `60_reporting_sales_daily_rls.sql` structure; seed `reporting.sales_margin_daily` rows (same
org-A/B pattern) with the margin columns; assert AC-M01…M07. For AC-M07 add:
```sql
-- AC-M07: reporting_writer can write under FORCE RLS.
set local role reporting_writer;
set local request.jwt.claims = '{"org_id":"00000000-0000-0000-0000-0000000000a1"}';
select lives_ok($$
  insert into reporting.sales_margin_daily
    (org_id, margin_date, channel, esb_code, branch_code, revenue, cogs, gross_margin,
     gross_margin_pct, snapshot_as_of)
  values ('00000000-0000-0000-0000-0000000000a1','2026-07-02','POS','GKI','BGR',
          1000000,600000,400000,0.4000, now())
  on conflict do nothing
$$, 'AC-M07: reporting_writer insert ok under FORCE RLS');
reset role;
```
- Verify (red): `supabase db reset && supabase test db -- 61_reporting_sales_margin_rls` → fails (table
  absent). *(If `supabase` CLI is local, use `npx supabase`.)*

**Task 1.2 — Migration (green) `supabase/migrations/20260704000002_reporting_sales_margin_daily.sql`.**
```sql
-- reporting.sales_margin_daily read-model (ADR-0018 D6 prereq / ADR-0010 D5 / ADR-0019 D3).
-- Clone of reporting.sales_daily_revenue shape; finance/admin RLS; reporting_writer FOR-ALL bypass.
create table reporting.sales_margin_daily (
  org_id                  uuid not null references shared.orgs(id) on delete cascade,
  margin_date             date not null,
  channel                 text not null check (btrim(channel) <> ''),
  esb_code                text not null check (btrim(esb_code) <> ''),
  branch_code             text not null check (btrim(branch_code) <> ''),
  branch_name             text,
  revenue                 numeric(14,2) not null default 0,
  cogs                    numeric(14,2) not null default 0,
  gross_margin            numeric(14,2) not null default 0,
  gross_margin_pct        numeric(8,4),
  snapshot_as_of          timestamptz not null,
  source_contract_version text not null default 'v_daily_cogs_comparison.v1',
  loaded_at               timestamptz not null default now(),
  primary key (org_id, margin_date, channel, esb_code, branch_code)
);
comment on table reporting.sales_margin_daily is
  'Daily gross-margin snapshot from warehouse view public.v_daily_cogs_comparison. Grain: org/date/channel/ESB/branch.';
comment on column reporting.sales_margin_daily.gross_margin_pct is
  'gross_margin/revenue; NULL when revenue <= 0 (not 0/NaN).';

create index sales_margin_daily_org_date_idx
  on reporting.sales_margin_daily (org_id, margin_date desc);
create index sales_margin_daily_org_channel_idx
  on reporting.sales_margin_daily (org_id, channel, margin_date desc);

grant select on reporting.sales_margin_daily to authenticated;
grant select, insert, update, delete on reporting.sales_margin_daily to service_role;

alter table reporting.sales_margin_daily enable row level security;
alter table reporting.sales_margin_daily force row level security;

create policy sales_margin_daily_select_finance_admin
  on reporting.sales_margin_daily
  for select to authenticated
  using (org_id = shared.current_org_id()
         and (shared.has_access_role('finance') or shared.has_access_role('admin')));

-- Sec-M1 mirror: scoped writer bypass for FORCE RLS (single-org snapshot job; no end-user exposure).
grant usage on schema reporting to reporting_writer;
grant select, insert, update on reporting.sales_margin_daily to reporting_writer;
create policy sales_margin_daily_write_reporting_writer
  on reporting.sales_margin_daily for all to reporting_writer
  using (true) with check (true);

-- DOWN: drop policy sales_margin_daily_write_reporting_writer on reporting.sales_margin_daily;
--       drop policy sales_margin_daily_select_finance_admin on reporting.sales_margin_daily;
--       revoke select, insert, update on reporting.sales_margin_daily from reporting_writer;
--       revoke usage on schema reporting from reporting_writer;
--       drop table reporting.sales_margin_daily cascade;
```
- Verify (green): `supabase db reset && supabase test db -- 61_reporting_sales_margin_rls` → all pass.

**Task 1.3 — Extend `scripts/reporting_snapshot.py` (margin functions).** Add after the revenue block:
```python
DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION = "v_daily_cogs_comparison.v1"


def normalize_margin_row(row, *, snapshot_as_of, org_id, source_contract_version):
    esb_code = _required_text(row.get("esb_code"), "esb_code")
    branch_code = _clean_text(row.get("branch_code")) or esb_code
    revenue = float(row.get("revenue") or 0)
    cogs = float(row.get("cogs") or 0)
    gross_margin = round(revenue - cogs, 2)
    gross_margin_pct = round((gross_margin / revenue), 4) if revenue > 0 else None
    return {
        "org_id": org_id,
        "margin_date": row["margin_date"],
        "channel": _required_text(row.get("channel"), "channel"),
        "esb_code": esb_code,
        "branch_code": branch_code,
        "branch_name": _clean_text(row.get("branch_name")),
        "revenue": revenue,
        "cogs": cogs,
        "gross_margin": gross_margin,
        "gross_margin_pct": gross_margin_pct,
        "snapshot_as_of": snapshot_as_of,
        "source_contract_version": source_contract_version,
    }


def build_margin_source_query():
    return """
      with normalized as (
        select
          margin_date,
          channel,
          esb_code::text as esb_code,
          coalesce(nullif(btrim(coalesce(branch_code, '')), ''), esb_code::text) as branch_code,
          nullif(btrim(coalesce(branch_name, '')), '') as branch_name,
          revenue,
          cogs
        from (
          select
            revenue_date as margin_date,
            channel,
            esb_code,
            branch_code,
            branch_name,
            clean_revenue as revenue,
            cogs
          from public.v_daily_cogs_comparison
          where revenue_date >= current_date - ((%s::int - 1) * interval '1 day')
        ) src
      )
      select margin_date, channel, esb_code, branch_code, branch_name,
             sum(revenue)::numeric(14,2) as revenue,
             sum(cogs)::numeric(14,2) as cogs
      from normalized
      group by margin_date, channel, esb_code, branch_code, branch_name
      order by margin_date, channel, esb_code, branch_code
    """


def build_margin_upsert_sql():
    return """
        insert into reporting.sales_margin_daily (
          org_id, margin_date, channel, esb_code, branch_code, branch_name,
          revenue, cogs, gross_margin, gross_margin_pct, snapshot_as_of, source_contract_version
        ) values (
          %(org_id)s, %(margin_date)s, %(channel)s, %(esb_code)s, %(branch_code)s,
          %(branch_name)s, %(revenue)s, %(cogs)s, %(gross_margin)s, %(gross_margin_pct)s,
          %(snapshot_as_of)s, %(source_contract_version)s
        )
        on conflict (org_id, margin_date, channel, esb_code, branch_code)
        do update set
          branch_name = excluded.branch_name,
          revenue = excluded.revenue,
          cogs = excluded.cogs,
          gross_margin = excluded.gross_margin,
          gross_margin_pct = excluded.gross_margin_pct,
          snapshot_as_of = excluded.snapshot_as_of,
          source_contract_version = excluded.source_contract_version,
          loaded_at = now()
    """


def run_margin_snapshot(config, snapshot_as_of):
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise SystemExit("Missing dependency: install psycopg on the VPS snapshot environment") from exc
    with psycopg.connect(config.warehouse_db_url, row_factory=dict_row) as wc:
        with wc.cursor() as cur:
            cur.execute(build_margin_source_query(), (config.window_days,))
            rows = cur.fetchall()
    norm = [normalize_margin_row(r, snapshot_as_of=snapshot_as_of, org_id=config.org_id,
                                  source_contract_version=config.margin_source_contract_version)
            for r in rows]
    with psycopg.connect(config.supabase_reporting_db_url) as rc:
        with rc.cursor() as cur:
            cur.executemany(build_margin_upsert_sql(), norm)
        rc.commit()
    return len(norm)
```
Extend `SnapshotConfig`: add `margin_source_contract_version: str = DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION`
(default); `from_env` reads `SOURCE_MARGIN_CONTRACT_VERSION` env (optional). Change `run_snapshot` to
return `(revenue_rows, snapshot_as_of)` OR keep it revenue-only and add `run_all_snapshots(config)`
that runs both with one shared `snapshot_as_of` and returns a summary dict. **Choose:** add
`run_all_snapshots(config) -> {'revenue': n, 'margin': m}`; keep `run_snapshot` for backward compat.
- Verify: `python scripts/reporting_snapshot.py --help` is N/A (no argparse); instead:
  `cd scripts && python -c "from reporting_snapshot import run_all_snapshots, build_margin_source_query, build_margin_upsert_sql; print(build_margin_upsert_sql()[:40])"` → prints the margin upsert head.

**Task 1.4 — Extend `scripts/reporting_snapshot.py` `main()` to run both.**
Replace the `main` body:
```python
def run_all_snapshots(config):
    snapshot_as_of = datetime.now(timezone.utc)
    revenue = run_snapshot(config, _as_of=...)  # see note
    margin = run_margin_snapshot(config, snapshot_as_of)
    return {"revenue": revenue, "margin": margin}
```
**Note:** `run_snapshot` currently computes its own `snapshot_as_of`. To share one timestamp, refactor
`run_snapshot` to accept an optional `snapshot_as_of` param (default `now()`); `run_all_snapshots` passes
one shared value. Update `main()`:
```python
def main():
    config = SnapshotConfig.from_env(os.environ)
    counts = run_all_snapshots(config)
    print(f"reporting_snapshot END revenue={counts['revenue']} margin={counts['margin']} "
          f"window_days={config.window_days}")
    return 0
```
- Verify: `cd scripts && python -m pytest test_reporting_snapshot.py -q` (after Task 1.5).

**Task 1.5 — Extend `scripts/test_reporting_snapshot.py` (AC-SN01…05).** Add a `MarginSnapshotTests`
class mirroring `ReportingSnapshotTests`:
```python
from reporting_snapshot import (
    DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION, normalize_margin_row,
    build_margin_source_query, build_margin_upsert_sql,
)
# AC-SN02: missing branch → esb_code
row = {"margin_date":"2026-07-01","channel":"B2B","esb_code":"GRI","branch_code":None,
       "branch_name":"Gordi Roastery","revenue":"3000000","cogs":"1800000"}
self.assertEqual(normalize_margin_row(row, snapshot_as_of="2026-07-01T04:00:00+07:00",
    org_id="…a1", source_contract_version=DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION)["branch_code"], "GRI")
# AC-SN03: query computes margin + pct + reads the right view
q = " ".join(build_margin_source_query().split())
self.assertIn("from public.v_daily_cogs_comparison", q)
# AC-SN04: upsert conflict target + metric refresh
u = build_margin_upsert_sql()
self.assertIn("on conflict (org_id, margin_date, channel, esb_code, branch_code)", u)
self.assertIn("gross_margin = excluded.gross_margin", u)
# AC-SN05: default contract version
self.assertEqual(DEFAULT_MARGIN_SOURCE_CONTRACT_VERSION, "v_daily_cogs_comparison.v1")
```
Also assert `normalize_margin_row` with `revenue=0` yields `gross_margin_pct is None` (AC-HK02 data
side). Add `gross_margin` math assert (`3000000-1800000 == 1200000`).
- Verify: `cd scripts && python -m pytest test_reporting_snapshot.py -q` → green.

**Task 1.6 — Update `scripts/reporting-snapshot-cron.sh` to run both.** In the embedded python, replace
`rows = run_snapshot(config)` / its print with:
```python
from reporting_snapshot import run_all_snapshots
counts = run_all_snapshots(config)
print(f"reporting_snapshot END revenue={counts['revenue']} margin={counts['margin']} "
      f"window_days={config.window_days}")
```
- Verify: read-only dry syntax check `bash -n scripts/reporting-snapshot-cron.sh` → exit 0. (Live run is
  owner-gated on the VPS — not in this slice's CI.)

**Task 1.7 — DAL `mos-app/src/lib/db/reporting-margin.ts`** (clone of `reporting.ts`):
```ts
import { supabase } from '@/lib/supabase'
const reporting = () => supabase.schema('reporting')
export interface SalesMarginDailyRow {
  margin_date: string; channel: string; esb_code: string; branch_code: string
  branch_name: string | null; revenue: number; cogs: number; gross_margin: number
  gross_margin_pct: number | null; snapshot_as_of: string; source_contract_version: string
}
const SELECT = 'margin_date,channel,esb_code,branch_code,branch_name,revenue,cogs,gross_margin,gross_margin_pct,snapshot_as_of,source_contract_version'
export async function listSalesMarginDaily(f: { sinceDays?: number } = {}): Promise<SalesMarginDailyRow[]> {
  let q = reporting().from('sales_margin_daily').select(SELECT)
  if (f.sinceDays !== undefined) q = q.gte('margin_date', daysAgoIso(f.sinceDays))
  q = q.order('margin_date', { ascending: true })
  const { data, error } = await q
  if (error) throw new Error(`listSalesMarginDaily failed — ${error.message}`)
  return (data ?? []) as unknown as SalesMarginDailyRow[]
}
// (daysAgoIso + latestSnapshotAsOf helpers cloned/inline — see Task 1.8)
```
*(Reuse `daysAgoIsoDate` — export it from `reporting.ts` if not already, or duplicate the 4-line helper.)*
- Verify: `cd mos-app && npm run typecheck`.

### Phase 2 — i18n seam

**Task 2.1 — `mos-app/src/i18n/messages.ts`** (the §4.6 catalog) + `MessageKey` export.
- Verify: `cd mos-app && npx tsc --noEmit src/i18n/messages.ts` (or full typecheck).

**Task 2.2 — `mos-app/src/i18n/messages.test.ts` (red)** asserting AC-I01/02/03 against the (not-yet
implemented) `useT`/catalog parity.
- Verify (red): `cd mos-app && npx vitest run src/i18n/messages.test.ts` → fails (provider absent).

**Task 2.3 — `mos-app/src/i18n/I18nProvider.tsx` + `use-t.ts` (green).** `I18nProvider` holds
`locale`/`setLocale` (localStorage `'mos.locale'`, default `'en'`); `useT()` reads context, returns the
`t` function with `${n}` interpolation + key fallback.
- Verify (green): `cd mos-app && npx vitest run src/i18n/messages.test.ts` → green.

**Task 2.4 — Wire `I18nProvider` in `mos-app/src/app.tsx`** (inside `ThemeProvider`, around
`AuthProvider`/`RouterProvider`):
```tsx
<ThemeProvider><I18nProvider><AuthProvider><RouterProvider router={router} /></AuthProvider></I18nProvider></ThemeProvider>
```
- Verify: `cd mos-app && npm run typecheck && npx vitest run src/app.test.tsx` → green (smoke unaffected).

### Phase 3 — shell regroup (DESTINATIONS + bottom tabs + rail)

**Task 3.1 — `mos-app/src/shell/destinations.tsx`** (the §4.1 model). Import `KITCHEN_SECTIONS` from
`sections.tsx`; add `HomeIcon`/`PlanIcon`/`InboxIcon` (Task 3.3).
- Verify: `cd mos-app && npm run typecheck`.

**Task 3.2 — `mos-app/src/shell/destinations.test.ts` (red then green)** — AC-D01: `isLive` filters
Plan/Inbox out; Work/Operate/Home live; `anyOf` gating.
- Verify: `cd mos-app && npx vitest run src/shell/destinations.test.ts` → green.

**Task 3.3 — Add icons `mos-app/src/shell/icons.tsx`**: `HomeIcon` (house path), `PlanIcon`
(map/list), `InboxIcon` (tray) — 18px stroke-2 `currentColor aria-hidden`, matching the file's convention.
(Work reuses `TasksIcon`; Operate reuses `KitchenIcon`.)
- Verify: `cd mos-app && npm run typecheck`.

**Task 3.4 — `mos-app/src/shell/bottom-tab-bar.tsx` + `bottom-tab-bar.css` (red first).** Write
`bottom-tab-bar.test.tsx` (AC-T01/T02/T03) first; implement. Renders iff `useIsNarrow()`; maps
`DESTINATIONS.filter(d => isLive(d, accessRoles))`; `NavLink end` to `primaryPath ?? links[0].path`;
labels via `t(d.labelKey)`; active = `border-top: 2px solid var(--primary)` + `text-primary`.
```tsx
export function BottomTabBar() {
  const isNarrow = useIsNarrow()
  const { accessRoles } = useViewerRoles()
  const t = useT()
  if (!isNarrow) return null
  const live = DESTINATIONS.filter(d => isLive(d, accessRoles))
  return (
    <nav aria-label="Primary" className="bottom-tab-bar" style={{ gridArea: 'tabbar' }}>
      {live.map(d => (
        <NavLink key={d.id} to={d.primaryPath ?? d.links[0].path} end={d.primaryPath === '/'}
          className={({isActive}) => `bottom-tab${isActive ? ' bottom-tab--active' : ''}`}>
          <span className="bottom-tab-icon"><d.Icon /></span>
          <span className="bottom-tab-label">{t(d.labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```
CSS (token-only): `.bottom-tab-bar{display:flex;height:var(--tabbar-h);border-top:1px solid
var(--border);background:var(--background);padding-bottom:env(safe-area-inset-bottom)}` etc.
- Verify: `cd mos-app && npx vitest run src/shell/bottom-tab-bar.test.tsx` → green.

**Task 3.5 — `mos-app/src/index.css`:** add `--tabbar-h: 60px;` next to `--header-h: 56px;`.
- Verify: `cd mos-app && npm run lint:css`.

**Task 3.6 — `mos-app/src/shell/app-shell.tsx`:** extend grid (the §4.4 snippet) + render
`{isNarrow && <BottomTabBar />}` next to `<MobileDrawer />`.
- Verify: `cd mos-app && npx vitest run src/shell/app-shell.test.tsx` → green (update if it asserts grid).

**Task 3.7 — Regroup `mos-app/src/shell/rail-nav.tsx`:** replace the hardcoded Workspace/Kitchen groups
with `DESTINATIONS.filter(isLive).map(...)` rendering each destination as a group (`t(d.labelKey)` label
+ its links). Keep `Admin` group below (gated). Drop the Sales group from the rail (drill-only). Keep
`onNavigate`.
- Verify: `cd mos-app && npx vitest run src/shell/rail-nav.test.tsx` → **rewrite this test** to assert
AC-RG01 (Kitchen under "Operate", Tasks under "Work") + Admin still gated; green.

**Task 3.8 — `mos-app/src/shell/sections.tsx`:** update `sectionForPath` to resolve `/tasks*`→ Work
label, `/kitchen*`→ Operate label (return the destination-bearing Section); keep `SALES_SECTIONS` +
`ADMIN_SECTIONS` in the lookup for breadcrumb. Update `sections.test.ts` accordingly.
- Verify: `cd mos-app && npx vitest run src/shell/sections.test.ts` → green.

**Task 3.9 — `mos-app/src/shell/locale-toggle.tsx` (+ test):** minimal 2-button `en`/`id` switch using
`useI18n().setLocale`; rendered in the rail footer + drawer footer (Task 3.7 wires it).
- Verify: `cd mos-app && npx vitest run src/shell/locale-toggle.test.tsx` → green.

### Phase 4 — Home v1

**Task 4.1 — Extract `mos-app/src/components/weekly/my-week-panel.tsx`.** Move the body of `MyWeek`
(MyTasksCard + strips + TeamModule + their state) into `<MyWeekPanel />` (no `PageFrame`/`PageHead`).
Keep prop shapes. `mos-app/src/pages/my-week.tsx` becomes:
```tsx
export function MyWeek() {
  useDocumentTitle('My Week — Gordi MOS')
  return (<PageFrame surfaceWash><PageHead title="My Week" subtitle={…}/><MyWeekPanel /></PageFrame>)
}
```
(*`MyWeek` keeps computing `subtitle`; or pass it down — keep it in the page wrapper to minimize churn.*)
- Verify: `cd mos-app && npx vitest run src/pages/my-week.test.tsx src/pages/my-week.hidden.test.tsx` →
  green (the wrapper preserves behavior).

**Task 4.2 — `mos-app/src/lib/home-kpis.ts` (red first) + `home-kpis.test.ts`** (AC-HK01/02). Pure
selectors over `SalesMarginDailyRow`:
```ts
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { formatIDRCompact, formatDelta, type DeltaDisplay } from '@/lib/sales-dashboard'

function isoDaysBefore(dateIso: string, days: number): string { /* clone */ }
function rowsInWindow(rows, start, end) { return rows.filter(r => r.margin_date >= start && r.margin_date <= end) }
function sumMargin(rows: SalesMarginDailyRow[]): number { return rows.reduce((s,r) => s + r.gross_margin, 0) }

export interface MarginWindow { current: number; prior: number | null }
export function trailingMargin(rows, latestDate, days): MarginWindow { /* mirror trailingWindow */ }

export interface MarginKpiDisplay { value: string; delta: DeltaDisplay; pctSub: string }
export function formatMarginKpi(w: MarginWindow, latestPct: number | null): MarginKpiDisplay {
  return { value: formatIDRCompact(w.current),
           delta: formatDelta(w),  // reuse — treats null prior as 'no comparison'
           pctSub: latestPct == null ? '' : `${Math.round(latestPct*1000)/10}% margin` }
}
```
Also export `openTaskCount(tasks, viewerId)` (R/A, non-Done) — clone MyTasksCard's filter.
- Verify: `cd mos-app && npx vitest run src/lib/home-kpis.test.ts` → green.

**Task 4.3 — `mos-app/src/pages/home-page.test.tsx` (red)** — AC-H01…H07. Mock `reporting.ts` +
`reporting-margin.ts` + `tasks` + `ops-log`; render `<HomePage/>` under a test `AuthProvider`/`I18nProvider`
with a `finance` viewer vs `member` viewer; assert tiles/links/empty behavior.
- Verify (red): `cd mos-app && npx vitest run src/pages/home-page.test.tsx` → fails (component absent).

**Task 4.4 — `mos-app/src/pages/home-page.tsx` + `home-page.css` (green)** — the §4.5 composition.
Role-guarded reporting fetch; two `KpiRow`s; `MyWeekPanel`; `FreshnessLabel`. Each tile wrapped in
`<Link to=…>`. Loading → `KPITile state="loading"`; error → degrade that tile (try/catch per fetch).
```tsx
const canSeeFinance = accessRoles.includes('finance') || accessRoles.includes('admin')
// fetch reporting rows only if canSeeFinance; tasks + ops always
```
- Verify (green): `cd mos-app && npx vitest run src/pages/home-page.test.tsx` → green.

**Task 4.5 — Route swap `mos-app/src/router.tsx`:** index route `{ index: true, element: <MyWeek /> }`
→ `{ index: true, element: <HomePage /> }`. Add `import { HomePage } from './pages/home-page'`.
- Verify: `cd mos-app && npm run typecheck && npx vitest run` (full unit suite) → green.

### Phase 5 — phone-first visual + e2e gate

**Task 5.1 — Playwright check (≤380px) — `mos-app/e2e/home-shell-mobile.spec.ts`** (curated, finance
viewer): at 380×800 assert bottom tab bar visible with 3 tabs, no horizontal scroll, Home KPI tiles +
My Week panel visible, revenue tile links to `/sales`. (Reuses existing e2e auth fixture if present;
else mark `test.skip` with a TODO pointing to the auth-fixture prerequisite — do NOT fake auth.)
- Verify: `cd mos-app && npx playwright test home-shell-mobile` (or skip-gated).

**Task 5.2 — Coverage gate.** `cd mos-app && npm run test:coverage` → changed files (home-page,
home-kpis, destinations, bottom-tab-bar, i18n/*, reporting-margin) ≥80% lines. Add tests for any gap.

### Phase 6 — ship prep (Director-owned; not executed by implementer)
- Branch `feat/home-v1-margin`, one PR, commit trailer per `AGENTS.md`. ADR-0021 + this plan referenced
  in the PR body. `supabase db push` for the migration is **owner-gated** (staging then prod), mirroring
  the revenue model's deploy posture. The VPS cron change (Task 1.6) is applied on-box by the owner
  after the migration lands on staging.

## 7. Test-pyramid map (AC → owning test → layer)

| AC | Owning test | Layer |
|---|---|---|
| AC-M01…M07 | `supabase/tests/61_reporting_sales_margin_rls.sql` | pgTAP (Integration) |
| AC-SN01…05 | `scripts/test_reporting_snapshot.py` | Python unit |
| AC-H01…H07 | `mos-app/src/pages/home-page.test.tsx` | Vitest/RTL (Unit) |
| AC-HK01/02 | `mos-app/src/lib/home-kpis.test.ts` | Vitest (Unit) |
| AC-T01…T03 | `mos-app/src/shell/bottom-tab-bar.test.tsx` | Vitest/RTL (Unit) |
| AC-D01 | `mos-app/src/shell/destinations.test.ts` | Vitest (Unit) |
| AC-RG01 | `mos-app/src/shell/rail-nav.test.tsx` | Vitest/RTL (Unit) |
| AC-I01…03 | `mos-app/src/i18n/messages.test.ts` | Vitest (Unit) |
| (visual) | `mos-app/e2e/home-shell-mobile.spec.ts` | E2E (Playwright, curated) |

`grep -rE 'AC-[MHSTDIRGSN][0-9]+' mos-app/src supabase/tests scripts` finds every proof.

## 7a. AMENDMENT (2026-07-04, Director) — Task 0.1 executed: source contract CORRECTED

**Task 0.1 ran against the live warehouse. The assumed shape was wrong — this section supersedes
§3.1 FR-M06/M07, §3.2, Task 1.3's query, and AC-SN03 where they conflict.**

**Live findings:**
- `v_daily_cogs_comparison` = a **diagnostic** view (per gordi-esb-bak sql-guide): BOM-method COGS
  (`bom_total`, from `v_transaction_cogs`) FULL-JOINed with stock-movement POS consumption
  (`sm_total`, `stock_movement where transaction_type='POS Sales'`) at grain
  `(cogs_date, esb_code, branch_code)`. **No revenue, no channel, no branch_name.** 1,144 rows.
- **Finance doctrine (gordi-esb-bak `COGS-REPORT-WORKFLOW.md` — the certified-metric oracle):**
  ONE actual COGS = **GL account 5** (stock-movement consumption reconciled to opname; posts
  monthly). **BOM = budget**, never an actual. Mid-month stock-movement figures are **INTERIM /
  not-yet-reconciled** and must be labeled so. Never present competing actuals.
- COGS exists for **POS only** (both methods). No B2B/Roastery COGS at daily grain.

**Corrected data contract (replaces §3.2):** table stays `reporting.sales_margin_daily`, PK/RLS/
writer-bypass unchanged, but columns + semantics:

| Column | Type | Notes |
|---|---|---|
| `org_id`/`margin_date`/`esb_code`/`branch_code` | as §3.2 | grain — **no `channel` column; POS-only** (COGS has no channel; add channel only when B2B COGS exists upstream) |
| `branch_name` | text | from the revenue side of the join |
| `revenue` | numeric(14,2) | POS `clean_revenue` from `v_daily_revenue_unified` (`channel='POS'`) |
| `cogs_interim_sm` | numeric(14,2) | stock-movement POS consumption (`sm_total`) — **INTERIM basis, not GL-certified** |
| `cogs_budget_bom` | numeric(14,2) | BOM/recipe COGS (`bom_total`) — **budget**, the recipe-cost check |
| `margin_interim` | numeric(14,2) | `revenue − cogs_interim_sm` |
| `margin_interim_pct` | numeric(8,4) | NULL when revenue ≤ 0 |
| `bom_coverage_pct` | numeric(8,4) | carried from source — the data-quality badge for low-coverage days |
| `snapshot_as_of`/`source_contract_version`/`loaded_at` | as §3.2 | contract version default **`pos_margin_interim.v1`** |

**Corrected source query (replaces Task 1.3's `build_margin_source_query`):**
```sql
select r.revenue_date               as margin_date,
       r.esb_code,
       coalesce(nullif(btrim(coalesce(r.branch_code,'')),''), r.esb_code::text) as branch_code,
       max(r.branch_name)           as branch_name,
       sum(r.clean_revenue)         as revenue,
       max(c.sm_total)              as cogs_interim_sm,
       max(c.bom_total)             as cogs_budget_bom,
       max(c.bom_coverage_pct)      as bom_coverage_pct
from public.v_daily_revenue_unified r
left join public.v_daily_cogs_comparison c
  on c.cogs_date = r.revenue_date
 and c.esb_code::text = r.esb_code::text
 and c.branch_code = coalesce(nullif(btrim(coalesce(r.branch_code,'')),''), r.esb_code::text)
where r.channel = 'POS'
  and r.revenue_date >= %(since)s
group by r.revenue_date, r.esb_code, 3
```
(`margin_interim`/`_pct` computed in the normalize step from the fetched figures, so NULL-COGS days
— sync gaps — yield NULL margin, never a fake 100%.)

**UI consequence (Home KPI, replaces the §4.5/§4.6 margin label):** the tile is
**`home.kpi.margin` = "Gross margin (interim)" / id "Margin kotor (interim)"**, sub =
`margin_interim_pct`; the certified monthly GL margin (`v_monthly_pnl`) is a **follow-up read-model**
(`margin_monthly_certified`) — tracked, out of this slice. This keeps ONE actual (GL, monthly,
later) + one labeled interim (daily, now) — exactly the finance doctrine.

**AC deltas:** AC-SN03 asserts the corrected query (join + POS filter + interim naming);
new **AC-SN06**: given a day with revenue but NULL COGS, margin fields are NULL (no fake margin);
AC-M01 PK drops `channel`; AC-H07's tile asserts the "(interim)" label.

## 8. Open questions for the Director / residual risks

1. ~~**`v_daily_cogs_comparison` shape (Task 0.1) — PRIMARY RISK.**~~ **RESOLVED 2026-07-04 — the
   risk fired and is corrected in §7a** (diagnostic view, BOM=budget doctrine, POS-only, interim
   labeling). Build against §7a, not §3.2/Task 1.3 originals.
2. **Spec backfill.** No `docs/specs/home-v1.spec.md` / `reporting-sales-margin.spec.md` exists. This
   plan is spec-shaped (EARS FRs + Given/When/Then ACs). Director decision: backfill formal specs first,
   or accept this plan as the slice's contract (the patterns are proven from the two existing specs)?
3. **Margin drill target.** Margin KPI drills to `/sales` (no own route). The sales dashboard does not
   yet *display* margin — the drill lands the user in the finance surface. A follow-up issue should add a
   margin view/section to `/sales` so the drill is not a dead-ish end. Tracked, not blocking.
4. **Ops KPI vs `SHOW_DAILY_LOG=false`.** The ops tile respects the flag (hidden when off, like
   `OpsStrip`). If the owner wants the tile visible before the Daily Log ships, flip the flag — out of
   this slice's scope.
5. **i18n retrofit scope.** Only NEW strings (shell destinations + Home + locale toggle) are catalogued
   this slice. My Week panel strings are existing → English until a dedicated i18n-sweep issue. Confirm
   this incremental posture is acceptable (ADR-0019 D12 / ADR-0021 record it as deliberate).
6. **`reporting_writer` role on prod.** The bypass policy is created by the migration, but the
   `reporting_writer` *role* is created by `20260704000001` (idempotent DO block). On a fresh prod push
   both migrations must apply; the role's password is set out-of-band (staging pattern, warehouse-online.md).
   Owner-gated, not CI.

## 9. Task count + AC coverage summary
- **Tasks:** 0.1 + 1.1–1.7 (7) + 2.1–2.4 (4) + 3.1–3.9 (9) + 4.1–4.5 (5) + 5.1–5.2 (2) = **28 tasks.**
- **AC coverage:** AC-M01–M07 (pgTAP) · AC-SN01–SN05 (py) · AC-H01–H07 + AC-HK01–HK02 (RTL/unit) ·
  AC-T01–T03 · AC-D01 · AC-RG01 · AC-I01–I03 · +1 curated e2e. Every behavior task names its AC(s).
