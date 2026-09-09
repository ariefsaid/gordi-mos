import './TasksWorkspace.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { To } from 'react-router-dom'
import { useIsDesktop } from '@/shell/use-is-desktop'
import { useIsNarrow } from '@/shell/use-is-narrow'
import { useAuth } from '@/auth/use-auth'
import { useRecordCollection } from '@/lib/record-collection/use-record-collection'
import { collectionDisclosureSummary } from '@/lib/record-collection/disclosure-summary'
import { useSetCollectionLeaf } from '@/shell/breadcrumb-title'
import { RecordCollectionSurface } from '@/components/record-collection/record-collection'
import { PageFamilyFrame } from '@/shell/page-family-frame'
import type { PageFamilyState } from '@/shell/page-families'
import { OverlayHostSlot, useOverlayHost } from '@/shell/overlay-host'
import { createRecordRouteAdapter } from '@/shell/overlay-navigation'
import { useT } from '@/i18n/use-t'
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
import { getPersonTeams, type TeamOption } from '@/lib/db/directory'
import { canStartProcessForTeam } from '@/lib/db/processes'
import { linkSignalTask } from '@/lib/db/signals'
import { TaskOverlayContent } from './task-drawer'
import { useCatalogRecordEntryFactory } from '@/components/catalog/use-catalog-record-overlay'
import { AskDeputyAction } from '@/components/records/ask-deputy-action'
import type { OverlayEntry, OverlayHostApi } from '@/shell/overlay-host'
import { getActiveTaskView } from './task-collection-view'
import { isOwnerDirector } from '@/lib/role-scope'
import { getTaskDefaultView } from '@/lib/task-default-view'
import { resolveTeamContext } from '@/lib/team-context'

// D-A1 (fix work-order item 4): the Task record door is URL-addressable via the ?record= query
// seam — the SAME grammar Signals uses (backlog R6(b) "unify on ?record="), built from the shared
// createRecordRouteAdapter so no third door grammar is invented. The panel toggles ?record=<id> on
// the collection path (/work/tasks); the canonical full page keeps its own path (/work/tasks/:id).
const taskRouteAdapter = createRecordRouteAdapter({
  collectionPath: '/work/tasks',
  panelParam: 'record',
  pagePath: (id) => `/work/tasks/${id}`,
})

// Team scope is a first-class queue view. The collection adapter remains the compatibility seam
// while the domain contract is composed by the root branch.
type TasksSavedViewChip = 'mine' | 'overdue'
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
  return 'all'
}

function defaultTaskView(auth: ReturnType<typeof useAuth>, accessRoles: readonly string[]): TaskCollectionView {
  if (auth.status !== 'authenticated') return 'my-work'
  return getTaskDefaultView({ accessRoles, hasReport: auth.viewer.isManager, isOwnerDirector: isOwnerDirector(auth.viewer.roles) })
}

function firstCreateParam(params: URLSearchParams, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = params.get(key)
    if (value) return value
  }
  return null
}

function taskDisclosureSummary(
  query: TaskCollectionQuery,
  t: ReturnType<typeof useT>,
  base: string,
): { summary: string; hasActiveFilters: boolean } {
  return collectionDisclosureSummary({
    query,
    neutralQuery: TASK_COLLECTION_NEUTRAL_QUERY,
    excludedKeys: ['layout', 'groupBy', 'sort', 'direction', 'view'],
    base,
    // The promoted scope tabs are the queue's base context, not extra constraints. Legacy views
    // remain an active constraint, while a clear on a legacy person scope can leave that tab selected
    // without keeping the active-query affordance lit.
    hasNonDefaultView: !['all', 'my-work', 'team-work', 'overdue'].includes(query.view),
    filterLabel: (currentQuery) => currentQuery.overdueOnly ? t('tasks.saved.overdue')
      : currentQuery.status ? t('tasks.filter.status')
        : currentQuery.businessUnitId ? t('tasks.filter.businessUnit')
          : currentQuery.picId || currentQuery.supervisorId || currentQuery.personId ? t('tasks.filter.person')
            : currentQuery.occurrenceId ? t('tasks.filter.occurrence')
              : currentQuery.q.trim() ? t('tasks.filter.search')
                : currentQuery.includeArchived ? t('tasks.filter.includeArchived')
                  : currentQuery.savedViewId ? t('common.savedView')
                    : undefined,
  })
}

