// B3 (OD-K-5 redesign plan §2.4): computePlanKpis — the pure Plan-editor KPI selector.
// Maps the editor's PlanCell[] (for the current action) onto the reused KitchenKpis
// shape that KitchenKpiStrip consumes. Derived display only (P-1): client-side over
// already-fetched cells — no fetch/RPC/persistence. Pure (no React); unit-tested
// directly (mirrors kitchen-kpis.test.ts).
//
// Mapping note (OQ-3, flagged not built here): KitchenKpiStrip reuses the Log-centric
// tile labels ("Planned total / Made so far / % complete / Items remaining"). The
// Plan editor's meaningful numbers are the planned-portion total (tile 1) + the
// planned-dish count (the delta chip). To avoid the strip's "−N vs plan" delta
// showing a FALSE deficit on a write surface that has no "made" concept, madeOfPlan
// is set = plannedTotal (so deltas read "on plan"). The label mismatch is the OQ-3
// tension the owner deferred; the headline numbers are faithful.

import { describe, it, expect } from 'vitest'
import { computePlanKpis } from './kitchen-plan-kpis'
import type { PlanCell } from '@/lib/db/kitchen-logs.types'

function cell(
  wip_item_id: string,
  action_type: PlanCell['action_type'],
  qty_porsi: number,
): PlanCell {
  return { id: `pl-${wip_item_id}`, wip_item_id, action_type, qty_porsi }
}

describe('computePlanKpis — the headline plan numbers', () => {
  it("Σ qty_porsi over the action's planned cells = plannedTotal", () => {
    const cells: PlanCell[] = [
      cell('w1', 'Production', 50),
      cell('w2', 'Production', 30),
      cell('w3', 'Production', 20),
    ]
    const kpis = computePlanKpis(cells, 'Production')
    expect(kpis.plannedTotal).toBe(100)
  })

  it('count of planned dishes for the action = plannedDishCount', () => {
    const cells: PlanCell[] = [
      cell('w1', 'Production', 50),
      cell('w2', 'Production', 30),
      cell('w3', 'Production', 20),
    ]
    const kpis = computePlanKpis(cells, 'Production')
    expect(kpis.plannedDishCount).toBe(3)
  })

  it('scopes to the current action_type only (Transfer cells are ignored on Production)', () => {
    const cells: PlanCell[] = [
      cell('w1', 'Production', 50),
      cell('w1', 'Transfer to Radiant', 10),
      cell('w2', 'Production', 30),
    ]
    expect(computePlanKpis(cells, 'Production').plannedTotal).toBe(80)
    expect(computePlanKpis(cells, 'Production').plannedDishCount).toBe(2)
    expect(computePlanKpis(cells, 'Transfer to Radiant').plannedTotal).toBe(10)
    expect(computePlanKpis(cells, 'Transfer to Radiant').plannedDishCount).toBe(1)
  })

  it('ignores zero-qty cells (qty_porsi = 0 is an unplanned slot, not a plan)', () => {
    const cells: PlanCell[] = [
      cell('w1', 'Production', 50),
      cell('w2', 'Production', 0), // explicitly zeroed = unplanned
    ]
    const kpis = computePlanKpis(cells, 'Production')
    expect(kpis.plannedTotal).toBe(50)
    expect(kpis.plannedDishCount).toBe(1)
  })
})

describe('computePlanKpis — reuses the KitchenKpis shape without false-deficit deltas', () => {
  it("madeOfPlan === plannedTotal (so the strip's \"−N vs plan\" delta never shows a false deficit)", () => {
    const kpis = computePlanKpis([cell('w1', 'Production', 180)], 'Production')
    expect(kpis.madeOfPlan).toBe(kpis.plannedTotal)
    expect(kpis.plannedTotal).toBe(180)
  })

  it('returns the full KitchenKpis shape (no undefined fields the strip would render blank)', () => {
    const kpis = computePlanKpis([cell('w1', 'Production', 50)], 'Production')
    expect(kpis).toEqual(
      expect.objectContaining({
        plannedTotal: expect.any(Number),
        madeOfPlan: expect.any(Number),
        madeSoFar: expect.any(Number),
        madeOffPlan: expect.any(Number),
        pctComplete: expect.any(Number),
        itemsRemaining: expect.any(Number),
        unitsShort: expect.any(Number),
        plannedDishCount: expect.any(Number),
      }),
    )
  })
})

describe('computePlanKpis — edge: no plan for the action (zero-plan roster)', () => {
  it('all-zero KitchenKpis when no cells exist for the action', () => {
    const kpis = computePlanKpis([], 'Production')
    expect(kpis).toEqual({
      plannedTotal: 0,
      madeOfPlan: 0,
      madeSoFar: 0,
      madeOffPlan: 0,
      pctComplete: 0,
      itemsRemaining: 0,
      unitsShort: 0,
      plannedDishCount: 0,
    })
  })

  it('all-zero when cells exist but none for the requested action', () => {
    const kpis = computePlanKpis([cell('w1', 'Transfer to Bungur', 20)], 'Production')
    expect(kpis.plannedTotal).toBe(0)
    expect(kpis.plannedDishCount).toBe(0)
  })
})
