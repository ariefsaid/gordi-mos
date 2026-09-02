import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import type { TaskCollectionQuery, TaskCollectionView } from './task-collection-adapter'

// my-pic/my-supervisor are always the default breadcrumb state below (isDefaultView), so a
// caller never needs to supply a label for them — dropping the two keys here is what let
// tasks-workspace.tsx drop its two unreachable label-map entries.
export type TaskCollectionViewLabels = Readonly<Record<Exclude<TaskCollectionView, 'my-pic' | 'my-supervisor'>, string>>

// Exhaustive switch, not a cast: TypeScript checks every TaskCollectionView member is handled
// here, so a future view added to the union forces a decision at this call site instead of
// silently reaching an `as` that could paper over a real gap.
function builtInLabel(view: TaskCollectionView, labels: TaskCollectionViewLabels): string {
  switch (view) {
    case 'my-work': return labels['my-work']
    case 'overdue': return labels.overdue
    case 'followups': return labels.followups
    case 'all':
    case 'my-pic':
    case 'my-supervisor':
      // Unreachable in practice: getActiveTaskView only calls this when isDefaultView is false,
      // and isDefaultView is true for all three of these views.
      return labels.all
  }
}

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
    label: saved?.name ?? (isDefaultView ? labels.all : builtInLabel(query.view, labels)),
    hasNonDefaultView: query.savedViewId !== null || !isDefaultView,
  }
}
