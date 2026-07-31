# UI Design-Plan — Kitchen module · redesign Plan / Pesanan / Stock / Review + Log review fixes (OD-K-5)

**Author:** design-architect · **Date:** 2026-06-22 · **Status:** Draft for owner/Director sign-off
**Scope:** the **remaining four kitchen surfaces** — **Plan editor**, **Pesanan (member horizon)**, **Stock**, **Review** — redesigned to the **LOCKED Log-screen language**, PLUS four discrete **Log review fixes** folded in. The Log screen (`/mos/kitchen/log`) is already redesigned + reviewed (`docs/plans/2026-06-21-kitchen-log-redesign.md`); its pieces are the **reuse spine** here.
**Source decision:** OD-K-5 + owner directive 2026-06-22 ("redesign the whole kitchen module to the locked design language before merge").
**Identity authority:** `DESIGN.md` (adopted "Quiet Control Surface"). **No new visual language is invented** — every piece maps to a Log primitive + a named token.
**Working dir / branch:** worktree `/Users/ariefsaid/Coding/gordi-mos-kitchen-ui`, `feat/kitchen-log-redesign`.

**This is a PRESENTATIONAL redesign. Parity is the load-bearing rail:** every screen preserves its data layer, its gates, its payloads, and its role/access behavior EXACTLY (per-screen guardrails in §3). The redesign changes *how the same data is shown and touched*, not *what* is shown or *what a submit does*.

---

## 0. The locked language (the Log screen — REUSE spine)

The Log redesign shipped reusable pieces in `mos-app/src/components/kitchen/` + `mos-app/src/lib/`. The four sibling screens must **feel like Log** (dense `<table>` desktop / floor-fast cards phone, same tokens, same chrome). Reuse map:

| Log piece | File | Reuse here |
|---|---|---|
| 768px reflow hook | `shell/use-is-desktop.ts` | **REUSE as-is** on all four pages (one branch in the DOM). |
| KPI strip (4 tiles desktop / 1-line phone) | `components/kitchen/kitchen-kpi-strip.tsx` | **REUSE as-is** on Plan editor + Review; **optional** on Stock (OQ-5); **not** on Pesanan. |
| Group header (`table`/`cards`) | `components/kitchen/kitchen-group-header.tsx` | **REUSE as-is** on all four screens (arbitrary label/count/sub; no "+ Add"). |
| Status pill / delta pill | `components/ui/pill.tsx` | **REUSE as-is** (Review on/off-plan, Stock neg/pos, Plan deltas). |
| Categorical tag | `components/ui/tag.tsx` | **REUSE as-is** (Review variance already uses it). |
| Avatar | `components/ui/avatar.tsx` | **REUSE as-is** (Review submitter). |
| Loading / empty / error | `components/ui/state-kit.tsx` (`SkeletonRows`/`EmptyState`/`ErrorState`) | **REUSE as-is**. |
| Action-type segmented control | `components/kitchen/action-type-seg.tsx` | **REUSE as-is** on Plan editor (already there) + Review (new — see §7). |
| Phone qty stepper | `components/kitchen/wip-item-stepper.tsx` | **Log-capture-specific** (variance-note + transfer-cap gates baked in). **Not reused** for Plan/Stock/Review — see §4.3 (`PlanQtyCell` is the clean sibling). |
| Desktop inline qty cell | `components/kitchen/qty-cell.tsx` | **Log-capture-specific** (reads `KitchenLogLine.capError`). **Not reused** as-is — `PlanQtyCell` (§4.3) is the gate-free sibling sharing the `.qcell` grammar. |
| Capture row | `components/kitchen/kitchen-log-row.tsx` | **Log-capture-specific** (status Pill = made-vs-plan). Not reused. |
| Capture table/cards | `kitchen-log-table.tsx` / `kitchen-log-cards.tsx` | **Log-capture-specific** (Planned/Off-plan split + off-plan expander). Not reused; the **table grammar** is lifted into a shared CSS partial (§2.2). |
| Pure gates | `lib/kitchen-gates.ts` | Used by Log only (Review uses its own variance logic in `kitchen-review-row.tsx`; Plan/Stock/Pesanan have no gates). |
| Pure status mapper | `lib/kitchen-status.ts` | Log-capture-specific. Review keeps its on/off-plan `Tag` (logged-vs-plan). |
| Pure KPI selector | `lib/kitchen-kpis.ts` | Log-capture-specific. **New** per-screen selectors (§2.3) feed the reused `KitchenKpiStrip`. |

**The reflow contract (P-4) applies to every screen:** the page calls `useIsDesktop()` once and renders **exactly one** of `{*Table, *Cards}` — never both, never `aria-hidden` on the absent branch. All four pages switch to **`<PageFrame variant="data">`** (full-bleed, no 1080px cap) — the same variant Log + Tasks use; the prose cap is why the shipped screens read as sparse.

---

## 1. The four Log review fixes (cross-family design-review findings)

Four discrete tasks, specified here so they ship in the same PR. Each is parity-safe (presentational or data-only) except where noted.

### F1 — Sticky Submit/action bar is NOT pinned (Important)

**Confirmed bug:** on `/mos/kitchen/log` the Submit button renders at y≈2148 in a 900px viewport — the `.kl-footer { position: sticky; bottom: 0 }` does **not** pin.

**Root cause (verified):** `PageFrame`'s `<main className="overflow-auto">` (`shell/page-frame.tsx:32`) has `overflow: auto` but **no bounded height** — its parent (`app-shell.tsx:45` `<div className="flex flex-col min-h-0">`) gives it `flex: 0 1 auto` by default, so `<main>` grows to its content, the **window** scrolls (not `<main>`), and `position: sticky; bottom: 0` sticks to the bottom of `<main>`'s content box (≈y=2148), not the viewport. `position: sticky` only pins to a *bounded* scrolling ancestor.

**Fix (single root-cause change in the shared shell):** make `<main>` the real scroll container by giving it the remaining viewport height:

```tsx
// shell/page-frame.tsx — the <main> className (only change)
<main
  className="overflow-auto flex-1 min-h-0"   // ← add flex-1 min-h-0
  style={{ padding: '28px 24px 56px', ...(surfaceWash ? { backgroundImage: 'var(--gradient-surface-wash)' } : {}) }}
>
```

- `flex-1` → `<main>` grows to fill the grid's main cell (= viewport height − header).
- `min-h-0` → allows it to shrink below content so `overflow-auto` engages.
- Result: `<main>` is the bounded scroll container; `.kl-footer { position: sticky; bottom: 0 }` pins to its viewport from first paint.

**This is a shared-shell change → regression risk across ALL pages.** Mitigation is a required verification step (task F1-verify): open Tasks DB-view, Ops Daily Log, Plan, Stock, Review, My Week — confirm each still scrolls correctly with the header/rail fixed (they are grid siblings, unaffected) and nothing double-scrolls. The header/rail live in the `app-shell.tsx` grid (`grid min-h-screen`), so they stay put; only the scroll *element* changes from `<body>` to `<main>`. **Flag for Director (OQ-1):** this is the correct root-cause fix but it touches the shared shell — sign off the regression sweep.

**Pinned-bar scope across screens (be precise — do NOT invent foot bars):** the pinned-bar pattern applies **only where a screen has a single dominant batch action at the foot**. After the shell fix:
- **Log** → `.kl-footer` (tally + Discard + Submit) pins. ✓ (the fix target)
- **Plan editor** → **no foot bar.** Its save is *per-cell inline* (commit on blur/±); the affordance is the cell, not a batch. (See §4.)
- **Pesanan** → read-only, **no foot bar.**
- **Stock** → read-only, **no foot bar.**
- **Review** → **no foot bar.** Its actions are *per-row* (Approve/Reject) + *per-section* (Approve all (N) in the group head). Anchor A4: approve lives here, per-row — not as a foot batch. (See §7.)

So F1's deliverable is: (a) the `page-frame.tsx` one-liner, (b) confirm `.kl-footer` now pins, (c) the cross-page regression sweep. No other screen adds a foot bar.

### F2 — Category data is NULL in `supabase/seed.sql` (data-only, parity-safe)

