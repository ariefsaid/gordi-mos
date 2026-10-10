// money-branch-table.ts — the Money page's branch table: the view state it keeps in the URL and
// the rows it draws. Pure: no DB access and no clock; every window is anchored to the latest
// reporting day in the rows.
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { latestReportingDate } from '@/lib/db/reporting'
import { bomCoveragePct, resolveWindow } from '@/lib/dashboard'
import { isoDaysBefore } from '@/lib/trailing-window'
import { formatIDRCompact, signedChange } from '@/lib/sales-dashboard'
import type { Translate } from '@/i18n/use-t'

// ── View state (?period=7|30|60&sort=<column>.<asc|desc>) ────────────────────────────────────
export const MONEY_PERIODS = [7, 30, 60] as const
export type MoneyPeriod = (typeof MONEY_PERIODS)[number]

/** Days of rows the page reads: the longest period plus the equal-length period before it. */
export const MONEY_FETCH_DAYS = 2 * MONEY_PERIODS[MONEY_PERIODS.length - 1]

export const REVENUE_COLUMNS = ['branch', 'revenue', 'vs-previous', 'latest-day', 'vs-weekday'] as const
export const MARGIN_COLUMNS = ['margin', 'cogs-vs-budget', 'coverage'] as const
export type MoneyColumn = (typeof REVENUE_COLUMNS)[number] | (typeof MARGIN_COLUMNS)[number]

export interface MoneySort { column: MoneyColumn; desc: boolean }
export interface MoneyView { period: MoneyPeriod; sort: MoneySort }

export const DEFAULT_MONEY_VIEW: MoneyView = { period: 30, sort: { column: 'revenue', desc: true } }

/** The view a URL asks for. Anything unknown, or a margin column for a viewer without margin
 *  access, falls back to the default rather than drawing an empty or unsorted table. */
export function readMoneyView(params: URLSearchParams, { canSeeMargin }: { canSeeMargin: boolean }): MoneyView {
  const period = MONEY_PERIODS.find((p) => String(p) === params.get('period')) ?? DEFAULT_MONEY_VIEW.period
  const [column, dir] = (params.get('sort') ?? '').split('.')
  const columns: readonly string[] = canSeeMargin ? [...REVENUE_COLUMNS, ...MARGIN_COLUMNS] : REVENUE_COLUMNS
  const sort = columns.includes(column) && (dir === 'asc' || dir === 'desc')
    ? { column: column as MoneyColumn, desc: dir === 'desc' }
    : DEFAULT_MONEY_VIEW.sort
  return { period, sort }
}

/** `params` with the view written into it; other params are kept. */
export function withMoneyView(params: URLSearchParams, view: MoneyView): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set('period', String(view.period))
  next.set('sort', `${view.sort.column}.${view.sort.desc ? 'desc' : 'asc'}`)
  return next
}

// ── Rows ──────────────────────────────────────────────────────────────────────────────────────
export interface MarginFigures {
  /** (revenue − interim COGS) / revenue over the period's days that carry COGS. */
  pct: number | null
  /** (interim COGS − recipe-budget COGS) / revenue: a fraction, shown as points. */
  cogsVsBudget: number | null
  /** Mean recipe (BOM) coverage over the period. */
  coverage: number | null
  /** Over the days that carry both COGS bases: interim COGS and recipe-budget COGS, each as a
   *  share of those days' revenue. Their difference is `cogsVsBudget`. */
  budgetBasis: { cogsShare: number; budgetShare: number } | null
}

export interface BranchRow {
  code: string
  name: string
  revenue: number
  /** Change against the previous period of the same length, counting only day pairs where both
   *  days were received. Null when no such pair exists or the earlier side is zero. */
  vsPrevious: number | null
  /** Revenue on the latest reporting day; null when this branch has not sent that day. */
  latestDay: number | null
  /** Latest day against the same weekday a week earlier; null unless both were received. */
  vsWeekday: number | null
  trend: Array<number | null>
  /** Present only when margin rows were read. Null on a B2B row: margin covers POS branches. */
  margin?: MarginFigures | null
}

