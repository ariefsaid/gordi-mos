import './TasksWorkspace.css'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  createColumnHelper,
} from '@tanstack/react-table'
import type { SortingState, FilterFn } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link, useNavigate } from 'react-router-dom'
import { useIsDesktop } from '@/shell/useIsDesktop'
import { useAuth } from '@/auth/useAuth'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListFilters } from '@/lib/db/tasks'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { dueStatus, isOverdue } from '@/lib/dueStatus'
import { raciMember, raciOwner } from '@/lib/raciMember'
import { StatusPill } from './StatusPill'
import { OwnerCell } from './OwnerCell'
import type { OwnerCellRaciMember } from './OwnerCell'
import { formatAge, formatDate, otherRaciCount } from './taskFormatters'
import { useTasksKeyboard } from './useTasksKeyboard'
import { useTasksViewPref } from './useTasksViewPref'
import type { TasksGroupBy } from './useTasksViewPref'
import { GroupHeaderRow } from './GroupHeaderRow'
import { MobileGroupedCards } from './MobileGroupedCards'
import { Chevron } from '@/shell/icons'
import PageHead from '@/shell/PageHead'
import { ErrorState, EmptyState } from '@/components/ui/StateKit'

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
  /** Whether the viewport is in the ≥1100px live split (false → modal overlay/mobile,
   *  where the drawer floats over a full-width table — so the table must NOT squash). */
  splitLayout?: boolean
  /** Optimistic per-row overrides fed by the open drawer (AC-103). */
  statusOverrides?: Map<string, TaskStatus>
  /** C2/I3: bump this to force a list refetch (after create/archive in the drawer). */
  refreshKey?: number
  /** AC-109: toggle the per-user-global expand pref (keyboard `e`). */
  onToggleExpand?: () => void
  /** The drawer slot (the router <Outlet>); rendered inside the .split grid. */
  drawerSlot?: ReactNode
}

// OD-P3-6 / mockup: OFF-TRACK-FIRST group order (In Progress → Blocked → Open → Done),
// mirroring the signed mockup and the My Week 'off track first' reading.
const STATUS_ORDER: TaskStatus[] = ['In Progress', 'Blocked', 'Open', 'Done']

// ── Group model ────────────────────────────────────────────────────────────────
// A group ready to render: its display label, persistence key, leaf rows (filtered
// + due-sorted), overdue subtotal, and the "+ Add task" pre-fill query param.
type RenderGroup = {
  key: string        // persistence/identity key (status name, person id, or bu id)
  label: string      // display label
  rows: TaskListRow[]
  overdue: number
  prefillParam: string // e.g. "status=Blocked", "r=<personId>", "bu=<buId>"
}

