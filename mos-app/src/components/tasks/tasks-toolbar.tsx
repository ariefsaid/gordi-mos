import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Picker } from '@/components/ui/picker'
import {
  CollectionToolbar,
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
} from './task-collection-adapter'

type SortDir = TaskCollectionQuery['direction']
type TasksSavedViewSaveResult = PersistedCollectionView | null | void
type SavedViewRetryAction = { kind: 'load' } | { kind: 'apply'; id: string } | { kind: 'save' }

export type TasksToolbarSavedViews = {
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
  activeQuery: { summary: string; hasActiveFilters: boolean }
  buOptions: readonly BusinessUnitOption[]
  personOptions: readonly PersonOption[]
  savedViews?: TasksToolbarSavedViews
  attentionCounts?: { overdue: number; blocked: number }
  onAttentionOverdue?: () => void
  onAttentionBlocked?: () => void
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
  activeQuery,
  buOptions,
  personOptions,
  savedViews,
  attentionCounts,
  onAttentionOverdue,
  onAttentionBlocked,
}: TasksToolbarProps) {
  const t = useT()
  const isDesktop = useIsDesktop()
  const savedViewRetryRef = useRef<SavedViewRetryAction | null>(null)
  const attention = attentionCounts ?? { overdue: overdueCount, blocked: 0 }
  const attentionTotal = attention.overdue + attention.blocked

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

  const filters: CollectionToolbarFilter[] = [
    {
      id: 'group',
      label: t('tasks.filter.group'),
      value: query.groupBy,
      options: GROUP_VALUES.map(({ value, key }) => ({ value, label: groupLabel(key) })),
      tinted: query.groupBy !== 'none',
      onChange: (value) => {
        onQueryChange({ groupBy: value as TaskCollectionGroup })
        try { localStorage.setItem('mos.tasks.groupBy', value === 'pic' ? 'owner' : value) } catch { /* storage disabled */ }
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
      display: query.status ? statusLabel(STATUS_VALUES.find((item) => item.value === query.status)?.key ?? 'any') : statusLabel('any'),
      popover: {
        choices: [
          ...STATUS_VALUES.map(({ value, key }) => ({
            key: `status-${key}`,
            label: statusLabel(key),
            checked: (query.status ?? '') === value,
            onChange: () => onQueryChange({ status: (value || null) as TaskStatus | null }),
          })),
          {
            key: 'include-archived',
            label: t('tasks.filter.includeArchived'),
            checked: query.includeArchived,
            onChange: (checked: boolean) => onQueryChange({ includeArchived: checked }),
          },
        ],
      },
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
  ]

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
        // The save door owns the draft value. Its retry is triggered by pressing Save again.
      },
      onApply: (id) => {
        savedViewRetryRef.current = { kind: 'apply', id }
        return savedViews.onApply(id)
      },
      onSave: (name) => {
        savedViewRetryRef.current = { kind: 'save' }
        return savedViews.onSave(name)
      },
    }
  }

  return (
    <CollectionToolbar
      className="tasks-collection-toolbar"
      presentation={{
        // Card is the phone rendering of Table, so Tasks has one live desktop presentation and no
        // dead Table/Card segment in the exposed row.
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
          label: key === 'all'
            ? t('tasks.saved.all')
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
      fields={isDesktop ? {
        label: t('tasks.fields'),
        options: FIELD_OPTIONS.map((field) => ({ value: field.value, label: t(field.key as Parameters<typeof t>[0]), required: field.required })),
        visible: query.visibleFields,
        onToggle: onFieldToggle,
      } : undefined}
      savedViews={collectionSavedViews}
      toggles={
        <>
          {attentionTotal > 0 ? (
            <Picker
              label={t('tasks.filter.attentionAria', { count: attentionTotal })}
              hideLabel
              value=""
              placeholder={t('tasks.filter.attentionCount', { count: attentionTotal })}
              options={[
                { value: 'overdue', label: t('tasks.filter.overdueCount', { count: attention.overdue }) },
                { value: 'blocked', label: t('tasks.filter.blockedCount', { count: attention.blocked }) },
              ]}
              onChange={(value) => {
                if (value === 'overdue') (onAttentionOverdue ?? (query.overdueOnly ? onClearOverdue : onOverdueFilter))()
                else (onAttentionBlocked ?? (() => onQueryChange({ overdueOnly: false, status: 'Blocked' })))()
              }}
              className="tasks-attention-picker"
              triggerClassName={`overdue-filter-btn${query.overdueOnly ? ' overdue-filter-btn--active' : ''}`}
            />
          ) : null}
          {activeQuery.hasActiveFilters ? (
            <Button variant="ghost" className="tasks-toolbar__clear" onClick={onClearFilters}>
              {t('tasks.toolbar.clearFilters')}
            </Button>
          ) : null}
        </>
      }
    />
  )
}
