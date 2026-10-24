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

// Mirrors mos.can_person_read_task for a Task already in hand: a public Task reads org-wide; a private
// one reads for the creator, PIC, Supervisor, a listed person, an admin, or a live attendee of the
// private Meeting it was created in. The database decides what the viewer receives; this is for copy
// such as "you can see this because ...".
export function canSeePrivateTask(
  task: Pick<TaskListRow, 'is_private' | 'created_by' | 'responsible_person_id' | 'accountable_person_id' | 'created_in_private_meeting'>,
  viewerId: string,
  listedPersonIds: readonly string[],
  isAdmin = false,
  isMeetingAttendee = false,
): boolean {
  return (
    !task.is_private ||
    isAdmin ||
    (task.created_in_private_meeting === true && isMeetingAttendee) ||
    [task.created_by, task.responsible_person_id, task.accountable_person_id, ...listedPersonIds].includes(viewerId)
  )
}

// Toggling Private or editing the who-can-see list needs the Task's edit gate (mos.can_change_task_privacy).
export function canChangePrivacy(task: TaskListRow, viewerId: string, downlineIds: readonly string[]): boolean {
  return canEdit(task, viewerId, downlineIds)
}

// "None, just me": the Supervisor is stored equal to the PIC, allowed only on a Task the PIC created.
export function isSoloSupervisor(task: Pick<TaskListRow, 'created_by' | 'responsible_person_id' | 'accountable_person_id'>): boolean {
  return task.accountable_person_id === task.responsible_person_id && task.responsible_person_id === task.created_by
}

// Archive gate: a non-PIC Supervisor or a manager above the PIC (OD-WAY-94). The database is
// authoritative; this only prevents presenting an archive affordance the archive guard will deny.
export function canArchive(task: TaskListRow, viewerId: string, downlineIds: readonly string[]): boolean {
  return (
    task.responsible_person_id !== viewerId &&
    (task.accountable_person_id === viewerId || downlineIds.includes(task.responsible_person_id))
  )
}

// OD-WAY-94 (1): a PIC is the viewer or their downline. An org-wide viewer (admin, OD-ROLE-1) may name
// anyone; mos._guard_tasks clause (E) mirrors it with shared.is_org_wide().
export function picOptions(viewerId: string, people: readonly PersonOption[], downlineIds: readonly string[], orgWide = false): PersonOption[] {
  if (orgWide) return [...people]
  const allowed = new Set([viewerId, ...downlineIds])
  return people.filter((person) => allowed.has(person.id))
}

export function picLockMessage(hasDownline: boolean, locale: 'en' | 'id' = 'en'): string | null {
  return hasDownline ? null : messages[locale]['tasks.picOnly']
}
