// dashboard.ts — Money's reporting-window math. Pure functions over caller-supplied rows and
// anchors: no DB access, no Date.now() for reporting-period math (FR-005).

import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'

/** The average bom_coverage_pct over [start, end] (0–1), or null when every row there is null
 *  or there are none. A ratio, so it is averaged, never summed. */
export function bomCoveragePct(rows: SalesMarginDailyRow[], start: string, end: string): number | null {
  const totals = rows.filter((row) => row.margin_date >= start && row.margin_date <= end)
    .reduce((total, row) => row.bom_coverage_pct == null ? total : {
      sum: total.sum + (row.bom_coverage_pct_sum ?? row.bom_coverage_pct),
      count: total.count + (row.bom_coverage_count ?? 1),
    }, { sum: 0, count: 0 })
  return totals.count === 0 ? null : totals.sum / totals.count
}
