import { useEffect, useMemo, useId } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { correctSignal } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import { useSignalComposer } from '@/shell/signal-composer-host'
import { OverlayHostSlot, useOptionalOverlayHost } from '@/shell/overlay-host'
import { useT } from '@/i18n/use-t'
import { SignalRecordHost } from './signal-record-host'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import {
  signalCollectionDescriptor,
  SIGNAL_COLLECTION_NEUTRAL_QUERY,
  type SignalCollectionQuery,
} from './signal-collection-adapter'
import { SignalFeedRows } from './signal-feed-rows'
import './signal-feed-section.css'

// C3b (AC-426/FR-414): the Home ambient feed slot. It now shares the ONE signalCollectionDescriptor
// with the Signals archive (FR-V3-013 — no second Signal loader): it drives the descriptor in
// urlMode="fixed" with a fixed, non-retracted Feed query, so it never steals the Home route's URL.
// The engine owns loading/error/empty; Home keeps its existing quiet-degradation policy (render the
// feed + composer row even when the fetch fails). Task creation remains on the focused Signal
// record where the real follow-up Task flow lives; this ambient card does not advertise a dead action.

// The fixed embedded query: Feed presentation, no retracted tombstones, no saved-view identity.
const HOME_FEED_QUERY: SignalCollectionQuery = {
  ...SIGNAL_COLLECTION_NEUTRAL_QUERY,
  layout: 'feed',
  showRetracted: false,
  savedViewId: null,
}

function namesToRecord(map: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(map)
}

export function SignalFeedSection() {
  const navigate = useNavigate()
  const host = useOptionalOverlayHost()
  const { open: openSignalComposer, postCount } = useSignalComposer()
  const t = useT()
  const titleId = useId()

  const controller = useRecordCollection({
    descriptor: signalCollectionDescriptor,
    urlMode: 'fixed',
    fixedQuery: HOME_FEED_QUERY,
    viewerId: null,
    accessRoles: [],
  })

  // Reload after every successful Share (postCount bump) so a freshly posted Signal appears at the
  // top of the ambient feed without a manual refresh (AC-430 / FR-414).
  useEffect(() => {
    if (postCount > 0) controller.retry()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postCount])

  function openRecord(signalId: string) {
    if (host) {
      const entry = {
        key: `signal:${signalId}`,
        owner: 'signals' as const,
        tenant: 'record' as const,
        label: 'Signal',
        title: 'Signal',
        pageTo: `/work/signals/${signalId}`,
        content: <SignalRecordHost signalId={signalId} mode="panel" />,
      }
      void host.openRoot(entry, 'route')
      return
    }
    navigate(`/work/signals?record=${signalId}`)
  }

  async function handleCategorize(signalId: string, category: SignalRow['category']) {
    if (!category) return
    await correctSignal(signalId, { category })
    controller.retry()
  }

  const data = controller.state.data
  const projection = controller.state.projection
  const signals = useMemo(() => (projection ? [...projection.visibleRecords] : []), [projection])

  if (controller.state.status === 'loading') return null // Home's own skeleton regions cover initial paint (NFR-405)

  return (
    <section className="signal-feed-section" aria-labelledby={titleId}>
      {/* Peer section-label grammar (F1/F5, Nielsen H4 consistency): same small-caps muted label
          + right-aligned link as the stream's OVERDUE / MY WORK TODAY bands — Signals is a peer
          section in the one scroll, not a bolted-on card with its own heading weight. */}
      <div className="signal-feed-head">
        <h3 id={titleId} className="signal-feed-label">{t('nav.signals')}</h3>
        <Link to="/work/signals" className="signal-feed-link">
          {t('nav.work.signals')} →
        </Link>
      </div>
      <SignalFeedRows
        signals={signals}
        authorNamesById={data ? namesToRecord(data.context.authorNamesById) : {}}
        teamNamesById={data ? namesToRecord(data.context.teamNamesById) : {}}
        onShareClick={openSignalComposer}
        onCategorize={(signalId, category) => { void handleCategorize(signalId, category) }}
        onOpen={(signal) => openRecord(signal.id)}
      />
      {host ? <OverlayHostSlot owner="signals" /> : null}
    </section>
  )
}