// ── Skeleton row ──────────────────────────────────────────────────────────────
function SkeletonRow({ condensed }: { condensed: boolean }) {
  return (
    <tr>
      <td className="sk-cell"><div className="sk" style={{ width: '42%' }} /></td>
      <td className="sk-cell"><div className="sk pill" /></td>
      <td className="sk-cell"><div className="sk av" /></td>
      {!condensed && (
        <td className="sk-cell"><div className="sk" style={{ width: 60 }} /></td>
      )}
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


const columnHelper = createColumnHelper<TaskListRow>()

/** Sort-direction indicator (IXD-1/2/3: distinct from the shared dropdown Chevron —
 *  a shafted arrow, never the bare chevron that means "dropdown"). Rendered only on
 *  the active-sort column. */
function SortArrow({ dir }: { dir: SortDir }) {
  return (
    <svg className="sort-aff" width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === 'ascending' ? (
        <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>
      ) : (
        <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>
      )}
    </svg>
  )
}

/**
 * The Tasks workspace assembly (page title + toolbar + grouped dense table /
 * mobile grouped cards + all states + the split-view drawer slot). Built on a
 * single client-side @tanstack/react-table instance for filtering + sorting
 * (NFR-120); grouping (incl. empty groups), the keyboard cursor, optimistic
 * status sync, and virtualization are layered on top. (Formerly TasksTable.)
 */
export function TasksWorkspace({ selectedId, drawerOpen = false, expanded = false, splitLayout = true, statusOverrides, refreshKey = 0, onToggleExpand, drawerSlot }: TasksTableProps) {
  // Condense only in the live ≥1100px split. In the overlay/mobile regime the
  // drawer floats over a full-width table, so the table keeps all columns.
  const condensed = drawerOpen && !expanded && splitLayout
  const isDesktop = useIsDesktop()
  const navigate = useNavigate()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null

  // ── Persistence (FR-125) ──────────────────────────────────────────────────
  const { groupBy, setGroupBy, isCollapsed, toggleCollapsed, collapsedGroups } = useTasksViewPref()

  // ── Filters ────────────────────────────────────────────────────────────────
  const [businessUnitId, setBusinessUnitId] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [segment, setSegment] = useState<Segment>('mine')
  const [personFilter, setPersonFilter] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')
  // Transient overdue-only filter (AC-128 / FR-126) — clicking "N overdue" sets this;
  // cleared via the chip ✕ or the Clear filters button.
  const [overdueOnly, setOverdueOnly] = useState(false)

  // ── Sort (UI state; mapped onto the TanStack sorting state below) ──────────
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
        if (!cancelled) { console.error('[TasksWorkspace] load failed:', err); setError('load-failed'); setLoading(false) }
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

  // ── Person-overrides-segment (FR-124 / AC-126) ───────────────────────────
  // When a Person filter is set, the Mine/RACI/All segment is inert — the Person
  // filter drives the ownership scope. The segment is re-enabled when cleared.
  const segmentDisabled = personFilter !== ''

  // ── TanStack instance: the single client-side engine (NFR-120) ────────────
  // Owns filtering (ownership scope / search / overdue) + sorting (default Due-asc).
  // The grouping (incl. empty-group injection) is built from the engine's filtered
  // + sorted rows below (outside the row model, per the empty-group requirement).
  const columns = useMemo(() => [
    columnHelper.accessor('title', { id: 'task', sortingFn: (a, b) => a.original.title.localeCompare(b.original.title) }),
    columnHelper.accessor('status', { id: 'status', sortingFn: (a, b) => a.original.status.localeCompare(b.original.status) }),
    columnHelper.accessor('responsible_person_id', { id: 'owner' }),
    columnHelper.accessor('due_date', {
      id: 'due',
      sortingFn: (a, b) => {
        const ad = a.original.due_date, bd = b.original.due_date
        if (!ad && !bd) return 0
        if (!ad) return 1
        if (!bd) return -1
        return ad < bd ? -1 : ad > bd ? 1 : 0
      },
    }),
    columnHelper.accessor('last_activity_at', {
      id: 'activity',
      sortingFn: (a, b) => b.original.last_activity_at.localeCompare(a.original.last_activity_at),
    }),
  ], [])

  // Owner sort needs the personMap — handled via a manual sort layer after the
  // engine for the 'owner' column (engine sorts by id otherwise). Kept simple:
  // the engine's sorted rows are re-sorted only when sorting by owner name.
  const sortingState: SortingState = useMemo(
    () => [{ id: sortCol, desc: sortDir === 'descending' }],
    [sortCol, sortDir],
  )

  // The composite filter state is carried as the engine's globalFilter value.
  const globalFilter = useMemo(
    () => ({ search: searchText, overdueOnly, segment, personFilter }),
    [searchText, overdueOnly, segment, personFilter],
  )

  // Single composite global filter: ownership scope + search + transient overdue-only.
  const globalFilterFn: FilterFn<TaskListRow> = useCallback((row, _id, value) => {
    const t = row.original
    const { search, overdueOnly: od, segment: seg, personFilter: pf } =
      value as { search: string; overdueOnly: boolean; segment: Segment; personFilter: string }
    // Ownership scope (Person overrides the Mine/RACI/All segment, FR-124)
    if (pf) { if (!raciMember(t, pf)) return false }
    else if (seg === 'mine' && viewerId && !raciOwner(t, viewerId)) return false
    else if (seg === 'raci' && viewerId && !raciMember(t, viewerId)) return false
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false
    if (od && !isOverdue(t, now)) return false
    return true
  }, [now, viewerId])

  const table = useReactTable({
    data: tasksWithOverrides,
    columns,
    state: { sorting: sortingState, globalFilter },
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: false,
    getRowId: (t) => t.id,
  })

  // The engine's filtered + sorted leaf rows (global Due-asc by default).
  const engineRows = table.getRowModel().rows
  const sortedTasks = useMemo<TaskListRow[]>(() => {
    let rows = engineRows.map(r => r.original)
    // Owner-name sort isn't expressible by id alone — re-sort by display name.
    if (sortCol === 'owner') {
      rows = [...rows].sort((a, b) => {
        const an = personMap.get(a.responsible_person_id) ?? ''
        const bn = personMap.get(b.responsible_person_id) ?? ''
        const cmp = an.localeCompare(bn)
        return sortDir === 'ascending' ? cmp : -cmp
      })
    }
    return rows
    // engineRows identity changes whenever the engine recomputes
  }, [engineRows, sortCol, sortDir, personMap])

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'ascending' ? 'descending' : 'ascending')
    else { setSortCol(col); setSortDir('ascending') }
  }

  const buOptions = useMemo(() => busDirectory, [busDirectory])
  const personOptions = useMemo(() => peopleDirectory, [peopleDirectory])

  // ── RACI disclosure data per task (for the OwnerCell +N tooltip, AC-130) ──
  const buildOthers = useCallback((task: TaskListRow): OwnerCellRaciMember[] => {
    const r = task.responsible_person_id
    const out: OwnerCellRaciMember[] = []
    const seen = new Set<string>()
    if (task.accountable_person_id !== r && !seen.has(task.accountable_person_id)) {
      seen.add(task.accountable_person_id)
      out.push({ role: 'A', name: personMap.get(task.accountable_person_id) ?? '—' })
    }
    for (const id of task.consulted_person_ids) {
      if (id !== r && !seen.has(id)) { seen.add(id); out.push({ role: 'C', name: personMap.get(id) ?? '—' }) }
    }
    for (const id of task.informed_person_ids) {
      if (id !== r && !seen.has(id)) { seen.add(id); out.push({ role: 'I', name: personMap.get(id) ?? '—' }) }
    }
    return out
  }, [personMap])

  // ── Grouping (FR-122/123, AC-123/124) ────────────────────────────────────
  // Build the ordered group list from the engine's filtered + sorted rows.
  // Empty groups (Owner/BU with zero rows) are injected from the full directory
  // (Status uses the fixed 4-status set) so all groups always show (OD-P3-6).
  const groups = useMemo<RenderGroup[]>(() => {
    const byKey = new Map<string, TaskListRow[]>()
    const keyFor = (t: TaskListRow): string =>
      groupBy === 'status' ? t.status
        : groupBy === 'owner' ? t.responsible_person_id
          : t.business_unit_id
    for (const t of sortedTasks) {
      const k = keyFor(t)
      const arr = byKey.get(k)
      if (arr) arr.push(t); else byKey.set(k, [t])
    }
    const mk = (key: string, label: string, prefillParam: string): RenderGroup => {
      const rows = byKey.get(key) ?? []
      const overdue = rows.filter(t => isOverdue(t, now)).length
      return { key, label, rows, overdue, prefillParam }
    }
    if (groupBy === 'status') {
      // FR-123 (refined): Status groups open a plain /tasks/new (no ?status= pre-fill)
      // because CreateSurface has no status field — the task always opens as "Open".
      // Owner→?r=<personId> and BU→?bu=<buId> ARE read and applied by CreateSurface.
      return STATUS_ORDER.map(s => mk(s, s, ''))
    }
    if (groupBy === 'owner') {
      return peopleDirectory.map(p => mk(p.id, p.full_name, `r=${p.id}`))
    }
    // bu
    return busDirectory.map(b => mk(b.id, b.name, `bu=${b.id}`))
  }, [sortedTasks, groupBy, now, peopleDirectory, busDirectory])

  // ── Flat visible-row model (headers + expanded-group leaf rows) ───────────
  // Drives rendering, the leaf-row keyboard cursor, and virtualization windowing.
  type FlatRow =
    | { kind: 'header'; group: RenderGroup }
    | { kind: 'leaf'; task: TaskListRow; leafIndex: number }
  const { flatRows, leafTasks } = useMemo(() => {
    const flat: FlatRow[] = []
    const leaves: TaskListRow[] = []
    for (const g of groups) {
      flat.push({ kind: 'header', group: g })
      if (isCollapsed(g.key)) continue
      for (const t of g.rows) {
        flat.push({ kind: 'leaf', task: t, leafIndex: leaves.length })
        leaves.push(t)
      }
    }
    return { flatRows: flat, leafTasks: leaves }
    // collapsedGroups identity changes drive recompute (isCollapsed reads it)
  }, [groups, isCollapsed, collapsedGroups]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Active-filter detection (for no-results-after-filter vs empty-no-tasks) ──
  const hasActiveFilter = businessUnitId !== '' || statusFilter !== '' || personFilter !== ''
    || searchText !== '' || overdueOnly || includeArchived

  function clearFilters() {
    setBusinessUnitId('')
    setStatusFilter('')
    setPersonFilter('')
    setSearchText('')
    setOverdueOnly(false)
    setIncludeArchived(false)
  }

  // ── Keyboard layer (AC-109, OBS-121) ───────────────────────────────────────
  // The cursor moves over LEAF rows only (group-header rows are not cursor
  // targets) — cursor index maps onto leafTasks[i].
  const { cursor, setCursor } = useTasksKeyboard({
    rowCount: leafTasks.length,
    enabled: isDesktop, // mobile uses the card list + native links, not row cursor
    onOpen: i => { const t = leafTasks[i]; if (t) navigate(`/tasks/${t.id}`) },
    onClose: () => { if (drawerOpen) navigate('/tasks') },
    onNew: () => navigate('/tasks/new'),
    onExpand: () => { if (drawerOpen) onToggleExpand?.() },
  })

  // Keep the cursor synced to the open/selected leaf row so j/k continues from there.
  useEffect(() => {
    if (!selectedId) return
    const idx = leafTasks.findIndex(t => t.id === selectedId)
    if (idx >= 0 && idx !== cursor) setCursor(idx)
  }, [selectedId, leafTasks, cursor, setCursor])

  // Scroll the cursor row into view as j/k moves it (windowing-safe).
  const cursorRowRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    cursorRowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [cursor])

  // ── Virtualization (AC-131, NFR-120) ───────────────────────────────────────
  // Window the desktop body at 50+ LEAF rows. The window spans the flat visible
  // row list (headers + leaves) so headers and leaves window together. The
  // <thead> (with aria-sort) stays outside the window; the j/k cursor uses
  // scrollToIndex on the flat-row position to keep the windowed row mounted.
  const VIRTUALIZE_THRESHOLD = 50
  const ROW_HEIGHT = 50 // OD-P3-6: dense DB-view body row (not the 54px default)
  const virtualize = isDesktop && leafTasks.length >= VIRTUALIZE_THRESHOLD
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: virtualize ? flatRows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
    initialRect: { width: 0, height: 600 },
  })

  // Map the leaf cursor onto its flat-row position so windowing keeps it mounted.
  const cursorFlatIndex = useMemo(() => {
    if (cursor < 0) return -1
    return flatRows.findIndex(r => r.kind === 'leaf' && r.leafIndex === cursor)
  }, [cursor, flatRows])
  useEffect(() => {
    if (virtualize && cursorFlatIndex >= 0) rowVirtualizer.scrollToIndex(cursorFlatIndex, { align: 'auto' })
  }, [cursorFlatIndex, virtualize, rowVirtualizer])

  // ── Stats → host ──────────────────────────────────────────────────────────
  const stats = useMemo<TasksTableStats>(() => {
    if (error) return null
    const blocked = leafTasks.filter(t => t.status === 'Blocked').length
    const overdue = leafTasks.filter(t => isOverdue(t, now)).length
    return { total: leafTasks.length, blocked, overdue }
  }, [leafTasks, now, error])

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

  // "+ Add task" pre-fill: navigate to the create surface seeding the grouped
  // dimension (Owner → R, BU → bu, Status → status) — AC-125, FR-123.
  const openAddTask = useCallback((prefillParam: string) => {
    navigate(`/tasks/new?${prefillParam}`)
  }, [navigate])

  // ── Row renderer (shared by the plain + virtualized bodies) ────────────────
  function renderRow(task: TaskListRow, leafIndex: number) {
    const ds = dueStatus(task.due_date, now)
    const taskOverdue = isOverdue(task, now)
    // C1: only genuinely-overdue (non-Done, non-archived) rows get the red class.
    const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
    const dueText = task.due_date
      ? (taskOverdue
        // M1: condensed drops the "Overdue · " prefix but keeps a "!" glyph (WCAG 1.4.1).
        ? (condensed ? `! ${formatDate(task.due_date)}` : `Overdue · ${formatDate(task.due_date)}`)
        : formatDate(task.due_date))
      : '—'
    const buName = buMap.get(task.business_unit_id) ?? ''
    const rName = personMap.get(task.responsible_person_id) ?? ''
    const isArchived = task.archived_at != null
    const isSelected = selectedId === task.id
    const isCursor = cursor === leafIndex
    return (
      <tr key={task.id}
        ref={isCursor ? cursorRowRef : undefined}
        className={`task-row${isSelected ? ' row-selected' : ''}${isCursor ? ' kfocus' : ''}`}
        // I1: expose cursor to AT via aria-current; isSelected keeps 'true' for the open drawer row.
        aria-current={isSelected ? 'true' : (isCursor ? 'true' : undefined)}
        onClick={() => navigate(`/tasks/${task.id}`)}>
        <td className="td-main">
          <Link to={`/tasks/${task.id}`} className="task-row-link" tabIndex={0}>
            <span className="task-title-line">
              {isArchived && <span className="archived-tag">Archived</span>}
              <span className={isArchived ? 'task-name task-name-archived' : 'task-name'}>{task.title}</span>
            </span>
          </Link>
        </td>
        <td className="td-cell"><StatusPill status={task.status} /></td>
        <td className="td-cell td-owner"><OwnerCell fullName={rName} otherCount={otherRaciCount(task)} others={buildOthers(task)} /></td>
        {!condensed && <td className="td-cell td-bu">{buName}</td>}
        <td className={`td-cell td-nowrap tabular-nums ${dueClass}`}>{dueText}</td>
        {!condensed && <td className="td-cell td-nowrap tabular-nums act">{formatAge(task.last_activity_at, now)}</td>}
      </tr>
    )
  }

  function renderGroupHeader(group: RenderGroup) {
    return (
      <GroupHeaderRow
        key={`grp-${group.key}`}
        label={group.label}
        count={group.rows.length}
        overdue={group.overdue}
        collapsed={isCollapsed(group.key)}
        colSpan={condensed ? 4 : 6}
        prefill={group.prefillParam}
        controlsId={`grp-rows-${group.key}`}
        onToggle={() => toggleCollapsed(group.key)}
        onAddTask={() => openAddTask(group.prefillParam)}
        onOverdueFilter={() => setOverdueOnly(true)}
      />
    )
  }

  function colSort(col: SortCol): 'ascending' | 'descending' | 'none' {
    return sortCol === col ? sortDir : 'none'
  }
  function sortIndicator(col: SortCol): ReactNode {
    if (sortCol !== col) return null
    return <SortArrow dir={sortDir} />
  }

  // + New task lives in the toolbar only when the table is populated (empty / no-results
  // states own their own create CTA).
  const showNewTask = !loading && !error && leafTasks.length > 0

  return (
    <>
      <PageHead
        title="Tasks"
        meta={
          <>
            {/* Count line with clickable "N overdue" button (AC-128 / FR-126) */}
            <span data-testid="tasks-count-line" className="tabular-nums" style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
              {stats === null ? '—' : (
                <>
                  {stats.total} task{stats.total !== 1 ? 's' : ''}
                  {stats.blocked > 0 && (
                    <> · {stats.blocked} blocked</>
                  )}
                  {/* Zero-overdue: omit entirely (AC-133). Non-zero: render as click-to-filter button */}
                  {stats.overdue > 0 && (
                    <> · <button
                      type="button"
                      className="overdue-filter-btn"
                      aria-label={`Filter to ${stats.overdue} overdue tasks`}
                      onClick={() => setOverdueOnly(true)}
                    >
                      {stats.overdue} overdue
                    </button></>
                  )}
                </>
              )}
            </span>
            {/* Overdue-only active chip (AC-128 — clearable transient filter) */}
            {overdueOnly && (
              <button
                type="button"
                className="overdue-chip"
                aria-label="Clear overdue filter"
                onClick={() => setOverdueOnly(false)}
              >
                Overdue only ✕
              </button>
            )}
          </>
        }
      />

      <div className={splitClass}>
        <section className={`assembly${condensed ? ' condensed' : ''}`} aria-label="Tasks">
      {/* Toolbar */}
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
          {([
            { key: 'mine', label: 'Mine' },
            { key: 'raci', label: 'RACI' },
            { key: 'all', label: 'All' },
          ] as { key: Segment; label: string }[]).map(({ key, label }) => (
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
        <ErrorState message="Couldn't load tasks" onRetry={load} />
      ) : leafTasks.length === 0 && hasActiveFilter ? (
        /* No-results-after-filter: distinct from empty-no-tasks (AC-133 / design-plan §3) */
        <EmptyState title="No tasks match these filters" copy="Clear filters to see all tasks.">
          <button type="button" className="btn btn-outline" onClick={clearFilters}>Clear filters</button>
          <Link to="/tasks/new" className="btn btn-primary">+ New task</Link>
        </EmptyState>
      ) : leafTasks.length === 0 ? (
        /* Empty-no-tasks: no filter is active (segment-aware copy) */
        <EmptyState title={emptyTitle()} copy={emptyCopy()}>
          <Link to="/tasks/new" className="btn btn-primary">+ New task</Link>
        </EmptyState>
      ) : isDesktop ? (
        <>
          <div ref={scrollRef} className={virtualize ? 'tasks-scroll tasks-scroll-virtual' : 'tasks-scroll'}>
          <table className="tasks-table" aria-label="Tasks">
            <thead>
              <tr>
                <th scope="col" className={`th-cell th-sortable${sortCol === 'task' ? ' th-sorted' : ''}`}
                  aria-sort={colSort('task')} onClick={() => handleSort('task')}>
                  Task{sortIndicator('task')}
                </th>
                <th scope="col" className={`th-cell th-sortable${sortCol === 'status' ? ' th-sorted' : ''}`}
                  aria-sort={colSort('status')} onClick={() => handleSort('status')}>
                  Status{sortIndicator('status')}
                </th>
                <th scope="col" className={`th-cell th-sortable th-owner${sortCol === 'owner' ? ' th-sorted' : ''}`}
                  aria-sort={colSort('owner')} onClick={() => handleSort('owner')}>
                  Owner{sortIndicator('owner')}
                </th>
                {!condensed && (
                  <th scope="col" className="th-cell">Business unit</th>
                )}
                <th scope="col" className={`th-cell th-sortable${sortCol === 'due' ? ' th-sorted' : ''}`}
                  aria-sort={colSort('due')} onClick={() => handleSort('due')}>
                  Due{sortIndicator('due')}
                </th>
                {!condensed && (
                  <th scope="col" className={`th-cell th-sortable${sortCol === 'activity' ? ' th-sorted' : ''}`}
                    aria-sort={colSort('activity')} onClick={() => handleSort('activity')}>
                    Activity{sortIndicator('activity')}
                  </th>
                )}
              </tr>
            </thead>
            {virtualize ? (
              (() => {
                const items = rowVirtualizer.getVirtualItems()
                const totalSize = rowVirtualizer.getTotalSize()
                const colSpan = condensed ? 4 : 6
                const padTop = items.length > 0 ? items[0].start : 0
                const padBottom = items.length > 0 ? totalSize - items[items.length - 1].end : 0
                return (
                  <tbody>
                    {padTop > 0 && <tr aria-hidden="true" style={{ height: padTop }}><td colSpan={colSpan} /></tr>}
                    {items.map(vi => {
                      const fr = flatRows[vi.index]
                      return fr.kind === 'header'
                        ? renderGroupHeader(fr.group)
                        : renderRow(fr.task, fr.leafIndex)
                    })}
                    {padBottom > 0 && <tr aria-hidden="true" style={{ height: padBottom }}><td colSpan={colSpan} /></tr>}
                  </tbody>
                )
              })()
            ) : (
              <tbody>
                {flatRows.map(fr =>
                  fr.kind === 'header'
                    ? renderGroupHeader(fr.group)
                    : renderRow(fr.task, fr.leafIndex))}
              </tbody>
            )}
          </table>
          </div>
        </>
      ) : (
        <>
          <MobileGroupedCards
            groups={groups}
            now={now}
            buMap={buMap}
            personMap={personMap}
            isCollapsed={isCollapsed}
            toggleCollapsed={toggleCollapsed}
            openAddTask={openAddTask}
            setOverdueOnly={setOverdueOnly}
            buildOthers={buildOthers}
          />
        </>
      )}
        </section>
        {drawerOpen && drawerSlot}
      </div>
    </>
  )
}
