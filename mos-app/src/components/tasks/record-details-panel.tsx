import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { PersonOption } from '@/lib/db/directory'
import { StatusPill } from './status-pill'
import { StatusTrigger } from './status-trigger'
import { RaciCard } from './raci-card'
import { formatDate, initials } from './task-formatters'

export type RecordDetailsPanelProps = {
  task: TaskListRow
  buName: string
  people: PersonOption[]
  editable: boolean
  viewerId: string
  // [done, total] checklist tally for the summary field
  checklistCount: [number, number]
  // compact = the drawer-width variant (stacked above the feed). The drawer's
  // pinned header already owns the identity row + Status trigger, so the compact
  // panel suppresses both to avoid duplicate controls.
  compact?: boolean
  onStatusChange: (s: TaskStatus) => void
  onRaChange: (patch: Partial<Pick<TaskListRow, 'responsible_person_id' | 'accountable_person_id'>>) => void
  onRaciChange: (patch: Partial<Pick<TaskListRow, 'consulted_person_ids' | 'informed_person_ids'>>) => void
}

// The left details panel of the two-column record surface (ADR-0013 D3): an
// identity row (task name + "BU · code" sub-line) above field sections —
// Status (inline StatusTrigger for editors) · Ownership (R/A/C/I) · Dates ·
// Checklist count. Status + R/A sit above the fold (Lens-D Q3). A `compact`
// variant renders the same anatomy for the drawer width.
export function RecordDetailsPanel({
  task, buName, people, editable, viewerId, checklistCount, compact,
  onStatusChange, onRaChange, onRaciChange,
}: RecordDetailsPanelProps) {
  const [done, total] = checklistCount
  // Short reference code derived from the task id — no new field (the mockup's
  // "TASK-1042" stands in for a stable per-task ref; we surface the id suffix).
  const code = task.id.slice(0, 8).toUpperCase()

  return (
    <section
      className={`record-details${compact ? ' record-details-compact' : ''}`}
      aria-label="Task details"
      data-testid="record-details"
    >
      {/* Identity row — suppressed in compact (the drawer header owns it) */}
      {!compact && (
        <div className="rd-identity">
          <span className="rd-id-av" aria-hidden="true">{initials(task.title) || '·'}</span>
          <div className="rd-id-text">
            <h1 className="rd-id-name" title={task.title}>{task.title}</h1>
            <p className="rd-id-sub" title={`${buName} · ${code}`}>{buName} · {code}</p>
          </div>
        </div>
      )}

      {/* Status — above the fold; suppressed in compact (the drawer header owns it) */}
      {!compact && (
        <div className="rd-section">
          <div className="rd-section-label">Status</div>
          {editable
            ? <StatusTrigger status={task.status} onChange={onStatusChange} />
            : <StatusPill status={task.status} />
          }
        </div>
      )}

      {/* Ownership (RACI) — R/A above the fold */}
      <div className="rd-section">
        <div className="rd-section-label">Ownership (RACI)</div>
        <RaciCard
          task={task}
          people={people}
          canEdit={editable}
          viewerId={viewerId}
          onRaciChange={onRaciChange}
          onRaChange={onRaChange}
        />
      </div>

      {/* Dates + checklist count */}
      <div className="rd-section">
        <div className="rd-section-label">Details</div>
        <dl className="rd-fields">
          <div className="rd-field">
            <dt className="rd-field-label">Due</dt>
            <dd className="rd-field-val tabular-nums">
              {task.due_date ? formatDate(task.due_date) : '—'}
            </dd>
          </div>
          <div className="rd-field">
            <dt className="rd-field-label">Unit</dt>
            <dd className="rd-field-val">{buName}</dd>
          </div>
          <div className="rd-field">
            <dt className="rd-field-label">Created</dt>
            <dd className="rd-field-val tabular-nums">
              {formatDate(task.created_at.slice(0, 10))}
            </dd>
          </div>
          <div className="rd-field">
            <dt className="rd-field-label">Checklist</dt>
            <dd className="rd-field-val tabular-nums">
              {total > 0 ? `${done} of ${total} done` : 'None yet'}
            </dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
