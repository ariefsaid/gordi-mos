# Design-plan — Sales dashboard (Issue 1, agent-native UI kit-birthing)

- Date: 2026-07-02
- Owner-authority: `DESIGN.md` (identity), `docs/specs/sales-dashboard.spec.md` (FR/AC),
  `docs/adr/0017-agent-native-user-composed-ui.md` §D5/D7/D11.
- Design-architect lens: this is the **kit-birthing** issue (ADR-0017 build-seq step 1→2). The
  primitives designed here are **general**, not sales-specific, so step 2 can extract them into the
  registry (D7) with a clean prop-shape + a **read-model data-contract** each hydrates.
- Route: `/mos/sales`, behind `RequireAccessRole anyOf={['finance','admin']}` (FR-001).
- **Identity rule:** every visual decision below names a `DESIGN.md` token — no raw hex/px for color,
  radius, shadow, type. The One-Blue Rule is preserved: **no rainbow deltas, no per-channel palette.**

---

## 0. Kit boundary — reusable primitive vs sales-specific composition

The point of the issue. Three general primitives are extracted; everything sales-flavoured is a
**composition** that feeds them a data-contract. The primitive never knows the word "revenue."

| Layer | Artifact | Reusable? | Why |
|---|---|---|---|
| Primitive | `KPITile` | **Yes** — general | label + value + optional delta + optional sub; DESIGN.md KPI-tile signature |
| Primitive | `ChartFrame` | **Yes** — general | titled/framed chart surface + freshness slot + a11y table-fallback slot; chart body injected |
| Primitive | `DataTable` / `DashGrid` (single-render 768px reflow + sort) | **Yes** — general | already the app's DataTable grammar; this issue formalises the sort + card-reflow prop-shape |
| Primitive | `FreshnessLabel` | **Yes** — general (D11) | "as of {ts}" chip; every reporting figure needs one — extract now |
| Primitive | `CutToggle` (segmented) | **Yes** — general | a labelled segmented control over an enum; reuse existing `seg` grammar |
| Composition | `SalesDashboardPage` | No — sales | wires selectors → primitives; owns Branch↔Activity mapping |
| Composition | `DailyRevenueChart` | No — sales | the specific recharts series (revenue by channel) rendered **inside** `ChartFrame` |
| Composition | `revenueColumns` / `activityMap` | No — sales | column defs + the POS→Cafe Ops / B2B→Roastery lookup fed to `DataTable` |

**Do NOT reinvent the app's table.** `KitchenToolbar`, `kitchen-table.css` (`.kt-*` dense grammar),
`qty-cell`, and the `useIsDesktop()` 768px single-render reflow are the established grammar. The sales
`DataTable` primitive should be a **generalisation of that same grammar** (right-aligned `tabular`
numeric cells, 50px dense rows, `--surface-secondary` hover, phone-card `<dl>` reflow), not a new one —
and ideally back-fills the kitchen tables later. Reuse the existing `Pill` primitive (`PillTone`
union: `neutral | primary | success | destructive | …`) as the **delta-chip** vehicle — no new chip.

---

## 1. Layout

### 1.1 Desktop (≥768px) — `PageFrame variant="data"`
Dense, scannable, above-the-fold (AC-011). Single 24px left gutter (PageFrame convention); no centered
prose. Stack, top→bottom:

1. **Page head** — `.page-head` with `page-title` "Sales" + a right-aligned **`FreshnessLabel`**
   ("as of {snapshot_as_of}", FR-003/AC-007). Flat (no wash — `variant="data"`, never the surface-wash).
2. **KPI row** — a 4-up `grid-template-columns: repeat(4, 1fr)` of `KPITile` (FR-005): trailing-7d
   revenue · trailing-30d revenue · latest reporting-day revenue · channel mix. 7d/30d tiles carry a
   delta chip (FR-006). Mirrors `.kks` desktop grid (gap `spacing.md`).
3. **`ChartFrame`** wrapping `DailyRevenueChart` (FR-007) — title "Daily revenue" + the `CutToggle`
   (Branch | Activity, FR-008) + branch/activity filter chips in the frame header; chart body below.
4. **`DataTable`** (FR-009) — sortable detail: dimension (branch or activity) · channel · revenue ·
   transactions · share-of-total · avg rev/txn. Full-bleed dense table; footer totals row.

