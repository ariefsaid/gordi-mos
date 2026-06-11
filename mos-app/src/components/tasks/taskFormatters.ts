import type { TaskListRow } from '../../lib/db/tasks.types'

/** Get first name from full_name. */
export function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName
}

/** Get initials (up to 2) from full_name. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

/** Format a duration between two ISO timestamps into a compact age string (e.g. "2h", "3d"). */
export function formatAge(isoDate: string, now: Date): string {
  const ms = now.getTime() - new Date(isoDate).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

/** Format a YYYY-MM-DD date into a display string like "Wed 12 Jun". */
export function formatDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, day))
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Collect unique persons (A + C + I) that are NOT the responsible person; returns count. */
export function otherRaciCount(task: TaskListRow): number {
  const r = task.responsible_person_id
  const seen = new Set<string>()
  if (task.accountable_person_id !== r) seen.add(task.accountable_person_id)
  for (const id of task.consulted_person_ids) if (id !== r) seen.add(id)
  for (const id of task.informed_person_ids) if (id !== r) seen.add(id)
  return seen.size
}
