import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { useAuth } from '../auth/useAuth'
import { getTask, updateTaskStatus, updateTaskRaci, addChecklistItem, toggleChecklistItem, archiveTask, unarchiveTask } from '../lib/db/tasks'
import type { TaskDetail as TaskDetailData } from '../lib/db/tasks'
import type { TaskListRow, TaskStatus, ChecklistItemRow, TaskEventRow } from '../lib/db/tasks.types'
import { getBusinessUnits, getPeople } from '../lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '../lib/db/directory'
import { StatusPill } from '../components/tasks/StatusPill'
import { formatAge, formatDate, initials } from '../components/tasks/taskFormatters'

// ── Permission helpers (optimistic UX gate; DB is authority) ────────────────
// Mirrors mos.can_edit_task: viewer is R, A, or any manager.
// Manager arm is broad (viewer.isManager) — DB rejects if not manager-of-specific-R/A.
function canEdit(task: TaskListRow, viewerId: string, isManager: boolean): boolean {
  return (
    task.responsible_person_id === viewerId ||
    task.accountable_person_id === viewerId ||
    isManager
  )
}

// Archive gate: A or manager (narrower than edit — not bare R).
function canArchive(task: TaskListRow, viewerId: string, isManager: boolean): boolean {
  return task.accountable_person_id === viewerId || isManager
}

const STATUSES: TaskStatus[] = ['Open', 'In Progress', 'Blocked', 'Done']