Reporting window default = trailing selection anchored to **latest `revenue_date`** in the returned
rows (FR-004/AC-004), never `Date.now()`.

### 1.2 Phone (<768px) — `PageFrame variant="prose"`
Same metrics, stacked, floor-fast (FR-010, AC-010 — no horizontal scroll, no overlap):

1. Page head: `page-title` "Sales" with the `FreshnessLabel` wrapping under it (not beside).
2. KPI: `KPITile` reflows to a **2-up grid then 1-up** under ~380px (never a horizontal strip that
   scrolls). Tiles keep the full value + delta (do not degrade to the kitchen one-line phone summary —
   finance wants the numbers).
3. `CutToggle` + filter chips **above** the chart (FR-010 "chart controls above the chart").
4. `ChartFrame` chart shrinks to full container width; if the series is unreadable at phone width the
   frame exposes its **table-fallback** as the primary phone view (a11y + AC-010).
5. `DataTable` single-renders as **scan-friendly cards** (one card per row; first line = dimension +
   channel, `<dl>` label:value grid for revenue / txns / share / avg). 12px card radius + `shadow-rest`.

---

## 2. Primitive breakdown — THE KIT

Each primitive is given a **general prop-shape** and the **data-contract** it consumes, so D7 can
register it: a registry entry = `{ primitive, propSchema, readModelName, fieldBindings }`. Keeping the
prop-shape data-agnostic now is what makes the later DSL binding a config change, not a rewrite.

### 2.1 `KPITile` (general)
The DESIGN.md "KPI Tile (signature)" made reusable. Never says "revenue."

```
KPITileProps {
  label: string                 // "Trailing 7-day revenue"
  value: string                 // pre-formatted display string (IDR formatted by the composition)
  delta?: {                     // FR-006; omitted → no delta row
    text: string                // "+12.4% vs prev 7d"  |  "no comparison"
    tone: 'success' | 'destructive' | 'neutral'   // sign→tone map lives in the composition
    dot?: boolean
  }
  sub?: string                  // "4 branches" / "POS + B2B"
  state?: 'ready' | 'loading' | 'empty'
  help?: string                 // optional "?" tooltip text
}
```
- **Data-contract:** consumes **display-ready primitives** (strings + a tone enum). It does NOT know
  currency, math, or the source read-model — the selector/composition formats. This keeps it
  registry-generic (a future "avg order value" tile reuses it untouched).
- **Delta vehicle = existing `Pill`** (`tone` maps `success|destructive|neutral`). No new chip.
- **Reflow:** identical markup phone↔desktop; only the grid track count changes (parent grid concern,
  not the tile's). Value stays `page-title`-scale 23px/600 tabular at both widths.
- **States:** `loading` → skeleton (label bar + value bar via `Pill tone="skeleton"` grammar / muted
  block). `empty` → the tile is simply not rendered when the page is in the empty state (FR-011 owns
  the empty surface — a tile must **never show a misleading `0` / `NaN`**, AC-008).
- **Tokens:** surface `card` + `border` + `shadow-rest` + `radius-md` (matches `.kks-tile`); label
  `muted-foreground` 12.5px DM Sans; value `foreground` 23px/600 `.tabular`; sub `text-tertiary` 11px;
  delta via `Pill` tones.

### 2.2 `ChartFrame` (general) + `DailyRevenueChart` (sales composition)
`ChartFrame` is the **titled chart surface** — the reusable shell; the chart body is a child. This is
the D7-critical split: the frame is registry-generic, the recharts series is app code injected by name.

```
ChartFrameProps {
  title: string                 // "Daily revenue"
  freshness?: ReactNode         // <FreshnessLabel/> slot (D11)
  controls?: ReactNode          // CutToggle + filter chips
  children: ReactNode           // the chart body (DailyRevenueChart) — injected, frame-agnostic
  tableFallback: ReactNode      // MANDATORY a11y text/table equivalent (NFR "charts shall have table equivalents")
  state?: 'ready' | 'loading' | 'empty' | 'error'
  onRetry?: () => void          // error state
  ariaLabel: string
}
```
- **Data-contract:** the frame consumes **no data** — it frames whatever chart is passed and is handed
  a `tableFallback` node. The **`tableFallback` is not optional** (spec NFR-accessibility) — it is the
  screen-reader/no-JS equivalent and doubles as the phone primary view when the chart is unreadable.
- `DailyRevenueChart` (sales composition, inside the frame): recharts, **daily revenue by channel**
  (FR-007). Series themed per DESIGN.md implementer note 9 — **primary series in `primary` (POS)**, a
  **second channel in `violet` (B2B, categorical, non-interactive — allowed)**; axes/grid in
  `border`/`muted-foreground`. **No rainbow** — two channels, two restrained hues, both non-action.
- **Reflow:** desktop = full chart; phone = chart shrinks to container, or (if unreadable) the frame
  promotes `tableFallback` as the primary node. Controls slot renders **above** the chart on phone.
- **States:** `loading` → axis skeleton / muted block inside the frame. `empty` → "no data for this
  cut" inline (distinct from page-level FR-011). `error` → non-secret message + retry (FR-012, shares
  the page error affordance).
