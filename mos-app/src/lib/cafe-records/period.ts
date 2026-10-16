// Café Records periods: WIB calendar days, weeks run Monday to Sunday, the current week and month
// end today. All arithmetic is on YYYY-MM-DD strings through UTC dates, so the host time zone
// never leaks in (a Jakarta calendar date is just a date).

export const PERIOD_KEYS = ['today', 'this-week', 'last-week', 'this-month', 'last-month', 'custom'] as const
export type PeriodKey = (typeof PERIOD_KEYS)[number]
export const PRESET_PERIOD_KEYS = PERIOD_KEYS.filter((key): key is Exclude<PeriodKey, 'custom'> => key !== 'custom')

export interface DateRange { from: string; to: string }

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A real calendar date in YYYY-MM-DD form (2026-02-30 is not). */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value) return false
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function toUtc(day: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function fromUtc(date: Date): string {
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

export function addDays(day: string, days: number): string {
  const date = toUtc(day)
  date.setUTCDate(date.getUTCDate() + days)
  return fromUtc(date)
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayMondayFirst(day: string): number {
  return (toUtc(day).getUTCDay() + 6) % 7
}

export function mondayOf(day: string): string {
  return addDays(day, -weekdayMondayFirst(day))
}

function firstOfMonth(day: string): string { return `${day.slice(0, 7)}-01` }

function lastOfPreviousMonth(day: string): string { return addDays(firstOfMonth(day), -1) }

/** The inclusive date range a preset names, as of `today` (WIB). */
export function resolvePreset(key: Exclude<PeriodKey, 'custom'>, today: string): DateRange {
  switch (key) {
    case 'today': return { from: today, to: today }
    case 'this-week': return { from: mondayOf(today), to: today }
    case 'last-week': {
      const monday = mondayOf(today)
      return { from: addDays(monday, -7), to: addDays(monday, -1) }
    }
    case 'this-month': return { from: firstOfMonth(today), to: today }
    case 'last-month': {
      const end = lastOfPreviousMonth(today)
      return { from: firstOfMonth(end), to: end }
    }
  }
}

export type RangeError = 'invalid' | 'future' | 'order'

/** Why a custom range may not be applied, or null when it may: real dates, no future, start <= end. */
export function rangeError(from: string, to: string, today: string): RangeError | null {
  if (!isIsoDate(from) || !isIsoDate(to)) return 'invalid'
  if (from > today || to > today) return 'future'
  if (from > to) return 'order'
  return null
}

/** Every date in an inclusive range, ascending (used for coverage and day lists). */
export function datesIn(range: DateRange): string[] {
  const days: string[] = []
  for (let day = range.from; day <= range.to && days.length < 4000; day = addDays(day, 1)) days.push(day)
  return days
}

/** Whether a calendar period is still running: a week or month that ends today and has days left. */
export function isUnfinished(key: PeriodKey, range: DateRange, today: string): boolean {
  if (range.to !== today) return false
  if (key === 'this-week') return weekdayMondayFirst(today) < 6
  if (key === 'this-month') return addDays(today, 1).slice(0, 7) === today.slice(0, 7)
  return false
}

/** The instant range for requested_at (a timestamp), as WIB midnights. */
export function wibInstantRange(range: DateRange): { gte: string; lt: string } {
  return { gte: `${range.from}T00:00:00+07:00`, lt: `${addDays(range.to, 1)}T00:00:00+07:00` }
}
