import type { TaskStatus } from '../../lib/db/tasks.types'
import './StatusPill.css'

export type { TaskStatus }

type StatusPillProps = { status: TaskStatus }

export function StatusPill({ status }: StatusPillProps) {
  const classes: Record<TaskStatus, string> = {
    'In Progress': 'pill-inprogress',
    'Blocked':     'pill-blocked',
    'Open':        'pill-open',
    'Done':        'pill-done',
  }
  return (
    <span className={`pill ${classes[status]}`}>
      <span className="dot" />
      {status}
    </span>
  )
}
