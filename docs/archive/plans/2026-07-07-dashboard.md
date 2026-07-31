# Design-plan: /dashboard rebuild (Variant B Tabs)

- **Date:** 2026-07-07
- **Author:** design-architect (Frontend lens)
- **Spec:** `docs/specs/dashboard.spec.md` (binding — all FRs/ACs/NFRs)
- **Mockup:** `docs/design-mockups/dashboard-B-tabs.html` (Variant B Tabs — **signed off** 2026-07-07, OD-DASH-6)
- **Decisions:** `docs/decisions.md` **OD-DASH-1..6** (LOCKED 2026-07-07 grill session)
- **Identity authority:** `DESIGN.md` (adopted PMO "Quiet Control Surface"; ADR-0009 token system)
- **Glossary:** `CONTEXT.md` — COGS + Gross margin are **basis-aware**; bare "margin" / bare "COGS" = _Avoid_.
- **Route:** `/mos/dashboard` (replaces `/mos/sales`); parameterized detail sub-view at `/mos/dashboard/detail`.
- **Identity rule (hard):** every visual decision below names a `DESIGN.md` token — **no raw hex/px for color, radius, shadow, or type.** The One-Blue Rule, the Structural-Navy Rule, and the Orange-Sprinkle Rule are all preserved.

> **Supersedes** `docs/plans/2026-07-02-sales-dashboard-design.md`. That plan birthed the dashboard kit
> (`KPITile`/`ChartFrame`/`DataTable`/`FreshnessLabel`/`CutToggle`); this plan **extends** that kit
> (filter-in-place, basis/DQ slots, gross-margin/COGS columns, a 3rd cut, a tab strip, a window selector)
> rather than re-skinning it. No new palette, font, radius, or gradient is introduced.

---

## 0. Scope-read & how this maps to OD-DASH-1..6

| Decision | What it binds here |
|---|---|
| **OD-DASH-1** (Metabase deferred) | Build MOS-native drill-down, not a BI embed. No charting playground. |
| **OD-DASH-2** (`/sales`→`/dashboard`) | Route rename + broaden; Home stays a light landing (its finance tiles relink). |
| **OD-DASH-3** (one slice) | Data spine + local unblock ship **with** this UI. The UI assumes rows exist. |
| **OD-DASH-4** (drill = A+B; C deferred) | **A** = filter-in-place (tile-click / cut / window). **B** = the Detail tab is the parameterized `/dashboard/detail` route. No deputy/analyst handoff this slice. |
| **OD-DASH-5** (KPIs + basis-labels + stubs) | Revenue leads; gross margin/COGS secondary and **basis-labelled**; not-yet-backed KPIs = **one "What's coming" strip**; cuts = Branch/Channel/Activity; window = 30d default, presets [7d/30d/60d] + 60-day-bounded custom. |
| **OD-DASH-6** (Variant B) | Summary/Detail tabs on one route; **one global Cut/Window toolbar above both**; `?tab=` URL persistence; desktop + mobile both first-class. |

---

## 1. Layout

The page is a **stack**, top→bottom: page head → **global toolbar** (governs both tabs) → **tab strip** → **one pane** (Summary or Detail). Variant B's defining move is that the Cut/Window live *above* the tabs, so a change re-filters **both** panes — there is no per-tab duplication (resolves mockup open-question Q3 in favour of the single-source-of-truth shown).

### 1.1 Desktop (≥1280px) — dense dashboard, `PageFrame variant="data"`

```
┌─ rail (224px, brand-navy) ─┐ ┌─ main ──────────────────────────────────────────────┐
│  brand                     │ │ header (56px): crumb › Dashboard · ⌘K · deputy · bell · user │
│  nav (Dashboard active)    │ ├──────────────────────────────────────────────────────┤
│                            │ │ page-head:  "Dashboard" (page-title) · FreshnessLabel │
│                            │ ├──────────────────────────────────────────────────────┤
│                            │ │ GLOBAL TOOLBAR  [7d|30d|60d] [Range 2 Jun–1 Jul▾] │ Cut [Branch|Channel|Activity] │
│                            │ ├──────────────────────────────────────────────────────┤
│                            │ │ TAB STRIP   Summary │ Detail (86)   …… Applies to both: Branch · 30d │
│                            │ ├──────────────────────────────────────────────────────┤
│                            │ │ PANE (Summary)                                        │
│                            │ │   Revenue row     ┌─tile─┬─tile─┬─tile─┬─tile─┬─tile─┐ │
│                            │ │                   │ 7d   │ 30d  │ day  │ avg  │ mix  │ │  ← 5-up grid
│                            │ │   GM/COGS row     ├─tile─┬─tile─┬─tile─┬─tile─┬─stub─┤ │  ← 5-up grid
│                            │ │   What's-coming   ├──────┴──────┴──────┤ (3 stubs)    │  ← 3-up strip
│                            │ │   footnote (interim basis)                             │
│                            │ │   ChartFrame  "Daily revenue — last 30d"              │
│                            │ └──────────────────────────────────────────────────────┘
└────────────────────────────┘
```

