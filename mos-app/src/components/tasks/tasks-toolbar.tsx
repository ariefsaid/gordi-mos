import type { TaskStatus } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'
import type { CollectionToolbarSavedViews } from '@/components/record-collection/collection-toolbar'
import { DueRunsTrigger } from '@/components/processes/due-runs-trigger'
import type { UseDueRunsResult } from '@/components/processes/use-due-runs'
import { useT } from '@/i18n/use-t'
import type {
  TaskCollectionGroup,
  TaskCollectionPresentation,
  TaskCollectionQuery,
  TaskCollectionSort,
  TaskCollectionView,
} from './task-collection-adapter'

type SortDir = TaskCollectionQuery['direction']

export type TasksToolbarProps = {
  query: TaskCollectionQuery
  onQueryChange: (patch: Partial<TaskCollectionQuery>) => void
  onViewChange: (next: TaskCollectionView) => void
  onPresentationChange: (next: TaskCollectionPresentation) => void
  overdueCount: number
  onOverdueFilter: () => void
  onClearOverdue: () => void
  buOptions: readonly BusinessUnitOption[]
  personOptions: readonly PersonOption[]
  savedViews?: CollectionToolbarSavedViews
  /** Design-fix (F5): the "N due to start" disclosure is one of the toolbar's attention-count
   * affordances, not a separate floating band — it renders inline beside the overdue count. */
  dueRuns?: UseDueRunsResult
}

const STATUS_VALUES: { value: TaskStatus | ''; key: 'any' | 'open' | 'inProgress' | 'blocked' | 'done' }[] = [
  { value: '', key: 'any' },
  { value: 'Open', key: 'open' },
  { value: 'In Progress', key: 'inProgress' },
  { value: 'Blocked', key: 'blocked' },
  { value: 'Done', key: 'done' },
]

const GROUP_VALUES: { value: TaskCollectionGroup | 'owner'; key: 'none' | 'status' | 'pic' | 'businessUnit' | 'projectProcess' | 'occurrence' }[] = [
  { value: 'none', key: 'none' },
  { value: 'status', key: 'status' },
  // `owner` remains a DOM compatibility alias for mature tests/bookmarks; the typed query is PIC.
  { value: 'owner', key: 'pic' },
  { value: 'bu', key: 'businessUnit' },
  { value: 'workline', key: 'projectProcess' },
  { value: 'occurrence', key: 'occurrence' },
]

// §Task-11 (Issue-8 gate): no Team-work chip until Issue 8 lands the real Task team_id contract.
const VIEW_VALUES: { value: TaskCollectionView; key: 'all' | 'my-work' | 'overdue' | 'followups' }[] = [
  { value: 'all', key: 'all' },
  { value: 'my-work', key: 'my-work' },
  { value: 'overdue', key: 'overdue' },
  { value: 'followups', key: 'followups' },
]

