// StatusPill — a task lifecycle status, drawn by the one shared StatusBadge (Open · In Progress ·
// Blocked · Done). Kept as the task-typed entry point so call sites pass a TaskStatus.
import type { TaskStatus } from '@/lib/db/tasks.types'
import { StatusBadge, TASK_STATUS_KEY } from '@/components/ui/status-badge'

export type { TaskStatus }

type StatusPillProps = {
  status: TaskStatus
  label?: string
  /** Retained for call-site compatibility; Open is neutral everywhere now. */
  openTreatment?: 'flagged' | 'neutral'
}

export function StatusPill({ status, label }: StatusPillProps) {
  return <StatusBadge status={TASK_STATUS_KEY[status]} label={label} className="status-pill" />
}
