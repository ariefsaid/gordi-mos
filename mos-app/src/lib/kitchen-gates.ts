// Kitchen capture gate logic — pure functions (no React, no DB).
// The two FR-022/023 gates the S1 Log screen enforces inline:
//  - Variance-note gate (FR-022; effective target per bar-capture FR-014): a note is
//    required when qty != the EFFECTIVE target — max(plan − stok, 0) on production
//    (FR-014 scopes the subtraction to production only), the absolute plan on transfers.
//  - Transfer-availability REJECT (FR-023, AC-022): a Transfer line cannot exceed the
//    available stock (`tersedia`). Over-availability is a HARD STOP — the typed qty is
//    kept, Submit is blocked, and a "produce first" cue shows (parity with the OLD app's
//    "Produksi dulu sebelum transfer" — it never silently caps the entered amount).
// Kept pure + co-located so the AC-020/021/022 unit tests prove the rules, not mocks.

import type { KitchenLogLine, KitchenMovement } from '@/lib/db/kitchen-logs.types'

/**
 * Café Review + Pushes access predicate (JQ-1). These two day-steps are ops_lead/admin
 * only — the approve/reject and outbox-retry RPCs are RLS-gated to those roles, and the
 * Review/Pushes pages render a forbidden backstop for anyone else. This shared predicate
 * is the ONE grammar for that gate: the doors (café capture links) hide it for a viewer
 * who can't reach it, and the page-level `allowed` checks read from here too — so a member
 * never sees a Review/Pushes door that only bounces them. Role-based (not a `can()`
 * capability) because no `shared.role_capabilities` grant backs these routes; the raw
 * access-role membership is the honest source (mirrors the pages' original inline check).
 */
export function canReviewCafe(accessRoles: readonly string[]): boolean {
  return accessRoles.includes('ops_lead') || accessRoles.includes('admin')
}

/** Indonesian operator copy (NFR-012 — ID content). */
export const VARIANCE_NOTE_CUE = 'Catatan wajib — di luar rencana'
export const TRANSFER_SHORT_CUE = 'Stok kurang — produksi dulu'

/**
 * Transfers consume stock; a produce makes it. Only transfers cap on `tersedia`.
 *
 * v4 matched the three label literals (`action === 'Transfer to Radiant' || …`), which is a
 * stored-literal read wearing a predicate's clothes: it cannot answer the question for the
 * four streams that reach the ERP by hand today, and it goes wrong the moment a fifth label
 * exists. The stored model answers it directly (DD-WAY-13) — including the within-books
 * transfer, which posts no ERP document but still takes the WIP out of the kitchen's hands,
 * exactly as `ops.stock_available_for_date` signs it.
 */
export function isStockConsuming(movement: KitchenMovement): boolean {
  return movement.action === 'transfer'
}

/**
 * Effective plan target for an (item, movement) — what the variance-note gate compares
 * the typed quantity against.
 *
 * PRODUCTION → max(plan − stok, 0): bar-capture FR-014/AC-006 (#233) scope the stock
 * subtraction to production ONLY — the incumbent's idiom is "the plan wants 10, 2 are
 * already on hand → make 8". The plan stays the greyed placeholder anchor; this target
 * is what the gate compares against. (An earlier kitchen-spec reading kept production
 * at the raw plan; FR-014 supersedes it.)
 *
 * TRANSFER → the raw plan: a transfer plan is an ABSOLUTE movement quantity — "move 10
 * to Radiant" means move 10, whatever is on hand. Stock is what the transfer draws
 * from, and feasibility is FR-023's job (the `tersedia` cap), never this target's.
 * Subtracting stock here made an on-plan transfer with stock on hand demand a variance
 * note for hitting its own plan.
 */
export function effectiveTarget(
  movement: KitchenMovement,
  { plan, stok }: { plan: number; stok: number },
): number {
  if (isStockConsuming(movement)) return plan
  return Math.max(plan - stok, 0)
}

/**
 * Variance-note gate (FR-022, AC-020/021): a staged line (qty > 0) needs a note when
 * its qty != the effective target (off-plan, including any no-plan "extra").
 */
export function needsVarianceNote(line: KitchenLogLine, movement: KitchenMovement): boolean {
  if (line.qty_porsi <= 0) return false // not staged
  const target = effectiveTarget(movement, { plan: line.plan_qty, stok: line.stok })
  return line.qty_porsi !== target
}

/**
 * FR-023 / AC-022: a transfer line whose qty exceeds available stock (`tersedia`).
 * When true the submit is REJECTED (the offending line shows TRANSFER_SHORT_CUE and
 * Submit is disabled) — the entered qty is never silently capped. `tersedia` is the
 * hard ceiling; since the Log screen shows one movement at a time there is one
 * transfer line per item, so the line's own qty vs its tersedia is the full check.
 */
export function transferExceedsAvailable(
  line: KitchenLogLine,
  movement: KitchenMovement,
): boolean {
  if (!isStockConsuming(movement)) return false
  return line.qty_porsi > line.tersedia
}
