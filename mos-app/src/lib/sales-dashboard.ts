// sales-dashboard.ts — pure selectors for the Sales dashboard composition
// (docs/specs/sales-dashboard.spec.md, docs/plans/2026-07-02-sales-dashboard-design.md).
// Consumes SalesDailyRevenueRow[] from lib/db/reporting.ts; emits display-ready
// primitives (strings + tone enums) for KPITile/ChartFrame/DataTable — the primitives
// never know "revenue". No DB access, no Date.now() for reporting-period math (FR-004).

import type { SalesDailyRevenueRow } from '@/lib/db/reporting'

// ── Activity mapping (dashboard-layer only, FR-008, resolved owner decision) ──────
// Cafe Ops = POS (GHQ/SKC/GGS/RRS, drillable); Roastery = B2B/GRI; else Unmapped.
// The reporting table itself is never mutated — Branch stays the source-faithful cut.
export type Activity = 'Cafe Ops' | 'Roastery' | 'Unmapped'

export function activityMap(row: Pick<SalesDailyRevenueRow, 'channel' | 'esb_code'>): Activity {
  if (row.channel === 'POS') return 'Cafe Ops'
  if (row.channel === 'B2B' || row.esb_code === 'GRI') return 'Roastery'
  return 'Unmapped'
}

