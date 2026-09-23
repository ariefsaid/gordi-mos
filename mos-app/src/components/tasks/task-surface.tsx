import './TaskSurface.css'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, Link, useHref, useLocation, useSearchParams, type To } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import {
  getTask, createTask,
  updateTaskStatus, updateTaskFields,
  addChecklistItem, toggleChecklistItem, reorderChecklistItem, deleteChecklistItem,
  archiveTask, unarchiveTask,
} from '@/lib/db/tasks'
import type { TaskDetail as TaskDetailData, CreateTaskInput, TaskFieldsPatch } from '@/lib/db/tasks'
import type { TaskListRow, TaskStatus, ChecklistItemRow } from '@/lib/db/tasks.types'
import {
  getBusinessUnits, getPeople, getDownlinePersonIds, getPersonTeams, getTeamsByIds,
} from '@/lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { listComments, postComment, type CommentRow } from '@/lib/comments/postComment'
import { listObjectives, readObjective } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listTaskDefs } from '@/lib/db/processes'
import type { ObjectiveRow } from '@/lib/db/objectives'
import type { WorkLineRow } from '@/lib/db/work-lines'
import { ConfirmArchive } from './confirm-archive'
import { canEdit } from './task-permissions'
import { createTaskRecordAdapter, createTaskFieldCommit, type TaskTeamView, type TaskRelatedRecord, type TaskViewerFieldKey } from './task-record-adapter'
import { RecordViewer } from '@/components/records/record-viewer'
import type { RecordContentSlot, RecordViewerAdapter } from '@/components/records/record-viewer.types'
import { ChecklistCard } from './checklist-card'
import { TaskActivity } from './task-activity'
import { AskDeputyAction } from '@/components/records/ask-deputy-action'
import { useT } from '@/i18n/use-t'
import { useI18n } from '@/i18n/I18nProvider'
import { formatDate, formatAge } from './task-formatters'
import { CloseIcon, BackIcon } from '@/shell/icons'
import { Picker } from '@/components/ui/picker'
import { TextInput } from '@/components/ui/text-input'
import { DateField } from '@/components/ui/date-field'
import { Button } from '@/components/ui/button'
import { LoadingShell, EmptyState } from '@/components/ui/state-kit'

type DirectoryTeamOption = {
  id: string
  name: string
  businessUnitId?: string
  business_unit_id?: string
}

