// Issue 6 bridge contracts: how a RecordCollection opens one of its records into the shared
// Issue 4 overlay host (as a panel entry) and how it escalates that record to a canonical
// full page. These are Issue 6-owned and reference the REAL Issue 4 host types directly.
//
// WIRING RECONCILIATION (2026-07-20): Issue 6's plan expected these opening contracts to be
// owned by Issue 5 at `@/components/record-viewer/record-viewer-contract`. That module never
// existed. Issue 5's real contract (`@/components/records/record-viewer.types`) owns the VIEWER
// RENDERING grammar (`RecordViewerAdapter`) — NOT the opening/routing seam. So the opening
// contracts stay in Issue 6, where the collection engine is their only caller.
import type { To } from 'react-router-dom'
import type { OverlayEntry, OverlayHostApi } from '@/shell/overlay-host'

export interface RecordViewerOpenSource {
  collectionId: string
  presentation: string
  pathname: string
  search: string
}

/**
 * A domain adapter turns one typed record + the source collection location into an OverlayEntry
 * for the Issue 4 host, and into the canonical full-page `To` for direct/refresh/bookmark
 * escalation. Issue 5 owns the RecordViewer renderer and its fields; Issue 6 owns only this seam.
 */
export interface RecordViewerOpeningContract<TRecord> {
  readonly recordType: string
  buildPanelEntry(record: TRecord, source: RecordViewerOpenSource): OverlayEntry
  toCanonicalPage(recordId: string, source: RecordViewerOpenSource): To
}

/**
 * The narrow subset of the Issue 4 `OverlayHostApi` that the React-free collection engine calls
 * when opening a record: open a fresh root panel, push a related record, or promote to a page. The
 * engine never renders `RecordPanelHost`, owns panel geometry, or touches the focus/Escape/Back
 * stack. The real `useOverlayHost()` controller is a superset and satisfies this without a cast.
 */
export type CollectionOverlayHost = Pick<OverlayHostApi, 'openRoot' | 'push' | 'openPage'>