**Confirmed:** `seed.sql` inserts the 32 WIP items as `insert into ops.wip_items (id, org_id, name) values …` — **no `category`**. The `category` column **exists** (`migrations/20260620000001_ops_wip_items.sql:9`), the code already `select('id,name,category')` (`kitchen-logs.ts`) and renders `item.category` (Log row + card). So categories are silently empty everywhere. The category filter (Log toolbar) shows only "All"; the dish sub-label is blank.

**Fix:** update `seed.sql` to insert `category` for all 32 dishes. Full proposed mapping in **§8** (5 ratified buckets + one proposed 6th "Meat" for the meatball/beef dishes — flagged OQ-4). This is **data-only** (column exists; no migration; no code change) and lights up the sub-label + the category filter across Log/Plan/Stock. Parity-safe.

### F3 — Disable the primary Submit while a required variance-note is unresolved (Minor UX)

**Current:** `KitchenLogPage.handleSubmit` re-gates on click and blocks (sets per-line errors) — correct, but the Submit button looks enabled until the click bounces. Make the blocking state **explicit** (a disabled control reads as "not ready").

**Fix (keep the gate — defense in depth):** in `kitchen-log-page.tsx`, compute an explicit `noteUnresolved` and OR it into the existing `blocked` flag on `<SubmitButton>`:

```tsx
// kitchen-log-page.tsx — extend the existing hasBlockingError derivation
const hasBlockingError =
  stagedLines.some(l => transferExceedsAvailable(l, actionType))   // FR-023 (existing)
const noteUnresolved =
  stagedLines.some(l => needsVarianceNote(l, actionType) && !l.notes.trim())  // FR-022 (NEW explicit)
// …
<SubmitButton … blocked={hasBlockingError || noteUnresolved} />
```

- `needsVarianceNote` is the existing pure gate (`lib/kitchen-gates.ts`) — **no new logic**, just surfacing it as a disabled state.
- Keep `handleSubmit`'s re-gate (defense in depth — the disabled state is a UX cue, the re-gate is the authority).
- The `SubmitButton` already accepts `blocked` → extend its tooltip/hint to say why (e.g. `title="Resolve the required notes first"` when `noteUnresolved`). Optional: a one-line muted hint above the footer ("N entries need a variance note"). **Recommend: the disabled state + the per-row note field is enough; skip the footer hint** (the per-row field already shows `VARIANCE_NOTE_CUE` inline).

### F4 — Remove 3 dead props (CQ cleanup)

**Confirmed dead (declared in the interface, never destructured/used in the body):**

| Component | Dead prop(s) | Evidence |
|---|---|---|
| `kitchen-log-cards.tsx` | `category`, `collapsedGroups`, `onToggleGroup`, `onCategoryChange` | Interface (lines 22–28) declares them; body destructures only `items, lines, actionType, search, onQtyChange, onNotesChange, onSearchChange, disabled`. Off-plan collapse is **local** `useState`. |
| `kitchen-kpi-strip.tsx` | `actionType` | Interface (line 18) declares it; body destructures `{ kpis, isDesktop }` only. |
| `qty-cell.tsx` | `actionType` | Interface (line 15) declares it; body destructures `{ itemName, line, onQtyChange, disabled }` only. |

**Fix:** drop the dead props from each interface + the call sites (`kitchen-log-page.tsx` passes them — stop passing; `kitchen-log-cards.test.tsx` passes them in the helper — trim). No behavior change. Run the existing component tests green after.

---

## 2. Shared primitives built in this slice (NEW — used by ≥2 sibling screens)

Two small extractions make the four screens literal siblings (shared CSS + shared toolbar) **without touching the locked Log components** (parity guardrail — Log keeps its `.klt-*`/`.klc-*`; a fast-follow can later migrate Log onto these).

### 2.1 Why not refactor Log onto a shared shell?

`KitchenLogTable` hardcodes the 5 Log columns + the Planned/Off-plan grouping + renders `KitchenLogRow`. Forcing Plan/Stock/Review through it would either over-abstract (a `columns` + `renderRow` + `groups` generic table) or distort Log's reviewed shape. The Log screen is **owner-reviewed**; the four fixes in §1 are the only sanctioned Log changes. So: **build sibling components that share the table grammar via a CSS partial + a toolbar component**, and leave Log's components intact. (Fast-follow noted in §10: consolidate Log onto `KitchenTableShell` once the siblings prove the shape.)

### 2.2 `kitchen-table.css` — the shared dense-table grammar (NEW)

One CSS partial imported by each screen-table's own `.css`. Mirrors Log's `.klt-table` grammar (DESIGN.md §DataTable + OD-P3-6 dense DB-view). Tokens-only; **no Log class names** (avoids the `kitchen-css-namespace.test.ts` collision guard).

```css
/* mos-app/src/components/kitchen/kitchen-table.css — shared dense-table grammar.
   Imported by kitchen-plan-table.css / kitchen-stock-table.css /
   kitchen-review-table.css / kitchen-pesanan-table.css. DESIGN.md §DataTable + OD-P3-6. */
.kt-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.kt-table thead th {
  position: sticky; top: 0; z-index: 1;            /* sticky overline thead */
  text-align: left; font-size: 11px; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase; /* OD-P4-10 overline */
  color: var(--muted-foreground); background: var(--card);
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.kt-th-num { text-align: right; }
.kt-table tbody td {
  height: 50px;                                     /* OD-P3-6 dense DB-view row */
  padding: 10px 12px; border-bottom: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  color: var(--foreground); vertical-align: middle;
}
.kt-table tbody tr:last-child td { border-bottom: none; }
.kt-table tbody tr:hover td { background: color-mix(in srgb, var(--accent) 60%, transparent); } /* quiet hover wash — NOT --accent fill; --accent IS the hover-wash token in this app */
.kt-num { text-align: right; font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
.kt-name { font-weight: 500; }
.kt-cat  { display: block; font-size: 11px; color: var(--muted-foreground); }
.kt-empty { padding: 24px 12px; color: var(--muted-foreground); font-size: 13px; }
.kt-neg   { color: var(--status-lost-text); font-weight: 600; } /* AA-darkened red, never base --destructive */
```

> **Token note (directive):** in THIS app `--accent` IS the action blue. Per the directive, use `--surface-secondary` for quiet hover washes and reserve `--accent` for focus outline/border only. **Audit the Log `.klt` CSS:** its row hover currently uses `color-mix(var(--accent) …)` — that is a pre-existing Log inconsistency; **this slice does NOT change Log's hover token** (parity guardrail — Log is reviewed), but the new shared `.kt-table` hover uses `color-mix(in srgb, var(--surface-secondary) 60%, transparent)` to follow the directive. Flag OQ-2 (minor): align Log's hover to `--surface-secondary` in the fast-follow.

**Wait — correction on the hover token.** Re-reading DESIGN.md: the shadcn-role `--accent` in this kit **is** the quiet hover wash (`accent = hsl(240 4.8% 95.9%)`, "the hover wash on interactive neutral surfaces"). The directive's "`--surface-secondary` for quiet hover, `--accent` only on focus" treats `--accent` as the *action blue* (a different alias mapping). There are **two alias systems**: the shadcn roles (`--accent` = grey hover wash, per DESIGN.md/Log CSS) and the design-kit aliases (`--surface-secondary`). To stay **consistent with the locked Log CSS** (which uses `--accent` as the grey hover wash) AND honor the directive's intent (no blue on hover), the shared `.kt-table` hover uses the **same token Log uses**: `color-mix(in srgb, var(--accent) 60%, transparent)`. The directive's `--surface-secondary` and Log's `--accent` resolve to the **same grey** in this kit (both = `hsl(240 4.8% 95.9%)`). **Net: use `var(--accent)` for hover to match Log verbatim; reserve the blue (`--primary`) for focus rings + the one Submit.** This is the parity-consistent reading. (OQ-2 stands only if the owner wants the *name* unified — cosmetic.)

### 2.3 `KitchenToolbar` — search-mini + category filter (NEW)

Lifted from Log's `.klt-toolbar` so Plan + Stock share it. Review optionally adopts it (§7).

