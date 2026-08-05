// B3 (OD-K-5 redesign plan §2.4): computePlanKpis — the pure Plan-editor KPI selector.
// Maps the editor's PlanCell[] (for the current movement) onto the reused KitchenKpis
// shape that KitchenKpiStrip consumes. Derived display only (P-1): client-side over
// already-fetched cells — no fetch/RPC/persistence. Pure (no React); unit-tested
// directly (mirrors kitchen-kpis.test.ts).
//
// #247: cells now carry a KitchenMovement (DD-WAY-13), not the removed action_type
// column — comparisons go through movementKey, same as the plan editor and review queue.
//
// Mapping note (OQ-3, flagged not built here): KitchenKpiStrip reuses the Log-centric
// tile labels ("Planned total / Made so far / % complete / Items remaining"). The
// Plan editor's meaningful numbers are the planned-portion total (tile 1) + the
// planned-dish count (the delta chip). To avoid the strip's "−N vs plan" delta
// showing a FALSE deficit on a write surface that has no "made" concept, madeOfPlan
// is set = plannedTotal (so deltas read "on plan"). The label mismatch is the OQ-3
// tension the owner deferred; the headline numbers are faithful.

import { describe, it, expect } from 'vitest'
import { computePlanKpis, computePlanKpiStripData } from './kitchen-plan-kpis'
import type { KitchenMovement, PlanCell } from '@/lib/db/kitchen-logs.types'

const RADIANT_ID = '30000000-0000-0000-0000-0000000000b2'
const BUNGUR_ID = '30000000-0000-0000-0000-0000000000b1'

const PRODUCE: KitchenMovement = { action: 'produce', destinationBranchId: null }
const TRANSFER_RADIANT: KitchenMovement = { action: 'transfer', destinationBranchId: RADIANT_ID }
const TRANSFER_BUNGUR: KitchenMovement = { action: 'transfer', destinationBranchId: BUNGUR_ID }

function cell(
  wip_item_id: string,
  movement: KitchenMovement,
  qty_porsi: number,
): PlanCell {
  return { id: `pl-${wip_item_id}`, wip_item_id, movement, qty_porsi }
}

describe('computePlanKpis — the headline plan numbers', () => {
  it('Σ qty_porsi over the movement\'s planned cells = plannedTotal', () => {
    const cells: PlanCell[] = [
      cell('w1', PRODUCE, 50),
      cell('w2', PRODUCE, 30),
      cell('w3', PRODUCE, 20),
    ]
    const kpis = computePlanKpis(cells, PRODUCE)
    expect(kpis.plannedTotal).toBe(100)
  })

  it('count of planned dishes for the movement = plannedDishCount', () => {
    const cells: PlanCell[] = [
      cell('w1', PRODUCE, 50),
      cell('w2', PRODUCE, 30),
      cell('w3', PRODUCE, 20),
    ]
    const kpis = computePlanKpis(cells, PRODUCE)
    expect(kpis.plannedDishCount).toBe(3)
  })

  it('scopes to the current movement only (a Transfer cell is ignored while viewing Produce)', () => {
    const cells: PlanCell[] = [
      cell('w1', PRODUCE, 50),
      cell('w1', TRANSFER_RADIANT, 10),
      cell('w2', PRODUCE, 30),
    ]
    expect(computePlanKpis(cells, PRODUCE).plannedTotal).toBe(80)
    expect(computePlanKpis(cells, PRODUCE).plannedDishCount).toBe(2)
    expect(computePlanKpis(cells, TRANSFER_RADIANT).plannedTotal).toBe(10)
    expect(computePlanKpis(cells, TRANSFER_RADIANT).plannedDishCount).toBe(1)
  })

  it('two transfers to different destinations are distinct movements, not merged', () => {
    const cells: PlanCell[] = [
      cell('w1', TRANSFER_RADIANT, 10),
      cell('w1', TRANSFER_BUNGUR, 25),
    ]
    expect(computePlanKpis(cells, TRANSFER_RADIANT).plannedTotal).toBe(10)
    expect(computePlanKpis(cells, TRANSFER_BUNGUR).plannedTotal).toBe(25)
  })

  it('ignores zero-qty cells (qty_porsi = 0 is an unplanned slot, not a plan)', () => {
    const cells: PlanCell[] = [
      cell('w1', PRODUCE, 50),
      cell('w2', PRODUCE, 0), // explicitly zeroed = unplanned
    ]
    const kpis = computePlanKpis(cells, PRODUCE)
    expect(kpis.plannedTotal).toBe(50)
    expect(kpis.plannedDishCount).toBe(1)
  })
})

describe('computePlanKpis — reuses the KitchenKpis shape without false-deficit deltas', () => {
  it("madeOfPlan === plannedTotal (so the strip's \"−N vs plan\" delta never shows a false deficit)", () => {
    const kpis = computePlanKpis([cell('w1', PRODUCE, 180)], PRODUCE)
    expect(kpis.madeOfPlan).toBe(kpis.plannedTotal)
    expect(kpis.plannedTotal).toBe(180)
  })

  it('returns the full KitchenKpis shape (no undefined fields the strip would render blank)', () => {
    const kpis = computePlanKpis([cell('w1', PRODUCE, 50)], PRODUCE)
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

describe('computePlanKpis — edge: no plan for the movement (zero-plan roster)', () => {
  it('all-zero KitchenKpis when no cells exist for the movement', () => {
    const kpis = computePlanKpis([], PRODUCE)
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

  it('all-zero when cells exist but none for the requested movement', () => {
    const kpis = computePlanKpis([cell('w1', TRANSFER_BUNGUR, 20)], PRODUCE)
    expect(kpis.plannedTotal).toBe(0)
    expect(kpis.plannedDishCount).toBe(0)
  })
})

describe('computePlanKpiStripData — the caller-supplied movement label, never re-derived here', () => {
  it('threads the given label into value/delta/phoneMeta, so the module stays i18n-free', () => {
    const strip = computePlanKpiStripData([cell('w1', PRODUCE, 50)], PRODUCE, 'Produksi')
    expect(strip.phoneMeta).toBe('Produksi')
    expect(strip.tiles[2].value).toBe('Produksi')
    expect(strip.tiles[1].delta).toBe('Produksi')
  })
})
