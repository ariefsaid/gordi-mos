// reporting-shared.ts — generic DAL helpers shared across the `reporting` schema
// data modules (lib/db/reporting.ts, lib/db/reporting-margin.ts). Extracted per
// docs/reviews/feat-home-v1-margin.md §Follow-ups CQ-2/CQ-3 — one place for the
// sinceDays cutoff computation and the "latest X across rows" reducer pattern both
// modules previously cloned.

import { wibToday } from '@/lib/format/date'
import { readAllPages as readPages } from './page-walker'

export const REPORTING_WINDOW_DAYS = 60

/** The most rows one reporting read will hold: 120 days of about 160 daily series. */
const REPORTING_READ_MAX_ROWS = 20_000

/** A reporting read that would need more rows than REPORTING_READ_MAX_ROWS. Thrown rather than
 *  returning a silent truncation, and told apart from a failed request. */
export class ReportingRowCapError extends Error {}

type PageResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>

/** Keeps the reporting cap on the shared page reader. `page` must use a stable order without ties. */
export async function readAllPages<T>(
  label: string,
  page: (from: number, to: number) => PageResult,
): Promise<T[]> {
  return readPages<T>(label, page, {
    maxRows: REPORTING_READ_MAX_ROWS,
    onMaxRowsExceeded: () => new ReportingRowCapError(`${label} needs more than ${REPORTING_READ_MAX_ROWS} rows`),
  })
}

/** ISO yyyy-mm-dd date `days` before the current WIB date. */
export function daysAgoIsoDate(days: number): string {
  const d = new Date(`${wibToday()}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
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