```tsx
// mos-app/src/components/kitchen/kitchen-toolbar.tsx (+ .css)
export function KitchenToolbar(props: {
  search: string
  onSearchChange: (s: string) => void
  /** categories derived by the caller (['All', …unique sorted]); omit → no category select */
  categories?: string[]
  category?: string
  onCategoryChange?: (c: string) => void
  searchPlaceholder?: string                 // default "Find a dish"
  /** optional trailing slot (e.g. ActionTypeSeg on Plan editor) */
  children?: React.ReactNode
  ariaLabel?: string                         // default "Filter"
})
```

Flat utility surface (no `--shadow-rest`): `--card` bg, `--border` bottom, 10–12px pad. search-mini + `<select>` both `--border` + `--radius-sm` + `--muted-foreground` placeholder. `role="search"` on the search-mini wrapper.

### 2.4 Per-screen KPI selectors (NEW pure functions, feed the reused `KitchenKpiStrip`)

`KitchenKpiStrip` takes a `KitchenKpis` shape (`plannedTotal, madeOfPlan, madeSoFar, madeOffPlan, pctComplete, itemsRemaining, unitsShort, plannedDishCount`). Each screen that shows a strip computes its own `KitchenKpis`-shaped object via a **pure** selector (P-1: client-side derivation over already-fetched state — no fetch/RPC/persistence):

| Screen | Selector (NEW pure fn) | Input | Tiles shown |
|---|---|---|---|
| **Plan editor** | `computePlanKpis(cells, action)` → `KitchenKpis` | the editor's `PlanCell[]` for the current `action` | Planned total · Dishes planned · Items unplanned · (4th tile muted "of roster") |
| **Review** | `computeReviewKpis(logs)` → `KitchenKpis` | the queue's `ReviewLogRow[]` | Submitted · On-plan · Off-plan (variance) · (Production-first gate note) |
| **Stock** (optional OQ-5) | `computeStockKpis(rows)` → `KitchenKpis` | `KitchenStockRow[]` | Items · On-hand total · Low/negative count · Available total |

