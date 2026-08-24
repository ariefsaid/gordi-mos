import type { ReactNode } from 'react'
import type { MessageKey } from '@/i18n/messages'
import type { OverlayDeepLinkResolver, OverlayEntry } from './overlay-host'
import type { OverlayOwner } from './overlay-navigation'
import { SignalRecordHost } from '@/components/signals/signal-record-host'
import { FollowUpRecordHost } from '@/components/follow-ups/follow-up-record-host'

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
 * a `switch` over the kind. That couples the shell to every record surface, so the kinds stay a
 * registry: the resolver keeps the whole parsing/ownership contract, and each surface registers one
 * descriptor. It is still one renderer — `RecordPanelHost`, through `OverlayHostSlot` — and still
 * one entry shape; only the per-kind content is injected. Both v4 kinds have now landed (#424) and
 * the registry below carries their hosts; a future kind arrives with the surface that owns it, the
 * same way.
 */
export interface RecordKindDescriptor {
  /** Which slot may render this kind's panel. */
  owner: OverlayOwner
  /** Catalog key for the panel's accessible label and chrome title. */
  titleKey: MessageKey
  /**
   * The record's canonical page path — what "Open full page" and a cold deep link resolve to.
   * OPTIONAL and deliberately absent for kinds whose record page was deleted: `follow-up` is
   * PANEL-ONLY (DD-WAY-36, #369, removed `/work/follow-ups/:id`), and a descriptor that named a
   * page would resurrect a doormat the project deliberately removed. A pageless entry carries no
   * `pageTo`, and the host chrome hides its Open-full-page button (OverlayHostSlot wires
   * `onOpenPage` only when `pageTo` exists).
   */
  pagePath?: (recordId: string) => string
  /** The kind's chrome-free panel content. The shared host owns Close / Back / Open-full-page. */
  renderPanel: (recordId: string) => ReactNode
}

export type RecordKindRegistry = Readonly<Record<string, RecordKindDescriptor>>

/**
 * The app's live record-kind registry (#424). Both v4 kinds are registered against the hosts that
 * ship:
 *
 *   • `signal` — a Home-feed Signal, owner `signals`: the panel claims the signals slot Home
 *     mounts (`signal-feed-section.tsx`), and its canonical page `/work/signals/:id` is a real,
 *     routed leaf (the `?record=` archive effect and "Open full page" share it).
 *   • `follow-up` — a queue Follow-up, owner `shell`, with NO page path: DD-WAY-36 (#369) deleted
 *     the Work follow-up record route, so the record is PANEL-ONLY. The entry carries no `pageTo`
 *     and the host chrome hides its Open-full-page button.
 *
 * Task stays deliberately absent (scope note above): its addressable restore is owned by the
 * Tasks `?record=` page effect, which always wins.
 */
export const RECORD_KINDS: RecordKindRegistry = {
  signal: {
    owner: 'signals',
    titleKey: 'signals.record.title',
    pagePath: (recordId) => `/work/signals/${recordId}`,
    renderPanel: (recordId) => <SignalRecordHost signalId={recordId} mode="panel" />,
  },
  'follow-up': {
    owner: 'shell',
    titleKey: 'followUps.record.title',
    renderPanel: (recordId) => <FollowUpRecordHost followUpId={recordId} mode="panel" />,
  },
}

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
      pageTo: descriptor.pagePath ? { pathname: descriptor.pagePath(id) } : undefined,
      content: descriptor.renderPanel(id),
    }
  }
}
