import type { TaskListRow } from '@/lib/db/tasks.types'
import { messages } from '@/i18n/messages'
import type { PersonOption } from '@/lib/db/directory'

// ── Permission helpers (optimistic UX gate; DB is authority) ────────────────
// Mirrors mos.can_edit_task (#742 AC-056/AC-061, narrowed): viewer is PIC, Supervisor, or a
// manager the caller already resolved to be in the PIC's own reporting line — isManager carries
// that resolved fact in, this helper does not re-derive which chain it came from.
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

export function picOptions(viewerId: string, people: readonly PersonOption[], downlineIds: readonly string[]): PersonOption[] {
  const allowed = new Set([viewerId, ...downlineIds])
  return people.filter((person) => allowed.has(person.id))
}

export function picLockMessage(hasDownline: boolean, locale: 'en' | 'id' = 'en'): string | null {
  return hasDownline ? null : messages[locale]['tasks.picOnly']
}
