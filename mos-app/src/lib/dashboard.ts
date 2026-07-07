// dashboard.ts — pure selectors for the /dashboard analytical hub (OD-DASH-5).
// Combines revenue (reporting.sales_daily_revenue) + gross margin/COGS
// (reporting.sales_margin_daily) into the display-ready KPI set the /dashboard
// consumes. Every gross-margin/COGS figure carries its BASIS label — interim
// stock-movement is never confused for GL-certified (CONTEXT.md "COGS"/"Gross margin").
//
// No DB access, no Date.now() for reporting-period math (FR-005). Pure functions
// over caller-supplied rows + anchors — testable in isolation.

import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { isoDaysBefore, trailingSum } from '@/lib/trailing-window'
import {
  activityMap,
  channelMixLabel,
  formatIDRCompact,
  formatDelta,
  trailingWindow,
  type DashboardCut,
  type DeltaDisplay,
} from '@/lib/sales-dashboard'
import { latestBy } from '@/lib/db/reporting-shared'

// ── Window spec (FR-013/014, AC-013/014) ─────────────────────────────────────────
/** A time window for the dashboard. Presets are trailing-N-day; custom is an
 * explicit [from, to] range bounded to the available snapshot window (FR-014). */
export type WindowSpec =
  | { kind: 'preset'; days: 7 | 30 | 60 }
  | { kind: 'custom'; from: string; to: string }

export const DEFAULT_WINDOW: WindowSpec = { kind: 'preset', days: 30 }

/** The equal-length immediately-preceding window for delta comparison (FR-014).
 * For presets: the N days before the current window. For custom: same length,
 * ending the day before `from`. */
export function compareWindow(spec: WindowSpec): { from: string; to: string; days: number } {
  if (spec.kind === 'preset') {
    return { days: spec.days, from: '', to: '' } // resolved against latestDate by caller via trailingSum
  }
  const fromD = new Date(`${spec.from}T00:00:00Z`)
  const toD = new Date(`${spec.to}T00:00:00Z`)
  const days = Math.round((toD.getTime() - fromD.getTime()) / 86_400_000) + 1
  const priorEnd = isoDaysBefore(spec.from, 1)
  const priorFrom = isoDaysBefore(priorEnd, days - 1)
  return { days, from: priorFrom, to: priorEnd }
}

/** Bounds for the custom date picker — the earliest and latest revenue_date
 * available, so the picker can disable dates outside the snapshot window (FR-014). */
export function availableWindowBounds(rows: SalesDailyRevenueRow[]): { earliest: string; latest: string } | null {
  if (rows.length === 0) return null
  const earliest = rows.reduce((min, r) => (r.revenue_date < min ? r.revenue_date : min), rows[0].revenue_date)
  const latest = latestBy(rows, r => r.revenue_date) ?? rows[0].revenue_date
  return { earliest, latest }
}

/** Resolve a WindowSpec into concrete [start, end] ISO dates anchored to latestDate. */
export function resolveWindow(spec: WindowSpec, latestDate: string): { start: string; end: string } {
  if (spec.kind === 'preset') {
    return { start: isoDaysBefore(latestDate, spec.days - 1), end: latestDate }
  }
  return { start: spec.from, end: spec.to }
}

function rowsInDateRange<T>(rows: T[], dateOf: (r: T) => string, start: string, end: string): T[] {
  return rows.filter(r => {
    const d = dateOf(r)
    return d >= start && d <= end
  })
}

// ── Revenue KPIs (FR-006/007, AC-005/006/007/009) ────────────────────────────────
export interface RevenueKpiSet {
  /** trailing-N revenue for the active window (current + prior for delta) */
  trailing: { current: number; prior: number | null }
  /** revenue on the single latest reporting day */
  latestDay: number
  /** avg check = revenue / transactions over the window */
  avgCheck: number | null
  /** "POS 77% · B2B 23%" split string (AC-009) */
  channelMix: string
}

