import { useMemo } from 'react'
import type { KitchenKpis, KitchenKpiStripData } from '@/lib/kitchen-kpis'
import type { KitchenMovement, PlanCell } from '@/lib/db/kitchen-logs.types'
import { movementKey } from '@/lib/kitchen-action-label'

// #247: this module used to scope by the removed action_type column. A plan cell now
// carries a KitchenMovement (DD-WAY-13); cells are compared by movementKey, the same
// index the plan editor and the review queue key their maps on. The caller supplies the
// movement's already-derived display label (deriveActionLabel) — this module stays pure
// (no i18n `t`, no branch catalog) so it is unit-testable without either.

export function computePlanKpis(
  cells: PlanCell[],
  movement: KitchenMovement,
): KitchenKpis {
  let plannedTotal = 0
  let plannedDishCount = 0
  const key = movementKey(movement)

  for (const c of cells) {
    if (movementKey(c.movement) !== key) continue
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
  movement: KitchenMovement,
  movementLabel: string,
): KitchenKpiStripData {
  const kpis = computePlanKpis(cells, movement)
  const statusLabel = kpis.plannedTotal > 0 ? 'Ready' : 'No plan created yet'

  return {
    ariaLabel: 'Planning summary',
    phoneLabel: 'Plan',
    phoneValue: `${kpis.plannedDishCount} dishes`,
    phoneMeta: movementLabel,
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
        delta: movementLabel,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: 'current action',
      },
      {
        label: 'Active action',
        value: movementLabel,
        delta: kpis.plannedTotal > 0 ? `${kpis.plannedTotal} portions set` : 'set targets',
        deltaTone: kpis.plannedTotal > 0 ? 'success' : 'neutral',
        deltaDot: false,
        sub: 'editing today',
      },
      {
        label: 'Plan status',
        value: statusLabel,
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
  movement: KitchenMovement,
): KitchenKpis {
  return useMemo(() => computePlanKpis(cells, movement), [cells, movement])
}

export function usePlanKpiStripData(
  cells: PlanCell[],
  movement: KitchenMovement,
  movementLabel: string,
): KitchenKpiStripData {
  return useMemo(
    () => computePlanKpiStripData(cells, movement, movementLabel),
    [cells, movement, movementLabel],
  )
}
