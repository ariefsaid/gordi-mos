import { useRef, type ReactNode } from 'react'
import { CloseIcon } from '@/shell/icons'
import '@/components/ui/FilterChip.css'
import {
  CollectionToolbar,
  type CollectionToolbarChip,
  type CollectionToolbarFilter,
  type CollectionToolbarSavedViews,
} from '@/components/record-collection/collection-toolbar'
import type { CollectionViewOperationStatus } from '@/lib/record-collection/types'
import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { useT } from '@/i18n/use-t'
import { useIsDesktop } from '@/shell/use-is-desktop'
import type { TaskStatus } from '@/lib/db/tasks.types'
import type {
  TaskCollectionGroup,
  TaskCollectionPresentation,
  TaskCollectionQuery,
  TaskCollectionSort,
  TaskCollectionView,
} from './task-collection-query'

type SortDir = TaskCollectionQuery['direction']
type TasksSavedViewSaveResult = PersistedCollectionView | null | void
type SavedViewRetryAction = { kind: 'load' } | { kind: 'apply'; id: string } | { kind: 'save'; name: string }

type TasksToolbarSavedViews = {
  label: string
  selectedId: string | null
  operation: CollectionViewOperationStatus
  error: string | null
  items: readonly { id: string; name: string }[]
  onLoad?: () => void | Promise<void>
  onApply: (id: string) => void | Promise<void>
  onSave: (name: string) => TasksSavedViewSaveResult | Promise<TasksSavedViewSaveResult>
}

export type TasksToolbarProps = {
  query: TaskCollectionQuery
  onQueryChange: (patch: Partial<TaskCollectionQuery>) => void
  onViewChange: (next: TaskCollectionView) => void
  onPresentationChange: (next: TaskCollectionPresentation) => void
  onFieldToggle: (field: string, visible: boolean) => void
  overdueCount: number
  onOverdueFilter: () => void
  onClearOverdue: () => void
  onClearFilters: () => void
  buOptions: readonly BusinessUnitOption[]
  personOptions: readonly PersonOption[]
  savedViews?: TasksToolbarSavedViews
  attentionCounts?: { overdue: number; blocked: number; total: number }
  onAttentionOverdue?: () => void
  onAttentionBlocked?: () => void
  /** OD-TASK-3: org-wide viewers (admin) keep the full "All" list; everyone else's is "Relevant". */
  viewerOrgWide: boolean
  resultSummary?: ReactNode
}

const STATUS_VALUES: { value: TaskStatus | ''; key: 'any' | 'open' | 'inProgress' | 'blocked' | 'done' }[] = [
  { value: '', key: 'any' },
  { value: 'Open', key: 'open' },
  { value: 'In Progress', key: 'inProgress' },
  { value: 'Blocked', key: 'blocked' },
  { value: 'Done', key: 'done' },
]

const GROUP_VALUES: { value: TaskCollectionGroup; key: 'none' | 'status' | 'pic' | 'businessUnit' | 'projectProcess' | 'objective' | 'occurrence' }[] = [
  { value: 'none', key: 'none' },
  { value: 'status', key: 'status' },
  { value: 'pic', key: 'pic' },
  { value: 'bu', key: 'businessUnit' },
  { value: 'workline', key: 'projectProcess' },
  { value: 'objective', key: 'objective' },
  { value: 'occurrence', key: 'occurrence' },
]

const VIEW_VALUES: { value: TaskCollectionView; key: 'all' | 'my-work' | 'team-work' | 'overdue' }[] = [
  { value: 'all', key: 'all' },
  { value: 'my-work', key: 'my-work' },
  { value: 'team-work', key: 'team-work' },
  { value: 'overdue', key: 'overdue' },
]

const FIELD_OPTIONS: { value: string; key: string; required?: boolean }[] = [
  { value: 'title', key: 'tasks.label.task', required: true },
  { value: 'pic', key: 'tasks.pic', required: true },
  { value: 'supervisor', key: 'tasks.supervisor', required: true },
  { value: 'status', key: 'tasks.filter.status', required: true },
  { value: 'due', key: 'tasks.dueLabel', required: true },
  { value: 'businessUnit', key: 'tasks.filter.businessUnit' },
  { value: 'workline', key: 'tasks.filter.projectProcess' },
  { value: 'objective', key: 'tasks.objective' },
  { value: 'activity', key: 'tasks.fields.activity' },
]