- **Tokens:** frame = `card` + `border` + `shadow-rest` + `radius-lg` (card-scale surface); title
  `heading` Plus Jakarta 20/600; series `primary` + `violet`; grid/axis `border` + `muted-foreground`;
  freshness slot uses `FreshnessLabel`.

### 2.3 `DataTable` / `DashGrid` (general — the sortable, reflowing table)
Generalises the app's dense-table grammar (`kitchen-table.css`) with a formal **sort + card-reflow**
prop-shape. Single-renders at 768px via `useIsDesktop()` (exactly one branch in the DOM — no
`aria-hidden` twins, per OD-W4-4).

```
DataTableProps<Row> {
  columns: Array<{
    key: string
    header: string              // Overline uppercase thead
    align?: 'left' | 'right'    // numeric → 'right' + tabular
    numeric?: boolean           // applies .tabular + right align + negative→--status-lost-text
    sortable?: boolean
    render?: (row: Row) => ReactNode
    cardLabel?: string          // <dl> label used in the phone card ('' → title line)
  }>
  rows: Row[]
  sort?: { key: string; dir: 'asc' | 'desc' }
  onSortChange?: (s) => void
  footer?: Row | ReactNode      // totals row (FR-009 share/total)
  isDesktop: boolean            // caller passes useIsDesktop() (single-render)
  state?: 'ready' | 'loading' | 'empty' | 'error'
  emptyLabel?: string           // FR-011
  onRetry?: () => void          // FR-012
  caption: string               // <caption>/aria — a11y table name
}
```
- **Data-contract:** rows are plain records + a column spec. The primitive is **domain-agnostic**;
  `revenueColumns` (sales composition) supplies the branch/activity/channel/revenue/txns/share/avg
  column defs and the IDR formatting inside `render`. A future ops table reuses `DataTable` with
  different columns.
- **Reflow (768px, single-render):** desktop = `<table>` (dense 50px rows, right-aligned `tabular`
  numeric cells, `--surface-secondary` hover, no vertical rules — the `.kt-*` grammar). Phone = one
  **card per row**: first column (`cardLabel: ''`) is the title line; remaining columns render as a
  `<dl>` label:value grid. Cards take `radius-lg` + `shadow-rest`; card affordances ≥44px tap target.
- **Sort:** sortable `thead th` gains `foreground` on hover + a 12px sort glyph (DESIGN.md DataTable),
  `aria-sort` on the active column, header is a `<button>` (keyboard-reachable, AC keyboard path).
- **States:** `loading` → 5–6 skeleton rows (shimmer via muted blocks). `empty` → `emptyLabel` centered
  muted row (`.kt-empty` grammar) — page-level FR-011 owns the full empty surface. `error` → non-secret
  message + retry.
- **Tokens:** thead `overline` 11px/600 uppercase `muted-foreground` on `card` + `border` bottom; body
  50px rows, `foreground`, divider `border/70%`; numeric `.tabular` right; negatives
  `--status-lost-text` (never base `destructive` — WCAG); hover `--surface-secondary/60%`; footer
  `secondary/40%` + 1.5px top border, `tabular`; card `card`+`border`+`shadow-rest`+`radius-lg`.

