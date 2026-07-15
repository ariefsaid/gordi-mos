// TasksToolbar — the records-workspace toolbar strip, re-presented in the signed
// mockup idiom (docs/design-mockups/ui-revamp/mock-shell-and-table.html `.toolbar`):
//   view-tabs (Table active · Board/Calendar disabled "soon") · spacer ·
//   My work/Team work/Overdue/Follow-ups segmented pill (`.seg`) · chip-style filter controls (`.chip`:
//   Group / Business unit / Status / Person) · search-mini · Show-archived.
//
// Pure presentational control surface — it owns no state; every value + setter is
// threaded from TasksWorkspace (the data/state orchestrator). The chips wrap the
// native <select> (a transparent overlay) so the FULL filter capability + native
// a11y (labelled combobox, keyboard) is preserved — this is a re-skin, not a
// removal. Extracted from TasksWorkspace to keep that file at composition altitude.
import type { Dispatch, SetStateAction } from 'react'
import type { TaskStatus } from '@/lib/db/tasks.types'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import type { TasksGroupBy } from './use-tasks-view-pref'
import { Chevron } from '@/shell/icons'
import { ViewTabs, type ViewTab } from '@/components/ui/view-tabs'
import { useT } from '@/i18n/use-t'

import type { TasksSavedView, TasksSavedViewChip } from './use-tasks-saved-view'

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
  overdueCount: number
  overdueOnly: boolean
  onOverdueFilter: () => void
  onClearOverdue: () => void
  buOptions: BusinessUnitOption[]
  personOptions: PersonOption[]
}

const SAVED_VIEW_CHIPS: TasksSavedViewChip[] = ['mine', 'team', 'overdue', 'followups']

// View-tabs (the shared ViewTabs primitive, OD-P3-6): Table is the live view;
// Board + Calendar are non-functional placeholders ("soon"), disabled exactly
// like the signed mockup. Only Table is live in this slice, so the view-switch is
// a forward-compatible no-op until Board/Calendar ship.
const VIEW_TAB_IDS = ['table', 'board', 'calendar'] as const

const STATUS_VALUES: { value: TaskStatus | ''; key: 'any' | 'open' | 'inProgress' | 'blocked' | 'done' }[] = [
  { value: '', key: 'any' },
  { value: 'Open', key: 'open' },
  { value: 'In Progress', key: 'inProgress' },
  { value: 'Blocked', key: 'blocked' },
  { value: 'Done', key: 'done' },
]

const GROUP_VALUES: { value: TasksGroupBy; key: 'none' | 'status' | 'owner' | 'businessUnit' | 'projectProcess' }[] = [
  { value: 'none', key: 'none' },
  { value: 'status', key: 'status' },
  { value: 'owner', key: 'owner' },
  { value: 'bu', key: 'businessUnit' },
  { value: 'workline', key: 'projectProcess' },
]

