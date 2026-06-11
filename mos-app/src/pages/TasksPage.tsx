import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { useIsDesktop } from '../shell/useIsDesktop'
import { useAuth } from '../auth/useAuth'
import { listTasks } from '../lib/db/tasks'
import type { TaskListFilters } from '../lib/db/tasks'
import type { TaskListRow, TaskStatus } from '../lib/db/tasks.types'
import { getBusinessUnits, getPeople } from '../lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '../lib/db/directory'
import { dueStatus } from '../lib/dueStatus'
import { raciMember, raciOwner } from '../lib/raciMember'
import { StatusPill } from '../components/tasks/StatusPill'
import { OwnerCell } from '../components/tasks/OwnerCell'
import { formatAge, formatDate, otherRaciCount } from '../components/tasks/taskFormatters'

// ── Types ─────────────────────────────────────────────────────────────────────
type Segment = 'mine' | 'raci' | 'all'
type SortCol = 'task' | 'status' | 'owner' | 'due' | 'activity'
type SortDir = 'ascending' | 'descending'

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr>
      <td className="sk-cell">
        <div className="sk" style={{ width: '42%' }} />
      </td>
      <td className="sk-cell">
        <div className="sk pill" />
      </td>
      <td className="sk-cell">
        <div className="sk av" />
      </td>
      <td className="sk-cell" style={{ textAlign: 'right' }}>
        <div className="sk" style={{ width: 56, marginLeft: 'auto' }} />
      </td>
      <td className="sk-cell" style={{ textAlign: 'right' }}>
        <div className="sk" style={{ width: 28, marginLeft: 'auto' }} />
      </td>
    </tr>
  )
}

