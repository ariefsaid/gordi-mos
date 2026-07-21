import './TasksWorkspace.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import type { PageFamilyState } from '@/shell/page-families'
import { ViewOptionsDisclosure } from '@/shell/view-options-disclosure'
import { useT } from '@/i18n/use-t'
import { useDueRuns } from '@/components/processes/use-due-runs'
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
  TaskCollectionChrome,
  type TaskCollectionRuntime,
} from './task-collection-presentation'
import type { TaskStatus } from '@/lib/db/tasks.types'

type TasksSavedViewChip = 'mine' | 'team' | 'overdue' | 'followups'
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
}

function queryFromLegacySavedView(savedView: LegacySavedView | undefined): TaskCollectionQuery | undefined {
  if (!savedView) return undefined
  const view: TaskCollectionView = savedView.view === 'mine'
    ? 'my-work'
    : savedView.view === 'team'
      ? 'team'
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
  if (view === 'team') return 'team'
  return 'all'
}

function viewLabel(view: TaskCollectionView, t: ReturnType<typeof useT>): string {
  switch (view) {
    case 'my-work': return t('tasks.saved.mine')
    case 'team': return t('tasks.saved.team')
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
}: TasksTableProps) {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const isDesktop = useIsDesktop()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : EMPTY_ACCESS_ROLES
  const isManager = auth.status === 'authenticated' && auth.viewer.isManager
  const captureFirstMobile = !isDesktop && !isManager
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
      overdueOnly: view === 'overdue' ? true : view === 'all' || view === 'team' ? false : controller.state.query.overdueOnly,
    })
    onSavedViewChange?.(legacyViewFor(view))
  }, [controller.state.query.overdueOnly, onSavedViewChange, setQuery])

  const retry = useCallback(() => controller.retry(), [controller])
  const dueRuns = useDueRuns(retry)
  const onOpenTask = useCallback((taskId: string) => {
    navigate({ pathname: `/work/tasks/${taskId}`, search: currentSearch }, { state: { taskSurface: 'panel' } })
  }, [currentSearch, navigate])
  const onCloseDrawer = useCallback(() => {
    if (drawerOpen) navigate({ pathname: '/work/tasks', search: currentSearch })
  }, [currentSearch, drawerOpen, navigate])
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
      q: '', businessUnitId: null, status: null, picId: null, supervisorId: null,
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
  const showNewTask = !drawerOpen && state.status === 'ready' && hasRows && query.view !== 'followups'
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
    selectedId,
    drawerOpen,
    expanded,
    splitLayout,
    isDesktop,
    recordSearch: currentSearch,
    statusOverrides: runtimeStatusOverrides,
    onOpenTask,
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
    accessRoles, currentSearch, drawerOpen, dueRuns, expanded, isDesktop, onAddTask,
    onCloseDrawer, onNewTask, onOpenTask, onToggleExpand, onClearFilters, onSort,
    query.view, retry, runtimeStatusOverrides, selectedId, setQuery, splitLayout,
  ])

  const controls = captureFirstMobile ? (
      <ViewOptionsDisclosure
      open={mobileOptionsOpen}
      onToggle={() => setMobileOptionsOpen((open) => !open)}
      label={t('tasks.viewOptions')}
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
      count={stats?.total ?? null}
      action={showNewTask ? (
        <Link to={{ pathname: '/work/tasks/new', search: currentSearch }} className="btn btn-primary">{t('tasks.new')}</Link>
      ) : undefined}
      meta={
        <span data-testid="tasks-count-line" className="ch-submeta tabular-nums">
          {stats === null ? '—' : stats.blocked > 0 ? t('tasks.filter.blockedCount', { count: stats.blocked }) : null}
        </span>
      }
    >
      <div className={`split${drawerOpen ? (expanded ? ' expanded' : '') : ' nodrawer'}`}>
        <section className={`assembly${drawerOpen && !expanded && splitLayout ? ' condensed' : ''}`} aria-label={t('tasks.title')}>
          <TaskCollectionRuntimeProvider value={runtime}>
            <RecordCollectionSurface
              controller={controller}
              controls={
                <>
                  {controls}
                  <TaskCollectionChrome dueRuns={dueRuns} />
                </>
              }
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
          </TaskCollectionRuntimeProvider>
        </section>
        {drawerOpen && drawerSlot}
      </div>
    </PageFamilyFrame>
  )
}
