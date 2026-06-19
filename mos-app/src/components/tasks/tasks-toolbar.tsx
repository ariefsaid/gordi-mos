// TasksToolbar — the records-workspace toolbar strip: group-by control, the
// Business unit / Status / Person filter selects, the Mine/RACI/All ownership
// segment (inert when a Person filter drives scope), the search box, the
// "Show archived" toggle, and the right-aligned "+ New task" primary action.
//
// Pure presentational control surface — it owns no state; every value + setter
// is threaded from TasksWorkspace (the data/state orchestrator). Extracted from
// TasksWorkspace to keep that file at composition altitude (conventions §1).
import { Link } from 'react-router-dom'
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
  /** Render the "+ New task" CTA — only when the table is populated (empty/no-results
   *  states own their own create CTA, so every state has exactly one create link). */
  showNewTask: boolean
}

const SEGMENTS: { key: TasksToolbarSegment; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'raci', label: 'RACI' },
  { key: 'all', label: 'All' },
]

export function TasksToolbar({
  groupBy, setGroupBy,
  businessUnitId, setBusinessUnitId,
  statusFilter, setStatusFilter,
  personFilter, setPersonFilter,
  segment, setSegment, segmentDisabled,
  searchText, setSearchText,
  includeArchived, setIncludeArchived,
  buOptions, personOptions, showNewTask,
}: TasksToolbarProps) {
  return (
    <div className="toolbar">
      {/* Group-by control — wired to the grouping engine (FR-122) */}
      <label htmlFor="group-by-filter" className="sr-only">Group</label>
      <div className="control control-groupby">
        <span className="ctrl-lbl">Group</span>
        <select
          id="group-by-filter"
          aria-label="Group"
          value={groupBy}
          onChange={e => setGroupBy(e.target.value as TasksGroupBy)}
          className="ctrl-select"
        >
          <option value="status">Status</option>
          <option value="owner">Owner</option>
          <option value="bu">Business unit</option>
        </select>
        <Chevron className="ctrl-chev" />
      </div>

      <label htmlFor="bu-filter" className="sr-only">Business unit</label>
      <div className="control">
        <span className="ctrl-lbl">Business unit</span>
        <select id="bu-filter" aria-label="Business unit" value={businessUnitId}
          onChange={e => setBusinessUnitId(e.target.value)} className="ctrl-select">
          <option value="">All</option>
          {buOptions.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
        </select>
        <Chevron className="ctrl-chev" />
      </div>

      <label htmlFor="status-filter" className="sr-only">Status</label>
      <div className="control">
        <span className="ctrl-lbl">Status</span>
        <select id="status-filter" aria-label="Status" value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as TaskStatus | '')} className="ctrl-select">
          <option value="">Any</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Blocked">Blocked</option>
          <option value="Done">Done</option>
        </select>
        <Chevron className="ctrl-chev" />
      </div>

      <label htmlFor="person-filter" className="sr-only">Person</label>
      <div className="control">
        <span className="ctrl-lbl">Person</span>
        <select id="person-filter" aria-label="Person" value={personFilter}
          onChange={e => setPersonFilter(e.target.value)} className="ctrl-select">
          <option value="">Anyone</option>
          {personOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <Chevron className="ctrl-chev" />
      </div>

      {/* Mine/RACI/All segment — disabled when Person filter is set (FR-124 / AC-126).
          Per the PR-2-review ruling the disabled segment gets a tooltip
          ("Scope is set by the Person filter") rather than a literal "Person: me" label. */}
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

      <label htmlFor="task-search" className="sr-only">Search tasks</label>
      <div className="search-mini">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input id="task-search" type="search" placeholder="Search tasks" value={searchText}
          onChange={e => setSearchText(e.target.value)} className="search-input" aria-label="Search tasks" />
      </div>

      <label className="archived-toggle">
        <input type="checkbox" checked={includeArchived}
          onChange={e => setIncludeArchived(e.target.checked)} aria-label="Show archived" className="archived-checkbox" />
        <span className="archived-label">Show archived</span>
      </label>

      {/* + New task lives in the toolbar as the right-aligned primary action (mockup
          '.btn-primary.grow'). Rendered only when the table is populated — empty /
          no-results states own their own CTA, so every state has exactly one create link. */}
      {showNewTask && (
        <Link to="/tasks/new" className="btn btn-primary toolbar-new-task">+ New task</Link>
      )}
    </div>
  )
}
