import { useMemo } from 'react'
import type { KitchenKpis, KitchenKpiStripData } from '@/lib/kitchen-kpis'
import type { KitchenActionType, PlanCell } from '@/lib/db/kitchen-logs.types'

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

export function computePlanKpiStripData(
  cells: PlanCell[],
  action: KitchenActionType,
): KitchenKpiStripData {
  const kpis = computePlanKpis(cells, action)
  // census DEFECT-1: the plan editor has exactly TWO real aggregate metrics — total
  // portions and how many dishes carry a target. The former tiles 3/4 crammed a WORD
  // ("Production"/"Ready") into the number slot, echoed the segmented control's active
  // action, and captioned it with dev jargon ("write surface", "editing today"). Drop to
  // the two real metrics + one plain status line; the seg control already names the action.
  const statusLine = kpis.plannedTotal > 0
    ? `Ready · ${kpis.plannedTotal} portions across ${kpis.plannedDishCount} ${kpis.plannedDishCount === 1 ? 'dish' : 'dishes'}`
    : 'No plan created yet — set a target on any dish'

  return {
    ariaLabel: 'Planning summary',
    phoneLabel: 'Plan',
    phoneValue: `${kpis.plannedDishCount} ${kpis.plannedDishCount === 1 ? 'dish' : 'dishes'}`,
    phoneMeta: statusLine,
    statusLine,
    tiles: [
      {
        label: 'Planned total',
        value: String(kpis.plannedTotal),
        delta: `${kpis.plannedDishCount} ${kpis.plannedDishCount === 1 ? 'dish' : 'dishes'}`,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'portions',
      },
      {
        label: 'Dishes planned',
        value: String(kpis.plannedDishCount),
        deltaDot: false,
        sub: 'with a target set',
      },
    ],
  }
}

export function usePlanKpis(
  cells: PlanCell[],
  action: KitchenActionType,
): KitchenKpis {
  return useMemo(() => computePlanKpis(cells, action), [cells, action])
}

export function usePlanKpiStripData(
  cells: PlanCell[],
  action: KitchenActionType,
): KitchenKpiStripData {
  return useMemo(() => computePlanKpiStripData(cells, action), [cells, action])
}
