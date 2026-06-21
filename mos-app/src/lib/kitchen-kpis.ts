// computeKitchenKpis — pure derived-KPI selector (plan §5, parity-critical P-1).
// The ONLY new "logic" in the Log redesign — pure client-side derivation over
// already-fetched `lines` state. No DB, no RPC, no fetch, no ESB, no persistence.
// Reads only line.plan_qty + line.qty_porsi for the current action_type (both already
// in the `lines` state built by the existing buildLines()).
//
// Worked example = mock C's KPI tiles (plan §5.1):
//   plannedTotal=180 · madeOfPlan=140 · madeSoFar=175 · madeOffPlan=35 ·
//   pctComplete=78% · itemsRemaining=4 · unitsShort=46 · plannedDishCount=6

import { useMemo } from 'react'
import type { KitchenLogLine } from '@/lib/db/kitchen-logs.types'

export interface KitchenKpis {
  /** Σ plan_qty over planned items (plan>0), current action_type */
  plannedTotal: number
  /** Σ qty_porsi over planned items (uncapped actual) */
  madeOfPlan: number
  /** Σ qty_porsi over ALL staged lines (qty>0) — the "how much did we make" headline */
  madeSoFar: number
  /** madeSoFar − madeOfPlan */
  madeOffPlan: number
  /** plannedTotal>0 ? round(madeOfPlan/plannedTotal*100) : 0 (never divides by zero) */
  pctComplete: number
  /** count of planned items where qty_porsi < plan_qty */
  itemsRemaining: number
  /** Σ max(plan_qty − qty_porsi, 0) over planned items */
  unitsShort: number
  /** count of planned items */
  plannedDishCount: number
}

/**
 * The pure derived-KPI core (plan §5.1). Unit-tested directly — no React, no mocks.
 * `lines` is already scoped to the current action_type (built by buildLines()), so the
 * action scope is implicit; the action_type is carried by the useKitchenKpis() hook's
 * useMemo dep (it recomputes when the action changes).
 */
export function computeKitchenKpis(
  lines: Record<string, KitchenLogLine>,
): KitchenKpis {
  let plannedTotal = 0
  let madeOfPlan = 0
  let madeSoFar = 0
  let itemsRemaining = 0
  let unitsShort = 0
  let plannedDishCount = 0

  for (const line of Object.values(lines)) {
    const { qty_porsi, plan_qty } = line
    if (qty_porsi > 0) madeSoFar += qty_porsi
    if (plan_qty > 0) {
      plannedDishCount += 1
      plannedTotal += plan_qty
      madeOfPlan += qty_porsi // uncapped actual on planned items
      if (qty_porsi < plan_qty) {
        itemsRemaining += 1
        unitsShort += plan_qty - qty_porsi
      }
    }
  }

  const pctComplete = plannedTotal > 0 ? Math.round((madeOfPlan / plannedTotal) * 100) : 0

  return {
    plannedTotal,
    madeOfPlan,
    madeSoFar,
    madeOffPlan: madeSoFar - madeOfPlan,
    pctComplete,
    itemsRemaining,
    unitsShort,
    plannedDishCount,
  }
}

/**
 * Thin memoized hook wrapper for the page (plan §4.3 N2). The pure core is
 * computeKitchenKpis() above. `lines` already rebuilds when the action_type changes
 * (the page's action_type effect), so it is the sole memo dependency — an explicit
 * actionType dep would be redundant (react-hooks/exhaustive-deps).
 */
export function useKitchenKpis(
  lines: Record<string, KitchenLogLine>,
): KitchenKpis {
  return useMemo(() => computeKitchenKpis(lines), [lines])
}
