import './TasksTable.css'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useIsDesktop } from '../../shell/useIsDesktop'
import { useAuth } from '../../auth/useAuth'
import { listTasks } from '../../lib/db/tasks'
import type { TaskListFilters } from '../../lib/db/tasks'
import type { TaskListRow, TaskStatus } from '../../lib/db/tasks.types'
import { getBusinessUnits, getPeople } from '../../lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '../../lib/db/directory'
import { dueStatus } from '../../lib/dueStatus'
import { raciMember, raciOwner } from '../../lib/raciMember'
import { StatusPill } from './StatusPill'
import { OwnerCell } from './OwnerCell'
import { formatAge, formatDate, otherRaciCount } from './taskFormatters'
import { useTasksKeyboard } from './useTasksKeyboard'

// ── Types ─────────────────────────────────────────────────────────────────────
type Segment = 'mine' | 'raci' | 'all'
type SortCol = 'task' | 'status' | 'owner' | 'due' | 'activity'
type SortDir = 'ascending' | 'descending'

export type TasksTableStats = { total: number; blocked: number; overdue: number } | null

export type TasksTableProps = {
  /** Currently-open task (split-view) — gets aria-current + the selected style. */
  selectedId?: string | null
  /** Whether a drawer is open beside the table (split-view). */
  drawerOpen?: boolean
  /** Whether the open drawer is expanded to full width (table hidden). */
  expanded?: boolean
  /** Optimistic per-row overrides fed by the open drawer (AC-103). */
  statusOverrides?: Map<string, TaskStatus>
  /** C2/I3: bump this to force a list refetch (after create/archive in the drawer). */
  refreshKey?: number
  /** AC-109: toggle the per-user-global expand pref (keyboard `e`). */
  onToggleExpand?: () => void
  /** The drawer slot (the router <Outlet>); rendered inside the .split grid. */
  drawerSlot?: ReactNode
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow({ condensed }: { condensed: boolean }) {
  return (
    <tr>
      <td className="sk-cell"><div className="sk" style={{ width: '42%' }} /></td>
      <td className="sk-cell"><div className="sk pill" /></td>
      <td className="sk-cell"><div className="sk av" /></td>
      <td className="sk-cell" style={{ textAlign: 'right' }}>
        <div className="sk" style={{ width: 56, marginLeft: 'auto' }} />
      </td>
      {!condensed && (
        <td className="sk-cell" style={{ textAlign: 'right' }}>
          <div className="sk" style={{ width: 28, marginLeft: 'auto' }} />
        </td>
      )}
    </tr>
  )
}

// ── Task card (mobile card list) ──────────────────────────────────────────────
type TaskCardProps = { task: TaskListRow; now: Date; buName: string; rName: string }
function TaskCard({ task, now, buName, rName }: TaskCardProps) {
  const ds = dueStatus(task.due_date, now)
  const age = formatAge(task.last_activity_at, now)
  const n = otherRaciCount(task)
  const isArchived = task.archived_at != null
  const dueClass = ds === 'overdue' ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (ds === 'overdue' ? `Overdue · ${formatDate(task.due_date)}` : formatDate(task.due_date))
    : '—'

  return (
    <article data-testid="task-card" className="task-card">
      <Link to={`/tasks/${task.id}`} className="task-card-link">
        <div className="task-card-head">
          {isArchived && <span className="archived-tag">Archived</span>}
          <span className={isArchived ? 'task-name task-name-archived' : 'task-name'}>{task.title}</span>
          <StatusPill status={task.status} />
        </div>
        <span className="task-bu">{buName}</span>
        <dl className="task-card-meta">
          <dt className="sr-only">Owner</dt>
          <dd><OwnerCell fullName={rName} otherCount={n} /></dd>
          <dt className="sr-only">Due</dt>
          <dd className={`tabular-nums ${dueClass}`}>{dueText}</dd>
          <dt className="sr-only">Activity</dt>
          <dd className="act tabular-nums">{age}</dd>
        </dl>
      </Link>
    </article>
  )
}

/**
 * The Tasks table assembly (toolbar + dense table / mobile card list + all
 * states). Extracted from TasksPage so it can live inside the split-view shell
 * (TasksLayout) AND the standalone full-page host. Selection, condense ladder,
 * and optimistic status sync are split-view additions driven by props.
 */
export function TasksTable({ selectedId, drawerOpen = false, expanded = false, statusOverrides, refreshKey = 0, onToggleExpand, drawerSlot }: TasksTableProps) {
  const condensed = drawerOpen && !expanded
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null

  // ── Filters ────────────────────────────────────────────────────────────────
  const [businessUnitId, setBusinessUnitId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [segment, setSegment] = useState<Segment>('mine')
  const [personFilter, setPersonFilter] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')

  // ── Sort ─────────────────────────────────────────────────────────────────
  const [sortCol, setSortCol] = useState<SortCol>('due')
  const [sortDir, setSortDir] = useState<SortDir>('ascending')

  // ── Data ─────────────────────────────────────────────────────────────────
  const [allTasks, setAllTasks] = useState<TaskListRow[]>([])
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [peopleDirectory, setPeopleDirectory] = useState<PersonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const now = useMemo(() => new Date(), [allTasks]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    const filters: TaskListFilters = {
      ...(businessUnitId ? { businessUnitId } : {}),
      ...(statusFilter ? { status: statusFilter as TaskStatus } : {}),
      includeArchived,
    }
    let cancelled = false
    Promise.all([listTasks(filters), getBusinessUnits(), getPeople()])
      .then(([rows, bus, people]) => {
        if (!cancelled) {
          setAllTasks(rows); setBusDirectory(bus); setPeopleDirectory(people); setLoading(false)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) { console.error('[TasksTable] load failed:', err); setError('load-failed'); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [businessUnitId, statusFilter, includeArchived])

  // C2/I3: refetch on filter changes AND whenever the host bumps refreshKey
  // (create/archive in the drawer). refreshKey is intentionally an extra dep.
  useEffect(() => { const cancel = load(); return cancel }, [load, refreshKey])

  // ── Apply optimistic status overrides from the open drawer ────────────────
  const tasksWithOverrides = useMemo(() => {
    if (!statusOverrides || statusOverrides.size === 0) return allTasks
    return allTasks.map(t => statusOverrides.has(t.id) ? { ...t, status: statusOverrides.get(t.id)! } : t)
  }, [allTasks, statusOverrides])

  // ── Client-side filtering ─────────────────────────────────────────────────
  const visibleTasks = useMemo(() => tasksWithOverrides.filter(t => {
    if (segment === 'mine' && viewerId && !raciOwner(t, viewerId)) return false
    if (segment === 'raci' && viewerId && !raciMember(t, viewerId)) return false
    if (personFilter && !raciMember(t, personFilter)) return false
    if (searchText && !t.title.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  }), [tasksWithOverrides, segment, viewerId, personFilter, searchText])

  // ── Sort ─────────────────────────────────────────────────────────────────
  const sortedTasks = useMemo(() => [...visibleTasks].sort((a, b) => {
    let cmp = 0
    if (sortCol === 'due') {
      if (!a.due_date && !b.due_date) cmp = 0
      else if (!a.due_date) cmp = 1
      else if (!b.due_date) cmp = -1
      else cmp = a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    } else if (sortCol === 'activity') {
      cmp = b.last_activity_at.localeCompare(a.last_activity_at)
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
    if (sortCol === col) setSortDir(d => d === 'ascending' ? 'descending' : 'ascending')
    else { setSortCol(col); setSortDir('ascending') }
  }

  const buOptions = useMemo(() => busDirectory, [busDirectory])
  const personOptions = useMemo(() => peopleDirectory, [peopleDirectory])

  // ── Keyboard layer (AC-109) ────────────────────────────────────────────────
  // j/k move a row cursor, Enter/o open it, Esc closes the drawer, n opens
  // create, e toggles expand. Single-letter hotkeys are suppressed in text
  // fields (handled inside the hook). The cursor row carries .kfocus.
  const { cursor, setCursor } = useTasksKeyboard({
    rowCount: sortedTasks.length,
    enabled: isDesktop, // mobile uses the card list + native links, not row cursor
    onOpen: i => { const t = sortedTasks[i]; if (t) navigate(`/tasks/${t.id}`) },
    onClose: () => { if (drawerOpen) navigate('/tasks') },
    onNew: () => navigate('/tasks/new'),
    onExpand: () => { if (drawerOpen) onToggleExpand?.() },
  })

  // Keep the cursor synced to the open/selected row so j/k continues from there.
  useEffect(() => {
    if (!selectedId) return
    const idx = sortedTasks.findIndex(t => t.id === selectedId)
    if (idx >= 0 && idx !== cursor) setCursor(idx)
  }, [selectedId, sortedTasks, cursor, setCursor])

  // Scroll the cursor row into view as j/k moves it (windowing-safe in PR-D).
  const cursorRowRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    cursorRowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [cursor])

  // ── Stats → host ──────────────────────────────────────────────────────────
  const stats = useMemo<TasksTableStats>(() => {
    if (error) return null
    const blocked = sortedTasks.filter(t => t.status === 'Blocked').length
    const overdue = sortedTasks.filter(t => dueStatus(t.due_date, now) === 'overdue').length
    return { total: sortedTasks.length, blocked, overdue }
  }, [sortedTasks, now, error])

  const countLine = stats === null
    ? '—'
    : `${stats.total} task${stats.total !== 1 ? 's' : ''}`
      + (stats.blocked > 0 ? ` · ${stats.blocked} blocked` : '')
      + (stats.overdue > 0 ? ` · ${stats.overdue} overdue` : '')

  const splitClass = `split${drawerOpen ? (expanded ? ' expanded' : '') : ' nodrawer'}`

  // ── Empty copy ─────────────────────────────────────────────────────────────
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

  function colSort(col: SortCol): 'ascending' | 'descending' | 'none' {
    return sortCol === col ? sortDir : 'none'
  }
  function sortGlyph(col: SortCol): string {
    if (sortCol !== col) return ''
    return sortDir === 'ascending' ? ' ▴' : ' ▾'
  }

  return (
    <>
      <div className="page-head-row">
        <h1 className="tasks-page-title">Tasks</h1>
        <span className="tasks-count-line tabular-nums">{countLine}</span>
      </div>

      <div className={splitClass}>
        <section className={`assembly${condensed ? ' condensed' : ''}`} aria-label="Tasks">
      {/* Toolbar */}
      <div className="toolbar">
        <label htmlFor="bu-filter" className="sr-only">Business unit</label>
        <div className="control">
          <span className="ctrl-lbl">Business unit</span>
          <select id="bu-filter" aria-label="Business unit" value={businessUnitId}
            onChange={e => setBusinessUnitId(e.target.value)} className="ctrl-select">
            <option value="">All</option>
            {buOptions.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
          </select>
          <span className="ctrl-chev" aria-hidden="true">▾</span>
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
          <span className="ctrl-chev" aria-hidden="true">▾</span>
        </div>

        <label htmlFor="person-filter" className="sr-only">Person</label>
        <div className="control">
          <span className="ctrl-lbl">Person</span>
          <select id="person-filter" aria-label="Person" value={personFilter}
            onChange={e => setPersonFilter(e.target.value)} className="ctrl-select">
            <option value="">Anyone</option>
            {personOptions.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <span className="ctrl-chev" aria-hidden="true">▾</span>
        </div>

        <div role="tablist" aria-label="Ownership filter" className="seg">
          {([
            { key: 'mine', label: 'Mine' },
            { key: 'raci', label: 'RACI-involved' },
            { key: 'all', label: 'All' },
          ] as { key: Segment; label: string }[]).map(({ key, label }) => (
            <button key={key} role="tab" aria-selected={segment === key}
              className={segment === key ? 'seg-btn seg-btn-on' : 'seg-btn'}
              onClick={() => setSegment(key)} type="button">
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
      </div>

      {/* Body */}
      {loading ? (
        <div aria-busy="true" aria-label="Loading tasks">
          <span className="sr-only" role="status">Loading tasks</span>
          {isDesktop ? (
            <table className="tasks-table" aria-label="Loading tasks">
              <tbody>
                <SkeletonRow condensed={condensed} /><SkeletonRow condensed={condensed} />
                <SkeletonRow condensed={condensed} /><SkeletonRow condensed={condensed} />
                <SkeletonRow condensed={condensed} />
              </tbody>
            </table>
          ) : (
            <div className="skeleton-cards">
              {[0, 1, 2].map(i => (
                <div key={i} className="sk-card-row"><div className="sk" style={{ width: '50%' }} /><div className="sk pill" /></div>
              ))}
            </div>
          )}
        </div>
      ) : error ? (
        <div role="alert" className="error-banner">
          <span className="error-text">Couldn&apos;t load tasks</span>
          <button type="button" className="retry-btn" onClick={load}>Retry</button>
        </div>
      ) : sortedTasks.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-title">{emptyTitle()}</h3>
          <p className="empty-copy">{emptyCopy()}</p>
          <Link to="/tasks/new" className="btn-primary">+ New task</Link>
        </div>
      ) : isDesktop ? (
        <>
          <div className="table-top-bar"><Link to="/tasks/new" className="new-task-link">+ New task</Link></div>
          <table className="tasks-table" aria-label="Tasks">
            <thead>
              <tr>
                <th scope="col" className={`th-cell th-sortable${sortCol === 'task' ? ' th-sorted' : ''}`}
                  aria-sort={colSort('task')} onClick={() => handleSort('task')}>
                  Task{sortGlyph('task') && <span className="sort-aff" aria-hidden="true">{sortGlyph('task')}</span>}
                </th>
                <th scope="col" className={`th-cell th-sortable${sortCol === 'status' ? ' th-sorted' : ''}`}
                  aria-sort={colSort('status')} onClick={() => handleSort('status')}>
                  Status{sortGlyph('status') && <span className="sort-aff" aria-hidden="true">{sortGlyph('status')}</span>}
                </th>
                <th scope="col" className={`th-cell th-sortable th-owner${sortCol === 'owner' ? ' th-sorted' : ''}`}
                  aria-sort={colSort('owner')} onClick={() => handleSort('owner')}>
                  Owner{sortGlyph('owner') && <span className="sort-aff" aria-hidden="true">{sortGlyph('owner')}</span>}
                </th>
                <th scope="col" className={`th-cell th-sortable th-right${sortCol === 'due' ? ' th-sorted' : ''}`}
                  aria-sort={colSort('due')} onClick={() => handleSort('due')}>
                  Due{sortGlyph('due') && <span className="sort-aff" aria-hidden="true">{sortGlyph('due')}</span>}
                </th>
                {!condensed && (
                  <th scope="col" className={`th-cell th-sortable th-right${sortCol === 'activity' ? ' th-sorted' : ''}`}
                    aria-sort={colSort('activity')} onClick={() => handleSort('activity')}>
                    Activity{sortGlyph('activity') && <span className="sort-aff" aria-hidden="true">{sortGlyph('activity')}</span>}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedTasks.map((task, rowIndex) => {
                const ds = dueStatus(task.due_date, now)
                const dueClass = ds === 'overdue' ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
                const dueText = task.due_date
                  ? (ds === 'overdue'
                    ? (condensed ? formatDate(task.due_date) : `Overdue · ${formatDate(task.due_date)}`)
                    : formatDate(task.due_date))
                  : '—'
                const buName = buMap.get(task.business_unit_id) ?? ''
                const rName = personMap.get(task.responsible_person_id) ?? ''
                const isArchived = task.archived_at != null
                const isSelected = selectedId === task.id
                const isCursor = cursor === rowIndex
                return (
                  <tr key={task.id}
                    ref={isCursor ? cursorRowRef : undefined}
                    className={`task-row${isSelected ? ' row-selected' : ''}${isCursor ? ' kfocus' : ''}`}
                    aria-current={isSelected ? 'true' : undefined}
                    onClick={() => navigate(`/tasks/${task.id}`)}>
                    <td className="td-main">
                      <Link to={`/tasks/${task.id}`} className="task-row-link" tabIndex={0}>
                        <span className="task-title-line">
                          {isArchived && <span className="archived-tag">Archived</span>}
                          <span className={isArchived ? 'task-name task-name-archived' : 'task-name'}>{task.title}</span>
                        </span>
                        <span className="task-bu">{buName}</span>
                      </Link>
                    </td>
                    <td className="td-cell"><StatusPill status={task.status} /></td>
                    <td className="td-cell td-owner"><OwnerCell fullName={rName} otherCount={otherRaciCount(task)} /></td>
                    <td className={`td-right tabular-nums ${dueClass}`}>{dueText}</td>
                    {!condensed && <td className="td-right tabular-nums act">{formatAge(task.last_activity_at, now)}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <div className="table-top-bar"><Link to="/tasks/new" className="new-task-link">+ New task</Link></div>
          <div className="card-list" role="list">
            {sortedTasks.map(task => (
              <div key={task.id} role="listitem">
                <TaskCard task={task} now={now}
                  buName={buMap.get(task.business_unit_id) ?? ''}
                  rName={personMap.get(task.responsible_person_id) ?? ''} />
              </div>
            ))}
          </div>
        </>
      )}
        </section>
        {drawerOpen && drawerSlot}
      </div>
    </>
  )
}