/** Computes the revenue KPI set for a given window (AC-005/006/007/009). */
export function computeRevenueKpis(
  rows: SalesDailyRevenueRow[],
  spec: WindowSpec,
  latestDate: string,
): RevenueKpiSet {
  const { start, end } = resolveWindow(spec, latestDate)
  const windowed = rowsInDateRange(rows, r => r.revenue_date, start, end)
  const current = windowed.reduce((s, r) => s + r.clean_revenue, 0)

  // Prior window: presets use trailingSum's prior; custom uses compareWindow.
  let prior: number | null
  if (spec.kind === 'preset') {
    prior = trailingWindow(rows, latestDate, spec.days).prior
  } else {
    const cw = compareWindow(spec)
    const priorRows = rowsInDateRange(rows, r => r.revenue_date, cw.from, cw.to)
    prior = priorRows.length > 0 ? priorRows.reduce((s, r) => s + r.clean_revenue, 0) : null
  }

  const latestDayRows = rowsInDateRange(rows, r => r.revenue_date, latestDate, latestDate)
  const latestDay = latestDayRows.reduce((s, r) => s + r.clean_revenue, 0)

  const transactions = windowed.reduce((s, r) => s + r.transactions, 0)
  const avgCheck = transactions > 0 ? Math.round(current / transactions) : null

  return {
    trailing: { current, prior },
    latestDay,
    avgCheck,
    channelMix: channelMixLabel(windowed),
  }
}

// ── Gross margin / COGS KPIs (FR-008, AC-008/024) — basis-labelled ──────────────
/** The COGS basis a figure was computed from. Every gross-margin/COGS tile carries
 * this — "interim" (stock-movement, not GL-certified) is never confused for the
 * future "certified" (GL account-5). See CONTEXT.md "COGS" / "Gross margin". */
export type CogsBasis = 'interim-stock-movement' | 'budget-bom' | 'certified-gl'

export type DqBadge = 'good' | 'partial' | 'unknown'

/** DQ badge from BOM coverage (AC-024). bom_coverage_pct is the avg fraction of
 * revenue backed by a BOM recipe on the window. ≥0.9 good, 0.5–0.9 partial, else
 * unknown (including all-null). */
export function bomCoverageDq(rows: SalesMarginDailyRow[], start: string, end: string): DqBadge {
  const windowed = rowsInDateRange(rows, r => r.margin_date, start, end)
  const pcts = windowed.map(r => r.bom_coverage_pct).filter((p): p is number => p != null)
  if (pcts.length === 0) return 'unknown'
  const avg = pcts.reduce((s, p) => s + p, 0) / pcts.length
  if (avg >= 0.9) return 'good'
  if (avg >= 0.5) return 'partial'
  return 'unknown'
}

export interface GrossMarginKpiSet {
  /** margin_interim summed over the window; NULL if every day's margin_interim is
   * NULL (sync-gap) — never a faked 0 (AC-008 sibling). */
  marginAmount: number | null
  /** margin_interim_pct weighted by revenue over the window; null if marginAmount is null. */
  marginPct: number | null
  /** cogs_interim_sm summed over the window (the interim COGS amount). */
  cogsAmount: number | null
  /** the basis — always "interim-stock-movement" until the GL read-model lands. */
  basis: CogsBasis
  /** DQ badge from BOM coverage (AC-024). */
  dq: DqBadge
  /** delta vs prior window; null when prior is null or marginAmount is null. */
  delta: DeltaDisplay | null
}

/** Computes the gross-margin/COGS KPI set for a given window (AC-008/024).
 * NULL cogs_interim_sm days are excluded from sums — never faked to 0. */
export function computeGrossMarginKpis(
  rows: SalesMarginDailyRow[],
  spec: WindowSpec,
  latestDate: string,
): GrossMarginKpiSet {
  const { start, end } = resolveWindow(spec, latestDate)
  const windowed = rowsInDateRange(rows, r => r.margin_date, start, end)

  // Only rows with non-null cogs_interim_sm contribute (sync-gap days excluded).
  const known = windowed.filter(r => r.cogs_interim_sm != null)
  const cogsAmount = known.length > 0 ? known.reduce((s, r) => s + (r.cogs_interim_sm ?? 0), 0) : null
  const revenue = known.reduce((s, r) => s + r.revenue, 0)
  const marginAmount = cogsAmount != null ? revenue - cogsAmount : null
  const marginPct = marginAmount != null && revenue > 0 ? marginAmount / revenue : null

  const dq = bomCoverageDq(rows, start, end)

  // Delta vs prior window.
  let delta: DeltaDisplay | null = null
  if (marginAmount != null) {
    let priorMargin: number | null
    if (spec.kind === 'preset') {
      priorMargin = trailingSum(
        rows, r => r.margin_date, r => r.margin_interim ?? 0, latestDate, spec.days,
      ).prior
    } else {
      const cw = compareWindow(spec)
      const priorRows = rowsInDateRange(rows, r => r.margin_date, cw.from, cw.to)
        .filter(r => r.cogs_interim_sm != null)
      priorMargin = priorRows.length > 0
        ? priorRows.reduce((s, r) => s + (r.revenue - (r.cogs_interim_sm ?? 0)), 0)
        : null
    }
    delta = formatDelta({ current: marginAmount, prior: priorMargin })
  }

  return { marginAmount, marginPct, cogsAmount, basis: 'interim-stock-movement', dq, delta }
}

