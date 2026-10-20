// dashboard.ts — Money's reporting-window math. Pure functions over caller-supplied rows and
// anchors: no DB access, no Date.now() for reporting-period math (FR-005).

import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'

/** The average bom_coverage_pct over [start, end] (0–1), or null when every row there is null
 *  or there are none. A ratio, so it is averaged, never summed. */
export function bomCoveragePct(rows: SalesMarginDailyRow[], start: string, end: string): number | null {
  const pcts = rows
    .filter((r) => r.margin_date >= start && r.margin_date <= end)
    .map((r) => r.bom_coverage_pct)
    .filter((p): p is number => p != null)
  if (pcts.length === 0) return null
  return pcts.reduce((s, p) => s + p, 0) / pcts.length
}