export function TasksToolbar({
  groupBy, setGroupBy,
  businessUnitId, setBusinessUnitId,
  statusFilter, setStatusFilter,
  personFilter, setPersonFilter,
  savedView, onSavedViewChange,
  searchText, setSearchText,
  includeArchived, setIncludeArchived,
  overdueCount, overdueOnly, onOverdueFilter, onClearOverdue,
  buOptions, personOptions,
}: TasksToolbarProps) {
  const t = useT()
  const savedViewLabel = (key: TasksSavedViewChip) => t(`tasks.saved.${key}` as const)
  const statusLabel = (key: (typeof STATUS_VALUES)[number]['key']) => t(`tasks.status.${key}` as const)
  const groupLabel = (key: (typeof GROUP_VALUES)[number]['key']) => {
    if (key === 'none') return t('tasks.filter.none')
    if (key === 'status') return t('tasks.filter.status')
    if (key === 'owner') return t('tasks.pic')
    if (key === 'businessUnit') return t('tasks.filter.businessUnit')
    return t('tasks.filter.projectProcess')
  }
  const viewTabs: ViewTab[] = VIEW_TAB_IDS.map(id => ({
    id,
    label: id === 'table' ? t('tasks.tab.table') : id === 'board' ? t('tasks.tab.board') : t('tasks.tab.calendar'),
    ...(id === 'table' ? {} : { soon: true }),
  }))
  // Current-value labels shown inside each chip (mockup `.ch-v`).
  const groupValue = groupLabel(GROUP_VALUES.find(g => g.value === groupBy)?.key ?? 'none')
  const buValue = businessUnitId ? buOptions.find(b => b.id === businessUnitId)?.name ?? t('tasks.saved.all') : t('tasks.saved.all')
  const statusValue = statusLabel(STATUS_VALUES.find(s => s.value === statusFilter)?.key ?? 'any')
  const personValue = personFilter
    ? personOptions.find(p => p.id === personFilter)?.full_name ?? t('tasks.filter.anyone')
    : t('tasks.filter.anyone')

  return (
    <div className="toolbar">
      {/* View-tabs (shared ViewTabs primitive) — Table live; Board/Calendar "soon" placeholders. */}
      <ViewTabs
        ariaLabel={t('tasks.view')}
        active="table"
        onChange={() => { /* view switch is a future slice; only Table is live today */ }}
        tabs={viewTabs}
      />

      <span className="tb-spacer" />

      <div className="seg" role="group" aria-label={t('tasks.title')}>
        {SAVED_VIEW_CHIPS.map(key => (
          <button
            key={key}
            type="button"
            aria-pressed={savedView.activeChip === key}
            className={savedView.activeChip === key ? 'seg-btn seg-btn-on' : 'seg-btn'}
            onClick={() => onSavedViewChange(savedView.activeChip === key ? 'all' : key)}
          >
            {savedViewLabel(key)}
          </button>
        ))}
      </div>

      {/* Group chip — grouping is opt-in (default flat / "None"). */}
      <label htmlFor="group-by-filter" className="sr-only">{t('tasks.filter.group')}</label>
      <div className="chip">
        <span className="ch-k">{t('tasks.filter.group')}</span>
        <span className="ch-v">{groupValue}</span>
        <Chevron className="chip-chev" />
        <select
          id="group-by-filter"
          aria-label={t('tasks.filter.group')}
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as TasksGroupBy)}
          className="chip-select"
        >
          {GROUP_VALUES.map(g => <option key={g.value} value={g.value}>{groupLabel(g.key)}</option>)}
        </select>
      </div>

      {/* Business unit chip */}
      <label htmlFor="bu-filter" className="sr-only">{t('tasks.filter.businessUnit')}</label>
      <div className="chip">
        <span className="ch-k">{t('tasks.filter.unit')}</span>
        <span className="ch-v">{buValue}</span>
        <Chevron className="chip-chev" />
        <select id="bu-filter" aria-label={t('tasks.filter.businessUnit')} value={businessUnitId}
          onChange={e => setBusinessUnitId(e.target.value)} className="chip-select">
          <option value="">{t('tasks.saved.all')}</option>
          {buOptions.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
        </select>
      </div>

      {/* Status chip */}
      <label htmlFor="status-filter" className="sr-only">{t('tasks.filter.status')}</label>
      <div className="chip">
        <span className="ch-k">{t('tasks.filter.status')}</span>
        <span className="ch-v">{statusValue}</span>
        <Chevron className="chip-chev" />
        <select id="status-filter" aria-label={t('tasks.filter.status')} value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as TaskStatus | '')} className="chip-select">
          {STATUS_VALUES.map(s => <option key={s.value} value={s.value}>{statusLabel(s.key)}</option>)}
        </select>
      </div>

      {/* Person chip */}
      <label htmlFor="person-filter" className="sr-only">{t('tasks.filter.person')}</label>
      <div className="chip">
        <span className="ch-k">{t('tasks.filter.person')}</span>
        <span className="ch-v">{personValue}</span>
        <Chevron className="chip-chev" />
        <select id="person-filter" aria-label={t('tasks.filter.person')} value={personFilter}
          onChange={e => setPersonFilter(e.target.value)} className="chip-select">
          <option value="">{t('tasks.filter.anyone')}</option>
          {personOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </div>

      {/* Search-mini (mockup `⌕ Filter rows`) */}
      <label htmlFor="task-search" className="sr-only">{t('tasks.filter.search')}</label>
      <div className="search-mini">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input id="task-search" type="search" placeholder={t('tasks.filter.searchPlaceholder')} value={searchText}
          onChange={e => setSearchText(e.target.value)} className="search-input" aria-label={t('tasks.filter.search')} />
      </div>

      <label className="archived-toggle">
        <input type="checkbox" checked={includeArchived}
          onChange={e => setIncludeArchived(e.target.checked)} aria-label={t('tasks.filter.showArchived')} className="archived-checkbox" />
        <span className="archived-label">{t('tasks.filter.showArchived')}</span>
      </label>

      <div className="toolbar-overdue-controls" data-testid="tasks-overdue-controls">
        {overdueCount > 0 && (
          <button
            type="button"
            className="overdue-filter-btn"
            aria-label={t('tasks.filter.overdueAria', { count: overdueCount })}
            onClick={onOverdueFilter}
          >
            {t('tasks.filter.overdueCount', { count: overdueCount })}
          </button>
        )}
        {overdueOnly && (
          <button
            type="button"
            className="overdue-chip"
            aria-label={t('tasks.filter.clearOverdue')}
            onClick={onClearOverdue}
          >
            {t('tasks.filter.overdueOnly')}
          </button>
        )}
      </div>
    </div>
  )
}
