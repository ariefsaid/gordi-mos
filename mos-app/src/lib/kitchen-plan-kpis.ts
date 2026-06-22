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
  const status = kpis.plannedTotal > 0 ? 'ready' : 'empty'

  return {
    ariaLabel: 'Planning summary',
    phoneLabel: 'Plan',
    phoneValue: `${kpis.plannedDishCount} dishes`,
    phoneMeta: action,
    tiles: [
      {
        label: 'Planned total',
        value: String(kpis.plannedTotal),
        delta: `${kpis.plannedDishCount} dishes`,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'portions',
      },
      {
        label: 'Dishes planned',
        value: String(kpis.plannedDishCount),
        delta: action,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'current action',
      },
      {
        label: 'Active action',
        value: action,
        delta: kpis.plannedTotal > 0 ? `${kpis.plannedTotal} portions set` : 'set targets',
        deltaTone: kpis.plannedTotal > 0 ? 'success' : 'neutral',
        deltaDot: false,
        sub: 'editing today',
      },
      {
        label: 'Plan status',
        value: status,
        delta: kpis.plannedTotal > 0 ? 'targets set' : 'nothing planned',
        deltaTone: kpis.plannedTotal > 0 ? 'success' : 'neutral',
        deltaDot: false,
        sub: 'write surface',
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
