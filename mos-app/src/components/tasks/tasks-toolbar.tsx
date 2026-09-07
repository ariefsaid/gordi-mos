import { useCallback, useRef, useState } from 'react'
import type { TaskStatus } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { CollectionToolbar } from '@/components/record-collection/collection-toolbar'
import type { CollectionToolbarField } from '@/components/record-collection/collection-toolbar'
import type { CollectionToolbarSavedViews } from '@/components/record-collection/collection-toolbar'
import { useMenuPopover } from '@/lib/use-menu-popover'
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
  blockedCount: number
  onApplyOverdue: () => void
  onApplyBlocked: () => void
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

// AC-011/AC-013 (#749): system views are fixed in this order; legacy followups aliases to All.
const VIEW_VALUES: { value: TaskCollectionView; key: 'all' | 'my-work' | 'team-work' | 'overdue' }[] = [
  { value: 'all', key: 'all' },
  { value: 'my-work', key: 'my-work' },
  { value: 'team-work', key: 'team-work' },
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
  blockedCount,
  onApplyOverdue,
  onApplyBlocked,
  buOptions,
  personOptions,
  savedViews,
}: TasksToolbarProps) {
  const t = useT()
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
    if (key === 'team-work') return t('tasks.saved.team')
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
      fields={{
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
      }}
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
        <AttentionPill
          overdueCount={overdueCount}
          blockedCount={blockedCount}
          onApplyOverdue={onApplyOverdue}
          onApplyBlocked={onApplyBlocked}
        />
      )}
    />
  )
}

// #754 (AC-026..028) — ONE attention pill on the Tasks toolbar. Its trigger reads
// "N need attention" (overdue + blocked), outline chrome, status-coloured count text
// (DESIGN.md § DB-view toolbar controls: "one count pill for attention (outline,
// status-coloured count text)"). The click opens an anchored popover with two lines —
// "N overdue" · "N blocked" — and choosing one applies the corresponding view/filter,
// which the workspace reflects into the URL. Follows the table's scope (the counts are
// projected off `stats`, so a filtered-empty table renders 0 → nothing at all).
export interface AttentionPillProps {
  overdueCount: number
  blockedCount: number
  onApplyOverdue: () => void
  onApplyBlocked: () => void
}

function AttentionPill({ overdueCount, blockedCount, onApplyOverdue, onApplyBlocked }: AttentionPillProps) {
  const t = useT()
  const total = overdueCount + blockedCount
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus()
  }, [])
  useMenuPopover(open, close, menuRef, triggerRef)
  // AC-028: at zero the pill is absent — never a stale count, never a click target with
  // nothing behind it (a popover of "0 overdue · 0 blocked" would read as attention).
  if (total === 0) return null
  const overdueLabel = t(overdueCount === 1 ? 'tasks.attention.overdue.one' : 'tasks.attention.overdue.other', { count: overdueCount })
  const blockedLabel = t(blockedCount === 1 ? 'tasks.attention.blocked.one' : 'tasks.attention.blocked.other', { count: blockedCount })
  const labelText = t(total === 1 ? 'tasks.attention.label.one' : 'tasks.attention.label.other')
  return (
    <div className="attention-pill-zone">
      <button
        type="button"
        ref={triggerRef}
        className="attention-pill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('tasks.attention.aria', { count: total })}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="attention-pill__count tabular-nums">{total}</span>
        <span className="attention-pill__label">{labelText}</span>
      </button>
      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('tasks.attention.aria', { count: total })}
          className="attention-popover"
        >
          <button
            type="button"
            role="menuitem"
            className="attention-popover__item"
            disabled={overdueCount === 0}
            onClick={() => { setOpen(false); onApplyOverdue() }}
          >
            {overdueLabel}
          </button>
          <button
            type="button"
            role="menuitem"
            className="attention-popover__item"
            disabled={blockedCount === 0}
            onClick={() => { setOpen(false); onApplyBlocked() }}
          >
            {blockedLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}