/** Task-specific options projected into the one visible RecordCollection toolbar grammar. */
export function TasksToolbar({
  query,
  onQueryChange,
  onViewChange,
  onPresentationChange,
  overdueCount,
  onOverdueFilter,
  onClearOverdue,
  buOptions,
  personOptions,
  savedViews,
  dueRuns,
}: TasksToolbarProps) {
  const t = useT()
  const statusLabel = (key: (typeof STATUS_VALUES)[number]['key']) => t(`tasks.status.${key}` as const)
  const groupLabel = (key: (typeof GROUP_VALUES)[number]['key']) => {
    if (key === 'none') return t('tasks.filter.none')
    if (key === 'status') return t('tasks.filter.status')
    if (key === 'pic') return t('tasks.pic')
    if (key === 'businessUnit') return t('tasks.filter.businessUnit')
    if (key === 'projectProcess') return t('tasks.filter.projectProcess')
    return t('tasks.filter.occurrence')
  }
  const viewLabel = (key: (typeof VIEW_VALUES)[number]['key']) => {
    if (key === 'all') return t('tasks.saved.all')
    if (key === 'my-work') return t('tasks.saved.mine')
    if (key === 'overdue') return t('tasks.saved.overdue')
    return t('tasks.saved.followups')
  }

  return (
    <CollectionToolbar
      className="tasks-collection-toolbar"
      presentation={{
        label: t('tasks.view'),
        value: query.layout,
        options: [
          { value: 'table', label: t('tasks.tab.table') },
          { value: 'card', label: 'Card' },
        ],
        onChange: onPresentationChange,
      }}
      views={{
        label: t('tasks.savedViews'),
        value: query.view,
        options: VIEW_VALUES.map(({ value, key }) => ({ value, label: viewLabel(key) })),
        onChange: onViewChange,
      }}
      savedViews={savedViews}
      search={{
        label: t('tasks.filter.search'),
        placeholder: t('tasks.filter.searchPlaceholder'),
        value: query.q,
        onChange: (value) => onQueryChange({ q: value }),
      }}
      filters={[
        {
          id: 'task-group', label: t('tasks.filter.group'), value: query.groupBy === 'pic' ? 'owner' : query.groupBy,
          options: GROUP_VALUES.map(({ value, key }) => ({ value, label: groupLabel(key) })),
          onChange: (value) => {
            const groupBy = value === 'owner' ? 'pic' : value as TaskCollectionGroup
            onQueryChange({ groupBy })
            // Compatibility persistence for the mature Task preference contract. URL/query state
            // remains authoritative; this write is not read by the live collection.
            try { localStorage.setItem('mos.tasks.groupBy', value) } catch { /* storage disabled */ }
          },
        },
        {
          id: 'task-bu', label: t('tasks.filter.businessUnit'), value: query.businessUnitId ?? '',
          options: [
            { value: '', label: t('tasks.filter.anyBusinessUnit') },
            ...buOptions.map((bu) => ({ value: bu.id, label: bu.name })),
          ],
          onChange: (value) => onQueryChange({ businessUnitId: value || null }),
        },
        {
          id: 'task-status', label: t('tasks.filter.status'), value: query.status ?? '',
          options: STATUS_VALUES.map(({ value, key }) => ({ value, label: statusLabel(key) })),
          onChange: (value) => onQueryChange({ status: (value || null) as TaskStatus | null }),
        },
        {
          // Adopted mockup: ONE "Person" filter (Anyone default) that matches a person as PIC OR
          // Supervisor — never a split PIC/Supervisor pair (that was a migration regression).
          id: 'task-person', label: t('tasks.filter.person'), value: query.personId ?? '',
          options: [
            { value: '', label: t('tasks.filter.anyone') },
            ...personOptions.map((person) => ({ value: person.id, label: person.full_name })),
          ],
          onChange: (value) => onQueryChange({ personId: value || null }),
        },
        {
          id: 'task-sort', label: t('tasks.filter.sort'), value: `${query.sort}:${query.direction}`,
          options: [
            { value: 'due:ascending', label: t('tasks.filter.sortDueSoonest') },
            { value: 'due:descending', label: t('tasks.filter.sortDueLatest') },
            { value: 'task:ascending', label: t('tasks.filter.sortTask') },
            { value: 'status:ascending', label: t('tasks.filter.sortStatus') },
            { value: 'pic:ascending', label: t('tasks.filter.sortPic') },
            { value: 'supervisor:ascending', label: t('tasks.supervisor') },
            { value: 'activity:descending', label: t('tasks.filter.sortActivity') },
          ],
          onChange: (value) => {
            const [sort, direction] = value.split(':')
            onQueryChange({
              sort: sort as TaskCollectionSort,
              direction: direction as SortDir,
            })
          },
        },
      ]}
      toggles={(
        <>
          <label className="collection-toolbar__toggle">
            <input
              type="checkbox"
              checked={query.includeArchived}
              onChange={(event) => onQueryChange({ includeArchived: event.target.checked })}
              aria-label={t('tasks.filter.showArchived')}
              className="archived-checkbox"
            />
            <span>{t('tasks.filter.showArchived')}</span>
          </label>
          {/* F5 design fix: the "N due to start" disclosure and the "N overdue" count are the
              toolbar's two attention-count affordances — they render adjacent, in one shared
              tinted-pill grammar (see .overdue-filter-btn / .due-runs-trigger), instead of one
              living in a separate floating band below the toolbar. */}
          {dueRuns ? (
            <DueRunsTrigger due={dueRuns.due} expanded={dueRuns.expanded} onToggle={dueRuns.toggleExpanded} />
          ) : null}
          {overdueCount > 0 ? (
            <button
              type="button"
              className="overdue-filter-btn"
              aria-label={t('tasks.filter.overdueAria', { count: overdueCount })}
              onClick={onOverdueFilter}
            >
              {t('tasks.filter.overdueCount', { count: overdueCount })}
            </button>
          ) : null}
          {query.overdueOnly ? (
            <button
              type="button"
              className="overdue-chip"
              aria-label={t('tasks.filter.clearOverdue')}
              onClick={onClearOverdue}
            >
              {t('tasks.filter.overdueOnly')}
            </button>
          ) : null}
        </>
      )}
    />
  )
}