// ── Cut aggregation (FR-012, AC-012) ─────────────────────────────────────────────
export interface CutRow {
  id: string
  dimension: string
  revenue: number
  transactions: number
  sharePct: number
  avgCheck: number
  /** interim COGS for this group (POS-only margin rows; null for B2B/channel-cut). */
  cogsInterim: number | null
  /** interim gross margin for this group. */
  grossMargin: number | null
  /** margin % for this group. */
  marginPct: number | null
}

/** Revenue-dimension label for a row under the selected cut. */
function dimensionOf(row: SalesDailyRevenueRow, cut: DashboardCut): string {
  if (cut === 'Branch') return row.branch_name ?? row.branch_code
  if (cut === 'Channel') return row.channel
  return activityMap(row)
}

/** Aggregates revenue + margin rows by the selected cut (AC-012). Margin is joined
 * by (branch_code, date) — POS-only, so B2B/channel-cut margin is null (G3 gap). */
export function aggregateByCut(
  revenueRows: SalesDailyRevenueRow[],
  marginRows: SalesMarginDailyRow[],
  cut: DashboardCut,
  start: string,
  end: string,
): CutRow[] {
  const winRev = rowsInDateRange(revenueRows, r => r.revenue_date, start, end)
  const winMarg = rowsInDateRange(marginRows, r => r.margin_date, start, end)
  const grandTotal = winRev.reduce((s, r) => s + r.clean_revenue, 0)

  // Index margin by branch_code for the Branch-cut COGS join (POS-only, no channel).
  const marginByBranch = new Map<string, { cogs: number; revenue: number }>()
  for (const m of winMarg) {
    if (m.cogs_interim_sm == null) continue
    const e = marginByBranch.get(m.branch_code) ?? { cogs: 0, revenue: 0 }
    e.cogs += m.cogs_interim_sm
    e.revenue += m.revenue
    marginByBranch.set(m.branch_code, e)
  }

  const groups = new Map<string, { dimension: string; branchCode: string; revenue: number; transactions: number }>()
  for (const r of winRev) {
    const dimension = dimensionOf(r, cut)
    const g = groups.get(dimension) ?? { dimension, branchCode: r.branch_code, revenue: 0, transactions: 0 }
    g.revenue += r.clean_revenue
    g.transactions += r.transactions
    groups.set(dimension, g)
  }

  return [...groups.values()]
    .map(g => {
      // Branch cut: join margin per branch. Channel/Activity: POS-only margin → null for B2B.
      const marg = cut === 'Branch' ? marginByBranch.get(g.branchCode) : null
      const cogs = marg?.cogs ?? null
      const sharePct = grandTotal > 0 ? Math.round((g.revenue / grandTotal) * 1000) / 10 : 0
      const avgCheck = g.transactions > 0 ? Math.round(g.revenue / g.transactions) : 0
      return {
        id: g.dimension,
        dimension: g.dimension,
        revenue: g.revenue,
        transactions: g.transactions,
        sharePct,
        avgCheck,
        cogsInterim: cogs,
        grossMargin: cogs != null ? g.revenue - cogs : null,
        marginPct: cogs != null && g.revenue > 0 ? (g.revenue - cogs) / g.revenue : null,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
}

// ── Display formatting helpers (basis-labelling) ─────────────────────────────────
/** Human-readable basis label for a COGS basis (FR-008). */
export function basisLabel(basis: CogsBasis): string {
  switch (basis) {
    case 'interim-stock-movement': return 'interim — stock-movement'
    case 'budget-bom': return 'budget — BOM'
    case 'certified-gl': return 'certified — GL'
  }
}

/** Formats a gross-margin amount for a KPITile value, with null-safe handling. */
export function formatGrossMarginValue(amount: number | null): string {
  return amount == null ? '—' : formatIDRCompact(amount)
}

/** Formats a margin percentage for display (e.g. "42,3%"). */
export function formatMarginPct(pct: number | null): string {
  if (pct == null) return '—'
  const rounded = Math.round(pct * 1000) / 10
  return `${rounded.toFixed(1).replace('.', ',')}%`
}
