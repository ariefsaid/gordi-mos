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

describe('effectiveTarget — production subtracts stock, transfers target their absolute plan (FR-022; bar-capture FR-014/AC-006)', () => {
  // Bar-capture FR-014 (#233) scopes the stock subtraction to PRODUCTION only: the
  // incumbent's idiom is "plan 10, 2 already on hand → make 8". A transfer plan is an
  // absolute movement quantity — "move 10" means move 10, whatever is on hand; stock is
  // what it draws from and FR-023's tersedia cap owns feasibility.
  it('AC-006: Production subtracts on-hand stock — plan 10, stok 2 → target 8', () => {
    expect(effectiveTarget(PRODUCE, { plan: 10, stok: 2 })).toBe(8)
  })
  it('Production with no stock: target is the plan', () => {
    expect(effectiveTarget(PRODUCE, { plan: 12, stok: 0 })).toBe(12)
  })
  it('Production clamps to 0 when stock already covers the plan', () => {
    expect(effectiveTarget(PRODUCE, { plan: 4, stok: 9 })).toBe(0)
  })
  it('FR-014: Transfer targets the ABSOLUTE plan — stock on hand is not subtracted', () => {
    expect(effectiveTarget(TRANSFER_RADIANT, { plan: 10, stok: 3 })).toBe(10)
  })
  it('Transfer: stock covering the plan does not zero the target — the plan still means "move this much"', () => {
    expect(effectiveTarget(TRANSFER_RADIANT, { plan: 4, stok: 9 })).toBe(4)
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
  it('AC-006: Production against the EFFECTIVE target — qty == plan − stok needs no note; the raw plan does', () => {
    // plan 10, stok 2 → effective 8 (FR-014): logging 8 is on-target, logging the raw 10 is not
    expect(needsVarianceNote(line({ qty_porsi: 8, plan_qty: 10, stok: 2 }), PRODUCE)).toBe(false)
    expect(needsVarianceNote(line({ qty_porsi: 10, plan_qty: 10, stok: 2 }), PRODUCE)).toBe(true)
  })
  it('FR-014: an on-plan Transfer (qty == plan) with stock on hand needs NO note', () => {
    // plan 10, stok 3 — the plan is absolute: moving exactly 10 is on-target
    expect(needsVarianceNote(line({ qty_porsi: 10, plan_qty: 10, stok: 3 }), TRANSFER_RADIANT)).toBe(false)
  })
  it('FR-022: a Transfer off its plan (7 of 10) needs a note', () => {
    expect(needsVarianceNote(line({ qty_porsi: 7, plan_qty: 10, stok: 3 }), TRANSFER_RADIANT)).toBe(true)
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
