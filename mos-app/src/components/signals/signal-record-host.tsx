import { useCallback, useEffect, useRef, useState } from 'react'
import { useHref, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import { useSignalComposer } from '@/shell/signal-composer-host'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Picker } from '@/components/ui/picker'
import { TextInput } from '@/components/ui/text-input'
import { EmptyState, ErrorState, SkeletonRows } from '@/components/ui/state-kit'
import { TaskSurface } from '@/components/tasks/task-surface'
import { TaskOverlayContent } from '@/components/tasks/task-drawer'
import { RecordPanelHost } from '@/shell/record-panel-host'
import { useOptionalOverlayHost, type OverlayEntry } from '@/shell/overlay-host'
import type { OverlayLeaveDecision, OverlayLeaveIntent, OverlayOwner } from '@/shell/overlay-navigation'
import {
  getSignal, listSignalRevisions, listAllTeams, getTeamSite, correctSignal, acknowledgeSignal,
  linkSignalTask, retractSignal, loadMentionRosters, dedupeRecipients, summarizeLinkedTasks,
  canRetractSignal,
  type SignalDetail, type SignalRevisionRow, type MentionRosters,
} from '@/lib/db/signals'
import type { Attention, SignalCategory, StagedMention } from '@/lib/db/signals.types'
import type { TeamOption } from '@/lib/db/signals.types'
import { getBusinessUnits, getPeople, type BusinessUnitOption, type PersonOption } from '@/lib/db/directory'
import { getTaskTitlesByIds, searchTasksByTitle, type TaskTitleRef } from '@/lib/db/tasks'
import { listComments, postComment, type CommentRow } from '@/lib/comments/postComment'
import { formatWibDateTime } from '@/lib/wib-time'
import {
  SignalReach, SignalDiscussion, SignalFacts, SignalHistory, SignalOverflowMenu,
  type SignalMentionView, type LinkedTaskView,
} from './signal-record'
import { RecordViewer } from '@/components/records/record-viewer'
import { wrapSignalRecord, firstLine } from './signal-record-adapter'
import './signal-record-host.css'

// C3 (KNOWN GAP 2): signal-record.tsx is a set of presentational region renderers — this host is
// the fetch+mutate layer for the Signal record. It builds the five JTBD region nodes (Message /
// Reach & response / Discussion / Facts / History — docs/specs/record-page-anatomy.spec.md §2.1)
// and hands them to wrapSignalRecord, which orders them into the shared RecordViewer's content
// slots. It is the CONTENT of the shared RecordPanelHost (chrome-free: the host owns the
// ✕ Close / "Open full page" / modal regime; the STANDALONE page owns the Back via the shared
// RecordPageChrome). `mode` mirrors the Task renderer: "panel" (in-list drawer) or "page".

export interface SignalRecordHostProps {
  signalId: string
  /** panel = in-list split drawer content; page = standalone canonical record page (OD-63/Rule 4). */
  mode?: 'panel' | 'page'
  /** Lets a page host reflect the record's resolved name (breadcrumb / Ask-Deputy seed). */
  onTitleResolved?: (title: string) => void
  /** Refreshes the owning collection after a record mutation. */
  onReload?: () => void
}

type FetchState = 'loading' | 'ready' | 'error' | 'denied' | 'missing'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return ''
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : ''
}

function readFailureState(error: unknown): Exclude<FetchState, 'loading' | 'ready'> {
  const diagnostic = `${errorCode(error)} ${errorText(error)}`
  if (/42501|permission denied|row-level security|not authorized|forbidden/i.test(diagnostic)) return 'denied'
  if (/PGRST116|0 rows|no rows|JSON object requested.*(?:multiple|no).*rows returned/i.test(diagnostic)) return 'missing'
  return 'error'
}

function personName(people: PersonOption[], id: string, fallback: string): string {
  return people.find((p) => p.id === id)?.full_name ?? fallback
}

