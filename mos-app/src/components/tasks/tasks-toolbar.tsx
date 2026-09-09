import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TaskFilterSelect } from './task-filter-select'
import { ErrorState } from '@/components/ui/state-kit'
import { ViewTabs } from '@/components/ui/view-tabs'
import type { CollectionViewOperationStatus } from '@/lib/record-collection/types'
import type { PersistedCollectionView } from '@/lib/record-collection/collection-view-spec'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { useT } from '@/i18n/use-t'
import type { TaskStatus } from '@/lib/db/tasks.types'
import type {
  TaskCollectionGroup,
  TaskCollectionPresentation,
  TaskCollectionQuery,
  TaskCollectionSort,
  TaskCollectionView,
} from './task-collection-adapter'
import './TasksToolbar.css'

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
  /** Kept in the seam for the shared collection contract; Tasks exposes one queue/list on this surface. */
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
  // `owner` remains a URL/bookmark compatibility alias for the typed PIC grouping.
  { value: 'owner', key: 'pic' },
  { value: 'bu', key: 'businessUnit' },
  { value: 'workline', key: 'projectProcess' },
  { value: 'objective', key: 'objective' },
  { value: 'occurrence', key: 'occurrence' },
]

const VIEW_VALUES: { value: TaskCollectionView; key: 'all' | 'my-work' | 'overdue' | 'completed' }[] = [
  { value: 'all', key: 'all' },
  { value: 'my-work', key: 'my-work' },
  { value: 'overdue', key: 'overdue' },
  { value: 'completed', key: 'completed' },
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

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
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
  activeQuery,
  buOptions,
  personOptions,
  savedViews,
}: TasksToolbarProps) {
  const t = useT()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [viewName, setViewName] = useState('')
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null)
  const saveTriggerRef = useRef<HTMLButtonElement | null>(null)
  const savedViewRetryRef = useRef<SavedViewRetryAction | null>(null)

  // The saved-view store is still owned by the RecordCollection engine. The new presentation only
  // changes where its controls live; it does not create a second persistence path.
  useEffect(() => {
    if (!savedViews?.onLoad) return
    savedViewRetryRef.current = { kind: 'load' }
    void savedViews.onLoad()
    // A toolbar mounts once per collection. Re-loading on every recreated callback duplicates the
    // request, so the deliberate lifecycle is mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The view switcher is the first decision in the queue. PIC/Supervisor-specific views remain
  // reachable through old URLs and their typed query, but the compact navigation only promotes
  // the stable, user-facing scopes that the current data contract supports.
  const activeView = VIEW_VALUES.some(({ value }) => value === query.view) ? query.view : 'all'
  const filterCount = [
    query.q,
    query.businessUnitId,
    query.status,
    query.picId,
    query.supervisorId,
    query.personId,
    query.groupBy !== 'none' ? query.groupBy : null,
    query.sort !== 'due' || query.direction !== 'ascending' ? query.sort : null,
    query.includeArchived ? 'archived' : null,
    query.overdueOnly,
    query.savedViewId,
  ].filter(Boolean).length

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

  const closeFilters = () => {
    setFiltersOpen(false)
    filterTriggerRef.current?.focus()
  }

  const handleFiltersKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Escape' || !filtersOpen) return
    event.preventDefault()
    event.stopPropagation()
    closeFilters()
  }

  const saveView = async () => {
    if (!savedViews || !viewName.trim() || savedViews.operation === 'saving') return
    const name = viewName.trim()
    savedViewRetryRef.current = { kind: 'save' }
    let result: TasksSavedViewSaveResult
    try {
      result = await savedViews.onSave(name)
    } catch {
      // The engine normally catches persistence errors and publishes them through `error`. Keep
      // the draft intact if an adapter callback rejects before it can publish that state.
      return
    }
    // A null result is the engine's explicit failure signal. Keep the row and name open so the
    // ErrorState retry action can repeat the same save; legacy void callbacks remain successful.
    if (result === null) return
    savedViewRetryRef.current = null
    setViewName('')
    setSaveOpen(false)
  }

  const applySavedView = (id: string) => {
    if (!savedViews) return
    savedViewRetryRef.current = { kind: 'apply', id }
    void savedViews.onApply(id)
  }

  const retrySavedView = () => {
    const action = savedViewRetryRef.current
    if (!action || !savedViews) return
    if (action.kind === 'save') {
      void saveView()
    } else if (action.kind === 'load') {
      void savedViews.onLoad?.()
    } else {
      void savedViews.onApply(action.id)
    }
  }

  // The shared presentation switcher remains a seam for saved-view specs, but Tasks intentionally
  // presents one responsive queue. Keeping the callback in the contract avoids a second query owner.
  void onPresentationChange

  return (
    <div className="tasks-queue-toolbar" data-testid="tasks-queue-toolbar" onKeyDown={handleFiltersKeyDown}>
      <div className="tasks-queue-toolbar__top">
        <div className="tasks-queue-toolbar__scope">
          <ViewTabs
            ariaLabel={t('tasks.toolbar.viewNavigation')}
            active={activeView}
            tabs={VIEW_VALUES.map(({ value, key }) => ({
              id: value,
              label: key === 'all'
                ? t('tasks.saved.all')
                : key === 'my-work'
                  ? t('tasks.saved.mine')
                  : key === 'overdue'
                    ? t('tasks.saved.overdue')
                    : t('tasks.saved.completed'),
            }))}
            onChange={(value) => onViewChange(value as TaskCollectionView)}
          />
        </div>
        <div className="tasks-queue-toolbar__actions">
          <label className="tasks-queue-toolbar__search tap-floor">
            <span className="sr-only">{t('tasks.filter.search')}</span>
            <SearchIcon />
            <input
              type="search"
              aria-label={t('tasks.filter.search')}
              placeholder={t('tasks.filter.searchPlaceholder')}
              value={query.q}
              onChange={(event) => onQueryChange({ q: event.target.value })}
            />
          </label>
          <Button
            ref={filterTriggerRef}
            variant={filtersOpen || activeQuery.hasActiveFilters ? 'outline' : 'ghost'}
            className={`tasks-queue-toolbar__filters-trigger${activeQuery.hasActiveFilters ? ' tasks-queue-toolbar__filters-trigger--active' : ''}`}
            aria-expanded={filtersOpen}
            aria-controls="tasks-filter-panel"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {t('tasks.toolbar.filters')}
            {filterCount > 0 ? <span className="tasks-queue-toolbar__filter-count">{filterCount}</span> : null}
            <ChevronIcon />
          </Button>
        </div>
      </div>

      {activeQuery.hasActiveFilters ? (
        <div className="tasks-queue-toolbar__active-query" role="status">
          <span>
            <span className="tasks-queue-toolbar__active-label">{t('tasks.toolbar.showing')}</span>{' '}
            <strong>{activeQuery.summary}</strong>
          </span>
          <button type="button" className="tasks-queue-toolbar__clear" onClick={onClearFilters}>
            {t('tasks.toolbar.clearFilters')}
          </button>
        </div>
      ) : null}

      {filtersOpen ? (
        <section
          id="tasks-filter-panel"
          className="tasks-filter-panel"
          role="region"
          aria-label={t('tasks.toolbar.filtersTitle')}
        >
          <div className="tasks-filter-panel__heading">
            <div>
              <h2>{t('tasks.toolbar.filtersTitle')}</h2>
              <p>{t('tasks.toolbar.filtersHelp')}</p>
            </div>
            <button type="button" className="tasks-filter-panel__close" onClick={closeFilters}>
              {t('tasks.toolbar.closeFilters')}
            </button>
          </div>

          <div className="tasks-filter-panel__grid">
            <div className="tasks-filter-field">
              <span>{t('tasks.filter.status')}</span>
              <TaskFilterSelect label={t('tasks.filter.status')} value={query.status ?? ''}
                options={STATUS_VALUES.map(({ value, key }) => ({ value, label: statusLabel(key) }))}
                onChange={(value) => onQueryChange({ status: (value || null) as TaskStatus | null })} />
            </div>
            <div className="tasks-filter-field">
              <span>{t('tasks.filter.businessUnit')}</span>
              <TaskFilterSelect label={t('tasks.filter.businessUnit')} value={query.businessUnitId ?? ''}
                options={[{ value: '', label: t('tasks.filter.anyBusinessUnit') }, ...buOptions.map((unit) => ({ value: unit.id, label: unit.name }))]}
                onChange={(value) => onQueryChange({ businessUnitId: value || null })} />
            </div>
            <div className="tasks-filter-field">
              <span>{t('tasks.filter.person')}</span>
              <TaskFilterSelect label={t('tasks.filter.person')} value={query.personId ?? ''}
                options={[{ value: '', label: t('tasks.filter.anyone') }, ...personOptions.map((person) => ({ value: person.id, label: person.full_name }))]}
                onChange={(value) => onQueryChange({ personId: value || null })} />
            </div>
            <div className="tasks-filter-field">
              <span>{t('tasks.filter.group')}</span>
              <TaskFilterSelect label={t('tasks.filter.group')} value={query.groupBy === 'pic' ? 'owner' : query.groupBy}
                options={GROUP_VALUES.map(({ value, key }) => ({ value, label: groupLabel(key) }))}
                onChange={(value) => {
                  onQueryChange({ groupBy: (value === 'owner' ? 'pic' : value) as TaskCollectionGroup })
                  try { localStorage.setItem('mos.tasks.groupBy', value) } catch { /* storage disabled */ }
                }} />
            </div>
            <div className="tasks-filter-field">
              <span>{t('tasks.filter.sort')}</span>
              <TaskFilterSelect label={t('tasks.filter.sort')} value={`${query.sort}:${query.direction}`}
                options={[
                  { value: 'due:ascending', label: t('tasks.filter.sortDueSoonest') },
                  { value: 'due:descending', label: t('tasks.filter.sortDueLatest') },
                  { value: 'task:ascending', label: t('tasks.filter.sortTask') },
                  { value: 'status:ascending', label: t('tasks.filter.sortStatus') },
                  { value: 'pic:ascending', label: t('tasks.filter.sortPic') },
                  { value: 'supervisor:ascending', label: t('tasks.supervisor') },
                  { value: 'activity:descending', label: t('tasks.filter.sortActivity') },
                ]}
                onChange={(value) => {
                  const [sort, direction] = value.split(':')
                  onQueryChange({ sort: sort as TaskCollectionSort, direction: direction as SortDir })
                }} />
            </div>

            <div className="tasks-filter-field tasks-filter-field--checks">
              <span>{t('tasks.toolbar.attention')}</span>
              <button
                type="button"
                className={`tasks-overdue-filter${query.overdueOnly ? ' tasks-overdue-filter--active' : ''}`}
                aria-pressed={query.overdueOnly}
                aria-label={t('tasks.filter.overdueAria', { count: overdueCount })}
                onClick={query.overdueOnly ? onClearOverdue : onOverdueFilter}
              >
                {t('tasks.filter.overdueCount', { count: overdueCount })}
              </button>
              <label className="tasks-checkbox">
                <input
                  type="checkbox"
                  checked={query.includeArchived}
                  onChange={(event) => onQueryChange({ includeArchived: event.target.checked })}
                />
                <span>{t('tasks.filter.includeArchived')}</span>
              </label>
            </div>
          </div>

          <div className="tasks-filter-panel__lower">
            <div className="tasks-fields-section">
              <div className="tasks-fields-section__head">
                <h3 className="tasks-filter-section-title">{t('tasks.fields')}</h3>
                <span>{t('tasks.toolbar.fieldsHelp')}</span>
              </div>
              <div className="tasks-field-list" role="group" aria-label={t('tasks.fields')}>
                {FIELD_OPTIONS.map((field) => (
                  field.required ? (
                    <span key={field.value} className="tasks-fixed-field">
                      {t(field.key as Parameters<typeof t>[0])}
                    </span>
                  ) : (
                    <label key={field.value} className="tasks-checkbox">
                      <input
                        type="checkbox"
                        checked={query.visibleFields.includes(field.value as typeof query.visibleFields[number])}
                        onChange={(event) => onFieldToggle(field.value, event.target.checked)}
                      />
                      <span>{t(field.key as Parameters<typeof t>[0])}</span>
                    </label>
                  )
                ))}
              </div>
            </div>

            {savedViews ? (
              <div className="tasks-saved-views">
                <div className="tasks-fields-section__head">
                  <h3 className="tasks-filter-section-title">{savedViews.label}</h3>
                  <span>{t('tasks.toolbar.savedViewsHelp')}</span>
                </div>
                {savedViews.error ? (
                  <ErrorState message={t('tasks.savedViewsError')} onRetry={retrySavedView} />
                ) : null}
                {savedViews.items.length > 0 ? (
                  <div className="tasks-saved-views__list">
                    {savedViews.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`tasks-saved-view${item.id === savedViews.selectedId ? ' tasks-saved-view--active' : ''}`}
                        aria-pressed={item.id === savedViews.selectedId}
                        onClick={() => applySavedView(item.id)}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                ) : <p className="tasks-saved-views__empty">{t('tasks.toolbar.noSavedViews')}</p>}
                <div className="tasks-saved-views__actions">
                  <Button ref={saveTriggerRef} variant="ghost" onClick={() => setSaveOpen((open) => !open)} aria-expanded={saveOpen}>
                    {t('common.saveView')}
                  </Button>
                  {saveOpen ? (
                    <div className="tasks-save-view" role="group" aria-label={t('common.saveCurrentView')}>
                      <label>
                        <span className="sr-only">{t('common.viewName')}</span>
                        <input
                          autoFocus
                          value={viewName}
                          placeholder={t('common.viewName')}
                          onChange={(event) => setViewName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') {
                              event.preventDefault()
                              event.stopPropagation()
                              setSaveOpen(false)
                              saveTriggerRef.current?.focus()
                            }
                            if (event.key === 'Enter') void saveView()
                          }}
                        />
                      </label>
                      <Button variant="primary" disabled={!viewName.trim() || savedViews.operation === 'saving'} onClick={() => void saveView()}>
                        {savedViews.operation === 'saving' ? t('common.saving') : t('common.save')}
                      </Button>
                      <Button variant="ghost" onClick={() => setSaveOpen(false)}>{t('common.cancel')}</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  )
}
