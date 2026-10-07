// WIB (Asia/Jakarta, UTC+7, no DST) due-date classifier. Pure → clock-mocked unit tests.
// A task's due_date is a plain DATE (no time-of-day); overdue/soon are computed
// against the WIB calendar day of `now`.

import { wibToday } from '@/lib/format/date'

export type DueStatus = 'overdue' | 'soon' | 'calm' | 'none'

// Minimal shape that isOverdue needs — avoids importing the full TaskListRow cycle.
type IsOverdueTask = {
  status: string
  due_date: string | null
  archived_at: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const SOON_WINDOW_DAYS = 3

/** The WIB calendar day of `now`, as a UTC-midnight epoch for that WIB date (for whole-day diffs). */
function wibDayEpoch(now: Date): number {
  const [year, month, day] = wibToday(now).split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/** A plain 'YYYY-MM-DD' DATE as a UTC-midnight epoch for that calendar day. */
function dateEpoch(dueDate: string): number {
  const [y, m, d] = dueDate.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/**
 * Classify a plain DATE against today-in-WIB:
 *   - before today        → 'overdue'
 *   - today..today+3 days  → 'soon'
 *   - later                → 'calm'
 *   - null                 → 'none'
 */
export function dueStatus(dueDate: string | null, now: Date): DueStatus {
  if (dueDate === null) return 'none'
  const diffDays = Math.round((dateEpoch(dueDate) - wibDayEpoch(now)) / DAY_MS)
  if (diffDays < 0) return 'overdue'
  if (diffDays <= SOON_WINDOW_DAYS) return 'soon'
  return 'calm'
}

/**
 * True only when a task is genuinely drifting: not Done, not archived, and
 * its due_date is in the past. (JTBD OD-P0-8: off-track = drifting work, not finished.)
 *
 * Use this everywhere an "is this task overdue?" decision is made so that
 * Done / archived tasks are always excluded. (RI-1)
 */
export function isOverdue(task: IsOverdueTask, now: Date): boolean {
  if (task.status === 'Done') return false
  if (task.archived_at != null) return false
  return dueStatus(task.due_date, now) === 'overdue'
}
