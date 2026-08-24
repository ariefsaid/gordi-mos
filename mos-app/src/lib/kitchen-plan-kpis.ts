import { useMemo } from 'react'
import type { KitchenKpis, KitchenKpiStripData } from '@/lib/kitchen-kpis'
import type { KitchenMovement, PlanCell } from '@/lib/db/kitchen-logs.types'
import { movementKey } from '@/lib/kitchen-action-label'
import { useT, type Translate } from '@/i18n/use-t'

// #247: this module used to scope by the removed action_type column. A plan cell now
// carries a KitchenMovement (DD-WAY-13); cells are compared by movementKey, the same
// index the plan editor and the review queue key their maps on. The caller supplies the
// movement's already-derived display label (deriveActionLabel) — no branch catalog here.
//
// #410 (same lane as #400's stock strip): every label, delta and sub-line below was a
// hardcoded English literal, so Café · Plan's KPI band stayed English in the Indonesian
// locale. `tr` is injected per the #411 stock contract — REQUIRED, no inline-English
// fallback; a caller outside React passes `translateFor(...)`, which is what the unit
// test does. `usePlanKpiStripData` keeps its public signature and injects `useT()` itself.

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
  tr: Translate,
): KitchenKpiStripData {
  const kpis = computePlanKpis(cells, movement)
  const statusLabel = kpis.plannedTotal > 0
    ? tr('kitchen.plan.kpi.status.ready')
    : tr('kitchen.plan.kpi.status.none')

  return {
    ariaLabel: tr('kitchen.plan.kpi.ariaLabel'),
    phoneLabel: tr('kitchen.plan.kpi.phoneLabel'),
    phoneValue: tr('kitchen.plan.kpi.dishCount', { count: kpis.plannedDishCount }),
    phoneMeta: movementLabel,
    tiles: [
      {
        label: tr('kitchen.plan.kpi.plannedTotal'),
        value: String(kpis.plannedTotal),
        delta: tr('kitchen.plan.kpi.dishCount', { count: kpis.plannedDishCount }),
        deltaTone: 'neutral',
        deltaDot: false,
        sub: tr('kitchen.plan.kpi.plannedTotal.sub'),
      },
      {
        label: tr('kitchen.plan.kpi.dishesPlanned'),
        value: String(kpis.plannedDishCount),
        delta: movementLabel,
        deltaTone: 'neutral',
        deltaDot: false,
        sub: tr('kitchen.plan.kpi.dishesPlanned.sub'),
      },
      {
        label: tr('kitchen.plan.kpi.activeAction'),
        value: movementLabel,
        delta: kpis.plannedTotal > 0
          ? tr('kitchen.plan.kpi.activeAction.delta', { count: kpis.plannedTotal })
          : tr('kitchen.plan.kpi.activeAction.setTargets'),
        deltaTone: kpis.plannedTotal > 0 ? 'success' : 'neutral',
        deltaDot: false,
        sub: tr('kitchen.plan.kpi.activeAction.sub'),
      },
      {
        label: tr('kitchen.plan.kpi.status'),
        value: statusLabel,
        delta: kpis.plannedTotal > 0
          ? tr('kitchen.plan.kpi.status.targetsSet')
          : tr('kitchen.plan.kpi.status.nothingPlanned'),
        deltaTone: kpis.plannedTotal > 0 ? 'success' : 'neutral',
        deltaDot: false,
        sub: tr('kitchen.plan.kpi.status.sub'),
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
  const t = useT()
  return useMemo(
    () => computePlanKpiStripData(cells, movement, movementLabel, t),
    [cells, movement, movementLabel, t],
  )
}
