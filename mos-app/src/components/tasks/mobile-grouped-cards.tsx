import { Link } from 'react-router-dom'
import type { TaskListRow } from '@/lib/db/tasks.types'
import type { OwnerCellRaciMember } from './owner-cell'
import { OwnerCell } from './owner-cell'
import { StatusPill } from './status-pill'
import { Chevron } from '@/shell/icons'
import { dueStatus, isOverdue } from '@/lib/due-status'
import { formatAge, formatDate, otherRaciCount } from './task-formatters'

// ── Shared group-model type (aligned with TasksWorkspace.RenderGroup) ─────────
export type MobileRenderGroup = {
  key: string
  label: string
  rows: TaskListRow[]
  overdue: number
  prefillParam: string
}

export type MobileGroupedCardsProps = {
  groups: MobileRenderGroup[]
  now: Date
  buMap: Map<string, string>
  personMap: Map<string, string>
  isCollapsed: (key: string) => boolean
  toggleCollapsed: (key: string) => void
  openAddTask: (prefillParam: string) => void
  setOverdueOnly: (value: boolean) => void
  buildOthers: (task: TaskListRow) => OwnerCellRaciMember[]
}

// ── Task card ─────────────────────────────────────────────────────────────────
type TaskCardProps = {
  task: TaskListRow
  now: Date
  buName: string
  rName: string
  others: OwnerCellRaciMember[]
}

function TaskCard({ task, now, buName, rName, others }: TaskCardProps) {
  const ds = dueStatus(task.due_date, now)
  const taskOverdue = isOverdue(task, now)
  const age = formatAge(task.last_activity_at, now)
  const n = otherRaciCount(task)
  const isArchived = task.archived_at != null
  // C1: only genuinely-overdue (non-Done, non-archived) gets red class / "Overdue · " prefix.
  const dueClass = taskOverdue ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (taskOverdue ? `Overdue · ${formatDate(task.due_date)}` : formatDate(task.due_date))
    : '—'

  return (
    <article data-testid="task-card" className="task-card">
      <Link to={`/tasks/${task.id}`} className="task-card-link">
        <div className="task-card-head">
          {isArchived && <span className="archived-tag">Archived</span>}
          <span className={isArchived ? 'task-name task-name-archived' : 'task-name'}>{task.title}</span>
          <StatusPill status={task.status} />
        </div>
        <span className="task-bu">{buName}</span>
        <dl className="task-card-meta">
          <dt className="sr-only">Owner</dt>
          <dd><OwnerCell fullName={rName} otherCount={n} others={others} /></dd>
          <dt className="sr-only">Due</dt>
          <dd className={`tabular-nums ${dueClass}`}>{dueText}</dd>
          <dt className="sr-only">Activity</dt>
          <dd className="act tabular-nums">{age}</dd>
        </dl>
      </Link>
    </article>
  )
}

/**
 * Mobile grouped card list (AC-129, FR-127).
 *
 * Extracted from the inline mobile block in TasksWorkspace (PR-3 fix-up).
 * The group-header chrome (caret / label / count / overdue-gating / add+toggle)
 * mirrors the semantics of desktop GroupHeaderRow — same aria-expanded, same
 * aria-label patterns, same callback contracts — so there is one conceptual
 * source for group-header behavior across desktop and mobile.
 *
 * CSS: uses the existing .mgc-* classes from TasksWorkspace.css.
 */
export function MobileGroupedCards({
  groups, now, buMap, personMap,
  isCollapsed, toggleCollapsed, openAddTask, setOverdueOnly, buildOthers,
}: MobileGroupedCardsProps) {
  return (
    <div className="mgc" role="list" aria-label="Tasks">
      {groups.map(group => (
        <div key={`mgc-${group.key}`} className="mgc-group">
          <div className="mgc-group-head">
            <button
              type="button"
              className="mgc-caret"
              aria-expanded={!isCollapsed(group.key)}
              aria-label={isCollapsed(group.key) ? `Expand ${group.label} group` : `Collapse ${group.label} group`}
              onClick={() => toggleCollapsed(group.key)}
            >
              {/* IXD-1: ONE shared Chevron, rotated −90° when collapsed (down = expanded). */}
              <Chevron className={`mgc-chev${isCollapsed(group.key) ? ' mgc-chev-collapsed' : ''}`} />
            </button>
            <span className="mgc-label">{group.label}</span>
            <span className="mgc-count tabular-nums">{group.rows.length}</span>
            {group.overdue > 0 && (
              <button
                type="button"
                className="mgc-sub"
                aria-label={`Filter to ${group.overdue} overdue tasks`}
                onClick={() => setOverdueOnly(true)}
              >
                · {group.overdue} overdue
              </button>
            )}
            <button
              type="button"
              className="mgc-add"
              aria-label={`Add task to ${group.label}`}
              onClick={() => openAddTask(group.prefillParam)}
            >
              + Add task
            </button>
          </div>
          {!isCollapsed(group.key) && group.rows.map(task => (
            <div key={task.id} role="listitem">
              <TaskCard
                task={task}
                now={now}
                buName={buMap.get(task.business_unit_id) ?? ''}
                rName={personMap.get(task.responsible_person_id) ?? ''}
                others={buildOthers(task)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
