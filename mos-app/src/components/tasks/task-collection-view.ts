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
  const isDefaultView = query.view === 'all' || query.view === 'my-pic' || query.view === 'my-supervisor'
  return {
    savedViewId: saved?.id ?? null,
    label: saved?.name ?? (isDefaultView ? labels.all : labels[query.view]),
    hasNonDefaultView: query.savedViewId !== null || !isDefaultView,
  }
}