/** A quick filter on the attention counts: the shared chip look in its own tone; pressed = on, and shows the chip's remove mark. */
function AttentionChip({ tone, pressed, onClick, children }: { tone: 'overdue' | 'blocked'; pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`filter-chip filter-chip--${tone}`} aria-pressed={pressed} onClick={onClick}>
      <span>{children}</span>
      {pressed ? <CloseIcon size={16} /> : null}
    </button>
  )
}

export function TasksToolbar({
  query,
  onQueryChange,
  onViewChange,
  onPresentationChange,
  onFieldToggle,
  overdueCount,
  onOverdueFilter,
  onClearOverdue,
  onClearFilters,
  buOptions,
  personOptions,
  savedViews,
  attentionCounts,
  onAttentionOverdue,
  onAttentionBlocked,
  viewerOrgWide,
  resultSummary,
}: TasksToolbarProps) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const savedViewRetryRef = useRef<SavedViewRetryAction | null>(null)
  const attention = attentionCounts ?? { overdue: overdueCount, blocked: 0, total: overdueCount }
  const attentionTotal = attention.total

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

  // Every control carries its own visible label above it. Group and Sort sit in the bar; the
  // narrowing filters live behind "Filters & options" and show as removable chips when set.
  const filters: CollectionToolbarFilter[] = [
    {
      id: 'group',
      label: t('tasks.filter.group'),
      value: query.groupBy,
      options: GROUP_VALUES.map(({ value, key }) => ({ value, label: groupLabel(key) })),
      onChange: (value) => {
        onQueryChange({ groupBy: value as TaskCollectionGroup })
        try { localStorage.setItem('mos.tasks.groupBy', value === 'pic' ? 'owner' : value) } catch { /* storage disabled */ }
      },
    },
    {
      id: 'sort',
      label: t('tasks.filter.sort'),
      value: `${query.sort}:${query.direction}`,
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
        onQueryChange({ sort: sort as TaskCollectionSort, direction: direction as SortDir })
      },
    },
    {
      id: 'business-unit',
      label: t('tasks.filter.businessUnit'),
      value: query.businessUnitId ?? '',
      options: [
        { value: '', label: t('tasks.filter.anyBusinessUnit') },
        ...buOptions.map((unit) => ({ value: unit.id, label: unit.name })),
      ],
      onChange: (value) => onQueryChange({ businessUnitId: value || null }),
    },
    {
      id: 'status',
      label: t('tasks.filter.status'),
      value: query.status ?? '',
      options: STATUS_VALUES.map(({ value, key }) => ({ value, label: statusLabel(key) })),
      onChange: (value) => onQueryChange({ status: (value || null) as TaskStatus | null }),
    },
    {
      id: 'person',
      label: t('tasks.filter.person'),
      value: query.personId ?? '',
      options: [
        { value: '', label: t('tasks.filter.anyone') },
        ...personOptions.map((person) => ({ value: person.id, label: person.full_name })),
      ],
      onChange: (value) => onQueryChange({ personId: value || null }),
    },
  ]

  const chips: CollectionToolbarChip[] = []
  const buName = buOptions.find((unit) => unit.id === query.businessUnitId)?.name
  if (query.businessUnitId) chips.push({ key: 'bu', label: `${t('tasks.filter.businessUnit')}: ${buName ?? ''}`, onRemove: () => onQueryChange({ businessUnitId: null }) })
  if (query.status) chips.push({ key: 'status', label: `${t('tasks.filter.status')}: ${statusLabel(STATUS_VALUES.find((item) => item.value === query.status)?.key ?? 'any')}`, onRemove: () => onQueryChange({ status: null }) })
  const personName = personOptions.find((person) => person.id === query.personId)?.full_name
  if (query.personId) chips.push({ key: 'person', label: `${t('tasks.filter.person')}: ${personName ?? ''}`, onRemove: () => onQueryChange({ personId: null }) })
  if (query.overdueOnly) chips.push({ key: 'overdue', label: t('tasks.saved.overdue'), onRemove: onClearOverdue })
  if (query.includeArchived) chips.push({ key: 'archived', label: t('tasks.filter.includeArchived'), onRemove: () => onQueryChange({ includeArchived: false }) })

  let collectionSavedViews: CollectionToolbarSavedViews | undefined
  if (savedViews) {
    collectionSavedViews = {
      label: savedViews.label,
      selectedId: savedViews.selectedId,
      operation: savedViews.operation,
      error: savedViews.error,
      errorMessage: t('tasks.savedViewsError'),
      items: savedViews.items,
      onLoad: () => {
        savedViewRetryRef.current = { kind: 'load' }
        return savedViews.onLoad?.()
      },
      onRetry: () => {
        const retry = savedViewRetryRef.current
        if (!retry) return
        if (retry.kind === 'load') void savedViews.onLoad?.()
        else if (retry.kind === 'apply') void savedViews.onApply(retry.id)
        else void savedViews.onSave(retry.name)
      },
      onApply: (id) => {
        savedViewRetryRef.current = { kind: 'apply', id }
        return savedViews.onApply(id)
      },
      onSave: (name) => {
        savedViewRetryRef.current = { kind: 'save', name }
        return savedViews.onSave(name)
      },
    }
  }

  return (
    <CollectionToolbar
      className="tasks-decision-toolbar"
      exposedFilterIds={isDesktop ? ['sort', 'group'] : ['sort']}
      resultSummary={resultSummary}
      chips={chips}
      onClearAll={onClearFilters}
      scopeActions={attentionTotal > 0 ? <div className="tasks-attention-actions" role="group" aria-label={t('tasks.filter.attentionAria', { count: attentionTotal })}>
        {attention.overdue > 0 ? <AttentionChip tone="overdue" pressed={query.overdueOnly || query.view === 'overdue'} onClick={() => (onAttentionOverdue ?? (query.overdueOnly ? onClearOverdue : onOverdueFilter))()}>{t('tasks.filter.overdueCount', { count: attention.overdue })}</AttentionChip> : null}
        {attention.blocked > 0 ? <AttentionChip tone="blocked" pressed={query.status === 'Blocked'} onClick={() => (onAttentionBlocked ?? (() => onQueryChange({ overdueOnly: false, status: 'Blocked' })))()}>{t('tasks.filter.blockedCount', { count: attention.blocked })}</AttentionChip> : null}
      </div> : undefined}
      presentation={{
        // Card is the phone rendering of Table, so Tasks has one live presentation and no
        // dead Table/Card choice.
        label: 'Presentation',
        value: query.layout,
        options: [{ value: query.layout, label: query.layout === 'card' ? 'Card' : 'Table' }],
        onChange: onPresentationChange,
      }}
      views={{
        label: t('tasks.toolbar.viewNavigation'),
        value: query.view,
        options: VIEW_VALUES.map(({ value, key }) => ({
          value,
          // OD-TASK-3: the All view is named Relevant for non-org-wide viewers; `view=all` URLs
          // keep working and land on the same scoped list.
          label: key === 'all'
            ? (viewerOrgWide ? t('tasks.saved.all') : t('tasks.saved.relevant'))
            : key === 'my-work'
              ? t('tasks.saved.mine')
              : key === 'team-work'
                ? t('tasks.saved.team')
                : t('tasks.saved.overdue'),
        })),
        onChange: (value) => onViewChange(value as TaskCollectionView),
      }}
      search={{
        label: t('tasks.filter.search'),
        placeholder: t('tasks.filter.searchPlaceholder'),
        value: query.q,
        onChange: (value) => onQueryChange({ q: value }),
      }}
      filters={filters}
      checks={[{
        key: 'include-archived',
        label: t('tasks.filter.includeArchived'),
        checked: query.includeArchived,
        onChange: (checked) => onQueryChange({ includeArchived: checked }),
      }]}
      fields={isDesktop ? {
        label: t('tasks.fields'),
        options: FIELD_OPTIONS.map((field) => ({ value: field.value, label: t(field.key as Parameters<typeof t>[0]), required: field.required })),
        visible: query.visibleFields,
        onToggle: onFieldToggle,
      } : undefined}
      savedViews={collectionSavedViews}
    />
  )
}
