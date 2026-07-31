# UI Design-Plan — Kitchen · Log capture screen redesign (OD-K-5)

**Author:** design-architect · **Date:** 2026-06-21 · **Status:** Draft for owner/Director sign-off
**Scope:** the **Log capture screen only** (`/mos/kitchen/log`, `KitchenLogPage`). Plan/Stock/Review/Pushes
are explicitly **out of scope** (fast-follows that *inherit* the components built here — §11).
**Source decision:** OD-K-5 (`docs/decisions.md`).
**Source spec:** `docs/specs/kitchen-module.spec.md` (FR/AC ids cited inline; AC-020/021/022/030 are
**preserved unchanged** — this is a presentational redesign + a derived display, not a behavior change).
**Identity authority:** `DESIGN.md` (adopted "Quiet Control Surface"). **No new visual language is
invented** — every piece maps to an existing primitive + a named `--ds-*` / shadcn-role / brand token.

**Mockup anchors (consistency obligation — the owner's pick):**
- `docs/design-mockups/kitchen/kitchen-log-A-datatable.html` — the **desktop/tablet dense data-table**
  (the table grammar, the inline `Made today` cell, the sticky action footer, the Planned/Off-plan
  group split, loading/empty variants).
- `docs/design-mockups/kitchen/kitchen-log-C-plan-vs-actual.html` — the **KPI strip** (4 DESIGN.md
  signature tiles: Planned total · Made so far · % complete · Items remaining) lifted on top of A.
- `docs/design-mockups/kitchen/kitchen-log-B-floorfast.html` — the **phone floor-fast reflow**
  (big-touch cards, plan-first, the "+ Add another dish" off-plan expander, the pinned submit bar,
  the one-line "Today · N planned · NN%" summary that is the KPI strip's phone form).
- Shots: `docs/design-mockups/kitchen/shots/{A,B,B-phone,C}.png` (+ `before-*.png` = the rejected UI).

**Architecture reused verbatim (the plan mirrors these conventions — it does not invent):**
`mos-app/src/components/tasks/{tasks-table-body,task-row,mobile-grouped-cards,group-header-row}.tsx`,
the reflow hook `mos-app/src/shell/use-is-desktop.ts`, `mos-app/src/components/ui/{pill,state-kit,tag}.tsx`,
and the already-built kitchen pieces `mos-app/src/components/kitchen/{action-type-seg,wip-item-stepper}.tsx`.
The CURRENT screen to REPLACE is `mos-app/src/pages/kitchen-log-page.{tsx,css}`; the data hooks
`mos-app/src/lib/db/{kitchen-logs,kitchen-plans}.ts` + the pure gates `mos-app/src/lib/kitchen-gates.ts`
are **read-only here — DO NOT change them** (parity guardrail, §2).

---

## 1. The decision (OD-K-5 recap) — binding

Rebuild the **Kitchen · Log capture screen** as **ONE responsive screen** that reflows at 768px:

- **Desktop / tablet (≥768px) — A "dense data-table" + C's KPI strip on top.** ~48–50px rows, one per
  WIP dish, sticky header. Columns: **Dish** (name + category sub-label) · **Plan** (tabular) ·
  **Stock** (tabular) · **Made today** (the inline-editable qty cell — flat number at rest, compact −/+
  stepper on hover/focus) · **Status** (on-plan / over / under / logged, Tinted-Status dot+pill).
  Toolbar above: the action-type segmented control (**Production · Transfer to Radiant · Transfer to
  Bungur**) + a search-mini ("Find a dish") + a category filter chip. Rows grouped **Planned today**
  vs **Off-plan** (quiet hairline group-header rows). Sticky bottom bar = running tally
  ("8 dishes · 175 units · pending review on Submit") + **Submit** primary + **Discard** outline.
  **On top: C's 4-tile KPI strip** (Planned total · Made so far · % complete · Items remaining, with
  delta chips).
- **Phone (<768px) — B "floor-fast" cards.** Big-touch cards (≥44px −/+), plan-first (Planned today
  first; Off-plan collapsed under a "+ Add another dish" expander), large qty readout, a top
  **"Today · N dishes planned · NN%"** summary (the KPI strip's phone form), a persistent bottom
  **"Submit N entries"** bar.
- **DROPPED from the mockups (against parity):** A's net-new footer chip **"2 need a variance note"**
  (it implies a new aggregate gate / workflow logic). The per-line variance-note **field** (FR-022)
  stays — it is existing behavior.
- **DROPPED from the mockups (out of scope, today-only preserved):** A's **"◷ Today ▾"** date chip.
  The screen stays **today (WIB) only** — `logDate = wibToday()` unchanged. A date picker is a fast-follow.

### 1.1 Parity guardrails (binding — the design must not cross these)

These are the owner's "full parity, presentational-only" rails (OD-K-1/K-5). The plan, the build, and
the review all enforce them:

| # | Guardrail | What it forbids here |
|---|---|---|
| **P-1** | **Derived display only** | The KPI strip is computed **client-side from already-fetched plan/made/stock** (sums + made/plan %). **NO new tables, NO new columns, NO new persistence, NO new server RPC, NO ESB change, NO new fetch.** |
| **P-2** | **Capture + submit behavior unchanged** | Same action types, same data hooks (`listActiveWipItems` / `fetchPlanMap` / `fetchStockMap` / `resolveKitchenBuId` / `insertKitchenLogBatch`), same gates (`needsVarianceNote` / `transferExceedsAvailable` / `effectiveTarget`), same submit payload (NEVER sends `status` / `org_id` / `submitted_by` — server-stamped, NFR-003), same submit→Review→approve→ESB handoff. |
| **P-3** | **No new workflow logic** | No "variance note" aggregate chip, no new statuses, no auto-calc, no approve affordance on the capture screen (approve lives on `/mos/kitchen/review`). The ONLY new client-side state is presentational: the search string, the category filter, the per-group collapse flags, and the derived KPI selector output. |
| **P-4** | **Reflow = ONE branch in the DOM** | The 768px reflow uses `useIsDesktop()` exactly as Tasks does — **one** of `{KitchenLogTable, KitchenLogCards}` is rendered, never both. **No `aria-hidden` dual-render** (the unrendered branch is absent from the AT tree). |

---

## 2. Lens-D — the Log screen's job story + the 5-question walk (binding, read first)

Per `docs/design-workflow.md` §1, Lens-D grades the **mockup AND the plan** before any code. The Kitchen
Log screen is **not yet in `docs/jtbd.md`** (only the Daily Log / Tasks / Weekly-update rows are). This
plan **adds the Log screen's job story** for the Director to fold into `docs/jtbd.md` §2 when the
kitchen rows land.

### 2.1 The job story (primary role: kitchen hand / ops-floor)

> **When I've finished a batch, a kitchen hand wants to record the made qty for each dish in one fast
> pass — often on a phone — so the day's production is captured without leaving the line.**

Secondary role (same screen, secondary job): a **shift-lead / ops_lead on desktop** glances the day's
progress (the KPI strip + the dense plan-vs-made table). But the screen's **primary** job is **capture**
— the KPI strip is a *secondary aid*, never the focal element. (This is the load-bearing priority call:
the redesign serves the kitchen hand's speed job first; the shift-lead's glance job is co-served by the
same data, surfaced quietly on top.)

### 2.2 The 5-question walk

1. **Job** — record made qty per dish in one fast pass, often on a phone, without leaving the line
   (stated above). The success metric is **time-on-screen per batch**, not data completeness.
2. **Expectation** — the kitchen hand expects a list of **today's dishes** (they know what they
   cooked), a fast qty entry per dish (type or tap −/+), and a single Submit. Named in their language:
   "Kitchen · Log", Indonesian dish names, the three action types they already use (Production / Transfer
   to Radiant / Transfer to Bungur). They do **not** expect a KPI dashboard (that's a shift-lead frame)
   — so the KPI strip must be **quiet** (one compact band, not the focal point). The design honors this:
   the **capture list is the dominant element**; the KPI strip is a secondary band above it that never
   pushes the dishes below the fold on a phone (it collapses to one summary line).
3. **Priority / placement** — decision-relevant above the fold: the dishes the hand is **measured
   against** (Planned today) come **FIRST**; off-plan dishes are grouped below, quietly (and on phone,
   collapsed under "+ Add another dish"). Per row: **Plan · Made · Status** (the scan-many posture on
   desktop; the big-card readout on phone). The **Submit** is always reachable (sticky footer desktop /
   pinned bar phone) — never a scroll hunt. The KPI "% complete" is a live progress cue but is **not a
   dead end**: it reflects capture, it does not link anywhere (correct — it is derived display, P-1).
4. **Actionability** — *"so what / now what?"* — the one next action is **Submit** (always adjacent:
   sticky footer / pinned bar, co-located with the running tally so the cost of Submit is visible).
   Entering a qty is one tap/type per dish. The variance-note gate (FR-022) **reveals inline** on the
   offending row the moment qty ≠ target — the hand does not hunt. The transfer cap (FR-023) surfaces
   inline in the cell + blocks Submit — never a silent clamp (parity with the OLD app). **Discard**
   (clear staged entries) is the one consequential action — it confirms.
5. **Mental-model consistency** — the Log screen shares the **MOS DataTable paradigm**: table on
   desktop, stacked cards on phone, hairline group headers, sticky action footer — *exactly* like Tasks
   (`docs/jtbd.md` §3.3 "Open" + the reflow rule). The **Submit→pending-review→approve** flow is the
   kitchen's **genuine review lifecycle**: kitchen logs *are* reviewed (ops_lead approves, FR-040/041/050),
   unlike Daily Log entries which are read-not-reviewed (OD-P2-16). So the **"pending review on Submit"
   cue is CORRECT here** — it is the submit→review handoff, not the A1 trap.

### 2.3 Calibration anchors (the read-vs-review line, kitchen-shaped)

`docs/jtbd.md` §5 has three anchors (A1/A2/A3) tuned to the Daily Log / Weekly-update surfaces. The
Kitchen Log has a **different** read-vs-review posture (kitchen logs *are* reviewed), so A1 (no
"Review" verb on a Daily Log entry) **does not apply** — but its **variant** does. This plan proposes a
**new kitchen calibration anchor** for the Director to add to `docs/jtbd.md` §5 when the kitchen rows
land:

> **A4 (proposed) — "Approve" affordance on the Kitchen Log CAPTURE screen.** The capture screen is the
> `member`'s write surface; approval is the `ops_lead`'s job on `/mos/kitchen/review`. A capture screen
> that sprouts "Approve" / "Resolve" / "Mark done" treats a to-be-reviewed production record like a
> one-step log, collapsing the GIGO review gate (FR-024). **The capture verb is "Submit" (hand off to
> review), never "Approve".** Caught by Lens-D **Q4/Q5** (the member's job is *record*, not *approve*;
> the review lifecycle lives on a different screen). The design satisfies it: the only primary action
> on `/mos/kitchen/log` is **Submit**; no KPI tile, no row, no footer carries an approve/resolve verb.

**Lens-D verdict:** the redesign **passes** all five questions for the primary (kitchen hand) job, and
co-serves the secondary (shift-lead glance) job without elevating it. The KPI strip is correctly a
*quiet derived band*, not the focal point.

---

## 3. Architecture: what we reuse + the reflow contract (binding)

The redesign **copies the Tasks DataTable + reflow pattern exactly** (`docs/design-workflow.md` §2 + the
shipped `tasks-table-body.tsx`). Nothing here is novel IA.

### 3.1 The reflow contract (one branch in the DOM — P-4)

`KitchenLogPage` calls `useIsDesktop()` **once** and threads the boolean down as a prop (mirrors
`TasksTableBody` receiving `isDesktop` from its orchestrator). The page renders **exactly one** of:

```tsx
const isDesktop = useIsDesktop()
// …
{isDesktop
  ? <KitchenLogTable items={…} lines={…} … />
  : <KitchenLogCards items={…} lines={…} … />}
```

`useIsDesktop()` reads `(min-width: 768px)` **synchronously at first paint** (no wrong-branch flash on
mobile — see `use-is-desktop.ts`). **No `aria-hidden` on either branch** — the unrendered branch is
simply absent. This is the **same** rule as Tasks (DESIGN.md "DataTable reflow (OD-W4-4)"); it is
**distinct** from the 920px rail collapse.

### 3.2 The full-bleed surface (OD-P3-6)

The current page renders in `<PageFrame>` (default `variant="prose"`, 1080px-capped) — that cap is **why
the shipped screen reads as "single-column 32-row steppers, no density"** (the owner's rejection). The
redesign switches to **`<PageFrame variant="data">`** (full-bleed, no cap — the same variant Tasks uses,
`tasks-layout.tsx:51`). The KPI strip + table + sticky footer fill the main column; the phone reflow
fills the viewport. (The surface-wash gradient is **not** applied — that's home/digest only, OD-P3-12.)

### 3.3 REUSED unchanged (do not touch)

| File | Role in the redesign |
|---|---|
| `mos-app/src/shell/use-is-desktop.ts` | The 768px reflow hook. Called once in the page. |
| `mos-app/src/components/ui/pill.tsx` | The ONE status/delta pill primitive. Tones used: `success` (on-plan), `warning` (over), `destructive` (under), `neutral` (logged / "flat" deltas). Dot on by default (Tinted-Status). |
| `mos-app/src/components/ui/state-kit.tsx` | `ErrorState` / `EmptyState` / `SkeletonRows` for the loading / empty / error branches (chrome stays). |
| `mos-app/src/components/ui/tag.tsx` | (Optional) categorical label pill for the phone `plan-pill` if Pill's dot is unwanted there; otherwise reuse `Pill tone="neutral" dot={false}`. |
| `mos-app/src/components/kitchen/action-type-seg.tsx` | The action_type segmented control — **already built + tested (AC-020/021/022)**. Rendered in the toolbar (desktop) / full-width above the list (phone). Unchanged. |
| `mos-app/src/components/kitchen/wip-item-stepper.tsx` | The phone qty + note + cap primitive — **already built + tested (AC-020/021/022)**. **Reused INSIDE `KitchenLogCard`** (the phone card wraps it; mock-B's plan-pill + delta chip + dish-category layout are added around it). Unchanged. |
| `mos-app/src/lib/kitchen-gates.ts` | The pure gates (`needsVarianceNote`, `transferExceedsAvailable`, `effectiveTarget`, `isStockConsuming`). Called by both branches + the page's `handleSubmit`. **Unchanged.** |
| `mos-app/src/lib/db/kitchen-logs.ts` + `kitchen-plans.ts` | The data hooks. **Unchanged (P-2).** |
| `mos-app/src/lib/db/kitchen-logs.types.ts` | `KitchenLogLine`, `KitchenActionType`, `PlanMap`, `StockMap`, `WipItemOption { id, name, category }`. **Unchanged.** |

---

## 4. Component breakdown — NEW / CHANGED

### 4.1 NEW files

| # | File | What it is | Lines (est.) |
|---|---|---|---|
| N1 | `mos-app/src/lib/kitchen-status.ts` (+ `.test.ts`) | **Pure status mapper.** `(made, plan, isOffPlan) → { tone: PillTone, label: string }` for the row StatusPill. 5 cases: on-plan / over / under / logged / none. | ~40 |
| N2 | `mos-app/src/lib/kitchen-kpis.ts` (+ `.test.ts`) | **Pure derived-KPI selector** (P-1). Takes the `lines` map + `actionType`; returns `{ plannedTotal, madeOfPlan, madeSoFar, madeOffPlan, pctComplete, itemsRemaining, unitsShort, plannedDishCount }`. **No React, no DB.** | ~60 |
| N3 | `mos-app/src/components/kitchen/kitchen-kpi-strip.tsx` (+ `.css`) | The 4-tile KPI strip (desktop) **and** its phone form (the one-line "Today · N planned · NN%" summary). Branches on an `isDesktop` prop. Renders `Pill` delta chips; no live-region (see §8). | ~120 |
| N4 | `mos-app/src/components/kitchen/kitchen-group-header.tsx` (+ `.css`) | A thin kitchen group header (`<tr class="grp">` on desktop; a `<div class="mgc-group-head">`-equivalent on phone). Caret + label (`--brand-navy-text`, structural navy) + count (tabular). **No "+ Add task" / overdue** (kitchen groups are the fixed Planned/Off-plan pair). Reuses the OD-P3-6 hairline style. | ~60 |
| N5 | `mos-app/src/components/kitchen/qty-cell.tsx` (+ `.css`) | The **desktop inline-editable "Made today" cell.** Flat tabular number at rest; compact −/+ stepper reveals on hover/focus (mock A's `.made-cell`). Calls the same `onQtyChange(qty)` contract as `WipItemStepper`. Renders the transfer-cap cue (`TRANSFER_SHORT_CUE`) inline when `capError` is set. | ~90 |
| N6 | `mos-app/src/components/kitchen/kitchen-log-row.tsx` (+ `.css`) | One desktop `<tr>` (50px, OD-P3-6 dense). Cells: Dish (name + category) · Plan · Stock · `<QtyCell>` · `<Pill>` (status). Reveals the variance-note field as a second `<tr>` when the line has `error && dirty` (FR-022). Mirrors `task-row.tsx` conventions. | ~110 |
| N7 | `mos-app/src/components/kitchen/kitchen-log-table.tsx` (+ `.css`) | The desktop `<table>`: sticky `<thead>` (OD-P4-10 overline), Planned/Off-plan groups via `<KitchenGroupHeader>`, `<KitchenLogRow>` per dish. Owns the client-side search + category filter (props in, filtered rows out). Loading = table-shape skeleton; empty = `<EmptyState>`. | ~160 |
| N8 | `mos-app/src/components/kitchen/kitchen-log-cards.tsx` (+ `.css`) | The phone reflow: the Planned-today section (cards) + the Off-plan section (collapsed under a "+ Add another dish" expander with a search box). Each card composes `<WipItemStepper>` (reused) inside mock-B's anatomy (plan-pill + big qty readout + delta `<Pill>` + category). | ~150 |

### 4.2 CHANGED files

| # | File | The change |
|---|---|---|
| C1 | `mos-app/src/pages/kitchen-log-page.tsx` | **Rewrite the render** to compose `<KitchenKpiStrip>` + the desktop/table `<KitchenLogTable>` **or** phone `<KitchenLogCards>` (via `useIsDesktop()`, one branch) + the sticky action footer (tally + Discard + Submit). Switch `<PageFrame>` to `variant="data"`. Add the client-side `search` + `category` + `collapsedGroups` state; call `useKitchenKpis(lines, actionType)` for the strip. **Preserve verbatim:** the `PageStatus` machine, `loadData`, `gateLine`, `handleQtyChange`, `handleNotesChange`, `handleActionTypeChange`, `handleSubmit`, the online/offline effect, the auth guard, the submit payload (no `status`/`org_id`/`submitted_by`), and the AC-020/021/022/030 behavior. Add `handleDiscard()` (→ `setLines(buildLines(...))` behind a confirm). |
| C2 | `mos-app/src/pages/kitchen-log-page.css` | **Rewrite** for full-bleed desktop (drop the 720px cap), the sticky desktop footer, the KPI-strip top spacing, the phone pinned-bar with tally. Tokens-only (the `kitchen-tokens.css.test.ts` RI-4 guard auto-covers new kitchen CSS — §11). |
| C3 | `mos-app/src/pages/kitchen-log-page.test.tsx` | **Extend.** Update the DOM selectors for the new shell (the journey *steps* change) but **assert the same goals** (AC-020/021/022/030, RI-2 offline-in-every-state, RI-3 touch-floors) — the BDD authoring rule. **Add** tests: KPI strip renders derived values; Planned/Off-plan group split; search-mini filters; category chip filters; Discard resets; sticky-footer tally; the reflow branch (mock `useIsDesktop`). |

### 4.3 Component APIs (props — no ambiguity for the implementer)

```ts
// N1 — kitchen-status.ts (pure)
export type KitchenStatus = { tone: PillTone; label: string }  // PillTone from ui/pill
export function kitchenStatus(input: {
  made: number; plan: number; isOffPlan: boolean
}): KitchenStatus
//   on-plan  (plan>0, made===plan)         → { tone:'success',     label:'On plan' }
//   over     (plan>0, made>plan)           → { tone:'warning',      label:`Over +${made-plan}` }
//   under    (plan>0, 0<made<plan)         → { tone:'destructive',  label:`Under −${plan-made}` }
//   not-started (plan>0, made===0)         → { tone:'destructive',  label:`Under −${plan}` }   // §6.3 open Q
//   logged   (plan===0, made>0)            → { tone:'neutral',      label:'Logged' }
//   none     (plan===0, made===0)          → { tone:'neutral', dot:false, label:'—' }   // dotless em-dash

// N2 — kitchen-kpis.ts (pure)
export interface KitchenKpis {
  plannedTotal: number        // Σ plan_qty over planned items (plan>0), current action_type
  madeOfPlan: number          // Σ qty_porsi over planned items (uncapped actual)
  madeSoFar: number           // Σ qty_porsi over ALL staged lines (qty>0)
  madeOffPlan: number         // madeSoFar − madeOfPlan
  pctComplete: number         // plannedTotal>0 ? round(madeOfPlan/plannedTotal*100) : 0
  itemsRemaining: number      // count of planned items where qty_porsi < plan_qty
  unitsShort: number          // Σ max(plan_qty − qty_porsi, 0) over planned items
  plannedDishCount: number    // count of planned items
}
export function useKitchenKpis(            // thin hook wrapper (memoized) for the page;
  lines: Record<string, KitchenLogLine>,   //  the PURE core is computeKitchenKpis() (unit-tested)
  actionType: KitchenActionType,
): KitchenKpis
export function computeKitchenKpis(lines, actionType): KitchenKpis  // the pure core

// N3 — kitchen-kpi-strip.tsx
export function KitchenKpiStrip(props: {
  kpis: KitchenKpis
  isDesktop: boolean
  actionType: KitchenActionType   // labels the tiles ("of plan" etc.)
})

// N4 — kitchen-group-header.tsx
export function KitchenGroupHeader(props: {
  label: string              // "Planned today" | "Off-plan"
  count: number              // dish count
  sub?: string               // optional tabular subtotal ("180 planned" / "log as produced")
  collapsed: boolean
  onToggle: () => void
  variant: 'table' | 'cards' // <tr> on desktop; <div> on phone
  colSpan?: number           // table variant only
})

// N5 — qty-cell.tsx
export function QtyCell(props: {
  itemName: string
  line: KitchenLogLine
  actionType: KitchenActionType
  onQtyChange: (qty: number) => void
  disabled?: boolean
})

// N6 — kitchen-log-row.tsx
export function KitchenLogRow(props: {
  item: WipItemOption
  line: KitchenLogLine
  actionType: KitchenActionType
  onQtyChange: (qty: number) => void
  onNotesChange: (note: string) => void
  disabled?: boolean
})
//   renders <tr> + (when line.error && line.dirty) a second <tr class="kl-note-row"> with the note <textarea>.

// N7 — kitchen-log-table.tsx
export function KitchenLogTable(props: {
  items: WipItemOption[]
  lines: Record<string, KitchenLogLine>
  actionType: KitchenActionType
  search: string
  category: string              // "All" | <category>
  collapsedGroups: Set<string>
  onQtyChange: (itemId: string, qty: number) => void
  onNotesChange: (itemId: string, note: string) => void
  onToggleGroup: (key: string) => void
  onSearchChange: (s: string) => void
  onCategoryChange: (c: string) => void
  disabled?: boolean
})

// N8 — kitchen-log-cards.tsx  (same prop shape as KitchenLogTable; renders cards instead)
```

---

## 5. The derived-KPI compute (P-1 — the parity-critical piece)

This is the **only** new "logic", and it is **pure client-side derivation** over already-fetched state
— no DB, no RPC, no fetch, no ESB. It lives in **`mos-app/src/lib/kitchen-kpis.ts`** as a pure function
`computeKitchenKpis(lines, actionType)` + a thin memoized hook `useKitchenKpis()` for the page. The pure
core is unit-tested directly (no React, no mocks — §10 task 2).

### 5.1 The derivation (worked example = mock C's numbers)

Given the mock-C/A staged lines for `Production` (6 planned: Nasi 48/50, Risoles 36/30, Ayam Gulai
25/25, Pisang 22/40, Sayur 9/15, Ayam Goreng Lengkuas 0/20; 3 off-plan logged: Ayam Suwir 12, Bakwan
15, Sambal 8):

```
plannedTotal     = 50+30+25+40+15+20            = 180
madeOfPlan       = 48+36+25+22+9+0              = 140   (uncapped actual on planned items)
madeSoFar        = 140 + (12+15+8)              = 175
madeOffPlan      = 175 − 140                    = 35
pctComplete      = round(140 / 180 * 100)       = 78
itemsRemaining   = count(plan>0 && qty<plan)    = 4   (Nasi, Pisang, Sayur, Ayam Goreng Lengkuas)
unitsShort       = (50−48)+(40−22)+(15−9)+(20−0)= 46
plannedDishCount = 6
```

These match mock C's KPI tiles exactly (180 / 175 [+35 off-plan] / 78% / 4 [−46 short]). The function
reads **only** `line.plan_qty`, `line.qty_porsi` for the current `actionType` — both already in the
`lines` state built by the existing `buildLines()` (which reads `planMap[item.id]?.[actionType] ?? 0`).

### 5.2 The 4 tiles → which derivation each shows

| Tile | Value (23px/600 tabular) | Delta `<Pill>` | "vs." sub (`--text-tertiary`) |
|---|---|---|---|
| **Planned total** | `plannedTotal` | `neutral` `{plannedDishCount} dishes` (dotless) | `portions` |
| **Made so far** | `madeSoFar` | `madeOfPlan < plannedTotal` → `destructive` `−{plannedTotal-madeOfPlan} vs plan`; else `success` `on plan` | `+{madeOffPlan} off-plan` (only when `madeOffPlan>0`) |
| **% complete** | `{pctComplete}%` | `neutral` `{madeOfPlan} of {plannedTotal}` (dotless) | `of plan` |
| **Items remaining** | `itemsRemaining` | `itemsRemaining>0` → `destructive` `−{unitsShort} units short`; else `success` `all on plan` | `of target` |

Edge case (no plan for this action_type — `plannedTotal===0`, e.g. a Transfer day with no transfer plan
yet): tiles read `0 / {madeSoFar} / —% / 0`, delta chips go `neutral` ("no plan set"). The strip never
divides by zero (`pctComplete = 0` when `plannedTotal===0`, label `—%`).

### 5.3 Why this is parity-safe (P-1)

- **No new data source.** `lines` is the existing page state (`buildLines()` → `planMap` + `stockMap` +
  `wipItems`, all already fetched). The strip is a `useMemo` view over it.
- **No new write path.** The strip is read-only; it never calls `insertKitchenLogBatch` or any RPC.
- **No new persistence.** Nothing is stored; the strip recomputes on every render from in-memory state.
- **No ESB change.** The submit payload is byte-identical to today (P-2); the strip does not touch it.

---

## 6. Status mapping + the mock-B tension + open semantics

### 6.1 The resolved status mapping (on/over/under/logged/none → `Pill` tone)

The five `kitchenStatus()` cases (N1) map onto the existing `Pill` tones — **no new hue, no new token**:

| made vs plan | Pill `tone` | Dot | Label | DESIGN.md token backing |
|---|---|---|---|---|
| `made === plan` (on-plan) | `success` | yes (green) | `On plan` | `--ds-color-green` dot + `--status-won-text` |
| `made > plan` (over) | `warning` | yes (amber) | `Over +{n}` | `--ds-color-amber` dot + `--status-lost-text` (the AA-darkened amber family; `--warning-foreground`) |
| `0 < made < plan` (under) | `destructive` | yes (red) | `Under −{n}` | `--ds-color-red` dot + `--status-lost-text` |
| `plan === 0 && made > 0` (off-plan logged) | `neutral` | yes (grey) | `Logged` | `--ds-font-color-light` dot + `--text-secondary` |
| `plan === 0 && made === 0` (off-plan, nothing) | `neutral` | **no** | `—` | dotless em-dash, `--text-light` |

This satisfies the **Tinted-Status Rule** (8px dot + tinted pill + AA-darkened text, never a solid fill)
and the **One-Blue Rule** (no blue anywhere in the status column).

### 6.2 The mock-B tension (RESOLVED here — flagged for owner)

The three mockups disagree on "over plan":
- **A & C** render `over` as **amber** (a caution / variance) and `under` as **red** (a shortfall).
- **B** renders `over` as **green** (`delta.up`, reading "made more = good") and `under` as **red**.

**Resolution adopted (A/C):** over = **amber/warning**, under = **red/destructive**, on = **green**.
Rationale: the existing **variance-note gate (FR-022) fires on BOTH over and under** — any `qty ≠
effectiveTarget` is off-plan and needs a note. So "over" is **not** unambiguously good; it is a
*variance* (a thing to note), distinguished from "under" only by direction. B's green-for-over would
misread the gate. A/C's amber-for-over reads correctly: "you made more than planned — note why."
**Flagged for owner** (§13 OQ-1): if the owner prefers green-for-over, only `kitchenStatus()` changes —
no token, no layout.

### 6.3 The "not-started" open question (flagged — default adopted)

All three mockups raise this. A planned dish with `made === 0` is currently rendered `Under −{plan}` in
**red** (a shortfall). Semantically that conflates "not started yet" (pending) with "fell short"
(shortfall). **Default adopted (red):** keeps the mapping a pure function of `(made, plan)` with no
extra state, and matches the existing variance-note gate (a not-started planned dish DOES need
attention). **Flagged for owner** (§13 OQ-2): if the owner wants `not-started` rendered **amber**
(pending) and red reserved for `0 < made < plan`, the only change is a branch in `kitchenStatus()` — no
new token. (This is a semantics split, not a new color — all three mockups' open-questions block agrees.)

---

## 7. All states → token + primitive (the full matrix)

Every state the screen can be in, mapped to its token + primitive. (The existing page already handles
most; the redesign preserves them and adds the KPI/group variants.)

| State | Trigger | Render | Tokens / primitive |
|---|---|---|---|
| **loading** | `status==='loading'` (initial / retry) | Chrome stays (PageHead + ActionTypeSeg disabled). **Desktop:** 4 skeleton KPI tiles + a table-shape `<SkeletonRows>` (5 rows, 5 cols). **Phone:** the summary strip skeleton + 3 card skeletons. `aria-busy="true"` + `sr-only` "Loading items". | `<SkeletonRows>`; skeleton bars `--surface-tertiary`; tiles `--card` + `--border` (no shadow while skeleton). |
| **error (data)** | `status==='error'` | `<ErrorState>` (or the bespoke `.kl-error` block that also surfaces `<OfflineBanner>` + a 44px-touch Retry, RI-2/RI-3). | `--status-lost-text` message; `.btn-outline` Retry (`min-height:44px`). |
| **empty (no WIP items)** | `wipItems.length===0` | PageHead + `<EmptyState title="No active WIP items" copy="Ask an ops lead to add items.">`. **No KPI strip** (nothing to derive). | `<EmptyState>` tokens (`--text-secondary`). |
| **zero-entered** | items loaded, no `qty_porsi>0` | Full table/cards render, all qtys 0. KPI strip reads `plannedTotal / 0 / 0% / {plannedDishCount} remaining`. Status column: planned items `Under −{plan}` (red), off-plan `—`. **Submit disabled** (`stagedCount===0`). | same as populated; `.made-val.zero` → `--text-light`. |
| **on-plan** | `plan>0 && made===plan` | row StatusPill `success` `On plan`; KPI tile deltas update. | `Pill tone="success"`. |
| **over-plan** | `plan>0 && made>plan` | row StatusPill `warning` `Over +{n}`; KPI `%` can exceed 100. | `Pill tone="warning"`. |
| **under-plan** | `plan>0 && 0<made<plan` | row StatusPill `destructive` `Under −{n}`. | `Pill tone="destructive"`. |
| **off-plan logged** | `plan===0 && made>0` | row StatusPill `neutral` `Logged` (grouped under Off-plan). | `Pill tone="neutral"`. |
| **focused/active qty (desktop)** | QtyCell hover/focus | Flat number hides; compact −/+ stepper reveals; the `<input>` gets the One-Blue focus ring. | input border `--accent`; ring `2px --accent offset 2px`; buttons `--card`+`--border`. |
| **focused/active qty (phone)** | the WipItemStepper + button focus | The 44px `+` button gets the One-Blue ring (mock B). | (unchanged — `WipItemStepper`). |
| **transfer cap (FR-023)** | `transferExceedsAvailable(line, actionType)` | **Desktop:** QtyCell shows the cap cue inline + the input border → `--destructive`; **Phone:** WipItemStepper shows `.kls-cap`. **Submit disabled** (`hasBlockingError`). | cue `--status-lost-text` (`--field-error-text`); border `--destructive`. |
| **variance-note required (FR-022)** | `needsVarianceNote && !notes.trim()` (`dirty`) | The row reveals the note field: **desktop** a second `<tr class="kl-note-row">` with a `<textarea>`; **phone** the WipItemStepper's `.kls-note-wrap`. **Submit blocks** (re-gates on submit, surfaces per-line error). | cue `.kls-note-cue`; textarea `.kls-note` (existing tokens). |
| **submitting** | `status==='submitting'` | Submit → "Submitting…", `aria-busy`, all qty inputs/buttons `disabled`. ActionTypeSeg disabled. | `.btn-primary[disabled]` (existing). |
| **submit-error** | `insertKitchenLogBatch` throws | The existing `.kl-banner-error` (`role="alert"`) above the form. Status returns to `ready`; staged lines preserved. | `.kl-banner-error` (`--destructive` tint + `--status-lost-text`). |
| **success** | submit resolved | The existing `.kl-banner-success` (`role="status"`, `aria-live="polite"`) "N lines submitted — pending review." Lines reset via `buildLines()`. | `.kl-banner-success` (`--success` tint + `--status-won-text`). |
| **offline (RI-2)** | `!navigator.onLine` | The existing `<OfflineBanner>` (`role="alert"`) renders in **every** state (loading/error/ready/submitting). Submit disabled. | `.kl-banner-offline` (`--warning` tint + `--warning-foreground`). |
| **BU-resolution failure** | `resolveKitchenBuId()` throws on load | The error state ("Couldn't load items…"). | (error state). |
| **unauthenticated / orphan** | `auth.status !== 'authenticated'` | The auth guard (sign-in link). | (unchanged). |

---

## 8. Responsive (the 768px reflow + phone anatomy)

### 8.1 Desktop / tablet (≥768px) — A + C-KPI

```
┌─ PageFrame variant="data" (full-bleed) ─────────────────────────────────────┐
│ PageHead: "Kitchen · Log" + {logDate} pill                                   │
│ ┌─ KitchenKpiStrip (4 tiles, desktop form) ───────────────────────────────┐ │
│ │ [Planned total] [Made so far] [% complete] [Items remaining]            │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Toolbar ───────────────────────────────────────────────────────────────┐ │
│ │ [Production · → Radiant · → Bungur]   ⌕ Find a dish   Category: All ▾   │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ KitchenLogTable (<table>, sticky thead, 50px rows) ────────────────────┐ │
│ │ ▾ Planned today  (6 · 180 planned)                                      │ │
│ │   Nasi Putih | Rice      | 50 | 30 | [48 ▾] | ● Under −2                │ │
│ │   …                                                                     │ │
│ │ ▾ Off-plan       (26 · log as produced)                                 │ │
│ │   …                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Sticky action footer (flat) ───────────────────────────────────────────┐ │
│ │ 8 dishes entered · 175 units · pending review on Submit   [Discard] [Submit 8 entries →] │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **KPI strip:** 4 tiles in a `grid-template-columns: repeat(4, 1fr)` (gap `--spacing-3`). Each tile =
  the DESIGN.md KPI-tile signature (12px radius, `--shadow-rest`, 16px pad, 30px tinted icon tile +
  12.5px label + 23px/600 tabular value + `<Pill>` delta + "vs." sub). **Not a live region** (updates
  are user-driven; announcing "% changed to 80%" on every keystroke is noise — the visible update is
  the cue). `aria-label="Plan vs actual summary"` on the `<section>`.
- **Toolbar:** the ActionTypeSeg + a search-mini (200px, `--card`+`--border`, `--radius-sm`) + a
  category `chip` (bordered, mirrors the Tasks toolbar chip; v1 = a styled native `<select>` to avoid a
  new popover — §13 OQ-3). The toolbar is **flat** (utility surface — no `--shadow-rest`).
- **Table:** sticky `<thead>` (38px, OD-P4-10 overline: `--text-tertiary`, 11px, weight **400**,
  uppercase, 0.06em tracking), 50px body rows (OD-P3-6 dense DB-view), divider `--border/70%`, row hover
  `--accent/60%` (the quiet hover wash). Numeric columns right-aligned + `tabular-nums` (the
  Tabular-Numbers Rule; Inter-tabular fallback already engaged app-wide per DESIGN.md note 7).
- **Group headers:** `<KitchenGroupHeader variant="table">` — hairline top+bottom `--border`, flat,
  caret `--text-tertiary`, label `--brand-navy-text` (13px/700, structural navy), count `--text-tertiary`
  tabular, optional subtotal. Both groups **always shown** (layout stability — OD-P3-6); default expanded.
- **QtyCell:** flat tabular number at rest (zero → `--text-light`); on `:hover` / `:focus-within` the
  number hides and the compact −/+ stepper (28px buttons + 48px input) reveals; the focused input gets
  the One-Blue ring. Cap cue inline below when `capError`.
- **Sticky action footer:** 56px, `--card` bg, top `--border`, **flat** (utility surface — the one
  deliberate exception to "only cards get shadow"; mock A shows it flat). Tally number (Plus Jakarta
  18px/600 tabular) + label + sub. `Discard` = `.btn-outline`; `Submit` = `.btn-primary` (the ONE blue +
  `--shadow-brand-button`).

### 8.2 Phone (<768px) — B floor-fast

```
┌─ phone viewport ──────────────────────┐
│ ☰  Kitchen › Log            (avatar)   │  52px top bar (rail collapsed <920px)
│ [Production · → Radiant · → Bungur]    │  full-width ActionTypeSeg (≥40px touch)
│ ◷ Today · 6 planned · 78%              │  KitchenKpiStrip (phone form = 1 summary line)
│ ─────────────────────────────────────  │
│ PLANNED TODAY · 6                      │  section header (structural navy overline)
│ ┌────────────────────────────────────┐ │
│ │ Nasi Putih            [plan 50]     │ │  dish card (--shadow-rest)
│ │ Rice / Staple                         │ │
│ │  [−]      48       [+]  portions      │ │  44px −/+ (WipItemStepper, reused)
│ │ ● 2 under plan · stock 30             │ │  delta <Pill>
│ └────────────────────────────────────┘ │
│ …(5 more planned cards)                │
│ OFF-PLAN · 26                          │
│ ┌ ─ ─ + Add another dish ─ ─ ─ ─ ─ ─ ┐ │  dashed expander (--border-strong)
│ │ ⌕ Find an off-plan dish              │ │  search box (revealed on expand)
│ │ (peek of already-logged off-plan)    │ │
│ └────────────────────────────────────┘ │
│────────────────────────────────────── │
│ 8 entries ready · 175 units · pending  │  pinned submit bar (top shadow exception)
│ [       Submit 8 entries →        ]    │  48px (the one big-touch control exception)
└────────────────────────────────────────┘
```

- **KitchenKpiStrip phone form:** a single compact summary strip (mock B's `.plan-sum`): one line "Today
  · {plannedDishCount} planned · {pctComplete}%", `--card`+`--border`, **flat** (utility strip). This is
  the KPI strip's phone rendering — same component, `isDesktop` branch (one branch in the DOM).
- **Cards:** `<KitchenLogCards>` — each Planned card composes `<WipItemStepper>` (reused — the 44px −/+,
  the note field, the cap cue are already built + tested) inside mock-B's anatomy: dish name (15px/600) +
  category sub-label + a `plan-pill` (top-right, `Pill tone="neutral" dot={false}`, `plan {n}`) + the big
  qty readout (Plus Jakarta 30px/600 tabular; zero → `--text-light`) + a delta `<Pill>` foot ("● 2 under
  plan · stock 30"). Card = 12px radius + `--shadow-rest` (OD-P3-11).
- **Off-plan expander:** the Off-plan section renders collapsed by default on phone — a dashed
  `--border-strong` expander ("+ Add another dish") with a search box; expanding reveals the off-plan
  cards (filtered by the same search). A "peek" of already-logged off-plan items (mock B) shows up to 3
  to prove off-plan capture works without cluttering the line.
- **Pinned submit bar:** 72px+, `--card` bg + top `--border` + the one bottom shadow
  (`0 -4px 16px / 0.05`, mock B). The 48px Submit = the ONE big-touch exception (mirrors the ≥44px −/+
  pair; OD-P0-3 phone-usable). Tally row above it ("8 entries ready · 175 units · pending review").
- **44px touch targets:** every phone interactive control ≥44px (the WipItemStepper buttons already
  carry `data-touch-target="true"`; the submit bar is 48px; the expander tap area ≥44px). RI-3 preserved.

---

## 9. A11y (WCAG-AA)

- **Table semantics (desktop):** `<table aria-label="Kitchen production log — enter made-today quantity
  per dish">` + `<thead>` with `<th scope="col">` (Dish / Plan / Stock / Made today / Status) + `<tbody>`.
  Numeric `<th>`/`<td>` right-aligned. Group headers are `<tr>` with `<td colSpan={5}>` (the count is in
  the cell, not a `<th>` — they are not column headers).
- **Segmented control:** `role="tablist"` + `role="tab"` + `aria-selected` (already in `ActionTypeSeg`).
- **KPI strip:** `<section aria-label="Plan vs actual summary">`. Each tile is a `<div>` (not a list —
  the 4 tiles are not a navigable list); the visible label + value is the accessible name. **No
  `role="status"` / `aria-live`** — the values update on user input (announcing them is noise; the
  visible change is the cue). The `?` help glyphs are `aria-label`-titled `<span>`s (or omitted in v1).
- **QtyCell keyboard model:** the `<input type="number" role="spinbutton" min={0} step={1}>` is the
  primary tab stop per row; the −/+ are real `<button>`s (keyboard-focusable, increment/decrement).
  Tab order follows DOM: row → qty input → − → + → (note `<textarea>` when revealed) → next row. The note
  `<textarea>` has `aria-label="Note for {dish}"`. (Mirrors the shipped `WipItemStepper` model exactly.)
- **StatusPill:** `<Pill>` with a leading dot that is `aria-hidden` (redundant cue); the visible word
  ("On plan" / "Over +6" / "Under −2" / "Logged" / "—") is the accessible name. WCAG 1.4.1 satisfied even
  without the dot (the word is the non-color cue).
- **Focus-visible:** the global `*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`
  applies to every focusable element (the QtyCell input, the −/+ buttons, the seg tabs, the chips, the
  search-mini, Discard, Submit). No per-component focus styles.
- **Contrast (≥4.5:1):** status pill text uses the AA-darkened tokens (`--status-won-text` /
  `--status-lost-text` / `--warning-foreground`); muted text uses `--text-secondary` / `--text-tertiary`
  (clear AA); the Submit is `--text-inverted` on `--accent` (≥4.5:1); the delta `<Pill>` text reuses the
  same AA-darkened tokens. The One-Blue Rule keeps blue to ≤10% of the screen (Submit + its focus ring +
  the active nav icon — the last is shell, not this screen).
- **Tabular-nums:** on every figure — Plan / Stock / Made-today / status delta / tally / KPI values /
  KPI "of plan" sub / group counts. (The Inter-tabular fallback is already engaged app-wide.)
- **Group collapse:** the `<KitchenGroupHeader>` caret carries `aria-expanded`; collapsing hides the
  group's rows/cards (display:none) — the AT tree reflects it. Both groups are shown by default (the
  Planned/Off-plan structure is always perceivable).

---

## 10. TDD task list (ordered, 2–5 min each, red → green)

Every task writes the **test first** (red), then the implementation (green), then runs the exact verify
command. No prod code without a failing test. All paths are under `mos-app/`.

### Phase 0 — pure utils (no React; fastest TDD loop)

**Task 1 — `kitchen-status.ts` (N1).** Red: write
`src/lib/kitchen-status.test.ts` with the 6 cases (on-plan / over / under / not-started / logged / none)
asserting `{ tone, label }`. Green: implement `kitchenStatus({ made, plan, isOffPlan })` per §6.1.
Verify: `cd mos-app && npm test -- src/lib/kitchen-status.test.ts`

**Task 2 — `kitchen-kpis.ts` (N2).** Red: write `src/lib/kitchen-kpis.test.ts` against the mock-C
fixture (§5.1) asserting `plannedTotal=180, madeOfPlan=140, madeSoFar=175, madeOffPlan=35,
pctComplete=78, itemsRemaining=4, unitsShort=46, plannedDishCount=6` + the `plannedTotal===0` edge
(`pctComplete=0`, label `—%`). Green: implement `computeKitchenKpis(lines, actionType)` (pure) + the
`useKitchenKpis()` memoized hook wrapper. Verify: `cd mos-app && npm test -- src/lib/kitchen-kpis.test.ts`

### Phase 1 — presentational primitives (RTL)

**Task 3 — `KitchenKpiStrip` (N3).** Red: write
`src/components/kitchen/kitchen-kpi-strip.test.tsx` — desktop branch renders 4 tiles with the fixture
values + the delta `<Pill>`s + `aria-label="Plan vs actual summary"`; phone branch renders the one-line
"Today · 6 planned · 78%" summary. Green: implement + `.css` (KPI-tile signature). Verify:
`cd mos-app && npm test -- src/components/kitchen/kitchen-kpi-strip.test.tsx`

**Task 4 — `KitchenGroupHeader` (N4).** Red: write
`src/components/kitchen/kitchen-group-header.test.tsx` — `variant="table"` renders a `<tr>` with caret
(`aria-expanded`) + label + count; `variant="cards"` renders the `<div>` equivalent; `onToggle` fires.
Green: implement + `.css` (OD-P3-6 hairline). Verify:
`cd mos-app && npm test -- src/components/kitchen/kitchen-group-header.test.tsx`

**Task 5 — `QtyCell` (N5).** Red: write `src/components/kitchen/qty-cell.test.tsx` — flat number at rest
(queryable); the −/+ stepper reveals on focus; `+` calls `onQtyChange(+1)`; `−` calls `onQtyChange(−1)`
and is disabled at 0; direct numeric input works; the cap cue renders when `capError` is set. Green:
implement + `.css` (mock A `.made-cell`). Verify:
`cd mos-app && npm test -- src/components/kitchen/qty-cell.test.tsx`

**Task 6 — `KitchenLogRow` (N6).** Red: write
`src/components/kitchen/kitchen-log-row.test.tsx` — renders dish name + category, plan, stock, a
`QtyCell`, a status `<Pill>` (on/over/under/logged via the §6.1 cases); reveals the note `<textarea>`
only when `line.error && line.dirty`. Green: implement + `.css` (50px row, OD-P3-6). Verify:
`cd mos-app && npm test -- src/components/kitchen/kitchen-log-row.test.tsx`

**Task 7 — `KitchenLogTable` (N7).** Red: write
`src/components/kitchen/kitchen-log-table.test.tsx` — renders the `<thead>` (5 columns), the Planned +
Off-plan `<KitchenGroupHeader>`s, a `<KitchenLogRow>` per visible dish; the search-mini filters rows by
name; the category chip filters by category; collapsing a group hides its rows. Green: implement +
`.css`. Verify: `cd mos-app && npm test -- src/components/kitchen/kitchen-log-table.test.tsx`

**Task 8 — `KitchenLogCards` (N8).** Red: write
`src/components/kitchen/kitchen-log-cards.test.tsx` — renders Planned section cards (each composing
`WipItemStepper` + the mock-B anatomy), the Off-plan expander (collapsed by default; expands to reveal
off-plan cards / a search); the section headers. Green: implement + `.css`. Verify:
`cd mos-app && npm test -- src/components/kitchen/kitchen-log-cards.test.tsx`

### Phase 2 — the page rewrite (compose + preserve behavior)

**Task 9 — Rewrite `kitchen-log-page.tsx` (C1) + `.css` (C2).** Red FIRST: run the existing
`src/pages/kitchen-log-page.test.tsx` — it will break on DOM selectors (the journey *steps* changed) but
the **goals** (AC-020 note reveals, AC-021 note blocks submit, AC-022 transfer cap blocks submit +
keeps the typed qty, AC-030 submit payload omits `status`/`org_id`/`submitted_by`, RI-2 offline-in-every-
state, RI-3 touch floors) must still be assertable. Update the test's selectors to the new shell; keep
the goal-oracles intact (BDD authoring rule). Green: compose `<KitchenKpiStrip>` + the
`useIsDesktop()` branch (`<KitchenLogTable>` | `<KitchenLogCards>`) + the sticky footer; preserve every
state machine, hook, gate, handler, the submit payload, the auth guard. Switch to
`<PageFrame variant="data">`. Add `handleDiscard()`. Verify:
`cd mos-app && npm test -- src/pages/kitchen-log-page.test.tsx`

**Task 10 — Add the new page tests (C3).** Red: add tests — (a) KPI strip renders the derived values
from a staged fixture; (b) Planned/Off-plan group split (a planned item lands in Planned, an unplanned
one in Off-plan); (c) search-mini filters; (d) category chip filters; (e) Discard (confirmed) resets
all `qty_porsi` to 0; (f) the sticky-footer tally reads `{stagedCount} dishes · {madeSoFar} units`; (g)
the reflow branch — mock `useIsDesktop` → only the table OR the cards are in the DOM (never both; no
`aria-hidden` on the absent branch). Green: the implementation already satisfies these from task 9.
Verify: `cd mos-app && npm test -- src/pages/kitchen-log-page.test.tsx`

**Task 11 — Regression guards still green.** The `kitchen-css-namespace.test.ts` (CSS namespace) and
`kitchen-tokens.css.test.ts` (RI-4 — every `var(--…)` is defined) auto-glob the new kitchen `.css`
files; confirm they pass (a new undefined token would fail here). Verify:
`cd mos-app && npm test -- src/components/kitchen/kitchen-css-namespace.test.ts src/components/kitchen/kitchen-tokens.css.test.ts`

### Phase 3 — gates

**Task 12 — Typecheck + lint (merge gates).** Zero errors on both.
Verify: `cd mos-app && npm run typecheck && npm run lint -- --max-warnings=0`

**Task 13 — Full kitchen suite green.**
Verify: `cd mos-app && npm test -- src/lib/kitchen src/components/kitchen src/pages/kitchen-log-page`

> **Coverage gate (AGENTS.md):** ≥80% lines on changed code to merge. The pure utils (tasks 1–2) are
> 100%-coverable; the components (tasks 3–8) cover every state per the matrices in §7. The page tests
> (tasks 9–10) re-cover the preserved ACs + the new presentational behavior.

> **E2E (AC-090/091) are owned at the Playwright layer, NOT added here** — they assert the real
> cross-stack submit→Review→approve→ESB journey, which is unchanged (P-2). The existing e2e selectors
> for the kitchen log journey will need the same DOM-selector updates as task 9 (journey *steps*
> change; the goal-oracle is intact). That update is a release-engineer task at ship time, not a
> design-plan item.

---

## 11. Scope note — what this plan does NOT cover (fast-follows)

**This plan = the Log screen only.** The other four kitchen surfaces are fast-follows that **inherit
the components built here**:

| Fast-follow | Inherits | Notes |
|---|---|---|
| **Plan editor + "pesanan"** (`/mos/kitchen/plan`) | `KitchenLogTable` (the table grammar), `KitchenKpiStrip` (a planned-vs-pesanan variant) | The plan editor is an editable-table variant of `KitchenLogTable`; the 14-day pesanan horizon reuses the table + group-header. |
| **Review / Approve queue** (`/mos/kitchen/review`) | `KitchenLogTable` (read-only rows), the `Pill` status vocabulary (Submitted/Approved/Rejected) | The review queue is a read-only `KitchenLogTable` + the approve/reject actions (the genuine review lifecycle — A4 lives here, NOT on Log). |
| **Stock view** (`/mos/kitchen/stock`) | `KitchenLogTable` (read-only), the tabular-nums discipline | The stock view is a read-only table of `stok` / `tersedia` per item. |
| **Pushes / outbox** (`/mos/kitchen/pushes`) | `KitchenLogTable` (read-only), `Pill` (status) | The outbox surface — a read-only table of `integrations.esb_push` rows. |

Building these components **once** here (N3–N8) is the ROI of this slice — the four fast-follows each
become a thin composition over the same primitives, not four bespoke screens.

---

## 12. Tokens per piece (citation — DESIGN.md token names + the app alias form)

Every visual decision names a `DESIGN.md` token. The app's alias forms (`--surface-*` / `--text-*` /
`--accent` / `--radius-*` in `styles/tokens/aliases.css`, plus the shadcn-role forms
`--background`/`--border`/`--card`/`--primary`/`--muted-foreground` used by the sibling kitchen CSS) are
interchangeable — both are defined. **For consistency with the sibling kitchen CSS
(`wip-item-stepper.css`, `action-type-seg.css`), the new kitchen `.css` files prefer the shadcn-role
forms** (`--background`, `--border`, `--card`, `--primary`, `--muted-foreground`, `--radius-sm`,
`--radius-md`, `--status-lost-text`); the design-kit semantic aliases are cited below as the
identity-authority mapping.

| Piece | Tokens used (DESIGN.md name → app form) |
|---|---|
| **KPI tile (N3)** | `card` → `--card`; `border` → `--border`; `rounded.lg` → `--radius-md` (12px); `shadows.rest` → `--shadow-rest`; label `muted-foreground` → `--muted-foreground`; value 23px/600 Plus Jakarta `foreground` → `--text-primary` (via `--foreground`); icon tile = `--ds-tag-background-{green/amber/red/gray}` + `--ds-tag-text-{…}`; delta `<Pill>` (success/destructive/neutral). |
| **Toolbar** | `card` bg, `border` bottom; flat (no shadow — utility surface). search-mini + chip = `input` border → `--border`, `rounded.sm` → `--radius-sm`, `muted-foreground` → `--muted-foreground`. |
| **Table thead (N7)** | OD-P4-10 overline: `card` bg, `muted-foreground` (lighter) → `--muted-foreground`/`--text-tertiary`, 11px, weight **400**, uppercase, 0.06em; `border` bottom. |
| **Table body row (N6/N7)** | 50px (OD-P3-6 dense); `card` bg; divider `border/70%`; hover `accent/60%`; dish name `foreground` 13.5px/500; category `muted-foreground` 11px; numeric cells right-aligned `tabular-nums`. |
| **QtyCell (N5)** | value `foreground` tabular (zero → `--text-light`); stepper buttons `card` + `border` + `muted-foreground`, hover `accent` wash; focused input border `primary` → `--accent`, ring `2px --accent offset 2px`; cap cue `--status-lost-text`. |
| **StatusPill** | `<Pill>` tones: success/warning/destructive/neutral (dot + AA-darkened text per §6.1). |
| **Group header (N4)** | hairline `border` top+bottom; `card` bg; flat; caret `muted-foreground`; label `brand-navy-text` 13px/700 (structural navy); count `muted-foreground` tabular. |
| **Sticky footer (desktop)** | `card` bg + `border` top; flat. tally number Plus Jakarta 18px/600 `foreground` tabular; label `muted-foreground`. `Discard` = `.btn-outline`; `Submit` = `.btn-primary` (`primary` → `--accent` + `primary-foreground` → `--text-inverted` + `--shadow-brand-button`). |
| **Phone summary strip (N3 phone)** | `card` + `border`; flat (utility strip). icon tile `--ds-background-tertiary`; text `foreground`/`muted-foreground`; `tabular-nums`. |
| **Phone dish card (N8)** | `card` + `border` + `rounded.lg` → `--radius-md`; `shadows.rest` → `--shadow-rest`. plan-pill = `<Pill tone="neutral" dot={false}>`. qty readout Plus Jakarta 30px/600 `foreground` tabular (zero → `--text-light`). −/+ 44px: minus `card`+`border`+`muted-foreground`; plus `secondary` → `--surface-tertiary`. delta `<Pill>`. (The note + cap come from the reused `WipItemStepper`.) |
| **Off-plan expander (N8)** | dashed `border-strong` → `--border-strong`; `secondary` → `--surface-secondary` bg; `foreground`/`muted-foreground` text. |
| **Pinned submit bar (phone)** | `card` bg + `border` top + the one bottom shadow `0 -4px 16px / 0.05`; 48px Submit `primary` + `primary-foreground` + `shadows.rest`; tally Plus Jakarta 18px/600 tabular. |

**One-Blue Rule audit:** the only blue on the screen is **Submit** (+ its focus ring) + the active nav
icon (shell, not this screen). KPI tiles, status pills, plan pills, delta chips, group labels (navy =
structural, not action) — none are blue. ✓
**Soft-Elevation audit:** `--shadow-rest` rests ONLY on the KPI tiles (desktop), the phone dish cards,
and the Submit seat. Toolbar, table rows, group headers, sticky footer, phone summary strip, off-plan
expander — all flat. ✓

---

## 13. Open questions for the owner (flagged — none block the build)

- **OQ-1 (§6.2 — mock-B tension):** over-plan rendered **amber** (adopted, A/C) or **green** (mock B)?
  Default adopted = amber (consistent with the FR-022 variance-note gate firing on over AND under). A
  flip is a one-line change in `kitchenStatus()`. **Recommend: amber (adopted).**
- **OQ-2 (§6.3 — not-started):** a planned dish with `made===0` rendered **red** "Under −{plan}"
  (adopted) or **amber** "Not started" (pending)? Default adopted = red (pure function, matches the
  existing gate). A split is a branch in `kitchenStatus()`, no new token. **Recommend: red (adopted);
  revisit if floor staff find it demoralizing.**
- **OQ-3 (toolbar category chip):** v1 = a styled native `<select>` (no new popover dependency) or a
  proper popover-menu chip (matches the Tasks toolbar `control` chip exactly)? **Recommend: native
  `<select>` styled to the chip for v1 (parity-safe, faster); promote to a popover when the shared
  popover primitive lands.**
- **OQ-4 (Discard confirm):** inline modal (reuse the `ConfirmArchive` pattern) or native
  `window.confirm`? **Recommend: a small inline confirm modal (consistency with task archive; the
  consequential-action invariant).**
- **OQ-5 (KPI "Made so far" headline):** mock C shows `175` (total incl. off-plan) with a "+35 off-plan"
  sub and the `%` tile using `140/180`. **Adopted** (§5.2): Made so far = `madeSoFar` (total); % = made-of-
  plan / planned-total. Confirm the owner wants the *total* as the headline (not made-of-plan). **Recommend:
  total (adopted) — it is the truer "how much did we make" number; the % tile carries the plan-completion
  view.**

---

## 14. DESIGN.md / parity tension log (what the design-architect hit + resolved)

| # | Tension | Resolution |
|---|---|---|
| T-1 | The three mockups disagree on over-plan color (A/C amber vs B green). | **Resolved §6.2** — amber (A/C), because FR-022 fires on over AND under; flagged OQ-1. No new token. |
| T-2 | A/C raise a "not-started = amber vs red" semantics split. | **Resolved §6.3** — red (default), pure function; flagged OQ-2. No new token. |
| T-3 | Mock A's footer chip "2 need a variance note" implies a new aggregate gate. | **Dropped** per OD-K-5 (P-3). The per-line note field (FR-022) stays; the footer aggregate chip does not. Submit still blocks on any missing note (existing `handleSubmit` re-gate, preserved). |
| T-4 | Mock A's "◷ Today ▾" date chip implies a date picker. | **Dropped** — today-only is the existing behavior; the date chip is a fast-follow. |
| T-5 | The KPI strip is "new logic" — does it breach parity (P-1)? | **No** — it is a pure client-side `useMemo` over already-fetched `lines` (§5.3). No new table/column/RPC/fetch/ESB. Unit-tested as a pure function (task 2). |
| T-6 | The screen must be full-bleed (OD-P3-6) but the shipped page is 720px-capped (`variant="prose"`). | **Resolved §3.2** — switch to `<PageFrame variant="data">` (the same variant Tasks uses). The 720px cap was the root cause of the "no density" rejection. |
| T-7 | Should the KPI strip be a live region (announce % changes)? | **No** (§8.1/§9) — updates are user-driven; announcing them is noise. The visible change is the cue. |
| T-8 | The `KitchenGroupHeader` API differs from Tasks' `GroupHeaderRow` (no "+ Add task" / overdue). | **Resolved §4.1 N4** — a thin kitchen-specific group header (caret + label + count) rather than forcing `GroupHeaderRow`'s API. Reuses the OD-P3-6 `.grp` hairline style. |
| T-9 | Should `QtyCell` reuse `WipItemStepper`? | **No** (§4.1 N5/N8) — they are different idioms (inline table cell vs full card row). `WipItemStepper` is reused INSIDE the phone card (`KitchenLogCards`); `QtyCell` is the desktop inline cell. Both share the `onQtyChange` contract + the `kitchen-gates.ts` logic. Forcing one component would over-abstract. |
| T-10 | Kitchen logs ARE reviewed (unlike Daily Log entries) — does anchor A1 apply? | **No** (§2.3) — A1 is Daily-Log-specific. The kitchen variant is proposed as **A4** (no Approve on the CAPTURE screen; approve lives on /mos/kitchen/review). The design satisfies it: the only primary action on Log is Submit. |

---

**End of plan.** Once the owner signs off OQ-1..OQ-5 (or accepts the adopted defaults), this plan feeds
the `ui-implementer` build (§10 tasks) and the `design-reviewer` four-lens review
(`docs/design-workflow.md` §2.3 — Lens-D re-run on the built UI against this job story + A4).
