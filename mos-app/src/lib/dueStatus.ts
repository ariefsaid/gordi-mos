// WIB (Asia/Jakarta, UTC+7, no DST) due-date classifier. Pure → clock-mocked unit tests.
// Mirrors the fixed +7h offset arithmetic of lib/week.ts so there is no host-timezone leakage
// (NFR-004, OD-P2-6). A task's due_date is a plain DATE (no time-of-day); overdue/soon are computed
// against the WIB calendar day of `now`.

export type DueStatus = 'overdue' | 'soon' | 'calm' | 'none'

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const SOON_WINDOW_DAYS = 3

/** The WIB calendar day of `now`, as a UTC-midnight epoch for that WIB date (for whole-day diffs). */
function wibDayEpoch(now: Date): number {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS)
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
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