// ── IDR formatting ────────────────────────────────────────────────────────────────
// Compact headline (KPI values, Q3 resolved: compact in headline, full in table cells).
export function formatIDRCompact(amount: number): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}Rp ${trimDecimal(abs / 1_000_000_000)} M`
  if (abs >= 1_000_000) return `${sign}Rp ${trimDecimal(abs / 1_000_000)} jt`
  return formatIDRFull(amount)
}

function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return (Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)).replace('.', ',')
}

// Full grouped rupiah — table cells + tooltips (Q3 resolved).
export function formatIDRFull(amount: number): string {
  const formatted = new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 0,
  }).format(Math.abs(amount))
  return `${amount < 0 ? '-' : ''}Rp ${formatted}`
}

// ── Windows ───────────────────────────────────────────────────────────────────────
function isoDaysBefore(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Rows with revenue_date in [start, end] inclusive (both ISO yyyy-mm-dd). */
function rowsInWindow(rows: SalesDailyRevenueRow[], start: string, end: string): SalesDailyRevenueRow[] {
  return rows.filter(r => r.revenue_date >= start && r.revenue_date <= end)
}

function sumRevenue(rows: SalesDailyRevenueRow[]): number {
  return rows.reduce((sum, r) => sum + r.clean_revenue, 0)
}

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
 * start (distinguishes "no prior data" from "prior revenue was 0").
 */
export function trailingWindow(
  rows: SalesDailyRevenueRow[],
  latestDate: string,
  days: number,
): WindowResult {
  const currentStart = isoDaysBefore(latestDate, days - 1)
  const current = sumRevenue(rowsInWindow(rows, currentStart, latestDate))

  const priorEnd = isoDaysBefore(currentStart, 1)
  const priorStart = isoDaysBefore(priorEnd, days - 1)
  const priorRows = rowsInWindow(rows, priorStart, priorEnd)

  return {
    current,
    // null (not 0) distinguishes "no prior data at all" from "prior revenue was 0" (AC-005/FR-006).
    prior: priorRows.length > 0 ? sumRevenue(priorRows) : null,
  }
}

export interface DeltaDisplay {
  text: string
  tone: 'success' | 'destructive' | 'neutral'
}

/** Formats a WindowResult into a KPITile-ready delta chip (FR-006). Neutral
 * "no comparison" when prior data is absent — never 0% / NaN (AC-008 sibling rule). */
export function formatDelta(window: WindowResult): DeltaDisplay {
  // prior===null → no prior rows at all; prior===0 → a true +Infinity% is meaningless.
  // Both render the same neutral "no comparison" chip (never 0%/NaN/Infinity).
  if (window.prior === null || window.prior === 0) {
    return { text: 'no comparison', tone: 'neutral' }
  }
  const pct = ((window.current - window.prior) / window.prior) * 100
  const rounded = Math.round(pct * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  const tone: DeltaDisplay['tone'] = rounded > 0 ? 'success' : rounded < 0 ? 'destructive' : 'neutral'
  return { text: `${sign}${rounded}% vs prev period`, tone }
}

// ── Channel mix ───────────────────────────────────────────────────────────────────
/** "POS 82% · B2B 18%" style split string (Q1 resolved: string, not a mini-viz). Omits
 * channels with 0 rows in the window; returns 'No revenue' when the window is empty. */
export function channelMixLabel(rows: SalesDailyRevenueRow[]): string {
  const totals = new Map<string, number>()
  let grandTotal = 0
  for (const r of rows) {
    totals.set(r.channel, (totals.get(r.channel) ?? 0) + r.clean_revenue)
    grandTotal += r.clean_revenue
  }
  if (grandTotal <= 0 || totals.size === 0) return 'No revenue'
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([channel, amount]) => `${channel} ${Math.round((amount / grandTotal) * 100)}%`)
    .join(' · ')
}

// ── Daily series (for DailyRevenueChart — stacked bars/day by channel) ────────────
export interface DailySeriesPoint {
  date: string
  /** revenue per channel, e.g. { POS: 12300000, B2B: 4500000 } */
  byChannel: Record<string, number>
  total: number
}

/** One point per distinct revenue_date in the given rows, sorted ascending, each
 * broken out by channel (FR-007 "daily revenue chart grouped by channel"). */
export function dailySeries(rows: SalesDailyRevenueRow[]): DailySeriesPoint[] {
  const byDate = new Map<string, Record<string, number>>()
  for (const r of rows) {
    const entry = byDate.get(r.revenue_date) ?? {}
    entry[r.channel] = (entry[r.channel] ?? 0) + r.clean_revenue
    byDate.set(r.revenue_date, entry)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, byChannel]) => ({
      date,
      byChannel,
      total: Object.values(byChannel).reduce((a, b) => a + b, 0),
    }))
}

// ── Detail table rows (FR-009), dimension-swappable Branch <-> Activity ───────────
export type DashboardCut = 'Branch' | 'Activity'

export interface RevenueTableRow {
  id: string
  dimension: string
  channel: string
  revenue: number
  transactions: number
  sharePct: number
  avgRevenuePerTxn: number
}

/**
 * Aggregates rows by (dimension, channel) for the detail table. dimension is the
 * branch (branch_name || branch_code) in Branch cut, or the mapped Activity label
 * in Activity cut (FR-008) — the underlying rows/table are never mutated, only the
 * presentation-layer grouping key changes.
 */
export function revenueTableRows(rows: SalesDailyRevenueRow[], cut: DashboardCut): RevenueTableRow[] {
  const grandTotal = sumRevenue(rows)
  const groups = new Map<string, { dimension: string; channel: string; revenue: number; transactions: number }>()

  for (const r of rows) {
    const dimension = cut === 'Branch' ? (r.branch_name ?? r.branch_code) : activityMap(r)
    const key = `${dimension} ${r.channel}`
    const g = groups.get(key) ?? { dimension, channel: r.channel, revenue: 0, transactions: 0 }
    g.revenue += r.clean_revenue
    g.transactions += r.transactions
    groups.set(key, g)
  }

  return [...groups.values()]
    .map(g => ({
      id: `${g.dimension}-${g.channel}`,
      dimension: g.dimension,
      channel: g.channel,
      revenue: g.revenue,
      transactions: g.transactions,
      sharePct: grandTotal > 0 ? Math.round((g.revenue / grandTotal) * 1000) / 10 : 0,
      avgRevenuePerTxn: g.transactions > 0 ? Math.round(g.revenue / g.transactions) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

export interface RevenueTableSort {
  key: keyof RevenueTableRow
  dir: 'asc' | 'desc'
}

/**
 * Pure sort of already-aggregated table rows (FR-009). Returns a new array — never
 * mutates `rows`. Undefined `sort` returns the input order unchanged (the default,
 * revenue-desc order `revenueTableRows` already produced).
 */
export function sortRevenueRows(rows: RevenueTableRow[], sort: RevenueTableSort | undefined): RevenueTableRow[] {
  if (!sort) return [...rows]
  const { key, dir } = sort
  const factor = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
    return String(av).localeCompare(String(bv)) * factor
  })
}

// ── KPI bundle ────────────────────────────────────────────────────────────────────
export interface SalesKpis {
  latestReportingDate: string
  trailing7d: WindowResult
  trailing30d: WindowResult
  /** revenue on the single latest reporting day */
  latestDayRevenue: number
  channelMix: string
}

/** Computes the full KPI bundle anchored to the latest revenue_date in `rows`
 * (FR-004/005/006). Caller must guard the empty-rows case before calling this
 * (FR-011/AC-008 — no KPI tiles render at all when rows is empty). */
export function computeSalesKpis(rows: SalesDailyRevenueRow[], latestDate: string): SalesKpis {
  return {
    latestReportingDate: latestDate,
    trailing7d: trailingWindow(rows, latestDate, 7),
    trailing30d: trailingWindow(rows, latestDate, 30),
    latestDayRevenue: sumRevenue(rowsInWindow(rows, latestDate, latestDate)),
    channelMix: channelMixLabel(rowsInWindow(rows, isoDaysBefore(latestDate, 6), latestDate)),
  }
}
