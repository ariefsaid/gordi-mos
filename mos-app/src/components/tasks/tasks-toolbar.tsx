// TasksToolbar — the records-workspace toolbar strip, re-presented in the signed
// mockup idiom (docs/design-mockups/ui-revamp/mock-shell-and-table.html `.toolbar`):
//   view-tabs (Table active · Board/Calendar disabled "soon") · spacer ·
//   Mine/RACI/All segmented pill (`.seg`) · chip-style filter controls (`.chip`:
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

export type TasksToolbarSegment = 'mine' | 'raci' | 'all'

export type TasksToolbarProps = {
  groupBy: TasksGroupBy
  setGroupBy: (next: TasksGroupBy) => void
  businessUnitId: string
  setBusinessUnitId: Dispatch<SetStateAction<string>>
  statusFilter: TaskStatus | ''
  setStatusFilter: Dispatch<SetStateAction<TaskStatus | ''>>
  personFilter: string
  setPersonFilter: Dispatch<SetStateAction<string>>
  segment: TasksToolbarSegment
  setSegment: Dispatch<SetStateAction<TasksToolbarSegment>>
  /** Person filter overrides the segment (FR-124 / AC-126) → the segment is inert. */
  segmentDisabled: boolean
  searchText: string
  setSearchText: Dispatch<SetStateAction<string>>
  includeArchived: boolean
  setIncludeArchived: Dispatch<SetStateAction<boolean>>
  buOptions: BusinessUnitOption[]
  personOptions: PersonOption[]
}

const SEGMENTS: { key: TasksToolbarSegment; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'raci', label: 'RACI' },
  { key: 'all', label: 'All' },
]

// View-tabs (mockup `.vtab`): Table is the live view; Board + Calendar are
// non-functional placeholders ("soon"), disabled exactly like the mockup.
const VIEW_TABS: { key: string; label: string; soon?: boolean }[] = [
  { key: 'table', label: 'Table' },
  { key: 'board', label: 'Board', soon: true },
  { key: 'calendar', label: 'Calendar', soon: true },
]

const STATUS_VALUES: { value: TaskStatus | ''; label: string }[] = [
  { value: '', label: 'Any' },
  { value: 'Open', label: 'Open' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Blocked', label: 'Blocked' },
  { value: 'Done', label: 'Done' },
]

const GROUP_VALUES: { value: TasksGroupBy; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'status', label: 'Status' },
  { value: 'owner', label: 'Owner' },
  { value: 'bu', label: 'Business unit' },
  { value: 'workline', label: 'Project/Process' },
]

export function TasksToolbar({
  groupBy, setGroupBy,
  businessUnitId, setBusinessUnitId,
  statusFilter, setStatusFilter,
  personFilter, setPersonFilter,
  segment, setSegment, segmentDisabled,
  searchText, setSearchText,
  includeArchived, setIncludeArchived,
  buOptions, personOptions,
}: TasksToolbarProps) {
  // Current-value labels shown inside each chip (mockup `.ch-v`).
  const groupValue = GROUP_VALUES.find(g => g.value === groupBy)?.label ?? 'None'
  const buValue = businessUnitId ? buOptions.find(b => b.id === businessUnitId)?.name ?? 'All' : 'All'
  const statusValue = STATUS_VALUES.find(s => s.value === statusFilter)?.label ?? 'Any'
  const personValue = personFilter
    ? personOptions.find(p => p.id === personFilter)?.full_name ?? 'Anyone'
    : 'Anyone'

  return (
    <div className="toolbar">
      {/* View-tabs (mockup `.vtab`) — Table live; Board/Calendar disabled placeholders. */}
      <div className="vtabs" role="tablist" aria-label="View">
        {VIEW_TABS.map(({ key, label, soon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            className={`vtab${key === 'table' ? ' vtab-on' : ''}${soon ? ' vtab-soon' : ''}`}
            aria-selected={key === 'table'}
            aria-disabled={soon ? 'true' : undefined}
            disabled={soon}
            title={soon ? 'Coming soon' : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="tb-spacer" />

      {/* Mine/RACI/All segmented pill (mockup `.seg`). Disabled when a Person filter
          drives scope (FR-124 / AC-126) — the override gets a tooltip, not a label. */}
      <div
        role="tablist"
        aria-label="Ownership filter"
        className={`seg${segmentDisabled ? ' seg-disabled' : ''}`}
        title={segmentDisabled ? 'Scope is set by the Person filter' : undefined}
        aria-description={segmentDisabled ? 'Scope is set by the Person filter' : undefined}
      >
        {SEGMENTS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={!segmentDisabled && segment === key}
            aria-disabled={segmentDisabled ? 'true' : undefined}
            tabIndex={segmentDisabled ? -1 : 0}
            disabled={segmentDisabled}
            className={!segmentDisabled && segment === key ? 'seg-btn seg-btn-on' : 'seg-btn'}
            title={segmentDisabled ? 'Scope is set by the Person filter' : undefined}
            onClick={() => setSegment(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Group chip — grouping is opt-in (default flat / "None"). */}
      <label htmlFor="group-by-filter" className="sr-only">Group</label>
      <div className="chip">
        <span className="ch-k">Group</span>
        <span className="ch-v">{groupValue}</span>
        <Chevron className="chip-chev" />
        <select
          id="group-by-filter"
          aria-label="Group"
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as TasksGroupBy)}
          className="chip-select"
        >
          {GROUP_VALUES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </div>

      {/* Business unit chip */}
      <label htmlFor="bu-filter" className="sr-only">Business unit</label>
      <div className="chip">
        <span className="ch-k">Unit</span>
        <span className="ch-v">{buValue}</span>
        <Chevron className="chip-chev" />
        <select id="bu-filter" aria-label="Business unit" value={businessUnitId}
          onChange={e => setBusinessUnitId(e.target.value)} className="chip-select">
          <option value="">All</option>
          {buOptions.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
        </select>
      </div>

      {/* Status chip */}
      <label htmlFor="status-filter" className="sr-only">Status</label>
      <div className="chip">
        <span className="ch-k">Status</span>
        <span className="ch-v">{statusValue}</span>
        <Chevron className="chip-chev" />
        <select id="status-filter" aria-label="Status" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as TaskStatus | '')} className="chip-select">
          {STATUS_VALUES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {/* Person chip */}
      <label htmlFor="person-filter" className="sr-only">Person</label>
      <div className="chip">
        <span className="ch-k">Person</span>
        <span className="ch-v">{personValue}</span>
        <Chevron className="chip-chev" />
        <select id="person-filter" aria-label="Person" value={personFilter}
          onChange={e => setPersonFilter(e.target.value)} className="chip-select">
          <option value="">Anyone</option>
          {personOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
      </div>

      {/* Search-mini (mockup `⌕ Filter rows`) */}
      <label htmlFor="task-search" className="sr-only">Search tasks</label>
      <div className="search-mini">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input id="task-search" type="search" placeholder="Filter rows" value={searchText}
          onChange={e => setSearchText(e.target.value)} className="search-input" aria-label="Search tasks" />
      </div>

      <label className="archived-toggle">
        <input type="checkbox" checked={includeArchived}
          onChange={e => setIncludeArchived(e.target.checked)} aria-label="Show archived" className="archived-checkbox" />
        <span className="archived-label">Show archived</span>
      </label>
    </div>
  )
}
