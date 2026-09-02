import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import type { TaskCollectionQuery, TaskCollectionView } from './task-collection-adapter'

// my-pic/my-supervisor are always the default breadcrumb state below (isDefaultView), so a
// caller never needs to supply a label for them — dropping the two keys here is what let
// tasks-workspace.tsx drop its two unreachable label-map entries.
export type TaskCollectionViewLabels = Readonly<Record<Exclude<TaskCollectionView, 'my-pic' | 'my-supervisor'>, string>>

export function getActiveTaskView({
  query,
  savedViews,
  labels,
}: {
  query: Pick<TaskCollectionQuery, 'view' | 'savedViewId'>
  savedViews: readonly Pick<PersistedCollectionView, 'id' | 'name'>[]
  labels: TaskCollectionViewLabels
}): { savedViewId: string | null; label: string; hasNonDefaultView: boolean } {
  const saved = query.savedViewId === null
    ? undefined
    : savedViews.find((item) => item.id === query.savedViewId)
  const isDefaultView = query.view === 'all' || query.view === 'my-pic' || query.view === 'my-supervisor'
  return {
    savedViewId: saved?.id ?? null,
    // The cast is safe: isDefaultView is true for every view the labels map has no entry for
    // (my-pic, my-supervisor), so this branch only ever indexes with a key labels actually has.
    label: saved?.name ?? (isDefaultView ? labels.all : labels[query.view as Exclude<TaskCollectionView, 'my-pic' | 'my-supervisor'>]),
    hasNonDefaultView: query.savedViewId !== null || !isDefaultView,
  }
}
