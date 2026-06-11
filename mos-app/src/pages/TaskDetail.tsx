import './TaskDetail.css'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import PageFrame from '../shell/PageFrame'
import { useDocumentTitle } from '../shell/useDocumentTitle'
import { useAuth } from '../auth/useAuth'
import { getTask, updateTaskStatus, updateTaskRaci, updateTaskFields, addChecklistItem, toggleChecklistItem, reorderChecklistItem, deleteChecklistItem, archiveTask, unarchiveTask } from '../lib/db/tasks'
import type { TaskDetail as TaskDetailData } from '../lib/db/tasks'
import type { TaskListRow, TaskStatus, ChecklistItemRow, TaskEventRow } from '../lib/db/tasks.types'
import { getBusinessUnits, getPeople } from '../lib/db/directory'
import type { BusinessUnitOption, PersonOption } from '../lib/db/directory'
import { StatusPill } from '../components/tasks/StatusPill'
import { formatAge, formatDate, initials } from '../components/tasks/taskFormatters'

// ── Permission helpers (optimistic UX gate; DB is authority) ────────────────
// Mirrors mos.can_edit_task: viewer is R, A, or any manager.
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
  onRaChange: (patch: Partial<Pick<TaskListRow, 'responsible_person_id' | 'accountable_person_id'>>) => void
}
function RaciCard({ task, people, canEdit: editable, onRaciChange, onRaChange }: RaciCardProps) {
  const [showCPicker, setShowCPicker] = useState(false)
  const [showIPicker, setShowIPicker] = useState(false)
  // I2: R/A pickers
  const [showRPicker, setShowRPicker] = useState(false)
  const [showAPicker, setShowAPicker] = useState(false)

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
        {/* Responsible — I2: editable picker for editors */}
        <div className="raci-field">
          <div className="raci-label">
            <span className="role-chip role-chip-r">
              <span className="role-marker" aria-hidden="true">R</span>
              Responsible
            </span>
          </div>
          {editable ? (
            <>
              <button
                type="button"
                className="person-field-btn"
                aria-label="Change Responsible"
                aria-haspopup="listbox"
                aria-expanded={showRPicker}
                onClick={() => setShowRPicker(o => !o)}
              >
                <span className="person-av" aria-hidden="true">{initials(rName)}</span>
                <span className="person-name">{rName}</span>
                <span className="person-field-edit-hint" aria-hidden="true">▾</span>
              </button>
              {showRPicker && (
                <PersonPicker
                  people={people}
                  onSelect={id => onRaChange({ responsible_person_id: id })}
                  onClose={() => setShowRPicker(false)}
                />
              )}
            </>
          ) : (
            <div className="person-field" aria-label={`Responsible: ${rName}`}>
              <span className="person-av" aria-hidden="true">{initials(rName)}</span>
              <span className="person-name">{rName}</span>
            </div>
          )}
        </div>

        {/* Accountable — I2: editable picker for editors */}
        <div className="raci-field">
          <div className="raci-label">
            <span className="role-chip role-chip-a">
              <span className="role-marker" aria-hidden="true">A</span>
              Accountable
            </span>
          </div>
          {editable ? (
            <>
              <button
                type="button"
                className="person-field-btn"
                aria-label="Change Accountable"
                aria-haspopup="listbox"
                aria-expanded={showAPicker}
                onClick={() => setShowAPicker(o => !o)}
              >
                <span className="person-av person-av-a" aria-hidden="true">{initials(aName)}</span>
                <span className="person-name">{aName}</span>
                <span className="person-field-edit-hint" aria-hidden="true">▾</span>
              </button>
              {showAPicker && (
                <PersonPicker
                  people={people}
                  onSelect={id => onRaChange({ accountable_person_id: id })}
                  onClose={() => setShowAPicker(false)}
                />
              )}
            </>
          ) : (
            <div className="person-field" aria-label={`Accountable: ${aName}`}>
              <span className="person-av person-av-a" aria-hidden="true">{initials(aName)}</span>
              <span className="person-name">{aName}</span>
            </div>
          )}
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
  onReorder: (id: string, direction: 'up' | 'down') => void
  onDelete: (id: string) => void
}
function ChecklistCard({ items, canEdit: editable, onAdd, onToggle, onReorder, onDelete }: ChecklistCardProps) {
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
        {items.map((item, idx) => (
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
            {editable && (
              <div className="checklist-controls">
                <button
                  type="button"
                  className="checklist-ctrl-btn"
                  aria-label={`Move up ${item.label}`}
                  disabled={idx === 0}
                  onClick={() => onReorder(item.id, 'up')}
                >▲</button>
                <button
                  type="button"
                  className="checklist-ctrl-btn"
                  aria-label={`Move down ${item.label}`}
                  disabled={idx === items.length - 1}
                  onClick={() => onReorder(item.id, 'down')}
                >▼</button>
                <button
                  type="button"
                  className="checklist-ctrl-btn checklist-ctrl-delete"
                  aria-label={`Delete checklist item ${item.label}`}
                  onClick={() => onDelete(item.id)}
                >×</button>
              </div>
            )}
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
    try {
      await updateTaskStatus(localTask.id, oldStatus, newStatus, viewerId)
      const refreshed = await getTask(localTask.id)
      setData(refreshed)
      setLocalTask(refreshed.task)
      setLocalChecklist(refreshed.checklist)
    } catch {
      setLocalTask(t => t ? { ...t, status: oldStatus } : t)
    }
  }

  // ── Shared: refetch events after any mutation ────────────────────────────
  async function refetchEvents(taskId: string) {
    try {
      const refreshed = await getTask(taskId)
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
    } catch {
      setLocalTask(prev)
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
    } catch {
      setLocalTask(prev)
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
    } catch {
      setLocalChecklist(prev => prev.filter(i => i.id !== newItem.id))
    }
  }

  // ── Checklist toggle ─────────────────────────────────────────────────────
  async function handleToggle(itemId: string, isDone: boolean) {
    if (!localTask) return
    setLocalChecklist(prev => prev.map(i => i.id === itemId ? { ...i, is_done: isDone } : i))
    try {
      await toggleChecklistItem(itemId, isDone, localTask.id, viewerId)
      await refetchEvents(localTask.id)
    } catch {
      setLocalChecklist(prev => prev.map(i => i.id === itemId ? { ...i, is_done: !isDone } : i))
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
    } catch {
      setLocalChecklist(prev)
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
  // C1 fix: early-returns are now BELOW the CSS import (top of file), so all
  // classes (.sk, .not-found-title, .btn-outline-link) are defined before mount.
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
        {/* I1: actions-cluster stacks below title at <768px via CSS media query in TaskDetail.css */}
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
    </PageFrame>
  )
}
