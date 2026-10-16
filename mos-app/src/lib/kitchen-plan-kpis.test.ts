// The Plan summary keeps only a planned-item count; summing amounts across different
// item units has no common basis. The metric remains scoped to the current movement.
//
// #247: cells carry a KitchenMovement (DD-WAY-13) — comparisons go through movementKey,
// same as the plan editor and review queue. Pure (no React); unit-tested directly
// (mirrors kitchen-review-kpis.test.ts).
import { describe, it, expect } from 'vitest'
import { computePlanSummary } from './kitchen-plan-kpis'
import type { KitchenMovement, PlanCell } from '@/lib/db/kitchen-logs.types'

const RADIANT_ID = '30000000-0000-0000-0000-0000000000b2'
const BUNGUR_ID = '30000000-0000-0000-0000-0000000000b1'

const PRODUCE: KitchenMovement = { action: 'produce', destinationBranchId: null }
const TRANSFER_RADIANT: KitchenMovement = { action: 'transfer', destinationBranchId: RADIANT_ID }
const TRANSFER_BUNGUR: KitchenMovement = { action: 'transfer', destinationBranchId: BUNGUR_ID }

function cell(wip_item_id: string, movement: KitchenMovement, qty_porsi: number): PlanCell {
  return { id: `pl-${wip_item_id}`, wip_item_id, movement, qty_porsi }
}

describe('computePlanSummary — the summary-rule derivation (DD-WAY-40, #401)', () => {
  it('derives only the planned-item count, as a string', () => {
    const s = computePlanSummary([
      cell('w1', PRODUCE, 50),
      cell('w2', PRODUCE, 30),
      cell('w3', PRODUCE, 20),
    ], PRODUCE)
    expect(s.ariaLabel).toBe('kitchen.plan.summary.aria')
    expect(s.metrics).toEqual([
      { key: 'itemsPlanned', label: 'kitchen.plan.summary.itemsPlanned', value: '3' },
    ])
  })

  it('scopes to the current movement only (a Transfer cell is ignored while viewing Produce)', () => {
    const cells = [cell('w1', PRODUCE, 50), cell('w1', TRANSFER_RADIANT, 10), cell('w2', PRODUCE, 30)]
    const produce = computePlanSummary(cells, PRODUCE)
    expect(produce.metrics[0].value).toBe('2')
    const radiant = computePlanSummary(cells, TRANSFER_RADIANT)
    expect(radiant.metrics[0].value).toBe('1')
  })

  it('two transfers to different destinations are distinct movements, not merged', () => {
    const cells = [cell('w1', TRANSFER_RADIANT, 10), cell('w1', TRANSFER_BUNGUR, 25)]
    expect(computePlanSummary(cells, TRANSFER_RADIANT).metrics[0].value).toBe('1')
    expect(computePlanSummary(cells, TRANSFER_BUNGUR).metrics[0].value).toBe('1')
  })

  it('ignores zero-qty cells (qty_porsi = 0 is an unplanned slot, not a plan)', () => {
    const s = computePlanSummary([cell('w1', PRODUCE, 50), cell('w2', PRODUCE, 0)], PRODUCE)
    expect(s.metrics[0].value).toBe('1')
  })

  it('an empty plan keeps NUMBER slots (0/0) — no word ever lands in a value slot (DD-WAY-40)', () => {
    const s = computePlanSummary([], PRODUCE)
    expect(s.metrics.map(m => m.value)).toEqual(['0'])
    expect(s.metrics.every(m => /^\d+$/.test(m.value))).toBe(true)
  })

  it('never emits a delta — a capture band has no state worth acting on (the rule omits neutral noise)', () => {
    const s = computePlanSummary([cell('w1', PRODUCE, 12)], PRODUCE)
    expect(s.metrics.every(m => m.delta === undefined)).toBe(true)
  })
})