### 2.4 `FreshnessLabel` (general — D11 obligation)
A tiny reusable "as of {timestamp}" chip. **Extract it now** — D11 makes *every* reporting figure
carry one, so it should be a primitive from birth, not a sales one-off.

```
FreshnessLabelProps { asOf: string | Date; prefix?: string /* default "as of" */; }
```
- **Data-contract:** one timestamp. Renders `overline`/`label`-scale `muted-foreground` text +
  formatted local datetime. Placement: page head (right on desktop, wrapped on phone) **and** in the
  `ChartFrame` freshness slot (FR-003/AC-007). Tokens: `muted-foreground`, `label` 12/600 or `overline`
  11/600, `tabular` for the timestamp digits.

### 2.5 `CutToggle` (general — segmented control over an enum)
Branch ↔ Activity switch (FR-008). Reuses the existing `seg` segmented grammar (DESIGN.md Tabs /
Segmented) — `secondary` track, "on" = white `background` pill + `0 1px 2px` lift, `role="tablist"` /
`role="tab"` / `aria-selected`, roving tabindex. General over `{ options: string[]; value; onChange }`.
- Tokens: track `secondary`, on-pill `background` + `foreground` + pressed lift; `radius-sm` controls.

---

## 3. States (page-level)

| State | Trigger | Treatment | Tokens |
|---|---|---|---|
| **Loading** | query pending | KPI skeleton tiles + `ChartFrame` axis skeleton + `DataTable` skeleton rows; page head shows title, freshness pending | `muted` blocks, `Pill tone="skeleton"`, `shadow-rest` on tile shells |
| **Empty** (FR-011/AC-008) | query returns 0 rows | Full-surface empty state naming the source: "No sales snapshot rows are available yet from `reporting.sales_daily_revenue`." No KPI tiles rendered (no misleading `0`) | `card`+`border`+`radius-lg`; `muted-foreground` body; `heading` title |
| **Error** (FR-012/AC-009) | query fails / RLS-denied | Non-secret message: "Couldn't load sales reporting. Try again." + retry `button-outline`. **No** DSN / token / SQL / stack / PostgREST payload | `destructive` outline marker per §5 Inputs error pattern; error *text* `--status-lost-text` (AA); retry `button-outline` |
| **No comparison** (FR-006) | prior window absent | Delta chip shows neutral "no comparison" (`Pill tone="neutral"`), never `0%`/`NaN` | `Pill tone="neutral"` + `muted-foreground` |
| **Unmapped** (Activity view) | branch/channel outside the 2-activity map | Groups under `Unmapped`; Branch view stays source-faithful | `muted-foreground` label; no special hue |
| **Populated** | rows present | Full layout §1 | — |

Freshness label (FR-003) is present in **every non-error, non-loading** state (populated + the "as of"
is known even when a cut is empty).

---

## 4. Responsive + accessibility

### 4.1 Responsive
- **768px single-render reflow** (`useIsDesktop()`, `(min-width: 768px)` read synchronously at first
  paint — no flash of the wrong branch). Two independent breakpoints preserved: 920px rail-collapse
  (shell), 768px table→card + KPI grid reflow (this page). **No horizontal scroll at any width**
  (AC-010) — KPI grid wraps (4→2→1), table becomes cards, chart shrinks/promotes fallback.
- KPI grid: `repeat(4,1fr)` desktop → `repeat(2,1fr)` tablet (768–959, mirrors `.kks` media query) →
  `1fr` under ~380px.

### 4.2 WCAG-AA
- **Contrast (P3 palette):** body/labels use `muted-foreground` (clears AA on white). Deltas use
  `Pill` tones whose **darkened text variants** (`--status-won-text`, `--status-lost-text`) clear AA on
  their tints — never base `success`/`destructive` as small text. Negative table numbers use
  `--status-lost-text`, not base `destructive` (fails AA as small text). Chart series `primary` +
  `violet` are graphic, not text — but the `tableFallback` carries the AA-text equivalent.
- **Charts:** `tableFallback` is mandatory (NFR) — a `<table>` equivalent of the series, so the chart is
  never the sole information carrier (WCAG 1.1.1 / 1.4.1 — meaning not conveyed by color alone; POS/B2B
  distinguished by **label**, not just hue).
