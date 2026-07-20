import type { ReactNode } from 'react'

/**
 * inbox-host-contracts — TYPES ONLY. The minimal shapes of the Issue 4 shared-overlay-host and
 * Issue 5 RecordViewer contracts that Issue 7 (Inbox triage + Deputy host adoption) *consumes*.
 *
 * These are NOT implementations. The real `OverlayHostProvider`/`useOverlayHost` host (Issue 4),
 * the `RecordViewer` opening contract (Issue 5), and the `RecordCollection` seam (Issue 6) are
 * built on their own branches (docs/plans/2026-07-20-v3-overlay-host.md, -record-viewer.md,
 * -record-collection.md). Issue 7 codes against these seams via dependency injection so its owned
 * units (target resolution, triage surface) are provable at the Vitest/RTL layer without a landed
 * host. When Issues 4/5/6 land, these local aliases are replaced by the real exported types at the
 * noted integration points; the resolver/triage behavior does not change.
 */

/** Issue 4 `To` — a router destination. Kept structural so it maps onto react-router's `To`. */
export type To = string | { pathname: string; search?: string; hash?: string }

/** Issue 4 `OverlayOwner`. Inbox quick triage and Deputy both use `'shell'` — they never add an owner. */
export type OverlayOwner = 'shell' | 'record'

/** Issue 4 `OverlayEntry.tenant`. Inbox records are `'record'`; quick triage is `'quick'`. */
export type OverlayTenant = 'record' | 'deputy' | 'quick'

/**
 * Issue 4 `OverlayEntry` (subset Issue 7 authors). The host owns `leaveGuard`, history, and modal
 * regime; Issue 7 only ever *authors* the identity/label/route/content fields below.
 */
export type OverlayEntry = {
  key: string
  owner: OverlayOwner
  tenant: OverlayTenant
  label: string
  title?: ReactNode
  pageTo?: To
  content: ReactNode
}

/** The subset of `OverlayEntry` a notification target resolves to (identity + canonical door + content). */
export type OverlayEntryDraft = Pick<
  OverlayEntry,
  'key' | 'owner' | 'tenant' | 'label' | 'title' | 'pageTo' | 'content'
>
