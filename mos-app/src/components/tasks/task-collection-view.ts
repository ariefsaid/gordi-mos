import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import type { TaskCollectionQuery, TaskCollectionView } from './task-collection-adapter'

export type TaskCollectionViewLabels = Readonly<Record<TaskCollectionView, string>>

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
  return {
    savedViewId: saved?.id ?? null,
    label: saved?.name ?? labels[query.view],
    hasNonDefaultView: query.savedViewId !== null || query.view !== 'all',
  }
}
