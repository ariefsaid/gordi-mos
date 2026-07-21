import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { correctSignal } from '@/lib/db/signals'
import type { SignalRow } from '@/lib/db/signals.types'
import { useSignalComposer } from '@/shell/signal-composer-host'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import {
  signalCollectionDescriptor,
  SIGNAL_COLLECTION_NEUTRAL_QUERY,
  type SignalCollectionQuery,
} from './signal-collection-adapter'
import { SignalFeed } from './signal-feed'

// C3b (AC-426/FR-414): the Home ambient feed slot. It now shares the ONE signalCollectionDescriptor
// with the Signals archive (FR-V3-013 — no second Signal loader): it drives the descriptor in
// urlMode="fixed" with a fixed, non-retracted Feed query, so it never steals the Home route's URL.
// The engine owns loading/error/empty; Home keeps its existing quiet-degradation policy (render the
// feed + composer row even when the fetch fails). "Create Task" navigates to the canonical record,
// where the real Create-follow-up-Task flow lives (Rule 11 — one implementation, not a second flow).

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
  const { open: openSignalComposer, postCount } = useSignalComposer()

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
    <SignalFeed
      signals={signals}
      authorNamesById={data ? namesToRecord(data.context.authorNamesById) : {}}
      teamNamesById={data ? namesToRecord(data.context.teamNamesById) : {}}
      onShareClick={openSignalComposer}
      onCategorize={(signalId, category) => { void handleCategorize(signalId, category) }}
      onCreateTask={openRecord}
      onOpen={openRecord}
    />
  )
}