- **Focus order:** DOM order = page head → KPI tiles → CutToggle/filters → chart → table. Global
  `:focus-visible` ring (`2px ring`, 2px offset) on every focusable (`CutToggle` tabs, sortable
  headers, retry button, filter chips).
- **Keyboard paths:** `CutToggle` = roving tabindex tablist (arrow keys); sortable headers are
  `<button>` (Enter/Space toggles sort, `aria-sort`); retry is a real button; no mouse-only affordance.
- **Labels:** `ChartFrame ariaLabel`, `DataTable caption`, `FreshnessLabel` reads "as of {datetime}",
  KPI `label` is the accessible name of its value. Tap targets ≥44px on phone card affordances
  (`.touch-target`).
- **Tabular numbers:** all money / %/ counts / deltas use the `.tabular` utility (Inter-tabular scope
  per the ratified OD-P3-9 tnum fallback — DM Sans tnum is a no-op in its build).

---

## 5. Token map (per component)

| Component | Surface / radius / shadow | Type | Color / state |
|---|---|---|---|
| Page head | — (flat, `variant="data"` desktop) | `page-title` PJS 24/600 | title `foreground`; freshness `muted-foreground` |
| `KPITile` | `card` + `border` + `shadow-rest` + `radius-md` | label DM 12.5 `muted-foreground`; value 23/600 `.tabular`; sub `text-tertiary` 11 | delta via `Pill` (`success`/`destructive`/`neutral`); negative value → `destructive` |
| `ChartFrame` | `card` + `border` + `shadow-rest` + `radius-lg` | title `heading` PJS 20/600 | series `primary` (POS) + `violet` (B2B); grid/axis `border` + `muted-foreground` |
| `DataTable` (desktop) | `card`; thead `border`-bottom; rows divider `border/70%` | thead `overline` 11/600 uppercase; cells DM 13 | hover `--surface-secondary/60%`; numeric `.tabular` right; neg `--status-lost-text`; footer `secondary/40%` |
| `DataTable` (phone card) | `card` + `border` + `shadow-rest` + `radius-lg` | title DM 13.5/500; `<dl>` labels `muted-foreground` | values `.tabular` |
| `FreshnessLabel` | — (inline, flat) | `label`/`overline` `muted-foreground` | timestamp `.tabular` |
| `CutToggle` (`seg`) | track `secondary`; on-pill `background` + pressed lift; `radius-sm` | DM 13/600 | on `foreground`; off `muted-foreground` |
| Retry (error) | `button-outline`: `background` + `input` border + `radius-sm`, 32px | DM 13 | error text `--status-lost-text`; field/marker `destructive` |
| Filter chips | `control` chip: 32px, `input` border, `radius-sm`, chevron | DM 13 | `muted-foreground` label + `foreground` value |

### Delta sign / color (One-Blue-safe)
- Positive delta → `Pill tone="success"` (green, non-action). Negative → `Pill tone="destructive"`
  (red text = `--status-lost-text`, AA). Zero / no-prior → `Pill tone="neutral"`.
- **No blue delta** (blue is action-only). **No per-channel or per-branch color coding** in KPI/table —
  only the two chart series carry hue (`primary`/`violet`), both non-interactive. This respects the One
  Blue Rule (blue ≤10%, action only) and the no-rainbow constraint.

---

## 6. Freshness / format

- **Money:** IDR, `.tabular`, thousands-grouped, no decimals for whole-rupiah headline values
  (`Rp 12.4jt` style compact for KPI headline is a **composition** choice — flag Q3). Table cells show
  full grouped rupiah. Formatting lives in the composition (`formatIDR`), never in the primitive.
- **Reporting day (FR-004/AC-004):** current-period metrics anchor to `max(revenue_date)` in returned
  rows — never the browser date. Selectors (`sales-dashboard.ts`) own this; the UI displays whatever the
  selector returns.
- **Windows (FR-005/006):** trailing-7d and trailing-30d compare against the **immediately preceding
  equal-length window** (AC-005); absent prior → neutral "no comparison" (FR-006).
- **Freshness (FR-003/D11/AC-007):** `FreshnessLabel` shows `max(snapshot_as_of)` in the page head +
  the `ChartFrame` slot. Every reporting-derived figure is visibly tied to the snapshot.
