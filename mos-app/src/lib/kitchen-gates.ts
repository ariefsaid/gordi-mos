// Kitchen capture gate logic — pure functions (no React, no DB).
// The two FR-022/023 gates the S1 Log screen enforces inline:
//  - Variance-note gate (FR-022): a note is required when qty != the EFFECTIVE
//    target. For stock-consuming actions the effective target is max(plan − stok, 0).
//  - Transfer-availability cap (FR-023, AC-022): a Transfer line cannot exceed the
//    available stock (`tersedia`); excess is capped and a "produce first" cue shows.
// Kept pure + co-located so the AC-020/021/022 unit tests prove the rules, not mocks.

import type { KitchenActionType, KitchenLogLine } from '@/lib/db/kitchen-logs.types'

/** Indonesian operator copy (NFR-012 — ID content). */
export const VARIANCE_NOTE_CUE = 'Catatan wajib — di luar rencana'
export const TRANSFER_SHORT_CUE = 'Stok kurang — produksi dulu'

/** Transfers consume stock; Production produces it. Only transfers cap on `tersedia`. */
export function isStockConsuming(action: KitchenActionType): boolean {
  return action === 'Transfer to Radiant' || action === 'Transfer to Bungur'
}

/**
 * Effective plan target for an (item, action) (FR-022).
 * Production → the raw plan. Stock-consuming (transfer) → max(plan − stok, 0):
 * once stock covers the plan there is nothing left to "target" producing/moving.
 */
export function effectiveTarget(
  action: KitchenActionType,
  { plan, stok }: { plan: number; stok: number },
): number {
  if (!isStockConsuming(action)) return plan
  return Math.max(plan - stok, 0)
}

/**
 * Variance-note gate (FR-022, AC-020/021): a staged line (qty > 0) needs a note when
 * its qty != the effective target (off-plan, including any no-plan "extra").
 */
export function needsVarianceNote(line: KitchenLogLine, action: KitchenActionType): boolean {
  if (line.qty_porsi <= 0) return false // not staged
  const target = effectiveTarget(action, { plan: line.plan_qty, stok: line.stok })
  return line.qty_porsi !== target
}

/** FR-023 / AC-022: a transfer line whose qty exceeds available stock (`tersedia`). */
export function transferExceedsAvailable(
  line: KitchenLogLine,
  action: KitchenActionType,
): boolean {
  if (!isStockConsuming(action)) return false
  return line.qty_porsi > line.tersedia
}

/**
 * FR-023 / AC-022: cap a transfer qty at the available total. Non-transfers pass
 * through untouched. Multi-line submits of the same item must not bypass the cap —
 * the caller caps per line and the available total is the hard ceiling.
 */
export function cappedTransferQty(
  qty: number,
  tersedia: number,
  action: KitchenActionType,
): number {
  if (!isStockConsuming(action)) return qty
  return Math.min(qty, tersedia)
}
