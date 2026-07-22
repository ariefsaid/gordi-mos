import type { Location, To } from 'react-router-dom'

// V3 Issue 4 — the serializable history/route contract for the shared overlay host.
// This module owns URL plumbing ONLY: no React nodes, no database rows, no dirty
// booleans, no confirmation copy, and no domain field names ever enter router state.

export const OVERLAY_HISTORY_KEY = '__mosOverlay'

export type OverlayHistoryMode = 'route' | 'ephemeral'

export type OverlayOwner = 'shell' | 'inbox' | 'tasks' | 'signals'

export type OverlayHistoryMarker = {
  sessionId: string
  depth: number
  entryKey: string
  mode: OverlayHistoryMode
  historyIndex: number
}

export type OverlayEntrySummary = {
  key: string
  owner: OverlayOwner
}

export type OverlayLeaveIntent =
  | {
      kind: 'close'
      via: 'explicit-close' | 'escape'
      from: OverlayEntrySummary
    }
  | {
      kind: 'back'
      via: 'internal-back'
      from: OverlayEntrySummary
      depth: number
    }
  | {
      kind: 'replace'
      via: 'push' | 'replace-root' | 'replace-current'
      from: OverlayEntrySummary
      to: OverlayEntrySummary
    }
  | {
      kind: 'open-page'
      via: 'open-page'
      from: OverlayEntrySummary
      to: To
    }
  | {
      kind: 'browser-pop'
      direction: 'back' | 'forward'
      from: OverlayHistoryMarker
      to: OverlayHistoryMarker | null
      delta: number
    }

export type OverlayLeaveDecision = { decision: 'allow' } | { decision: 'deny' }

export type OverlayLeaveGuard = (
  intent: OverlayLeaveIntent,
) => Promise<OverlayLeaveDecision>

export type OverlayLeaveRequest = {
  id: string
  intent: OverlayLeaveIntent
}

export type OverlayTransitionResult = {
  status: 'committed' | 'denied'
}

export type RecordRouteAdapter = {
  toPanel: (recordId: string, source: Location) => To
  toPage: (recordId: string, source: Location) => To
  toCollection: (source: Location) => To
  readPanelId: (location: Location) => string | null
}

const VALID_MODES: readonly OverlayHistoryMode[] = ['route', 'ephemeral']

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/**
 * Validate a router-state overlay marker. Malformed state (bad depth/index, unknown
 * mode, missing keys) is treated as "no overlay" so a corrupt URL never opens a host.
 */
export function readOverlayMarker(state: unknown): OverlayHistoryMarker | null {
  if (typeof state !== 'object' || state === null) return null
  const raw = (state as Record<string, unknown>)[OVERLAY_HISTORY_KEY]
  if (typeof raw !== 'object' || raw === null) return null
  const marker = raw as Record<string, unknown>
  if (typeof marker.sessionId !== 'string' || marker.sessionId.length === 0) return null
  if (typeof marker.entryKey !== 'string' || marker.entryKey.length === 0) return null
  if (typeof marker.mode !== 'string' || !VALID_MODES.includes(marker.mode as OverlayHistoryMode)) {
    return null
  }
  if (!isNonNegativeInteger(marker.depth)) return null
  if (!isNonNegativeInteger(marker.historyIndex)) return null
  return {
    sessionId: marker.sessionId,
    depth: marker.depth,
    entryKey: marker.entryKey,
    mode: marker.mode as OverlayHistoryMode,
    historyIndex: marker.historyIndex,
  }
}

/** Add/replace the overlay marker while preserving every unrelated router-state key. */
export function withOverlayMarker(
  state: unknown,
  marker: OverlayHistoryMarker,
): Record<string, unknown> {
  const base =
    typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {}
  return { ...base, [OVERLAY_HISTORY_KEY]: marker }
}

/**
 * Explicit Close exits the whole root-plus-N-push segment in one history step, while
 * internal Back uses one `-1`. Close from depth 0 is `-1`; from depth 2 is `-3`.
 */
export function historyDeltaForClose(depth: number): number {
  return -(depth + 1)
}

function toSearchString(target: To): string {
  if (typeof target === 'string') {
    const idx = target.indexOf('?')
    return idx === -1 ? '' : target.slice(idx)
  }
  return target.search ?? ''
}

/** Carry the source location's query onto a target `To` unless the target already sets one. */
export function preserveSearch(source: Location, target: To): To {
  const targetSearch = toSearchString(target)
  const search = targetSearch !== '' ? targetSearch : source.search
  if (typeof target === 'string') {
    const pathname = target.includes('?') ? target.slice(0, target.indexOf('?')) : target
    return { pathname, search }
  }
  return { ...target, search }
}

export type RecordRouteAdapterConfig = {
  collectionPath: string
  /** `null` for path-based records (Task); a query param name for query-based records (Signal). */
  panelParam: string | null
  pagePath: (recordId: string) => string
}

/**
 * Build a URL-only record route adapter. Path-based records (Task) open a panel by
 * routing to the page path; query-based records (Signal) toggle a single query param.
 * The adapter never accepts a database row or viewer field map — only ids and locations.
 */
export function createRecordRouteAdapter(config: RecordRouteAdapterConfig): RecordRouteAdapter {
  const { collectionPath, panelParam, pagePath } = config

  return {
    toPanel(recordId, source) {
      if (panelParam === null) {
        // Path-based record: the panel URL is the page path with the source query kept.
        return { pathname: pagePath(recordId), search: source.search }
      }
      const params = new URLSearchParams(source.search)
      params.set(panelParam, recordId)
      return { pathname: collectionPath, search: withQuery(params) }
    },
    toPage(recordId, source) {
      return { pathname: pagePath(recordId), search: source.search }
    },
    toCollection(source) {
      if (panelParam === null) {
        return { pathname: collectionPath, search: source.search }
      }
      const params = new URLSearchParams(source.search)
      params.delete(panelParam)
      return { pathname: collectionPath, search: withQuery(params) }
    },
    readPanelId(location) {
      if (panelParam === null) {
        const match = location.pathname.match(/\/([^/?#]+)$/)
        const id = match?.[1] ?? null
        if (!id || id === 'new' || location.pathname === collectionPath) return null
        // Only treat as a record when it is a child of the collection path.
        if (!location.pathname.startsWith(`${collectionPath}/`)) return null
        return id
      }
      return new URLSearchParams(location.search).get(panelParam)
    },
  }
}

function withQuery(params: URLSearchParams): string {
  const s = params.toString()
  return s === '' ? '' : `?${s}`
}
