// Feed presentation for the Signal collection (Issue 6). It reuses SignalFeedRows — the SAME row
// anatomy the Home ambient tail renders (owner redirect 2026-07-22; rule:product-ban-inconsistent-
// components) — so a Signal reads as one visual grammar whether it's on Home or in the Signals
// archive Feed. It reads the React-scoped open/categorize/compose callbacks from the collection
// ACTIONS context, so the module-level descriptor can render it without threading router/composer
// state. The collection contract also provides onOpenRecord — wire it through so browser Back
// preserves the collection query state (FR-V3-OPENER).
import { SignalFeedRows } from './signal-feed-rows'
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
  onOpenRecord,
}: CollectionPresentationProps<
  SignalRow,
  SignalCollectionQuery,
  CollectionProjection<SignalRow, SignalRenderGroup>,
  SignalCollectionContext,
  string
>) {
  const actions = useSignalCollectionActions()
  return (
      <SignalFeedRows
        signals={[...projection.visibleRecords]}
        authorNamesById={namesToRecord(context.authorNamesById)}
        teamNamesById={namesToRecord(context.teamNamesById)}
        onShareClick={actions.onShareClick}
        onCategorize={actions.onCategorize}
        onOpen={onOpenRecord ? (signal) => onOpenRecord(signal) : undefined}
      />
  )
}
