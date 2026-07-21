import type { Dispatch, SetStateAction } from 'react'
import type { TaskStatus } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import type { TasksGroupBy } from './use-tasks-view-pref'
import type { TasksSavedView, TasksSavedViewChip } from './use-tasks-saved-view'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'
import { useT } from '@/i18n/use-t'

type SortCol = 'task' | 'status' | 'owner' | 'due' | 'activity'
type SortDir = 'ascending' | 'descending'

export type TasksToolbarProps = {
  groupBy: TasksGroupBy
  setGroupBy: (next: TasksGroupBy) => void
  businessUnitId: string
  setBusinessUnitId: Dispatch<SetStateAction<string>>
  statusFilter: TaskStatus | ''
  setStatusFilter: Dispatch<SetStateAction<TaskStatus | ''>>
  personFilter: string
  setPersonFilter: Dispatch<SetStateAction<string>>
  savedView: TasksSavedView
  onSavedViewChange: (next: TasksSavedViewChip | 'all') => void
  searchText: string
  setSearchText: Dispatch<SetStateAction<string>>
  includeArchived: boolean
  setIncludeArchived: Dispatch<SetStateAction<boolean>>
  sortCol: SortCol
  sortDir: SortDir
  onSortChange: (sort: SortCol, direction: SortDir) => void
  overdueCount: number
  overdueOnly: boolean
  onOverdueFilter: () => void
  onClearOverdue: () => void
  buOptions: BusinessUnitOption[]
  personOptions: PersonOption[]
}

const STATUS_VALUES: { value: TaskStatus | ''; key: 'any' | 'open' | 'inProgress' | 'blocked' | 'done' }[] = [
  { value: '', key: 'any' },
  { value: 'Open', key: 'open' },
  { value: 'In Progress', key: 'inProgress' },
  { value: 'Blocked', key: 'blocked' },
  { value: 'Done', key: 'done' },
]

const GROUP_VALUES: { value: TasksGroupBy; key: 'none' | 'status' | 'owner' | 'businessUnit' | 'projectProcess' | 'occurrence' }[] = [
  { value: 'none', key: 'none' },
  { value: 'status', key: 'status' },
  { value: 'owner', key: 'owner' },
  { value: 'bu', key: 'businessUnit' },
  { value: 'workline', key: 'projectProcess' },
  { value: 'occurrence', key: 'occurrence' },
]

const VIEW_VALUES: { value: TasksSavedViewChip | 'all'; key: 'all' | 'mine' | 'team' | 'overdue' | 'followups' }[] = [
  { value: 'all', key: 'all' },
  { value: 'mine', key: 'mine' },
  { value: 'team', key: 'team' },
  { value: 'overdue', key: 'overdue' },
  { value: 'followups', key: 'followups' },
]

/** Task-specific options projected into the one visible RecordCollection toolbar grammar. */
export function TasksToolbar({
  groupBy, setGroupBy,
  businessUnitId, setBusinessUnitId,
  statusFilter, setStatusFilter,
  personFilter, setPersonFilter,
  savedView, onSavedViewChange,
  searchText, setSearchText,
  includeArchived, setIncludeArchived,
  sortCol, sortDir, onSortChange,
  overdueCount, overdueOnly, onOverdueFilter, onClearOverdue,
  buOptions, personOptions,
}: TasksToolbarProps) {
  const t = useT()
  const statusLabel = (key: (typeof STATUS_VALUES)[number]['key']) => t(`tasks.status.${key}` as const)
  const groupLabel = (key: (typeof GROUP_VALUES)[number]['key']) => {
    if (key === 'none') return t('tasks.filter.none')
    if (key === 'status') return t('tasks.filter.status')
    if (key === 'owner') return t('tasks.pic')
    if (key === 'businessUnit') return t('tasks.filter.businessUnit')
    if (key === 'projectProcess') return t('tasks.filter.projectProcess')
    return t('tasks.filter.occurrence')
  }
  const viewLabel = (key: (typeof VIEW_VALUES)[number]['key']) =>
    key === 'all' ? t('tasks.saved.all') : t(`tasks.saved.${key}` as const)

  return (
    <CollectionToolbar
      className="tasks-collection-toolbar"
      presentation={{
        label: t('tasks.view'), value: 'table',
        options: [{ value: 'table', label: t('tasks.tab.table') }],
        onChange: () => {},
      }}
      views={{
        label: t('tasks.savedViews'),
        value: savedView.activeChip ?? 'all',
        options: VIEW_VALUES.map(({ value, key }) => ({ value, label: viewLabel(key) })),
        onChange: onSavedViewChange,
      }}
      search={{
        label: t('tasks.filter.search'),
        placeholder: t('tasks.filter.searchPlaceholder'),
        value: searchText,
        onChange: setSearchText,
      }}
      filters={[
        {
          id: 'task-group', label: t('tasks.filter.group'), value: groupBy,
          options: GROUP_VALUES.map(({ value, key }) => ({ value, label: groupLabel(key) })),
          onChange: (value) => setGroupBy(value as TasksGroupBy),
        },
        {
          id: 'task-bu', label: t('tasks.filter.businessUnit'), value: businessUnitId,
          options: [
            { value: '', label: t('tasks.saved.all') },
            ...buOptions.map((bu) => ({ value: bu.id, label: bu.name })),
          ],
          onChange: setBusinessUnitId,
        },
        {
          id: 'task-status', label: t('tasks.filter.status'), value: statusFilter,
          options: STATUS_VALUES.map(({ value, key }) => ({ value, label: statusLabel(key) })),
          onChange: (value) => setStatusFilter(value as TaskStatus | ''),
        },
        {
          id: 'task-person', label: t('tasks.filter.person'), value: personFilter,
          options: [
            { value: '', label: t('tasks.filter.anyone') },
            ...personOptions.map((person) => ({ value: person.id, label: person.full_name })),
          ],
          onChange: setPersonFilter,
        },
        {
          id: 'task-sort', label: t('tasks.filter.sort'), value: `${sortCol}:${sortDir}`,
          options: [
            { value: 'due:ascending', label: t('tasks.filter.sortDueSoonest') },
            { value: 'due:descending', label: t('tasks.filter.sortDueLatest') },
            { value: 'task:ascending', label: t('tasks.filter.sortTask') },
            { value: 'status:ascending', label: t('tasks.filter.sortStatus') },
            { value: 'owner:ascending', label: t('tasks.filter.sortPic') },
            { value: 'activity:descending', label: t('tasks.filter.sortActivity') },
          ],
          onChange: (value) => {
            const [sort, direction] = value.split(':')
            onSortChange(sort as SortCol, direction as SortDir)
          },
        },
      ]}
      toggles={(
        <>
          <label className="collection-toolbar__toggle">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              aria-label={t('tasks.filter.showArchived')}
              className="archived-checkbox"
            />
            <span>{t('tasks.filter.showArchived')}</span>
          </label>
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
          {overdueOnly ? (
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
