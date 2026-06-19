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
import { useNavigate } from 'react-router-dom'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { listTasks } from '@/lib/db/tasks'
import type { TaskListFilters } from '@/lib/db/tasks'
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import { getBusinessUnits } from '@/lib/db/directory'
import { getPeople } from '@/lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { isOverdue } from '@/lib/due-status'
import { raciMember, raciOwner } from '@/lib/raci-member'
import type { OwnerCellRaciMember } from './owner-cell'
import { TaskRow } from './task-row'
import { useTasksKeyboard } from './use-tasks-keyboard'
import { useTasksViewPref } from './use-tasks-view-pref'
import { GroupHeaderRow } from './group-header-row'
import { PageHead } from '@/shell/page-head'
import { TasksToolbar } from './tasks-toolbar'
import { TasksTableBody } from './tasks-table-body'
import type { FlatRow } from './tasks-table-body'
import type { RenderGroup } from './tasks-grouping'

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

// The RenderGroup shape (group label/key/rows/overdue/prefill) lives in
// ./tasks-grouping so the orchestrator + body agree on it.

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

  // ── Row selection (PR-2 AC-T02/T07) — presentational scaffolding only.
  //    A local selected set; NO bulk action ships this PR. The select-all header
  //    checkbox exposes aria-checked="mixed" when the selection is partial.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

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
  // FlatRow shape lives in ./tasks-table-body (shared with the body renderer).
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

  // Select-all derived state (PR-2 AC-T07): aria-checked="mixed" when partial,
  // true only when every visible leaf row is selected. Empty table -> unchecked.
  const someChecked = selectedIds.size > 0 && leafTasks.some(t => selectedIds.has(t.id))
  const allChecked = leafTasks.length > 0 && leafTasks.every(t => selectedIds.has(t.id))
  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev =>
      leafTasks.length > 0 && leafTasks.every(t => prev.has(t.id))
        ? new Set()
        : new Set(leafTasks.map(t => t.id)),
    )
  }, [leafTasks])

  // Active-filter detection (for no-results-after-filter vs empty-no-tasks)
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
    return (
      <TaskRow
        key={task.id}
        task={task}
        now={now}
        condensed={condensed}
        isSelected={selectedId === task.id}
        isCursor={cursor === leafIndex}
        leafIndex={leafIndex}
        cursorRowRef={cursor === leafIndex ? cursorRowRef : undefined}
        buName={buMap.get(task.business_unit_id) ?? ''}
        ownerName={personMap.get(task.responsible_person_id) ?? ''}
        others={buildOthers(task)}
        onOpen={(id) => navigate(`/tasks/${id}`)}
        checked={selectedIds.has(task.id)}
        onCheck={() => toggleSelected(task.id)}
      />
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
        colSpan={condensed ? 6 : 8}
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
          <TasksToolbar
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            businessUnitId={businessUnitId}
            setBusinessUnitId={setBusinessUnitId}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            personFilter={personFilter}
            setPersonFilter={setPersonFilter}
            segment={segment}
            setSegment={setSegment}
            segmentDisabled={segmentDisabled}
            searchText={searchText}
            setSearchText={setSearchText}
            includeArchived={includeArchived}
            setIncludeArchived={setIncludeArchived}
            buOptions={busDirectory}
            personOptions={peopleDirectory}
            showNewTask={showNewTask}
          />

          <TasksTableBody
            loading={loading}
            error={error}
            leafTasks={leafTasks}
            hasActiveFilter={hasActiveFilter}
            condensed={condensed}
            isDesktop={isDesktop}
            onRetry={load}
            onClearFilters={clearFilters}
            emptyTitle={emptyTitle()}
            emptyCopy={emptyCopy()}
            sortCol={sortCol}
            onSort={handleSort}
            ariaSort={colSort}
            sortIndicator={sortIndicator}
            allChecked={allChecked}
            someChecked={someChecked}
            onToggleSelectAll={toggleSelectAll}
            flatRows={flatRows}
            virtualize={virtualize}
            scrollRef={scrollRef}
            rowVirtualizer={rowVirtualizer}
            renderRow={renderRow}
            renderGroupHeader={renderGroupHeader}
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
        </section>
        {drawerOpen && drawerSlot}
      </div>
    </>
  )
}
