// Movement vocabulary + the DERIVED action label — the client mirror of
// `ops.kitchen_action_label(action, destination_branch_id)` (DD-WAY-13).
//
// There is no stored `action_type`. The incumbent's three strings folded a destination into
// an action because Teable had one flat field and there was one production branch; the ERP
// was always parameterised. So the label is computed here from `action ∈ {produce,transfer}`
// plus the destination branch, exactly as the SQL computes it — which is what lets the four
// streams that reach the ERP on paper today be captured without inventing new literals.
//
// PARITY (OD-K-1): for the two currently-captured streams this reproduces the incumbent's
// strings byte for byte — 'Production', 'Transfer to Bungur', 'Transfer to Radiant'.
// 'Bungur' is the incumbent's UI label for the Rumah Rames branch. It is NOT a fifth branch
// and is not in the catalog; it appears in exactly one place on each side of the seam — one
// arm of the SQL CASE, and BRANCH_DISPLAY_ALIAS below.

import type { Translate } from '@/i18n/use-t'
import type {
  BranchOption,
  KitchenMovement,
  MovementKey,
  ProductionActivity,
  ProductionStream,
} from '@/lib/db/kitchen-logs.types'

/**
 * Display aliases for branch names, keyed by the catalog's own `code`. The single entry
 * mirrors the single aliased arm of `ops.kitchen_action_label`. Adding a second entry here
 * without adding it there would split the label across the seam.
 */
export const BRANCH_DISPLAY_ALIAS: Readonly<Record<string, string>> = {
  rumah_rames: 'Bungur',
}

/** The branch's name as the floor reads it. */
export function branchDisplayName(branch: BranchOption): string {
  return BRANCH_DISPLAY_ALIAS[branch.code] ?? branch.name
}

/** Stable client-side index for a movement (see `MovementKey`). */
export function movementKey(movement: KitchenMovement): MovementKey {
  return movement.action === 'produce'
    ? 'produce'
    : `transfer:${movement.destinationBranchId ?? ''}`
}

/**
 * Stable client-side index for a (branch, activity) stream (OD-WAY-28). Pairs with
 * `movementKey` to build a compound key for maps that must distinguish rows across
 * streams — e.g. the review queue's per-row plan lookup (#197/#198): a queue that can
 * span more than one stream must compare each row to ITS OWN stream's plan, never a
 * single hardcoded one.
 */
export function streamKey(branchId: string, activity: ProductionActivity): string {
  return `${branchId}|${activity}`
}

export function movementsEqual(a: KitchenMovement, b: KitchenMovement): boolean {
  return movementKey(a) === movementKey(b)
}

/** A produce always exists; it is the movement every stream starts from. */
export const PRODUCE: KitchenMovement = { action: 'produce', destinationBranchId: null }

/**
 * Every movement capturable from an origin stream (FR-013): produce, then a transfer to each
 * active branch. That single list carries BOTH movement classes, from either activity
 * surface, because a destination is a branch and nothing else (OD-WAY-44):
 *
 *   - CROSS-BRANCH — any branch that is not the origin. A bar → another branch's bar and the
 *     kitchen's existing cross-branch transfers are the same row shape and the same
 *     (preserved) labels; they post through the normal dispatch path.
 *   - INTRA-BRANCH CROSS-ACTIVITY — the origin branch itself, offered from both sides (bar →
 *     own branch's kitchen, kitchen → own branch's bar). This is also the incumbent's
 *     "Transfer to Bungur" on the Rumah Rames stream. There is no destination-activity
 *     dimension and none is being added: what is stored is destination = own branch, and the
 *     counterpart activity is a GLOSS the capture control renders (see `isIntraBranch`), never
 *     a column. Approved, such a movement is held — no ERP document (FR-050/053).
 *
 * Destination order follows the catalog order the caller supplies.
 */
export function movementsForStream(branches: readonly BranchOption[]): KitchenMovement[] {
  return [
    PRODUCE,
    ...branches.map((branch): KitchenMovement => ({
      action: 'transfer',
      destinationBranchId: branch.id,
    })),
  ]
}

/**
 * True when a movement is the intra-branch cross-activity one for this origin stream: a
 * transfer whose destination branch IS the origin branch (FR-013/050).
 *
 * Read as a QUESTION ABOUT BRANCHES, exactly as `ops.esb_endpoint_for` asks it server-side
 * (FR-051). Activity plays no part in the comparison on either side of the seam.
 */
export function isIntraBranch(
  movement: KitchenMovement,
  origin: ProductionStream | null | undefined,
): boolean {
  return (
    movement.action === 'transfer' &&
    origin != null &&
    movement.destinationBranchId === origin.branch.id
  )
}

/**
 * The other activity of the origin's branch — what an intra-branch movement is understood to
 * be moving to (bar → kitchen, kitchen → bar). DISPLAY ONLY: it names nothing stored, and
 * deriving it is what lets the surface stay legible without a destination-activity column.
 */
export function counterpartActivity(activity: ProductionActivity): ProductionActivity {
  return activity === 'bar' ? 'kitchen' : 'bar'
}

/**
 * The derived label. Mirrors the SQL arm for arm, including its fallback: a destination the
 * caller cannot resolve yields a generic string rather than a blank or a leaked id.
 */
export function deriveActionLabel(
  t: Translate,
  movement: KitchenMovement,
  branches: readonly BranchOption[],
): string {
  if (movement.action === 'produce') return t('kitchen.actionType.production')
  const branch = branches.find((b) => b.id === movement.destinationBranchId)
  return t('kitchen.actionType.transferTo', {
    branch: branch ? branchDisplayName(branch) : t('kitchen.actionType.transferTo.fallback'),
  })
}

/** The same label, abbreviated for the phone-width segmented control. */
export function deriveActionShortLabel(
  t: Translate,
  movement: KitchenMovement,
  branches: readonly BranchOption[],
): string {
  if (movement.action === 'produce') return t('kitchen.actionType.production')
  const branch = branches.find((b) => b.id === movement.destinationBranchId)
  return t('kitchen.actionType.transferTo.short', {
    branch: branch ? branchDisplayName(branch) : t('kitchen.actionType.transferTo.fallback'),
  })
}

/** Localized label for the activity half of a stream. */
export function activityLabel(t: Translate, activity: ProductionActivity): string {
  return activity === 'bar' ? t('kitchen.activity.bar') : t('kitchen.activity.kitchen')
}