// ── Status trigger + popover ─────────────────────────────────────────────────
type StatusTriggerProps = {
  status: TaskStatus
  onChange: (s: TaskStatus) => void
}
function StatusTrigger({ status, onChange }: StatusTriggerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={ref} className="status-trigger-wrap" onKeyDown={handleKey}>
      <button
        type="button"
        className="status-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change status"
        onClick={() => setOpen(o => !o)}
      >
        <StatusPill status={status} />
        <span className="trigger-chev" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="listbox" aria-label="Select status" className="status-popover">
          {STATUSES.map(s => (
            <div
              key={s}
              role="option"
              aria-selected={s === status}
              className={`status-option${s === status ? ' status-option-active' : ''}`}
              onClick={() => { onChange(s); setOpen(false) }}
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onChange(s); setOpen(false) } }}
            >
              <StatusPill status={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Confirm-archive dialog ───────────────────────────────────────────────────
type ConfirmArchiveProps = {
  onConfirm: () => void
  onCancel: () => void
}
function ConfirmArchive({ onConfirm, onCancel }: ConfirmArchiveProps) {
  return (
    <div role="dialog" aria-modal="true" aria-label="Archive confirmation" className="confirm-overlay">
      <div className="confirm-box">
        <p className="confirm-msg">Archive this task? It leaves the default list but isn&apos;t deleted.</p>
        <div className="confirm-actions">
          <button type="button" className="btn-outline confirm-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-archive" onClick={onConfirm} aria-label="Archive">Archive</button>
        </div>
      </div>
    </div>
  )
}

// ── Person picker (simple select overlay) ───────────────────────────────────
type PersonPickerProps = {
  people: PersonOption[]
  onSelect: (id: string) => void
  onClose: () => void
  exclude?: string[]
}
function PersonPicker({ people, onSelect, onClose, exclude = [] }: PersonPickerProps) {
  const available = people.filter(p => !exclude.includes(p.id))
  return (
    <div role="listbox" aria-label="Select person" className="person-picker">
      {available.map(p => (
        <div
          key={p.id}
          role="option"
          aria-selected={false}
          className="person-picker-option"
          tabIndex={0}
          onClick={() => { onSelect(p.id); onClose() }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { onSelect(p.id); onClose() } }}
        >
          <span className="person-av" aria-hidden="true">{initials(p.full_name)}</span>
          <span>{p.full_name}</span>
        </div>
      ))}
    </div>
  )
}

// ── RACI card ────────────────────────────────────────────────────────────────
type RaciCardProps = {
  task: TaskListRow
  people: PersonOption[]
  canEdit: boolean
  viewerId: string
  onRaciChange: (patch: Partial<Pick<TaskListRow, 'consulted_person_ids' | 'informed_person_ids'>>) => void
}
function RaciCard({ task, people, canEdit: editable, onRaciChange }: RaciCardProps) {
  const [showCPicker, setShowCPicker] = useState(false)
  const [showIPicker, setShowIPicker] = useState(false)

  function personName(id: string) {
    return people.find(p => p.id === id)?.full_name ?? id
  }

  function removeConsulted(id: string) {
    onRaciChange({ consulted_person_ids: task.consulted_person_ids.filter(x => x !== id) })
  }
  function removeInformed(id: string) {
    onRaciChange({ informed_person_ids: task.informed_person_ids.filter(x => x !== id) })
  }
  function addConsulted(id: string) {
    if (!task.consulted_person_ids.includes(id)) {
      onRaciChange({ consulted_person_ids: [...task.consulted_person_ids, id] })
    }
  }
  function addInformed(id: string) {
    if (!task.informed_person_ids.includes(id)) {
      onRaciChange({ informed_person_ids: [...task.informed_person_ids, id] })
    }
  }

  const rName = personName(task.responsible_person_id)
  const aName = personName(task.accountable_person_id)

  return (
    <section className="card" aria-label="RACI">
      <h2 className="card-h2">RACI</h2>
      <div className="raci-grid">
        {/* Responsible */}
        <div className="raci-field">
          <div className="raci-label">
            <span className="role-chip role-chip-r">
              <span className="role-marker" aria-hidden="true">R</span>
              Responsible
            </span>
          </div>
          <div className="person-field" aria-label={`Responsible: ${rName}`}>
            <span className="person-av" aria-hidden="true">{initials(rName)}</span>
            <span className="person-name">{rName}</span>
          </div>
        </div>

        {/* Accountable */}
        <div className="raci-field">
          <div className="raci-label">
            <span className="role-chip role-chip-a">
              <span className="role-marker" aria-hidden="true">A</span>
              Accountable
            </span>
          </div>
          <div className="person-field" aria-label={`Accountable: ${aName}`}>
            <span className="person-av person-av-a" aria-hidden="true">{initials(aName)}</span>
            <span className="person-name">{aName}</span>
          </div>
        </div>

        {/* Consulted */}
        <div className="raci-field" data-testid="raci-consulted">
          <div className="raci-label">
            <span className="role-chip role-chip-ci">
              <span className="role-marker role-marker-ci" aria-hidden="true">C</span>
              Consulted
            </span>
          </div>
          <div className="multi-field">
            {task.consulted_person_ids.map(id => (
              <span key={id} className="chip-person" data-testid="chip-consulted">
                <span className="person-av chip-av" aria-hidden="true">{initials(personName(id))}</span>
                <span className="chip-name">{personName(id)}</span>
                {editable && (
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove Consulted person ${personName(id)}`}
                    onClick={() => removeConsulted(id)}
                  >×</button>
                )}
              </span>
            ))}
            {editable && (
              <>
                <button
                  type="button"
                  className="add-person-btn"
                  onClick={() => setShowCPicker(true)}
                  aria-label="Add Consulted person"
                >+ Add</button>
                {showCPicker && (
                  <PersonPicker
                    people={people}
                    onSelect={addConsulted}
                    onClose={() => setShowCPicker(false)}
                    exclude={task.consulted_person_ids}
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Informed */}
        <div className="raci-field" data-testid="raci-informed">
          <div className="raci-label">
            <span className="role-chip role-chip-ci">
              <span className="role-marker role-marker-ci" aria-hidden="true">I</span>
              Informed
            </span>
          </div>
          <div className="multi-field">
            {task.informed_person_ids.map(id => (
              <span key={id} className="chip-person" data-testid="chip-informed">
                <span className="person-av chip-av" aria-hidden="true">{initials(personName(id))}</span>
                <span className="chip-name">{personName(id)}</span>
                {editable && (
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove Informed ${personName(id)}`}
                    onClick={() => removeInformed(id)}
                  >×</button>
                )}
              </span>
            ))}
            {editable && (
              <>
                <button
                  type="button"
                  className="add-person-btn"
                  onClick={() => setShowIPicker(true)}
                  aria-label="Add Informed person"
                >+ Add</button>
                {showIPicker && (
                  <PersonPicker
                    people={people}
                    onSelect={addInformed}
                    onClose={() => setShowIPicker(false)}
                    exclude={task.informed_person_ids}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Checklist card ───────────────────────────────────────────────────────────
type ChecklistCardProps = {
  items: ChecklistItemRow[]
  canEdit: boolean
  taskId: string
  viewerId: string
  onAdd: (label: string) => void
  onToggle: (id: string, isDone: boolean) => void
}
function ChecklistCard({ items, canEdit: editable, onAdd, onToggle }: ChecklistCardProps) {
  const [draft, setDraft] = useState('')
  const done = items.filter(i => i.is_done).length

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && draft.trim()) {
      onAdd(draft.trim())
      setDraft('')
    }
  }

  return (
    <section className="card" aria-label="Checklist">
      <h2 className="card-h2">
        Checklist
        {items.length > 0 && (
          <span className="checklist-count tabular-nums">{done} of {items.length} done</span>
        )}
      </h2>

      {items.length === 0 && !editable && (
        <p className="empty-substate">No steps yet.</p>
      )}

      <ul className="checklist-list">
        {items.map(item => (
          <li key={item.id} className="checklist-item">
            <input
              type="checkbox"
              id={`chk-${item.id}`}
              role="checkbox"
              aria-checked={item.is_done}
              checked={item.is_done}
              disabled={!editable}
              aria-label={item.label}
              onChange={() => editable && onToggle(item.id, !item.is_done)}
              className="checklist-checkbox"
            />
            <label
              htmlFor={`chk-${item.id}`}
              className={item.is_done ? 'checklist-label checklist-done' : 'checklist-label'}
            >
              {item.label}
            </label>
          </li>
        ))}
      </ul>

      {editable && (
        <input
          type="text"
          className="checklist-add-input"
          placeholder="+ Add a step"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Add checklist item"
        />
      )}
    </section>
  )
}

// ── Activity event label helper ──────────────────────────────────────────────
function eventLabel(ev: TaskEventRow): string {
  switch (ev.event_type) {
    case 'created':        return 'Created'
    case 'status_changed': return `Status changed${ev.from_value && ev.to_value ? ` · ${ev.from_value} → ${ev.to_value}` : ''}`
    case 'field_edited':   return 'Field edited'
    case 'raci_edited':    return 'RACI updated'
    case 'archived':       return 'Archived'
    case 'unarchived':     return 'Unarchived'
    default:               return ev.event_type
  }
}

// ── Activity card ────────────────────────────────────────────────────────────
type ActivityCardProps = {
  events: TaskEventRow[]
  people: PersonOption[]
  now: Date
}
function ActivityCard({ events, people, now }: ActivityCardProps) {
  function personName(id: string) {
    return people.find(p => p.id === id)?.full_name ?? 'Someone'
  }

  return (
    <section className="card" aria-label="Activity & updates" role="region">
      <h2 className="card-h2">Activity &amp; updates</h2>
      {events.length === 0 && <p className="empty-substate">No activity yet.</p>}
      <div className="thread">
        {events.map(ev => (
          <div key={ev.id} className="event-entry" data-testid="event-entry">
            <span className="event-av" aria-hidden="true">{initials(personName(ev.actor_person_id))}</span>
            <div className="event-body">
              <span className="event-who">{personName(ev.actor_person_id)}</span>
              <span className="event-when tabular-nums">{formatAge(ev.created_at, now)}</span>
              <div className="event-label">{eventLabel(ev)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
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

// ── Main component ────────────────────────────────────────────────────────────
export default function TaskDetail() {
  useDocumentTitle('Task — Gordi MOS')
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const auth = useAuth()

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

  // ── Lookup maps ─────────────────────────────────────────────────────────
  const buMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const bu of busDirectory) m.set(bu.id, bu.name)
    return m
  }, [busDirectory])

  // ── Permission ───────────────────────────────────────────────────────────
  const editable = useMemo(() => localTask
    ? canEdit(localTask, viewerId, isManager)
    : false,
  [localTask, viewerId, isManager])

  const archiveable = useMemo(() => localTask
    ? canArchive(localTask, viewerId, isManager)
    : false,
  [localTask, viewerId, isManager])

  // ── Status change ────────────────────────────────────────────────────────
  async function handleStatusChange(newStatus: TaskStatus) {
    if (!localTask) return
    const oldStatus = localTask.status
    // Optimistic update (inline, no navigation — FR-031)
    setLocalTask(t => t ? { ...t, status: newStatus } : t)
    try {
      await updateTaskStatus(localTask.id, oldStatus, newStatus, viewerId)
      // Refresh events without resetting localTask status (keep optimistic)
      // Use getTask directly to update events, then restore optimistic status
      const refreshed = await getTask(localTask.id)
      setData(refreshed)
      setLocalChecklist(refreshed.checklist)
      // Preserve the optimistic status across the refresh
      setLocalTask(t => t ? { ...t, status: newStatus } : t)
    } catch {
      // Revert on error
      setLocalTask(t => t ? { ...t, status: oldStatus } : t)
    }
  }

  // ── RACI change ──────────────────────────────────────────────────────────
  async function handleRaciChange(patch: Partial<Pick<TaskListRow, 'consulted_person_ids' | 'informed_person_ids'>>) {
    if (!localTask) return
    const prev = { ...localTask }
    setLocalTask(t => t ? { ...t, ...patch } : t)
    try {
      await updateTaskRaci(localTask.id, patch, viewerId)
    } catch {
      setLocalTask(prev)
    }
  }

  // ── Checklist add ────────────────────────────────────────────────────────
  async function handleAddChecklist(label: string) {
    if (!localTask) return
    const position = localChecklist.length
    try {
      await addChecklistItem(localTask.id, label, position, viewerId)
      // Optimistic add
      const newItem: ChecklistItemRow = {
        id: `optimistic-${Date.now()}`, org_id: '', task_id: localTask.id,
        label, is_done: false, position,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      setLocalChecklist(prev => [...prev, newItem])
    } catch { /* surface error later */ }
  }

  // ── Checklist toggle ─────────────────────────────────────────────────────
  async function handleToggle(itemId: string, isDone: boolean) {
    if (!localTask) return
    setLocalChecklist(prev => prev.map(i => i.id === itemId ? { ...i, is_done: isDone } : i))
    try {
      await toggleChecklistItem(itemId, isDone, localTask.id, viewerId)
    } catch {
      setLocalChecklist(prev => prev.map(i => i.id === itemId ? { ...i, is_done: !isDone } : i))
    }
  }

  // ── Archive/unarchive ────────────────────────────────────────────────────
  const [showConfirm, setShowConfirm] = useState(false)
  async function handleArchive() {
    if (!localTask) return
    try {
      await archiveTask(localTask.id, viewerId)
      navigate('/tasks')
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
  if (loading) return <PageFrame><DetailSkeleton /></PageFrame>

  if (notFound || !localTask) {
    return (
      <PageFrame>
        <div className="not-found-panel">
          <h1 className="not-found-title">Task not found</h1>
          <p className="not-found-copy">This task doesn&apos;t exist or you don&apos;t have access.</p>
          <Link to="/tasks" className="btn-outline-link">All tasks</Link>
        </div>
      </PageFrame>
    )
  }

  const task = localTask
  const buName = buMap.get(task.business_unit_id) ?? task.business_unit_id
  const isArchived = task.archived_at != null
  const events = data?.events ?? []

  return (
    <PageFrame>
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/tasks" className="breadcrumb-link">Tasks</Link>
        <span className="breadcrumb-sep" aria-hidden="true"> / </span>
        <span className="breadcrumb-current">{task.title}</span>
      </nav>

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

      {/* RACI card */}
      <RaciCard
        task={task}
        people={peopleDirectory}
        canEdit={editable}
        viewerId={viewerId}
        onRaciChange={handleRaciChange}
      />

      {/* Checklist card */}
      <ChecklistCard
        items={localChecklist}
        canEdit={editable}
        taskId={task.id}
        viewerId={viewerId}
        onAdd={handleAddChecklist}
        onToggle={handleToggle}
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

      <style>{`
        /* ── Breadcrumb ── */
        .breadcrumb { font-size: 13px; color: hsl(var(--muted-foreground)); margin-bottom: 12px; }
        .breadcrumb-link { color: hsl(var(--muted-foreground)); text-decoration: none; }
        .breadcrumb-link:hover { color: hsl(var(--foreground)); }
        .breadcrumb-link:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
        .breadcrumb-sep { margin: 0 6px; }
        .breadcrumb-current { color: hsl(var(--foreground)); font-weight: 500; }

        /* ── Archived banner ── */
        .archived-banner {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px; margin-bottom: 12px;
          background: hsl(var(--secondary)); border: 1px solid hsl(var(--border));
          border-radius: 8px; font-size: 13px; color: hsl(var(--muted-foreground));
        }

        /* ── Head card ── */
        .head-card {
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 8px; padding: 16px 20px; margin-bottom: 16px;
        }
        .head-top { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
        .head-title-block { flex: 1; min-width: 0; }
        .task-title {
          font-size: 24px; font-weight: 700; line-height: 1.2; letter-spacing: -0.02em;
          color: hsl(var(--foreground));
        }
        .actions-cluster {
          display: flex; align-items: center; gap: 8px; flex-shrink: 0; flex-wrap: wrap;
        }

        /* ── Status trigger ── */
        .status-trigger-wrap { position: relative; }
        .status-trigger {
          height: 32px; padding: 0 10px; border: 1px solid hsl(var(--input));
          border-radius: 8px; background: hsl(var(--background)); font: inherit;
          font-size: 13px; cursor: pointer; display: inline-flex; align-items: center;
          gap: 8px; color: hsl(var(--foreground));
        }
        .status-trigger:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
        .trigger-chev { color: hsl(var(--muted-foreground)); font-size: 10px; }
        .status-popover {
          position: absolute; top: calc(100% + 4px); left: 0; z-index: 50;
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 8px; padding: 4px; min-width: 140px;
          box-shadow: 0 4px 16px hsl(240 10% 3.9% / 0.10);
        }
        .status-option {
          padding: 6px 8px; border-radius: 6px; cursor: pointer;
          display: flex; align-items: center;
        }
        .status-option:hover, .status-option:focus-visible { background: hsl(var(--accent)); }
        .status-option:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: -2px; }
        .status-option-active { background: hsl(var(--accent)); }

        /* ── Btn styles ── */
        .btn-ghost {
          height: 32px; padding: 0 12px; border-radius: 8px; border: 0;
          background: transparent; font: inherit; font-size: 13px; font-weight: 500;
          color: hsl(var(--muted-foreground)); cursor: pointer;
        }
        .btn-ghost:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }
        .btn-ghost:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
        .btn-outline-sm {
          height: 28px; padding: 0 10px; border-radius: 6px;
          border: 1px solid hsl(var(--border)); background: hsl(var(--background));
          font: inherit; font-size: 12px; cursor: pointer; color: hsl(var(--foreground));
        }
        .btn-outline-link {
          display: inline-flex; align-items: center;
          height: 32px; padding: 0 12px; border-radius: 8px;
          border: 1px solid hsl(var(--border)); background: hsl(var(--background));
          font-size: 13px; font-weight: 600; color: hsl(var(--foreground));
          text-decoration: none;
        }
        .btn-outline-link:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

        /* ── Archive confirm ── */
        .confirm-overlay {
          position: fixed; inset: 0; background: hsl(240 10% 3.9% / 0.45);
          display: grid; place-items: center; z-index: 100;
        }
        .confirm-box {
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 10px; padding: 20px 24px; max-width: 360px; width: 90%;
          box-shadow: 0 8px 32px hsl(240 10% 3.9% / 0.18);
        }
        .confirm-msg { font-size: 14px; line-height: 1.5; margin-bottom: 16px; }
        .confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
        .confirm-cancel {
          height: 32px; padding: 0 12px; border-radius: 8px;
          border: 1px solid hsl(var(--border)); background: hsl(var(--background));
          font: inherit; font-size: 13px; cursor: pointer;
        }
        .btn-archive {
          height: 32px; padding: 0 12px; border-radius: 8px; border: 0;
          background: hsl(var(--destructive)); color: hsl(0 0% 98%);
          font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
        }
        .btn-archive:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

        /* ── Meta row ── */
        .meta-row { display: flex; gap: 20px; margin-top: 12px; flex-wrap: wrap; }
        .meta-item { display: flex; flex-direction: column; gap: 2px; }
        .meta-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
          text-transform: uppercase; color: hsl(var(--muted-foreground));
        }
        .meta-value { font-size: 13px; color: hsl(var(--foreground)); }

        /* ── Generic card ── */
        .card {
          background: hsl(var(--card)); border: 1px solid hsl(var(--border));
          border-radius: 8px; padding: 16px 20px; margin-bottom: 16px;
        }
        .card-h2 {
          font-size: 18px; font-weight: 600; line-height: 1.3; margin-bottom: 12px;
          display: flex; align-items: center; gap: 10px; color: hsl(var(--foreground));
        }

        /* ── Description ── */
        .desc-body { font-size: 14px; line-height: 1.5; color: hsl(var(--foreground)); }
        .empty-substate { font-size: 13px; color: hsl(var(--muted-foreground)); }

        /* ── RACI ── */
        .raci-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
        @media (max-width: 767px) { .raci-grid { grid-template-columns: 1fr; } }
        .raci-field { min-width: 0; }
        .raci-label { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .role-chip {
          display: inline-flex; align-items: center; gap: 6px;
          height: 20px; padding: 0 9px 0 7px; border-radius: 999px;
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
        }
        .role-marker {
          width: 15px; height: 15px; border-radius: 999px; display: grid;
          place-items: center; font-size: 9.5px; font-weight: 700; color: hsl(0 0% 98%);
        }
        .role-chip-r { background: hsl(221.2 83.2% 53.3% / 0.10); color: hsl(221 75% 38%); }
        .role-chip-r .role-marker { background: hsl(221.2 83.2% 53.3%); }
        .role-chip-a { background: hsl(262 83% 58% / 0.12); color: hsl(262 60% 42%); }
        .role-chip-a .role-marker { background: hsl(262 83% 58%); }
        .role-chip-ci { background: hsl(var(--secondary)); color: hsl(var(--muted-foreground)); }
        .role-marker-ci { background: hsl(var(--muted-foreground)); }
        .person-field {
          height: 36px; border: 1px solid hsl(var(--input)); border-radius: 8px;
          background: hsl(var(--background)); padding: 0 10px;
          display: flex; align-items: center; gap: 8px;
        }
        .person-av {
          width: 22px; height: 22px; border-radius: 999px; flex: none;
          background: linear-gradient(135deg, hsl(221.2 83.2% 53.3%), hsl(262 83% 58%));
          color: hsl(0 0% 98%); display: grid; place-items: center;
          font-size: 10px; font-weight: 700;
        }
        .person-av-a {
          background: linear-gradient(135deg, hsl(262 83% 58%), hsl(221.2 83.2% 53.3%));
        }
        .person-name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .multi-field {
          display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
          padding: 6px 8px; min-height: 36px; border: 1px solid hsl(var(--input));
          border-radius: 8px; background: hsl(var(--background));
        }
        .chip-person {
          display: inline-flex; align-items: center; gap: 5px; height: 24px;
          padding: 0 8px 0 4px; border-radius: 999px;
          background: hsl(var(--secondary)); font-size: 12px;
        }
        .chip-av {
          width: 16px; height: 16px; font-size: 9px;
        }
        .chip-remove {
          border: 0; background: transparent; color: hsl(var(--muted-foreground));
          cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1;
          display: flex; align-items: center;
        }
        .chip-remove:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
        .add-person-btn {
          border: 0; background: transparent; font-size: 12px;
          color: hsl(221 75% 38%); cursor: pointer; padding: 2px 4px;
        }
        .add-person-btn:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

        /* ── Person picker ── */
        .person-picker {
          position: absolute; z-index: 50; background: hsl(var(--card));
          border: 1px solid hsl(var(--border)); border-radius: 8px; padding: 4px;
          min-width: 200px; max-height: 200px; overflow-y: auto;
          box-shadow: 0 4px 16px hsl(240 10% 3.9% / 0.10);
        }
        .person-picker-option {
          display: flex; align-items: center; gap: 8px; padding: 6px 8px;
          border-radius: 6px; cursor: pointer; font-size: 13px;
        }
        .person-picker-option:hover, .person-picker-option:focus-visible {
          background: hsl(var(--accent));
        }
        .person-picker-option:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: -2px; }

        /* ── Checklist ── */
        .checklist-count { font-size: 13px; font-weight: 400; color: hsl(var(--muted-foreground)); }
        .checklist-list { list-style: none; padding: 0; margin: 0 0 8px; }
        .checklist-item {
          display: flex; align-items: center; gap: 10px;
          min-height: 36px; padding: 4px 0;
          border-bottom: 1px solid hsl(240 5.9% 90% / 0.7);
        }
        .checklist-item:last-child { border-bottom: none; }
        .checklist-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: hsl(var(--primary)); flex: none; }
        .checklist-label { font-size: 14px; flex: 1; cursor: pointer; }
        .checklist-done { color: hsl(var(--muted-foreground)); text-decoration: line-through; }
        .checklist-add-input {
          width: 100%; border: 0; outline: none; background: transparent;
          font: inherit; font-size: 13px; color: hsl(var(--muted-foreground));
          padding: 6px 0; border-top: 1px solid hsl(var(--border));
        }
        .checklist-add-input::placeholder { color: hsl(var(--muted-foreground)); }
        .checklist-add-input:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }

        /* ── Activity thread ── */
        .thread { display: flex; flex-direction: column; }
        .event-entry {
          display: flex; gap: 10px; padding: 10px 0;
          border-bottom: 1px solid hsl(240 5.9% 90% / 0.7);
        }
        .event-entry:last-child { border-bottom: none; }
        .event-av {
          width: 26px; height: 26px; border-radius: 999px; flex: none;
          background: linear-gradient(135deg, hsl(221.2 83.2% 53.3%), hsl(262 83% 58%));
          color: hsl(0 0% 98%); display: grid; place-items: center;
          font-size: 10px; font-weight: 700;
        }
        .event-body { flex: 1; min-width: 0; }
        .event-who { font-size: 13px; font-weight: 600; color: hsl(var(--foreground)); margin-right: 6px; }
        .event-when { font-size: 12px; color: hsl(var(--muted-foreground)); }
        .event-label { font-size: 12px; color: hsl(var(--muted-foreground)); margin-top: 2px; }

        /* ── Not found ── */
        .not-found-panel { padding: 48px 0; }
        .not-found-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: hsl(var(--foreground)); }
        .not-found-copy { font-size: 14px; color: hsl(var(--muted-foreground)); margin-bottom: 16px; }

        /* ── Loading skeleton ── */
        .sk-block { margin-bottom: 16px; }
        .sk {
          background: hsl(var(--secondary)); border-radius: 6px; display: block;
          animation: sk-pulse 1.4s ease-in-out infinite;
        }
        @keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

        /* ── Utility ── */
        .sr-only {
          position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
          overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0;
        }
        .tabular-nums { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }

        /* ── Status pill reuse (pulled from TasksPage tokens) ── */
        .pill { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
        .dot { width: 6px; height: 6px; border-radius: 999px; flex: none; }
        .pill-inprogress { background: hsl(221 83% 53% / 0.12); color: hsl(221 75% 38%); }
        .pill-inprogress .dot { background: hsl(221.2 83.2% 53.3%); }
        .pill-blocked { background: hsl(0 84% 60% / 0.12); color: hsl(0 72% 45%); }
        .pill-blocked .dot { background: hsl(0 84.2% 60.2%); }
        .pill-open { background: hsl(43 96% 56% / 0.18); color: hsl(22 78% 26%); }
        .pill-open .dot { background: hsl(43 96% 56%); }
        .pill-done { background: hsl(142 71% 45% / 0.14); color: hsl(142 64% 30%); }
        .pill-done .dot { background: hsl(142 71% 45%); }
      `}</style>
    </PageFrame>
  )
}
