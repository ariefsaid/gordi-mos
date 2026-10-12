// The Plan summary counts planned items for the current movement. Quantities are not
// added because rows may use different units.

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
  let plannedItemCount = 0
  const key = movementKey(movement)

  for (const c of cells) {
    if (movementKey(c.movement) === key && c.qty_porsi > 0) plannedItemCount += 1
  }

  return {
    ariaLabel: 'kitchen.plan.summary.aria',
    metrics: [
      { key: 'itemsPlanned', label: 'kitchen.plan.summary.itemsPlanned', value: String(plannedItemCount) },
    ],
  }
}

export function usePlanSummary(cells: PlanCell[], movement: KitchenMovement): PlanSummary {
  return useMemo(() => computePlanSummary(cells, movement), [cells, movement])
}
