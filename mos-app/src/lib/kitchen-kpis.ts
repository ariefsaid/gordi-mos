// Submitted capture summary — count items because plan and actual quantities do not share a
// proven unit basis. This selector is pure and independent of the offered-item list or draft.

import { useMemo } from 'react'
import type { ActualsMap, MovementKey, PlanMap } from '@/lib/db/kitchen-logs.types'

export interface KitchenKpis {
  plannedItemCount: number
  loggedItemCount: number
  /** Logged items with no positive plan for this movement. */
  offPlanItemCount: number
}

export function computeKitchenKpis(
  planMap: PlanMap,
  actualsMap: ActualsMap,
  movement: MovementKey,
): KitchenKpis {
  const planned = new Set(
    Object.entries(planMap)
      .filter(([, movements]) => (movements[movement] ?? 0) > 0)
      .map(([itemId]) => itemId),
  )
  const logged = new Set(
    Object.entries(actualsMap)
      .filter(([, movements]) => movements[movement]?.some(entry => entry.qty_porsi > 0))
      .map(([itemId]) => itemId),
  )

  return {
    plannedItemCount: planned.size,
    loggedItemCount: logged.size,
    offPlanItemCount: [...logged].filter(itemId => !planned.has(itemId)).length,
  }
}

export function useKitchenKpis(
  planMap: PlanMap,
  actualsMap: ActualsMap,
  movement: MovementKey,
): KitchenKpis {
  return useMemo(
    () => computeKitchenKpis(planMap, actualsMap, movement),
    [planMap, actualsMap, movement],
  )
}
