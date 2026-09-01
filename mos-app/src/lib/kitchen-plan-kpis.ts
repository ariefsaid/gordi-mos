// The Plan band's derivation, reshaped for the DESIGN.md "Metric summary rule"
// (DD-WAY-40, ratified OD-WAY-74 #2 — #401): ONE inline line of label:value metrics,
// never a KPI tile row. The old shape put WORDS in the number slots ('Active action' =
// a movement label, 'Plan status' = 'Ready'/'No plan created yet') with dev-jargon
// captions ('write surface', 'editing today') — exactly what the rule forbids on a
// capture surface (OD-WAY-74 #2: "enforce"). Two numbers only: the planned-portion
// total and the dish count for the current movement. The first label REUSES
// kitchen.kpi.plannedTotal — the same concept Log's meta line already names. No delta
// is ever emitted: deltas carry a state worth acting on (destructive/success) and a
// plan band has none; neutral restating captions are omitted by construction.
//
// #247: cells carry a KitchenMovement (DD-WAY-13), not the removed action_type column
// — comparisons go through movementKey, same as the plan editor and review queue. The
// module stays pure (no i18n `t`, no branch catalog): labels are MessageKeys the page
// translates.
import { useMemo } from 'react'
import type { MessageKey } from '@/i18n/messages'
import type { KitchenMovement, PlanCell } from '@/lib/db/kitchen-logs.types'
import { movementKey } from '@/lib/kitchen-action-label'

export interface PlanSummaryMetric {
  key: string
  label: MessageKey
  value: string
  /** never populated — the type seals the no-delta rule (DD-WAY-40) in the shape itself */
  delta?: never
}

export interface PlanSummary {
  ariaLabel: MessageKey
  metrics: PlanSummaryMetric[]
}

export function computePlanSummary(cells: PlanCell[], movement: KitchenMovement): PlanSummary {
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
    ariaLabel: 'kitchen.plan.summary.aria',
    metrics: [
      { key: 'plannedTotal', label: 'kitchen.kpi.plannedTotal', value: String(plannedTotal) },
      { key: 'dishesPlanned', label: 'kitchen.plan.summary.itemsPlanned', value: String(plannedDishCount) },
    ],
  }
}

export function usePlanSummary(cells: PlanCell[], movement: KitchenMovement): PlanSummary {
  return useMemo(() => computePlanSummary(cells, movement), [cells, movement])
}
