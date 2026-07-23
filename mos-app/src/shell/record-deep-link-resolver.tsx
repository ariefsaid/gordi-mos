import { SignalRecordHost } from '@/components/signals/signal-record-host'
import { FollowUpRecordHost } from '@/components/follow-ups/follow-up-record-host'
import type { MessageKey } from '@/i18n/messages'
import type { OverlayDeepLinkResolver, OverlayEntry } from './overlay-host'

/**
 * The shell-level deep-link restore seam (D-A1, fix work-order item 4). A hard load / refresh onto
 * a URL whose in-memory overlay session was lost carries the session only as a serialized
 * `__mosOverlay` route marker in `history.state`; this resolver rebuilds the record entry from the
 * marker's `entryKey` so the shared host can re-open it (overlay-host.tsx:399-411).
 *
 * Scope: page surfaces that keep the open record id in their OWN URL query (Tasks / Signals archive
 * `?record=`) restore through their page effect first — child effects run before the host's parent
 * deep-link effect, which then no-ops because a session already exists. So this resolver is the
 * fallback for route sessions whose id lives SOLELY in the marker: a Home-feed Signal or a Follow-up
 * opened over its queue (item 5). Both record hosts are self-contained — they own their own fetch,
 * and the shared host chrome owns Close / Back / Open-full-page — so no page-owned handlers
 * (leave-guard, onClose) need re-wiring here. Task deliberately has no branch: its addressable
 * restore is owned by the Tasks `?record=` page effect, which always wins, so a duplicate (and
 * necessarily leave-guard-less) task entry here would be dead and wrong if it ever fired.
 */
export function createRecordDeepLinkResolver(
  t: (key: MessageKey) => string,
): OverlayDeepLinkResolver {
  return (marker): OverlayEntry | null => {
    const idx = marker.entryKey.indexOf(':')
    if (idx < 0) return null
    const kind = marker.entryKey.slice(0, idx)
    const id = marker.entryKey.slice(idx + 1)
    if (!id) return null

    switch (kind) {
      case 'signal':
        return {
          key: marker.entryKey,
          owner: 'signals',
          tenant: 'record',
          label: t('signals.record.title'),
          title: t('signals.record.title'),
          pageTo: { pathname: `/work/signals/${id}` },
          content: <SignalRecordHost signalId={id} mode="panel" />,
        }
      case 'follow-up':
        return {
          key: marker.entryKey,
          owner: 'shell',
          tenant: 'record',
          label: t('followUps.record.title'),
          title: t('followUps.record.title'),
          pageTo: { pathname: `/work/follow-ups/${id}` },
          content: <FollowUpRecordHost followUpId={id} mode="panel" />,
        }
      default:
        return null
    }
  }
}
