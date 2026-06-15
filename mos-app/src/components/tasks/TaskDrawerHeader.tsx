import type { TaskListRow, TaskStatus } from '../../lib/db/tasks.types'
import type { PersonOption } from '../../lib/db/directory'
import { StatusPill } from './StatusPill'
import { StatusTrigger } from './StatusTrigger'
import { formatAge, formatDate } from './taskFormatters'
import { dueStatus } from '../../lib/dueStatus'

export type TaskDrawerHeaderProps = {
  task: TaskListRow
  buName: string
  people: PersonOption[]
  editable: boolean
  archiveable: boolean
  expanded: boolean
  now: Date
  onStatusChange: (s: TaskStatus) => void
  onExpandToggle: () => void
  onClose: () => void
  onArchive: () => void
}

const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
)
const CollapseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M9 3H3v6M21 15v6h-6M3 3l7 7M21 21l-7-7" />
  </svg>
)
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
)

/**
 * The PINNED action header of the task drawer (Variant B, design-plan §1.2):
 * utility bar (expand + close), title + unit/due, inline Status trigger, and
 * R/A mini-chips — the decision drivers stay above the fold at any tab/scroll.
 * Presentational: all mutations are routed through the supplied callbacks.
 */
export function TaskDrawerHeader({
  task, buName, people, editable, archiveable, expanded, now,
  onStatusChange, onExpandToggle, onClose, onArchive,
}: TaskDrawerHeaderProps) {
  const nameOf = (id: string) => people.find(p => p.id === id)?.full_name ?? id
  const ds = dueStatus(task.due_date, now)
  const dueClass = ds === 'overdue' ? 'due-overdue' : ds === 'soon' ? 'due-soon' : 'due-calm'
  const dueText = task.due_date
    ? (ds === 'overdue' ? `Overdue · ${formatDate(task.due_date)}` : formatDate(task.due_date))
    : '—'

  return (
    <header className={expanded ? 'dw-head dw-head-expanded' : 'dw-head'}>
      {/* Utility bar */}
      <div className="dw-bar">
        <span className="dw-crumb-mini">{expanded ? 'Task · full width' : 'Task'}</span>
        <span className="dw-bar-spacer" />
        <button
          type="button"
          className={expanded ? 'dw-iconbtn dw-iconbtn-on' : 'dw-iconbtn'}
          aria-pressed={expanded}
          aria-label={expanded ? 'Collapse to split (e)' : 'Expand to full width (e)'}
          title={expanded ? 'Collapse (e)' : 'Expand (e)'}
          onClick={onExpandToggle}
        >
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </button>
        <button
          type="button"
          className="dw-iconbtn"
          aria-label="Close (Esc)"
          title="Close (Esc)"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Pinned action block */}
      <div className="dw-pinned">
        <div className="dw-pinned-inner">
          <div className="dw-titlewrap">
            <h2 className="dw-title">{task.title}</h2>
            <p className="dw-unit">
              {buName} · due <span className={`${dueClass} tabular-nums`}>{dueText}</span>
            </p>
          </div>

          <div className="dw-statusrow">
            {editable
              ? <StatusTrigger status={task.status} onChange={onStatusChange} />
              : <StatusPill status={task.status} />
            }
            {expanded && archiveable && !task.archived_at && (
              <button type="button" className="btn-ghost-danger" aria-label="Archive task" onClick={onArchive}>
                Archive task
              </button>
            )}
            <span className="act tabular-nums dw-activity">Activity {formatAge(task.last_activity_at, now)} ago</span>
          </div>

          <div className="dw-ra">
            <div className="ra-mini">
              <span className="ra-glyph ra-glyph-r" aria-hidden="true">R</span>
              <div>
                <div className="ra-who">{nameOf(task.responsible_person_id)}</div>
                <div className="ra-role">Responsible</div>
              </div>
            </div>
            <div className="ra-mini">
              <span className="ra-glyph ra-glyph-a" aria-hidden="true">A</span>
              <div>
                <div className="ra-who">{nameOf(task.accountable_person_id)}</div>
                <div className="ra-role">Accountable</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
