// home-kpis.ts — pure selectors for the Home KPI row (Task 4.2, AC-HK01/02).
// Consumes SalesMarginDailyRow[] (§7a contract) + TaskListRow[]; emits display-ready
// primitives (strings + a DeltaDisplay) for KPITile — the tile never learns "margin"
// or "task". No DB access, no Date.now() for reporting-period math (mirrors
// lib/sales-dashboard.ts's trailingWindow discipline).

import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import type { TaskListRow } from '@/lib/db/tasks.types'
import { raciOwner } from '@/lib/raci-member'
import { formatIDRCompact, formatDelta, type DeltaDisplay } from '@/lib/sales-dashboard'
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

export interface MarginKpiDisplay {
  value: string
  delta: DeltaDisplay
  /** e.g. "40% margin"; blank when the latest day's pct is unavailable (never 0/NaN). */
  pctSub: string
}

/**
 * Formats a MarginWindow + the latest reporting-day's margin_interim_pct into a
 * KPITile-ready display (AC-HK02 — NULL pct renders as an absent sub, never "0% margin"
 * or "NaN% margin"; formatDelta already treats a null/zero prior as "no comparison").
 */
export function formatMarginKpi(window: MarginWindow, latestPct: number | null): MarginKpiDisplay {
  return {
    value: formatIDRCompact(window.current),
    delta: formatDelta(window),
    pctSub: latestPct == null ? '' : `${Math.round(latestPct * 1000) / 10}% margin`,
  }
}

// ── Tasks (Home "My open tasks" tile) ─────────────────────────────────────────────
/** Count of tasks where the viewer is Responsible or Accountable and status is not
 * Done (clone of MyTasksCard's R/A filter, minus the off-track sort — Home only
 * needs the count). */
export function openTaskCount(tasks: TaskListRow[], viewerId: string): number {
  return tasks.filter(t => raciOwner(t, viewerId) && t.status !== 'Done').length
}
