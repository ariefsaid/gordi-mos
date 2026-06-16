import './TaskSurface.css'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import {
  getTask, createTask,
  updateTaskStatus, updateTaskRaci, updateTaskFields,
  addChecklistItem, toggleChecklistItem, reorderChecklistItem, deleteChecklistItem,
  archiveTask, unarchiveTask,
} from '../../lib/db/tasks'
import type { TaskDetail as TaskDetailData, CreateTaskInput } from '../../lib/db/tasks'
import type { TaskListRow, TaskStatus, ChecklistItemRow } from '../../lib/db/tasks.types'
import { getBusinessUnits, getPeople } from '../../lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '../../lib/db/directory'
import { StatusPill } from './StatusPill'
import { formatAge, formatDate } from './taskFormatters'
import { StatusTrigger } from './StatusTrigger'
import { ConfirmArchive } from './ConfirmArchive'
import { RaciCard } from './RaciCard'
import { ChecklistCard } from './ChecklistCard'
import { ActivityCard } from './ActivityCard'
import { canEdit, canArchive } from './taskPermissions'
import { TaskDrawerHeader } from './TaskDrawerHeader'
import { TaskTabStrip } from './TaskTabStrip'
import { useTabMemory } from './useTabMemory'

// ── Props ─────────────────────────────────────────────────────────────────────
// PR-A: TaskSurface is the single actionable task editor (ADR-0007 "one UI, two
// widths"). It renders the full-width host today; PR-B adds the drawer width.
export type TaskSurfaceProps = {
  taskId: string | null          // null only in create mode
  mode: 'view' | 'create'
  width: 'drawer' | 'full'
  onClose?: () => void           // drawer/expanded use this; full host passes navigate('/tasks')
  onExpandToggle?: () => void    // wired in PR-B
  expanded?: boolean
  onTaskChanged?: (task: TaskListRow) => void  // lets the table sync optimistic status (PR-B)
  onTaskCreated?: (id: string) => void         // C2: lets the table refetch after a create (PR-B)
  onTaskArchived?: (id: string) => void        // I3: lets the table refetch after an archive (PR-B)
  onTitleResolved?: (title: string) => void    // lets a host render the breadcrumb current title
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function DetailSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">Loading task</span>
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
  taskId, width, expanded, onClose, onExpandToggle, onTaskChanged, onTaskArchived, onTitleResolved,
}: TaskSurfaceProps) {
  const navigate = useNavigate()
  const auth = useAuth()
  const [tab, setTab] = useTabMemory(taskId)

  const viewerId = auth.status === 'authenticated' ? auth.viewer.person.id : ''
  const isManager = auth.status === 'authenticated' ? auth.viewer.isManager : false

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [data, setData] = useState<TaskDetailData | null>(null)
  const [busDirectory, setBusDirectory] = useState<BusinessUnitOption[]>([])
  const [peopleDirectory, setPeopleDirectory] = useState<PersonOption[]>([])

  // Optimistic local state
  const [localTask, setLocalTask] = useState<TaskListRow | null>(null)
  const [localChecklist, setLocalChecklist] = useState<ChecklistItemRow[]>([])

  // AC-111: off-screen live region announcing optimistic-save / rollback outcomes.
  const [liveMessage, setLiveMessage] = useState('')
  const announce = useCallback((msg: string) => {
    // Re-set even if identical so repeated outcomes re-announce (clear then set).
    setLiveMessage('')
    requestAnimationFrame(() => setLiveMessage(msg))
  }, [])
  const ROLLBACK_MSG = "Couldn't save — reverted"

  const now = useMemo(() => new Date(), [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    if (!taskId) return
    setLoading(true)
    setNotFound(false)
    Promise.all([
      getTask(taskId),
      getBusinessUnits(),
      getPeople(),
    ]).then(([taskData, bus, people]) => {
      setData(taskData)
      setLocalTask(taskData.task)
      setLocalChecklist(taskData.checklist)
      setBusDirectory(bus)
      setPeopleDirectory(people)
      setLoading(false)
    }).catch(() => {
      setNotFound(true)
      setLoading(false)
    })
  }, [taskId])

  useEffect(() => { load() }, [load])

  // Notify a host of the resolved title (e.g. for the breadcrumb)
  useEffect(() => {
    if (localTask && onTitleResolved) onTitleResolved(localTask.title)
  }, [localTask, onTitleResolved])

  // ── Lookup maps ─────────────────────────────────────────────────────────
  const buMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const bu of busDirectory) m.set(bu.id, bu.name)
    return m
  }, [busDirectory])

  // ── Permission ───────────────────────────────────────────────────────────
  // M2: archived task is read-only except Unarchive — treat as non-editor
  const isArchived = localTask?.archived_at != null

  const editable = useMemo(() => {
    if (isArchived) return false // M2: archived suppresses all edit affordances
    return localTask ? canEdit(localTask, viewerId, isManager) : false
  }, [localTask, viewerId, isManager, isArchived])

  const archiveable = useMemo(() => localTask
    ? canArchive(localTask, viewerId, isManager)
    : false,
  [localTask, viewerId, isManager])

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
      announce(`Status changed to ${newStatus}`)
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

  // ── RACI C/I change ──────────────────────────────────────────────────────
  async function handleRaciChange(patch: Partial<Pick<TaskListRow, 'consulted_person_ids' | 'informed_person_ids'>>) {
    if (!localTask) return
    const prev = { ...localTask }
    setLocalTask(t => t ? { ...t, ...patch } : t)
    try {
      await updateTaskRaci(localTask.id, patch, viewerId)
      await refetchEvents(localTask.id)
      announce('RACI updated')
    } catch {
      setLocalTask(prev)
      announce(ROLLBACK_MSG)
    }
  }

  // ── RACI R/A change (I2) ─────────────────────────────────────────────────
  async function handleRaChange(patch: Partial<Pick<TaskListRow, 'responsible_person_id' | 'accountable_person_id'>>) {
    if (!localTask) return
    const prev = { ...localTask }
    setLocalTask(t => t ? { ...t, ...patch } : t)
    try {
      await updateTaskFields(localTask.id, patch, viewerId)
      await refetchEvents(localTask.id)
      announce('Owner updated')
    } catch {
      setLocalTask(prev)
      announce(ROLLBACK_MSG)
    }
  }

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
      announce('Checklist item added')
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
      announce(isDone ? 'Checklist item completed' : 'Checklist item reopened')
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
      announce('Checklist item removed')
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
      else navigate('/tasks')
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
        <h1 className="not-found-title">Task not found</h1>
        <p className="not-found-copy">This task doesn&apos;t exist or you don&apos;t have access.</p>
        <Link to="/tasks" className="btn-outline-link">All tasks</Link>
      </div>
    )
  }

  const task = localTask
  const buName = buMap.get(task.business_unit_id) ?? task.business_unit_id
  const events = data?.events ?? []
  const checklistDone = localChecklist.filter(i => i.is_done).length

  // ── Drawer width: pinned header + tabs + pinned foot (Variant B) ──────────
  if (width === 'drawer') {
    return (
      <div className={expanded ? 'dw-surface dw-surface-expanded' : 'dw-surface'}>
        <div className="sr-only" aria-live="polite" role="status">{liveMessage}</div>
        <TaskDrawerHeader
          task={task}
          buName={buName}
          people={peopleDirectory}
          editable={editable}
          archiveable={archiveable}
          expanded={Boolean(expanded)}
          now={now}
          onStatusChange={handleStatusChange}
          onExpandToggle={() => onExpandToggle?.()}
          onClose={() => (onClose ? onClose() : navigate('/tasks'))}
          onArchive={() => setShowConfirm(true)}
        />

        {isArchived && (
          <div className="archived-banner" role="status">
            <span>This task is archived.</span>
            {archiveable && (
              <button type="button" className="btn-outline-sm" onClick={handleUnarchive}>
                Unarchive
              </button>
            )}
          </div>
        )}

        <TaskTabStrip
          active={tab}
          checklistCount={[checklistDone, localChecklist.length]}
          activityCount={events.length}
          onSelect={setTab}
        />

        <div
          className="dw-tabpane"
          role="tabpanel"
          id={`dw-tabpanel-${tab}`}
          aria-labelledby={`dw-tab-${tab}`}
        >
          {tab === 'details' && (
            <>
              <section className="dw-sec" aria-label="Description">
                <h3 className="dw-sec-h3">Description</h3>
                {task.description
                  ? <p className="desc-body">{task.description}</p>
                  : <p className="empty-substate">No description.</p>
                }
              </section>
              <RaciCard
                task={task}
                people={peopleDirectory}
                canEdit={editable}
                viewerId={viewerId}
                onRaciChange={handleRaciChange}
                onRaChange={handleRaChange}
              />
            </>
          )}
          {tab === 'checklist' && (
            <ChecklistCard
              items={localChecklist}
              canEdit={editable}
              taskId={task.id}
              viewerId={viewerId}
              onAdd={handleAddChecklist}
              onToggle={handleToggle}
              onReorder={handleReorder}
              onDelete={handleDeleteChecklist}
            />
          )}
          {tab === 'activity' && (
            <ActivityCard events={events} people={peopleDirectory} now={now} />
          )}
        </div>

        {/* Pinned foot — Archive always reachable (collapsed only; expanded shows it in the header) */}
        {archiveable && !isArchived && !expanded && (
          <div className="dw-foot">
            <button
              type="button"
              className="btn-ghost-danger"
              aria-label="Archive task"
              onClick={() => setShowConfirm(true)}
            >
              Archive task
            </button>
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

  // ── Full width (the historical stacked layout — unchanged) ─────────────────
  return (
    <>
      <div className="sr-only" aria-live="polite" role="status">{liveMessage}</div>
      {/* Archived banner */}
      {isArchived && (
        <div className="archived-banner" role="status">
          <span>This task is archived.</span>
          {archiveable && (
            <button type="button" className="btn-outline-sm" onClick={handleUnarchive}>
              Unarchive
            </button>
          )}
        </div>
      )}

      {/* Head card */}
      <div className="card head-card">
        {/* I1: actions-cluster stacks below title at <768px via CSS media query */}
        <div className="head-top">
          <div className="head-title-block">
            <h1 className="task-title">{task.title}</h1>
          </div>
          <div className="actions-cluster" role="group" aria-label="Task actions">
            {editable && (
              <StatusTrigger
                status={task.status}
                onChange={handleStatusChange}
              />
            )}
            {!editable && (
              <StatusPill status={task.status} />
            )}
            {archiveable && !isArchived && (
              <button
                type="button"
                className="btn-ghost"
                aria-label="Archive task"
                onClick={() => setShowConfirm(true)}
              >
                Archive task
              </button>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div className="meta-row" aria-label="Task metadata">
          <div className="meta-item">
            <span className="meta-label">Due</span>
            <span className="meta-value tabular-nums">
              {task.due_date ? formatDate(task.due_date) : '—'}
            </span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Business unit</span>
            <span className="meta-value">{buName}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">Activity</span>
            <span className="meta-value tabular-nums">{formatAge(task.last_activity_at, now)}</span>
          </div>
        </div>
      </div>

      {/* Description card */}
      <section className="card" aria-label="Description">
        <h2 className="card-h2">Description</h2>
        {task.description
          ? <p className="desc-body">{task.description}</p>
          : <p className="empty-substate">No description.</p>
        }
      </section>

      {/* RACI card — I2: R/A now editable for editors */}
      <RaciCard
        task={task}
        people={peopleDirectory}
        canEdit={editable}
        viewerId={viewerId}
        onRaciChange={handleRaciChange}
        onRaChange={handleRaChange}
      />

      {/* Checklist card */}
      <ChecklistCard
        items={localChecklist}
        canEdit={editable}
        taskId={task.id}
        viewerId={viewerId}
        onAdd={handleAddChecklist}
        onToggle={handleToggle}
        onReorder={handleReorder}
        onDelete={handleDeleteChecklist}
      />

      {/* Activity card */}
      <ActivityCard
        events={events}
        people={peopleDirectory}
        now={now}
      />

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
function CreateSurface({ onClose, width, expanded, onExpandToggle, onTaskCreated }: TaskSurfaceProps) {
  const navigate = useNavigate()
  const auth = useAuth()
  const inDrawer = width === 'drawer'
  // AC-125 / FR-123: "+ Add task" from a group header deep-links the grouped
  // dimension via query params (?r=<personId> / ?bu=<buId> / ?status=<status>).
  const [searchParams] = useSearchParams()
  const prefillR = searchParams.get('r') ?? ''
  const prefillBu = searchParams.get('bu') ?? ''

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

  useEffect(() => {
    Promise.all([getBusinessUnits(), getPeople()]).then(([bus, people]) => {
      setBusDirectory(bus)
      setPeopleDirectory(people)
      setDirLoading(false)
    }).catch(() => setDirLoading(false))
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
    setTitleError(title.trim() ? '' : 'Title is required')
  }
  function validateBuOnBlur() {
    setBuError(businessUnitId ? '' : 'Business unit is required')
  }

  // ── Submit state ──────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Validate
    let valid = true
    if (!title.trim()) {
      setTitleError('Title is required')
      valid = false
    } else {
      setTitleError('')
    }
    if (!businessUnitId) {
      setBuError('Business unit is required')
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
      }
      const newId = await createTask(input)
      onTaskCreated?.(newId)  // C2: let the table refetch so the new row appears + count updates
      navigate(`/tasks/${newId}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div className={inDrawer ? `dw-surface tc-create-drawer${expanded ? ' dw-surface-expanded' : ''}` : 'tc-card'}>
      {inDrawer && (
        <div className="dw-bar">
          <span className="dw-crumb-mini">{expanded ? 'New task · full width' : 'New task'}</span>
          <span className="dw-bar-spacer" />
          {/* M5: create mode keeps the expand toggle for parity with view mode (mockup Screen 2) */}
          <button
            type="button"
            className={expanded ? 'dw-iconbtn dw-iconbtn-on' : 'dw-iconbtn'}
            aria-pressed={Boolean(expanded)}
            aria-label={expanded ? 'Collapse to split (e)' : 'Expand to full width (e)'}
            title={expanded ? 'Collapse (e)' : 'Expand (e)'}
            onClick={() => onExpandToggle?.()}
          >
            {expanded ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 3H3v6M21 15v6h-6M3 3l7 7M21 21l-7-7" />
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
            aria-label="Close (Esc)"
            title="Close (Esc)"
            onClick={() => (onClose ? onClose() : navigate('/tasks'))}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label="Create task form"
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
            Title <span aria-hidden="true" className="tc-required">*</span>
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
            placeholder="What needs to be done?"
            disabled={submitting}
            aria-label="Title"
          />
          {titleError && (
            <span id="title-err" role="alert" className="tc-field-error">{titleError}</span>
          )}
        </div>

        {/* Business unit */}
        <div className="tc-field">
          <label htmlFor="task-bu" className="tc-label">
            Business unit <span aria-hidden="true" className="tc-required">*</span>
          </label>
          {dirLoading ? (
            <div className="tc-loading-field">Loading…</div>
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
              aria-label="Business unit"
            >
              <option value="">Select business unit…</option>
              {busDirectory.map(bu => (
                <option key={bu.id} value={bu.id}>{bu.name}</option>
              ))}
            </select>
          )}
          {buError && (
            <span id="bu-err" role="alert" className="tc-field-error">{buError}</span>
          )}
        </div>

        {/* Responsible (R) — pre-filled to creator, editable */}
        <div className="tc-field">
          <label htmlFor="task-responsible" className="tc-label">
            Responsible (R) <span aria-hidden="true" className="tc-required">*</span>
          </label>
          {dirLoading ? (
            <div className="tc-loading-field">Loading…</div>
          ) : (
            <select
              id="task-responsible"
              className="tc-select"
              value={responsiblePersonId}
              onChange={e => setResponsiblePersonId(e.target.value)}
              disabled={submitting}
              aria-label="Responsible (R)"
              aria-required="true"
            >
              {peopleDirectory.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Accountable (A) — pre-filled to creator, editable */}
        <div className="tc-field">
          <label htmlFor="task-accountable" className="tc-label">
            Accountable (A) <span aria-hidden="true" className="tc-required">*</span>
          </label>
          {dirLoading ? (
            <div className="tc-loading-field">Loading…</div>
          ) : (
            <select
              id="task-accountable"
              className="tc-select"
              value={accountablePersonId}
              onChange={e => setAccountablePersonId(e.target.value)}
              disabled={submitting}
              aria-label="Accountable (A)"
              aria-required="true"
            >
              {peopleDirectory.map(p => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Due date (optional) */}
        <div className="tc-field">
          <label htmlFor="task-due" className="tc-label">Due date</label>
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
          <label htmlFor="task-desc" className="tc-label">Description</label>
          <textarea
            id="task-desc"
            className="tc-textarea"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Optional context, goals, or notes…"
            disabled={submitting}
          />
        </div>

        {/* Actions */}
        <div className="tc-actions">
          {onClose ? (
            <button type="button" className="tc-btn-cancel" onClick={onClose}>Cancel</button>
          ) : (
            <Link to="/tasks" className="tc-btn-cancel">Cancel</Link>
          )}
          <button
            type="submit"
            className="tc-btn-submit"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </form>
    </div>
  )
}
