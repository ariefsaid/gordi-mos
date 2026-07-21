// Feed presentation for the Signal collection (Issue 6). It reuses the existing SignalFeed/SignalCard
// grammar and reads the React-scoped open/categorize/compose callbacks from the collection ACTIONS
// context, so the module-level descriptor can render it without threading router/composer state.
import { SignalFeed } from './signal-feed'
import { useSignalCollectionActions } from './signal-collection-actions'
import type { SignalRow } from '@/lib/db/signals.types'
import type { CollectionPresentationProps, CollectionProjection } from '@/lib/record-collection/types'
import type { SignalCollectionContext, SignalCollectionQuery, SignalRenderGroup } from './signal-collection-adapter'

function namesToRecord(map: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(map)
}

export function SignalFeedPresentation({
  projection,
  context,
}: CollectionPresentationProps<
  SignalRow,
  SignalCollectionQuery,
  CollectionProjection<SignalRow, SignalRenderGroup>,
  SignalCollectionContext,
  string
>) {
  const actions = useSignalCollectionActions()
  return (
    <SignalFeed
      signals={[...projection.visibleRecords]}
      authorNamesById={namesToRecord(context.authorNamesById)}
      teamNamesById={namesToRecord(context.teamNamesById)}
      siteNamesByTeamId={namesToRecord(context.siteNamesByTeamId)}
      onShareClick={actions.onShareClick}
      onCategorize={actions.onCategorize}
      onCreateTask={actions.onCreateTask}
      onOpen={actions.onOpen}
    />
  )
}