function toTaskTeamView(team: DirectoryTeamOption | undefined, businessUnits: readonly BusinessUnitOption[]): TaskTeamView | null {
  if (!team) return null
  const businessUnitId = team.businessUnitId ?? team.business_unit_id
  return {
    id: team.id,
    label: team.name,
    businessUnitLabel: businessUnitId ? businessUnits.find((unit) => unit.id === businessUnitId)?.name : undefined,
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────
// PR-A: TaskSurface is the single actionable task editor (ADR-0007 "one UI, two
// widths"). It renders the full-width host today; PR-B adds the drawer width.
export type TaskSurfaceProps = {
  taskId: string | null          // null only in create mode
  mode: 'view' | 'create'
  /** panel = in-list split drawer; page = standalone canonical record page. */
  presentation?: 'panel' | 'page'
  width: 'drawer' | 'full'
  onClose?: () => void           // drawer uses this; full host passes navigate('/work/tasks')
  /** Canonical promotion callback supplied by the shared overlay host. */
  onOpenPage?: () => void
  onOpenRelated?: (record: TaskRelatedRecord) => void
  /**
   * R6(a) (owner review r2): the inverse of "Open full page" on the STANDALONE full canonical page —
   * re-open this same record in the split drawer over the table. Supplied only by TaskRecordPage;
   * when present, the full-width chrome renders a "back to split" control (a dead-end page otherwise).
   */
  onCollapseToSplit?: () => void
  /** Suppress the task-local utility bar when RecordPanelHost owns the chrome. */
  showPanelUtility?: boolean
  onTaskChanged?: (task: TaskListRow) => void  // lets the table sync optimistic status (PR-B)
  onTaskCreated?: (id: string) => void | Promise<void> // C2: lets the table refetch after a create (PR-B)
  onTaskArchived?: (id: string) => void        // I3: lets the table refetch after an archive (PR-B)
  onTitleResolved?: (title: string) => void    // lets a host render the breadcrumb current title
  /** Bubbles RecordField draft state to a host-owned leave guard. */
  onDirtyChange?: (dirty: boolean) => void
  /** Defaults supplied by the originating record. */
  createInitialValues?: { title?: string; businessUnitId?: string; responsiblePersonId?: string }
  /** null lets the record host retain its URL and own navigation after creation. */
  createRedirect?: To | null
  /**
   * D-B1: the create form's own Cancel / Close controls route their leave through this so a host
   * (TaskDrawer) can interpose its dirty leave-guard. The surface calls it with the concrete
   * navigation to run once leaving is allowed; when omitted (standalone TaskSurface) the surface
   * navigates directly, unchanged.
   */
  onRequestLeave?: (proceed: () => void) => void
  /**
   * True while the host's own leave-guard confirmation dialog is open (D1 fix). Forwarded
   * straight to RecordViewer's `fieldCommitsFrozen` — see record-field.tsx's header note.
   */
  fieldCommitsFrozen?: boolean
  // Heading level for the full-width record identity. Defaults to 1; the V3
  // focused-record page passes 2 because its PageFamilyFrame owns the shell h1.
  identityHeadingLevel?: 1 | 2
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function DetailSkeleton() {
  const t = useT()
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">{t('tasks.detail.loading')}</span>
      <div className="card sk-block">
        <div className="sk" style={{ width: '40%', height: 24, marginBottom: 12 }} />
        <div className="sk" style={{ width: '60%', height: 14 }} />
      </div>
      <div className="card sk-block">
        <div className="sk" style={{ width: '30%', height: 14, marginBottom: 8 }} />
        <div className="sk" style={{ width: '80%', height: 14 }} />
      </div>
    </div>
  )
}

export function TaskSurface(props: TaskSurfaceProps) {
  if (props.mode === 'create') return <CreateSurface {...props} />
  return <ViewSurface {...props} />
}

// ── View mode ──────────────────────────────────────────────────────────────────
function ViewSurface({
  taskId, width, presentation = width === 'drawer' ? 'panel' : 'page',
  onClose, onOpenPage, onOpenRelated, onCollapseToSplit, onTaskChanged, onTaskArchived, onTitleResolved, onDirtyChange,
  showPanelUtility = true,
  identityHeadingLevel,
  fieldCommitsFrozen,
}: TaskSurfaceProps) {
  const navigate = useNavigate()
  const canonicalHref = useHref(taskId ? `/work/tasks/${taskId}` : '/work/tasks')
  const location = useLocation()
  const auth = useAuth()
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const t = useT()
  const { locale } = useI18n()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [data, setData] = useState<TaskDetailData | null>(null)
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [peopleDirectory, setPeopleDirectory] = useState<PersonOption[]>([])
  // Keep the canonical Team directory rows here so a Team change can derive its owning BU id;
  // TaskTeamView is a display projection and intentionally only carries the BU label.
  const [teamDirectory, setTeamDirectory] = useState<DirectoryTeamOption[]>([])
  const [taskTeam, setTaskTeam] = useState<TaskTeamView | null>(null)
  // #742 AC-061 (delta): the viewer's downline feeds the record's edit/archive gates and the PIC
  // picker. Loaded as a sibling of the other directory reads — a failure surfaces (not-found),
  // it never silently degrades the permission mirror to read-only. An unauthenticated viewer
  // flows through the same read with '' and resolves [] naturally.
  const [downlineIds, setDownlineIds] = useState<string[]>([])
  const [objectivesDir, setObjectivesDir] = useState<ObjectiveRow[]>([])
  const [linkedObjective, setLinkedObjective] = useState<ObjectiveRow | null>(null)
  const [workLinesDir, setWorkLinesDir] = useState<WorkLineRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [commentDraft, setCommentDraft] = useState('')
  // E7 "Generated by" chip — resolved from the real generated_from_task_def_id provenance
  // (ADR-0051 Step 6). Non-blocking catalog load; null for an ad-hoc task or before it resolves.
  const [generatedFromLabel, setGeneratedFromLabel] = useState<string | null>(null)

  // Optimistic local state
  const [localTask, setLocalTask] = useState<TaskListRow | null>(null)
  const [localChecklist, setLocalChecklist] = useState<ChecklistItemRow[]>([])
  const loadSeq = useRef(0)

  // AC-111: off-screen live region announcing optimistic-save / rollback outcomes.
  const [liveMessage, setLiveMessage] = useState('')
  const announce = useCallback((msg: string) => {
    // Re-set even if identical so repeated outcomes re-announce (clear then set).
    setLiveMessage('')
    requestAnimationFrame(() => setLiveMessage(msg))
  }, [])
  const ROLLBACK_MSG = t('tasks.feedback.rollback')
  // Lifecycle action runs are swallowed by the adapter's action boundary, so keep a small scope
  // ref around only Mark complete/Reopen. Ordinary Status field commits stay owned by RecordField's
  // draft-preserving visible error + Retry contract and must not render a duplicate page-level cue.
  const lifecycleActionRef = useRef(false)
  const [lifecycleStatusError, setLifecycleStatusError] = useState<TaskStatus | null>(null)
  // OD-REDESIGN-22 (D-C1): the last FAILED checklist write, held so RecordFeed/ChecklistCard can
  // render a VISIBLE error + Retry (the optimistic rollback reverts the row, but a sighted user
  // still needs a clickable way to re-send). The closure re-runs the exact failed operation.
  const [checklistError, setChecklistError] = useState<(() => void) | null>(null)

  const now = useMemo(() => new Date(), [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    if (!taskId) return
    const seq = ++loadSeq.current
    const isCurrent = () => seq === loadSeq.current
    setLoading(true)
    setNotFound(false)
    const viewerTeamsPromise = getPersonTeams(viewerId).catch(() => [])
    Promise.all([
      getTask(taskId),
      getBusinessUnits(),
      getPeople(),
      getDownlinePersonIds(viewerId),
      viewerTeamsPromise,
    ]).then(([taskData, bus, people, downline, viewerTeams]) => {
      if (!isCurrent()) return
      setData(taskData)
      setLocalTask(taskData.task)
      setLocalChecklist(taskData.checklist)
      setBusDirectory(bus)
      setPeopleDirectory(people)
      setDownlineIds(downline)
      setTeamDirectory(viewerTeams)
      const taskTeamId = (taskData.task as TaskListRow & { team_id?: string | null }).team_id
      setTaskTeam(null)
      if (taskTeamId) {
        getTeamsByIds([taskTeamId]).then((teams) => {
          if (isCurrent()) setTaskTeam(toTaskTeamView(teams[0], bus))
        }).catch(() => {})
      }
      setLoading(false)
      // Non-blocking "Generated by" resolution — a hand-created (ad hoc) task carries no
      // generated_from_task_def_id, so the lookup is skipped entirely (listTaskDefs([]) → []).
      const defId = taskData.task.generated_from_task_def_id
      setGeneratedFromLabel(null)
      if (defId) {
        listTaskDefs([defId]).then((defs) => {
          if (isCurrent()) setGeneratedFromLabel(defs[0]?.title ?? null)
        }).catch(() => {})
      }
    }).catch(() => {
      if (!isCurrent()) return
      setNotFound(true)
      setLoading(false)
    })
    // Non-blocking comments load — a slow comments API must not keep task detail on skeleton.
    setComments([])
    listComments({ entityType: 'task', entityId: taskId }).then((loadedComments) => {
      if (isCurrent()) setComments(loadedComments)
    }).catch(() => {})
    // Non-blocking catalog loads — a slow catalog must never block the form.
    listObjectives().then((rows) => {
      if (isCurrent()) setObjectivesDir(rows)
    }).catch(() => {})
    listWorkLines().then((rows) => {
      if (isCurrent()) setWorkLinesDir(rows)
    }).catch(() => {})
  }, [taskId, viewerId])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { loadSeq.current += 1 }, [])

  // A linked archived record remains readable; the active directory is only the edit choices.
  const linkedObjectiveId = localTask?.objective_id
  useEffect(() => {
    let current = true
    async function resolveLinkedObjective() {
      try {
        const objective = linkedObjectiveId ? await readObjective(linkedObjectiveId) : null
        if (current) setLinkedObjective(objective)
      } catch {
        if (current) setLinkedObjective(null)
      }
    }
    void resolveLinkedObjective()
    return () => { current = false }
  }, [linkedObjectiveId])

  // Notify a host of the resolved title (e.g. for the breadcrumb)
  useEffect(() => {
    if (localTask && onTitleResolved) onTitleResolved(localTask.title)
  }, [localTask, onTitleResolved])

  // ── Permission ───────────────────────────────────────────────────────────
  // M2: archived task is read-only except Unarchive — treat as non-editor
  const isArchived = localTask?.archived_at != null

  const editable = useMemo(() => {
    if (isArchived) return false // M2: archived suppresses all edit affordances
    return localTask ? canEdit(localTask, viewerId, downlineIds) : false
  }, [localTask, viewerId, downlineIds, isArchived])

  // ── Status change ────────────────────────────────────────────────────────
  // Optimistic + rollback, and — like handleUpdateField — RE-THROWS on failure so the Status
  // RecordField shows its VISIBLE error + Retry (OD-REDESIGN-22 / D-C1). Swallowing the rejection
  // here made the field's commit resolve, wrongly rendering "Saved" on a failed write. Lifecycle
  // ACTION buttons (Mark complete / Reopen) are scoped below so their adapter catch can coexist
  // with a visible TaskSurface-level recovery cue.
  async function handleStatusChange(newStatus: TaskStatus) {
    if (!localTask) return
    const oldStatus = localTask.status
    const isLifecycleAction = lifecycleActionRef.current
    if (isLifecycleAction) setLifecycleStatusError(null)
    setLocalTask(t => t ? { ...t, status: newStatus } : t)
    onTaskChanged?.({ ...localTask, status: newStatus })  // sync the table row optimistically
    try {
      await updateTaskStatus(localTask.id, oldStatus, newStatus, viewerId)
      const refreshed = await getTask(localTask.id)
      setData(refreshed)
      setLocalTask(refreshed.task)
      setLocalChecklist(refreshed.checklist)
      onTaskChanged?.(refreshed.task)
      if (isLifecycleAction) setLifecycleStatusError(null)
      announce(t('tasks.feedback.statusChanged', { status: newStatus === 'Open' ? t('tasks.status.open') : newStatus === 'In Progress' ? t('tasks.status.inProgress') : newStatus === 'Blocked' ? t('tasks.status.blocked') : t('tasks.status.done') }))
    } catch (err) {
      setLocalTask(t => t ? { ...t, status: oldStatus } : t)
      onTaskChanged?.({ ...localTask, status: oldStatus })
      if (isLifecycleAction) setLifecycleStatusError(newStatus)
      announce(ROLLBACK_MSG)
      throw err instanceof Error ? err : new Error('updateTaskStatus failed')
    }
  }

  async function runLifecycleAction(run: () => Promise<void> | void) {
    lifecycleActionRef.current = true
    try {
      await run()
    } finally {
      lifecycleActionRef.current = false
    }
  }

  // ── Shared: refetch events after any mutation ────────────────────────────
  async function refetchEvents(id: string) {
    try {
      const refreshed = await getTask(id)
      setData(refreshed)
    } catch { /* non-critical — stale events are acceptable */ }
  }

  async function handlePostComment(body: string) {
    if (!localTask) return
    const actorId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
    const actorName = auth.status === 'authenticated' ? auth.viewer.person.full_name : ''
    await postComment({ entityType: 'task', entityId: localTask.id, body, actorId, actorName, locale })
    const loadedComments = await listComments({ entityType: 'task', entityId: localTask.id }).catch(() => comments)
    setComments(loadedComments)
  }

  // ── Domain-facing field commit (V3 Issue 5 DAL seam) ──────────────────────
  // RecordViewer/RecordField commit a domain-facing key (team/pic/supervisor/businessUnit/dueDate/…);
  // this is the ONE place the viewer key is translated to the storage column (the plan's
  // saveTaskViewerField switch — including the legacy responsible/accountable → PIC/Supervisor
  // storage-name mismatch, kept out of the vocabulary). It stays optimistic + rolls back, and
  // RE-THROWS on failure so RecordField shows its error/retry feedback.
  async function handleUpdateField(field: TaskViewerFieldKey, value: string | null) {
    if (!localTask) return
    const prev = { ...localTask }
    const prevTaskTeam = taskTeam
    const v = value === '' ? null : value
    const patch: TaskFieldsPatch & { team_id?: string | null } = {}
    const optimistic: Partial<TaskListRow> & { team_id?: string | null } = {}
    switch (field) {
      case 'team': {
        patch.team_id = v
        optimistic.team_id = v
        const selectedTeam = v ? teamDirectory.find((team) => team.id === v) : undefined
        const selectedBusinessUnitId = selectedTeam?.businessUnitId ?? selectedTeam?.business_unit_id
        if (selectedBusinessUnitId) {
          patch.business_unit_id = selectedBusinessUnitId
          optimistic.business_unit_id = selectedBusinessUnitId
        }
        setTaskTeam(v && selectedTeam ? toTaskTeamView(selectedTeam, busDirectory) : null)
        break
      }
      case 'pic': patch.responsible_person_id = v ?? ''; optimistic.responsible_person_id = v ?? ''; break
      case 'supervisor': patch.accountable_person_id = v ?? ''; optimistic.accountable_person_id = v ?? ''; break
      case 'businessUnit': patch.business_unit_id = v ?? ''; optimistic.business_unit_id = v ?? ''; break
      case 'dueDate': patch.due_date = v; optimistic.due_date = v; break
      case 'title': patch.title = v ?? ''; optimistic.title = v ?? ''; break
      case 'description': patch.description = v; optimistic.description = v; break
      case 'projectProcess': patch.work_line_id = v; optimistic.work_line_id = v; break
      case 'objective': patch.objective_id = v; optimistic.objective_id = v; break
    }
    const next = { ...localTask, ...optimistic }
    setLocalTask(next)
    onTaskChanged?.(next)
    try {
      const previousValue = field === 'pic' ? prev.responsible_person_id
        : field === 'supervisor' ? prev.accountable_person_id
          : field === 'dueDate' ? prev.due_date : null
      await updateTaskFields(localTask.id, patch, viewerId, previousValue)
      if (field === 'team') {
        const refreshed = await getTask(localTask.id)
        setData(refreshed)
        setLocalTask(refreshed.task)
        setLocalChecklist(refreshed.checklist)
        await getTeamsByIds([
          (refreshed.task as TaskListRow & { team_id?: string | null }).team_id ?? '',
        ]).then((teams) => setTaskTeam(toTaskTeamView(teams[0], busDirectory))).catch(() => {})
        onTaskChanged?.(refreshed.task)
      } else {
        await refetchEvents(localTask.id)
      }
      if (field === 'pic') announce(t('tasks.feedback.picReassigned'))
      else if (field === 'projectProcess') announce(t('tasks.feedback.workLineUpdated'))
      else if (field === 'objective') announce(t('tasks.feedback.objectiveUpdated'))
      // Other fields rely on RecordField's own visible Saving/Saved feedback.
    } catch (err) {
      setLocalTask(prev)
      if (field === 'team') setTaskTeam(prevTaskTeam)
      onTaskChanged?.(prev)
      announce(ROLLBACK_MSG)
      throw err instanceof Error ? err : new Error('updateTaskFields failed')
    }
  }

  // D-B2: the record has TWO unsaved-work sources — an in-flight RecordField edit AND a
  // typed-but-unposted comment. The host leave-guard must fire if EITHER is dirty, so combine them
  // (last-writer-wins would otherwise let a clean field report clobber a dirty comment).
  const fieldDirtyRef = useRef(false)
  const commentDirtyRef = useRef(false)
  const reportDirty = useCallback(() => {
    onDirtyChange?.(fieldDirtyRef.current || commentDirtyRef.current)
  }, [onDirtyChange])
  const handleDirtyChange = useCallback((dirty: boolean) => {
    fieldDirtyRef.current = dirty
    reportDirty()
  }, [reportDirty])
  const handleCommentDirtyChange = useCallback((dirty: boolean) => {
    commentDirtyRef.current = dirty
    reportDirty()
  }, [reportDirty])
  const handleCommentDraftChange = useCallback((draft: string) => {
    setCommentDraft(draft)
    // Set the host-visible ref synchronously with the textarea event. Escape or a route action in
    // the same turn must see the draft before CommentThread's effect reports its dirty state.
    commentDirtyRef.current = draft.trim().length > 0
    reportDirty()
  }, [reportDirty])
  const commentDraftTaskId = useRef(taskId)
  useEffect(() => {
    if (commentDraftTaskId.current === taskId) return
    commentDraftTaskId.current = taskId
    setCommentDraft('')
    commentDirtyRef.current = false
    reportDirty()
  }, [taskId, reportDirty])

  // The live Task surface uses the same RecordViewer anatomy in panel and page modes.
  // Domain-specific work remains a typed content slot (the existing Activity/Checklist/Notes
  // feed); identity, metadata, lifecycle, and actions are supplied by the real Task adapter.
  // The handler declarations below are intentionally omitted from this dependency list. Every
  // value captured by those handlers (task, checklist, comments, viewer, locale, and callbacks)
  // is already listed, so the adapter is rebuilt whenever any captured state changes without
  // turning the RecordField tree into a new draft baseline on unrelated renders.
  const taskViewerAdapter = useMemo<RecordViewerAdapter | null>(() => {
    if (!data || !localTask) return null
    const base = createTaskRecordAdapter({
      detail: { ...data, task: localTask, checklist: localChecklist },
      viewerId,
      downlineIds,
      people: peopleDirectory,
      businessUnits: busDirectory,
      objectives: objectivesDir,
      linkedObjective,
      workLines: workLinesDir,
      team: taskTeam,
      teamOptions: teamDirectory
        .map((team) => toTaskTeamView(team, busDirectory))
        .filter((team): team is TaskTeamView => team !== null),
      generatedFromLabel,
      // item 2: the record's Due uses the SAME formatter family as the table row ("Wed 8 Jul"),
      // never the raw ISO. The field's `value` stays ISO for the edit control.
      formatDate: (iso) => formatDate(iso, locale),
      formatCreatedAt: (iso) => formatDate(iso.slice(0, 10), locale),
      formatAge: (iso) => formatAge(iso, now, locale),
      now,
      labels: {
        businessUnit: t('tasks.field.businessUnit'),
        pic: t('tasks.pic'),
        supervisor: t('tasks.supervisor'),
        team: t('tasks.team'),
        teamUnassigned: t('tasks.field.teamUnassigned'),
        teamFromRecord: t('tasks.field.teamFromRecord'),
        teamMigration: t('tasks.field.teamMigration'),
        dueDate: t('tasks.dueLabel'),
        createdBy: t('tasks.field.createdBy'),
      },
      recordLabels: {
        typeLabel: t('tasks.label.task'),
        ownershipSection: t('tasks.ownership'),
        statusSection: t('tasks.statusTiming'),
        detailsSection: t('tasks.detailsTitle'),
        relatedSection: t('tasks.relatedTitle'),
        statusField: t('tasks.status.label'),
        statusOpen: t('tasks.status.open'),
        statusInProgress: t('tasks.status.inProgress'),
        statusBlocked: t('tasks.status.blocked'),
        statusDone: t('tasks.status.done'),
        descriptionField: t('tasks.create.description'),
        projectProcessField: t('tasks.filter.projectProcess'),
        objectiveField: t('tasks.objective'),
        overdueLabel: t('tasks.saved.overdue'),
        noneMarker: '—',
        markComplete: t('tasks.markComplete'),
        reopen: t('tasks.reopen'),
        archive: t('tasks.archive'),
        unarchive: t('tasks.unarchive'),
        readOnlyArchived: t('tasks.field.readOnlyArchived'),
        readOnlyNoPermission: t('tasks.field.readOnlyNoPermission'),
    generatedByField: t('tasks.field.generatedBy'),
    noObjective: t('tasks.noObjective'),
    adHoc: t('tasks.adHoc'),
        completedAtField: t('tasks.completedAt'),
      },
      onUpdateField: handleUpdateField,
      onUpdateStatus: handleStatusChange,
      onArchive: async () => { setShowConfirm(true) },
      onUnarchive: handleUnarchive,
      onOpenRelated,
    })
    const actions = base.actions.map((action) => (
      action.id === 'complete' || action.id === 'reopen'
        ? { ...action, run: () => runLifecycleAction(action.run) }
        : action
    ))
    // Work-first Task anatomy: description and checklist lead, followed by compact Task context,
    // discussion, then related records. Replace the adapter checklist/activity renderers with live
    // versions while preserving that order in both the drawer and full page.
    const checklistSlot: RecordContentSlot = {
      id: 'checklist',
      label: t('tasks.feed.checklist'),
      render: () => (
        <ChecklistCard
          items={localChecklist}
          canEdit={editable}
          taskId={localTask.id}
          viewerId={viewerId}
          onAdd={handleAddChecklist}
          onToggle={handleToggle}
          onReorder={handleReorder}
          onDelete={handleDeleteChecklist}
          saveError={checklistError
            ? { message: t('record.field.saveError'), onRetry: checklistError }
            : null}
        />
      ),
    }
    const activitySlot: RecordContentSlot = {
      id: 'activity',
      label: t('tasks.feed.activity'),
      render: () => (
        <TaskActivity
          events={data.events}
          comments={comments}
          people={peopleDirectory}
          now={now}
          editable={editable}
          onPostComment={handlePostComment}
          commentDraft={commentDraft}
          onCommentDraftChange={handleCommentDraftChange}
          onCommentDirtyChange={handleCommentDirtyChange}
        />
      ),
    }
    const contentSlots = base.contentSlots.map((slot) =>
      slot.id === 'checklist' ? checklistSlot : slot.id === 'activity' ? activitySlot : slot,
    )
    return {
      ...base,
      actions,
      contentSlots,
      footerContent: (
        <AskDeputyAction
          variant="footer"
          draft={t('assistant.askAbout.task', { title: localTask.title })}
          label={t('assistant.askAbout.taskLabel')}
          helper={t('assistant.askAbout.taskHelper')}
        />
      ),
    }
  // Handler identities are intentionally excluded; their captured state is represented above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onOpenRelated, data, localTask, localChecklist, viewerId, downlineIds, peopleDirectory, busDirectory, commentDraft,
    objectivesDir, linkedObjective, workLinesDir, teamDirectory, taskTeam, generatedFromLabel, comments, now, editable, t, locale,
    checklistError,
  ])

  const commitField = createTaskFieldCommit({
    onUpdateField: handleUpdateField,
    onUpdateStatus: handleStatusChange,
  })

  // ── Checklist add ────────────────────────────────────────────────────────
  async function handleAddChecklist(label: string) {
    if (!localTask) return
    setChecklistError(null)
    const position = localChecklist.length
    const newItem: ChecklistItemRow = {
      id: `optimistic-${Date.now()}`, org_id: '', task_id: localTask.id,
      label, is_done: false, position,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }
    setLocalChecklist(prev => [...prev, newItem])
    try {
      await addChecklistItem(localTask.id, label, position, viewerId)
      await refetchEvents(localTask.id)
      announce(t('tasks.feedback.checklistAdded'))
    } catch {
      setLocalChecklist(prev => prev.filter(i => i.id !== newItem.id))
      announce(ROLLBACK_MSG)
      setChecklistError(() => () => { void handleAddChecklist(label) })
    }
  }

  // ── Checklist toggle ─────────────────────────────────────────────────────
  async function handleToggle(itemId: string, isDone: boolean) {
    if (!localTask) return
    setChecklistError(null)
    setLocalChecklist(prev => prev.map(i => i.id === itemId ? { ...i, is_done: isDone } : i))
    try {
      await toggleChecklistItem(itemId, isDone, localTask.id, viewerId)
      await refetchEvents(localTask.id)
      announce(isDone ? t('tasks.feedback.checklistCompleted') : t('tasks.feedback.checklistReopened'))
    } catch {
      setLocalChecklist(prev => prev.map(i => i.id === itemId ? { ...i, is_done: !isDone } : i))
      announce(ROLLBACK_MSG)
      setChecklistError(() => () => { void handleToggle(itemId, isDone) })
    }
  }

  // ── Checklist reorder ────────────────────────────────────────────────────
  async function handleReorder(itemId: string, direction: 'up' | 'down') {
    const idx = localChecklist.findIndex(i => i.id === itemId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= localChecklist.length) return

    const prev = localChecklist
    const next = [...localChecklist]
    const swapId = next[swapIdx].id
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    const reindexed = next.map((item, i) => ({ ...item, position: i }))
    setLocalChecklist(reindexed)
    try {
      await reorderChecklistItem(itemId, swapIdx)
      await reorderChecklistItem(swapId, idx)
    } catch {
      setLocalChecklist(prev)
    }
  }

  // ── Checklist delete ─────────────────────────────────────────────────────
  async function handleDeleteChecklist(itemId: string) {
    if (!localTask) return
    setChecklistError(null)
    const prev = localChecklist
    setLocalChecklist(p => p.filter(i => i.id !== itemId))
    try {
      await deleteChecklistItem(itemId, localTask.id, viewerId)
      await refetchEvents(localTask.id)
      announce(t('tasks.feedback.checklistRemoved'))
    } catch {
      setLocalChecklist(prev)
      announce(ROLLBACK_MSG)
      setChecklistError(() => () => { void handleDeleteChecklist(itemId) })
    }
  }

  // ── Archive/unarchive ────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false)
  const [archiveFailure, setArchiveFailure] = useState<'archive' | 'unarchive' | null>(null)
  async function handleArchive() {
    if (!localTask) return
    try {
      setArchiveFailure(null)
      await archiveTask(localTask.id, viewerId)
      onTaskArchived?.(localTask.id)  // I3: let the table drop the row + decrement the count
      if (onClose) onClose()
      else navigate({ pathname: '/work/tasks', search: location.search })
    } catch { setArchiveFailure('archive') }
  }
  async function handleUnarchive() {
    if (!localTask) return
    try {
      setArchiveFailure(null)
      await unarchiveTask(localTask.id, viewerId)
      setLocalTask(t => t ? { ...t, archived_at: null } : t)
      load()
    } catch { setArchiveFailure('unarchive') }
  }

  const archiveFeedback = archiveFailure && (
    <div className="task-lifecycle-error" role="alert">
      <span>{t('record.field.saveError')}</span>
      <button type="button" className="btn btn-ghost" onClick={() => void (archiveFailure === 'archive' ? handleArchive() : handleUnarchive())}>
        {t('record.field.retry')}
      </button>
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return <DetailSkeleton />

  if (notFound || !localTask) {
    // The shared EmptyState primitive, not a bespoke `.not-found-panel`: it already carries
    // the SAME horizontal inset as the panel header (CardHead.css `.error-state`/`.empty-state`:
    // 16px 20px, the family `.card-head` uses), so a fix to that inset applies here too — and
    // in the one place Signals' panel bodies read it from.
    // `autoFocus` lands screen-reader/keyboard focus on THIS heading once it mounts — the record
    // panel's own generic open-focus effect runs before the record fetch resolves (nothing to
    // focus yet) and would otherwise leave focus stranded on unrelated chrome (an icon-only
    // header button) once this body appears a tick later.
    return (
      <EmptyState
        variant="blank"
        nested
        autoFocus
        // R-T-3: when a shell PageFamilyFrame owns the page h1 (focused-record page,
        // identityHeadingLevel=2), the not-found title nests as an h2 so there is no double-h1;
        // the default full-width host keeps it an h1.
        headingLevel={identityHeadingLevel === 2 ? 2 : 1}
        title={t('tasks.notFound.title')}
        copy={t('tasks.notFound.copy')}
      >
        <Link to={{ pathname: '/work/tasks', search: location.search }} className="btn btn-outline">{t('tasks.all')}</Link>
      </EmptyState>
    )
  }

  const task = localTask

  function retryLifecycleStatus() {
    const targetStatus = lifecycleStatusError
    if (!targetStatus) return
    void runLifecycleAction(() => handleStatusChange(targetStatus)).catch(() => {})
  }

  const lifecycleStatusFeedback = lifecycleStatusError ? (
    <div className="record-field__error task-lifecycle-error" role="alert" data-testid="task-lifecycle-error">
      <span>{t('tasks.feedback.rollback')}</span>
      <Button variant="outline" className="record-field__retry" onClick={retryLifecycleStatus}>
        {t('record.field.retry')}
      </Button>
      <Button variant="ghost" className="record-field__retry" onClick={() => setLifecycleStatusError(null)}>
        {t('record.close')}
      </Button>
    </div>
  ) : null

  // Open-full-page target for the panel (drawer) utility bar. The RecordPanelHost route host may
  // not supply onOpenPage; a tenant opened from another surface (Inbox/Follow-ups via the
  // OverlayHostSlot) supplies it explicitly. In panel mode without an explicit callback we fall
  // back to the canonical task page route. GAP-2 (OD-91 #7): "Open full page" is the ONE escalation.
  const openPageTarget = presentation === 'panel'
    ? (onOpenPage ?? (() => navigate({ pathname: `/work/tasks/${task.id}`, search: location.search }, { state: { taskSurface: 'page' } })))
    : undefined
  const closeTarget = () => (onClose ? onClose() : navigate({ pathname: '/work/tasks', search: location.search }))

  // ── Drawer width: the shared RecordViewer owns identity, metadata, content and actions ──
  if (width === 'drawer') {
    return (
      <div className="dw-surface">
        <div className="sr-only" aria-live="polite" role="status">{liveMessage}</div>
        {/* Utility bar — host-owned chrome around the canonical RecordViewer (NOT the old
            TaskDrawerHeader composition: identity/status/ownership/actions live in the viewer).
            GAP-2 (OD-91 #7): expand-in-place is retired — Open full page · Close (no width toggle).
            Suppressed when the overlay host owns its own chrome (showPanelUtility=false). */}
        {showPanelUtility && (
          <div className="dw-bar">
            <span className="dw-crumb-mini">{t('tasks.label.task')}</span>
            <span className="dw-bar-spacer" />
            {openPageTarget && (
              <button type="button" className="dw-open-page" onClick={openPageTarget}>
                {t('tasks.openFullPage')}
              </button>
            )}
            <button
              type="button"
              className="dw-iconbtn"
              aria-label={t('tasks.close')}
              title={t('tasks.close')}
              onClick={closeTarget}
            >
              <CloseIcon />
            </button>
          </div>
        )}
        {isArchived && (
          <div className="archived-banner" role="status">
            <span>{t('tasks.archivedBanner')}</span>
          </div>
        )}
        {lifecycleStatusFeedback}
        {archiveFeedback}

        {taskViewerAdapter && (
          <div className="record-details record-details-compact" data-testid="record-details">
            <RecordViewer
              adapter={taskViewerAdapter}
              mode="panel"
              canonicalHref={canonicalHref}
              headingLevel={2}
              onDirtyChange={handleDirtyChange}
              onCommitField={commitField}
              fieldCommitsFrozen={fieldCommitsFrozen}
            />
          </div>
        )}

        {showConfirm && (
          <ConfirmArchive
            onConfirm={() => { setShowConfirm(false); handleArchive() }}
            onCancel={() => setShowConfirm(false)}
          />
        )}
      </div>
    )
  }

  // ── Full width: the single-column record document (E7 canonical) ───────────
  // Work-first anatomy: the WHOLE record renders through the ONE shared RecordViewer in a single
  // column — description → checklist → owner/due context → discussion → related records. Every slot is ordered, so
  // the earlier two-column split (a details adapter with contentSlots withheld, stacked above the
  // feed rendered separately in .record-feed-col) is gone: the content now LEADS instead of the
  // metadata region painting ahead of it. It never reintroduces a bespoke fields panel
  // (RecordDetailsPanel is deleted and stays deleted).
  return (
    <>
      <div className="sr-only" aria-live="polite" role="status">{liveMessage}</div>

      {/* Record chrome — P1-2 (Luna: record identity behind a generic page head + utility strip
          at y≈234, vs E7's compact y≈124). ONE compact row: a Back affordance on the leading
          edge, the record actions (Ask Deputy, collapse-to-split/close) trailing — no separate
          page head above it (tasks-layout.tsx TaskRecordPage passes hideHead). GAP-2 (OD-91 #7):
          expand-in-place is retired, so there is no width toggle here; the only reversal offered is
          collapse-back-to-split (the inverse of "Open full page"). A standalone full-page route host
          (TaskRecordPage) passes neither onClose nor onCollapseToSplit, so this row is the ONLY
          header the record has: its leading edge is a real Back-to-collection affordance, and it
          still carries the record-scoped Ask Deputy affordance (E7 floor F3, J05). */}
      {showPanelUtility && (
        <div className="dw-bar record-chrome">
          {onClose ? (
            <span className="dw-crumb-mini">{t('tasks.label.task')}</span>
          ) : (
            <Link
              to={{ pathname: '/work/tasks', search: location.search }}
              className="dw-iconbtn"
              aria-label={t('record.back')}
              title={t('record.back')}
            >
              <BackIcon />
            </Link>
          )}
          <span className="dw-bar-spacer" />
          <AskDeputyAction draft={t('assistant.askAbout.task', { title: task.title })} />
          {/* R6(a): the inverse of "Open full page" — collapse this standalone page back to the
              split drawer over the table (the "resize back to drawer" the owner asked for), so the
              full page is never a dead end whose only exit is back to the bare table. */}
          {onCollapseToSplit && (
            <button
              type="button"
              className="dw-iconbtn dw-collapse-split"
              aria-label={t('tasks.backToSplit')}
              title={t('tasks.backToSplit')}
              onClick={() => onCollapseToSplit()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
              </svg>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="dw-iconbtn"
              aria-label={t('tasks.close')}
              title={t('tasks.close')}
              onClick={() => onClose()}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      )}

      {/* AC-R05: archived banner + Unarchive sit above the record document */}
      {isArchived && (
        <div className="archived-banner" role="status">
          <span>{t('tasks.archivedBanner')}</span>
        </div>
      )}
      {lifecycleStatusFeedback}
        {archiveFeedback}

      {taskViewerAdapter && (
        <div className="record-doc">
          <div className="record-details" data-testid="record-details">
            <RecordViewer
              adapter={taskViewerAdapter}
              mode="page"
              canonicalHref={canonicalHref}
              headingLevel={identityHeadingLevel ?? 1}
              onDirtyChange={handleDirtyChange}
              onCommitField={commitField}
              fieldCommitsFrozen={fieldCommitsFrozen}
            />
          </div>
        </div>
      )}

      {/* Archive confirm */}
      {showConfirm && (
        <ConfirmArchive
          onConfirm={() => { setShowConfirm(false); handleArchive() }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

// ── Create mode ────────────────────────────────────────────────────────────────
function CreateSurface({ width, onTaskCreated, onDirtyChange, onRequestLeave, showPanelUtility = true, createInitialValues, createRedirect }: TaskSurfaceProps) {
  const navigate = useNavigate()
  const auth = useAuth()
  const t = useT()
  const inDrawer = width === 'drawer'
  // AC-125 / FR-123: "+ Add task" from a group header deep-links the grouped
  // dimension via query params (?r=<personId> / ?bu=<buId>). `bu` is retained as a
  // compatibility hint and is resolved to a real viewer Team after the directory loads;
  // it is never rendered or submitted as a Team value.
  // Note: Status groups do NOT pass ?status= — CreateSurface has no status field;
  // all new tasks open as "Open". Only PIC (r=) and Team (bu=) pre-fills are read.
  const [searchParams] = useSearchParams()
  const prefillR = createInitialValues?.responsiblePersonId ?? searchParams.get('createPic') ?? searchParams.get('r') ?? ''
  const prefillBu = createInitialValues?.businessUnitId ?? searchParams.get('createBu') ?? searchParams.get('bu') ?? ''
  const prefillTitle = createInitialValues?.title ?? searchParams.get('createTitle') ?? ''
  const collectionParams = new URLSearchParams(searchParams)
  collectionParams.delete('r')
  collectionParams.delete('bu')
  const collectionSearch = collectionParams.toString()
  const collectionSearchString = collectionSearch ? `?${collectionSearch}` : ''

  // Viewer details
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : ''

  // Directory
  const [peopleDirectory, setPeopleDirectory] = useState<PersonOption[]>([])
  const [teamDirectory, setTeamDirectory] = useState<DirectoryTeamOption[]>([])
  const [dirLoading, setDirLoading] = useState(true)
  const [objectivesDir, setObjectivesDir] = useState<ObjectiveRow[]>([])
  const [workLinesDir, setWorkLinesDir] = useState<WorkLineRow[]>([])
  const prefillTeamId = searchParams.get('team') ?? ''

  useEffect(() => {
    const teamsPromise = getPersonTeams(viewerId).catch(() => [])
    Promise.all([getBusinessUnits(), getPeople(), teamsPromise]).then(([, people, teams]) => {
      setPeopleDirectory(people)
      setTeamDirectory(teams)
      setDirLoading(false)
    }).catch(() => setDirLoading(false))
    // Non-blocking catalog loads — a slow catalog must never block the form.
    listObjectives().then(setObjectivesDir).catch(() => {})
    listWorkLines().then(setWorkLinesDir).catch(() => {})
  }, [viewerId])

  // ── Form state ────────────────────────────────────────────────────────────
  // Pre-fill from the group "+ Add task" deep-link (AC-125) takes precedence over
  // the creator-default; absent param → today's creator-default behavior.
  const [title, setTitle] = useState(prefillTitle)
  const [teamId, setTeamId] = useState(prefillTeamId)
  const [responsiblePersonId, setResponsiblePersonId] = useState(prefillR || viewerId)
  // Supervisor starts EMPTY, deliberately not defaulted to the creator/PIC (OD-REDESIGN-3/14/41 —
  // PIC and Supervisor are distinct accountable roles; auto-collapsing them defeats the model).
  // CONTEXT.md's Supervisor resolution order is explicit selection → generated-Task override →
  // parent Project/Process A → PIC's direct manager (role matching Task BU) → PIC when no manager
  // exists — but resolving "PIC's manager" needs a person→role→reports-to lookup this surface has
  // no directory call for (only the viewer's OWN roles are known here, and the PIC can be reassigned
  // to anyone). Rather than fabricate a default from data this form doesn't have, Supervisor is a
  // required, explicit choice — the first, always-correct step of that same resolution order.
  const [accountablePersonId, setAccountablePersonId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [workLineId, setWorkLineId] = useState('')
  const [objectiveId, setObjectiveId] = useState('')
  // F17 (OD-REDESIGN-91 #29): the optional Project/Process + Objective context pickers stay hidden
  // behind ONE "+ Add context" reveal — a task needs a title, PIC, and supervisor; strategy
  // attribution is deliberate, not a wall of defaulted selects. Once revealed it stays open.
  const [contextRevealed, setContextRevealed] = useState(false)

  const selectedTeam = teamDirectory.find((team) => team.id === teamId)
  const businessUnitId = selectedTeam?.businessUnitId ?? selectedTeam?.business_unit_id ?? ''

  // D-B1: dirty = the user has started composing (any field the user has touched). Programmatic
  // prefills (viewer Team/PIC defaults) set state directly, never through markDirty, so an
  // untouched create drawer stays clean and closes without a confirm. Bubbled to the host
  // (TaskDrawer) so its leave-guard can prompt before a typed draft is discarded on Escape/close.
  const [dirty, setDirty] = useState(false)
  const markDirty = () => setDirty((was) => (was ? was : true))
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  // Resolve compatibility deep-links/defaults to the first real Team the viewer can choose.
  // A concrete `team` deep-link wins, then a legacy BU hint narrows the directory, and finally
  // the first viewer Team gives the required field a useful starting point.
  useEffect(() => {
    if (teamId || teamDirectory.length === 0) return
    const next = teamDirectory.find((team) => team.id === prefillTeamId)
      ?? teamDirectory.find((team) => (team.businessUnitId ?? team.business_unit_id) === prefillBu)
      ?? teamDirectory[0]
    if (next) setTeamId(next.id)
  }, [prefillBu, prefillTeamId, teamDirectory, teamId])

  // ── Validation state ──────────────────────────────────────────────────────
  // AC-108: inline-validate-ON-BLUR (design-plan §7) — a required field flags the
  // moment focus leaves it empty, not only on submit. Typing clears the error.
  const [titleError, setTitleError] = useState('')
  const [buError, setBuError] = useState('')
  // Supervisor is now empty by default (see accountablePersonId above), so — unlike PIC, which
  // always carries a viewer/prefill default — it needs the same on-blur + submit-time required
  // validation Title/Team already get; an unvalidated required asterisk would be decorative.
  const [supervisorError, setSupervisorError] = useState('')

  function validateTitleOnBlur() {
    setTitleError(title.trim() ? '' : t('tasks.create.titleRequired'))
  }
  function validateBuOnBlur() {
    setBuError(teamId ? '' : t('tasks.create.teamRequired'))
  }
  function validateSupervisorOnBlur() {
    setSupervisorError(accountablePersonId ? '' : t('tasks.create.supervisorRequired'))
  }

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Validate
    let valid = true
    if (!title.trim()) {
      setTitleError(t('tasks.create.titleRequired'))
      valid = false
    } else {
      setTitleError('')
    }
    if (!teamId) {
      setBuError(t('tasks.create.teamRequired'))
      valid = false
    } else {
      setBuError('')
    }
    if (!accountablePersonId) {
      setSupervisorError(t('tasks.create.supervisorRequired'))
      valid = false
    } else {
      setSupervisorError('')
    }
    if (!valid) return

    setSubmitting(true)
    setSubmitError('')
    try {
      const input = {
        title: title.trim(),
        businessUnitId,
        teamId: teamId || null,
        responsiblePersonId,
        accountablePersonId,
        createdBy: viewerId,
        description: description.trim() || undefined,
        dueDate: dueDate || null,
        workLineId: workLineId || null,
        objectiveId: objectiveId || null,
      } as CreateTaskInput & { teamId?: string | null }
      const newId = await createTask(input)
      // The create succeeded: this is no longer an unsaved draft, so the destination record must
      // NOT trip the host leave-guard as we navigate onto it.
      setDirty(false)
      // A host may need to finish an async hand-off (for example, link this new Task back to the
      // Signal that opened the composer) before it can decide whether to close. Await that hand-off
      // so a failed relationship write cannot strand this create surface in `submitting=true`.
      await onTaskCreated?.(newId)  // C2: let the table refetch so the new row appears + count updates
      setSubmitting(false)
      // GAP-6 (OD-REDESIGN-91 #11): after-create returns to the ORIGINATING collection with the
      // new row highlighted (a brief accent that fades) — Tasks changes to match the app-wide rule
      // (it used to open the new record in the drawer). The `?highlight=<id>` param tells the
      // collection which row to flash; it preserves the collection's view query.
      const highlightParams = new URLSearchParams(collectionSearchString)
      highlightParams.set('highlight', newId)
      if (createRedirect !== undefined) {
        if (createRedirect !== null) navigate(createRedirect)
      } else {
        navigate({ pathname: '/work/tasks', search: `?${highlightParams.toString()}` })
      }
    } catch {
      setSubmitError(t('tasks.create.error'))
      setSubmitting(false)
    }
  }

  // GAP-2 (OD-91 #7): expand-in-place is retired — create mode holds a fixed width too, so the
  // chrome bar carries only the title + the one ✕ (no width toggle).
  const closeToCollection = () => navigate({ pathname: '/work/tasks', search: collectionSearchString })
  // D-B1: the create form's own leave controls (chrome ✕ / Cancel) defer to the host leave-guard
  // when one is present (TaskDrawer), so a typed draft prompts a discard confirm instead of
  // vanishing. Standalone (no host) the leave runs directly, unchanged.
  const requestClose = () => (onRequestLeave ? onRequestLeave(closeToCollection) : closeToCollection())

  // Issue 300: a first click on Cancel must ALWAYS cancel. With a focused dirty field, the
  // browser's click sequence is pointerdown → blur → pointerup → click — and the blur-triggered
  // validation (validate*OnBlur above) inserts an error line ABOVE the action row, moving Cancel
  // out from under the pointer between down and up, so no click event ever reaches the button.
  // Firing on POINTERDOWN runs the cancel before the blur relayout can move anything. The click
  // handler serves ONLY keyboard/AT activation, recognized statelessly by detail === 0 (Enter/
  // Space synthesize a click with no pointer sequence) — a pointer press's own click (detail ≥ 1)
  // is ignored so one press can never cancel twice, and there is no suppression state to go stale
  // when a dirty-guard dialog swallows the pointerup.
  const handleCancelPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    requestClose()
  }
  const handleCancelClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) requestClose()
  }

  const closeBtn = (
    <button
      type="button"
      className="dw-iconbtn"
      aria-label={t('tasks.close')}
      title={t('tasks.close')}
      onClick={requestClose}
    >
      <CloseIcon />
    </button>
  )
  // DO-4 (census-sweep R2, task-create F1): when the overlay host owns the chrome
  // (showPanelUtility=false — same contract ViewSurface already honors), the surface renders NO
  // bar of its own. Before this, RecordPanelHost's "Create task ✕" bar and this near-identical
  // bar stacked (~92–120px of pure duplication, two same-named close buttons on one dismiss
  // axis). The host carries the title and the one ✕.
  const chromeBar = showPanelUtility ? (
    <div className={inDrawer ? 'dw-bar' : 'dw-bar record-chrome'}>
      <span className="dw-crumb-mini">{t('tasks.create.new')}</span>
      <span className="dw-bar-spacer" />
      {closeBtn}
    </div>
  ) : null

  const actionButtons = (
    <>
      <button
        type="button"
        className="btn btn-outline"
        onPointerDown={handleCancelPointerDown}
        onClick={handleCancelClick}
      >
        {t('tasks.cancel')}
      </button>
      <button
        type="submit"
        className="btn btn-primary"
        disabled={submitting}
        aria-busy={submitting}
      >
        {submitting ? t('tasks.create.submitting') : t('tasks.create.submit')}
      </button>
    </>
  )

  // F1: the create form is a scrolling body + a pinned action foot, mirroring the
  // ViewSurface drawer anatomy (`.dw-bar` header · `.dw-tabpane` scroll body · `.dw-foot`).
  // Before this, the drawer variant rendered a plain <form> whose overflow:auto never
  // bounded (no flex-basis), so `.dw-surface`'s overflow:hidden simply clipped the tail of
  // a long form — the Cancel/Create row fell below the fold with no scrollbar to reach it
  // at split-view heights (1280×800 and up). Keeping the actions in a pinned foot guarantees
  // the primary CTA is always reachable regardless of form length or viewport height.
  const formMarkup = (
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label={t('tasks.create.form')}
        className={inDrawer ? 'tc-create-form' : undefined}
      >
        <div className={inDrawer ? 'dw-tabpane tc-create-body' : undefined}>
        {submitError && (
          <div role="alert" className="tc-submit-error">
            {submitError}
          </div>
        )}

        {/* Title */}
        <div className="tc-field">
          <label htmlFor="task-title" className="tc-label">
            {t('tasks.create.title')} <span aria-hidden="true" className="tc-required">*</span>
          </label>
          <TextInput
            id="task-title"
            type="text"
            className="tc-input tap-floor"
            fullWidth
            error={Boolean(titleError)}
            value={title}
            onChange={e => { setTitle(e.target.value); markDirty(); if (titleError) setTitleError('') }}
            onBlur={validateTitleOnBlur}
            aria-required="true"
            aria-describedby={titleError ? 'title-err' : undefined}
            placeholder={t('tasks.create.titlePlaceholder')}
            disabled={submitting}
            aria-label={t('tasks.create.title')}
          />
          {titleError && (
            <span id="title-err" role="alert" className="tc-field-error">{titleError}</span>
          )}
        </div>

        {/* Team */}
        <div className="tc-field">
          <label htmlFor="task-team" className="tc-label">
            {t('tasks.team')} <span aria-hidden="true" className="tc-required">*</span>
          </label>
          {dirLoading ? (
            /* DO-15(b,c) (census R2 F4/F5): the shared LoadingShell grammar (role=status +
               skeleton), with the DIRECTORY-scoped noun — this field loads teams, not tasks. */
            <LoadingShell count={1} className="tc-loading-field" label={t('tasks.create.loadingTeams')} />
          ) : (
            <Picker
              id="task-team"
              label={t('tasks.team')}
              className="tc-picker"
              fullWidth
              hideLabel
              error={Boolean(buError)}
              value={teamId}
              options={[
                { value: '', label: t('tasks.create.teamPlaceholder') },
                ...teamDirectory.map((team) => ({ value: team.id, label: team.name })),
              ]}
              onChange={value => { setTeamId(value); markDirty(); if (buError) setBuError('') }}
              onBlur={validateBuOnBlur}
              required
              describedBy={buError ? 'bu-err' : undefined}
              disabled={submitting}
            />
          )}
          {buError && (
            <span id="bu-err" role="alert" className="tc-field-error">{buError}</span>
          )}
        </div>

        {/* PIC — pre-filled to creator, editable. H10 fix: PIC/Supervisor are unexplained domain
            terms for a new user — a "?" help affordance reuses KPITile's own button + aria-label
            grammar (kpi-tile.tsx), the app's existing precedent, rather than inventing a new help
            control. Fix wave item 3: kpi-tile's tooltip BODY relies on the bare `title` attribute,
            a native browser tooltip that never renders visibly to a reviewer driving the app (see
            TaskSurface.css .tc-help-bubble comment) — `.tc-help-wrap`/`.tc-help-bubble` give the
            body a real, on-hover-and-focus DOM popover using the row-menu's existing chrome. */}
        <div className="tc-field">
          <span className="tc-label-row">
            <label htmlFor="task-responsible" className="tc-label">
              {t('tasks.pic')} <span aria-hidden="true" className="tc-required">*</span>
            </label>
            <span className="tc-help-wrap">
              <button
                type="button"
                className="tc-help tap-target-phone--icon"
                aria-label={t('tasks.pic.help')}
              >
                ?
              </button>
              <span className="tc-help-bubble" role="tooltip" aria-hidden="true">{t('tasks.pic.help')}</span>
            </span>
          </span>
          {dirLoading ? (
            <LoadingShell count={1} className="tc-loading-field" label={t('tasks.create.loadingPeople')} />
          ) : (
            <Picker
              id="task-responsible"
              label={t('tasks.pic')}
              className="tc-picker"
              fullWidth
              hideLabel
              value={responsiblePersonId}
              options={peopleDirectory.map(p => ({ value: p.id, label: p.full_name }))}
              onChange={value => { setResponsiblePersonId(value); markDirty() }}
              disabled={submitting}
              required
            />
          )}
        </div>

        {/* Supervisor — genuinely empty by default, a required explicit choice (see
            accountablePersonId above); no longer silently pre-filled to the creator/PIC. */}
        <div className="tc-field">
          <span className="tc-label-row">
            <label htmlFor="task-accountable" className="tc-label">
              {t('tasks.supervisor')} <span aria-hidden="true" className="tc-required">*</span>
            </label>
            <span className="tc-help-wrap">
              <button
                type="button"
                className="tc-help tap-target-phone--icon"
                aria-label={t('tasks.supervisor.help')}
              >
                ?
              </button>
              <span className="tc-help-bubble" role="tooltip" aria-hidden="true">{t('tasks.supervisor.help')}</span>
            </span>
          </span>
          {dirLoading ? (
            <LoadingShell count={1} className="tc-loading-field" label={t('tasks.create.loadingPeople')} />
          ) : (
            <Picker
              id="task-accountable"
              label={t('tasks.supervisor')}
              className="tc-picker"
              fullWidth
              hideLabel
              error={Boolean(supervisorError)}
              value={accountablePersonId}
              options={[
                { value: '', label: t('tasks.create.supervisorPlaceholder') },
                ...peopleDirectory.map(p => ({ value: p.id, label: p.full_name })),
              ]}
              onChange={value => { setAccountablePersonId(value); markDirty(); if (supervisorError) setSupervisorError('') }}
              onBlur={validateSupervisorOnBlur}
              disabled={submitting}
              required
              describedBy={supervisorError ? 'supervisor-err' : undefined}
            />
          )}
          {supervisorError && (
            <span id="supervisor-err" role="alert" className="tc-field-error">{supervisorError}</span>
          )}
        </div>

        {/* F17 (OD-91 #29): the optional Project/Process + Objective pickers live behind ONE
            "+ Add context" reveal. Collapsed by default (a task needs only title/PIC/supervisor);
            the reveal is offered only when at least one context lookup has arrived. Once opened it
            stays open so a chosen attribution never hides itself. */}
        {(workLinesDir.length > 0 || objectivesDir.length > 0) && !contextRevealed && (
          <button
            type="button"
            className="tc-add-context"
            onClick={() => setContextRevealed(true)}
            disabled={submitting}
          >
            {t('tasks.create.addContext')}
          </button>
        )}

        {contextRevealed && (
          <>
            {/* Project/Process (optional) — non-blocking; renders once lookups arrive.
                UI term is Project/Process (OD-C-2 / ADR-0015); table stays mos.work_lines. */}
            {workLinesDir.length > 0 && (
              <div className="tc-field">
                <label htmlFor="task-workline" className="tc-label">{t('tasks.filter.projectProcess')}</label>
                <Picker
                  id="task-workline"
                  label={t('tasks.filter.projectProcess')}
                  className="tc-picker"
                  fullWidth
                  hideLabel
                  value={workLineId}
                  options={[
                    { value: '', label: t('tasks.create.none') },
                    ...workLinesDir.map(wl => ({
                      value: wl.id,
                      label: `${wl.name} (${wl.type === 'project' ? t('tasks.type.project') : t('tasks.type.daily')})`,
                    })),
                  ]}
                  onChange={value => { setWorkLineId(value); markDirty() }}
                  disabled={submitting}
                />
              </div>
            )}

            {/* Objective (optional) — non-blocking; renders once lookups arrive */}
            {objectivesDir.length > 0 && (
              <div className="tc-field">
                <label htmlFor="task-objective" className="tc-label">{t('tasks.objective')}</label>
                <Picker
                  id="task-objective"
                  label={t('tasks.objective')}
                  className="tc-picker"
                  fullWidth
                  hideLabel
                  value={objectiveId}
                  options={[
                    { value: '', label: t('tasks.create.none') },
                    ...objectivesDir.map(obj => ({ value: obj.id, label: obj.name })),
                  ]}
                  onChange={value => { setObjectiveId(value); markDirty() }}
                  disabled={submitting}
                />
              </div>
            )}
          </>
        )}

        {/* Due date (optional) */}
        <div className="tc-field">
          <label htmlFor="task-due" className="tc-label">{t('tasks.create.dueDate')}</label>
          <DateField
            id="task-due"
            className="tc-date"
            fullWidth
            value={dueDate}
            onChange={(v) => { setDueDate(v); markDirty() }}
            disabled={submitting}
            aria-label={t('tasks.create.dueDate')}
          />
        </div>

        {/* Description (optional) */}
        <div className="tc-field">
          <label htmlFor="task-desc" className="tc-label">{t('tasks.create.description')}</label>
          <textarea
            id="task-desc"
            className="tc-textarea"
            value={description}
            onChange={e => { setDescription(e.target.value); markDirty() }}
            rows={3}
            placeholder={t('tasks.create.descriptionPlaceholder')}
            disabled={submitting}
          />
        </div>

        </div>

        {/* Actions — pinned foot in the drawer (always reachable); inline divider on the page. */}
        {inDrawer ? (
          <div className="dw-foot tc-create-foot">{actionButtons}</div>
        ) : (
          <div className="tc-actions">{actionButtons}</div>
        )}
      </form>
  )

  if (inDrawer) {
    return (
      <div className="dw-surface tc-create-drawer">
        {chromeBar}
        {formMarkup}
      </div>
    )
  }
  return (
    <>
      {chromeBar}
      <div className="tc-card">{formMarkup}</div>
    </>
  )
}
