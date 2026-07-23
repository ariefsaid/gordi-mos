import './TasksWorkspace.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsNarrow } from '@/shell/use-is-narrow'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import type { PageFamilyState } from '@/shell/page-families'
import { OverlayHostSlot, useOverlayHost } from '@/shell/overlay-host'
import { createRecordRouteAdapter } from '@/shell/overlay-navigation'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { useT } from '@/i18n/use-t'
import { useDueRuns } from '@/components/processes/use-due-runs'
import { DueRunsList } from '@/components/processes/due-runs-list'
import { SHOW_FOLLOWUPS } from '@/config/features'
import { FollowUpQueueEmbed } from '@/components/follow-ups/follow-up-queue-embed'
import { TasksToolbar } from './tasks-toolbar'
import {
  TASK_COLLECTION_NEUTRAL_QUERY,
  taskCollectionDescriptor,
} from './task-collection-adapter'
import type {
  TaskCollectionQuery,
  TaskCollectionSort,
  TaskCollectionView,
} from './task-collection-adapter'
import {
  TaskCollectionRuntimeProvider,
  type TaskCollectionRuntime,
} from './task-collection-presentation'
import type { TaskStatus } from '@/lib/db/tasks.types'
import { updateTaskFields } from '@/lib/db/tasks'
import { TaskOverlayContent } from './task-drawer'
import { AskDeputyAction } from '@/components/records/ask-deputy-action'
import type { OverlayEntry } from '@/shell/overlay-host'

// D-A1 (fix work-order item 4): the Task record door is URL-addressable via the ?record= query
// seam — the SAME grammar Signals uses (backlog R6(b) "unify on ?record="), built from the shared
// createRecordRouteAdapter so no third door grammar is invented. The panel toggles ?record=<id> on
// the collection path (/work/tasks); the canonical full page keeps its own path (/work/tasks/:id).
const taskRouteAdapter = createRecordRouteAdapter({
  collectionPath: '/work/tasks',
  panelParam: 'record',
  pagePath: (id) => `/work/tasks/${id}`,
})

// §Task-11 (Issue-8 gate): no `team` chip until Issue 8 lands the real Task team_id contract.
type TasksSavedViewChip = 'mine' | 'overdue' | 'followups'
const EMPTY_ACCESS_ROLES: readonly string[] = []
const EMPTY_RECORDS: never[] = []
const EMPTY_STATUS_OVERRIDES = new Map<string, TaskStatus>()

type LegacySavedView = {
  view: TasksSavedViewChip | 'all' | 'unknown'
  activeChip: TasksSavedViewChip | null
  segment: 'mine' | 'all'
  overdueOnly: boolean
  reserved: 'followups' | null
  search: string
}

export type TasksTableStats = { total: number; blocked: number; overdue: number } | null

export type TasksTableProps = {
  /** Legacy test/embedding bridge. Production TasksLayout now derives this from the typed URL query. */
  savedView?: LegacySavedView
  onSavedViewChange?: (next: TasksSavedViewChip | 'all') => void
  selectedId?: string | null
  drawerOpen?: boolean
  expanded?: boolean
  splitLayout?: boolean
  statusOverrides?: Map<string, TaskStatus>
  refreshKey?: number
  onToggleExpand?: () => void
  drawerSlot?: ReactNode
  /** Collection callback to sync optimistic row changes back into the table. */
  onTaskChanged?: (task: import('@/lib/db/tasks.types').TaskListRow) => void
  /** Collection callback to refetch after an archive. */
  onTaskArchived?: (id: string) => void
}

function queryFromLegacySavedView(savedView: LegacySavedView | undefined): TaskCollectionQuery | undefined {
  if (!savedView) return undefined
  const view: TaskCollectionView = savedView.view === 'mine'
    ? 'my-work'
    : savedView.view === 'overdue'
      ? 'overdue'
      : savedView.view === 'followups'
        ? 'followups'
        : 'all'
  return {
    ...TASK_COLLECTION_NEUTRAL_QUERY,
    view,
    overdueOnly: savedView.overdueOnly,
  }
}