// #573 rebase note: the door summary's base is the ONE collection-query label (activeView),
// never a second view→label map — a fourth disagreeing render is the defect this branch kills.
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
  const { buildEntry: buildRelatedEntry } = useCatalogRecordEntryFactory({ owner: 'tasks' })
  const auth = useAuth()
  const isDesktop = useIsDesktop()
  // DO-17 (census-sweep R2 tasks FINDING2): the global Action Launcher FAB exists whenever the
  // rail is collapsed (<920, useIsNarrow) — so the header create door hides on isNarrow, not
  // !isDesktop (<768), or the 768–919 band shows BOTH doors.
  const isNarrow = useIsNarrow()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const viewerOrgId = auth.status === 'authenticated' ? auth.viewer.person.org_id : null
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : EMPTY_ACCESS_ROLES
  const currentSearch = location.search
  const initialQuery = useMemo(() => {
    const legacy = queryFromLegacySavedView(savedView)
    if (legacy) return legacy
    // An explicit URL view is authoritative. Only seed the role-aware default when the user has
    // not supplied one, so Overdue/Team/My work links survive reload exactly as written.
    if (new URLSearchParams(location.search).has('view')) return undefined
    return { ...TASK_COLLECTION_NEUTRAL_QUERY, view: defaultTaskView(auth, accessRoles) }
  }, [accessRoles, auth, location.search, savedView])
  const [draftTask, setDraftTask] = useState<TaskListRow | null>(null)
  const [draftLinkError, setDraftLinkError] = useState(false)
  const [draftValidationError, setDraftValidationError] = useState('')
  // `null` means the viewer Team directory is still loading; [] is an honest no-eligible-Team
  // result and must never be replaced with a BU/first-row guess.
  const [viewerTeams, setViewerTeams] = useState<readonly TeamOption[] | null>(null)
  const [processStartTeamIds, setProcessStartTeamIds] = useState<Set<string>>(new Set())
  const [announcement, setAnnouncement] = useState('')
  const draftSourceSignalRef = useRef<string | null>(new URLSearchParams(location.search).get('sourceSignal'))
  const createdDraftTaskRef = useRef<string | null>(null)
  const draftTitleRef = useRef('')
  const createControlRef = useRef<HTMLElement | null>(null)
  const returnFocusAfterDiscard = useRef(false)
  const pendingCreatePrefillRef = useRef('')
  const createParamSnapshotRef = useRef<URLSearchParams | null>(
    new URLSearchParams(location.search).get('create') === '1'
      ? new URLSearchParams(location.search)
      : null,
  )

  useEffect(() => {
    let active = true
    if (!viewerId) {
      setViewerTeams([])
      return () => { active = false }
    }
    setViewerTeams(null)
    getPersonTeams(viewerId).then((teams) => {
      if (active) setViewerTeams(teams)
    }).catch(() => {
      // A failed directory read is deliberately fail-closed: the draft shows no eligible Team and
      // cannot manufacture a BU. The title entry remains inline so a later retry/refresh can heal.
      if (active) setViewerTeams([])
    })
    return () => { active = false }
  }, [viewerId])

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

  useEffect(() => {
    let live = true
    const teamIds = [...new Set(records
      .filter((record) => record.processRunId !== null && record.teamId !== null)
      .map((record) => record.teamId as string))]
    setProcessStartTeamIds(new Set())
    if (teamIds.length === 0 || !viewerId) return () => { live = false }
    void Promise.all(teamIds.map(async (teamId) => [teamId, await canStartProcessForTeam(teamId)] as const))
      .then((answers) => {
        if (live) setProcessStartTeamIds(new Set(answers.filter(([, allowed]) => allowed).map(([teamId]) => teamId)))
      })
      .catch(() => { if (live) setProcessStartTeamIds(new Set()) })
    return () => { live = false }
  }, [records, viewerId, viewerOrgId])

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

  // AR Follow-ups is a retired finance surface (OD-WAY-34, #743): old links land on the All
  // view — the parser aliases view=followups to All, and this only strips the stale param from
  // the address bar (replace: no history step) so a reload cannot resurrect it.
  useEffect(() => {
    const next = new URLSearchParams(location.search)
    if (next.get('view') !== 'followups') return
    next.delete('view')
    navigate({ pathname: location.pathname, search: next.toString() ? `?${next.toString()}` : '' }, { replace: true })
  }, [location.pathname, location.search, navigate])

  const activeViewLabels = {
    all: t('tasks.saved.all'),
    'my-work': t('tasks.saved.mine'),
    'team-work': t('tasks.saved.team'),
    overdue: t('tasks.saved.overdue'),
  } as Parameters<typeof getActiveTaskView>[0]['labels']
  const activeView = getActiveTaskView({
    query: state.query,
    savedViews: state.savedViews.items,
    labels: activeViewLabels,
  })
  useSetCollectionLeaf({
    label: activeView.label,
    hasNonDefaultView: activeView.hasNonDefaultView,
  })

  const handleViewChange = useCallback((view: TaskCollectionView) => {
    setQuery({
      view,
      savedViewId: null,
      overdueOnly: view === 'overdue',
    })
    onSavedViewChange?.(legacyViewFor(view))
  }, [onSavedViewChange, setQuery])

  const retry = useCallback(() => controller.retry(), [controller])

  // D-A1 (item 4): the open Task id lives in the URL as ?record=<id> (addressable/shareable). The
  // collection owns its own query params; the record param rides alongside them, and the shared
  // OverlayHost session (route marker) supplies the focus/Back/leave-guard. This mirrors the Signals
  // archive seam exactly (signals-archive-page.tsx).
  const [params, setParams] = useSearchParams()
  const createIntentRef = useRef(
    new URLSearchParams(location.search).get('create') === '1'
      || location.pathname === '/work/tasks/new',
  )
  // The retired /work/tasks/new door redirects into this mounted workspace. Capture the intent
  // during render so the collection query's URL normalization cannot race the redirect and erase
  // `create=1` before the inline draft effect sees it.
  if (params.get('create') === '1') createIntentRef.current = true
  if (params.get('create') === '1' && !createParamSnapshotRef.current) {
    createParamSnapshotRef.current = new URLSearchParams(params)
  }
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
        onOpenRelated={(related) => { void host.push(buildRelatedEntry(related.kind, related.id, pageSearch())) }}
        onTaskArchived={onTaskArchived}
        onLeaveGuardChange={(guard) => { entry.leaveGuard = guard }}
      />
    )
    return entry
  }, [recordId, pageSearch, controller.state.data, buildRelatedEntry, host, onTaskArchived, onTaskChanged, promoteToPage, t])

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
    if (host.session?.frames[0]?.entry.key === taskEntry.key) return
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
    const previous = records.find((record) => record.id === taskId)?.dueDate ?? null
    await updateTaskFields(taskId, { due_date: dueDate }, viewerId, previous)
    controller.retry()
  }, [controller, records, viewerId])
  const onEditPic = useCallback(async (taskId: string, personId: string) => {
    if (draftTask?.id === taskId) {
      setDraftTask((current) => current?.id === taskId
        ? { ...current, responsible_person_id: personId }
        : current)
      setDraftValidationError('')
      return
    }
    if (!viewerId) throw new Error('inline PIC edit requires an authenticated viewer')
    const previous = records.find((record) => record.id === taskId)?.picId ?? null
    await updateTaskFields(taskId, { responsible_person_id: personId }, viewerId, previous)
    controller.retry()
  }, [controller, draftTask?.id, records, viewerId])
  const onEditTeam = useCallback(async (taskId: string, teamId: string) => {
    if (draftTask?.id !== taskId) return
    const selected = viewerTeams?.find((team) => team.id === teamId)
    setDraftTask((current) => current?.id === taskId
      ? {
          ...current,
          team_id: selected?.id ?? null,
          // BU is a compatibility projection derived from the selected Team, never a second
          // independent choice. Clearing Team clears the derived BU as well.
          business_unit_id: selected?.businessUnitId ?? '',
        }
      : current)
    setDraftValidationError('')
  }, [draftTask?.id, viewerTeams])
  const onEditSupervisor = useCallback(async (taskId: string, personId: string) => {
    if (draftTask?.id !== taskId) return
    setDraftTask((current) => current?.id === taskId
      ? { ...current, accountable_person_id: personId }
      : current)
    setDraftValidationError('')
  }, [draftTask?.id])
  const onValidateNewTask = useCallback((taskId: string) => {
    if (draftTask?.id !== taskId) return
    if (!draftTask.team_id || !draftTask.business_unit_id) {
      setDraftValidationError(t('tasks.create.teamRequired'))
      return
    }
    if (!draftTask.accountable_person_id) {
      setDraftValidationError(t('tasks.create.supervisorRequired'))
    }
  }, [draftTask, t])
  const onEditTitle = useCallback(async (taskId: string, title: string) => {
    if (draftTask?.id === taskId) {
      if (!viewerId) throw new Error('inline task creation requires an authenticated viewer')
      draftTitleRef.current = title
      if (!draftTask.team_id || !draftTask.business_unit_id) {
        setDraftValidationError(t('tasks.create.teamRequired'))
        return
      }
      if (!draftTask.accountable_person_id) {
        setDraftValidationError(t('tasks.create.supervisorRequired'))
        return
      }
      setDraftValidationError('')
      const existingTaskId = createdDraftTaskRef.current
      const createdTaskId = existingTaskId ?? await createTask({
        title,
        businessUnitId: draftTask.business_unit_id,
        teamId: draftTask.team_id,
        responsiblePersonId: draftTask.responsible_person_id,
        accountablePersonId: draftTask.accountable_person_id,
        createdBy: viewerId,
        objectiveId: draftTask.objective_id,
        workLineId: draftTask.work_line_id,
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
    setDraftValidationError('')
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
    if (viewerTeams === null) {
      // Keep direct button/group-header creates queued while the real Team directory resolves.
      // The URL-create effect will also retry through this same path; no synthetic BU is shown.
      createIntentRef.current = true
      pendingCreatePrefillRef.current = prefillParam
      return
    }
    setDraftLinkError(false)
    setDraftValidationError('')
    setAnnouncement('')
    createdDraftTaskRef.current = null
    draftTitleRef.current = ''
    const firstPerson = dataContext.people[0]?.id ?? viewerId ?? ''
    const prefill = new URLSearchParams(prefillParam)
    const urlPrefill = createParamSnapshotRef.current ?? params
    const title = firstCreateParam(prefill, ['title'])
      ?? firstCreateParam(urlPrefill, ['createTitle', 'title'])
      ?? ''
    const hintedBusinessUnitId = firstCreateParam(prefill, ['bu'])
      ?? firstCreateParam(urlPrefill, ['createBu', 'bu'])
      ?? query.businessUnitId
    const explicitTeamId = firstCreateParam(prefill, ['team', 'team_id'])
      ?? firstCreateParam(urlPrefill, ['team', 'team_id', 'createTeam'])
    const teamResolution = resolveTeamContext(viewerTeams)
    const selectedTeam = (explicitTeamId ? viewerTeams.find((team) => team.id === explicitTeamId) : undefined)
      ?? (teamResolution.kind === 'single' ? teamResolution.team : undefined)
      ?? (hintedBusinessUnitId
        ? (() => {
            const matches = viewerTeams.filter((team) => team.businessUnitId === hintedBusinessUnitId)
            return matches.length === 1 ? matches[0] : undefined
          })()
        : undefined)
    const workLineId = firstCreateParam(prefill, ['work_line_id', 'work_line', 'workLineId'])
      ?? firstCreateParam(urlPrefill, ['work_line_id', 'work_line', 'workLineId'])
    const objectiveId = firstCreateParam(prefill, ['objective_id', 'objective', 'objectiveId'])
      ?? firstCreateParam(urlPrefill, ['objective_id', 'objective', 'objectiveId'])
      ?? (workLineId ? dataContext.workLineObjectiveById?.get(workLineId) ?? null : null)
    const sourceSignal = firstCreateParam(urlPrefill, ['sourceSignal'])
    const supervisorId = firstCreateParam(prefill, ['supervisor', 'supervisorId'])
      ?? firstCreateParam(urlPrefill, ['createSupervisor', 'supervisor', 'supervisorId'])
      ?? query.supervisorId
    const now = new Date().toISOString()
    setDraftTask({
      id: `new-task-${Date.now()}`,
      org_id: '',
      title,
      team_id: selectedTeam?.id ?? null,
      // The selected Team is the sole source of the draft BU. A multi-Team viewer stays blank
      // until they choose; a zero-Team viewer stays honestly unassigned.
      business_unit_id: selectedTeam?.businessUnitId ?? '',
      status: query.status ?? 'Open',
      responsible_person_id: firstCreateParam(prefill, ['r', 'pic', 'picId'])
        ?? firstCreateParam(urlPrefill, ['createPic', 'pic', 'picId'])
        ?? query.picId
        ?? viewerId
        ?? firstPerson,
      // PIC and Supervisor are independent RACI roles. Supervisor is an explicit choice, never
      // the viewer/PIC fallback used by the retired create path.
      accountable_person_id: supervisorId ?? '',
      consulted_person_ids: [], informed_person_ids: [],
      description: null, due_date: null, objective_id: objectiveId, work_line_id: workLineId,
      last_activity_at: now, archived_at: null, created_by: viewerId ?? '',
      created_at: now, updated_at: now, process_run_id: null, generated_from_task_def_id: null,
    })
    draftSourceSignalRef.current = sourceSignal ?? draftSourceSignalRef.current
  }, [dataContext, draftTask, params, query.businessUnitId, query.picId, query.status, query.supervisorId, viewerId, viewerTeams])
  const onAddTask = useCallback((prefillParam: string) => onNewTask(prefillParam), [onNewTask])
  useEffect(() => {
    if ((!createIntentRef.current && params.get('create') !== '1') || !dataContext) return
    if (!draftTask) {
      onNewTask(pendingCreatePrefillRef.current)
      return
    }
    createIntentRef.current = false
    pendingCreatePrefillRef.current = ''
    createParamSnapshotRef.current = null
    const next = new URLSearchParams(params)
    for (const key of [
      'create', 'createTitle', 'createBu', 'createPic', 'createTeam', 'createSupervisor', 'sourceSignal',
      'work_line', 'work_line_id', 'workLineId', 'objective', 'objective_id', 'objectiveId',
    ]) next.delete(key)
    setParams(next, { replace: true })
  }, [dataContext, draftTask, onNewTask, params, setParams, viewerTeams])
  // The query schema owns URL cleanup, including constraints reset to neutral.
  const onClearFilters = useCallback(() => {
    const nextView = query.view === 'overdue' ? 'all' : query.view
    setQuery({
      q: '', businessUnitId: null, status: null, picId: null, supervisorId: null, personId: null,
      overdueOnly: false, includeArchived: false, view: nextView, savedViewId: null,
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
        // OD-REDESIGN-91 #17: "open" mirrors the rail badge's open-count definition
        // (lib/db/rail-counts: not archived AND not Done) so the head and the rail agree.
        open: recordsForStats.filter((record) => record.status !== 'Done' && record.archivedAt === null).length,
        blocked: recordsForStats.filter((record) => record.status === 'Blocked').length,
        overdue: recordsForStats.filter((record) => record.status !== 'Done' && record.archivedAt === null && record.dueDate !== null && record.dueDate < new Date().toISOString().slice(0, 10)).length,
      }
  // Census R2 DO-6's reserved placeholder state is gone with the AR Follow-ups view (#743):
  // every view now renders the live collection body.
  // Block 2(d) (Luna 390 audit): the header "+ Create task" is the DESKTOP create door; on phone
  // the single create door is the global + Action Launcher FAB (DESIGN.md No-FAB Rule / one
  // launcher location app-wide) — hide the header button at phone width to kill the duplicate door.
  // DO-17: the FAB renders whenever the rail is collapsed (<920), so the gate is !isNarrow — the
  // 768–919 band must never show both doors.
  const showNewTask = !drawerOpen && state.status === 'ready' && !isNarrow
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
  const taskDisclosure = taskDisclosureSummary(query, t, activeView.label)
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
      attentionCounts={{ overdue: stats?.overdue ?? 0, blocked: stats?.blocked ?? 0 }}
      onAttentionOverdue={() => setQuery({ overdueOnly: true, status: null })}
      onAttentionBlocked={() => setQuery({ overdueOnly: false, status: 'Blocked' })}
      onClearFilters={onClearFilters}
      activeQuery={taskDisclosure}
      buOptions={buOptions}
      personOptions={personOptions}
      onPresentationChange={(next) => { controller.switchPresentation(next) }}
      savedViews={{
        label: t('tasks.savedViews'),
        selectedId: activeView.savedViewId,
        operation: state.savedViews.operation,
        error: state.savedViews.error,
        items: state.savedViews.items.map((item) => ({ id: item.id, name: item.name })),
        onLoad: () => controller.loadSavedViews(),
        onApply: async (id) => { await controller.applySavedView(id) },
        onSave: (name) => controller.saveCurrentView(name, 'private'),
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
    onEditTeam,
    onEditSupervisor,
    onValidateNewTask,
    teamOptions: viewerTeams ?? [],
    draftTask,
    onDiscardNewTask,
    draftLinkError,
    draftValidationError,
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
    canResolvePending: processStartTeamIds.size > 0,
    canResolvePendingForRun: (runId: string) => {
      const teamId = records.find((record) => record.processRunId === runId)?.teamId
      return teamId !== null && teamId !== undefined && processStartTeamIds.has(teamId)
    },
  }), [
    currentSearch, drawerOpen, draftTask, host.session, isDesktop, onAddTask,
    params,
    onCloseDrawer, onDiscardNewTask, onEditTitle, onEditStatus, onEditDue, onEditPic, onEditTeam, onEditSupervisor, onValidateNewTask, onNewTask, onOpenTask, onClearFilters, onSort,
    processStartTeamIds, records, retry, runtimeStatusOverrides, selectedId, setQuery, splitLayout, draftLinkError, draftValidationError, onRetryDraftLink, viewerTeams,
  ])

  const controls = tasksToolbar

  return (
    <PageFamilyFrame
      family="workspace"
      title={t('tasks.title')}
      jobSentence={t('job.tasks')}
      headClassName="tasks-page-head"
      state={frameState}
      action={showNewTask ? (
        <button ref={(node) => { createControlRef.current = node }} type="button" className="btn btn-primary" onClick={() => onNewTask()}>{t('tasks.new')}</button>
      ) : undefined}
      meta={
        // OD-REDESIGN-91 #17 (F2): counts are OPEN everywhere — the head meta reads
        // "9 open · 11 total" (the rail badge already carries the open-count; the head now
        // agrees). ONE muted meta sentence in the E7 grammar, a single font size (the body
        // token), every number followed by its noun (the naked-numbers guard). Live counts;
        // "—" while loading or on error. The "?" help tip is retired (#743 AC-009): its
        // sentence lives in the true-empty copy now.
        <span data-testid="tasks-count-line" className="ch-meta-line tabular-nums">
          {stats === null
            ? '—'
            : [
                t('tasks.meta.openCount', { count: stats.open }),
                t('tasks.meta.totalCount', { count: stats.total }),
              ].join(' · ')}
        </span>
      }
    >
      {announcement && <span role="status" aria-live="polite" className="sr-only">{announcement}</span>}
      <div className={`split${(drawerOpen || host.session?.frames.at(-1)?.entry.owner === 'tasks') ? '' : ' nodrawer'}`}>
        <section className={`assembly record-collection-view tasks-collection-surface record-collection-view--${controller.state.presentation}${drawerOpen && splitLayout ? ' condensed' : ''}`} aria-label={t('tasks.title')}>
          <TaskCollectionRuntimeProvider value={runtime}>
            <RecordCollectionSurface
              controller={controller}
              keepBodyWhenEmpty={draftTask != null}
              controls={controls}
              empty={{
                title: emptyTitle,
                copy: emptyCopy,
                create: <Link ref={(node) => { createControlRef.current = node }} to={{ pathname: '/work/tasks', search: (() => { const next = new URLSearchParams(params); next.set('create', '1'); return `?${next.toString()}` })() }} onClick={(event) => { event.preventDefault(); onNewTask() }} className="btn btn-primary">{t('tasks.new')}</Link>,
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
