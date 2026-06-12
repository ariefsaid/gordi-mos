// WIB (Asia/Jakarta, UTC+7, no DST) week utilities.
// Uses a fixed +7h offset arithmetic so no host-timezone leakage (NFR-005).

export interface WeekLabel {
  range: string      // e.g. "8–14 Jun 2026" or "29 Jun – 5 Jul 2026" or "29 Dec 2025 – 4 Jan 2026"
  rangeShort: string // same without the year, e.g. "8–14 Jun" or "29 Jun – 5 Jul"
  today: string      // e.g. "Wed 10 Jun"
  fridayShort: string // e.g. "12 Jun" (bare date, no "Fri " prefix)
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

  // Format range: same-month → "8–14 Jun 2026"; cross-month → "29 Jun – 5 Jul 2026";
  // cross-year → "29 Dec 2025 – 4 Jan 2026"
  const sameMonth = mon.month === sun.month
  const sameYear  = mon.year  === sun.year
  let range: string
  let rangeShort: string
  if (sameMonth) {
    // Both endpoints share month (and year)
    range      = `${mon.day}–${sun.day} ${SHORT_MONTH[mon.month - 1]} ${mon.year}`
    rangeShort = `${mon.day}–${sun.day} ${SHORT_MONTH[mon.month - 1]}`
  } else if (sameYear) {
    // Cross-month, same year: show month on each side, year once at end
    range      = `${mon.day} ${SHORT_MONTH[mon.month - 1]} – ${sun.day} ${SHORT_MONTH[sun.month - 1]} ${sun.year}`
    rangeShort = `${mon.day} ${SHORT_MONTH[mon.month - 1]} – ${sun.day} ${SHORT_MONTH[sun.month - 1]}`
  } else {
    // Cross-year: show month+year on each side
    range      = `${mon.day} ${SHORT_MONTH[mon.month - 1]} ${mon.year} – ${sun.day} ${SHORT_MONTH[sun.month - 1]} ${sun.year}`
    rangeShort = `${mon.day} ${SHORT_MONTH[mon.month - 1]} ${mon.year} – ${sun.day} ${SHORT_MONTH[sun.month - 1]}`
  }

  // Format today: "<Ddd> <d> <Mon>"
  const today = `${SHORT_DAY[jsDay]} ${day} ${SHORT_MONTH[month - 1]}`

  // Compute Friday of this week for the update-strip due label
  const fridayUTC  = addDays(todayWibMidnightUTC, 4 - dow)
  const fri        = wibParts(fridayUTC)
  const fridayShort = `${fri.day} ${SHORT_MONTH[fri.month - 1]}`

  return { range, rangeShort, today, fridayShort }
}

/**
 * Monday (in WIB) of the week containing `now`, offset by `offsetWeeks`, as a bare 'YYYY-MM-DD'.
 * The week_start key for a weekly update (OD-P2-13, FR-003). Pure fixed-offset arithmetic — no
 * host-timezone leak (NFR-004). offsetWeeks=-1 → prior week's Monday.
 */
export function weekStartISO(now: Date, offsetWeeks = 0): string {
  const { year, month, day, jsDay } = wibParts(now)
  const dow = toMonBased(jsDay) // Mon=0…Sun=6
  const todayWibMidnightUTC = new Date(Date.UTC(year, month - 1, day) - WIB_OFFSET_MS)
  const mondayUTC = addDays(todayWibMidnightUTC, -dow + offsetWeeks * 7)
  const m = wibParts(mondayUTC)
  const mm = String(m.month).padStart(2, '0')
  const dd = String(m.day).padStart(2, '0')
  return `${m.year}-${mm}-${dd}`
}

/**
 * Half-open UTC range [startISO, endISO) for the WIB (Asia/Jakarta) calendar day containing `now`.
 * Pure fixed-offset arithmetic — no host-timezone leak (NFR-005, OD-P1-4). Basis for the My Week
 * ops-strip "today" window (OD-P0-8).
 */
export function wibDayRange(now: Date): { startISO: string; endISO: string } {
  const { year, month, day } = wibParts(now)
  const startUTC = Date.UTC(year, month - 1, day) - WIB_OFFSET_MS
  return {
    startISO: new Date(startUTC).toISOString(),
    endISO: new Date(startUTC + 24 * 60 * 60 * 1000).toISOString(),
  }
}

/**
 * Format a UTC instant as the WIB (Asia/Jakarta) wall-clock value for a `datetime-local` input,
 * i.e. "YYYY-MM-DDTHH:mm". Shifts +7h and reads UTC parts — no host-timezone leak (NFR-005).
 */
export function toWibInputValue(d: Date): string {
  const shifted = new Date(d.getTime() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  )
}

/**
 * Parse a `datetime-local` value ("YYYY-MM-DDTHH:mm", interpreted as WIB wall-clock) into the
 * corresponding UTC ISO instant. Builds from parts via `Date.UTC(...) - 7h` so the result is the
 * same regardless of the host's timezone (NFR-005) — `new Date(localString)` would parse in the
 * host TZ and is wrong for any non-UTC device.
 */
export function wibInputToUTCISO(local: string): string {
  const [datePart, timePart = '00:00'] = local.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - WIB_OFFSET_MS).toISOString()
}

export type WeeklyUpdateTiming = 'on-time' | 'late'

/**
 * On-time iff `submittedAt` ≤ the Friday 17:00 WIB of `weekStart`'s week, else late (OD-P2-14).
 * `weekStart` is the Monday (WIB) 'YYYY-MM-DD'; Friday 17:00 WIB = Monday + 4 days at 17:00 WIB =
 * 10:00:00Z. Pure — no host-tz leak. Signal only (never a gate).
 */
export function weeklyUpdateTiming(submittedAt: string, weekStart: string): WeeklyUpdateTiming {
  const [y, mo, d] = weekStart.split('-').map(Number)
  const fridayDueUTC = Date.UTC(y, mo - 1, d + 4, 17, 0, 0) - WIB_OFFSET_MS
  return new Date(submittedAt).getTime() <= fridayDueUTC ? 'on-time' : 'late'
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
