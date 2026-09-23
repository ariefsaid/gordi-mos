import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import type { SignalCollectionQuery } from './signal-collection-adapter'

export type SignalCollectionViewLabels = Readonly<Record<SignalCollectionQuery['view'], string>>

// Mirrors task-collection-view.ts's getActiveTaskView, minus the "unselected filter view" case
// (my-pic/my-supervisor) Tasks has and Signals doesn't — every SignalCollectionView is a real,
// user-facing view, so the only default is the bare 'all' with no saved view applied.
export function getActiveSignalView({
  query,
  savedViews,
  labels,
}: {
  query: Pick<SignalCollectionQuery, 'view' | 'savedViewId'>
  savedViews: readonly Pick<PersistedCollectionView, 'id' | 'name'>[]
  labels: SignalCollectionViewLabels
}): { label: string; hasNonDefaultView: boolean } {
  // No savedViewId in the return: the caller already has it in its own query (used verbatim as
  // the saved-views control's selectedId) — a second copy here would be an unread field, not a seam.
  const saved = query.savedViewId === null
    ? undefined
    : savedViews.find((item) => item.id === query.savedViewId)
  const isDefaultView = query.view === 'all'
  return {
    label: saved?.name ?? (isDefaultView ? labels.all : labels[query.view]),
    hasNonDefaultView: query.savedViewId !== null || !isDefaultView,
  }
}
