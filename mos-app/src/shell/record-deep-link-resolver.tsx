import type { ReactNode } from 'react'
import type { MessageKey } from '@/i18n/messages'
import type { OverlayDeepLinkResolver, OverlayEntry } from './overlay-host'
import type { OverlayOwner } from './overlay-navigation'

/**
 * The shell-level deep-link restore seam (D-A1, fix work-order item 4). A hard load / refresh onto
 * a URL whose in-memory overlay session was lost carries the session only as a serialized
 * `__mosOverlay` route marker in `history.state`; this resolver rebuilds the record entry from the
 * marker's `entryKey` so the shared host can re-open it.
 *
 * Scope: page surfaces that keep the open record id in their OWN URL query (Tasks / Signals archive
 * `?record=`) restore through their page effect first — child effects run before the host's parent
 * deep-link effect, which then no-ops because a session already exists. So this resolver is the
 * fallback for route sessions whose id lives SOLELY in the marker: a Home-feed Signal, or a
 * Follow-up opened over its queue. Task deliberately has no entry: its addressable restore is owned
 * by the Tasks `?record=` page effect, which always wins, so a duplicate (and necessarily
 * leave-guard-less) task entry here would be dead and wrong if it ever fired.
 *
 * ONE RENDERER, DISTINCT RECORD KINDS (#190). v4 hardcodes an import of each kind's record host and
 * a `switch` over the kind. That couples the shell to every record surface — and on this line those
 * surfaces have not ported, so a hardcoded switch would import modules that do not exist. The kinds
 * are a REGISTRY instead: the resolver keeps the whole parsing/ownership contract, and each surface
 * ticket registers one descriptor. It is still one renderer — `RecordPanelHost`, through
 * `OverlayHostSlot` — and still one entry shape; only the per-kind content is injected.
 */
export interface RecordKindDescriptor {
  /** Which slot may render this kind's panel. */
  owner: OverlayOwner
  /** Catalog key for the panel's accessible label and chrome title. */
  titleKey: MessageKey
  /** The record's canonical page path — what "Open full page" and a cold deep link resolve to. */
  pagePath: (recordId: string) => string
  /** The kind's chrome-free panel content. The shared host owns Close / Back / Open-full-page. */
  renderPanel: (recordId: string) => ReactNode
}

export type RecordKindRegistry = Readonly<Record<string, RecordKindDescriptor>>

/**
 * The app's live record-kind registry.
 *
 * EMPTY ON THIS BRANCH, and that is the honest state rather than an oversight: #190 ports the hosts,
 * and a descriptor needs a record surface to render. Every kind arrives with the surface that owns
 * it — Signals (`signal`) and Follow-ups (`follow-up`) are the two v4 declares. Until one lands, a
 * marker-only deep link resolves to nothing and the viewer keeps the URL they asked for, which is
 * the same outcome v4 gives for any kind it does not know.
 */
export const RECORD_KINDS: RecordKindRegistry = {}

export function createRecordDeepLinkResolver(
  t: (key: MessageKey) => string,
  kinds: RecordKindRegistry,
): OverlayDeepLinkResolver {
  return (marker): OverlayEntry | null => {
    const idx = marker.entryKey.indexOf(':')
    if (idx < 0) return null
    const kind = marker.entryKey.slice(0, idx)
    const id = marker.entryKey.slice(idx + 1)
    if (!id) return null

    const descriptor = kinds[kind]
    if (!descriptor) return null

    return {
      key: marker.entryKey,
      owner: descriptor.owner,
      tenant: 'record',
      label: t(descriptor.titleKey),
      title: t(descriptor.titleKey),
      pageTo: { pathname: descriptor.pagePath(id) },
      content: descriptor.renderPanel(id),
    }
  }
}
