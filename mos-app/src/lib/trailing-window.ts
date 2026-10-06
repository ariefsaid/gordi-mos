// trailing-window.ts — generic trailing-N-day window sum + prior-window comparison.
// Extracted from lib/sales-dashboard.ts's trailingWindow / lib/home-kpis.ts's
// trailingMargin (docs/reviews/feat-home-v1-margin.md §Follow-ups CQ-1). Both callers
// delegate to this single implementation over their own row shape + value accessor —
// no behavior change, dates are always caller-supplied ISO strings (never Date.now()).

/** Subtracts `days` from an ISO yyyy-mm-dd date, returning an ISO yyyy-mm-dd date. */
export function isoDaysBefore(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export interface TrailingWindowResult {
  /** value summed over the current trailing window */
  current: number
  /** value summed over the immediately preceding equal-length window, or null if no
   * rows exist there at all (distinguishes "no prior data" from "prior was 0"). */
  prior: number | null
}

/**
 * Trailing N-day sum of `valueOf(row)` for rows with `dateOf(row)` in the window
 * anchored to `latestDate` (inclusive, never Date.now()), plus the immediately
 * preceding equal-length window's sum for the delta. `prior` is null when zero rows
 * fall strictly before the current window's start.
 */
export function trailingSum<T>(
  rows: T[],
  dateOf: (r: T) => string,
  valueOf: (r: T) => number,
  latestDate: string,
  days: number,
): TrailingWindowResult {
  const currentStart = isoDaysBefore(latestDate, days - 1)
  const currentRows = rows.filter(r => {
    const d = dateOf(r)
    return d >= currentStart && d <= latestDate
  })
  const current = currentRows.reduce((sum, r) => sum + valueOf(r), 0)

  const priorEnd = isoDaysBefore(currentStart, 1)
  const priorStart = isoDaysBefore(priorEnd, days - 1)
  const priorRows = rows.filter(r => {
    const d = dateOf(r)
    return d >= priorStart && d <= priorEnd
  })

  return {
    current,
    prior: priorRows.length > 0 ? priorRows.reduce((sum, r) => sum + valueOf(r), 0) : null,
  }
}
