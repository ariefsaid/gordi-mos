import './TaskSurface.css'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/use-auth'
import {
  getTask, createTask,
  updateTaskStatus, updateTaskFields,
  addChecklistItem, toggleChecklistItem, reorderChecklistItem, deleteChecklistItem,
  archiveTask, unarchiveTask,
} from '@/lib/db/tasks'
import type { TaskDetail as TaskDetailData, CreateTaskInput, TaskFieldsPatch } from '@/lib/db/tasks'
import type { TaskListRow, TaskStatus, ChecklistItemRow } from '@/lib/db/tasks.types'
import { getBusinessUnits, getPeople } from '@/lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '@/lib/db/directory'
import { listComments, postComment, type CommentRow } from '@/lib/comments/postComment'
import { listObjectives } from '@/lib/db/objectives'
import { listWorkLines } from '@/lib/db/work-lines'
import { listTaskDefs } from '@/lib/db/processes'
import type { ObjectiveRow } from '@/lib/db/objectives'
import type { WorkLineRow } from '@/lib/db/work-lines'
import { ConfirmArchive } from './confirm-archive'
import { canEdit } from './task-permissions'
import { createTaskRecordAdapter, createTaskFieldCommit, type TaskViewerFieldKey } from './task-record-adapter'
import { RecordViewer } from '@/components/records/record-viewer'
import type { RecordContentSlot, RecordViewerAdapter } from '@/components/records/record-viewer.types'
import { RecordFeed } from './record-feed'
import type { FeedTab } from './record-feed'
import { useTabMemory } from './use-tab-memory'
import type { TabKey } from './use-tab-memory'
import { useT } from '@/i18n/use-t'
import { CloseIcon } from '@/shell/icons'