- **Revenue KPI row** (5-up `repeat(5,1fr)`, gap `spacing.md` 12px): Trailing 7-day revenue (+WoW) · Trailing 30-day revenue (+MoM) · Latest reporting-day revenue · Avg check · **Channel mix as a string** ("POS 77% · B2B 23%", FR-007/AC-009 — never a chart). The 7-day tile is the default **filter-in-place driver** (selected ring on load; FR-016/AC-016).
- **Gross-margin / COGS row** (5-up): Interim GM % (30d/7d) · Interim GM amt · Interim COGS · **BOM coverage (DQ badge)** · 1 stub (Opex). **Every GM/COGS figure carries a `BasisChip`** ("interim · stock-movement", FR-008/AC-008) — no bare "margin"/"COGS" anywhere.
- **"What's coming" strip** (3-up): Material usage/waste · Labor cost % · Roastery yield — all "Needs warehouse data" stubs (FR-010/AC-010). **One strip, never four scattered stub tiles.** A dashed `ph` placeholder glyph + muted note ("GL feed pending · slice 2") keeps gap-visibility honest.
- **Footnote** (muted, below GM row + below table): "Interim = not-yet-reconciled, POS-only, mid-month. COGS is stock-movement-derived, not GL-certified." + a "How margins are calculated →" link (`primary`). This is the DQ/interim-basis footnote (FR-024/AC-024).
- **`ChartFrame`** "Daily revenue — last {window}" — bar series grouped by channel (or selected cut); `aria-label="Daily revenue chart"`; **mandatory `<table>` fallback** for SR/no-JS (FR-017/AC-019).
- **Condensed detail table** lives **below the chart on the Summary tab** (FR-018) — a short, non-sortable peek (top N rows) reflecting the current filter. The full sortable table is the **Detail tab**.

### 1.2 Detail tab (desktop) — the escape hatch, FR-019/AC-018

A `detail-wrap` card (`rounded.lg`, `shadow-rest`) with a seamed toolbar (title "Daily revenue breakdown" + row-count meta + a `search-mini` row filter) and the **full sortable `DataTable`**. Columns (the spec mandates 7 data columns; see §6 gap — the mockup shows only 6, this plan extends to the full set):

1. **Date** (`revenue_date`, dd MMM + weekday muted) — overline groupable per day via `rowClassName` `daybreak`.
2. **{Cut}** — Branch name (13.5px/600) + branch code (mono, `muted-foreground`); or Channel tag; or Activity (Cafe Ops / Roastery / Unmapped).
3. **Channel** — swatch + label (POS = `primary` swatch, B2B = `violet` swatch).
4. **Revenue** (`tabular`, right) — sortable (default desc).
5. **Txns** (`tabular`, right) — transaction count.
6. **Share %** (`tabular`, right) — share of total revenue.
7. **Avg check** (`tabular`, right) — revenue ÷ txns.
8. **Interim COGS** (`tabular`, right, `BasisChip`-qualified) — sortable.
9. **Interim gross margin** (`tabular`, right, `BasisChip`-qualified) — sortable.
10. **Margin %** (`tabular`, right) — sortable.
- **Footer** totals row (`secondary/40%` bg, 1.5px top border, `tabular`): Total · row count · — · Σ revenue · Σ txns · 100% · blended avg · Σ COGS · Σ GM · blended margin %.

> **Cut-aggregation rows (NEW on `DataTable`):** when the cut ≠ the table's natural grain, the table renders a per-cut **subtotal row** (the mockup's `daybreak` treatment: `secondary/40%` bg, hairline separators) so "revenue by Branch" is one roll-up row per branch, not a flat per-day spill. This is the `DataTable` extension in §2.

### 1.3 Mobile (390px) — phone-first, each tab is ONE focused surface (AC-025)

Variant B's mobile strength: the phone never stacks cockpit+table — each tab is the whole screen.

```
┌─ phone 390px ────────────────────┐
│ topbar (52px): ☰ · G · Dashboard · 🔔   │
│ page-head:  "Dashboard" (20px)           │
│            as of 2 Jul, 03:14 · latest Wed 1 Jul │
│ STICKY tab strip:  Summary │ Detail (86) │  ← 40px touch floor
│ STICKY filter rail (horiz scroll):       │  ← backdrop-blur, secondary/35%
│   [7d|30d|60d]  [2 Jun–1 Jul▾]  [Branch|Channel|Activity] │
├──────────────────────────────────┤
│ PANE — Summary (mobile):                 │
│   overline "REVENUE"                     │
│   2-up KPI tiles (7d, 30d, day, avg)     │
│   overline "GROSS MARGIN · interim"      │
│   2-up GM tiles (GM%, GM amt, COGS, BOM) │
│   overline "COMING — needs warehouse"    │
│   2-up stub tiles (Opex, Material, …)    │
│   compact chart (110px, full-width card) │
└──────────────────────────────────┘
```

