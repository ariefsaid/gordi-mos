// Submitted capture summary: count distinct planned/logged items because recorded plan and
// actual unit identities do not establish comparable quantities. No React or DB.

import { describe, it, expect } from 'vitest'
import { computeKitchenKpis } from './kitchen-kpis'
import type { ActualsMap, PlanMap } from '@/lib/db/kitchen-logs.types'

const portion = (qty_porsi: number) => ({
  key: 'unit:portion-id', item_unit_id: 'portion-id', unit_name: 'portion', qty_porsi,
})
const unknown = (key: string, qty_porsi: number) => ({
  key, item_unit_id: null, unit_name: null, qty_porsi,
})

describe('computeKitchenKpis — distinct item membership, not quantity arithmetic', () => {
  it('counts positive plans and positive actuals once per item, independent of offered items or unit labels', () => {
    const plans: PlanMap = {
      w1: { produce: 10, 'transfer:other-destination': 10 },
      w2: { produce: 0 },
      w3: { produce: 2 },
      w4: { produce: -1 },
    }
    const actuals: ActualsMap = {
      // Repeated submitted rows, including two unresolved historic rows, still mean one item.
      w2: { produce: [portion(1), portion(2)] },
      w4: { produce: [unknown('unknown:log-a', 1), unknown('unknown:log-b', 4)] },
      // This item is no longer offered by the current form list, but its submitted record counts.
      removed: { produce: [portion(8)] },
      // Other destinations and movements are outside the selected summary.
      w1: {
        produce: [portion(3), { ...portion(300), key: 'unit:litre-id', item_unit_id: 'litre-id', unit_name: 'litre' }],
        'transfer:other-destination': [portion(7)],
      },
    }

    expect(computeKitchenKpis(plans, actuals, 'produce')).toEqual({
      plannedItemCount: 2,
      loggedItemCount: 4,
      offPlanItemCount: 3,
    })
  })

  it('scopes transfer counts to the exact destination and treats repeated/no-plan actuals as item membership', () => {
    const plans: PlanMap = {
      plannedHere: { 'transfer:dest-a': 12 },
      plannedElsewhere: { 'transfer:dest-b': 4 },
    }
    const actuals: ActualsMap = {
      plannedHere: { 'transfer:dest-a': [portion(1), portion(2)] },
      plannedElsewhere: { 'transfer:dest-b': [portion(5)] },
      offPlanHere: { 'transfer:dest-a': [unknown('unknown:one', 1), unknown('unknown:two', 9)] },
      productionOnly: { produce: [portion(3)] },
    }

    expect(computeKitchenKpis(plans, actuals, 'transfer:dest-a')).toEqual({
      plannedItemCount: 1,
      loggedItemCount: 2,
      offPlanItemCount: 1,
    })
  })

  it('zero-only actuals do not count as logged and an empty scope returns zeros', () => {
    expect(computeKitchenKpis(
      { plan: { produce: 1 } },
      { plan: { produce: [portion(0)] } },
      'produce',
    )).toEqual({ plannedItemCount: 1, loggedItemCount: 0, offPlanItemCount: 0 })
    expect(computeKitchenKpis({}, {}, 'produce')).toEqual({
      plannedItemCount: 0,
      loggedItemCount: 0,
      offPlanItemCount: 0,
    })
  })
})
