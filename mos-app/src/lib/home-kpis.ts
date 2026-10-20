// home-kpis.ts — pure selectors for the Home KPI row (Task 4.2, AC-HK01/02).
// Consumes SalesMarginDailyRow[] (§7a contract); emits display-ready
// primitives (strings + a DeltaDisplay) for KPITile — the tile never learns "margin"
// or "task". No DB access, no Date.now() for reporting-period math (mirrors
// lib/sales-dashboard.ts's trailingWindow discipline).

import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { trailingSum } from '@/lib/trailing-window'

export interface MarginWindow {
  /** margin_interim summed over the current trailing window */
  current: number
  /** margin_interim summed over the immediately preceding equal-length window, or null
   * if no rows exist there at all (distinguishes "no prior data" from "prior was 0"). */
  prior: number | null
}

/**
 * Trailing N-day margin_interim anchored to `latestDate` (never Date.now()), plus the
 * immediately preceding equal-length window for the delta. NULL margin_interim (a COGS
 * sync-gap day, §7a) contributes 0 to the sum — it is never fabricated into a number,
 * but a window that contains at least one non-null row still reports the real total of
 * what's known. Delegates the window math to lib/trailing-window.ts's generic
 * trailingSum (CQ-1 dedup) — same shared implementation as lib/sales-dashboard.ts's
 * trailingWindow, over margin_interim instead of clean_revenue.
 */
export function trailingMargin(
  rows: SalesMarginDailyRow[],
  latestDate: string,
  days: number,
): MarginWindow {
  return trailingSum(rows, r => r.margin_date, r => r.margin_interim ?? 0, latestDate, days)
}