export interface CompanyRow extends Omit<BranchRow, 'code' | 'name'> {
  /** POS branches that have not sent the latest day. */
  missingLatest: number
}

export interface BranchTable {
  latestDate: string
  company: CompanyRow
  branches: BranchRow[]
  /** B2B invoices, one row per ERP code — never a branch. */
  b2b: BranchRow[]
  marginVsPrevious: number | null
}

export const B2B_CHANNEL = 'B2B'

export function sparklinePoints(values: readonly (number | null)[], width = 64, height = 24) {
  const received = values.flatMap((value, i) => value === null ? [] : [{
    x: Number((i * width / Math.max(values.length - 1, 1)).toFixed(1)), value,
  }])
  if (!received.length) return null
  const low = Math.min(...received.map((point) => point.value))
  const high = Math.max(...received.map((point) => point.value))
  const points = received.map(({ x, value }) => ({
    x, y: Number((high === low ? height / 2 : height - 2 - (value - low) / (high - low) * (height - 4)).toFixed(1)),
  }))
  return { points: points.map(({ x, y }) => `${x},${y}`).join(' '), end: points.at(-1)! }
}

export function moneyHeadline(table: BranchTable, period: MoneyPeriod, t: Translate) {
  const mover = table.branches.filter((row) => row.vsPrevious !== null)
    .sort((a, b) => Math.abs(b.vsPrevious!) - Math.abs(a.vsPrevious!))[0] ?? null
  return {
    sentence: t('money.overview.headline', {
      days: period, revenue: formatIDRCompact(table.company.revenue),
      change: table.company.vsPrevious === null ? t('money.delta.noComparison') : signedChange(table.company.vsPrevious).text,
    }),
    mover,
    missing: table.branches.filter((row) => row.latestDay === null),
  }
}

/** Daily revenue of one row group; a date absent from the map was not received. */
interface Series { code: string; name: string; byDate: Map<string, number> }

function seriesOf(rows: SalesDailyRevenueRow[]): Series[] {
  const groups = new Map<string, Series>()
  for (const r of rows) {
    const g = groups.get(r.branch_code) ?? { code: r.branch_code, name: r.branch_name ?? r.branch_code, byDate: new Map() }
    g.byDate.set(r.revenue_date, (g.byDate.get(r.revenue_date) ?? 0) + r.clean_revenue)
    groups.set(r.branch_code, g)
  }
  return [...groups.values()]
}

interface Pairs { current: number; earlier: number }

/** Sums of the `current` days and their matching `earlier` days, over pairs where both were
 *  received. */
function pairSums(byDate: Map<string, number>, dates: string[], shift: number): Pairs {
  const sums = { current: 0, earlier: 0 }
  for (const d of dates) {
    const now = byDate.get(d)
    const then = byDate.get(isoDaysBefore(d, shift))
    if (now === undefined || then === undefined) continue
    sums.current += now
    sums.earlier += then
  }
  return sums
}

function change({ current, earlier }: Pairs): number | null {
  return earlier > 0 ? current / earlier - 1 : null
}

function addPairs(a: Pairs, b: Pairs): Pairs {
  return { current: a.current + b.current, earlier: a.earlier + b.earlier }
}

/** Margin figures over [start, end] of one branch's (or the company's) margin rows. */
export function marginFigures(rows: SalesMarginDailyRow[], start: string, end: string): MarginFigures {
  const inWindow = rows.filter((r) => r.margin_date >= start && r.margin_date <= end)
  const costed = inWindow.filter((r) => r.cogs_interim_sm != null)
  const costedRevenue = costed.reduce((s, r) => s + r.revenue, 0)
  const cogs = costed.reduce((s, r) => s + (r.cogs_interim_sm ?? 0), 0)
  const budgeted = costed.filter((r) => r.cogs_budget_bom != null)
  const budgetedRevenue = budgeted.reduce((s, r) => s + r.revenue, 0)
  const budgetedCogs = budgeted.reduce((s, r) => s + (r.cogs_interim_sm ?? 0), 0)
  const budget = budgeted.reduce((s, r) => s + (r.cogs_budget_bom ?? 0), 0)
  return {
    pct: costedRevenue > 0 ? (costedRevenue - cogs) / costedRevenue : null,
    cogsVsBudget: budgetedRevenue > 0 ? (budgetedCogs - budget) / budgetedRevenue : null,
    coverage: bomCoveragePct(inWindow, start, end),
    budgetBasis: budgetedRevenue > 0
      ? { cogsShare: budgetedCogs / budgetedRevenue, budgetShare: budget / budgetedRevenue }
      : null,
  }
}

