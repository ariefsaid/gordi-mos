import type { TaskStatus } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'
import type { CollectionToolbarField } from '@/components/record-collection/collection-toolbar'
import type { CollectionToolbarSavedViews } from '@/components/record-collection/collection-toolbar'
import { useIsDesktop } from '@/shell/use-is-desktop'
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

// AC-002 (#743): AR Follow-ups is retired — the parser aliases old ?view=followups links to All.
// The Team-work chip is the saved-views ticket's (T2), not this one's.
const VIEW_VALUES: { value: TaskCollectionView; key: 'all' | 'my-work' | 'overdue' }[] = [
  { value: 'all', key: 'all' },
  { value: 'my-work', key: 'my-work' },
  { value: 'overdue', key: 'overdue' },
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
}: TasksToolbarProps) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const statusLabel = (key: (typeof STATUS_VALUES)[number]['key']) => t(`tasks.status.${key}` as const)
  const groupLabel = (key: (typeof GROUP_VALUES)[number]['key']) => {
    if (key === 'none') return `${t('tasks.filter.group')}: ${t('tasks.filter.none')}`
    if (key === 'status') return `${t('tasks.filter.group')}: ${t('tasks.filter.status')}`
    if (key === 'pic') return `${t('tasks.filter.group')}: ${t('tasks.pic')}`
    if (key === 'businessUnit') return `${t('tasks.filter.group')}: ${t('tasks.filter.businessUnit')}`
    if (key === 'projectProcess') return `${t('tasks.filter.group')}: ${t('tasks.filter.projectProcess')}`
    if (key === 'objective') return `${t('tasks.filter.group')}: ${t('tasks.objective')}`
    return `${t('tasks.filter.group')}: ${t('tasks.filter.occurrence')}`
  }
  const viewLabel = (key: (typeof VIEW_VALUES)[number]['key']) => {
    if (key === 'all') return t('tasks.saved.all')
    if (key === 'my-work') return t('tasks.saved.mine')
    return t('tasks.saved.overdue')
  }

  // #743 ruling round 3: Status is ONE dropdown-class control whose popover carries checkbox
  // choices (the Fields-chooser pattern — a popover's boxes are not toolbar controls, so the
  // row itself never renders a checkbox). A status choice is exclusive by data model; checking
  // the checked one clears it back to any. "Include archived" rides the SAME popover, additive
  // to whatever status is chosen (AC-008: never an exclusive option, never a toolbar checkbox).
  const statusDisplay = query.status
    ? statusLabel(STATUS_VALUES.find((entry) => entry.value === query.status)?.key ?? 'any')
    : statusLabel('any')
  const statusChoices = [
    ...STATUS_VALUES.filter(({ value }) => value !== '').map(({ value, key }) => ({
      key,
      label: statusLabel(key),
      checked: query.status === value,
      onChange: (checked: boolean) => onQueryChange({ status: checked ? (value as TaskStatus) : null }),
    })),
    {
      key: 'include-archived',
      label: t('tasks.filter.includeArchived'),
      checked: query.includeArchived,
      onChange: (checked: boolean) => onQueryChange({ includeArchived: checked }),
    },
  ]

  return (
    <CollectionToolbar
      className="tasks-collection-toolbar"
      presentation={{
        label: t('tasks.view'),
        value: query.layout,
        // AC-003: Table is the one live desktop presentation — Card is the phone rendering of
        // Table (A4), so no Table/Card switcher renders until a second presentation goes live.
        options: [
          { value: 'table', label: t('tasks.tab.table') },
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
      // #760 AC-049 — the phone "View & filters" door has no Fields chooser (phone renders CARDS,
      // and cards have no columns to pick from). Desktop keeps the chooser (AC-006 / #743).
      fields={isDesktop ? {
        label: t('tasks.fields'),
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
          { value: 'activity', label: t('tasks.fields.activity') },
        ] satisfies readonly CollectionToolbarField[],
        onToggle: onFieldToggle,
      } : undefined}
      search={{
        label: t('tasks.filter.search'),
        placeholder: t('tasks.filter.searchPlaceholder'),
        value: query.q,
        onChange: (value) => onQueryChange({ q: value }),
      }}
      filters={[
        {
          // AC-005 (OD-P3-6): the group control is tinted ONLY while a grouping is active —
          // untinted at None it stops looking like a second Status filter.
          id: 'task-group', label: t('tasks.filter.group'), value: query.groupBy === 'pic' ? 'owner' : query.groupBy,
          tinted: query.groupBy !== 'none',
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
          // AC-008 (#743 r3): Status stays ONE row-2 control of the dropdown class; its popover
          // carries the status choices (exclusive) plus the ADDITIVE "Include archived" — a
          // select option could only be exclusive, so archived cannot be one. When archived is
          // on, the trigger keeps it visible after the popover closes.
          id: 'task-status', label: t('tasks.filter.status'),
          display: query.includeArchived
            ? `${statusDisplay} + ${t('tasks.filter.includeArchived')}`
            : statusDisplay,
          popover: { choices: statusChoices },
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
          {/* The ONE tinted element in row 2 (OD-WAY-89) — and the ONE pill in EVERY state
              (FR-001): the pill itself carries the overdueOnly state (pressed + tinted), so no
              second active-filter chip ever renders. Clicking toggles the filter both ways.
              The runs-due pill LEFT the toolbar in this ticket (#743 ruling round 3); #754
              re-homes the runs source at Home/Café with its own tests. */}
          <button
            type="button"
            className={`overdue-filter-btn${query.overdueOnly ? ' overdue-filter-btn--active' : ''}`}
            aria-pressed={query.overdueOnly}
            aria-label={t('tasks.filter.overdueAria', { count: overdueCount })}
            onClick={query.overdueOnly ? onClearOverdue : onOverdueFilter}
          >
            {t('tasks.filter.overdueCount', { count: overdueCount })}
          </button>
        </>
      )}
    />
  )
}