function legacyViewFor(view: TaskCollectionView): TasksSavedViewChip | 'all' {
  if (view === 'my-work') return 'mine'
  if (view === 'overdue') return 'overdue'
  if (view === 'followups') return 'followups'
  return 'all'
}

function viewLabel(view: TaskCollectionView, t: ReturnType<typeof useT>): string {
  switch (view) {
    case 'my-work': return t('tasks.saved.mine')
    case 'overdue': return t('tasks.saved.overdue')
    case 'followups': return t('tasks.saved.followups')
    default: return t('tasks.saved.all')
  }
}

export function TasksWorkspace({
  selectedId = null,
  drawerOpen = false,
  expanded = false,
  splitLayout = true,
  statusOverrides,
  refreshKey = 0,
  savedView,
  onSavedViewChange,
  onToggleExpand,
  drawerSlot,
  onTaskChanged,
  onTaskArchived,
}: TasksTableProps) {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const host = useOverlayHost()
  const auth = useAuth()
  const isDesktop = useIsDesktop()
  // DO-17 (census-sweep R2 tasks FINDING2): the global Action Launcher FAB exists whenever the
  // rail is collapsed (<920, useIsNarrow) — so the header create door hides on isNarrow, not
  // !isDesktop (<768), or the 768–919 band shows BOTH doors.
  const isNarrow = useIsNarrow()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : EMPTY_ACCESS_ROLES
  // Block 2(b) (Luna 390 audit): on phone, collapse the View & filters config behind ONE
  // disclosure so the first task card is visible above the fold. Desktop renders it inline.
  const captureFirstMobile = !isDesktop
  const currentSearch = location.search
  const initialQuery = useMemo(() => queryFromLegacySavedView(savedView), [savedView])
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false)

  const controller = useRecordCollection({
    descriptor: taskCollectionDescriptor,
    urlMode: 'synced',
    initialQuery,
    viewerId,
    accessRoles,
  })
  const { state } = controller
  // The engine keeps presentation separate from query for compatibility checks; expose the
  // canonical layout in the domain query consumed by the toolbar/runtime without writing a second
  // query owner.
  const query = useMemo(() => ({ ...state.query, layout: state.presentation }), [state.presentation, state.query])
  const dataContext = state.data?.context
  const projection = state.projection
  const records = projection?.visibleRecords ?? EMPTY_RECORDS
  const runtimeStatusOverrides = statusOverrides ?? EMPTY_STATUS_OVERRIDES

  const refreshStarted = useRef(false)
  useEffect(() => {
    if (!refreshStarted.current) {
      refreshStarted.current = true
      return
    }
    controller.retry()
    // refreshKey is the explicit host-owned create/archive channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  const setQuery = useCallback((patch: Partial<TaskCollectionQuery>) => {
    controller.setQuery({ ...controller.state.query, ...patch })
  }, [controller])

  const handleViewChange = useCallback((view: TaskCollectionView) => {
    setQuery({
      view,
      overdueOnly: view === 'overdue' ? true : view === 'all' ? false : controller.state.query.overdueOnly,
    })
    onSavedViewChange?.(legacyViewFor(view))
  }, [controller.state.query.overdueOnly, onSavedViewChange, setQuery])

  const retry = useCallback(() => controller.retry(), [controller])
  const dueRuns = useDueRuns(retry)

  // D-A1 (item 4): the open Task id lives in the URL as ?record=<id> (addressable/shareable). The
  // collection owns its own query params; the record param rides alongside them, and the shared
  // OverlayHost session (route marker) supplies the focus/Back/leave-guard. This mirrors the Signals
  // archive seam exactly (signals-archive-page.tsx).
  const [params, setParams] = useSearchParams()
  const recordId = taskRouteAdapter.readPanelId(location)
  const hadTaskSession = useRef(false)
  const suppressNextOpen = useRef(false)
  // The record id we last opened a host session for. If the session later closes while ?record=
  // still lingers in the URL (a browser Back / ✕ / Escape pops the marker one render before the
  // query is dropped), this ref tells the open effect "the user closed THIS record — do not
  // resurrect it" so Back truly closes the drawer instead of re-opening it (I2, no dead-end).
  const openedRecordRef = useRef<string | null>(null)

  // The list search minus ?record= — shared by the panel's "Open full page" escalation so the
  // collection's query (view/filter/sort) survives the jump onto the canonical page.
  const pageSearch = useCallback(() => {
    const next = new URLSearchParams(params)
    next.delete('record')
    const s = next.toString()
    return s ? `?${s}` : ''
  }, [params])

  // Collection contract onOpenTask — write ?record= before the host pushes its route marker, so one
  // Back step lands on the prior collection URL (identical to Signals' onOpenRecord).
  const onOpenTask = useCallback((taskId: string) => {
    const next = new URLSearchParams(params)
    next.set('record', taskId)
    setParams(next)
  }, [params, setParams])

  const taskEntry = useMemo<OverlayEntry | null>(() => {
    if (!recordId) return null
    const pageTo = { pathname: `/work/tasks/${recordId}`, search: pageSearch() }
    // Record-scoped "Ask Deputy" seed: the loaded row carries the task title, so the composer opens
    // with "About Task: <title>". Falls back to the generic record noun if the row isn't loaded.
    const taskTitle = controller.state.data?.records.find((r) => r.id === recordId)?.title?.trim()
    const entry: OverlayEntry = {
      key: `task:${recordId}`,
      owner: 'tasks' as const,
      tenant: 'record' as const,
      label: t('tasks.detail.title'),
      title: t('tasks.detail.title'),
      actions: (
        <AskDeputyAction
          draft={t('assistant.askAbout.task', { title: taskTitle || t('tasks.detail.title') })}
        />
      ),
      pageTo,
      pageState: { taskSurface: 'page' },
      content: null,
    }
    entry.content = (
      <TaskOverlayContent
        taskId={recordId}
        onClose={() => { void host.close() }}
        onOpenPage={() => { void host.openPage(pageTo, entry.pageState) }}
        onTaskChanged={onTaskChanged}
        onTaskArchived={onTaskArchived}
        onLeaveGuardChange={(guard) => { entry.leaveGuard = guard }}
      />
    )
    return entry
  }, [recordId, pageSearch, controller.state.data, host, onTaskArchived, onTaskChanged, t])

  // Open (or restore, on hard-load/refresh of ?record=) the record through the shared host. Route
  // mode so the marker is a real history step: Browser Back closes the panel, refresh restores it.
  useEffect(() => {
    if (!taskEntry) {
      openedRecordRef.current = null
      suppressNextOpen.current = false
      return
    }
    if (suppressNextOpen.current) return
    const active = host.session?.frames.at(-1)?.entry
    if (active?.key === taskEntry.key) return
    // A genuine browser Back / ✕ / Escape pops the marker one render before the clear effect drops
    // ?record=: the session is gone but recordId still lingers. If we ALREADY had a stably-open
    // session for this record (hadTaskSession), the user closed it — let the clear effect finish
    // and do NOT resurrect it, so Back truly closes the drawer (I2, no dead-end). The guard is
    // scoped to hadTaskSession so it does not swallow the legitimate re-open after the initial
    // hard-load/refresh POP (MemoryRouter/boot reports the first navigation as POP, which closes
    // the just-opened session before its marker lands) — that restore path must still re-open.
    if (!active && openedRecordRef.current === recordId && hadTaskSession.current) return
    const hasTaskSession = host.session?.frames.some((frame) => frame.entry.owner === 'tasks')
    openedRecordRef.current = recordId
    // DO-18: `onOpenTask` already PUSHed the record's ?record= URL entry, so the host stamps its
    // depth-0 marker onto that SAME entry (replaceMarker) rather than pushing a duplicate. One
    // history step per open means an explicit ✕/Escape close's single -1 pop lands on the clean
    // collection URL — not a lingering ?record= entry that the open effect would resurrect. A
    // hard-load/refresh restore also stamps onto the already-present ?record= entry (no extra step).
    void (hasTaskSession ? host.replaceRoot(taskEntry) : host.openRoot(taskEntry, 'route', true))
  }, [host, taskEntry, recordId])

  // When the host session closes (explicit close, or a browser POP the host owns), drop the
  // ?record= query without adding a second history step. The ref stops the open effect from
  // clearing its own freshly-set record. Mirrors signals-archive-page.tsx.
  const taskSessionActive = host.session?.frames.some((frame) => frame.entry.owner === 'tasks') ?? false
  useEffect(() => {
    if (taskSessionActive) {
      hadTaskSession.current = true
      return
    }
    if (!hadTaskSession.current || !recordId) return
    if (suppressNextOpen.current) return
    hadTaskSession.current = false
    const next = new URLSearchParams(params)
    next.delete('record')
    setParams(next, { replace: true })
  }, [params, recordId, setParams, taskSessionActive])
  // Inline title edit (E7 collection promise) — persists through the SAME updateTaskFields path the
  // record editor uses (task-surface handleUpdateField). Rejects (no viewer, or a failed write) so
  // TaskRow's useInlineCommit rolls the row back optimistically. The edited title lives in the row's
  // own draft; the status-only onTaskChanged override channel is untouched (title is not part of it).
  const onEditTitle = useCallback(async (taskId: string, title: string) => {
    if (!viewerId) throw new Error('inline title edit requires an authenticated viewer')
    await updateTaskFields(taskId, { title }, viewerId)
  }, [viewerId])
  const onCloseDrawer = useCallback(() => {
    if (host.session?.frames.some((frame) => frame.entry.owner === 'tasks')) {
      void host.close()
      return
    }
    if (drawerOpen) navigate({ pathname: '/work/tasks', search: currentSearch })
  }, [currentSearch, drawerOpen, host, navigate])
  const onNewTask = useCallback(() => {
    navigate({ pathname: '/work/tasks/new', search: currentSearch })
  }, [currentSearch, navigate])
  const onAddTask = useCallback((prefillParam: string) => {
    const params = new URLSearchParams(currentSearch)
    if (prefillParam) {
      const prefill = new URLSearchParams(prefillParam)
      prefill.forEach((value, key) => params.set(key, value))
    }
    const search = params.toString()
    navigate({ pathname: '/work/tasks/new', search: search ? `?${search}` : '' })
  }, [currentSearch, navigate])
  const onClearFilters = useCallback(() => {
    setQuery({
      q: '', businessUnitId: null, status: null, picId: null, supervisorId: null, personId: null,
      overdueOnly: false, includeArchived: false, view: query.view === 'overdue' ? 'all' : query.view,
    })
  }, [query.view, setQuery])
  const onSort = useCallback((sort: TaskCollectionSort) => {
    const direction = query.sort === sort
      ? query.direction === 'ascending' ? 'descending' : 'ascending'
      : 'ascending'
    setQuery({ sort, direction })
  }, [query.direction, query.sort, setQuery])

  const recordsForStats = useMemo(
    () => records.map((record) => ({ ...record, status: runtimeStatusOverrides.get(record.id) ?? record.status })),
    [records, runtimeStatusOverrides],
  )
  const stats: TasksTableStats = state.status === 'error' || state.status === 'loading'
    ? null
    : {
        total: recordsForStats.length,
        blocked: recordsForStats.filter((record) => record.status === 'Blocked').length,
        overdue: recordsForStats.filter((record) => record.status !== 'Done' && record.archivedAt === null && record.dueDate !== null && record.dueDate < new Date().toISOString().slice(0, 10)).length,
      }
  const hasRows = projection !== null && projection.visibleRecords.length > 0
  // Census R2 DO-6 (follow-ups F1/F2): on the Follow-ups view the loaded records are TASKS, so any
  // count derived from `stats` mislabels tasks as follow-up scope ("11 items in your scope" above a
  // coming-soon body). While the view is the reserved placeholder the toolbar also drops every
  // row-operating control (search / View & filters / Table-Card) — dead controls above a
  // placeholder teach people the surface is broken. When SHOW_FOLLOWUPS lands, the live queue
  // (FollowUpQueueEmbed) owns its own count; `stats.total` stays wrong for this view either way.
  const followupsView = query.view === 'followups'
  const reservedFollowups = followupsView && !SHOW_FOLLOWUPS
  // Block 2(d) (Luna 390 audit): the header "+ Create task" is the DESKTOP create door; on phone
  // the single create door is the global + Action Launcher FAB (DESIGN.md No-FAB Rule / one
  // launcher location app-wide) — hide the header button at phone width to kill the duplicate door.
  // DO-17: the FAB renders whenever the rail is collapsed (<920), so the gate is !isNarrow — the
  // 768–919 band must never show both doors.
  const showNewTask = !drawerOpen && state.status === 'ready' && hasRows && query.view !== 'followups' && !isNarrow
  const frameState: PageFamilyState = state.status === 'ready' ? 'default' : state.status
  const emptyTitle = query.includeArchived
    ? t('tasks.empty.archivedTitle')
    : query.view === 'my-work'
      ? t('tasks.empty.mineTitle')
      : t('tasks.empty.noTasksTitle')
  const emptyCopy = query.includeArchived
    ? t('tasks.empty.archivedCopy')
    : query.view === 'my-work'
      ? t('tasks.empty.mineCopy')
      : t('tasks.empty.noTasksCopy')

  const personOptions = dataContext?.people ?? []
  const buOptions = dataContext?.businessUnits ?? []
  const tasksToolbar = (
    <TasksToolbar
      query={query}
      onQueryChange={setQuery}
      onViewChange={handleViewChange}
      overdueCount={stats?.overdue ?? 0}
      onOverdueFilter={() => setQuery({ overdueOnly: true })}
      onClearOverdue={() => setQuery({ overdueOnly: false })}
      buOptions={buOptions}
      personOptions={personOptions}
      onPresentationChange={(next) => { controller.switchPresentation(next) }}
      dueRuns={dueRuns}
      reserved={reservedFollowups}
      savedViews={{
        label: t('tasks.savedViews'),
        selectedId: state.savedViews.items.find((item) => item.id === query.savedViewId)?.id ?? null,
        operation: state.savedViews.operation,
        items: state.savedViews.items.map((item) => ({ id: item.id, name: item.name })),
        onLoad: () => { void controller.loadSavedViews() },
        onApply: async (id) => { await controller.applySavedView(id) },
        onSave: async (name) => { await controller.saveCurrentView(name, 'private') },
      }}
    />
  )

  const runtime: TaskCollectionRuntime = useMemo(() => ({
    selectedId: host.session?.frames.at(-1)?.entry.owner === 'tasks'
      ? host.session.frames.at(-1)?.entry.key.replace(/^task:/, '') ?? selectedId
      : selectedId,
    drawerOpen: drawerOpen || host.session?.frames.at(-1)?.entry.owner === 'tasks',
    expanded,
    splitLayout,
    isDesktop,
    recordSearch: currentSearch,
    statusOverrides: runtimeStatusOverrides,
    onOpenTask,
    onEditTitle,
    onCloseDrawer,
    onNewTask,
    onToggleExpand: onToggleExpand ?? (() => {}),
    onAddTask,
    onRetry: retry,
    onClearFilters,
    onSort,
    onOverdueFilter: () => setQuery({ overdueOnly: true }),
      onClearOverdue: () => setQuery({ overdueOnly: false }),
    createHref: { pathname: '/work/tasks/new', search: currentSearch },
    dueRuns,
    followups: query.view === 'followups',
    followupsEnabled: SHOW_FOLLOWUPS,
    canResolvePending: can(accessRoles, 'process.start'),
  }), [
    accessRoles, currentSearch, drawerOpen, dueRuns, expanded, host.session, isDesktop, onAddTask,
    onCloseDrawer, onEditTitle, onNewTask, onOpenTask, onToggleExpand, onClearFilters, onSort,
    query.view, retry, runtimeStatusOverrides, selectedId, setQuery, splitLayout,
  ])

  // DO-6: the reserved view keeps only the view chips, so the phone "View & filters" outer
  // disclosure (whose whole content is now just those chips) would be a door hiding the only
  // way out — render the chips directly instead.
  const controls = captureFirstMobile && !reservedFollowups ? (
      <ViewOptionsDisclosure
      open={mobileOptionsOpen}
      onToggle={() => setMobileOptionsOpen((open) => !open)}
      label={t('tasks.viewAndFilters')}
      summary={viewLabel(query.view, t)}
      panelId="mobile-task-options-panel"
      className="mobile-task-options"
      triggerClassName="mobile-task-options-trigger"
      summaryClassName="mobile-task-options-summary"
      chevronClassName="mobile-task-options-chevron"
      panelClassName="mobile-task-options-panel"
    >
      {tasksToolbar}
    </ViewOptionsDisclosure>
  ) : tasksToolbar

  return (
    <PageFamilyFrame
      family="workspace"
      title={t('tasks.title')}
      jobSentence={t('job.tasks')}
      state={frameState}
      action={showNewTask ? (
        <Link to={{ pathname: '/work/tasks/new', search: currentSearch }} className="btn btn-primary">{t('tasks.new')}</Link>
      ) : undefined}
      meta={
        // R2 (owner review r2): ONE muted meta sentence in the E7 grammar — "14 tasks · 2 blocked",
        // a single font size (the body token). Replaces the superscript count pill + a differently
        // sized "blocked" fragment (the "size soup" the owner flagged). Live counts; blocked only
        // when >0; "—" while loading/error (AC-M2). The count also lives in the result-header inside
        // the card, so dropping the page-head pill loses no information.
        <span data-testid="tasks-count-line" className="ch-meta-line tabular-nums">
          {stats === null || followupsView
            ? '—'
            : [
                t('tasks.meta.taskCount', { count: stats.total }),
                stats.blocked > 0 ? t('tasks.filter.blockedCount', { count: stats.blocked }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </span>
      }
    >
      <div className={`split${(drawerOpen || host.session?.frames.at(-1)?.entry.owner === 'tasks') ? (expanded ? ' expanded' : '') : ' nodrawer'}`}>
        <section className={`assembly record-collection-view record-collection-view--${controller.state.presentation}${drawerOpen && !expanded && splitLayout ? ' condensed' : ''}`} aria-label={t('tasks.title')}>
          <TaskCollectionRuntimeProvider value={runtime}>
            <RecordCollectionSurface
              controller={controller}
              resultHeader={{
                collectionLabel: t('tasks.title'),
                viewLabel: viewLabel(query.view, t),
                // DO-6: the Follow-ups view never shows the task-count — null renders the honest
                // "—" placeholder instead of mislabeling tasks as follow-up scope.
                count: stats === null || followupsView ? null : stats.total,
              }}
              controls={controls}
              empty={{
                title: emptyTitle,
                copy: emptyCopy,
                create: query.view === 'followups' && SHOW_FOLLOWUPS
                  ? <FollowUpQueueEmbed />
                  : <Link to={{ pathname: '/work/tasks/new', search: currentSearch }} className="btn btn-primary">{t('tasks.new')}</Link>,
              }}
              filteredEmpty={{
                title: t('tasks.empty.filteredTitle'),
                copy: t('tasks.empty.filteredCopy'),
                clear: onClearFilters,
                create: <Link to={{ pathname: '/work/tasks/new', search: currentSearch }} className="btn btn-primary">{t('tasks.new')}</Link>,
              }}
              error={{ message: t('tasks.error.load'), retry }}
              loadingLabel={t('tasks.loading')}
            />
            {/* The due-runs list renders AFTER the surface (table stays first content) and, unlike
                the presentation, on EVERY state — a capable viewer with due work but zero tasks yet
                must still be able to expand and start a run. */}
            <DueRunsList
              due={dueRuns.due}
              expanded={dueRuns.expanded}
              startingKey={dueRuns.startingKey}
              startError={dueRuns.startError}
              onStart={dueRuns.handleStart}
            />
          </TaskCollectionRuntimeProvider>
        </section>
        {drawerOpen && drawerSlot}
        {/* One physical host grammar for Task records. The collection owns ?record= query state;
            OverlayHostSlot owns panel geometry, focus, Back, Escape, and canonical promotion. The
            ?record= query is dropped by the session-tracking effect above whenever the host session
            closes (explicit close or a browser POP), so no onClose override is needed here. */}
        <OverlayHostSlot owner="tasks" />
      </div>
    </PageFamilyFrame>
  )
}
