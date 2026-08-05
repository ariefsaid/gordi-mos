import type { NotificationRow } from '@/lib/db/notifications'
import type { OverlayEntryDraft } from './inbox-host-contracts'

/**
 * inbox-target — the pure, fail-closed resolver that turns a private Inbox notification into a
 * *safe, permitted* canonical record door (Issue 7). It is a routing/presentation adapter, NOT a
 * domain model: Notification, Task, Signal, and Follow-up stay separate typed models and this
 * resolver never unions them.
 *
 * Non-negotiables (docs/plans/2026-07-20-v3-inbox-deputy.md §"Target and content contracts"):
 *  - Only a typed `{ type, id }` identity is openable, keyed through an allow-listed registry.
 *  - The producer `entity.route` is LEGACY INPUT ONLY: it is never used as route authority. The
 *    canonical `pageTo` always comes from the injected viewer adapter (the Issue 5 RecordViewer).
 *  - Unknown / malformed / route-only-legacy / feature-off / cross-org / missing / permission-denied
 *    targets fail closed with honest, localizable copy and no fabricated facts.
 *  - Legacy comment kinds (`weekly_update`, `daily_log`) are NOT cast to Follow-up — they stay
 *    non-openable.
 *
 * The Issue 5 viewer adapters, the `can()` permission check, org scope, record existence, and the
 * `SHOW_FOLLOWUPS` feature flag are all injected as `ResolveTargetDeps` so this unit is provable at
 * the Vitest layer with no Supabase/host. See inbox-host-contracts.ts for the consumed seams.
 */

export type NotificationTargetType = 'task' | 'signal' | 'follow_up'

/** The only openable identity. */
export type NotificationTargetRef = {
  type: NotificationTargetType
  id: string
}

/** The typed set that gates every resolution; anything else is `unknown-type`. */
export const ALLOWED_TARGET_TYPES: ReadonlySet<NotificationTargetType> = new Set([
  'task',
  'signal',
  'follow_up',
])

/** An Issue 5 RecordViewer adapter: builds the canonical overlay/page door for a typed ref. */
export type TargetViewerAdapter = {
  buildEntry(ref: NotificationTargetRef): OverlayEntryDraft
}

/** Allow-listed registry keyed by target type; a missing adapter is treated as feature-off. */
export type TargetRegistry = Partial<Record<NotificationTargetType, TargetViewerAdapter>>

export type ResolveTargetDeps = {
  registry: TargetRegistry
  /** `can()` for opening this record — fail closed on false. */
  canOpen(ref: NotificationTargetRef): boolean
  /** Org-scope guard — fail closed on a cross-org target. */
  isSameOrg(ref: NotificationTargetRef): boolean
  /** Record still exists (not archived/hard-gone). */
  recordExists(ref: NotificationTargetRef): boolean
  /** Feature flag for the target family (e.g. SHOW_FOLLOWUPS for `follow_up`). */
  isFeatureEnabled(type: NotificationTargetType): boolean
}

export type UnavailableReason =
  | 'malformed-target'
  | 'unknown-type'
  | 'unsafe-legacy-route'
  | 'missing-record'
  | 'permission-denied'
  | 'cross-org'
  | 'feature-off'

const REASON_MESSAGE_KEY: Record<UnavailableReason, string> = {
  'malformed-target': 'inbox.target.unavailable.malformed',
  'unknown-type': 'inbox.target.unavailable.unknownType',
  'unsafe-legacy-route': 'inbox.target.unavailable.legacyRoute',
  'missing-record': 'inbox.target.unavailable.missing',
  'permission-denied': 'inbox.target.unavailable.permission',
  'cross-org': 'inbox.target.unavailable.crossOrg',
  'feature-off': 'inbox.target.unavailable.featureOff',
}

export type NotificationTargetResolution =
  | {
      status: 'available'
      key: string
      ref: NotificationTargetRef
      entry: OverlayEntryDraft
    }
  | {
      status: 'unavailable'
      key: string
      reason: UnavailableReason
      messageKey: string
    }

/** The raw metadata envelope shape we defensively read (both current and route-free producers). */
type RawEntity = {
  type?: unknown
  id?: unknown
  route?: unknown
}

function readEntity(row: NotificationRow): RawEntity | null {
  const meta = row.metadata as { entity?: unknown } | null | undefined
  const entity = meta?.entity
  if (entity == null || typeof entity !== 'object') return null
  return entity as RawEntity
}

function unavailable(key: string, reason: UnavailableReason): NotificationTargetResolution {
  return { status: 'unavailable', key, reason, messageKey: REASON_MESSAGE_KEY[reason] }
}

/**
 * Resolve a notification into a typed, permitted, canonical record door — or an honest unavailable
 * result. Checks run in fail-closed order: shape → type allow-list → feature → org → existence →
 * permission. The producer route is read only to distinguish a legacy route-only row; it is never a
 * navigation target.
 */
export function resolveNotificationTarget(
  row: NotificationRow,
  deps: ResolveTargetDeps,
): NotificationTargetResolution {
  const key = row.id
  const entity = readEntity(row)

  // No entity object at all → malformed.
  if (entity == null) return unavailable(key, 'malformed-target')

  const type = typeof entity.type === 'string' ? entity.type : null
  const id = typeof entity.id === 'string' && entity.id.length > 0 ? entity.id : null
  const hasRoute = typeof entity.route === 'string' && entity.route.length > 0

  // No typed identity at all. A legacy row whose only signal is a raw producer route is honestly
  // non-openable — a raw metadata route is never a navigation authority.
  if (type == null && id == null) {
    return unavailable(key, hasRoute ? 'unsafe-legacy-route' : 'malformed-target')
  }

  // Partial identity (type without id, or id without type) → malformed.
  if (type == null || id == null) return unavailable(key, 'malformed-target')

  // Type must be on the allow-list; legacy kinds (weekly_update/daily_log) fall here, never cast up.
  if (!ALLOWED_TARGET_TYPES.has(type as NotificationTargetType)) {
    return unavailable(key, 'unknown-type')
  }
  const ref: NotificationTargetRef = { type: type as NotificationTargetType, id }

  // Feature flag (SHOW_FOLLOWUPS for follow_up) — a missing registry adapter is also feature-off.
  const adapter = deps.registry[ref.type]
  if (!deps.isFeatureEnabled(ref.type) || adapter == null) {
    return unavailable(key, 'feature-off')
  }
  if (!deps.isSameOrg(ref)) return unavailable(key, 'cross-org')
  if (!deps.recordExists(ref)) return unavailable(key, 'missing-record')
  if (!deps.canOpen(ref)) return unavailable(key, 'permission-denied')

  const entry = adapter.buildEntry(ref)
  return { status: 'available', key: entry.key, ref, entry }
}
