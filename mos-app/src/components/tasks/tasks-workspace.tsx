import './TasksWorkspace.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { To } from 'react-router-dom'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsNarrow } from '@/shell/use-is-narrow'
import { useAuth } from '@/auth/use-auth'
import { can } from '@/lib/capabilities'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { collectionDisclosureSummary } from '@/lib/record-collection/disclosure-summary'
import { useSetCollectionLeaf } from '@/shell/breadcrumb-title'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import { HelpTip } from '@/components/ui/help-tip'
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
import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import { createTask, updateTaskFields, updateTaskStatus } from '@/lib/db/tasks'
import { linkSignalTask } from '@/lib/db/signals'
import { TaskOverlayContent } from './task-drawer'
import { AskDeputyAction } from '@/components/records/ask-deputy-action'
import type { OverlayEntry, OverlayHostApi } from '@/shell/overlay-host'
import { getActiveTaskView } from './task-collection-view'

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
// The one page-state literal for a Task's canonical surface — the entry carries it, and both
// promotion doors send it, so "which surface am I on" cannot drift between them.
const TASK_PAGE_STATE = { taskSurface: 'page' } as const

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

export type TasksTableStats = { total: number; open: number; blocked: number; overdue: number } | null

export type TasksTableProps = {
  /** Legacy test/embedding bridge. Production TasksLayout now derives this from the typed URL query. */
  savedView?: LegacySavedView
  onSavedViewChange?: (next: TasksSavedViewChip | 'all') => void
  selectedId?: string | null
  drawerOpen?: boolean
  splitLayout?: boolean
  statusOverrides?: Map<string, TaskStatus>
  refreshKey?: number
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

// #573 rebase note: the door summary's base is the ONE collection-query label (activeView),
// never a second view→label map — a fourth disagreeing render is the defect this branch kills.
function taskDisclosureSummary(
  query: TaskCollectionQuery,
  t: ReturnType<typeof useT>,
  base: string,
): { summary: string; hasActiveFilters: boolean } {
  const common = collectionDisclosureSummary({
    query,
    neutralQuery: TASK_COLLECTION_NEUTRAL_QUERY,
    excludedKeys: ['layout', 'groupBy', 'sort', 'direction'],
    base,
    // my-pic/my-supervisor light this dot (view !== 'all') even though getActiveTaskView treats
    // them as the default breadcrumb state (no leaf pushed) — intended: on the door they ARE
    // filters on top of the base view, not a saved view of their own.
    hasNonDefaultView: query.view !== 'all',
    filterLabel: (currentQuery) => currentQuery.overdueOnly ? t('tasks.saved.overdue')
      : currentQuery.status ? t('tasks.filter.status')
        : currentQuery.businessUnitId ? t('tasks.filter.businessUnit')
          : currentQuery.picId || currentQuery.supervisorId || currentQuery.personId ? t('tasks.filter.person')
            : currentQuery.occurrenceId ? t('tasks.filter.occurrence')
              : currentQuery.q.trim() ? t('tasks.filter.search')
                : currentQuery.includeArchived ? t('tasks.filter.showArchived')
                  : currentQuery.savedViewId ? t('common.savedView')
                    : undefined,
  })
  return common
}

export function TasksWorkspace({
  selectedId = null,
  drawerOpen = false,
  splitLayout = true,
  statusOverrides,
  refreshKey = 0,
  savedView,
  onSavedViewChange,
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
  const [draftTask, setDraftTask] = useState<TaskListRow | null>(null)
  const [draftLinkError, setDraftLinkError] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const draftSourceSignalRef = useRef<string | null>(new URLSearchParams(location.search).get('sourceSignal'))
  const createdDraftTaskRef = useRef<string | null>(null)
  const draftTitleRef = useRef('')
  const createControlRef = useRef<HTMLElement | null>(null)
  const returnFocusAfterDiscard = useRef(false)

  const controller = useRecordCollection({
    descriptor: taskCollectionDescriptor,
    urlMode: 'synced',
    initialQuery,
    isDesktop,
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

  const activeView = getActiveTaskView({
    query: state.query,
    savedViews: state.savedViews.items,
    labels: {
      all: t('tasks.saved.all'),
      'my-work': t('tasks.saved.mine'),
      overdue: t('tasks.saved.overdue'),
      followups: t('tasks.saved.followups'),
    },
  })
  useSetCollectionLeaf({
    label: activeView.label,
    hasNonDefaultView: activeView.hasNonDefaultView,
  })

  const handleViewChange = useCallback((view: TaskCollectionView) => {
    setQuery({
      view,
      savedViewId: null,
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
  const createIntentRef = useRef(new URLSearchParams(location.search).get('create') === '1')
  const recordId = taskRouteAdapter.readPanelId(location)
  const hadTaskSession = useRef(false)
  const suppressNextOpen = useRef(false)
  // The record id we last opened a host session for. If the session later closes while ?record=
  // still lingers in the URL (a browser Back / ✕ / Escape pops the marker one render before the
  // query is dropped), this ref tells the open effect "the user closed THIS record — do not
  // resurrect it" so Back truly closes the drawer instead of re-opening it (I2, no dead-end).
  const openedRecordRef = useRef<string | null>(null)

  // Canonical promotion (#373), from EITHER door — the record content's own "Open full page" and
  // the host chrome's button both land here, so the flag sequence and the page state exist once.
  // The collection's cleanup effect must not remove ?record= while the host swaps the overlay for
  // the canonical record page; a denied dirty-leave clears the flag again so the still-mounted
  // drawer stays addressable. On a GRANTED promotion the flag deliberately stays raised: the
  // workspace survives the navigation, and lowering it here would re-arm the cleanup effect
  // against a route that is still settling. `onOpenTask` lowers it on the next explicit open,
  // which is the only moment a stale flag could matter.
  const promoteToPage = useCallback(async (to: To, openPage: OverlayHostApi['openPage']) => {
    suppressNextOpen.current = true
    const result = await openPage(to, TASK_PAGE_STATE)
    if (result.status === 'denied') suppressNextOpen.current = false
  }, [])

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
    if (!splitLayout) {
      const next = new URLSearchParams(params)
      next.delete('record')
      const search = next.toString()
      navigate({ pathname: `/work/tasks/${taskId}`, search: search ? `?${search}` : '' }, { state: { taskSurface: 'page' } })
      return
    }
    // An explicit open is the user's intent, so it clears every "this record is closing" memory
    // the guards below keep. Those guards exist to stop an AUTOMATIC resurrection of a record the
    // user just closed — they must never outlive the close itself. A browser Back drops the host
    // marker and ?record= in the SAME render, so the clear effect returns early on the missing
    // record and both memories survive: without this reset the next click on that very row was
    // swallowed in silence, and the one after it lost ?record= again (PR #394 review, blocking 3).
    // `hadTaskSession` is re-armed the moment the new session opens.
    openedRecordRef.current = null
    suppressNextOpen.current = false
    hadTaskSession.current = false
    const next = new URLSearchParams(params)
    next.set('record', taskId)
    setParams(next)
  }, [navigate, params, setParams, splitLayout])

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
      pageState: TASK_PAGE_STATE,
      content: null,
    }
    entry.content = (
      <TaskOverlayContent
        taskId={recordId}
        onClose={() => { void host.close() }}
        onOpenPage={() => { void promoteToPage(pageTo, host.openPage) }}
        onTaskChanged={onTaskChanged}
        onTaskArchived={onTaskArchived}
        onLeaveGuardChange={(guard) => { entry.leaveGuard = guard }}
      />
    )
    return entry
  }, [recordId, pageSearch, controller.state.data, host, onTaskArchived, onTaskChanged, promoteToPage, t])

  // Open (or restore, on hard-load/refresh of ?record=) the record through the shared host. Route
  // mode so the marker is a real history step: Browser Back closes the panel, refresh restores it.
  useEffect(() => {
    if (!taskEntry) {
      // No reset here (#374): during a guarded browser POP the route marker and the task entry
      // both disappear for a render before the host replays the decision, and forgetting the
      // identity let the replayed ?record= resurrect the drawer after Discard. The identity is
      // cleared by an explicit `onOpenTask` instead, so a real re-open is never swallowed.
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
  const onEditStatus = useCallback(async (taskId: string, status: TaskStatus) => {
    const current = records.find((record) => record.id === taskId)?.status
    if (!viewerId || !current || current === status) return
    await updateTaskStatus(taskId, current, status, viewerId)
    controller.retry()
  }, [controller, records, viewerId])
  const onEditDue = useCallback(async (taskId: string, dueDate: string | null) => {
    if (!viewerId) throw new Error('inline due edit requires an authenticated viewer')
    await updateTaskFields(taskId, { due_date: dueDate }, viewerId)
    controller.retry()
  }, [controller, viewerId])
  const onEditPic = useCallback(async (taskId: string, personId: string) => {
    if (!viewerId) throw new Error('inline PIC edit requires an authenticated viewer')
    await updateTaskFields(taskId, { responsible_person_id: personId }, viewerId)
    controller.retry()
  }, [controller, viewerId])
  const onEditTitle = useCallback(async (taskId: string, title: string) => {
    if (draftTask?.id === taskId) {
      if (!viewerId) throw new Error('inline task creation requires an authenticated viewer')
      draftTitleRef.current = title
      const existingTaskId = createdDraftTaskRef.current
      const createdTaskId = existingTaskId ?? await createTask({
        title,
        businessUnitId: draftTask.business_unit_id,
        responsiblePersonId: draftTask.responsible_person_id,
        accountablePersonId: draftTask.accountable_person_id,
        createdBy: viewerId,
      })
      createdDraftTaskRef.current = createdTaskId
      if (existingTaskId) await updateTaskFields(createdTaskId, { title }, viewerId)
      if (draftSourceSignalRef.current) {
        try {
          await linkSignalTask(draftSourceSignalRef.current, createdTaskId)
          draftSourceSignalRef.current = null
          setDraftLinkError(false)
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === '23505') {
            draftSourceSignalRef.current = null
            setDraftLinkError(false)
          } else {
            setDraftLinkError(true)
            setAnnouncement(t('tasks.create.linkFailed'))
            return
          }
        }
      }
      createdDraftTaskRef.current = null
      setDraftTask(null)
      controller.retry()
      return
    }
    if (!viewerId) throw new Error('inline title edit requires an authenticated viewer')
    await updateTaskFields(taskId, { title }, viewerId)
  }, [controller, draftTask, t, viewerId])
  const onRetryDraftLink = useCallback(() => {
    if (!draftTask) return
    void onEditTitle(draftTask.id, draftTitleRef.current || draftTask.title)
  }, [draftTask, onEditTitle])
  const onDiscardNewTask = useCallback(() => {
    returnFocusAfterDiscard.current = true
    if (createdDraftTaskRef.current && draftSourceSignalRef.current) {
      setAnnouncement(t('tasks.create.linkFailedDiscard'))
    }
    draftSourceSignalRef.current = null
    createdDraftTaskRef.current = null
    draftTitleRef.current = ''
    setDraftLinkError(false)
    setDraftTask(null)
  }, [t])
  useEffect(() => {
    if (draftTask || !returnFocusAfterDiscard.current) return
    returnFocusAfterDiscard.current = false
    createControlRef.current?.focus()
  }, [draftTask])
  const onCloseDrawer = useCallback(() => {
    if (host.session?.frames.some((frame) => frame.entry.owner === 'tasks')) {
      void host.close()
      return
    }
    if (drawerOpen) navigate({ pathname: '/work/tasks', search: currentSearch })
  }, [currentSearch, drawerOpen, host, navigate])
  const onNewTask = useCallback((prefillParam = '') => {
    if (!dataContext || draftTask) return
    setDraftLinkError(false)
    setAnnouncement('')
    createdDraftTaskRef.current = null
    draftTitleRef.current = ''
    const firstPerson = dataContext.people[0]?.id ?? viewerId ?? ''
    const prefill = new URLSearchParams(prefillParam)
    draftSourceSignalRef.current = params.get('sourceSignal') ?? draftSourceSignalRef.current
    const now = new Date().toISOString()
    setDraftTask({
      id: `new-task-${Date.now()}`,
      org_id: '', title: prefill.get('title') ?? params.get('createTitle') ?? '', business_unit_id: prefill.get('bu') ?? params.get('createBu') ?? query.businessUnitId ?? dataContext.businessUnits[0]?.id ?? '',
      status: query.status ?? 'Open', responsible_person_id: prefill.get('r') ?? params.get('createPic') ?? query.picId ?? viewerId ?? firstPerson,
      accountable_person_id: query.supervisorId ?? viewerId ?? firstPerson, consulted_person_ids: [], informed_person_ids: [],
      description: null, due_date: null, objective_id: null, work_line_id: null,
      last_activity_at: now, archived_at: null, created_by: viewerId ?? '',
      created_at: now, updated_at: now, process_run_id: null, generated_from_task_def_id: null,
    })
  }, [dataContext, draftTask, params, query.businessUnitId, query.picId, query.status, query.supervisorId, viewerId])
  const onAddTask = useCallback((prefillParam: string) => onNewTask(prefillParam), [onNewTask])
  useEffect(() => {
    if ((!createIntentRef.current && params.get('create') !== '1') || !dataContext) return
    if (!draftTask) {
      onNewTask()
      return
    }
    createIntentRef.current = false
    const next = new URLSearchParams(params)
    for (const key of ['create', 'createTitle', 'createBu', 'createPic', 'sourceSignal']) next.delete(key)
    setParams(next, { replace: true })
  }, [dataContext, draftTask, onNewTask, params, setParams])
  // H3 fix (owner review r2 gap — "Clear filters" didn't persist past reload): the shared
  // RecordCollection engine's URL sync (useRecordCollection's effect, via
  // lib/record-collection/query-state.ts writeCollectionQuery) infers which URL keys a query
  // "owns" by re-serializing the NEUTRAL query and diffing its keys — but serializeTaskQuery
  // (task-collection-adapter.tsx) deliberately OMITS every field that already equals its neutral
  // value (clean canonical URLs: `if (query.q) p.set('q', …)` etc.), so serializing the neutral
  // query itself always yields an EMPTY key set. A key that was populated and is now cleared back
  // to neutral therefore never appears in the inferred "keys to delete" set — the visible state
  // clears correctly (state.query is right, the table re-renders empty-filtered), but the stale
  // `?q=…`/`&bu=…`/etc param is never removed from the URL, so a reload re-parses it and restores
  // the filters the user just cleared. Rather than widen the shared engine's diffing for every
  // RecordCollection consumer in this pass, strip the exact Task filter URL keys locally.
  const onClearFilters = useCallback(() => {
    const nextView = query.view === 'overdue' ? 'all' : query.view
    setQuery({
      q: '', businessUnitId: null, status: null, picId: null, supervisorId: null, personId: null,
      overdueOnly: false, includeArchived: false, view: nextView,
    })
    const next = new URLSearchParams(params)
    for (const key of ['q', 'bu', 'status', 'pic', 'supervisor', 'person', 'overdue', 'archived']) {
      next.delete(key)
    }
    if (nextView === 'all') next.delete('view')
    setParams(next, { replace: true })
  }, [params, query.view, setParams, setQuery])
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
        // OD-REDESIGN-91 #17: "open" mirrors the rail badge's open-count definition
        // (lib/db/rail-counts: not archived AND not Done) so the head and the rail agree.
        open: recordsForStats.filter((record) => record.status !== 'Done' && record.archivedAt === null).length,
        blocked: recordsForStats.filter((record) => record.status === 'Blocked').length,
        overdue: recordsForStats.filter((record) => record.status !== 'Done' && record.archivedAt === null && record.dueDate !== null && record.dueDate < new Date().toISOString().slice(0, 10)).length,
      }
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
  const showNewTask = !drawerOpen && state.status === 'ready' && query.view !== 'followups' && !isNarrow
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
      onFieldToggle={(field, visible) => {
        const next = visible
          ? [...new Set([...query.visibleFields, field as TaskCollectionQuery['visibleFields'][number]])]
          : query.visibleFields.filter((candidate) => candidate !== field)
        setQuery({ visibleFields: next })
      }}
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
        selectedId: activeView.savedViewId,
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
    splitLayout,
    isDesktop,
    recordSearch: currentSearch,
    statusOverrides: runtimeStatusOverrides,
    onOpenTask,
    onEditTitle,
    onEditStatus,
    onEditDue,
    onEditPic,
    draftTask,
    onDiscardNewTask,
    draftLinkError,
    onRetryDraftLink,
    onCloseDrawer,
    onNewTask,
    onAddTask,
    onRetry: retry,
    onClearFilters,
    onSort,
    onOverdueFilter: () => setQuery({ overdueOnly: true }),
      onClearOverdue: () => setQuery({ overdueOnly: false }),
    createHref: (() => {
      const next = new URLSearchParams(params)
      next.set('create', '1')
      return { pathname: '/work/tasks', search: `?${next.toString()}` }
    })(),
    dueRuns,
    followups: query.view === 'followups',
    followupsEnabled: SHOW_FOLLOWUPS,
    canResolvePending: can(accessRoles, 'process.start'),
  }), [
    accessRoles, currentSearch, drawerOpen, draftTask, dueRuns, host.session, isDesktop, onAddTask,
    params,
    onCloseDrawer, onDiscardNewTask, onEditTitle, onEditStatus, onEditDue, onEditPic, onNewTask, onOpenTask, onClearFilters, onSort,
    query.view, retry, runtimeStatusOverrides, selectedId, setQuery, splitLayout, draftLinkError, onRetryDraftLink,
  ])

  // DO-6: the reserved view keeps only the view chips, so the phone "View & filters" outer
  // disclosure (whose whole content is now just those chips) would be a door hiding the only
  // way out — render the chips directly instead.
  const taskDisclosure = taskDisclosureSummary(query, t, activeView.label)
  const controls = captureFirstMobile && !reservedFollowups ? (
      <ViewOptionsDisclosure
      open={mobileOptionsOpen}
      onToggle={() => setMobileOptionsOpen((open) => !open)}
      onClose={() => setMobileOptionsOpen(false)}
      label={t('tasks.viewAndFilters')}
      summary={taskDisclosure.summary}
      hasActiveFilters={taskDisclosure.hasActiveFilters}
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
        <button ref={(node) => { createControlRef.current = node }} type="button" className="btn btn-primary" onClick={() => onNewTask()}>{t('tasks.new')}</button>
      ) : undefined}
      meta={
        // OD-REDESIGN-91 #17 (F2): counts are OPEN everywhere — the head meta reads
        // "9 open · 11 total" (the rail badge already carries the open-count; the head now
        // agrees). ONE muted meta sentence in the E7 grammar, a single font size (the body
        // token), every number followed by its noun (the naked-numbers guard). Live counts;
        // "—" while loading/error or on the Follow-ups placeholder view (AC-M2).
        // onboard (2026-07-28): PIC vs Supervisor and what a saved view IS are the two things
        // new leads reliably ask about this surface; neither was explained anywhere in the app.
        // The tip is a SIBLING of the count line, never inside it — nesting it made the "?"
        // glyph part of `tasks-count-line`'s textContent, so the meta read "? 2 open · 3 total".
        // Tailwind utilities, not a new class: `.ch-meta-line`'s own rule is a descendant
        // selector (`.content-header .ch-meta-line`), so it survives this extra wrapper, and
        // the shell stylesheet that owns it stays untouched.
        <span className="flex items-center gap-2">
          <HelpTip label={t('tasks.help')} />
          <span data-testid="tasks-count-line" className="ch-meta-line tabular-nums">
          {stats === null || followupsView
            ? '—'
            : [
                t('tasks.meta.openCount', { count: stats.open }),
                t('tasks.meta.totalCount', { count: stats.total }),
              ].join(' · ')}
          </span>
        </span>
      }
    >
      {announcement && <span role="status" aria-live="polite" className="sr-only">{announcement}</span>}
      <div className={`split${(drawerOpen || host.session?.frames.at(-1)?.entry.owner === 'tasks') ? '' : ' nodrawer'}`}>
        <section className={`assembly record-collection-view record-collection-view--${controller.state.presentation}${drawerOpen && splitLayout ? ' condensed' : ''}`} aria-label={t('tasks.title')}>
          <TaskCollectionRuntimeProvider value={runtime}>
            <RecordCollectionSurface
              controller={controller}
              resultHeader={{
                collectionLabel: t('tasks.title'),
                viewLabel: activeView.label,
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
                  : <Link ref={(node) => { createControlRef.current = node }} to={{ pathname: '/work/tasks', search: (() => { const next = new URLSearchParams(params); next.set('create', '1'); return `?${next.toString()}` })() }} onClick={(event) => { event.preventDefault(); onNewTask() }} className="btn btn-primary">{t('tasks.new')}</Link>,
              }}
              filteredEmpty={{
                title: t('tasks.empty.filteredTitle'),
                copy: t('tasks.empty.filteredCopy'),
                clear: onClearFilters,
                create: <Link ref={(node) => { createControlRef.current = node }} to={{ pathname: '/work/tasks', search: (() => { const next = new URLSearchParams(params); next.set('create', '1'); return `?${next.toString()}` })() }} onClick={(event) => { event.preventDefault(); onNewTask() }} className="btn btn-primary">{t('tasks.new')}</Link>,
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
        <OverlayHostSlot
          owner="tasks"
          onOpenPage={(to, openPage) => { void promoteToPage(to, openPage) }}
        />
      </div>
    </PageFamilyFrame>
  )
}
