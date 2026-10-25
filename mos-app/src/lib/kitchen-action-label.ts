// Movement vocabulary + the DERIVED action label — the client mirror of
// `ops.kitchen_action_label(action, destination_branch_id, to_location_id)` (DD-WAY-13).
//
// There is no stored `action_type`. The label is computed from `action ∈ {produce,transfer}` plus
// where it goes: a transfer reads "Transfer to <Location name>", exactly as the SQL computes it. A
// destination the caller cannot name yields a generic string rather than a blank or a leaked id.
// Where a transfer may go is the database's answer (`ops.list_cafe_destination_locations`); this
// file holds no branch, activity or place rules.

import type { DestinationLocation } from '@/lib/db/cafe-locations'
import type { Translate } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import type {
  BranchOption,
  KitchenMovement,
  KitchenLogMovement,
  MovementKey,
  PlanMap,
  ProductionActivity,
  ProductionStream,
} from '@/lib/db/kitchen-logs.types'

/** Stable client-side index for a movement (see `MovementKey`). */
export function movementKey(movement: KitchenLogMovement): MovementKey {
  if (movement.action === 'outlet_send') return 'outlet_send'
  if (movement.action === 'waste') return 'waste'
  return movement.action === 'produce'
    ? 'produce'
    : `transfer:${movement.toLocationId ?? movement.destinationBranchId ?? ''}`
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

/** Stable key for review context scoped to one log date and production stream. */
export function streamDateKey(logDate: string, branchId: string, activity: ProductionActivity): string {
  return `${logDate}|${streamKey(branchId, activity)}`
}

export function movementsEqual(a: KitchenMovement, b: KitchenMovement): boolean {
  return movementKey(a) === movementKey(b)
}

/** The production movement, present only when the selected stream's catalog row permits it. */
export const PRODUCE: KitchenMovement = { action: 'produce', destinationBranchId: null }

/**
 * Read the producing fact for one selected stream from the same live stream-Team catalog the
 * picker uses. An unresolved default carries no fact itself; failing closed here means it never
 * acquires an action until it is resolved to an actual catalog row.
 */
export function streamProduces(
  origin: ProductionStream | null | undefined,
  catalog: readonly ProductionStream[],
): boolean {
  return origin != null && catalog.some(
    stream => stream.branch.id === origin.branch.id
      && stream.activity === origin.activity
      && stream.produces === true,
  )
}

/**
 * Production, then one transfer per destination Location the database offers for this origin
 * (`ops.list_cafe_destination_locations`). One order everywhere: the origin's own branch first, then
 * the other branches, alphabetical by name within each. A new storage Location is therefore a
 * destination with no code change here.
 */
export function movementsFromDestinations(
  destinations: readonly DestinationLocation[],
  canProduce = true,
): KitchenMovement[] {
  if (!canProduce) return []
  const seen = new Set<string>()
  const transfers: KitchenMovement[] = []
  const rank = (d: DestinationLocation) => (d.same_branch ? 0 : 1)
  const ordered = [...destinations].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name) || a.location_id.localeCompare(b.location_id))
  for (const destination of ordered) {
    if (seen.has(destination.location_id)) continue
    seen.add(destination.location_id)
    transfers.push({
      action: 'transfer',
      destinationBranchId: destination.branch_id,
      toLocationId: destination.location_id,
      toLocationName: destination.name,
    })
  }
  return [PRODUCE, ...transfers]
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
 * The derived label. Mirrors the SQL arm for arm, including its fallback: a destination the
 * caller cannot resolve yields a generic string rather than a blank or a leaked id.
 */
export function deriveActionLabel(
  t: Translate,
  movement: KitchenLogMovement,
  branches: readonly BranchOption[],
  origin?: BranchOption | null,
): string {
  if (movement.action === 'outlet_send') return t('kitchen.actionType.outletSend', { branch: origin?.name ?? t('kitchen.actionType.transferTo.fallback') })
  if (movement.action === 'waste') return t('kitchen.actionType.waste')
  if (movement.action === 'produce') return t('kitchen.actionType.production')
  const branch = branches.find((b) => b.id === movement.destinationBranchId)
  return t('kitchen.actionType.transferTo', {
    branch: movement.toLocationName ?? branch?.name ?? t('kitchen.actionType.transferTo.fallback'),
  })
}

/**
 * Localized label for the activity half of a stream. The key map is TOTAL over
 * ProductionActivity via `satisfies` — adding an activity to the vocabulary without
 * adding its label is a compile error, not a picker that renders the wrong name
 * (#392). Adding 'prep' to PRODUCTION_ACTIVITIES without a 'kitchen.activity.prep'
 * message fails `tsc` before it ever renders.
 */
const ACTIVITY_LABEL_KEY = {
  kitchen: 'kitchen.activity.kitchen',
  bar: 'kitchen.activity.bar',
} satisfies Record<ProductionActivity, MessageKey>

export function activityLabel(t: Translate, activity: ProductionActivity): string {
  return t(ACTIVITY_LABEL_KEY[activity])
}

/**
 * Names a (branch, activity) production stream by its branch's name · the activity ("Rumah Rames ·
 * Kitchen"): the stream is what people pick, plan and produce for. Never "HQ"/"Stok HQ" for the
 * central kitchen (FR-061) — the catalog's own name is what keeps that true. `null` renders the em
 * dash rather than an empty gap.
 */
export function streamLabel(t: Translate, stream: ProductionStream | null): string {
  if (!stream) return '—'
  return `${stream.branch.name} · ${activityLabel(t, stream.activity)}`
}

/**
 * Where a transfer starts: a destination with something planned today, else the other stream of the
 * viewer's own branch (the usual hand-off), else the first offered. Never another branch just because
 * it is listed first.
 */
export function defaultTransferMovement(
  moves: readonly KitchenMovement[],
  origin: ProductionStream | null | undefined,
  plan: PlanMap,
): KitchenMovement | undefined {
  const transfers = moves.filter(move => move.action !== 'produce')
  const planned = transfers.find(move => Object.values(plan).some(byMovement => (byMovement[movementKey(move)] ?? 0) > 0))
  return planned ?? transfers.find(move => isIntraBranch(move, origin)) ?? transfers[0]
}
