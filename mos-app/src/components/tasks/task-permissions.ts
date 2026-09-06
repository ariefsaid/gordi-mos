import type { TaskListRow } from '@/lib/db/tasks.types'
import { messages } from '@/i18n/messages'
import type { PersonOption } from '@/lib/db/directory'

// ── Permission helpers (optimistic UX gate; DB is authority) ────────────────
// Mirrors mos.can_edit_task (#742 AC-061, delta-narrowed): the caller hands over the viewer's
// already-loaded downline person ids and THIS helper derives the chain fact — whether the viewer
// is above the PIC (downlineIds includes responsible_person_id) — alongside the PIC/Supervisor
// identity checks. A manager not above the PIC is a reader, exactly as the DB refuses them.
export function canEdit(task: TaskListRow, viewerId: string, downlineIds: readonly string[]): boolean {
  return (
    task.responsible_person_id === viewerId ||
    task.accountable_person_id === viewerId ||
    downlineIds.includes(task.responsible_person_id)
  )
}

// Archive gate: A or a manager above the PIC (narrower than edit — not bare R).
export function canArchive(task: TaskListRow, viewerId: string, downlineIds: readonly string[]): boolean {
  return task.accountable_person_id === viewerId || downlineIds.includes(task.responsible_person_id)
}

export function picOptions(viewerId: string, people: readonly PersonOption[], downlineIds: readonly string[]): PersonOption[] {
  const allowed = new Set([viewerId, ...downlineIds])
  return people.filter((person) => allowed.has(person.id))
}

export function picLockMessage(hasDownline: boolean, locale: 'en' | 'id' = 'en'): string | null {
  return hasDownline ? null : messages[locale]['tasks.picOnly']
}
