// reporting-shared.ts — generic DAL helpers shared across the `reporting` schema
// data modules (lib/db/reporting.ts, lib/db/reporting-margin.ts). Extracted per
// docs/reviews/feat-home-v1-margin.md §Follow-ups CQ-2/CQ-3 — one place for the
// sinceDays cutoff computation and the "latest X across rows" reducer pattern both
// modules previously cloned.

/** ISO yyyy-mm-dd date `days` before today (UTC "today" — used to build a `>= since`
 * filter for a rolling reporting window). */
export function daysAgoIsoDate(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Returns the max value of `fieldOf(row)` across `rows` (e.g. the latest
 * snapshot_as_of / reporting date), or null when `rows` is empty. String comparison —
 * safe for ISO date/timestamp fields, which sort lexicographically. */
export function latestBy<T>(rows: T[], fieldOf: (r: T) => string): string | null {
  if (rows.length === 0) return null
  return rows.reduce((max, r) => {
    const v = fieldOf(r)
    return v > max ? v : max
  }, fieldOf(rows[0]))
}
