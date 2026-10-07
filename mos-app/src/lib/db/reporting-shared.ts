// reporting-shared.ts — generic DAL helpers shared across the `reporting` schema
// data modules (lib/db/reporting.ts, lib/db/reporting-margin.ts). Extracted per
// docs/reviews/feat-home-v1-margin.md §Follow-ups CQ-2/CQ-3 — one place for the
// sinceDays cutoff computation and the "latest X across rows" reducer pattern both
// modules previously cloned.

export const REPORTING_WINDOW_DAYS = 60

/** Rows per request: the API's own per-response cap, so a full page means "maybe more". */
export const REPORTING_PAGE_ROWS = 1000
/** The most rows one reporting read will hold: 120 days of about 160 daily series. */
export const REPORTING_READ_MAX_ROWS = 20_000

/** A reporting read that would need more rows than REPORTING_READ_MAX_ROWS. Thrown rather than
 *  returning a silent truncation, and told apart from a failed request. */
export class ReportingRowCapError extends Error {}

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

/** Reads every row of a query one page at a time. `page(from, to)` must return the same query
 *  with `.range(from, to)` over an order that has no ties, so a row cannot move between pages. */
export async function readAllPages<T>(label: string, page: (from: number, to: number) => PageResult): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += REPORTING_PAGE_ROWS) {
    const { data, error } = await page(from, from + REPORTING_PAGE_ROWS - 1)
    if (error) throw new Error(`${label} failed — ${error.message}`)
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < REPORTING_PAGE_ROWS) return rows
    if (rows.length >= REPORTING_READ_MAX_ROWS) {
      throw new ReportingRowCapError(`${label} needs more than ${REPORTING_READ_MAX_ROWS} rows`)
    }
  }
}

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