// Feed tabs ride the per-task useTabMemory store (ADR-0013 D3 — reuse, no new
// persistence). The two stores name the same three panes differently, so map
// between them explicitly (clearer than nested ternaries):
//   slot 'details'  ↔ feed 'activity' (the default pane)
//   slot 'checklist'↔ feed 'checklist'
//   slot 'activity' ↔ feed 'notes'    (the description pane)
const SLOT_TO_FEED: Record<TabKey, FeedTab> = {
  details: 'activity',
  checklist: 'checklist',
  activity: 'notes',
}
const FEED_TO_SLOT: Record<FeedTab, TabKey> = {
  activity: 'details',
  checklist: 'checklist',
  notes: 'activity',
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
  onClose?: () => void           // drawer/expanded use this; full host passes navigate('/work/tasks')
  /** Canonical promotion callback supplied by the shared overlay host. */
  onOpenPage?: () => void
  onExpandToggle?: () => void    // wired in PR-B
  expanded?: boolean
  /** Suppress the task-local utility bar when RecordPanelHost owns the chrome. */
  showPanelUtility?: boolean
  onTaskChanged?: (task: TaskListRow) => void  // lets the table sync optimistic status (PR-B)
  onTaskCreated?: (id: string) => void         // C2: lets the table refetch after a create (PR-B)
  onTaskArchived?: (id: string) => void        // I3: lets the table refetch after an archive (PR-B)
  onTitleResolved?: (title: string) => void    // lets a host render the breadcrumb current title
  /** Bubbles RecordField draft state to a host-owned leave guard. */
  onDirtyChange?: (dirty: boolean) => void
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
  taskId, width, presentation = width === 'drawer' ? 'panel' : 'page', expanded,
  onClose, onOpenPage, onExpandToggle, onTaskChanged, onTaskArchived, onTitleResolved, onDirtyChange,
  showPanelUtility = true,
  identityHeadingLevel,
}: TaskSurfaceProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  // The feed tabs (Activity / Checklist / Notes) ride the existing per-task
  // useTabMemory store (ADR-0013 D3 — reuse, no new persistence). Its default
  // slot ('details') maps to the feed default 'activity'; the description pane
  // ('activity' slot) presents as 'Notes'.
  const [storedTab, setStoredTab] = useTabMemory(taskId)
  const feedTab = SLOT_TO_FEED[storedTab] ?? 'activity'
  const setFeedTab = useCallback((t: FeedTab) => {
    setStoredTab(FEED_TO_SLOT[t])
  }, [setStoredTab])

  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const isManager = auth.status === 'authenticated' ? auth.viewer.isManager : false
  const t = useT()

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [data, setData] = useState<TaskDetailData | null>(null)
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [peopleDirectory, setPeopleDirectory] = useState<PersonOption[]>([])
  const [objectivesDir, setObjectivesDir] = useState<ObjectiveRow[]>([])
  const [workLinesDir, setWorkLinesDir] = useState<WorkLineRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
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

  const now = useMemo(() => new Date(), [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    if (!taskId) return
    const seq = ++loadSeq.current
    const isCurrent = () => seq === loadSeq.current
    setLoading(true)
    setNotFound(false)
    Promise.all([
      getTask(taskId),
      getBusinessUnits(),
      getPeople(),
    ]).then(([taskData, bus, people]) => {
      if (!isCurrent()) return
      setData(taskData)
      setLocalTask(taskData.task)
      setLocalChecklist(taskData.checklist)
      setBusDirectory(bus)
      setPeopleDirectory(people)
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
  }, [taskId])

  useEffect(() => { load() }, [load])
  useEffect(() => () => { loadSeq.current += 1 }, [])

  // Notify a host of the resolved title (e.g. for the breadcrumb)
  useEffect(() => {
    if (localTask && onTitleResolved) onTitleResolved(localTask.title)
  }, [localTask, onTitleResolved])

  // ── Permission ───────────────────────────────────────────────────────────
  // M2: archived task is read-only except Unarchive — treat as non-editor
  const isArchived = localTask?.archived_at != null

  const editable = useMemo(() => {
    if (isArchived) return false // M2: archived suppresses all edit affordances
    return localTask ? canEdit(localTask, viewerId, isManager) : false
  }, [localTask, viewerId, isManager, isArchived])

  // ── Status change ────────────────────────────────────────────────────────
  async function handleStatusChange(newStatus: TaskStatus) {
    if (!localTask) return
    const oldStatus = localTask.status
    setLocalTask(t => t ? { ...t, status: newStatus } : t)
    onTaskChanged?.({ ...localTask, status: newStatus })  // sync the table row optimistically
    try {
      await updateTaskStatus(localTask.id, oldStatus, newStatus, viewerId)
      const refreshed = await getTask(localTask.id)
      setData(refreshed)
      setLocalTask(refreshed.task)
      setLocalChecklist(refreshed.checklist)
      onTaskChanged?.(refreshed.task)
      announce(t('tasks.feedback.statusChanged', { status: newStatus === 'Open' ? t('tasks.status.open') : newStatus === 'In Progress' ? t('tasks.status.inProgress') : newStatus === 'Blocked' ? t('tasks.status.blocked') : t('tasks.status.done') }))
    } catch {
      setLocalTask(t => t ? { ...t, status: oldStatus } : t)
      onTaskChanged?.({ ...localTask, status: oldStatus })
      announce(ROLLBACK_MSG)
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
    await postComment({ entityType: 'task', entityId: localTask.id, body })
    const loadedComments = await listComments({ entityType: 'task', entityId: localTask.id }).catch(() => comments)
    setComments(loadedComments)
  }

  // ── Domain-facing field commit (V3 Issue 5 DAL seam) ──────────────────────
  // RecordViewer/RecordField commit a domain-facing key (pic/supervisor/businessUnit/dueDate/…);
  // this is the ONE place the viewer key is translated to the legacy storage column (the plan's
  // saveTaskViewerField switch — including the legacy responsible/accountable → PIC/Supervisor
  // storage-name mismatch, kept out of the vocabulary). It stays optimistic + rolls back, and
  // RE-THROWS on failure so RecordField shows its error/retry feedback.
  async function handleUpdateField(field: TaskViewerFieldKey, value: string | null) {
    if (!localTask) return
    const prev = { ...localTask }
    const v = value === '' ? null : value
    const patch: TaskFieldsPatch = {}
    const optimistic: Partial<TaskListRow> = {}
    switch (field) {
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
      await updateTaskFields(localTask.id, patch, viewerId)
      await refetchEvents(localTask.id)
      if (field === 'pic') announce(t('tasks.feedback.picReassigned'))
      else if (field === 'projectProcess') announce(t('tasks.feedback.workLineUpdated'))
      else if (field === 'objective') announce(t('tasks.feedback.objectiveUpdated'))
      // Other fields rely on RecordField's own visible Saving/Saved feedback.
    } catch (err) {
      setLocalTask(prev)
      onTaskChanged?.(prev)
      announce(ROLLBACK_MSG)
      throw err instanceof Error ? err : new Error('updateTaskFields failed')
    }
  }

  const handleDirtyChange = useCallback((dirty: boolean) => {
    onDirtyChange?.(dirty)
  }, [onDirtyChange])

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
      isManager,
      people: peopleDirectory,
      businessUnits: busDirectory,
      objectives: objectivesDir,
      workLines: workLinesDir,
      generatedFromLabel,
      labels: {
        businessUnit: t('tasks.field.businessUnit'),
        pic: t('tasks.pic'),
        supervisor: t('tasks.supervisor'),
        team: t('tasks.team'),
        teamUnassigned: t('tasks.field.teamUnassigned'),
        teamFromRecord: t('tasks.field.teamFromRecord'),
        teamMigration: t('tasks.field.teamMigration'),
        dueDate: t('tasks.dueLabel'),
      },
      recordLabels: {
        typeLabel: t('tasks.label.task'),
        ownershipSection: t('tasks.ownership'),
        statusSection: t('tasks.statusTiming'),
        detailsSection: t('tasks.detailsTitle'),
        statusField: t('tasks.status.label'),
        descriptionField: t('tasks.create.description'),
        projectProcessField: t('tasks.filter.projectProcess'),
        objectiveField: t('tasks.objective'),
        sourceField: t('tasks.source'),
        sourceAdHoc: t('tasks.adHoc'),
        noneMarker: '—',
        markComplete: t('tasks.markComplete'),
        archive: t('tasks.archive'),
        unarchive: t('tasks.unarchive'),
        readOnlyArchived: t('tasks.field.readOnlyArchived'),
        readOnlyNoPermission: t('tasks.field.readOnlyNoPermission'),
        classificationField: t('tasks.field.classification'),
        classificationGenerated: t('tasks.classification.generated'),
        classificationProject: t('tasks.classification.project'),
        generatedByField: t('tasks.field.generatedBy'),
      },
      onUpdateField: handleUpdateField,
      onUpdateStatus: handleStatusChange,
      onArchive: async () => { setShowConfirm(true) },
      onUnarchive: handleUnarchive,
    })
    const feedSlot: RecordContentSlot = {
      id: 'feed',
      label: 'Updates',
      render: () => (
        <RecordFeed
          task={localTask}
          checklist={localChecklist}
          events={data.events}
          comments={comments}
          people={peopleDirectory}
          now={now}
          editable={editable}
          viewerId={viewerId}
          activeTab={feedTab}
          onSelectTab={setFeedTab}
          onAddChecklist={handleAddChecklist}
          onToggleChecklist={handleToggle}
          onReorderChecklist={handleReorder}
          onDeleteChecklist={handleDeleteChecklist}
          onPostComment={handlePostComment}
        />
      ),
    }
    return { ...base, contentSlots: [feedSlot], activity: [] }
  // Handler identities are intentionally excluded; their captured state is represented above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data, localTask, localChecklist, viewerId, isManager, peopleDirectory, busDirectory,
    objectivesDir, workLinesDir, generatedFromLabel, comments, now, editable, feedTab, setFeedTab, t,
  ])

  const commitField = createTaskFieldCommit({
    onUpdateField: handleUpdateField,
    onUpdateStatus: handleStatusChange,
  })

  // ── Checklist add ────────────────────────────────────────────────────────
  async function handleAddChecklist(label: string) {
    if (!localTask) return
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
    }
  }

  // ── Checklist toggle ─────────────────────────────────────────────────────
  async function handleToggle(itemId: string, isDone: boolean) {
    if (!localTask) return
    setLocalChecklist(prev => prev.map(i => i.id === itemId ? { ...i, is_done: isDone } : i))
    try {
      await toggleChecklistItem(itemId, isDone, localTask.id, viewerId)
      await refetchEvents(localTask.id)
      announce(isDone ? t('tasks.feedback.checklistCompleted') : t('tasks.feedback.checklistReopened'))
    } catch {
      setLocalChecklist(prev => prev.map(i => i.id === itemId ? { ...i, is_done: !isDone } : i))
      announce(ROLLBACK_MSG)
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
    const prev = localChecklist
    setLocalChecklist(p => p.filter(i => i.id !== itemId))
    try {
      await deleteChecklistItem(itemId, localTask.id, viewerId)
      await refetchEvents(localTask.id)
      announce(t('tasks.feedback.checklistRemoved'))
    } catch {
      setLocalChecklist(prev)
      announce(ROLLBACK_MSG)
    }
  }

  // ── Archive/unarchive ────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false)
  async function handleArchive() {
    if (!localTask) return
    try {
      await archiveTask(localTask.id, viewerId)
      onTaskArchived?.(localTask.id)  // I3: let the table drop the row + decrement the count
      if (onClose) onClose()
      else navigate({ pathname: '/work/tasks', search: location.search })
    } catch { /* surface */ }
  }
  async function handleUnarchive() {
    if (!localTask) return
    try {
      await unarchiveTask(localTask.id, viewerId)
      setLocalTask(t => t ? { ...t, archived_at: null } : t)
      load()
    } catch { /* surface */ }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return <DetailSkeleton />

  if (notFound || !localTask) {
    return (
      <div className="not-found-panel">
        {/* R-T-3: when a shell PageFamilyFrame owns the page h1 (focused-record page,
            identityHeadingLevel=2), the not-found title nests as an h2 so there is no
            double-h1; the default full-width host keeps it an h1. */}
        {identityHeadingLevel === 2
          ? <h2 className="not-found-title">{t('tasks.notFound.title')}</h2>
          : <h1 className="not-found-title">{t('tasks.notFound.title')}</h1>}
        <p className="not-found-copy">{t('tasks.notFound.copy')}</p>
        <Link to={{ pathname: '/work/tasks', search: location.search }} className="btn btn-outline">{t('tasks.all')}</Link>
      </div>
    )
  }

  const task = localTask

  // Open-full-page target for the panel (drawer) utility bar. The RecordPanelHost route host
  // does not supply onOpenPage (the expand toggle promotes in place); a tenant opened from
  // another surface (Inbox/Follow-ups via the OverlayHostSlot) supplies it explicitly. In panel
  // mode without an explicit callback we fall back to the canonical task page route.
  const openPageTarget = presentation === 'panel'
    ? (onOpenPage ?? (() => navigate({ pathname: `/work/tasks/${task.id}`, search: location.search }, { state: { taskSurface: 'page' } })))
    : undefined
  const closeTarget = () => (onClose ? onClose() : navigate({ pathname: '/work/tasks', search: location.search }))

  // ── Drawer width: the shared RecordViewer owns identity, metadata, content and actions ──
  if (width === 'drawer') {
    return (
      <div className={expanded ? 'dw-surface dw-surface-expanded' : 'dw-surface'}>
        <div className="sr-only" aria-live="polite" role="status">{liveMessage}</div>
        {/* Utility bar — host-owned chrome around the canonical RecordViewer (NOT the old
            TaskDrawerHeader composition: identity/status/ownership/actions live in the viewer).
            Open full page · Expand to full width · Close. Suppressed when the overlay host owns
            its own chrome (showPanelUtility=false). */}
        {showPanelUtility && (
          <div className="dw-bar">
            <span className="dw-crumb-mini">{expanded ? t('tasks.fullWidth') : t('tasks.label.task')}</span>
            <span className="dw-bar-spacer" />
            {openPageTarget && (
              <button type="button" className="dw-open-page" onClick={openPageTarget}>
                {t('tasks.openFullPage')}
              </button>
            )}
            <button
              type="button"
              className={expanded ? 'dw-iconbtn dw-iconbtn-on' : 'dw-iconbtn'}
              aria-pressed={Boolean(expanded)}
              aria-label={expanded ? t('tasks.collapse') : t('tasks.expand')}
              title={expanded ? t('tasks.collapse') : t('tasks.expand')}
              onClick={() => onExpandToggle?.()}
            >
              {expanded ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                </svg>
              )}
            </button>
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

        {taskViewerAdapter && (
          <RecordViewer
            adapter={taskViewerAdapter}
            mode="panel"
            headingLevel={2}
            onDirtyChange={handleDirtyChange}
            onCommitField={commitField}
          />
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

  // ── Full width: the two-column record page (ADR-0013 D3) ───────────────────
  return (
    <>
      <div className="sr-only" aria-live="polite" role="status">{liveMessage}</div>

      {/* Record chrome — when promoted from the drawer (expanded@split) the host
          passes collapse/close callbacks; carry them in a quiet utility row so the
          expand control stays reversible (collapse back to split) and the surface
          is never a dead end. A standalone full-page route host would pass neither
          and render no chrome bar. (AC-R06 / IxD: post-action feedback + next step.) */}
      {showPanelUtility && (onExpandToggle || onClose) && (
        <div className="dw-bar record-chrome">
          <span className="dw-crumb-mini">{t('tasks.fullWidth')}</span>
          <span className="dw-bar-spacer" />
          {onExpandToggle && (
            <button
              type="button"
              className="dw-iconbtn dw-iconbtn-on"
              aria-pressed={true}
              aria-label={t('tasks.collapse')}
              title={t('tasks.collapse')}
              onClick={() => onExpandToggle()}
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

      {/* AC-R05: archived banner + Unarchive sit above the two columns */}
      {isArchived && (
        <div className="archived-banner" role="status">
          <span>{t('tasks.archivedBanner')}</span>
        </div>
      )}

      {taskViewerAdapter && (
        <RecordViewer
          adapter={taskViewerAdapter}
          mode="page"
          headingLevel={identityHeadingLevel ?? 1}
          onDirtyChange={handleDirtyChange}
          onCommitField={commitField}
        />
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
function CreateSurface({ width, expanded, onExpandToggle, onTaskCreated }: TaskSurfaceProps) {
  const navigate = useNavigate()
  const auth = useAuth()
  const t = useT()
  const inDrawer = width === 'drawer'
  // AC-125 / FR-123: "+ Add task" from a group header deep-links the grouped
  // dimension via query params (?r=<personId> / ?bu=<buId>).
  // Note: Status groups do NOT pass ?status= — CreateSurface has no status field;
  // all new tasks open as "Open". Only PIC (r=) and Team (bu=) pre-fills are read.
  const [searchParams] = useSearchParams()
  const prefillR = searchParams.get('r') ?? ''
  const prefillBu = searchParams.get('bu') ?? ''
  const collectionParams = new URLSearchParams(searchParams)
  collectionParams.delete('r')
  collectionParams.delete('bu')
  const collectionSearch = collectionParams.toString()
  const collectionSearchString = collectionSearch ? `?${collectionSearch}` : ''

  // Viewer details
  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  // Primary-role BU: first role's business_unit_id (ordered by created_at asc from resolveViewer)
  const primaryRoleBU = auth.status === 'authenticated'
    ? (auth.viewer.roles[0]?.business_unit_id ?? '')
    : ''

  // Directory
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [peopleDirectory, setPeopleDirectory] = useState<PersonOption[]>([])
  const [dirLoading, setDirLoading] = useState(true)
  const [objectivesDir, setObjectivesDir] = useState<ObjectiveRow[]>([])
  const [workLinesDir, setWorkLinesDir] = useState<WorkLineRow[]>([])

  useEffect(() => {
    Promise.all([getBusinessUnits(), getPeople()]).then(([bus, people]) => {
      setBusDirectory(bus)
      setPeopleDirectory(people)
      setDirLoading(false)
    }).catch(() => setDirLoading(false))
    // Non-blocking catalog loads — a slow catalog must never block the form.
    listObjectives().then(setObjectivesDir).catch(() => {})
    listWorkLines().then(setWorkLinesDir).catch(() => {})
  }, [])

  // ── Form state ────────────────────────────────────────────────────────────
  // Pre-fill from the group "+ Add task" deep-link (AC-125) takes precedence over
  // the creator-default; absent param → today's creator-default behavior.
  const [title, setTitle] = useState('')
  const [businessUnitId, setBusinessUnitId] = useState(prefillBu || primaryRoleBU)
  const [responsiblePersonId, setResponsiblePersonId] = useState(prefillR || viewerId)
  const [accountablePersonId, setAccountablePersonId] = useState(viewerId)
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [workLineId, setWorkLineId] = useState('')
  const [objectiveId, setObjectiveId] = useState('')

  // Set BU once directory loads (in case primaryRoleBU wasn't set at mount).
  // A pre-filled BU (deep-link) is never overwritten.
  useEffect(() => {
    if (primaryRoleBU && !businessUnitId) {
      setBusinessUnitId(primaryRoleBU)
    }
  }, [primaryRoleBU, businessUnitId])

  // ── Validation state ──────────────────────────────────────────────────────
  // AC-108: inline-validate-ON-BLUR (design-plan §7) — a required field flags the
  // moment focus leaves it empty, not only on submit. Typing clears the error.
  const [titleError, setTitleError] = useState('')
  const [buError, setBuError] = useState('')

  function validateTitleOnBlur() {
    setTitleError(title.trim() ? '' : t('tasks.create.titleRequired'))
  }
  function validateBuOnBlur() {
    setBuError(businessUnitId ? '' : t('tasks.create.teamRequired'))
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
    if (!businessUnitId) {
      setBuError(t('tasks.create.teamRequired'))
      valid = false
    } else {
      setBuError('')
    }
    if (!valid) return

    setSubmitting(true)
    setSubmitError('')
    try {
      const input: CreateTaskInput = {
        title: title.trim(),
        businessUnitId,
        responsiblePersonId,
        accountablePersonId,
        createdBy: viewerId,
        description: description.trim() || undefined,
        dueDate: dueDate || null,
        workLineId: workLineId || null,
        objectiveId: objectiveId || null,
      }
      const newId = await createTask(input)
      onTaskCreated?.(newId)  // C2: let the table refetch so the new row appears + count updates
      navigate({ pathname: `/work/tasks/${newId}`, search: collectionSearchString })
    } catch {
      setSubmitError(t('tasks.create.error'))
      setSubmitting(false)
    }
  }

  // M5: create mode keeps the expand toggle for parity with view mode (mockup Screen 2).
  // The chrome bar renders in BOTH widths — drawer uses .dw-bar, full width uses the
  // .record-chrome strip above the card (mirrors ViewSurface) so the collapse control
  // is never lost when expanded promotes the surface to full width.
  const closeToCollection = () => navigate({ pathname: '/work/tasks', search: collectionSearchString })

  const expandBtn = (
    <button
      type="button"
      className={expanded ? 'dw-iconbtn dw-iconbtn-on' : 'dw-iconbtn'}
      aria-pressed={Boolean(expanded)}
      aria-label={expanded ? t('tasks.collapse') : t('tasks.expand')}
      title={expanded ? t('tasks.collapse') : t('tasks.expand')}
      onClick={() => onExpandToggle?.()}
    >
      {expanded ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      )}
    </button>
  )
  const closeBtn = (
    <button
      type="button"
      className="dw-iconbtn"
      aria-label={t('tasks.close')}
      title={t('tasks.close')}
      onClick={closeToCollection}
    >
      <CloseIcon />
    </button>
  )
  const chromeBar = (
    <div className={inDrawer ? 'dw-bar' : 'dw-bar record-chrome'}>
      <span className="dw-crumb-mini">{expanded ? t('tasks.create.newFullWidth') : t('tasks.create.new')}</span>
      <span className="dw-bar-spacer" />
      {onExpandToggle && expandBtn}
      {closeBtn}
    </div>
  )

  const formMarkup = (
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label={t('tasks.create.form')}
        className={inDrawer ? 'tc-create-form' : undefined}
      >
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
          <input
            id="task-title"
            type="text"
            className={`tc-input${titleError ? ' tc-input-error' : ''}`}
            value={title}
            onChange={e => { setTitle(e.target.value); if (titleError) setTitleError('') }}
            onBlur={validateTitleOnBlur}
            aria-required="true"
            aria-invalid={titleError ? 'true' : undefined}
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
          <label htmlFor="task-bu" className="tc-label">
            {t('tasks.team')} <span aria-hidden="true" className="tc-required">*</span>
          </label>
          {dirLoading ? (
            <div className="tc-loading-field">{t('tasks.loading')}</div>
          ) : (
            <select
              id="task-bu"
              className={`tc-select${buError ? ' tc-input-error' : ''}`}
              value={businessUnitId}
              onChange={e => { setBusinessUnitId(e.target.value); if (buError) setBuError('') }}
              onBlur={validateBuOnBlur}
              aria-required="true"
              aria-invalid={buError ? 'true' : undefined}
              aria-describedby={buError ? 'bu-err' : undefined}
              disabled={submitting}
              aria-label={t('tasks.team')}
            >
              <option value="">{t('tasks.create.teamPlaceholder')}</option>
              {busDirectory.map(bu => (
                <option key={bu.id} value={bu.id}>{bu.name}</option>
              ))}
            </select>
          )}
          {buError && (
            <span id="bu-err" role="alert" className="tc-field-error">{buError}</span>
          )}
        </div>

        {/* PIC — pre-filled to creator, editable */}
        <div className="tc-field">
          <label htmlFor="task-responsible" className="tc-label">
            {t('tasks.pic')} <span aria-hidden="true" className="tc-required">*</span>
          </label>
          {dirLoading ? (
            <div className="tc-loading-field">{t('tasks.loading')}</div>
          ) : (
            <select
              id="task-responsible"
              className="tc-select"
              value={responsiblePersonId}
              onChange={e => setResponsiblePersonId(e.target.value)}
              disabled={submitting}
              aria-label={t('tasks.pic')}
              aria-required="true"
            >
              {peopleDirectory.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Supervisor — pre-filled to creator, editable */}
        <div className="tc-field">
          <label htmlFor="task-accountable" className="tc-label">
            {t('tasks.supervisor')} <span aria-hidden="true" className="tc-required">*</span>
          </label>
          {dirLoading ? (
            <div className="tc-loading-field">{t('tasks.loading')}</div>
          ) : (
            <select
              id="task-accountable"
              className="tc-select"
              value={accountablePersonId}
              onChange={e => setAccountablePersonId(e.target.value)}
              disabled={submitting}
              aria-label={t('tasks.supervisor')}
              aria-required="true"
            >
              {peopleDirectory.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Project/Process (optional) — non-blocking; renders once lookups arrive.
            UI term is Project/Process (OD-C-2 / ADR-0015); table stays mos.work_lines. */}
        {workLinesDir.length > 0 && (
          <div className="tc-field">
            <label htmlFor="task-workline" className="tc-label">{t('tasks.filter.projectProcess')}</label>
            <select
              id="task-workline"
              className="tc-select"
              value={workLineId}
              onChange={e => setWorkLineId(e.target.value)}
              disabled={submitting}
              aria-label={t('tasks.filter.projectProcess')}
            >
              <option value="">{t('tasks.create.none')}</option>
              {/* Fix-6: append (project) / (daily) cue so attribution intent is visible at selection */}
              {workLinesDir.map(wl => (
                <option key={wl.id} value={wl.id}>
                  {wl.name} ({wl.type === 'project' ? t('tasks.type.project') : t('tasks.type.daily')})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Objective (optional) — non-blocking; renders once lookups arrive */}
        {objectivesDir.length > 0 && (
          <div className="tc-field">
            <label htmlFor="task-objective" className="tc-label">{t('tasks.objective')}</label>
            <select
              id="task-objective"
              className="tc-select"
              value={objectiveId}
              onChange={e => setObjectiveId(e.target.value)}
              disabled={submitting}
              aria-label={t('tasks.objective')}
            >
              <option value="">{t('tasks.create.none')}</option>
              {objectivesDir.map(obj => (
                <option key={obj.id} value={obj.id}>{obj.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Due date (optional) */}
        <div className="tc-field">
          <label htmlFor="task-due" className="tc-label">{t('tasks.create.dueDate')}</label>
          <input
            id="task-due"
            type="date"
            className="tc-input"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            disabled={submitting}
          />
        </div>

        {/* Description (optional) */}
        <div className="tc-field">
          <label htmlFor="task-desc" className="tc-label">{t('tasks.create.description')}</label>
          <textarea
            id="task-desc"
            className="tc-textarea"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder={t('tasks.create.descriptionPlaceholder')}
            disabled={submitting}
          />
        </div>

        {/* Actions */}
        <div className="tc-actions">
          <button type="button" className="btn btn-outline" onClick={closeToCollection}>{t('tasks.cancel')}</button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? t('tasks.create.submitting') : t('tasks.create.submit')}
          </button>
        </div>
      </form>
  )

  if (inDrawer) {
    return (
      <div className={`dw-surface tc-create-drawer${expanded ? ' dw-surface-expanded' : ''}`}>
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
