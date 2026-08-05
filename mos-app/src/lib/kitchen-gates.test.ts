// Kitchen capture gate logic — pure functions, TDD (AC-tagged).
// Proves: effective target = max(plan − stok, 0) for stock-consuming actions (FR-022),
// the variance-note gate against THAT target (AC-020/021), and the transfer-availability
// REJECT against `tersedia` (FR-023, AC-022 — over-availability blocks submit, never caps;
// matches the OLD app's hard-stop "Produksi dulu sebelum transfer").

import { describe, it, expect } from 'vitest'
import {
  isStockConsuming,
  effectiveTarget,
  needsVarianceNote,
  transferExceedsAvailable,
} from './kitchen-gates'
import type { KitchenLogLine, KitchenMovement } from '@/lib/db/kitchen-logs.types'

// The gates took the three label literals on v4. The squashed baseline stores no
// action_type (DD-WAY-13), so they take the MOVEMENT the labels are derived from. Every
// expected value below is v4's, unchanged — only the way a case is named has moved from the
// label to the thing the label describes. These two movements are the two the incumbent
// captures, so the cases are the same cases.
const PRODUCE: KitchenMovement = { action: 'produce', destinationBranchId: null }
const TRANSFER_RADIANT: KitchenMovement = {
  action: 'transfer', destinationBranchId: 'branch-radiant',
}
const TRANSFER_BUNGUR: KitchenMovement = {
  action: 'transfer', destinationBranchId: 'branch-rumah-rames',
}

function line(over: Partial<KitchenLogLine>): KitchenLogLine {
  return {
    wip_item_id: 'w1',
    qty_porsi: 0,
    notes: '',
    plan_qty: 0,
    stok: 0,
    tersedia: 0,
    dirty: false,
    error: '',
    capError: '',
    ...over,
  }
}

describe('isStockConsuming', () => {
  it('a produce is NOT stock-consuming (it produces stock)', () => {
    expect(isStockConsuming(PRODUCE)).toBe(false)
  })
  it('a transfer IS stock-consuming, whatever its destination', () => {
    expect(isStockConsuming(TRANSFER_RADIANT)).toBe(true)
    expect(isStockConsuming(TRANSFER_BUNGUR)).toBe(true)
  })
})

describe('effectiveTarget — max(plan − stock, 0) for stock-consuming actions (FR-022)', () => {
  it('Production: target is the raw plan (stock not subtracted)', () => {
    expect(effectiveTarget(PRODUCE, { plan: 12, stok: 5 })).toBe(12)
  })
  it('Transfer: target subtracts on-hand stock', () => {
    expect(effectiveTarget(TRANSFER_RADIANT, { plan: 10, stok: 3 })).toBe(7)
  })
  it('Transfer: clamps to 0 when stock already covers the plan', () => {
    expect(effectiveTarget(TRANSFER_RADIANT, { plan: 4, stok: 9 })).toBe(0)
  })
})

describe('needsVarianceNote — note required when qty != effective target (FR-022, AC-020/021)', () => {
  it('AC-020: on-plan Production (qty == plan) needs no note', () => {
    expect(needsVarianceNote(line({ qty_porsi: 12, plan_qty: 12 }), PRODUCE)).toBe(false)
  })
  it('AC-020: off-target Production (qty != plan) needs a note', () => {
    expect(needsVarianceNote(line({ qty_porsi: 7, plan_qty: 12 }), PRODUCE)).toBe(true)
  })
  it('AC-021: no-plan item (plan 0) with any qty needs a note', () => {
    expect(needsVarianceNote(line({ qty_porsi: 3, plan_qty: 0 }), PRODUCE)).toBe(true)
  })
  it('FR-022: Transfer against EFFECTIVE target — qty == max(plan-stok,0) needs no note', () => {
    // plan 10, stok 3 → effective 7; logging exactly 7 is on-target
    expect(needsVarianceNote(line({ qty_porsi: 7, plan_qty: 10, stok: 3 }), TRANSFER_RADIANT)).toBe(false)
  })
  it('FR-022: Transfer logging the RAW plan (10) when effective is 7 needs a note', () => {
    expect(needsVarianceNote(line({ qty_porsi: 10, plan_qty: 10, stok: 3 }), TRANSFER_RADIANT)).toBe(true)
  })
  it('a staged line with qty 0 needs no note (not staged)', () => {
    expect(needsVarianceNote(line({ qty_porsi: 0, plan_qty: 12 }), PRODUCE)).toBe(false)
  })
})

describe('transferExceedsAvailable — FR-023 / AC-022 (reject, not cap)', () => {
  it('AC-022: a Transfer of 10 against tersedia 8 exceeds availability (→ rejects submit)', () => {
    expect(transferExceedsAvailable(line({ qty_porsi: 10, tersedia: 8 }), TRANSFER_RADIANT)).toBe(true)
  })
  it('AC-022: a Transfer of <= tersedia is allowed', () => {
    expect(transferExceedsAvailable(line({ qty_porsi: 8, tersedia: 8 }), TRANSFER_RADIANT)).toBe(false)
  })
  it('Production is never gated by tersedia (it makes stock)', () => {
    expect(transferExceedsAvailable(line({ qty_porsi: 999, tersedia: 0 }), PRODUCE)).toBe(false)
  })
})