/**
 * The branch table for `period` days ending on the latest reporting day. `margin` is null for a
 * viewer without margin access; their rows then carry no margin field at all. Returns null when no
 * sales have been received.
 */
export function buildBranchTable(
  revenue: SalesDailyRevenueRow[],
  margin: SalesMarginDailyRow[] | null,
  period: MoneyPeriod,
): BranchTable | null {
  const latestDate = latestReportingDate(revenue)
  if (!latestDate) return null
  const { start, end } = resolveWindow({ kind: 'preset', days: period }, latestDate)
  const dates = Array.from({ length: period }, (_, i) => isoDaysBefore(end, i))
  // An invoice-less day is a zero, not a gap: B2B counts every day the snapshot covers.
  const receivedDates = new Set(revenue.map((r) => r.revenue_date))
  let companyPeriod: Pairs = { current: 0, earlier: 0 }
  let companyWeekday: Pairs = { current: 0, earlier: 0 }

  const toRow = (s: Series, kind: 'branch' | 'b2b'): BranchRow => {
    if (kind === 'b2b') for (const d of receivedDates) if (!s.byDate.has(d)) s.byDate.set(d, 0)
    const periodPairs = pairSums(s.byDate, dates, period)
    const weekdayPairs = pairSums(s.byDate, [latestDate], 7)
    companyPeriod = addPairs(companyPeriod, periodPairs)
    companyWeekday = addPairs(companyWeekday, weekdayPairs)
    const row: BranchRow = {
      code: s.code,
      name: s.name,
      revenue: dates.reduce((sum, d) => sum + (s.byDate.get(d) ?? 0), 0),
      vsPrevious: change(periodPairs),
      latestDay: s.byDate.get(latestDate) ?? null,
      vsWeekday: change(weekdayPairs),
      trend: dates.map((date) => s.byDate.get(date) ?? null),
    }
    if (margin) {
      row.margin = kind === 'b2b'
        ? null
        : marginFigures(margin.filter((m) => m.branch_code === s.code), start, end)
    }
    return row
  }

  const byRevenue = (a: BranchRow, b: BranchRow) => b.revenue - a.revenue
  const branches = seriesOf(revenue.filter((r) => r.channel !== B2B_CHANNEL)).map((s) => toRow(s, 'branch')).sort(byRevenue)
  const b2b = seriesOf(revenue.filter((r) => r.channel === B2B_CHANNEL)).map((s) => toRow(s, 'b2b')).sort(byRevenue)
  const all = [...branches, ...b2b]
  const companyDaily = new Map<string, number>()
  for (const row of revenue) companyDaily.set(row.revenue_date, (companyDaily.get(row.revenue_date) ?? 0) + row.clean_revenue)
  const companyMargin = margin ? marginFigures(margin, start, end) : null
  const previousStart = isoDaysBefore(start, period)
  const previousEnd = isoDaysBefore(start, 1)
  const previousMargin = margin ? marginFigures(margin, previousStart, previousEnd).pct : null
  const company: CompanyRow = {
    revenue: all.reduce((s, r) => s + r.revenue, 0),
    vsPrevious: change(companyPeriod),
    latestDay: all.reduce((s, r) => s + (r.latestDay ?? 0), 0),
    vsWeekday: change(companyWeekday),
    missingLatest: branches.filter((r) => r.latestDay === null).length,
    trend: dates.map((date) => companyDaily.get(date) ?? 0),
  }
  if (companyMargin) company.margin = companyMargin
  const marginVsPrevious = companyMargin?.pct !== null && companyMargin && previousMargin !== null
    ? companyMargin.pct - previousMargin : null
  return { latestDate, company, branches, b2b, marginVsPrevious }
}