// ── Task card (mobile card list) ──────────────────────────────────────────────
type TaskCardProps = {
  task: TaskListRow
  now: Date
  buName: string
  rName: string
}
function TaskCard({ task, now, buName, rName }: TaskCardProps) {
  const ds = dueStatus(task.due_date, now)
  const age = formatAge(task.last_activity_at, now)
  const n = otherRaciCount(task)

  const dueClass = ds === 'overdue' ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (ds === 'overdue' ? `Overdue · ${formatDate(task.due_date)}` : formatDate(task.due_date))
    : '—'

  return (
    <article
      data-testid="task-card"
      className="task-card"
    >
      <Link to={`/tasks/${task.id}`} className="task-card-link">
        <div className="task-card-head">
          <span className="task-name">{task.title}</span>
          <StatusPill status={task.status} />
        </div>
        <span className="task-bu">{buName}</span>
        <dl className="task-card-meta">
          <dt className="sr-only">Owner</dt>
          <dd>
            <OwnerCell fullName={rName} otherCount={n} />
          </dd>
          <dt className="sr-only">Due</dt>
          <dd className={`tabular-nums ${dueClass}`}>{dueText}</dd>
          <dt className="sr-only">Activity</dt>
          <dd className="act tabular-nums">{age}</dd>
        </dl>
      </Link>
    </article>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TasksPage() {
  useDocumentTitle('Tasks — Gordi MOS')
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null

  // ── Server-side filter state ─────────────────────────────────────────────
  const [businessUnitId, setBusinessUnitId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [includeArchived, setIncludeArchived] = useState(false)

  // ── Client-side filter state ─────────────────────────────────────────────
  const [segment, setSegment] = useState<Segment>('mine')
  const [personFilter, setPersonFilter] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')

  // ── Sort state ───────────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<SortCol>('due')
  const [sortDir, setSortDir] = useState<SortDir>('ascending')

  // ── Data state ───────────────────────────────────────────────────────────
  const [allTasks, setAllTasks] = useState<TaskListRow[]>([])
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [peopleDirectory, setPeopleDirectory] = useState<PersonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Stable "now" snapshot — refreshes when a new data set loads (avoids per-render drift)
  const now = useMemo(() => new Date(), [allTasks]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Directory lookup maps (id → display name) ────────────────────────────
  const buMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const bu of busDirectory) m.set(bu.id, bu.name)
    return m
  }, [busDirectory])

  const personMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of peopleDirectory) m.set(p.id, p.full_name)
    return m
  }, [peopleDirectory])

  // ── Data load — tasks + directory in parallel ────────────────────────────
  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const filters: TaskListFilters = {
      ...(businessUnitId ? { businessUnitId } : {}),
      ...(statusFilter ? { status: statusFilter as TaskStatus } : {}),
      includeArchived,
    }

    let cancelled = false

    Promise.all([
      listTasks(filters),
      getBusinessUnits(),
      getPeople(),
    ]).then(([rows, bus, people]) => {
      if (!cancelled) {
        setAllTasks(rows)
        setBusDirectory(bus)
        setPeopleDirectory(people)
        setLoading(false)
      }
    }).catch((err: Error) => {
      if (!cancelled) { setError(err.message); setLoading(false) }
    })

    return () => { cancelled = true }
  }, [businessUnitId, statusFilter, includeArchived])

  useEffect(() => {
    const cancel = load()
    return cancel
  }, [load])

  // ── Client-side filtering ────────────────────────────────────────────────
  const visibleTasks = useMemo(() => allTasks.filter(t => {
    // Segment filter
    if (segment === 'mine' && viewerId && !raciOwner(t, viewerId)) return false
    if (segment === 'raci' && viewerId && !raciMember(t, viewerId)) return false
    // Person dropdown filter (client-side RACI membership)
    if (personFilter && !raciMember(t, personFilter)) return false
    // Search text filter
    if (searchText && !t.title.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  }), [allTasks, segment, viewerId, personFilter, searchText])

  // ── Client-side sort (server pre-sorts by due; re-sort if user changes) ──
  const sortedTasks = useMemo(() => [...visibleTasks].sort((a, b) => {
    let cmp = 0
    if (sortCol === 'due') {
      if (!a.due_date && !b.due_date) cmp = 0
      else if (!a.due_date) cmp = 1
      else if (!b.due_date) cmp = -1
      else cmp = a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    } else if (sortCol === 'activity') {
      cmp = b.last_activity_at.localeCompare(a.last_activity_at) // newest first
    } else if (sortCol === 'task') {
      cmp = a.title.localeCompare(b.title)
    } else if (sortCol === 'status') {
      cmp = a.status.localeCompare(b.status)
    } else if (sortCol === 'owner') {
      const an = personMap.get(a.responsible_person_id) ?? ''
      const bn = personMap.get(b.responsible_person_id) ?? ''
      cmp = an.localeCompare(bn)
    }
    return sortDir === 'ascending' ? cmp : -cmp
  }), [visibleTasks, sortCol, sortDir, personMap])

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'ascending' ? 'descending' : 'ascending')
    } else {
      setSortCol(col)
      setSortDir('ascending')
    }
  }

  // ── BU + person options from directory (Fix C1: stable under status-narrowing — I1) ──
  // Directory is loaded once per data load and is independent of the row set.
  const buOptions = useMemo(() => busDirectory, [busDirectory])
  const personOptions = useMemo(() => peopleDirectory, [peopleDirectory])

  // ── Stats — suppressed in error state (Fix M2) ───────────────────────────
  const stats = useMemo(() => {
    if (error) return null
    const blocked = sortedTasks.filter(t => t.status === 'Blocked').length
    const overdue = sortedTasks.filter(t => dueStatus(t.due_date, now) === 'overdue').length
    return { total: sortedTasks.length, blocked, overdue }
  }, [sortedTasks, now, error])

  // ── Empty state copy keyed to active context ─────────────────────────────
  function emptyTitle(): string {
    if (includeArchived) return 'No archived tasks.'
    if (segment === 'mine') return 'No tasks assigned to you'
    if (segment === 'raci') return 'No tasks you are involved in'
    return 'No tasks yet'
  }
  function emptyCopy(): string {
    if (includeArchived) return 'Archived tasks would appear here.'
    if (segment === 'mine') return 'When a task names you as R or A it shows up here. Create one or switch to "All".'
    if (segment === 'raci') return 'When a task names you as R, A, C, or I it shows up here.'
    return 'No tasks match your current filters.'
  }

  // ── Aria-sort for each column ─────────────────────────────────────────────
  function colSort(col: SortCol): 'ascending' | 'descending' | 'none' {
    return sortCol === col ? sortDir : 'none'
  }

  // ── Sort glyph ────────────────────────────────────────────────────────────
  function sortGlyph(col: SortCol): string {
    if (sortCol !== col) return ''
    return sortDir === 'ascending' ? ' ▴' : ' ▾'
  }

  return (
    <PageFrame>
      {/* Page head */}
      <div className="page-head-row">
        <h1 className="tasks-page-title">Tasks</h1>
        <span className="tasks-count-line tabular-nums">
          {stats === null
            ? '—'
            : `${stats.total} task${stats.total !== 1 ? 's' : ''}${stats.blocked > 0 ? ` · ${stats.blocked} blocked` : ''}${stats.overdue > 0 ? ` · ${stats.overdue} overdue` : ''}`
          }
        </span>
      </div>

      {/* Card assembly: toolbar seamed to table */}
      <section className="assembly" aria-label="Tasks">

        {/* Toolbar */}
        <div className="toolbar">
          {/* Business Unit dropdown */}
          <label htmlFor="bu-filter" className="sr-only">Business unit</label>
          <div className="control">
            <span className="ctrl-lbl">Business unit</span>
            <select
              id="bu-filter"
              aria-label="Business unit"
              value={businessUnitId}
              onChange={e => setBusinessUnitId(e.target.value)}
              className="ctrl-select"
            >
              <option value="">All</option>
              {buOptions.map(bu => (
                <option key={bu.id} value={bu.id}>{bu.name}</option>
              ))}
            </select>
            <span className="ctrl-chev" aria-hidden="true">▾</span>
          </div>

          {/* Status dropdown */}
          <label htmlFor="status-filter" className="sr-only">Status</label>
          <div className="control">
            <span className="ctrl-lbl">Status</span>
            <select
              id="status-filter"
              aria-label="Status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as TaskStatus | '')}
              className="ctrl-select"
            >
              <option value="">Any</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Blocked">Blocked</option>
              <option value="Done">Done</option>
            </select>
            <span className="ctrl-chev" aria-hidden="true">▾</span>
          </div>

          {/* Person dropdown */}
          <label htmlFor="person-filter" className="sr-only">Person</label>
          <div className="control">
            <span className="ctrl-lbl">Person</span>
            <select
              id="person-filter"
              aria-label="Person"
              value={personFilter}
              onChange={e => setPersonFilter(e.target.value)}
              className="ctrl-select"
            >
              <option value="">Anyone</option>
              {personOptions.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
            <span className="ctrl-chev" aria-hidden="true">▾</span>
          </div>

          {/* Segmented control: Mine / RACI-involved / All */}
          <div
            role="tablist"
            aria-label="Ownership filter"
            className="seg"
          >
            {(
              [
                { key: 'mine',  label: 'Mine' },
                { key: 'raci',  label: 'RACI-involved' },
                { key: 'all',   label: 'All' },
              ] as { key: Segment; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={segment === key}
                className={segment === key ? 'seg-btn seg-btn-on' : 'seg-btn'}
                onClick={() => setSegment(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <label htmlFor="task-search" className="sr-only">Search tasks</label>
          <div className="search-mini">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              id="task-search"
              type="search"
              placeholder="Search tasks"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="search-input"
              aria-label="Search tasks"
            />
          </div>

          {/* Show archived checkbox */}
          <label className="archived-toggle">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={e => setIncludeArchived(e.target.checked)}
              aria-label="Show archived"
              className="archived-checkbox"
            />
            <span className="archived-label">Show archived</span>
          </label>
        </div>

        {/* Table body — loading / error / empty / populated */}
        {loading ? (
          /* Loading skeleton */
          <div aria-busy="true" aria-label="Loading tasks">
            <span className="sr-only" role="status">Loading tasks</span>
            {isDesktop ? (
              <table className="tasks-table" aria-label="Loading tasks">
                <colgroup>
                  <col style={{ width: '40%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '21%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '11%' }} />
                </colgroup>
                <tbody>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </tbody>
              </table>
            ) : (
              <div className="skeleton-cards">
                {[0,1,2].map(i => (
                  <div key={i} className="sk-card-row">
                    <div className="sk" style={{ width: '50%' }} />
                    <div className="sk pill" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : error ? (
          /* Error state */
          <div
            role="alert"
            className="error-banner"
          >
            <span className="error-text">
              Couldn&apos;t load tasks — {error}
            </span>
            <button
              type="button"
              className="retry-btn"
              onClick={load}
            >
              Retry
            </button>
          </div>
        ) : sortedTasks.length === 0 ? (
          /* Empty state */
          <div className="empty-state">
            <h3 className="empty-title">{emptyTitle()}</h3>
            <p className="empty-copy">{emptyCopy()}</p>
            <Link
              to="/tasks/new"
              className="btn-primary"
            >
              + New task
            </Link>
          </div>
        ) : isDesktop ? (
          /* Desktop: data table */
          <>
            <div className="table-top-bar">
              <Link to="/tasks/new" className="new-task-link">
                + New task
              </Link>
            </div>
            <table className="tasks-table" aria-label="Tasks">
              <colgroup>
                <col style={{ width: '40%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '21%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className={`th-cell th-sortable${sortCol === 'task' ? ' th-sorted' : ''}`}
                    aria-sort={colSort('task')}
                    onClick={() => handleSort('task')}
                  >
                    Task{sortGlyph('task') && <span className="sort-aff" aria-hidden="true">{sortGlyph('task')}</span>}
                  </th>
                  <th
                    scope="col"
                    className={`th-cell th-sortable${sortCol === 'status' ? ' th-sorted' : ''}`}
                    aria-sort={colSort('status')}
                    onClick={() => handleSort('status')}
                  >
                    Status{sortGlyph('status') && <span className="sort-aff" aria-hidden="true">{sortGlyph('status')}</span>}
                  </th>
                  <th
                    scope="col"
                    className={`th-cell th-sortable${sortCol === 'owner' ? ' th-sorted' : ''}`}
                    aria-sort={colSort('owner')}
                    onClick={() => handleSort('owner')}
                  >
                    Owner{sortGlyph('owner') && <span className="sort-aff" aria-hidden="true">{sortGlyph('owner')}</span>}
                  </th>
                  <th
                    scope="col"
                    className={`th-cell th-sortable th-right${sortCol === 'due' ? ' th-sorted' : ''}`}
                    aria-sort={colSort('due')}
                    onClick={() => handleSort('due')}
                  >
                    Due{sortGlyph('due') && <span className="sort-aff" aria-hidden="true">{sortGlyph('due')}</span>}
                  </th>
                  <th
                    scope="col"
                    className={`th-cell th-sortable th-right${sortCol === 'activity' ? ' th-sorted' : ''}`}
                    aria-sort={colSort('activity')}
                    onClick={() => handleSort('activity')}
                  >
                    Activity{sortGlyph('activity') && <span className="sort-aff" aria-hidden="true">{sortGlyph('activity')}</span>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTasks.map(task => {
                  const ds = dueStatus(task.due_date, now)
                  const dueClass = ds === 'overdue' ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
                  const dueText = task.due_date
                    ? (ds === 'overdue' ? `Overdue · ${formatDate(task.due_date)}` : formatDate(task.due_date))
                    : '—'
                  const buName = buMap.get(task.business_unit_id) ?? ''
                  const rName = personMap.get(task.responsible_person_id) ?? ''
                  return (
                    <tr
                      key={task.id}
                      className="task-row"
                      onClick={() => navigate(`/tasks/${task.id}`)}
                    >
                      <td className="td-main">
                        <Link
                          to={`/tasks/${task.id}`}
                          className="task-row-link"
                          tabIndex={0}
                        >
                          <span className="task-name">{task.title}</span>
                          <span className="task-bu">{buName}</span>
                        </Link>
                      </td>
                      <td className="td-cell">
                        <StatusPill status={task.status} />
                      </td>
                      <td className="td-cell">
                        <OwnerCell
                          fullName={rName}
                          otherCount={otherRaciCount(task)}
                        />
                      </td>
                      <td className={`td-right tabular-nums ${dueClass}`}>
                        {dueText}
                      </td>
                      <td className="td-right tabular-nums act">
                        {formatAge(task.last_activity_at, now)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>
        ) : (
          /* Mobile: card list */
          <>
            <div className="table-top-bar">
              <Link to="/tasks/new" className="new-task-link">
                + New task
              </Link>
            </div>
            <div className="card-list" role="list">
              {sortedTasks.map(task => (
                <div key={task.id} role="listitem">
                  <TaskCard
                    task={task}
                    now={now}
                    buName={buMap.get(task.business_unit_id) ?? ''}
                    rName={personMap.get(task.responsible_person_id) ?? ''}
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Inline CSS — tokens from DESIGN.md, no raw hex beyond token values ── */}
      <style>{`
        /* ── Page head ── */
        .page-head-row {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }
        .tasks-page-title {
          font-size: 24px; font-weight: 700; line-height: 1.2;
          letter-spacing: -0.02em; color: hsl(var(--foreground));
        }
        .tasks-count-line {
          color: hsl(var(--muted-foreground)); font-size: 13px;
        }

        /* ── Card assembly ── */
        .assembly {
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 8px; /* rounded.md */
          overflow: hidden;
        }

        /* ── Toolbar ── */
        .toolbar {
          display: flex; align-items: center; gap: 8px;
          flex-wrap: wrap; padding: 10px 12px;
          border-bottom: 1px solid hsl(var(--border));
        }
        .control {
          height: 32px; display: inline-flex; align-items: center; gap: 6px;
          padding: 0 10px; border: 1px solid hsl(var(--input));
          background: hsl(var(--background)); border-radius: 8px;
          font-size: 13px; color: hsl(var(--foreground)); cursor: pointer;
          position: relative;
        }
        .ctrl-lbl { color: hsl(var(--muted-foreground)); font-size: 13px; }
        .ctrl-chev { color: hsl(var(--muted-foreground)); font-size: 10px; pointer-events: none; }
        .ctrl-select {
          position: absolute; inset: 0; width: 100%; opacity: 0;
          cursor: pointer; font-size: 13px;
        }
        .seg {
          display: inline-flex; height: 32px; padding: 3px;
          background: hsl(var(--secondary)); border-radius: 8px;
        }
        .seg-btn {
          border: 0; background: transparent; font: inherit; font-size: 13px;
          padding: 0 10px; border-radius: 6px; color: hsl(var(--secondary-foreground));
          cursor: pointer; white-space: nowrap;
        }
        .seg-btn-on {
          background: hsl(var(--background)); font-weight: 600;
          box-shadow: 0 1px 2px hsl(240 6% 10% / 0.12);
        }
        .search-mini {
          margin-left: auto; height: 32px; display: inline-flex; align-items: center;
          gap: 6px; padding: 0 10px; border: 1px solid hsl(var(--input));
          border-radius: 8px; color: hsl(var(--muted-foreground)); font-size: 13px;
          min-width: 180px;
        }
        .search-input {
          border: none; outline: none; background: transparent; font: inherit;
          font-size: 13px; color: hsl(var(--foreground)); width: 100%;
        }
        .search-input::placeholder { color: hsl(var(--muted-foreground)); }
        .archived-toggle {
          display: inline-flex; align-items: center; gap: 6px;
          height: 32px; padding: 0 10px; border: 1px solid hsl(var(--input));
          background: hsl(var(--background)); border-radius: 8px;
          font-size: 13px; cursor: pointer; color: hsl(var(--foreground));
        }
        .archived-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: hsl(var(--primary)); }
        .archived-label { font-size: 13px; }

        /* ── Table ── */
        .tasks-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .th-cell {
          text-align: left; height: 38px; padding: 0 12px;
          font-size: 11.5px; font-weight: 600; line-height: 1.3;
          letter-spacing: 0.06em; text-transform: uppercase;
          color: hsl(var(--muted-foreground));
          border-bottom: 1px solid hsl(var(--border));
          white-space: nowrap;
        }
        .th-sortable { cursor: pointer; }
        .th-sortable:hover { color: hsl(var(--foreground)); }
        .th-sorted { color: hsl(var(--foreground)); }
        .th-right { text-align: right; }
        .sort-aff { font-size: 10px; margin-left: 5px; color: hsl(var(--primary)); }
        .td-main {
          height: 54px; padding: 0 12px;
          border-bottom: 1px solid hsl(240 5.9% 90% / 0.7);
          vertical-align: middle;
        }
        .td-cell {
          height: 54px; padding: 0 12px;
          border-bottom: 1px solid hsl(240 5.9% 90% / 0.7);
          vertical-align: middle;
        }
        .td-right {
          height: 54px; padding: 0 12px;
          border-bottom: 1px solid hsl(240 5.9% 90% / 0.7);
          vertical-align: middle; text-align: right;
        }
        .task-row { cursor: pointer; }
        .task-row:last-child td { border-bottom: none; }
        .task-row:hover td { background: hsl(240 4.8% 95.9% / 0.6); }
        .task-row-link {
          display: block; text-decoration: none; color: inherit;
        }
        .task-row-link:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: -2px; }
        .task-name {
          font-weight: 600; font-size: 13.5px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          display: block; color: hsl(var(--foreground));
        }
        .task-bu {
          display: block; font-size: 12px;
          color: hsl(var(--muted-foreground)); margin-top: 2px;
        }

        /* ── Status pills (Tinted-Status Rule from DESIGN.md) ── */
        .pill {
          display: inline-flex; align-items: center; gap: 6px;
          height: 22px; padding: 0 9px; border-radius: 999px;
          font-size: 12px; font-weight: 600; white-space: nowrap;
        }
        .dot {
          width: 6px; height: 6px; border-radius: 999px; flex: none;
        }
        .pill-inprogress { background: hsl(221 83% 53% / 0.12); color: hsl(221 75% 38%); }
        .pill-inprogress .dot { background: hsl(221.2 83.2% 53.3%); }
        .pill-blocked { background: hsl(0 84% 60% / 0.12); color: hsl(0 72% 45%); }
        .pill-blocked .dot { background: hsl(0 84.2% 60.2%); }
        .pill-open { background: hsl(43 96% 56% / 0.18); color: hsl(22 78% 26%); }
        .pill-open .dot { background: hsl(43 96% 56%); }
        .pill-done { background: hsl(142 71% 45% / 0.14); color: hsl(142 64% 30%); }
        .pill-done .dot { background: hsl(142 71% 45%); }

        /* ── Owner cell ── */
        .owner { display: flex; align-items: center; gap: 8px; }
        .ownav {
          width: 26px; height: 26px; border-radius: 999px;
          background: hsl(221.2 83.2% 53.3% / 0.12);
          color: hsl(221 75% 38%);
          display: grid; place-items: center;
          font-size: 10.5px; font-weight: 700; flex: none;
        }
        .own-name {
          font-size: 13px; font-weight: 500;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .own-more { font-size: 12px; font-weight: 600; color: hsl(var(--muted-foreground)); flex: none; }

        /* ── Due-date coloring ── */
        .due-overdue { color: hsl(0 72% 45%); font-weight: 600; font-size: 13px; }
        .due-soon    { color: hsl(22 78% 26%); font-weight: 600; font-size: 13px; }
        .due-calm    { color: hsl(var(--muted-foreground)); font-weight: 500; font-size: 13px; }
        .act { color: hsl(var(--muted-foreground)); font-size: 12px; font-weight: 500; }

        /* ── Loading skeleton ── */
        .sk-cell {
          height: 54px; padding: 0 12px;
          border-bottom: 1px solid hsl(240 5.9% 90% / 0.7);
          vertical-align: middle;
        }
        .sk {
          background: hsl(var(--secondary)); border-radius: 6px;
          height: 12px; display: inline-block;
          animation: sk-pulse 1.4s ease-in-out infinite;
        }
        .sk.pill { height: 22px; width: 84px; border-radius: 999px; display: block; }
        .sk.av   { height: 26px; width: 26px; border-radius: 999px; display: block; }
        @keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

        .skeleton-cards { padding: 8px 12px; }
        .sk-card-row {
          display: flex; align-items: center; gap: 12px;
          padding: 0 0 12px 0; height: 54px;
          border-bottom: 1px solid hsl(240 5.9% 90% / 0.7);
        }

        /* ── Error banner ── */
        .error-banner {
          display: flex; align-items: center; gap: 12px;
          padding: 16px 20px; font-size: 13px;
        }
        .error-text { color: hsl(var(--destructive)); flex: 1; }
        .retry-btn {
          height: 32px; padding: 0 12px; border-radius: 8px;
          border: 1px solid hsl(var(--border));
          background: hsl(var(--background)); font-size: 13px;
          color: hsl(var(--foreground)); cursor: pointer; font-weight: 600;
        }
        .retry-btn:hover { background: hsl(var(--accent)); }

        /* ── Empty state ── */
        .empty-state { text-align: left; padding: 28px 20px; }
        .empty-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; color: hsl(var(--foreground)); }
        .empty-copy { font-size: 13px; color: hsl(var(--muted-foreground)); margin-bottom: 12px; }
        .btn-primary {
          display: inline-flex; align-items: center;
          height: 32px; padding: 0 12px; border-radius: 8px;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          border: 0; font-size: 13px; font-weight: 600; cursor: pointer;
          text-decoration: none; box-shadow: 0 1px 2px hsl(221.2 83.2% 53.3% / 0.25);
        }

        /* ── New task link (populated state top bar) ── */
        .table-top-bar {
          display: flex; justify-content: flex-end;
          padding: 8px 12px; border-bottom: 1px solid hsl(var(--border));
        }
        .new-task-link {
          display: inline-flex; align-items: center;
          height: 32px; padding: 0 12px; border-radius: 8px;
          background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
          text-decoration: none; font-size: 13px; font-weight: 600;
          box-shadow: 0 1px 2px hsl(221.2 83.2% 53.3% / 0.25);
        }

        /* ── Mobile card list ── */
        .card-list { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
        .task-card {
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 8px; overflow: hidden;
        }
        .task-card-link {
          display: block; padding: 12px 16px; text-decoration: none; color: inherit;
          min-height: 44px;
        }
        .task-card-link:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: -2px; }
        .task-card-head { display: flex; align-items: flex-start; gap: 8px; flex-wrap: wrap; margin-bottom: 2px; }
        .task-card-meta { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 8px; }
        .task-card-meta dt { display: none; }
        .task-card-meta dd { margin: 0; font-size: 12px; }

        /* ── Utility ── */
        .sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;
        }
        .tabular-nums { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
      `}</style>
    </PageFrame>
  )
}
