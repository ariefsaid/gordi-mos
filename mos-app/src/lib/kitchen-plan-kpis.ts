// computePlanKpis — pure Plan-editor KPI selector (OD-K-5 redesign §2.4, parity P-1).
// Maps the editor's PlanCell[] for the current action onto the reused KitchenKpis
// shape that KitchenKpiStrip consumes. Derived display ONLY — client-side over
// already-fetched cells; no DB/RPC/fetch/ESB/persistence.
//
// Worked example: 3 Production cells (50+30+20) → plannedTotal=100, plannedDishCount=3.
//
// OQ-3 mapping note: KitchenKpiStrip reuses the Log-centric tile labels. The Plan
// editor's meaningful numbers are plannedTotal (tile 1 "Planned total") +
// plannedDishCount (the "N dishes" delta chip). To keep the strip's "−N vs plan"
// delta from showing a FALSE deficit on a write surface that has no "made" concept,
// madeOfPlan is pinned = plannedTotal (deltas read "on plan", never a false red).
// The label mismatch is the OQ-3 tension the owner deferred — the headline numbers
// are faithful. (Items "unplanned" needs the roster size, which isn't in `cells`;
// itemsRemaining is left 0 — a fast-follow can pass the roster in.)

import { useMemo } from 'react'
import type { KitchenKpis } from '@/lib/kitchen-kpis'
import type { KitchenActionType, PlanCell } from '@/lib/db/kitchen-logs.types'

/**
 * The pure Plan-KPI core (§2.4). Unit-tested directly — no React, no mocks.
 * `cells` is the editor's full plan rowset (all actions); the selector filters to
 * `action`. The page's `usePlanKpis` hook carries the action as its memo dep so the
 * derivation recomputes when the action changes.
 */
export function computePlanKpis(
  cells: PlanCell[],
  action: KitchenActionType,
): KitchenKpis {
  let plannedTotal = 0
  let plannedDishCount = 0

  for (const c of cells) {
    if (c.action_type !== action) continue
    if (c.qty_porsi > 0) {
      plannedDishCount += 1
      plannedTotal += c.qty_porsi
    }
  }

  // madeOfPlan === plannedTotal so the reused strip's "behind = plannedTotal −
  // madeOfPlan" delta is always 0 (reads "on plan"), never a false deficit on a
  // plan-editor (write) surface that has no "made" concept.
  return {
    plannedTotal,
    madeOfPlan: plannedTotal,
    madeSoFar: plannedDishCount,
    madeOffPlan: 0,
    pctComplete: plannedTotal > 0 ? 100 : 0,
    itemsRemaining: 0,
    unitsShort: 0,
    plannedDishCount,
  }
}

/**
 * Thin memoized hook wrapper for the Plan page (mirrors lib/kitchen-kpis.ts
 * useKitchenKpis). `cells` rebuilds when the editor saves; `action` is the explicit
 * dep that rescopes the derivation on action_type change.
 */
export function usePlanKpis(
  cells: PlanCell[],
  action: KitchenActionType,
): KitchenKpis {
  return useMemo(() => computePlanKpis(cells, action), [cells, action])
}