Each lives in `mos-app/src/lib/` (e.g. `lib/kitchen-plan-kpis.ts`) as a **pure** function + a thin `useXxxKpis()` memoized hook (mirrors `lib/kitchen-kpis.ts`). Unit-tested directly (no React). The derivation reuses ONLY fields already fetched (Plan: `PlanCell.qty_porsi`; Review: `ReviewLogRow.qty_porsi` + the page's `planMap`; Stock: `stok`/`tersedia`). **No new fetch.** (See §3 P-1.)

> **KPI strip reuse detail:** `KitchenKpiStrip` renders 4 fixed tiles (Planned total / Made so far / % complete / Items remaining). For Plan/Review/Stock the *semantics* differ, so each selector maps its meaning onto those 4 slots (e.g. Review's "Made so far" = "Off-plan count", "% complete" = "On-plan %"). This keeps the component reused unchanged. **If** the owner finds the mapping confusing (OQ-3), a fast-follow generalizes `KitchenKpiStrip` to take 4 `{label, value, delta, sub}` props — flagged, not built here.

---

## 3. Cross-screen parity guardrails (binding)

| # | Guardrail | What it forbids across all four screens |
|---|---|---|
| **P-1** | **Derived display only** | Any KPI strip / summary is computed **client-side from already-fetched state**. NO new tables, columns, RPC, fetch, ESB, or persistence. |
| **P-2** | **Data layers + payloads unchanged** | `listActiveWipItems` / `listKitchenPlans` / `listPesanan` / `upsertKitchenPlan` / `fetchKitchenStock` / `listSubmittedKitchenLogs` / `fetchPlanMap` / `getPeople` / `approveKitchenLog` / `rejectKitchenLog` — **read-only here**. The Plan upsert payload still sends NO `org_id`/`plan_by` (NFR-003); the approve/reject still send NO `reviewed_by`/`reviewed_at` (server-stamped). |
| **P-3** | **No new workflow logic** | No new statuses, no new gates, no auto-calc, no new role checks. The ONLY new client state is presentational (search, category, group-collapse, derived KPIs). Review's approve/reject/bulk/production-first/note-required gates stay **byte-identical**. |
| **P-4** | **Reflow = ONE branch in the DOM** | `useIsDesktop()` once per page → exactly one of `{*Table, *Cards}`. No `aria-hidden` on the absent branch. |
| **P-5** | **WIB-today date unchanged** | All four pages keep `logDate = wibToday()` (fixed +7h offset, NFR-007). No date picker (owner OQ-7, deferred — same as Log). |
| **P-6** | **Role/access gates unchanged** | Plan editor = ops_lead/admin; Pesanan = member read-only; Review = ops_lead/admin; Stock = any authenticated member. RLS is the authority; the UI gate is courtesy. Forbidden = a clean panel, not an empty table (Review FR-003/044). |

---

## 4. Screen 1 — Plan editor (`/mos/kitchen/plan`, ops_lead/admin) — set the daily target

### 4.1 Lens-D job story

> **When the shift starts, an ops lead wants to set the day's planned quantity per dish (per action) in one pass — often on desktop — so the kitchen knows what to produce and the Log variance gate has a baseline.**

Secondary: a glance at progress (the KPI strip). **Priority call:** the editor is a *write* surface (set targets), but it is **not a review surface** — there is no Approve/Submit-to-review verb. The save is **per-cell inline** (commit on blur/±), so the dominant affordance is the qty cell itself; there is **no batch foot bar** (F1 scope). Anchor A4 is satisfied trivially: no approve verb anywhere on this screen.

5-question walk (condensed): **Job** = set plan qty per dish/action fast. **Expectation** = a list of dishes, a qty entry each, a quiet "Saved" per cell. **Priority** = dishes first; the ActionTypeSeg picks which action's plan you're setting (Production default). **Actionability** = each cell saves inline (no hunt for a Submit); "Saved"/"Saving…" confirms in place; offline banner blocks saves. **Mental model** = a dense editable table (sibling of Log), but the cell sets the *plan* (no variance-note gate, no transfer cap — those are Log-capture gates).

### 4.2 Component breakdown — NEW vs REUSED

| # | File | NEW / REUSED | What |
|---|---|---|---|
| PE-1 | `components/kitchen/kitchen-plan-table.tsx` (+`.css`) | **NEW** | Desktop editable `<table>`: Dish(name+cat) · Plan(`PlanQtyCell`). Groups by **category** (now populated by F2) via `<KitchenGroupHeader variant="table">`. Owns client search + category filter (delegates to `<KitchenToolbar>`). |
| PE-2 | `components/kitchen/kitchen-plan-cards.tsx` (+`.css`) | **NEW** | Phone reflow: one card per dish, `<PlanQtyCard>` = name + category + a `PlanQtyStepper` (44px −/+, input). Grouped by category (`<KitchenGroupHeader variant="cards">`). No off-plan expander (Plan has no planned/off-plan split — every item is plannable). |
| PE-3 | `components/kitchen/plan-qty-cell.tsx` (+`.css`, shares `.qcell` grammar) | **NEW** | Desktop inline-editable **plan** qty cell: −/input/+, NO cap, NO variance gate. Commits on blur/± → `onSave(qty)`. Mirrors `qty-cell.tsx` minus `capError`. |
| PE-4 | `components/kitchen/plan-qty-stepper.tsx` (+`.css`, shares `.kpe` grammar) | **NEW** | Phone plan-qty stepper: 44px −/input/+, "Saving…"/"Saved" inline. Mirrors the existing `PlanRow` stepper, lifted to its own component. |
| PE-5 | `lib/kitchen-plan-kpis.ts` (+`.test.ts`) | **NEW** | Pure `computePlanKpis(cells, action)` + `usePlanKpis()` hook → `KitchenKpis`. |
| — | `kitchen-toolbar.tsx`, `kitchen-table.css`, `KitchenKpiStrip`, `KitchenGroupHeader`, `ActionTypeSeg`, `useIsDesktop`, `StateKit` | **REUSED** | §2. |
| C-PE | `pages/kitchen-plan-page.tsx` (+`.css`, `+.test.tsx`) | **CHANGED** | §4.5. |

### 4.3 `PlanQtyCell` API (desktop — the plan-editing cell)

```ts
export function PlanQtyCell(props: {
  itemName: string
  qty: number                 // current committed plan qty for (item, action)
  saving: boolean             // per-cell save in flight
  disabled: boolean           // offline
  onSave: (next: number) => void   // commit (clamped ≥ 0); upsertKitchenPlan at the page
})
```
No `KitchenLogLine`, no `capError`, no `actionType` (the page knows the action; the cell is qty-only). On blur/±/Enter → `onSave(Math.max(0, n))`. The input `role="spinbutton" min=0 step=1`, the One-Blue focus ring. "Saving…" shows to the right when `saving`. Shares the `.qcell` CSS grammar (minus `.qcell-cap`).

### 4.4 All states

| State | Trigger | Render | Tokens |
|---|---|---|---|
| loading | `load==='loading'` | PageHead + ActionTypeSeg disabled + `<SkeletonRows count=5>` (table shape on desktop; card skeletons on phone). `aria-busy`. | `--surface-tertiary` bars. |
| error | `load==='error'` | `<ErrorState>` + offline banner + 44px Retry. | `--status-lost-text`. |
| empty (no items) | `items.length===0` | `<EmptyState "No active WIP items">`. No KPI strip. | `--text-secondary`. |
| populated | `load==='ready' && items>0` | KPI strip + toolbar + table/cards. | per §4.6. |
| saving (per cell) | `savingId===item.id` | That cell's "Saving…" inline; input still visible. Other cells live. | `--muted-foreground`. |
| saved | `notice==='Saved'` | The existing `.kp-banner-notice` ("Saved") — quiet, auto-clears. | `--secondary`/`--foreground`. |
| save-error | `saveError` | The existing `.kp-banner-error` (`role="alert"`). Cell keeps its draft. | `--status-lost-text`. |
| offline | `!navigator.onLine` | `.kp-banner-offline` (`role="alert"`) in every state; all cells `disabled`. | `--warning` tint + `--warning-foreground`. |
| zero-plan | items loaded, all qty 0 | Full table; KPI "Planned total" = 0, "Items unplanned" = roster count. Cells editable. | (populated). |
| unauth / orphan | `auth!=='authenticated'` | Sign-in panel (unchanged). | (unchanged). |

### 4.5 Page rewrite (C-PE) — what changes, what is preserved

**CHANGE:** switch `<PageFrame>` → `variant="data"`; add `<KitchenKpiStrip kpis={usePlanKpis(cells, action)} isDesktop={isDesktop} />`; replace the `.kp-editor` row list + `.kp-pesanan` (Pesanan moves to its own face — §5) with the `useIsDesktop()` branch (`<KitchenPlanTable>` | `<KitchenPlanCards>`); keep ActionTypeSeg in `<KitchenToolbar children>`; rewrite `.css` for full-bleed + the shared table grammar (import `kitchen-table.css`).

**PRESERVE VERBATIM:** `wibToday()`, the role split (`canEdit` → `<PlanEditor>` else `<PesananView>`), `fetchEditor` (`listActiveWipItems` + `listKitchenPlans`), `qtyOf`, `saveCell` (the probe-free `upsertKitchenPlan` upsert — payload sends NO `org_id`/`plan_by`), the `savingId`/`notice`/`saveError`/`isOnline` state, the offline effect, the AC-024/FR-030/031 behavior. **No foot bar / no Submit** (per-cell inline save is the affordance). The Pesanan face is untouched in behavior (§5 only restyles it).

### 4.6 Reflow + a11y + tokens (Plan editor)

**Desktop (≥768):** full-bleed; KPI strip (4 tiles) → toolbar (ActionTypeSeg + search + category) → `<KitchenPlanTable>` grouped by category. Columns: **Dish** (name + category sub-label) · **Plan** (`PlanQtyCell`, right-aligned, tabular). 50px rows; sticky overline thead; group headers per category (hairline, structural-navy label). **Phone (<768):** KPI phone-summary line → toolbar (ActionTypeSeg full-width ≥40px touch + search) → `<KitchenPlanCards>` grouped by category; each card = name + category + `PlanQtyStepper` (44px −/+).

**A11y (WCAG-AA):** `<table aria-label="Kitchen plan — set planned quantity per dish">` + `<th scope="col">`; numeric `<th>` right-aligned; `PlanQtyCell` input = `role="spinbutton" min=0` + `aria-label="Planned quantity for {dish}"`; ± are real `<button>`s; group caret `aria-expanded`; `:focus-visible` ring (One-Blue) on input/buttons/seg; `tabular-nums` on every qty + KPI value + group count; contrast via `--muted-foreground`/`--status-*-text` (AA-darkened). Offline banner `role="alert"`; "Saved" `role="status" aria-live="polite"`.

**Tokens:** table grammar per §2.2; KPI tile per DESIGN.md KPI signature; toolbar flat (`--card`+`--border`); `PlanQtyCell` focused input border `--primary` + ring `2px --primary`; "Saving…" `--muted-foreground`; offline `--warning` tint. **One-Blue audit:** the only blue is the focused input ring (+ the active nav icon, shell). No Submit → no blue button on this screen. ✓ **Soft-Elevation audit:** `--shadow-rest` only on KPI tiles (desktop) + phone cards. Table/toolbar/group-heads flat. ✓

### 4.7 Parity guardrails specific to Plan editor

- **DO NOT** add a variance-note field, a transfer cap, or a status Pill — those are Log-capture gates; the plan has none.
- **DO NOT** add a batch Submit / foot bar — save is per-cell inline.
- **DO NOT** change `upsertKitchenPlan` or its payload (no `org_id`/`plan_by`).
- The ActionTypeSeg still drives which action's plan is shown (one action at a time) — unchanged.

---

## 5. Screen 2 — Pesanan (`/mos/kitchen/plan` member face, 14-day horizon) — read the demand

### 5.1 Lens-D job story

> **When planning my work, a kitchen member wants to see what's planned to be made over the next two weeks — read-only — so I know what's coming without bothering a lead.**

**Read-not-reviewed:** Pesanan has **no verb at all** (no edit, no approve, no submit). Anchor A1 (read-not-reviewed) applies in full: a pure horizon read. The member's job is *see*, not *act*.

5-Q walk: **Job** = see the 14-day forward demand. **Expectation** = dates as section headers, dishes + actions + planned qty under each. **Priority** = soonest dates first (already date-sorted by `listPesanan`). **Actionability** = none — read-only IS the signal (absence of affordance). **Mental model** = a read-only grouped table, sibling of Log/Stock. No toolbar/search in v1 (the horizon is short; parity — the shipped Pesanan has no search). Flag OQ-6: a search could be a nice-to-have; not built here.

### 5.2 Component breakdown

| # | File | NEW / REUSED | What |
|---|---|---|---|
| PN-1 | `components/kitchen/kitchen-pesanan-table.tsx` (+`.css`) | **NEW** | Desktop read-only `<table>` grouped by **date** (each date = a `<KitchenGroupHeader variant="table">` + its rows). Columns: Item · Action · Planned. Imports `kitchen-table.css`. |
| PN-2 | `components/kitchen/kitchen-pesanan-cards.tsx` (+`.css`) | **NEW** | Phone reflow: one card per date group; inside, a compact list (item · action · planned) per row. No stepper (read-only). |
| — | `KitchenGroupHeader`, `useIsDesktop`, `StateKit` | **REUSED** | No KPI strip (a horizon read; OQ-7 if owner wants a "N days · M items" summary). No toolbar. |
| C-PN | `pages/kitchen-plan-page.tsx` (PesananView face) + `.css` + `.test.tsx` | **CHANGED** | §5.4. |

### 5.3 All states

loading (skeleton) · error+retry · empty ("Nothing planned — no planned items in the next 14 days yet.") · populated (date-grouped table/cards) · unauth. **No saving/offline-write states** — Pesanan is read-only (no `isOnline` write gate; an offline read still attempts + errors to the error state).

### 5.4 Page rewrite (C-PN, PesananView face only)

**CHANGE:** `<PageFrame variant="data">`; replace the per-date `.kp-table` blocks with `useIsDesktop()` → `<KitchenPesananTable>` | `<KitchenPesananCards>`; the date `groups` `useMemo` (group-by-date) is **preserved verbatim** and passed in.
**PRESERVE:** `from = wibToday()`, `listPesanan(from, PESANAN_HORIZON_DAYS)`, the date-grouping `useMemo`, AC-024 (read-only — NO logging/approve/edit affordance), FR-035 (14-day horizon). The `<PageHead>` meta "next 14 days" stays.

### 5.5 Reflow + a11y + tokens

Desktop: full-bleed; per-date group header (date label + item count) over a 3-col table (Item · Action · Planned[t-num]). Phone: per-date card with a stacked label:value list (`<dl>`) — Item/Action/Planned per row; 44px touch only on nothing (read-only). A11y: `<table aria-label="Planned items for {date}">` per group + `<caption>`; `tabular-nums` on planned qty + counts; group header `aria-expanded` (collapsible dates — nice on a 14-day list; default expanded for the first 3, collapsed after? **Keep all expanded** for parity — the shipped Pesanan shows all). Tokens: table grammar §2.2; date label structural-navy (`--brand-navy-text`) via the group header; Planned qty `--foreground` tabular. **No blue, no shadow on rows** (read-only). ✓

### 5.6 Parity guardrails (Pesanan)

- **DO NOT** add any edit/log/approve affordance (AC-024).
- **DO NOT** add a date picker (horizon is fixed `from=today`, P-5).
- **DO NOT** change `listPesanan` or `PESANAN_HORIZON_DAYS`.

---

## 6. Screen 3 — Stock (`/mos/kitchen/stock`, any member) — read the on-hand + available

### 6.1 Lens-D job story

> **When deciding what to produce or transfer, an ops user wants to glance the current stock (on-hand + available) per dish for today — read-only — so I don't move stock we don't have.**

**Read-only glance.** No verb (no edit, no transfer action here — transfers are logged on the Log screen). Anchor A1 (read-not-reviewed). The two cuts — `stok` (usable, FR-060) and `tersedia` (available, FR-061) — are the whole point; negatives preserved (FR-061/AC-032), tinted destructive, never clamped.

5-Q walk: **Job** = glance on-hand + available. **Expectation** = a list of dishes with two numbers each; negatives flagged. **Priority** = dishes (alphabetical, already sorted) with the two cuts; group by category (F2 lights this up). **Actionability** = none on this screen (transfer happens on Log); negatives are a *signal* to go produce, not an action here. **Mental model** = read-only dense table, sibling of Log/Review.

### 6.2 Component breakdown

| # | File | NEW / REUSED | What |
|---|---|---|---|
| KS-1 | `components/kitchen/kitchen-stock-table.tsx` (+`.css`) | **NEW** | Desktop read-only `<table>`: Dish(name+cat) · Stok · Tersedia. Negatives → `.kt-neg`. Optional group-by-category via `<KitchenGroupHeader>`. Imports `kitchen-table.css`. |
| KS-2 | `components/kitchen/kitchen-stock-cards.tsx` (+`.css`) | **NEW** | Phone reflow: one card per dish (name + category + two big tabular numbers Stok/Tersedia); negatives tinted. |
| KS-3 | `lib/kitchen-stock-kpis.ts` (+`.test.ts`) | **NEW (optional, OQ-5)** | Pure `computeStockKpis(rows)` → `KitchenKpis` (Items · On-hand total · Low/negative count · Available total). |
| — | `KitchenToolbar`, `KitchenKpiStrip` (if OQ-5), `KitchenGroupHeader`, `useIsDesktop`, `StateKit` | **REUSED** | |
| C-KS | `pages/kitchen-stock-page.tsx` + `.css` + `.test.tsx` | **CHANGED** | §6.4. |

### 6.3 All states

loading · error+retry · empty ("No stock to show — no approved kitchen activity for {date} yet.") · populated (table/cards; negatives tinted, never clamped — FR-061/AC-032) · unauth. A `stok<0` or `tersedia<0` cell → `.kt-neg` (`--status-lost-text`, AA-darkened, **never** base `--destructive`). Read-only: no offline-write gate (an offline read still attempts + errors).

### 6.4 Page rewrite (C-KS)

**CHANGE:** `<PageFrame variant="data">`; replace `.ks-table` with `useIsDesktop()` → `<KitchenStockTable>` | `<KitchenStockCards>`; optionally add `<KitchenKpiStrip>` (OQ-5) + `<KitchenToolbar>` (search + category — a stock list of 32 dishes benefits). **PRESERVE:** `asOf = wibToday()`, `fetchKitchenStock(asOf)`, the auth-read-once effect, FR-060/061 (two cuts), AC-032 (negatives preserved, never clamped). The `StockCell` negative-tint logic moves into the table/cards (`.kt-neg`).

### 6.5 Reflow + a11y + tokens

Desktop: full-bleed; (optional KPI strip) → toolbar (search + category) → table grouped by category (Dish · Stok · Tersedia, both right-aligned tabular; negatives tinted). Phone: (optional summary) → cards (name + cat + Stok/Tersedia big numbers; negatives tinted). A11y: `<table aria-label="Kitchen stock — on-hand and available per dish for {date}">` + `<th scope="col">`; `tabular-nums` on both cuts + KPI; negative cells keep the numeric value (screen-reader reads "-5") — the tint is decorative, the minus sign is the non-color cue (WCAG 1.4.1). Tokens: table grammar §2.2; negative `--status-lost-text`; zero values `--text-light` (muted, not negative). **No blue, no row shadow.** ✓

### 6.6 Parity guardrails (Stock)

- **DO NOT** clamp negatives (FR-061/AC-032).
- **DO NOT** add a transfer/produce action (that's the Log screen).
- **DO NOT** change `fetchKitchenStock`.

---

## 7. Screen 4 — Review (`/mos/kitchen/review`, ops_lead/admin) — the approve/reject queue

### 7.1 Lens-D job story

> **When submitted logs land, an ops lead wants to approve or reject them quickly — one by one or in bulk — noting variances, so only checked production hits the ESB and stock.**

**This is the genuine review lifecycle** — kitchen logs ARE reviewed (FR-040..044/050). Anchor **A4 lives HERE**: the Approve verb is correct on this screen (unlike the Log capture screen where it is forbidden). The ops_lead's job is *gate* (GIGO): approve on-plan, force a note on variance, always-note on reject, finish Production before Transfers (FR-042), bulk-approve a section.

5-Q walk: **Job** = clear the queue correctly. **Expectation** = Submitted logs grouped by action (Production first), each with plan-vs-logged + submitter + note; Approve/Reject per row; Approve-all per section. **Priority** = Production section first (the gate); variance rows visually flagged (off-plan Tag). **Actionability** = Approve (primary blue, per row + per section); Reject (outline/destructive-confirm, per row); a missing note blocks confirm (AC-040/041). **Mental model** = a dense queue table, sibling of Log, but with a real decision column. **No foot bar** — actions are per-row/per-section (F1 scope).

### 7.2 Component breakdown — NEW vs REUSED vs CHANGED

| # | File | NEW / REUSED / CHANGED | What |
|---|---|---|---|
| RV-1 | `components/kitchen/kitchen-review-row.tsx` (+`.css`) | **CHANGED (restyle only)** | The existing `<tr>` (approve/reject/note). **Logic unchanged** (startApprove/startReject/confirm/cancel, off-plan Tag, note gates AC-040/041). Restyle to the dense-table grammar (50px row, overline thead peer, `border/70%`). The note `<textarea>` reveal stays inline in the decision cell. |
| RV-2 | `components/kitchen/kitchen-review-table.tsx` (+`.css`) | **NEW** | Desktop: one `<table>` per action group OR one table with action group-headers. Columns: Item · Plan vs logged · Submitter · Time · Note · Decision. Group header = action (Production first) + count + the production-first gate note + the bulk-Approve button. Imports `kitchen-table.css`. |
| RV-3 | `components/kitchen/kitchen-review-card.tsx` (+`.css`) | **NEW** | Phone reflow: one card per Submitted log (item + plan-vs-logged Tag + submitter + time + note + Approve/Reject). The note reveal + confirm flow is the same logic as the row, phone-laid-out. |
| RV-4 | `lib/kitchen-review-kpis.ts` (+`.test.ts`) | **NEW** | Pure `computeReviewKpis(logs, planMap)` → `KitchenKpis` (Submitted · On-plan · Off-plan · Production-pending flag). |
| — | `KitchenKpiStrip`, `KitchenGroupHeader`, `Tag`, `Avatar`, `Pill`, `useIsDesktop`, `StateKit` | **REUSED** | |
| C-RV | `pages/kitchen-review-page.tsx` + `.css` + `.test.tsx` | **CHANGED** | §7.5. |

### 7.3 The group header + bulk action (preserve EXACTLY)

The current `.kr-group-head` carries: action label (structural navy) · count · production-first gate note ("ⓘ Blocked until Production approved") · `Approve all (N)` primary button (FR-043). **This is bespoke** (the bulk button + gate note don't fit `KitchenGroupHeader`'s API). Two options:
- **(Adopted)** Keep a bespoke `.kr-group-head` restyled to the hairline grammar (top+bottom `--border`, flat, structural-navy label) — preserves the bulk button + gate note EXACTLY. **`KitchenGroupHeader` gains an optional `actions?: ReactNode` slot as a fast-follow** (OQ-8) — not built here to avoid touching the reviewed Log component's sibling API surface unexpectedly.
- (Rejected) Force `KitchenGroupHeader` to take an `actions` slot now → would change the shared component Log depends on; parity risk. Defer.

**Bulk approve parity (FR-043, preserve byte-identical):** eligible = EVERY Submitted row in the section; Transfer sections gated by production-first (zero eligible while Production pending); off-plan rows approved with a null note (the bulk path never forces per-row notes); iterate `approveKitchenLog(id, null)` per row (no bulk RPC); P0003 → drop+continue; other errors → keep the row + notice. **DO NOT change `handleBulkApprove`/`bulkEligible`.**

### 7.4 All states

loading · error+retry · empty ("Nothing to review — no submitted logs for {date}.") · populated (grouped queue) · **forbidden (non-lead)** = clean panel (FR-003/044, unchanged) · **per-row approving/rejecting** (`submittingId`) · **bulk in flight** (`bulkAction`) · **P0003 stale** (notice + re-fetch) · **42501 forbidden** (notice) · **decision-error** (`actionError`) · offline (banner + all actions disabled, NFR-008) · notice ("Approved · batch X" / "N approved"). **Per-row note states (AC-040/041):** on-plan → Approve immediate (no note); off-plan → Approve reveals required note; Reject → always reveals required note; empty note on confirm → inline error + block. **All preserved verbatim** from the current `KitchenReviewRow`.

### 7.5 Page rewrite (C-RV)

**CHANGE:** `<PageFrame variant="data">`; add `<KitchenKpiStrip kpis={useReviewKpis(logs, planMap)} isDesktop />`; replace the per-section `.kr-table` blocks with `useIsDesktop()` → `<KitchenReviewTable>` | per-section `<KitchenReviewCard>`s; keep the bespoke group head (restyled). **PRESERVE VERBATIM:** `wibToday()`, the access-role gate (`allowed`), `fetchQueue` (`listSubmittedKitchenLogs` + `fetchPlanMap` + `getPeople`), `ACTION_ORDER` (Production first), `productionPending`, `groups` `useMemo`, `handleApprove`/`handleReject`/`handleBulkApprove`/`bulkEligible`/`handleDecisionError`/`removeRow`, the `submittingId`/`bulkAction`/`actionError`/`notice`/`isOnline` state, the P0003/42501 branches, the offline effect, FR-040/041/042/043/050 + AC-040/041/042/090. **No foot bar.**

### 7.6 Reflow + a11y + tokens

Desktop: full-bleed; KPI strip → per-action group (hairline head: action label + count + gate note + bulk Approve) → dense table (Item[name+off-plan Tag] · Plan vs logged · Submitter[avatar+name] · Time · Note · Decision[Approve/Reject + inline note reveal]). Phone: KPI summary → per-action group → cards (item + Tag + meta + Approve/Reject; note reveal inline). A11y: `<table aria-label="Submitted kitchen logs — review and approve">` + `<th scope="col">`; the off-plan/on-plan `Tag` carries dot+text (WCAG 1.4.1 — not color alone); note `<textarea aria-label="Approve/Reject note for {dish}">`; Approve = primary blue (the One-Blue — per-row + bulk; ≤10%: on a queue screen the approve buttons are the legitimate single action); Reject confirm = `btn-destructive` (the one solid status fill); `:focus-visible` ring on all controls; `tabular-nums` on plan/logged/time/counts; bulk button `aria-label="Approve all (N) — {action}"`; disabled Approve `title` = production-first reason (AC-042). Tokens: table grammar §2.2; off-plan Tag amber (`--warning` tint + `--warning-foreground`) / on-plan green (`--success` + `--status-won-text`); approve-note-error input border `--destructive` + cue `--status-lost-text` (AA-darkened, mirrors Log). **Soft-Elevation:** only the phone cards get `--shadow-rest`; table/group-heads/rows flat. ✓

### 7.7 Parity guardrails (Review)

- **DO NOT** change any approve/reject/bulk/note/production-first gate logic or payload (`reviewed_by`/`reviewed_at` never sent).
- **DO NOT** add a foot batch bar (actions are per-row/per-section).
- **DO NOT** change `approveKitchenLog`/`rejectKitchenLog`/`listSubmittedKitchenLogs`.
- The approve-nonce (on-plan → no note; off-plan → required note) and reject-always-note (AC-040/041) stay **byte-identical** in `KitchenReviewRow`/`KitchenReviewCard`.

---

## 8. Seed category mapping (F2 detail) + tensions

`category` exists (`migrations/20260620000001_ops_wip_items.sql:9`); the test-seed already uses synthetic categories. The real `seed.sql` inserts `(id, org_id, name)` only. **Fix:** change the 32-row INSERT to `(id, org_id, name, category)`. Proposed mapping (5 ratified buckets from the directive + **one proposed 6th "Meat"** — OQ-4):

| # | Dish | Category (proposed) |
|---|---|---|
| 1 | Nasi Putih | Rice/Staple |
| 2 | Risoles Beef Mayo | Snack/Sweet |
| 3 | Bakwan Sayur | Snack/Sweet |
| 4 | **Oseng Bakso** | **Meat** ⚠️ OQ-4 |
| 5 | Lontong Sayur | Rice/Staple |
| 6 | Ayam Gulai | Chicken |
| 7 | Pisang Goreng | Snack/Sweet |
| 8 | Singkong Goreng | Snack/Sweet |
| 9 | Tongkol Sambal Matah | Seafood |
| 10 | Kaya Toast | Snack/Sweet |
| 11 | Cumi Cabe Ijo | Seafood |
| 12 | Ayam Garang Asem | Chicken |
| 13 | Bakwan Jagung | Snack/Sweet |
| 14 | **Sosis Solo** | **Meat** ⚠️ OQ-4 |
| 15 | Tape Goreng | Snack/Sweet |
| 16 | Arem Arem | Snack/Sweet |
| 17 | Tumis Buncis | Veg/Tempe/Tofu |
| 18 | Orek Tempe | Veg/Tempe/Tofu |
| 19 | Tumis Daun Singkong | Veg/Tempe/Tofu |
| 20 | **Semur Telur** | Veg/Tempe/Tofu ⚠️ OQ-4 (egg) |
| 21 | Ayam Suwir | Chicken |
| 22 | Ayam Woku | Chicken |
| 23 | Kentang Balado | Veg/Tempe/Tofu |
| 24 | Sayur Lodeh | Veg/Tempe/Tofu |
| 25 | Sambal Merah | Veg/Tempe/Tofu |
| 26 | Teri Kacang | Seafood |
| 27 | Semur Tahu | Veg/Tempe/Tofu |
| 28 | Kentang Mustofa | Snack/Sweet |
| 29 | Sayur Asem | Veg/Tempe/Tofu |
| 30 | Terong Balado | Veg/Tempe/Tofu |
| 31 | Ayam Goreng Lengkuas | Chicken |
| 32 | Balado Cumi Asin | Seafood |

**Tensions (flagged, none block the build — defaults adopted):**
- **OQ-4a — "Meat" bucket.** Oseng Bakso (meatball) + Sosis Solo (beef roll) have no clean home in the 5 ratified buckets (Rice/Staple · Chicken · Seafood · Veg/Tempe/Tofu · Snack/Sweet). **Default adopted: add a 6th `Meat` bucket.** Alt: fold both into Snack/Sweet (poor fit) or Veg (wrong). Recommend: add Meat.
- **OQ-4b — Egg.** Semur Telur (egg stew) folded into Veg/Tempe/Tofu by default (egg is a vegetarian-adjacent protein here). Alt: a 7th "Egg" bucket (overkill for one dish). Recommend: Veg/Tempe/Tofu.
- **OQ-4c — boundary snacks.** Singkong/Kentang Mustofa/Bakwan mapped to Snack/Sweet (fried sides) vs Veg — default Snack/Sweet (they read as snacks on a pantry line). Minor.

**These categories drive the sub-label + the category filter + Plan/Stock grouping.** If the owner prefers different buckets, only `seed.sql` changes (no code). The build proceeds on the defaults above.

---

## 9. Master TDD task list (ordered, 2–5 min each, red → green)

Every task writes the **test first**, then the implementation, then runs the exact verify command. All paths under `mos-app/` unless noted. No prod code without a failing test.

### Phase A — Log review fixes (§1)

**Task A1 — F1: pin the sticky footer (shared shell).** Red: add a `page-frame.test.tsx` case asserting the `<main>` element is a scroll container (computed `overflow-y: auto/scroll` AND a bounded height — `flex-grow:1` or height ≠ auto). Green: `page-frame.tsx` `<main>` className → `overflow-auto flex-1 min-h-0`. Then assert `.kl-footer` is the last in-DOM child of the form (so `sticky bottom:0` pins). Verify: `cd mos-app && npm test -- src/shell/page-frame.test.tsx src/pages/kitchen-log-page.test.tsx`

**Task A2 — F1 regression sweep (manual + automated).** Run the shell + each kitchen page + Tasks + Ops + My Week tests; then `npm run dev` and visually confirm Tasks/Ops/Plan/Stock/Review scroll inside `<main>` with header/rail fixed (no double-scroll, no clipped footers). Verify: `cd mos-app && npm test && npm run dev` (visual sweep — log in the PR description).

**Task A3 — F3: disable Submit on unresolved variance-note.** Red: in `kitchen-log-page.test.tsx`, add a case — a staged off-plan line with no note → the Submit button is **disabled** (query `toBeDisabled()`), and entering the note **enables** it; AC-021 goal (note blocks submit) still holds. Green: add `noteUnresolved` in `kitchen-log-page.tsx`, OR into `blocked` on `<SubmitButton>`, keep `handleSubmit` re-gate. Verify: `cd mos-app && npm test -- src/pages/kitchen-log-page.test.tsx`

**Task A4 — F4: remove dead props.** Red: update `kitchen-log-cards.test.tsx`, `kitchen-kpi-strip.test.tsx`, `qty-cell.test.tsx` helpers to stop passing the dead props (the tests still assert the same behavior). Green: drop `category`/`collapsedGroups`/`onToggleGroup`/`onCategoryChange` from `KitchenLogCardsProps`; drop `actionType` from `KitchenKpiStripProps` + `QtyCellProps`; stop passing them in `kitchen-log-page.tsx`. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-log-cards.test.tsx src/components/kitchen/kitchen-kpi-strip.test.tsx src/components/kitchen/qty-cell.test.tsx && npm run typecheck`

**Task A5 — F2: seed categories.** Red: a SQL test (or a `grep`-based assertion in a tiny test) that the 32-row INSERT in `seed.sql` includes a non-null `category` column. Green: edit `supabase/seed.sql` per §8 mapping. Verify: `grep -c "category" supabase/seed.sql` (≥1 in the wip_items INSERT) + re-seed locally (`supabase db reset`) + load Stock/Plan → categories render. (Data-only — no app test.)

### Phase B — shared primitives (§2)

**Task B1 — `kitchen-table.css` shared grammar.** Red: extend `kitchen-tokens.css.test.ts` (RI-4) to also glob `kitchen-table.css` (every `var(--…)` defined) + `kitchen-css-namespace.test.ts` to permit the `.kt-*` namespace. Green: write `components/kitchen/kitchen-table.css` (§2.2). Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-tokens.css.test.ts src/components/kitchen/kitchen-css-namespace.test.ts`

**Task B2 — `KitchenToolbar`.** Red: `kitchen-toolbar.test.tsx` — renders search-mini (`role="searchbox"`) + category `<select>`; `onSearchChange`/`onCategoryChange` fire; `children` slot renders (for ActionTypeSeg); omitting `categories` hides the select. Green: `kitchen-toolbar.tsx` + `.css`. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-toolbar.test.tsx`

**Task B3 — `computePlanKpis` + `usePlanKpis`.** Red: `lib/kitchen-plan-kpis.test.ts` — fixture `PlanCell[]` for one action → asserts `{plannedTotal, plannedDishCount, itemsRemaining…}` mapped onto `KitchenKpis`; zero-plan edge. Green: pure `computePlanKpis` + memoized hook. Verify: `cd mos-app && npm test -- src/lib/kitchen-plan-kpis.test.ts`

**Task B4 — `computeReviewKpis` + `computeStockKpis` (+ hooks).** Red: `kitchen-review-kpis.test.ts` + `kitchen-stock-kpis.test.ts` — Review (on/off-plan counts from `ReviewLogRow[]` + planMap) + Stock (items, on-hand total, neg count). Green: pure fns + hooks. Verify: `cd mos-app && npm test -- src/lib/kitchen-review-kpis.test.ts src/lib/kitchen-stock-kpis.test.ts`

### Phase C — Plan editor (§4)

**Task C1 — `PlanQtyCell` (PE-3).** Red: `plan-qty-cell.test.tsx` — flat input at rest; ± call `onSave(±1)`; − disabled at 0; direct input commits on blur; "Saving…" renders when `saving`; disabled when `disabled`. Green: `plan-qty-cell.tsx` + `.css` (`.qcell` grammar, no cap). Verify: `cd mos-app && npm test -- src/components/kitchen/plan-qty-cell.test.tsx`

**Task C2 — `KitchenPlanTable` (PE-1).** Red: `kitchen-plan-table.test.tsx` — `<thead>` (Dish · Plan); one `<PlanQtyCell>` per dish; category group-headers via `<KitchenGroupHeader>`; search filters by name; category `<select>` filters; empty-filter message. Green: component + `.css` (import `kitchen-table.css`). Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-plan-table.test.tsx`

**Task C3 — `KitchenPlanCards` + `PlanQtyStepper` (PE-2/PE-4).** Red: `kitchen-plan-cards.test.tsx` — one card per dish with a `PlanQtyStepper`; category group-headers; `onSave` wired; no off-plan expander (assert it's absent). Green: components + `.css`. Verify: `cd mos-app && npm test -- src/components/kitchen/plan-qty-stepper.test.tsx src/components/kitchen/kitchen-plan-cards.test.tsx`

**Task C4 — Plan editor page rewrite (C-PE).** Red FIRST: run `kitchen-plan-page.test.tsx` — DOM selectors break (steps change) but goals hold: AC-024 (Pesanan read-only), FR-030/031 (edit → upsert, payload omits `org_id`/`plan_by`), offline-write gate, saved-notice. Update selectors; keep goal-oracles. Green: `variant="data"`, KPI strip, `useIsDesktop()` branch, `<KitchenToolbar children={<ActionTypeSeg>}>`, preserve `saveCell`/`fetchEditor`/role split. Verify: `cd mos-app && npm test -- src/pages/kitchen-plan-page.test.tsx`

**Task C5 — Plan page new-behavior tests.** Red→Green: KPI strip renders derived values; category grouping; search filters; reflow branch (mock `useIsDesktop` → only table OR cards in DOM). Verify: `cd mos-app && npm test -- src/pages/kitchen-plan-page.test.tsx`

### Phase D — Pesanan (§5)

**Task D1 — `KitchenPesananTable` (PN-1).** Red: date-grouped read-only table; `<KitchenGroupHeader>` per date; Item · Action · Planned; no affordance. Green: component + `.css`. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-pesanan-table.test.tsx`

**Task D2 — `KitchenPesananCards` (PN-2).** Red: per-date card with a stacked list; read-only (no buttons). Green: component + `.css`. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-pesanan-cards.test.tsx`

**Task D3 — Pesanan page rewrite (C-PN).** Red: `kitchen-plan-page.test.tsx` Pesanan cases — AC-024 (read-only, no edit/log/approve control in the DOM), FR-035 (14-day horizon). Green: `variant="data"`, `useIsDesktop()` branch, preserve `listPesanan` + date-grouping. Verify: `cd mos-app && npm test -- src/pages/kitchen-plan-page.test.tsx`

### Phase E — Stock (§6)

**Task E1 — `KitchenStockTable` (KS-1).** Red: Dish(name+cat) · Stok · Tersedia; negatives `.kt-neg` (assert class) and **not clamped** (value preserved); category grouping; search + category filter via `<KitchenToolbar>`. Green: component + `.css`. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-stock-table.test.tsx`

**Task E2 — `KitchenStockCards` (KS-2).** Red: per-dish card with two tabular numbers; negatives tinted; zero muted. Green: component + `.css`. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-stock-cards.test.tsx`

**Task E3 — Stock page rewrite (C-KS).** Red: FR-060/061 (two cuts), AC-032 (negatives preserved) goals hold. Green: `variant="data"`, optional KPI strip (OQ-5 — default ON), `useIsDesktop()` branch, preserve `fetchKitchenStock`. Verify: `cd mos-app && npm test -- src/pages/kitchen-stock-page.test.tsx`

### Phase F — Review (§7)

**Task F1-R — Restyle `KitchenReviewRow` (RV-1, logic unchanged).** Red: existing `kitchen-review-row.test.tsx` (AC-040/041/042) stays green; add a class/structure assertion for the dense-row grammar. Green: `.css` restyle only (50px row, overline peer, `border/70%`) — **no logic change**. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-review-row.test.tsx`

**Task F2-R — `KitchenReviewTable` (RV-2).** Red: per-action group (Production first) with the bespoke group head (label + count + gate note + bulk button); one `<KitchenReviewRow>` per Submitted log; columns. Green: component + `.css` (import `kitchen-table.css`). Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-review-table.test.tsx`

**Task F3-R — `KitchenReviewCard` (RV-3).** Red: per-log card (item + off-plan Tag + submitter + time + note + Approve/Reject); note reveal + confirm (same AC-040/041 logic). Green: component + `.css`. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-review-card.test.tsx`

**Task F4-R — Review page rewrite (C-RV).** Red: `kitchen-review-page.test.tsx` goals hold — FR-040/041/042/043/050, AC-040/041/042/090, role gate (FR-003/044 forbidden panel), P0003/42501 branches, offline-write gate, bulk approve. Update selectors. Green: `variant="data"`, KPI strip, `useIsDesktop()` branch, restyled bespoke group head; preserve ALL handlers/gates/payloads. Verify: `cd mos-app && npm test -- src/pages/kitchen-review-page.test.tsx`

**Task F5-R — Review new-behavior tests.** Red→Green: KPI strip derived values; reflow branch (table OR cards); bulk button disabled while `bulkAction`/`submittingId` set; production-first disables Transfer-row Approve (Reject stays live — AC-042). Verify: `cd mos-app && npm test -- src/pages/kitchen-review-page.test.tsx`

### Phase G — gates

**Task G1 — Typecheck + lint (merge gates, zero errors).** Verify: `cd mos-app && npm run typecheck && npm run lint -- --max-warnings=0`

**Task G2 — Full kitchen suite green + coverage.** Verify: `cd mos-app && npm test -- src/lib/kitchen src/components/kitchen src/pages/kitchen-` ; confirm ≥80% lines on changed code (coverage gate). Re-seed + smoke the four screens (`npm run dev`).

> **E2E (AC-090/091 + the Pesanan/Plan/Stock/Review cross-stack journeys) are owned at the Playwright layer, NOT added here** — they assert real cross-stack flows (approve→ESB, plan→log variance, stock compute) which are **unchanged** (P-2). Existing e2e selectors get the same DOM-selector refresh as the unit tests (a release-engineer task at ship time).

---

## 10. Tensions / open questions for the owner (flagged — none block the build)

| # | Question | Default adopted | Alt |
|---|---|---|---|
| **OQ-1** | F1 fixes the sticky bar via a **shared-shell change** (`page-frame.tsx` `<main>` → scroll container). Sign off the cross-page regression sweep? | **Yes** — root-cause fix; header/rail are grid siblings (unaffected). | Per-page `position: fixed` footers (fragile, width-sync needed). |
| **OQ-2** | Hover-wash token name: Log uses `--accent` (the grey wash); the directive names `--surface-secondary`. Both resolve to the same grey in this kit. | **Use `--accent`** (match Log verbatim). | Rename to `--surface-secondary` kit-wide (cosmetic fast-follow). |
| **OQ-3** | `KitchenKpiStrip` has 4 fixed tile labels (Planned/Made/%/Remaining); Plan/Review/Stock map different semantics onto them. Confusing? | **Keep** (reuse unchanged); each screen's selector maps meaning onto the 4 slots. | Fast-follow: generalize the strip to 4 `{label,value,delta,sub}` props. |
| **OQ-4a** | A 6th category **"Meat"** for Oseng Bakso + Sosis Solo (no clean home in the 5 ratified buckets). | **Add "Meat".** | Fold into Snack/Sweet (poor) or Veg (wrong). |
| **OQ-4b** | **Egg** (Semur Telur) — its own bucket or fold into Veg/Tempe/Tofu? | **Veg/Tempe/Tofu.** | 7th "Egg" bucket (overkill). |
| **OQ-4c** | Fried sides (Singkong, Kentang Mustofa, Bakwan) — Snack/Sweet or Veg? | **Snack/Sweet.** | Veg/Tempe/Tofu. |
| **OQ-5** | Does **Stock** get a KPI strip (Items / On-hand / Low / Available)? | **Yes** (default ON) — sibling-consistency + parity-safe derivation. | Skip (a glance needs no KPIs). |
| **OQ-6** | Does **Pesanan** get a search/toolbar? | **No** (v1) — short horizon, parity. | Add search (nice-to-have). |
| **OQ-7** | Pesanan: collapse older dates (first 3 expanded)? | **All expanded** (parity). | Collapse after day 3. |
| **OQ-8** | Give `KitchenGroupHeader` an `actions?` slot so Review's group head (bulk button + gate note) can use it? | **No** (v1) — keep Review's bespoke head; avoid touching the reviewed-Log sibling API. | Add the slot (fast-follow) and migrate Review onto it. |
| **OQ-9** | Consolidate Log's `.klt-*` table onto the new shared `kitchen-table.css`? | **No** (this slice) — Log is reviewed; parity guardrail. | Fast-follow migration once siblings prove the shape. |

---

## 11. What this plan does NOT cover (fast-follows)

- **Date picker** on Plan/Stock/Review (all stay WIB-today; owner OQ-7 in the Log plan, still deferred).
- **Pushes / outbox** (`/mos/kitchen/pushes`) — a read-only `integrations.esb_push` table; inherits the table grammar (§2.2). Out of scope here.
- **Log → shared-shell consolidation** (OQ-9) + **`KitchenGroupHeader.actions` slot** (OQ-8).
- **`KitchenKpiStrip` generalization** to `{label,value,delta,sub}[]` (OQ-3).
- **A drawer record-page for Review** (the Log plan §11 + the Review design-plan §7.1 D4 defers the drawer).

---

**End of plan.** Once the owner signs off OQ-1 (shell-change regression) + OQ-4 (category buckets) + OQ-5/6/7 (Stock strip / Pesanan search / Pesanan collapse), this plan feeds the `ui-implementer` build (§9 tasks) and the `design-reviewer` four-lens review (Lens-D re-run per screen against its job story + anchor A1/A4).