async function readTaskTitlesByIds(taskIds: readonly string[]): Promise<TaskTitleRef[]> {
  const uniqueIds = [...new Set(taskIds)]
  return uniqueIds.length > 0 ? getTaskTitlesByIds(uniqueIds, { includeArchived: false }) : []
}

type TaskDraftSession = {
  dirty: boolean
  requestConfirmation?: (intent: OverlayLeaveIntent) => Promise<OverlayLeaveDecision>
  guard: (intent: OverlayLeaveIntent) => Promise<OverlayLeaveDecision>
}

function createTaskDraftSession(): TaskDraftSession {
  const session = {} as TaskDraftSession
  session.dirty = false
  session.guard = async (intent) => {
    if (!session.dirty) return { decision: 'allow' }
    return session.requestConfirmation?.(intent) ?? { decision: 'deny' }
  }
  return session
}

function SignalTaskCreateFrame({
  signalTitle, businessUnitId, responsiblePersonId, session, onCreated, onLeave,
}: {
  signalTitle: string
  businessUnitId?: string
  responsiblePersonId: string
  session: TaskDraftSession
  onCreated: (taskId: string) => boolean | Promise<boolean>
  onLeave: () => void
}) {
  const t = useT()
  const [confirmOpen, setConfirmOpen] = useState(false)
  // A Task is created before the Signal bridge write. Keep that ID in this frame so a failed
  // bridge write can retry the same relationship without exposing the create form a second time.
  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null)
  const [linkingTaskId, setLinkingTaskId] = useState<string | null>(null)
  const resolverRef = useRef<((decision: OverlayLeaveDecision) => void) | null>(null)

  useEffect(() => {
    session.requestConfirmation = async () => new Promise<OverlayLeaveDecision>((resolve) => {
      resolverRef.current = resolve
      setConfirmOpen(true)
    })
    return () => {
      session.requestConfirmation = undefined
      resolverRef.current?.({ decision: 'deny' })
      resolverRef.current = null
    }
  }, [resolverRef, session])

  const resolveConfirmation = (decision: OverlayLeaveDecision) => {
    if (decision.decision === 'allow') session.dirty = false
    setConfirmOpen(false)
    const resolve = resolverRef.current
    resolverRef.current = null
    resolve?.(decision)
  }

  const linkCreatedTask = async (taskId: string) => {
    if (linkingTaskId) return
    setCreatedTaskId(taskId)
    setLinkingTaskId(taskId)
    const linked = await onCreated(taskId)
    setLinkingTaskId(null)
    if (linked) setCreatedTaskId(null)
  }

  return (
    <>
        <div className="signal-task-create-frame">
          <p className="signal-task-create-context">{t('signals.record.fromSignal')}: {signalTitle}</p>
        {createdTaskId ? (
          <div className="signal-task-link-recovery" data-task-id={createdTaskId}>
            {linkingTaskId ? (
              <p role="status" aria-live="polite">{t('signals.record.linkingTask')}</p>
            ) : (
              <>
                <p role="status" aria-live="polite">{t('signals.record.taskCreatedLinkRetry')}</p>
                <Button
                  type="button"
                  variant="primary"
                  data-task-id={createdTaskId}
                  onClick={() => { void linkCreatedTask(createdTaskId) }}
                  disabled={!!linkingTaskId}
                  aria-busy={!!linkingTaskId || undefined}
                >
                  {t('signals.record.retryLink')}
                </Button>
              </>
            )}
          </div>
        ) : (
          <TaskSurface
            taskId={null}
            mode="create"
            presentation="panel"
            width="drawer"
            showPanelUtility={false}
            createInitialValues={{ title: signalTitle, businessUnitId, responsiblePersonId }}
            createRedirect={null}
            onTaskCreated={async (taskId) => {
              session.dirty = false
              await linkCreatedTask(taskId)
            }}
            onDirtyChange={(dirty) => { session.dirty = dirty }}
            onRequestLeave={() => { onLeave() }}
          />
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={t('tasks.unsaved.title')}
        body={t('tasks.unsaved.copy')}
        confirmLabel={t('tasks.unsaved.discard')}
        cancelLabel={t('tasks.cancel')}
        tone="destructive"
        onConfirm={async () => { resolveConfirmation({ decision: 'allow' }) }}
        onCancel={() => { resolveConfirmation({ decision: 'deny' }) }}
      />
    </>
  )
}

export function SignalRecordHost({ signalId, mode = 'panel', onTitleResolved, onReload }: SignalRecordHostProps) {
  const t = useT()
  const navigate = useNavigate()
  // The full page offers Back to Home only when the panel was reached from Home (AC-021 #755).
  const location = useLocation()
  const canonicalHref = useHref(`/work/signals/${signalId}`)
  const auth = useAuth()
  const host = useOptionalOverlayHost()
  const { open: openComposer } = useSignalComposer()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : null
  const { locale } = useI18n()

  const [state, setState] = useState<FetchState>('loading')
  const [detail, setDetail] = useState<SignalDetail | null>(null)
  const [revisions, setRevisions] = useState<SignalRevisionRow[]>([])
  const [teams, setTeams] = useState<TeamOption[]>([])
  const [siteName, setSiteName] = useState<string | null>(null)
  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [tasks, setTasks] = useState<TaskTitleRef[]>([])
  const [tasksLoaded, setTasksLoaded] = useState(false)
  const [tasksLoadError, setTasksLoadError] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkTaskId, setLinkTaskId] = useState('')
  const [linkSearch, setLinkSearch] = useState('')
  const [linkSearchResults, setLinkSearchResults] = useState<TaskTitleRef[]>([])
  const [linkSearchLoading, setLinkSearchLoading] = useState(false)
  const [linkSearchError, setLinkSearchError] = useState(false)
  const [linkSearchRetry, setLinkSearchRetry] = useState(0)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [rosters, setRosters] = useState<MentionRosters>({ teamMembers: {}, buMembers: {} })
  const taskRequestRef = useRef(0)
  const linkSearchRequestRef = useRef(0)

  const loadRelatedTasks = useCallback(async (taskIds: readonly string[]) => {
    const requestId = ++taskRequestRef.current
    setTasksLoaded(false)
    setTasksLoadError(false)
    try {
      const taskRows = await readTaskTitlesByIds(taskIds)
      if (requestId !== taskRequestRef.current) return
      setTasks(taskRows)
      setTasksLoaded(true)
    } catch {
      if (requestId !== taskRequestRef.current) return
      // Keep the distinction between "there are no linked Tasks" and "the Task read failed".
      // The record remains usable, but Reach must show a retryable failure instead of an empty
      // linked-work result that looks authoritative.
      setTasksLoaded(true)
      setTasksLoadError(true)
    }
  }, [])

  const [retractOpen, setRetractOpen] = useState(false)
  const [retractReason, setRetractReason] = useState('')
  const [retractAllowed, setRetractAllowed] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [localTaskSession, setLocalTaskSession] = useState<TaskDraftSession | null>(null)

  const refreshTaskProjection = useCallback(async () => {
    const requestId = ++taskRequestRef.current
    setTasksLoaded(false)
    setTasksLoadError(false)
    try {
      const nextDetail = await getSignal(signalId)
      const taskRows = await readTaskTitlesByIds(nextDetail.tasks.map((link) => link.task_id))
      if (requestId !== taskRequestRef.current) return
      setDetail(nextDetail)
      setTasks(taskRows)
      setTasksLoaded(true)
    } catch {
      if (requestId !== taskRequestRef.current) return
      setTasksLoaded(true)
      setTasksLoadError(true)
    }
  }, [signalId])

  useEffect(() => {
    const requestId = ++linkSearchRequestRef.current
    if (!linkOpen) return
    const term = linkSearch.trim()
    if (!term) {
      setLinkSearchResults([])
      setLinkSearchLoading(false)
      setLinkSearchError(false)
      return
    }

    setLinkSearchLoading(true)
    setLinkSearchError(false)
    const timeoutId = window.setTimeout(() => {
      void searchTasksByTitle(term)
        .then((rows) => {
          if (requestId !== linkSearchRequestRef.current) return
          setLinkSearchResults(rows)
          setLinkSearchLoading(false)
        })
        .catch(() => {
          if (requestId !== linkSearchRequestRef.current) return
          setLinkSearchResults([])
          setLinkSearchLoading(false)
          setLinkSearchError(true)
        })
    }, 150)

    return () => window.clearTimeout(timeoutId)
  }, [linkOpen, linkSearch, linkSearchRetry])

  const load = useCallback(() => {
    let cancelled = false
    setState('loading')
    setDetail(null)
    setTasksLoaded(false)
    setTasksLoadError(false)
    taskRequestRef.current += 1
    setActionError(null)
    setRetractAllowed(false)
    setLinkOpen(false)
    setLinkTaskId('')
    setLinkSearch('')
    setLinkSearchResults([])
    setLinkSearchLoading(false)
    setLinkSearchError(false)
    setRevisions([])
    setTeams([])
    setSiteName(null)
    setBusinessUnits([])
    setPeople([])
    setComments([])
    setRosters({ teamMembers: {}, buMembers: {} })
    // An effect disposed before its first microtask (including development effect replay)
    // owns no read. The live effect still issues exactly one primary request.
    Promise.resolve().then(() => cancelled ? null : getSignal(signalId))
      .then((loadedDetail) => {
        if (cancelled || !loadedDetail) return
        setDetail(loadedDetail)
        setState('ready')

        // The Signal itself is the first paint. Directory, comments, revisions, and site enrich it
        // later; linked task titles are resolved by ID in a separate read so a record never waits
        // on the whole Work catalog.
        void listSignalRevisions(signalId).then((revs) => { if (!cancelled) setRevisions(revs) }).catch(() => {})
        void listAllTeams().then((teamRows) => { if (!cancelled) setTeams(teamRows) }).catch(() => {})
        void getBusinessUnits().then((bus) => { if (!cancelled) setBusinessUnits(bus) }).catch(() => {})
        void getPeople().then((ppl) => { if (!cancelled) setPeople(ppl) }).catch(() => {})
        void listComments({ entityType: 'signal', entityId: signalId }).then((commentRows) => {
          if (!cancelled) setComments(commentRows)
        }).catch(() => {})
        void loadMentionRosters().then((mentionRosters) => {
          if (!cancelled) setRosters(mentionRosters)
        }).catch(() => {})
        void getTeamSite(loadedDetail.signal.owning_team_id).then((site) => {
          if (!cancelled) setSiteName(site?.name ?? null)
        }).catch(() => {})
        void loadRelatedTasks(loadedDetail.tasks.map((link) => link.task_id))
      })
      .catch((error) => { if (!cancelled) setState(readFailureState(error)) })
    return () => { cancelled = true }
  }, [loadRelatedTasks, signalId])

  useEffect(() => load(), [load])

  // Retract authority is a per-Signal runtime decision. Keep it off the primary record request so
  // a stale/failed authority read cannot delay or block first paint; any failure remains hidden.
  useEffect(() => {
    if (!detail || !viewerId || detail.signal.retracted_at !== null) {
      setRetractAllowed(false)
      return
    }
    let live = true
    setRetractAllowed(false)
    canRetractSignal(signalId)
      .then((allowed) => { if (live) setRetractAllowed(allowed) })
      .catch(() => { if (live) setRetractAllowed(false) })
    return () => { live = false }
  }, [detail, signalId, viewerId])

  // Reflect the resolved record name to a page host (breadcrumb / Ask-Deputy seed).
  useEffect(() => {
    if (detail) onTitleResolved?.(detail.signal.retracted_at ? t('signals.record.retractedTitle') : firstLine(detail.signal.body))
  }, [detail, onTitleResolved, t])

  if (state === 'loading') {
    return (
      <div role="status" aria-label="Loading" aria-busy="true">
        <SkeletonRows count={4} />
      </div>
    )
  }
  if (state === 'denied') {
    return (
      <div className="signal-record-unavailable" role="status">
        <h2>{t('signals.record.accessDeniedTitle')}</h2>
        <p>{t('signals.record.accessDeniedBody')}</p>
      </div>
    )
  }
  if (state === 'missing') {
    return <ErrorState message={t('signals.record.missing')} onRetry={load} />
  }
  if (state === 'error' || !detail) {
    return <ErrorState message={t('signals.archive.error')} onRetry={load} />
  }

  const { signal, mentions, acknowledgements, tasks: taskLinks } = detail
  const team = teams.find((tm) => tm.id === signal.owning_team_id) ?? null
  const businessUnitName = team ? businessUnits.find((bu) => bu.id === team.business_unit_id)?.name ?? null : null
  const teamName = team?.name ?? ''

  const activeMentions = mentions.filter((m) => !m.revoked_at)
  const mentionViews: SignalMentionView[] = activeMentions.map((m) => {
    if (m.mention_kind === 'person') return { kind: 'person', label: personName(people, m.target_person_id ?? '', t('signals.card.unknownAuthor')) }
    if (m.mention_kind === 'team') return { kind: 'team', label: teams.find((tm) => tm.id === m.target_team_id)?.name ?? '' }
    return { kind: 'bu', label: businessUnits.find((bu) => bu.id === m.target_bu_id)?.name ?? '' }
  })

  const staged: StagedMention[] = activeMentions.map((m, index) => ({
    kind: m.mention_kind,
    targetId: (m.target_person_id ?? m.target_team_id ?? m.target_bu_id) as string,
    label: mentionViews[index]?.label ?? '',
  }))
  const notifyCount = dedupeRecipients(staged, rosters.teamMembers, rosters.buMembers)
  // SR-1: notify count carries its noun (owner ruling "notify N people"); noun resolved in-locale.
  const notifyNoun = t(notifyCount === 1 ? 'signals.notify.person' : 'signals.notify.people')
  const shieldLine = !teamName ? undefined : notifyCount > 0
    ? t('signals.composer.visibleToNotify', { team: teamName, count: notifyCount, noun: notifyNoun })
    : t('signals.composer.visibleTo', { team: teamName })

  const statusById = Object.fromEntries(tasks.map((task) => [task.id, task.status]))
  const linkedTasksSummary = tasksLoaded && !tasksLoadError ? summarizeLinkedTasks(taskLinks, statusById) : undefined
  const linkedTaskIds = new Set(taskLinks.map((link) => link.task_id))
  const linkableTasks = linkSearchResults.filter((task) => !linkedTaskIds.has(task.id))

  function openLinkedTask(taskId: string) {
    const overlayHost = host
    if (!overlayHost?.session) return
    const pageTo = { pathname: `/work/tasks/${taskId}` }
    const entry: OverlayEntry = {
      key: `task:${taskId}`,
      // This Signal record is already mounted in the Signals slot. Keep that physical slot active
      // while the nested content uses the canonical Task overlay contract, so Back returns here.
      owner: 'signals',
      tenant: 'record',
      label: t('tasks.detail.title'),
      title: t('tasks.detail.title'),
      pageTo,
      pageState: { taskSurface: 'page' },
      content: null,
    }
    entry.content = (
      <TaskOverlayContent
        taskId={taskId}
        onClose={() => { void overlayHost.back() }}
        onOpenPage={() => { void overlayHost.openPage(pageTo, entry.pageState) }}
        onLeaveGuardChange={(guard) => { entry.leaveGuard = guard }}
      />
    )
    void overlayHost.push(entry)
  }

  const linkedTasks: LinkedTaskView[] = tasksLoaded && !tasksLoadError
    ? taskLinks.flatMap((link) => {
      const task = tasks.find((candidate) => candidate.id === link.task_id)
      return task ? [{
        id: task.id,
        title: task.title,
        status: task.status,
        href: `/work/tasks/${task.id}`,
        onOpen: host?.session ? () => { openLinkedTask(task.id) } : undefined,
      }] : []
    })
    : []

  // ── The five JTBD region nodes (retracted ⇒ reach/discussion/history drop; message tombstone +
  // Facts survive so provenance stays legible, mirroring an archived Task's ownership fields). ──
  const retracted = signal.retracted_at !== null
  const canRetract = !retracted && retractAllowed

  async function handleRetract() {
    setActionError(null)
    try {
      await retractSignal(signalId, retractReason.trim())
      setRetractOpen(false)
      setRetractReason('')
      load()
      onReload?.()
    } catch {
      setActionError(t('signals.record.actionError'))
    }
  }

  function openRepost() {
    openComposer({
      body: signal.body, occurredAt: signal.occurred_at,
      attention: signal.attention, mentions: staged,
    })
  }

  async function handleAcknowledge() {
    setActionError(null)
    try {
      await acknowledgeSignal(signalId)
      load()
    } catch {
      setActionError(t('signals.record.actionError'))
    }
  }

  async function handleCategorize(category: SignalCategory) {
    setActionError(null)
    try {
      await correctSignal(signalId, { category })
      load()
    } catch {
      setActionError(t('signals.record.actionError'))
    }
  }

  async function handleAttentionChange(attention: Attention) {
    setActionError(null)
    try {
      await correctSignal(signalId, { attention })
      load()
    } catch {
      setActionError(t('signals.record.actionError'))
    }
  }

  async function handlePostComment(body: string) {
    const actorId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
    const actorName = auth.status === 'authenticated' ? auth.viewer.person.full_name : ''
    await postComment({ entityType: 'signal', entityId: signalId, body, actorId, actorName, locale })
    setComments(await listComments({ entityType: 'signal', entityId: signalId }))
  }

  async function finishTaskCreate(taskId: string): Promise<boolean> {
    setActionError(null)
    try {
      // TaskSurface owns task creation; this host owns the Signal relationship so the return
      // path can immediately show the new Task under Linked work without changing the Signal URL.
      await linkSignalTask(signalId, taskId)
    } catch {
      setActionError(t('signals.record.actionError'))
      // The Task exists, but the Signal relationship does not. Keep the composer visible so the
      // user can retry or leave with the created Task context still present; closing here made a
      // failed link look like a completed Signal→Task journey.
      return false
    }
    void refreshTaskProjection()
    if (host?.session) {
      void host.back()
    } else {
      setLocalTaskSession(null)
    }
    return true
  }

  function closeLocalTaskComposer(via: 'explicit-close' | 'escape' = 'explicit-close') {
    const session = localTaskSession
    if (!session) return
    void session.guard({
      kind: 'close',
      via,
      from: { key: `signal-task-create:${signalId}`, owner: 'signals' },
    }).then((decision) => {
      if (decision.decision === 'allow') setLocalTaskSession(null)
    })
  }

  function openTaskComposer() {
    if (!viewerId) return
    const signalTitle = firstLine(signal.body)
    if (!host?.session) {
      setLocalTaskSession(createTaskDraftSession())
      return
    }

    const session = createTaskDraftSession()
    const owner: OverlayOwner = host.session.frames.at(-1)?.entry.owner ?? 'signals'
    const entry: OverlayEntry = {
      key: `signal-task-create:${signal.id}`,
      owner,
      tenant: 'record',
      label: t('signals.record.createFollowUpTask'),
      title: t('signals.record.createFollowUpTask'),
      content: (
        <SignalTaskCreateFrame
          signalTitle={signalTitle}
          businessUnitId={team?.business_unit_id}
          responsiblePersonId={viewerId}
          session={session}
          onCreated={finishTaskCreate}
          onLeave={() => { void host.back() }}
        />
      ),
      leaveGuard: session.guard,
    }
    void host.push(entry)
  }

  function toggleLinkPicker() {
    setLinkOpen((open) => {
      if (open) {
        setLinkTaskId('')
        setLinkSearch('')
        setLinkSearchResults([])
        setLinkSearchError(false)
        setLinkSearchLoading(false)
      }
      return !open
    })
  }

  function retryLinkSearch() {
    setLinkSearchRetry((retry) => retry + 1)
  }

  async function submitLink() {
    if (!linkTaskId) return
    setActionError(null)
    try {
      await linkSignalTask(signalId, linkTaskId)
      setLinkOpen(false)
      setLinkTaskId('')
      load()
    } catch {
      setActionError(t('signals.record.actionError'))
    }
  }

  const revisionViews = revisions.map((rev) => ({
    id: rev.id, field: rev.field, old_value: rev.old_value, new_value: rev.new_value,
    created_at: rev.created_at, actorName: personName(people, rev.actor_id, t('signals.card.unknownAuthor')),
  }))
  const hasAcknowledged = !!viewerId && acknowledgements.some((ack) => ack.person_id === viewerId)

  const recordActionControls = !retracted ? (
    <div className="signal-record-action-controls" data-signal-actions="true">
      <Button
        variant="primary"
        onClick={openTaskComposer}
        disabled={!viewerId}
      >
        {t('signals.record.createFollowUpTask')}
      </Button>
      <SignalOverflowMenu
        onLinkExistingTask={toggleLinkPicker}
        onRetract={canRetract ? () => setRetractOpen(true) : undefined}
        onCopyLink={() => {
          if (typeof navigator !== 'undefined' && navigator.clipboard) void navigator.clipboard.writeText(new URL(canonicalHref, window.location.origin).href)
        }}
        onOpenFullPage={mode === 'panel' ? () => {
          // Inside the overlay host the entry carries where the panel came from (Home sets
          // pageState {from:'home'}); a route-mounted panel carries it on the location instead.
          const entry = host?.session?.frames.at(-1)?.entry
          if (host && entry) void host.openPage(`/work/signals/${signal.id}`, entry.pageState)
          else navigate(`/work/signals/${signal.id}`, { state: location.state })
        } : undefined}
      />
    </div>
  ) : null

  // Link-existing remains record-local; Task creation uses the one canonical Tasks composer.
  const actionForms = (
    <>
      {linkOpen && (
        <form
          className="signal-record-link-form"
          aria-label={t('signals.record.linkExistingTask')}
          onSubmit={(e) => { e.preventDefault(); void submitLink() }}
        >
          <TextInput
            type="search"
            label={t('tasks.filter.search')}
            placeholder={t('tasks.filter.searchPlaceholder')}
            value={linkSearch}
            onChange={(event) => { setLinkSearch(event.target.value); setLinkTaskId('') }}
            autoFocus
            fullWidth
            aria-busy={linkSearchLoading || undefined}
          />
          {linkSearchError ? (
            <ErrorState message={t('signals.record.linkedWorkError')} onRetry={retryLinkSearch} />
          ) : !linkSearch.trim() ? null : linkSearchLoading ? (
            <SkeletonRows count={1} />
          ) : linkableTasks.length === 0 ? (
            <EmptyState title={t('signals.record.noLinkableTasks')} nested />
          ) : (
            <>
              <Picker
                label={t('signals.record.existingTaskLabel')}
                value={linkTaskId}
                options={linkableTasks.map((task) => ({ value: task.id, label: task.title }))}
                placeholder={t('signals.record.existingTaskPlaceholder')}
                required
                fullWidth
                onChange={setLinkTaskId}
              />
              <Button type="submit" variant="primary" disabled={!linkTaskId}>
                {t('signals.record.linkSave')}
              </Button>
            </>
          )}
        </form>
      )}
    </>
  )

  // mos._guard_signals (20260805000006) treats attention as AUTHOR-ONLY content — a signal.retract
  // holder who isn't the author gets 42501 — so the editor is offered to the author alone
  // (DESIGN.md: do not render edit affordances that cannot succeed).
  const onAttentionChange = !retracted && signal.author_id === viewerId
    ? (attention: Attention) => { void handleAttentionChange(attention) }
    : undefined
  const reach = retracted ? null : (
    <SignalReach
      mentions={mentionViews}
      shieldLine={shieldLine}
      canAcknowledge
      hasAcknowledged={hasAcknowledged}
      onAcknowledge={() => { void handleAcknowledge() }}
      acknowledgements={acknowledgements.map((ack) => ({
        personId: ack.person_id, personName: personName(people, ack.person_id, t('signals.card.unknownAuthor')),
      }))}
      linkedTasksSummary={linkedTasksSummary}
      linkedTasks={linkedTasks}
      linkedTasksLoading={!tasksLoaded && !tasksLoadError && taskLinks.length > 0}
      linkedTasksError={tasksLoadError}
      onRetryLinkedTasks={() => { void loadRelatedTasks(taskLinks.map((link) => link.task_id)) }}
      actionForms={actionForms}
    />
  )
  const discussion = retracted ? null : (
    <SignalDiscussion
      comments={comments}
      people={people}
      canComment={!!viewerId}
      onPostComment={handlePostComment}
    />
  )
  const facts = (
    <SignalFacts
      authorName={personName(people, signal.author_id, t('signals.card.unknownAuthor'))}
      teamName={teamName}
      businessUnitName={businessUnitName}
      siteName={siteName}
      category={signal.category}
      onCategorize={(category) => { void handleCategorize(category) }}
    />
  )
  const history = signal.edited_at
    ? <SignalHistory edited revisions={revisionViews} />
    : null

  return (
    <div className="signal-record-host">
      <RecordViewer
        adapter={wrapSignalRecord({
          detail,
          occurredLabel: formatWibDateTime(signal.occurred_at),
          reach,
          discussion,
          facts,
          history,
          onAttentionChange,
          actionControls: recordActionControls,
          onRepost: retracted ? openRepost : undefined,
          retractedBy: retracted
            ? signal.retracted_by_name ?? (signal.retracted_by
              ? personName(people, signal.retracted_by, t('signals.record.retractorUnknown'))
              : null)
            : null,
          retractedAtLabel: retracted && signal.retracted_at ? formatWibDateTime(signal.retracted_at) : null,
          // DO-13/I18N-2: the identity type-kicker localizes with the rest of the record chrome.
          typeLabel: t('signals.record.title'),
          // The heading carries a distinct noun-phrase title; the message-region tombstone
          // sentence (tested standalone in signal-record.test.tsx) owns the declarative copy, so
          // the record never prints the same sentence twice.
          tombstoneLabel: t('signals.record.retractedTitle'),
        })}
        mode={mode}
        canonicalHref={canonicalHref}
        // SR-8 (mirrors TaskRecordPage): in page mode the RecordViewer identity IS the page's h1
        // (the generic PageFamilyFrame head is hidden), so promote it from the default h2. The
        // in-list panel/drawer keeps h2 (its host chrome owns the surrounding hierarchy).
        headingLevel={mode === 'page' ? 1 : 2}
      />
      {actionError ? <p className="signal-record-action-error" role="alert">{actionError}</p> : null}
      {localTaskSession && (
        <RecordPanelHost
          label={t('signals.record.createFollowUpTask')}
          title={t('signals.record.createFollowUpTask')}
          focusKey={`signal-task-create:${signal.id}`}
          rootClassName="signal-task-create-local-host"
          onClose={(via) => { closeLocalTaskComposer(via ?? 'explicit-close') }}
        >
          <SignalTaskCreateFrame
            signalTitle={firstLine(signal.body)}
            businessUnitId={team?.business_unit_id}
            responsiblePersonId={viewerId ?? ''}
            session={localTaskSession}
            onCreated={finishTaskCreate}
            onLeave={() => { closeLocalTaskComposer('explicit-close') }}
          />
        </RecordPanelHost>
      )}
      <ConfirmDialog
        open={retractOpen}
        title={t('signals.record.retractTitle')}
        body={t('signals.record.retractBody')}
        confirmLabel={t('signals.record.retract')}
        reasonLabel={t('signals.record.retractReason')}
        reason={retractReason}
        onReasonChange={setRetractReason}
        reasonRequired
        tone="destructive"
        onConfirm={handleRetract}
        onCancel={() => { setRetractOpen(false); setRetractReason('') }}
      />
    </div>
  )
}