- **Activity cut (FR-008, Resolved decision):** dashboard-layer lookup only — POS→**Cafe Ops** (GHQ /
  SKC / GGS / RRS drillable), B2B/GRI→**Roastery**, unknown→**Unmapped** (Activity view only). Branch is
  the default source-faithful cut. The reporting table is never mutated (source-faithful, FR-008).

---

## 7. Acceptance-list additions (fold into the eng-plan / QA)

- AC-008: empty state names the source, renders **no** KPI tiles (no misleading `0`).
- AC-009: error state contains no DSN/token/SQL/stack/PostgREST text (assert on rendered DOM).
- AC-010: at 375px width — no horizontal scroll, no text overlap; KPI/chart-controls/cards all visible.
- AC-011: at ≥1280px — KPI row + chart + table above/near fold; all numeric columns `.tabular`.
- AC-007: `FreshnessLabel` visible in populated render.
- A11y: chart `tableFallback` present in DOM; `CutToggle` arrow-key navigable; sortable headers
  Enter/Space + `aria-sort`; focus ring on every control.
- Anti-slop (taste): no gradient on any chart/tile/status; no centered-everything (left-gutter origin);
  realistic Gordi data in every mockup/story (GHQ/SKC/GGS/RRS + GRI, real IDR magnitudes); two chart
  hues only, both non-action; delta chips never blue.

---

## 8. New tokens proposed

**None required.** The dashboard is fully expressible in the adopted palette:
- Delta signs reuse `success` / `destructive` / `neutral` via the existing `Pill` tones + the
  AA-darkened `--status-*-text` variants — no new "up/down" hue.
- Chart series reuse `primary` (POS) + categorical `violet` (B2B) per implementer note 9 — DESIGN.md
  explicitly says *derive chart colors from the palette, do not invent new chart tokens*.
- Negative numbers reuse `--status-lost-text`.
- The Activity-cut labels (Cafe Ops / Roastery / Unmapped) are **text**, not colors — no token.

If, at build, a **third+ chart series** is ever needed (it is not for v1's 2 channels), that would be a
genuine gap (the palette has one categorical accent). **Do not add one for v1** — POS + B2B is two
series. Flag to owner only if the channel count grows.

---

## 9. Open questions for the Director / owner

1. **Q1 — Channel-mix KPI shape.** FR-005 lists "channel mix" as one of four KPI tiles. Is that a
   single tile showing a POS/B2B split string (e.g. "POS 82% · B2B 18%"), or a mini stacked bar? A
   plain string fits `KPITile` untouched; a bar means a `sub`-slot mini-viz. **Recommend: string split**
   (keeps `KPITile` general, no bespoke viz). Owner/Director to confirm.
2. **Q2 — Chart type.** FR-007 says "daily revenue chart grouped by channel." Grouped **bars** per day
   or **stacked area/line** by channel? Recommend **stacked bars by day, colored by channel** (two hues,
   reads at a glance, matches the dense/data-first posture). Confirm before build.
3. **Q3 — IDR headline compactness.** KPI headline values: full grouped rupiah (`Rp 1.284.500.000`) or
   compact (`Rp 1,28 M`)? Full is unambiguous but wide on phone; compact is scannable but lossy.
   Recommend **compact in KPI headline + full in table cells + full in tooltip**. Confirm.
4. **Q4 — Branch drilldown depth.** Activity=Cafe Ops is "drillable" to 4 POS branches (Resolved
   decision). For v1 is drilldown an in-table expand, or does the DataTable simply switch its dimension
   column between branch and activity based on `CutToggle`? Recommend **dimension-swap only for v1**
   (no nested expand) to keep `DataTable` general. Confirm.
5. **Q5 — Trailing-30d on phone.** FR-005 KPIs include 30-day; at 1-up phone width that's 4 stacked
   tiles + chart + cards — a long scroll. Acceptable, or collapse 7d/30d into one tile with a toggle on
   phone? Recommend **keep all four stacked** (finance wants the numbers; scroll is fine). Confirm.

No blocking DESIGN.md gap — the plan is fully token-expressible. Q1–Q5 are composition choices the
Director can resolve at spec sign-off; none require a new token or a new identity decision.
