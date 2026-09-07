// Feed presentation for the Signal collection (Issue 6). It reuses SignalFeedRows — the SAME row
// anatomy the Home ambient tail renders (owner redirect 2026-07-22; rule:product-ban-inconsistent-
// components) — so a Signal reads as one visual grammar whether it's on Home or in the Signals
// archive Feed. The collection contract's injected onOpenRecord is wired to the row's whole-surface
// activation seam so browser Back preserves the collection query state (FR-V3-OPENER).
//
// #770 (owner ruling OD-WAY-96): the row itself carries no controls — `Create task`, `Add
// category`, and `Acknowledge` all live on the Signal record — so the archive Feed no longer
// threads a `createTaskHref` or a per-row categorize callback through here.
import { SignalFeedRows } from './signal-feed-rows'
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
  return (
      <SignalFeedRows
        variant="archive"
        signals={[...projection.visibleRecords]}
        authorNamesById={namesToRecord(context.authorNamesById)}
        teamNamesById={namesToRecord(context.teamNamesById)}
        onOpen={onOpenRecord ? (signal) => onOpenRecord(signal) : undefined}
      />
  )
}
