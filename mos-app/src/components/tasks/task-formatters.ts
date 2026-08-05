import type { TaskListRow, TaskStatus } from '@/lib/db/tasks.types'
import type { Locale } from '@/i18n/messages'
import { formatWeekdayDayMonth } from '@/lib/format/date'

// OFF-TRACK-FIRST status order (OD-P3-6 / signed mockup): In Progress → Blocked → Open → Done.
// Shared by the tasks workspace + the My Week mini-table so the two never drift.
export const STATUS_ORDER: TaskStatus[] = ['In Progress', 'Blocked', 'Open', 'Done']

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

/** Format a YYYY-MM-DD date into a display string like "Wed 12 Jun".
 * Delegates to the canonical locale-aware date module (cohesion-debt 2026-07-19, item #1) rather
 * than a hardcoded en-GB `toLocaleDateString` — #191 (Home port) needs the viewer's locale on this
 * same formatter every other call site here already used unlocalized. Every existing caller passes
 * no `locale`, so the default reproduces the prior en-GB output exactly. */
export function formatDate(d: string, locale: Locale = 'en'): string {
  return formatWeekdayDayMonth(d, locale)
}

/** Resolve the human-facing provenance label for a Task row or record. */
export function taskSourceLabel(workLineName: string, objectiveName: string, adHocLabel: string): string {
  return workLineName || objectiveName || adHocLabel
}

/**
 * Retained for Home's My-Tasks card (`components/weekly/my-tasks-card.tsx`) — that surface is
 * NOT ported by #192 (it belongs to #191, the Home port, not yet started) and still uses the RACI
 * vocabulary v4's Tasks components moved past (PIC/Supervisor). v4 dropped this export entirely
 * because v4 has no My-Tasks card in this shape; deleting it here would break a live `dev` screen
 * outside this PR's scope, so it stays until #191 either ports Home onto the new vocabulary or
 * retires the card.
 */
export function otherRaciCount(task: TaskListRow): number {
  const r = task.responsible_person_id
  const seen = new Set<string>()
  if (task.accountable_person_id !== r) seen.add(task.accountable_person_id)
  for (const id of task.consulted_person_ids) if (id !== r) seen.add(id)
  for (const id of task.informed_person_ids) if (id !== r) seen.add(id)
  return seen.size
}
