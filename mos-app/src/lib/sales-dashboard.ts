// sales-dashboard.ts — the revenue formatters and the trailing-window delta shared by Money and
// the Home KPI selectors. Consumes SalesDailyRevenueRow[] from lib/db/reporting.ts. No DB access,
// no Date.now() for reporting-period math (FR-004).

import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { Translate } from '@/i18n/use-t'
import { formatIDR } from '@/lib/format/money'
import { formatSignedPercent } from '@/lib/format/percent'
import { trailingSum } from '@/lib/trailing-window'

// ── IDR formatting ────────────────────────────────────────────────────────────────
// Compact figure for table cells and headline values ("Rp 14,2 jt", "Rp 1,2 M"); below a million
// it is the full grouped rupiah.
export function formatIDRCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}Rp ${trimDecimal(abs / 1_000_000_000)} M`
  if (abs >= 1_000_000) return `${sign}Rp ${trimDecimal(abs / 1_000_000)} jt`
  return formatIDR(amount)
}

function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return (Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)).replace('.', ',')
}

// ── Windows ───────────────────────────────────────────────────────────────────────
export interface WindowResult {
  /** revenue in the current trailing window */
  current: number
  /** revenue in the immediately preceding equal-length window, or null if no rows exist there */
  prior: number | null
}

/**
 * Trailing N-day revenue anchored to `latestDate` (FR-004 — never Date.now()), plus
 * the immediately preceding equal-length window for the delta (FR-006/AC-005).
 * `prior` is null when there are zero rows strictly before the current window's
 * start (distinguishes "no prior data" from "prior revenue was 0"). Delegates the
 * window math to lib/trailing-window.ts's generic trailingSum (CQ-1 dedup).
 */
export function trailingWindow(
  rows: SalesDailyRevenueRow[],
  latestDate: string,
  days: number,
): WindowResult {
  return trailingSum(rows, r => r.revenue_date, r => r.clean_revenue, latestDate, days)
}

export interface DeltaDisplay {
  text: string
  tone: 'success' | 'destructive' | 'neutral'
}

/** A window's change against the previous one as a delta chip, in the viewer's language. A null
 *  or zero prior reads "no comparison" — never 0%, NaN or Infinity. */
export function formatDelta(window: WindowResult, t: Translate): DeltaDisplay {
  if (window.prior === null || window.prior === 0) {
    return { text: t('money.delta.noComparison'), tone: 'neutral' }
  }
  const { text, tone } = signedChange((window.current - window.prior) / window.prior)
  return { text: t('money.delta.vsPrevious', { pct: text }), tone }
}

/** A change as signed percent text, toned by the sign that text shows (a change that rounds to
 *  0,0% is neutral). */
export function signedChange(frac: number): DeltaDisplay {
  const text = formatSignedPercent(frac)
  const tone: DeltaDisplay['tone'] = text.startsWith('+') ? 'success' : text.startsWith('\u2212') ? 'destructive' : 'neutral'
  return { text, tone }
}
