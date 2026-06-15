import type { TaskListRow } from '../../lib/db/tasks.types'

// ── Permission helpers (optimistic UX gate; DB is authority) ────────────────
// Mirrors mos.can_edit_task: viewer is R, A, or any manager.
export function canEdit(task: TaskListRow, viewerId: string, isManager: boolean): boolean {
  return (
    task.responsible_person_id === viewerId ||
    task.accountable_person_id === viewerId ||
    isManager
  )
}

// Archive gate: A or manager (narrower than edit — not bare R).
export function canArchive(task: TaskListRow, viewerId: string, isManager: boolean): boolean {
  return task.accountable_person_id === viewerId || isManager
}
