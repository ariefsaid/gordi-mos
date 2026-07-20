// INTEGRATION SEAM — Issue 6 minimal typed contracts for the Issue 4 overlay host and the
// Issue 5 record viewer, which are built in parallel on other branches and are NOT present here.
//
// These interfaces mirror the shapes fixed by:
//   - docs/plans/2026-07-20-v3-overlay-host.md  (OverlayEntry / OverlayHostApi / OverlayOwner)
//   - docs/plans/2026-07-20-v3-record-collection.md, "Issue 5 handoff" block
//     (RecordViewerOpenSource / RecordViewerOpeningContract)
//
// RATIFY-BEFORE-MERGE: when Issue 4 lands `@/shell/overlay-host` and Issue 5 lands
// `@/components/record-viewer/record-viewer-contract`, replace every import of this module with
// those real exports and delete this file. The collection engine imports ONLY these types, never a
// concrete host/viewer implementation, so the swap is type-level and mechanical.
import type { ReactNode } from 'react'
import type { To } from 'react-router-dom'

// --- Issue 4 overlay-host seam (subset the collection engine depends on) --------------------------

export type OverlayOwner = 'shell' | 'tasks' | 'signals'
export type OverlayTenant = 'record' | 'deputy' | 'quick'

export interface OverlayEntry {
  key: string
  owner: OverlayOwner
  tenant: OverlayTenant
  label: string
  title?: ReactNode
  pageTo?: To
  content: ReactNode
  leaveGuard?: (intent: unknown) => Promise<{ decision: 'allow' | 'deny' }>
}

export interface OverlayTransitionResult {
  status: 'committed' | 'denied'
}

/**
 * The narrow subset of `OverlayHostApi` the collection engine calls when opening a record: open a
 * fresh root panel, or push a related record onto the existing session. The engine never renders
 * `RecordPanelHost`, owns panel geometry, or touches the focus/Escape/Back stack — that is Issue 4.
 */
export interface OverlayHostApi {
  openRoot: (entry: OverlayEntry, mode: 'route' | 'ephemeral') => Promise<OverlayTransitionResult>
  push: (entry: OverlayEntry) => Promise<OverlayTransitionResult>
  openPage: (to: To) => Promise<OverlayTransitionResult>
}

// --- Issue 5 record-viewer seam (opening contract only) ------------------------------------------

export interface RecordViewerOpenSource {
  collectionId: string
  presentation: string
  pathname: string
  search: string
}

/**
 * Issue 5 owns the RecordViewer renderer and its fields. Issue 6 imports ONLY this opening contract:
 * a domain adapter turns one typed record + the source collection location into an OverlayEntry for
 * the Issue 4 host, and into the canonical full-page `To` for direct/refresh/bookmark escalation.
 */
export interface RecordViewerOpeningContract<TRecord> {
  readonly recordType: string
  buildPanelEntry(record: TRecord, source: RecordViewerOpenSource): OverlayEntry
  toCanonicalPage(recordId: string, source: RecordViewerOpenSource): To
}