- **KPI grid → 2-up** (`grid-template-columns: 1fr 1fr`, gap `spacing.sm` 8px); tile value scales 23px→18px, label 12.5px→11.5px. Never a horizontal-scrolling KPI strip.
- **Sticky rail** holds the toolbar *below* the tabs (the mockup's `ph-filter`): `secondary/92%` + `backdrop-filter: blur(8px)`, horizontally scrollable so the 3-option CutToggle never wraps. Cut **keeps all 3 options on mobile** (Branch/Channel/Activity) — see §6 gap G2; the mockup's mobile frame drops Activity by mistake.
- **Summary tab** = tiles + compact chart only. **Detail tab** = the daily breakdown as **scan-friendly cards** (one card per row; title = branch + code; `<dl>` grid for revenue / txns / avg / channel swatch), grouped by an overline day-header ("WED 1 JUL · latest"). No chart on the mobile Detail tab.
- **No cockpit-over-table stacking** (FR-020) — the tab switch is the only way between Summary and Detail on phone.

### 1.4 Tablet (768px–1279px) — the transition

- At ≥768px the **rail re-expands** (`--rail-w: 224px`) and the page renders the dense layout, but the KPI grids stay at a reduced column count until ≥1024px: revenue row → 3-up, GM row → 3-up, "What's coming" → 3-up. At ≥1280px all three go to their full 5/5/3-up desktop composition (AC-026).
- The `DataTable` reflow boundary is **768px** (its existing `useIsDesktop()` single-render switch): ≥768px = `<table>`, <768px = card list. This is a *separate* breakpoint from the 920px rail collapse (DESIGN.md OD-W4-4) — keep both.
- The global toolbar wraps (`flex-wrap: wrap`) on tablet rather than scrolling — desktop fits on one line, tablet wraps the Cut group to a second line.

---

## 2. Component breakdown

The kit from `2026-07-02-sales-dashboard-design.md` is **reused + extended**; six pieces are **new**. Each entry: purpose → props → states → DESIGN.md tokens.

### 2.1 `KPITile` — **EXTEND** (existing: `mos-app/src/components/dashboard/kpi-tile.tsx`)

**Why extend:** needs (a) an `onClick` for filter-in-place (FR-016/AC-016), (b) a `selected` state, and (c) a **basis/DQ slot** for GM/COGS tiles (FR-008/AC-008). The existing primitive is display-ready-string-in (no currency math) — keep that contract.

```ts
interface KPITileProps {
  label: string
  value: string                      // pre-formatted (composition formats IDR/%)
  delta?: { text: string; tone: 'success'|'destructive'|'neutral'; dot?: boolean }
  sub?: string
  help?: string                      // "?" tooltip
  state?: 'ready' | 'loading' | 'empty'
  // ── EXTENSIONS (this issue) ──
  onClick?: () => void               // FR-016: filter-in-place. Omitted → non-interactive tile (GM/stubs)
  selected?: boolean                 // FR-016: the tile driving the current filter gets a primary ring
  basis?: ReactNode                  // FR-008: a <BasisChip> ("interim · stock-movement") on GM/COGS tiles
  dq?: ReactNode                     // FR-008/024: a <DQBadge> from bom_coverage_pct on GM/COGS tiles
}
```

- **`selected`** → `border-color: primary` + `box-shadow: 0 0 0 1px primary` (+ the state lift). `aria-current="true"`, `role` flips to `button` when `onClick` set.
- **`basis`/`dq`** render in a foot row beneath `sub` (after the delta pill). Only GM/COGS tiles pass these; revenue tiles render unchanged.
- **Loading state** already exists (`state="loading"` → skeleton value pill). Keep.
- **Tokens:** `card` bg, `border`, `rounded.md`, `shadow-rest` (+`shadow-hover` on hover/selected), `muted-foreground` label/sub, `foreground` value, page-title scale (23px/600) for value, `primary` for selected ring + sort glyph. Delta pill reuses `Pill` (success/destructive/neutral tones).

### 2.2 `ChartFrame` — **REUSE AS-IS** (existing)

Already has `title` + `freshness` + `controls` + `children` + **mandatory `tableFallback`** (FR-017/AC-019) + `state` (loading/empty/error/ready) + `onRetry`. No change. The injected `DailyRevenueChart` is the only sales-specific child. **Tokens:** `card`, `border`, `rounded.lg`, `shadow-rest`, heading type for title, `muted-foreground` freshness.

### 2.3 `DataTable` — **EXTEND** (existing: `mos-app/src/components/dashboard/data-table.tsx`)

**Why extend:** needs (a) the gross-margin/COGS/share columns, (b) **cut-aggregation subtotal rows** (the `daybreak`/group treatment), and (c) to stay the single-render 768px reflow it already is. The existing `groups` prop (OD-P3-6 group-header row) is the natural vehicle for **day-grouped** detail; cut-aggregation is a separate need.

```ts
// NEW optional prop on DataTableProps:
subtotalRows?: Array<{          // cut-aggregation roll-ups (Branch/Channel/Activity)
  key: string
  label: string                 // "Gordi Kafe Indonesia · GKID"
  className?: string            // 'dt-subtotal' → secondary/40% bg, hairline sep
  cells: ReactNode[]            // pre-aggregated: revenue / txns / share / avg / COGS / GM / margin%
}>
```

- Cut-aggregation rows render as `dt-subtotal` (`secondary/40%` bg, `border/70%` top, 13px/600 label, `tabular` numerics) — the mockup's `daybreak` + `tfoot` grammar, not a new style.
- The full column set (date, cut-dim, channel, revenue, txns, share, avg, COGS, GM, margin %) is passed by the composition's `revenueColumns(cut)` + a new `marginColumns` merge — the primitive stays column-agnostic.
- **States:** loading (6 skeleton rows, exists), empty (`emptyLabel`, exists), error (`role="alert"` + retry, exists), ready.
- **Tokens:** `table-header-cell`/`table-body-cell` (38px header / 54px body), `overline` type, `muted-foreground` header, `border`/`border-70` dividers, `accent/60` row hover, `secondary/40` subtotal + footer bg, `tabular` on all numeric cells, `primary` sort glyph, mono on branch codes.

### 2.4 `CutToggle` — **EXTEND** (existing)

The component already accepts `options: string[]` and is arrow-key navigable (roving tabindex + `role="tablist"`). The extension is purely **at the call site**: pass 3 options `['Branch','Channel','Activity']` (the current page passes only 2 — see gap G2). `DashboardCut` widens to `'Branch' | 'Channel' | 'Activity'`. **Tokens:** `secondary` track, `background` on-pill, `foreground`+600 on-pill text, `shadow-pressed` lift, `ring` focus.

### 2.5 `FreshnessLabel` — **REUSE AS-IS** (existing)

"as of {ts}" chip. Used in the page head + the ChartFrame freshness slot (FR-004/AC-020, NFR-freshness). **Tokens:** `muted-foreground`, `tabular` on the timestamp.

### 2.6 `WindowSelector` — **NEW** (`mos-app/src/components/dashboard/window-selector.tsx`)

The window control the current page lacks. Composes a 3-preset `CutToggle`-style seg (`[7d|30d|60d]`, 30d default, FR-013) **+** a custom date-range control (FR-014). Custom range is **bounded to the 60-day snapshot window** — dates outside `[minDate, maxDate]` are disabled; a somehow-out-of-range submission clamps (error-table row).

```ts
interface WindowSelectorProps {
  window: WindowSpec               // {kind:'preset', days:7|30|60} | {kind:'custom', from, to}
  minDate: string                  // latest reporting_date − 60d (the snapshot floor)
  maxDate: string                  // latest reporting_date (FR-005 — reporting-day, not Date.now())
  onChange: (w: WindowSpec) => void
  ariaLabel?: string
}
```

- Preset seg reuses the `seg` grammar (same shell as `CutToggle`).
- Custom range = the `control` chip shell (`input` border, `rounded.sm`, `muted-foreground` "Range" label + `tabular` range text + chevron) wrapping a **keyboard-operable** native date picker pair. Two `<input type="date">` with `min`/`max` set, `:focus-visible` ring, disabled-days styled (`secondary` bg, `not-allowed`).
- On custom-select, the comparison window = the same-length immediately preceding window (FR-014) — computed in the composition, not the control.
- **Tokens:** `secondary` seg track, `background` on-pill, `input` border on the range chip, `rounded.sm`, `muted-foreground` label/chevron, `foreground` value, `ring` focus, `tabular` on dates.

### 2.7 `TabStrip` — **NEW** (`mos-app/src/components/dashboard/tab-strip.tsx`)

The Summary/Detail switch. This is the DESIGN.md **view-tab strip grammar** (OD-P3-6): active tab = `brand-navy-text` + a 2px `brand-orange` bottom border (the one orange sprinkle per screen — Orange-Sprinkle Rule). `role="tablist"`/`role="tab"`/`aria-selected` + **roving tabindex** (arrow-key nav, FR/NFR-accessibility). Active tab persists in the URL as `?tab=summary|detail` (FR-015/AC-015).

```ts
interface TabStripProps {
  tabs: Array<{ id: 'summary'|'detail'; label: string; count?: number }>
  value: 'summary' | 'detail'
  onChange: (id) => void           // composition writes ?tab= to the URL
  trailing?: ReactNode             // the "Applies to both: Branch · 30d" hint
}
```

- Inactive tab = `muted-foreground`; hover = `foreground`; active = `brand-navy-text` text + `brand-orange` underline. Count pill = `secondary` bg + `muted-foreground` text (the "86 rows" affordance — resolves mockup Q2 in favour of keeping it: cheap signal of detail size).
- **Sticky** under the header (`position: sticky; top: 0`; `background` bg, `z-index: 2`).
- Mobile: 40px touch floor (not 38px).
- **Tokens:** `brand-navy-text` (active text), `brand-orange` (active underline — the single orange mark), `muted-foreground` (inactive + count), `border` (strip bottom), `background` (sticky bg), `secondary` (count pill).

### 2.8 `GlobalToolbar` — **NEW** (`mos-app/src/components/dashboard/global-toolbar.tsx`)

Composes `CutToggle` + `WindowSelector` + (on desktop) a divider + the "Cut" overline label. One source of truth above both tabs (FR-011/AC-011). Changes propagate to both panes via the composition's shared state.

```ts
interface GlobalToolbarProps {
  cut: DashboardCut
  onCutChange: (c) => void
  window: WindowSpec
  onWindowChange: (w) => void
  minDate: string; maxDate: string
}
```

- Desktop: single flex row, `flex-wrap: wrap`, gap `spacing.sm`. A 1px×24px `border` divider separates window-group from cut-group; an overline "CUT" label precedes the CutToggle (mockup grammar).
- Mobile: this does **not** render inline — the composition renders the same controls inside the sticky `ph-filter` rail (horiz-scroll). `GlobalToolbar` exposes its children so the mobile rail can lay them out differently.
- **Tokens:** `border` (divider), `overline` type ("CUT"), `background` (flat — **no** resting shadow, it's a utility surface per Soft-Elevation Rule).

### 2.9 `BasisChip` — **NEW** (`mos-app/src/components/dashboard/basis-chip.tsx`)

The basis qualifier every GM/COGS figure must carry (FR-008/AC-008, CONTEXT.md canon). A neutral `badge-status` variant — **this is the `--basis-chip` semantic role** (proposed token, §6). Renders "interim · stock-movement" (or "interim · not GL-certified" on mobile where space is tight).

```ts
interface BasisChipProps { label?: string }   // default "interim · stock-movement"
```

- **Tokens:** `secondary` bg + `muted-foreground` text, `rounded.full`, `label` type (11px/600), height 20px. **No dot** (it's not a status — it's a qualifier), distinguishing it from `DQBadge`. This is a **new semantic role over existing tokens**, not a new hue (proposed in §6, flagged for owner sign-off).

### 2.10 `DQBadge` — **NEW** (`mos-app/src/components/dashboard/dq-badge.tsx`)

The data-quality badge derived from `bom_coverage_pct` (FR-024/AC-024). Two states: **partial** (`bom_coverage_pct` < threshold → `warning` family: amber tint + brown text + dot, "Partial — DQ") and **good** (≥ threshold → `success` family, "Good"). This is the **DQ-as-warning/success** semantic (proposed token mapping, §6).

```ts
interface DQBadgeProps {
  coveragePct: number | null       // bom_coverage_pct; null → 'unknown' neutral
  threshold?: number               // default 0.90 (90%)
}
```

- `coveragePct` null → neutral `badge-status` ("coverage unknown").
- **Tokens:** `warning`/`warning-foreground` (partial), `success`/`success-foreground` (good), `secondary`/`muted-foreground` (unknown), `rounded.full`, 6px dot, `label` type. **Maps DQ to existing status families — no new hue** (proposed in §6).

### 2.11 `WhatsComingStrip` — **NEW** (`mos-app/src/components/dashboard/whats-coming-strip.tsx`)

The single honest strip of not-yet-backed KPIs (FR-010/AC-010). Renders Opex · Material usage/waste · Labor cost % · Roastery yield as **one strip** (desktop: 3-up + Opex in the GM row's 5th slot per the mockup, OR a standalone 3/4-up strip — see §6 gap G3). Each stub = dashed `ph` placeholder glyph + label + "Needs warehouse data" value + a muted note (the upstream feed it's waiting on). **Never a faked number.**

```ts
interface WhatsComingStripProps {
  items: Array<{ label: string; note: string }>   // fixed list; no values
}
```

- **Tokens:** `card`/`border`/`rounded.md`/`shadow-rest` (it's a tile), `muted-foreground` for label/value/note, `input` border dashed for the placeholder glyph (`rounded.xs`), display type (14px/600) for the "Needs warehouse data" value.

### 2.12 Composition: `DashboardPage` (replaces `SalesDashboardPage`)

Wires selectors → primitives. Owns: the cut/window/tab state (tab synced to `?tab=` URL param), the filter-in-place `selectedTile` state, the Branch↔Activity + Channel mapping, the reporting-day window anchor (`latestReportingDate`, never `Date.now()`). Reads `reporting.sales_daily_revenue` + `reporting.sales_margin_daily` via the reporting DAL (FR-003/AC-004). Route-gated `finance`/`admin` (FR-002/AC-002/003).

---

## 3. States (loading / empty / error / DQ / NULL-margin / prior-window-missing)

Every state is spec-mandated (FR-021..024) and must be RTL-tested (AC-022..024). The tab strip + global toolbar **always render** so the user sees structure even in a non-ready state (mockup STATE NOTES).

| State | Trigger | Behavior | Tokens |
|---|---|---|---|
| **Loading** (FR-022/AC-022) | query in flight | Skeleton KPI tiles (`KPITile state="loading"`, existing skeleton-pill) + skeleton chart (`ChartFrame state="loading"`) + 6 skeleton table rows. **Not blank, not spinners.** `role="status"` + `aria-busy="true"`. | `secondary` skeleton blocks, `card` bg |
| **Empty** (FR-021/AC-021) | 0 rows | Both tabs render **"No sales snapshot data yet"** — names the source (`reporting.sales_daily_revenue`) + "the next warehouse snapshot will populate this page." **No KPI tiles, no table** (no misleading zero-revenue KPI). Reuses existing `EmptyState`. Tab strip still shows. | `muted-foreground` copy, `card` |
| **Error** (FR-023/AC-023) | query fails | `role="alert"` card: red icon (`destructive/12%` tint) + "Couldn't load sales reporting" (`status-lost-text`) + "(non-secret)" + **Try again** outline button. **No DSN, token, SQL, or stack.** Filters preserved across retry (retry key increments, state kept). | `destructive` icon tint, `status-lost-text` text, `button-outline` |
| **DQ / interim-basis** (FR-024/AC-024) | `bom_coverage_pct` < threshold | `DQBadge variant="partial"` (amber) on GM/COGS tiles + the interim-basis footnote ("interim — stock-movement, not GL-certified"). Every GM/COGS figure also carries a `BasisChip` regardless. | `warning`/`warning-foreground`, `secondary`/`muted-foreground` footnote |
| **NULL margin (sync-gap day)** (error-table) | `cogs_interim_sm` null | GM tiles render **"interim unavailable"** with the basis footnote — **never a fake 100% margin** (the DAL already nulls `margin_interim`/`margin_interim_pct` on a sync gap; the UI must honor the null). | `muted-foreground` "unavailable", `BasisChip` |
| **Prior-window missing** (error-table) | < 2×window rows | Delta chip renders a **neutral "no comparison"** state — **never `0%` or `NaN`** (FR-009). | `Pill tone="neutral"` |
| **Custom date out of window** (error-table) | picker beyond 60d | Dates **disabled** in the picker; a somehow-submitted out-of-range value clamps to `[minDate, maxDate]`. | `secondary` disabled bg, `not-allowed` |
| **Unknown branch/activity mapping** (error-table) | unmapped `esb_code` | Display the source branch/channel; group under `Unmapped` **only** in Activity view. | `muted-foreground` |

---

## 4. Responsive breakpoints

Three explicit breakpoints (AC-025/026). The two structural ones are **768px** (DataTable table↔card reflow) and **920px** (rail collapse) — both inherited from DESIGN.md OD-W4-4; keep them distinct.

| Range | Layout |
|---|---|
| **Mobile `<768px`** (target 390px, AC-025) | Rail collapsed (hamburger). KPI = 2-up. Toolbar = sticky horiz-scroll rail below tabs. Tab switch only (no cockpit+table stacking). Detail = day-grouped scan cards. Tile value 18px, label 11.5px. Touch floors 40–44px. |
| **Tablet `768px–1279px`** | Rail expanded. Dense layout but KPI grids at reduced column count (3-up) until ≥1280px. Toolbar wraps (`flex-wrap`) instead of scrolling. DataTable = `<table>`. |
| **Desktop `≥1280px`** (AC-026) | Full 5/5/3-up KPI composition, single-line toolbar, chart + condensed table above/near the fold. All numerics `tabular`. |

**No horizontal scroll at any breakpoint** (AC-025). The mobile filter rail scrolls *internally* (its own `overflow-x: auto`), not the page.

---

## 5. Accessibility (WCAG-AA)

- **Contrast:** all text on `card`/`background` is ≥AA (`foreground` ~AAA; `muted-foreground` clears AA for secondary text). Status-pill/DQ/basis text uses the **darkened AA variants** (`status-won-text`, `status-lost-text`, `warning-foreground`) — never the base saturated hue as small text. The `brand-orange` active-tab underline is a 2px **marker**, not text (it carries no text burden; the active tab's *text* is `brand-navy-text` ≥7:1).
- **Focus:** single global `:focus-visible` ring (`2px solid ring` = primary, 2px offset) on every focusable element — tiles-as-buttons, tabs, segs, date inputs, retry button.
- **Focus order:** DOM order → rail → header → page-head → global toolbar → tab strip → pane contents. The filter-in-place tile-click does not trap focus (it filters in place; focus stays on the tile, the chart/table update below).
- **Keyboard paths:**
  - **Tab strip + both segs (Cut + Window):** `role="tablist"`/`role="tab"` + **roving tabindex** — `Tab` enters the strip on the active tab, **arrow keys** move between tabs, `Enter`/`Space` (or arrow-move on the segs) selects. `Home`/`End` jump to first/last (the existing `CutToggle` already does this; `TabStrip` mirrors it).
  - **Date picker:** native `<input type="date">` — keyboard-operable out of the box (type-ahead, arrow keys); disabled days are unfocusable.
  - **Sortable table headers:** the existing `dt-sort-button` is a real `<button>`; `Enter`/`Space` toggles sort; `aria-sort` reflects state.
  - **Retry:** real `<button>`, focusable, `role="alert"` container announces.
- **Charts → text/table equivalent:** `ChartFrame.tableFallback` is **mandatory** (FR-017/AC-019) — a `<table>` of date × channel × revenue, always in the DOM (SR-visible; also the phone primary view when the chart is unreadable).
- **All numeric figures:** `tabular` utility (`font-variant-numeric: tabular-nums` + `"tnum"`). Per DESIGN.md note 7, **DM Sans `tnum` is a no-op** in the `@fontsource` build → the **Inter-tabular fallback is engaged** for numeric cells/KPI values. The implementer must confirm `.tabular` resolves to Inter in this build.
- **Semantics:** `aria-current="page"` on active nav; `aria-current="true"` on the selected filter-in-place tile; `aria-label` on every icon-only control and section landmark; `<caption>`/`aria-label` on the table; `aria-busy` on loading regions; `aria-sort` on sortable headers.

---

## 6. Token usage

**No raw hex/px.** Every component names its tokens. Two **semantic-role additions** are proposed (flagged for owner sign-off — they add a *role*, not a hue).

### 6.1 Per-component token map (existing tokens)

| Component | Color | Type | Radius | Shadow |
|---|---|---|---|---|
| `KPITile` | `card`/`border`/`foreground`/`muted-foreground`/`primary` (selected ring) | page-title (value 23px/600), label, body (sub) | `rounded.md` | `shadow-rest` (+`shadow-hover` on hover/selected) |
| `ChartFrame` | `card`/`border`/`muted-foreground`/`foreground` | heading (title), `tabular` (freshness) | `rounded.lg` | `shadow-rest` |
| `DataTable` | `table-header-cell`/`table-body-cell`/`border`(+70)/`accent`(+60 hover)/`secondary`(+40 subtotal/footer)/`primary` (sort glyph)/mono (codes) | overline (header), body (cell), `tabular` (numeric) | — | `shadow-rest` (on the wrap card only, not rows) |
| `CutToggle` | `secondary`/`background`/`foreground`/`ring` | label | `rounded.sm` | `shadow-pressed` (on-pill) |
| `FreshnessLabel` | `muted-foreground` | body, `tabular` | — | — |
| `WindowSelector` | `secondary`/`background`/`input`/`muted-foreground`/`foreground`/`ring` | overline ("CUT"), `tabular` (dates) | `rounded.sm` | — (flat utility) |
| `TabStrip` | `brand-navy-text`/`brand-orange`/`muted-foreground`/`border`/`background`/`secondary` | label, body | — | — (flat, sticky) |
| `GlobalToolbar` | `border`/`overline` | overline | — | — (flat — Soft-Elevation Rule) |
| `BasisChip` | **`--basis-chip`** = `secondary`/`muted-foreground` (proposed role) | label | `rounded.full` | — |
| `DQBadge` | **`--dq-partial`** = `warning`/`warning-foreground`; **`--dq-good`** = `success`/`success-foreground`; unknown = `secondary`/`muted-foreground` (proposed mapping) | label | `rounded.full` | — |
| `WhatsComingStrip` | `card`/`border`/`muted-foreground`/`input` (dashed glyph) | display (value), label, body (note) | `rounded.md`/`rounded.xs` (glyph) | `shadow-rest` |

### 6.2 PROPOSED new token roles (flagged for owner sign-off — recorded as DESIGN.md additions)

These are **semantic-role aliases over existing tokens**, NOT new hues/fonts/radii. They document intent so future surfaces use the same mapping. (Mirrors how `--field-error-border`/`--field-error-text` were ratified in OD-P3-5.)

**1. `--basis-chip` (semantic role — neutral badge for COGS/GM basis labels)**
```css
/* index.css :root — alias, not a new value */
--basis-chip-bg: hsl(var(--secondary));
--basis-chip-text: hsl(var(--muted-foreground));
/* usage: a badge-status variant; height 20px, rounded.full, label type, no dot */
```
Rationale: every GM/COGS figure carries the same neutral basis qualifier (FR-008). Naming the role prevents a future surface from re-inventing a "label chip" with a different look. **Reuses `secondary`/`muted-foreground` — zero new hue.** This is the role the mockup's closing comment block proposes (Q4).

**2. `--dq-*` semantics (DQ → warning/success family mapping)**
```css
/* index.css :root — semantic mapping to existing status families */
--dq-partial-bg:    hsl(var(--warning) / 0.18);
--dq-partial-text:  hsl(var(--warning-foreground));
--dq-partial-dot:   hsl(var(--warning));
--dq-good-bg:       hsl(var(--success) / 0.14);
--dq-good-text:     hsl(var(--success-foreground));
--dq-good-dot:      hsl(var(--success));
--dq-unknown-bg:    hsl(var(--secondary));
--dq-unknown-text:  hsl(var(--muted-foreground));
```
Rationale: data-quality has exactly two meaningful states (partial / good) + unknown; both map cleanly onto the ratified `warning`/`success` status families (Tinted-Status Rule). Naming the mapping prevents DQ from drifting to a bespoke amber/green. **No new hue — `warning`/`success` already exist.** This is the second role the mockup proposes (Q4).

> **Both proposals preserve The One-Blue Rule** (no new action color), **the Structural-Navy Rule** (no new structural hue), and **the Orange-Sprinkle Rule** (no orange added). They are composition/state aliases only — exactly the kind of bounded addition my charter permits, flagged for owner sign-off. On approval, add a "Dashboard basis/DQ tokens (OD-DASH)" subsection to DESIGN.md §5.

### 6.3 Named rules honored

One-Blue · Tinted-Status · Single-Border · Soft-Elevation (rest shadow on tiles/chart/table/stub only — **not** on the toolbar, tab strip, or table rows) · No-Pure-Black-Shadow · Tabular-Numbers · Mono-For-Identifiers (branch codes) · Structural-Navy (logo, active-tab text) · Orange-Sprinkle (logo dot + active-tab underline = the single orange mark) · No-FAB (deputy = header icon) · Restrained-Gradient (none used here).

---

## 7. Implementation notes for ui-implementer

### 7.1 Build order (extend before new; data before UI)

1. **Data spine first (OD-DASH-3)** — verify staging margin rows (AC-027), merge `a3a2015`, wire alerting (AC-029), local wrapper (AC-030), doc fix (AC-031). The UI assumes rows exist.
2. **DAL + selectors** — broaden `reporting.ts`/`reporting-margin.ts` to window/cut params (not just `sinceDays`); add pure selectors in `sales-dashboard.ts` for the new KPI set (revenue tiles, GM tiles w/ basis, channel mix string, custom-window compare, cut aggregation, BOM-coverage → DQ). **Unit-test selectors first** (AC-005..007, AC-012..014, AC-024, empty/NULL-margin/prior-missing fixtures) — these are the load-bearing math.
3. **Routes** — rename `/mos/sales`→`/mos/dashboard` + redirect (AC-001); add `/mos/dashboard/detail` parameterized (AC-017); Home finance-tile relink.
4. **Extend primitives** — `KPITile` (onClick/selected/basis/dq), `DataTable` (subtotalRows + GM/COGS columns), `CutToggle` call-site (3 options).
5. **New primitives** — `WindowSelector`, `TabStrip`, `GlobalToolbar`, `BasisChip`, `DQBadge`, `WhatsComingStrip`.
6. **Composition** — `DashboardPage` wiring it all; `?tab=` URL persistence; filter-in-place `selectedTile`.
7. **States** — render loading/empty/error/DQ/NULL-margin/prior-missing (RTL tests AC-022..024).
8. **Token ratification** — add `--basis-chip` + `--dq-*` to `DESIGN.md` + `index.css` (owner sign-off pending; build can ship with the alias values inline, promoted to tokens on approval).

### 7.2 Extend vs new (quick map)

| Reuse as-is | Extend | New |
|---|---|---|
| `ChartFrame`, `FreshnessLabel`, `Pill`, `EmptyState`/`ErrorState`/`SkeletonRows` | `KPITile` (onClick/selected/basis/dq), `DataTable` (subtotalRows + GM columns), `CutToggle` (call-site → 3 options) | `WindowSelector`, `TabStrip`, `GlobalToolbar`, `BasisChip`, `DQBadge`, `WhatsComingStrip`, `DashboardPage` |

### 7.3 Test anchors (AC → lowest sufficient layer)

- **Unit (selectors):** AC-004, AC-005, AC-006, AC-007, AC-012, AC-013, AC-014, AC-024 (+ empty / NULL-margin / prior-missing).
- **Unit (route):** AC-001, AC-002, AC-003, AC-015, AC-017.
- **RTL (render):** AC-008, AC-009, AC-010, AC-011, AC-016, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023.
- **Playwright (visual):** AC-025 (390px — no overlap/no H-scroll), AC-026 (≥1280px — dense, `tabular`).
- **Integration:** AC-027 (staging margin rows), AC-030 (local snapshot wrapper).

### 7.4 Don't-do list (anti-slop, folded from the design discipline)

- No new brand/palette/font/radius/gradient. No purple, no glassmorphism, no shadow-soup. No bare "margin"/"COGS" anywhere (CONTEXT.md). No faked "What's coming" numbers. No fake 100% margin on a sync-gap day. No `0%`/`NaN` delta on a missing prior window. No spinners (skeletons only). No `Date.now()` window anchor. No per-tab Cut/Window duplication (one toolbar above both). No orange anywhere except the logo dot + active-tab underline.

---

## 8. Gaps & contradictions found (spec ↔ mockup ↔ current code)

These must be reconciled in the build. None blocks the signed-off Variant B shape; they are detail-level deltas the plan resolves.

- **G1 — Detail-table columns (mockup ⊂ spec).** The mockup's Detail-tab table shows 6 columns (date, branch, channel, revenue, txns, avg, as-of) and **omits** the spec-mandated share %, interim COGS, interim gross margin, and margin % columns (FR-019/AC-018 lists 7+). **Resolution (this plan §1.2):** build the full mandated column set; the mockup's 6 are a rendering shortcut, not a scope reduction.
- **G2 — Cut toggle arity (code ⊂ spec; mockup-mobile ⊂ spec).** The current page wires only 2 cuts (`CUT_OPTIONS = ['Branch','Activity']`, `DashboardCut = 'Branch'|'Activity'`); FR-012/OD-DASH-5 mandate **3** (Branch/Channel/Activity). The mockup's **mobile** summary frame also drops Activity (shows Branch/Channel only) — a mockup error. **Resolution (this plan §2.4):** widen `DashboardCut` to 3 and render all 3 on every breakpoint.
- **G3 — Margin read-model has no `channel` column (data ↔ cut).** `reporting.sales_margin_daily` is POS-only at branch grain (§7a amendment) — there is no channel dimension upstream. So when **cut = Channel or Activity**, interim COGS/GM **cannot be cut by channel**. **Resolution (this plan):** for non-Branch cuts, the GM/COGS table cells aggregate at branch grain (or render "interim unavailable" per non-POS channel) and the GM KPI tiles stay branch-aggregated with the basis footnote. Flag for the owner: channel-cut GM is a known POS-only limitation until the GL read-model lands (out of scope, OD-DASH-5).
- **G4 — `--basis-chip` + DQ-as-warning/success not yet in DESIGN.md.** Both are **proposed semantic roles** (§6.2), not yet ratified. **Resolution:** build ships with the alias values inline; promote to named tokens on owner sign-off (mockup Q4).
- **G5 — Mockup open-questions resolved by spec/decisions.** Q1 (tab default) → spec FR-015/AC-015 mandates `?tab=` persistence (Summary is the default on first load). Q3 (duplicate Cut/Window in Detail?) → OD-DASH-6 + this plan: **single toolbar above both tabs** (no duplication). Q2 (Detail count pill) → keep (cheap signal). Q4 → the two token proposals in §6.2.
