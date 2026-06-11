// WIB (Asia/Jakarta, UTC+7, no DST) week utilities.
// Uses a fixed +7h offset arithmetic so no host-timezone leakage (NFR-005).

export interface WeekLabel {
  range: string // e.g. "8–14 Jun 2026"
  today: string // e.g. "Wed 10 Jun"
}

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000

/** Map JS day-of-week (0=Sun…6=Sat) to Mon-based index (Mon=0…Sun=6). */
function toMonBased(jsDay: number): number {
  return (jsDay + 6) % 7
}

/** Add days to a Date, returns a new Date. */
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000)
}

/**
 * Read WIB calendar values by shifting UTC time by +7h and reading UTC parts.
 * This avoids any dependency on the host timezone.
 */
function wibParts(now: Date): {
  year: number
  month: number // 1-based
  day: number
  jsDay: number // 0=Sun…6=Sat (WIB weekday)
} {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    jsDay: shifted.getUTCDay(),
  }
}

const SHORT_MONTH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const SHORT_DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

/**
 * Compute the Monday-start week range and today label, all in WIB (Asia/Jakarta).
 * Pure function — suitable for clock-mocked tests.
 */
export function weekLabel(now: Date): WeekLabel {
  const { year, month, day, jsDay } = wibParts(now)

  // Derive Monday of this week in WIB calendar
  const dow = toMonBased(jsDay) // Mon=0…Sun=6
  // Create a UTC midnight Date that represents the WIB calendar date of "today"
  // We need the actual UTC instant for Monday/Sunday of the WIB week
  // Strategy: find the UTC instant for the start of the WIB calendar day
  const todayWibMidnightUTC = new Date(
    Date.UTC(year, month - 1, day) - WIB_OFFSET_MS,
  )
  const mondayUTC = addDays(todayWibMidnightUTC, -dow)
  const sundayUTC = addDays(mondayUTC, 6)

  const mon = wibParts(mondayUTC)
  const sun = wibParts(sundayUTC)

  // Format range: "<d1>–<d2> <Mon> <YYYY>" (same month/year — guaranteed by Mon–Sun span)
  const range = `${mon.day}–${sun.day} ${SHORT_MONTH[mon.month - 1]} ${mon.year}`

  // Format today: "<Ddd> <d> <Mon>"
  const today = `${SHORT_DAY[jsDay]} ${day} ${SHORT_MONTH[month - 1]}`

  return { range, today }
}

/**
 * Returns the label for the Friday of the current WIB week, e.g. "Fri 13 Jun".
 * Used by the weekly-update strip due-date (OQ1: current-week Friday, not next).
 */
export function fridayLabel(now: Date): string {
  const { year, month, day, jsDay } = wibParts(now)
  const dow = toMonBased(jsDay) // Mon=0…Sun=6; Fri=4
  const todayWibMidnightUTC = new Date(
    Date.UTC(year, month - 1, day) - WIB_OFFSET_MS,
  )
  const fridayUTC = addDays(todayWibMidnightUTC, 4 - dow)
  const fri = wibParts(fridayUTC)
  return `Fri ${fri.day} ${SHORT_MONTH[fri.month - 1]}`
}
