import type { TaskStatus } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'
import type { CollectionToolbarField } from '@/components/record-collection/collection-toolbar'
import type { CollectionToolbarSavedViews } from '@/components/record-collection/collection-toolbar'
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
  onFieldToggle: (field: string, visible: boolean) => void
  overdueCount: number
  onOverdueFilter: () => void
  onClearOverdue: () => void
  buOptions: readonly BusinessUnitOption[]
  personOptions: readonly PersonOption[]
  savedViews?: CollectionToolbarSavedViews
  /** The recurring-runs-due-to-start source. Its count folds into the single attention pill
   * (item 3(a)); the pill also toggles this list's disclosure when due work exists. */
  dueRuns?: UseDueRunsResult
  /** DO-6: the active view is a reserved placeholder — only the view chips render (no dead
   * search/filters/presentation controls above a coming-soon body). */
  reserved?: boolean
}

const STATUS_VALUES: { value: TaskStatus | ''; key: 'any' | 'open' | 'inProgress' | 'blocked' | 'done' }[] = [
  { value: '', key: 'any' },
  { value: 'Open', key: 'open' },
  { value: 'In Progress', key: 'inProgress' },
  { value: 'Blocked', key: 'blocked' },
  { value: 'Done', key: 'done' },
]

const GROUP_VALUES: { value: TaskCollectionGroup | 'owner'; key: 'none' | 'status' | 'pic' | 'businessUnit' | 'projectProcess' | 'objective' | 'occurrence' }[] = [
  { value: 'none', key: 'none' },
  { value: 'status', key: 'status' },
  // `owner` remains a DOM compatibility alias for mature tests/bookmarks; the typed query is PIC.
  { value: 'owner', key: 'pic' },
  { value: 'bu', key: 'businessUnit' },
  { value: 'workline', key: 'projectProcess' },
  { value: 'objective', key: 'objective' },
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
  onFieldToggle,
  overdueCount,
  onOverdueFilter,
  onClearOverdue,
  buOptions,
  personOptions,
  savedViews,
  dueRuns,
  reserved,
}: TasksToolbarProps) {
  const t = useT()
  const statusLabel = (key: (typeof STATUS_VALUES)[number]['key']) => t(`tasks.status.${key}` as const)
  const groupLabel = (key: (typeof GROUP_VALUES)[number]['key']) => {
    if (key === 'none') return t('tasks.filter.none')
    if (key === 'status') return t('tasks.filter.status')
    if (key === 'pic') return t('tasks.pic')
    if (key === 'businessUnit') return t('tasks.filter.businessUnit')
    if (key === 'projectProcess') return t('tasks.filter.projectProcess')
    if (key === 'objective') return t('tasks.objective')
    return t('tasks.filter.occurrence')
  }
  const viewLabel = (key: (typeof VIEW_VALUES)[number]['key']) => {
    if (key === 'all') return t('tasks.saved.all')
    if (key === 'my-work') return t('tasks.saved.mine')
    if (key === 'overdue') return t('tasks.saved.overdue')
    return t('tasks.saved.followups')
  }

  // Item 3(a) (critic-cited "Wall-of-Options" at w1024): the two former stat pills —
  // "N overdue" (overdue-task filter) and "N due to start" (recurring-run disclosure) —
  // fold into ONE count-labeled attention pill. Its count is the combined attention load;
  // clicking it opens the overdue filter and, when recurring work is due to start, reveals
  // that list. Capability gating + team scoping stay in useDueRuns (the due portion is 0 for
  // a viewer without process.start or with no due work in their teams), and the runs list
  // stays collapsed-by-default so it never floods the table (design-review step-6 CRITICAL).
  const dueCount = dueRuns?.due.length ?? 0
  const attentionCount = overdueCount + dueCount

  return (
    <CollectionToolbar
      className="tasks-collection-toolbar"
      reserved={reserved}
      presentation={{
        label: t('tasks.view'),
        value: query.layout,
        options: [
          { value: 'table', label: t('tasks.tab.table') },
          { value: 'card', label: t('tasks.tab.card') },
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
      fields={{
        label: 'Fields',
        visible: query.visibleFields,
        options: [
          { value: 'title', label: t('tasks.label.task'), required: true },
          { value: 'pic', label: t('tasks.pic'), required: true },
          { value: 'supervisor', label: t('tasks.supervisor'), required: true },
          { value: 'status', label: t('tasks.filter.status'), required: true },
          { value: 'due', label: t('tasks.dueLabel'), required: true },
          { value: 'businessUnit', label: t('tasks.filter.businessUnit') },
          { value: 'workline', label: t('tasks.filter.projectProcess') },
          { value: 'objective', label: t('tasks.objective') },
          { value: 'source', label: 'Source' },
          { value: 'activity', label: t('tasks.filter.sortActivity') },
        ] satisfies readonly CollectionToolbarField[],
        onToggle: onFieldToggle,
      }}
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
          <label className="collection-toolbar__toggle tap-floor">
            <input
              type="checkbox"
              checked={query.includeArchived}
              onChange={(event) => onQueryChange({ includeArchived: event.target.checked })}
              aria-label={t('tasks.filter.showArchived')}
              className="archived-checkbox"
            />
            <span>{t('tasks.filter.showArchived')}</span>
          </label>
          {/* One count-labeled attention pill (item 3(a)) — folds the former "N overdue" +
              "N due to start" pills. When due work exists it also carries the runs disclosure
              (aria-expanded reflects the list state); when it is overdue-only it keeps the
              "Filter to N overdue tasks" name so the overdue filter stays the same reachable,
              clearable control. */}
          {attentionCount > 0 ? (
            <button
              type="button"
              className="overdue-filter-btn"
              aria-label={dueCount > 0
                ? t('tasks.filter.attentionCount', { count: attentionCount })
                : t('tasks.filter.overdueAria', { count: overdueCount })}
              aria-expanded={dueCount > 0 ? (dueRuns?.expanded ?? false) : undefined}
              onClick={() => {
                if (overdueCount > 0) onOverdueFilter()
                if (dueCount > 0) dueRuns?.toggleExpanded()
              }}
            >
              {dueCount > 0
                ? t('tasks.filter.attentionCount', { count: attentionCount })
                : t('tasks.filter.overdueCount', { count: overdueCount })}
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
