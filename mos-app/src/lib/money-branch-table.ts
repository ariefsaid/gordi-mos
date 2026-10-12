// money-branch-table.ts — the Money page's branch table: the view state it keeps in the URL and
// the rows it draws. Pure: no DB access and no clock; every window is anchored to the latest
// reporting day in the rows.
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { latestReportingDate } from '@/lib/db/reporting'
import { bomCoveragePct } from '@/lib/dashboard'
import { isoDaysBefore } from '@/lib/trailing-window'
import { formatIDRCompact, signedChange } from '@/lib/sales-dashboard'
import type { Translate } from '@/i18n/use-t'
import { isRealDate } from '@/lib/format/date-entry'
import { formatDayMonthYear } from '@/lib/format/date'

// ── View state (?period=7|30|60|90|custom&from=…&to=…&sort=…) ────────────────────────────────
export const MONEY_PERIODS = [7, 30, 60, 90] as const
export type MoneyPeriod = (typeof MONEY_PERIODS)[number]
export type MoneyChannel = 'all' | 'POS' | 'B2B'
export interface MoneyRange { from: string; to: string }
export interface MoneySelection { period: MoneyPeriod; range: MoneyRange | null; branchCode: string | null; channel: MoneyChannel }

export const REVENUE_COLUMNS = ['branch', 'revenue', 'vs-previous', 'latest-day', 'vs-weekday'] as const
export const MARGIN_COLUMNS = ['margin', 'cogs-vs-budget', 'coverage'] as const
export type MoneyColumn = (typeof REVENUE_COLUMNS)[number] | (typeof MARGIN_COLUMNS)[number]

export interface MoneySort { column: MoneyColumn; desc: boolean }
export interface MoneyView extends MoneySelection { sort: MoneySort }
export interface MoneyDateWindow { from: string; to: string; days: number }

export const DEFAULT_MONEY_VIEW: MoneyView = {
  period: 30, range: null, branchCode: null, channel: 'all', sort: { column: 'revenue', desc: true },
}

/** ISO calendar dates only; a custom end cannot outrun the newest synced revenue day. */
export function isValidMoneyRange(from: string | null, to: string | null, latestDate?: string): boolean {
  const real = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && isRealDate(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10)))
  return real(from) && real(to) && from <= to && (!latestDate || to <= latestDate)
}

export function resolveMoneyWindow(selection: Pick<MoneySelection, 'period' | 'range'>, latestDate: string): MoneyDateWindow {
  const from = selection.range?.from ?? isoDaysBefore(latestDate, selection.period - 1)
  const to = selection.range?.to ?? latestDate
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1
  return { from, to, days }
}

export function readMoneyView(params: URLSearchParams, { canSeeMargin, latestDate }: { canSeeMargin: boolean; latestDate?: string }): MoneyView {
  const period = MONEY_PERIODS.find((p) => String(p) === params.get('period')) ?? DEFAULT_MONEY_VIEW.period
  const from = params.get('from')
  const to = params.get('to')
  const range = params.get('period') === 'custom' && isValidMoneyRange(from, to, latestDate) && from && to
    ? { from, to } : null
  const rawBranch = params.get('branch')?.trim() ?? ''
  const branchCode = rawBranch && rawBranch.length <= 100 ? rawBranch : null
  const channel = params.get('channel')
  const [column, dir] = (params.get('sort') ?? '').split('.')
  const columns: readonly string[] = canSeeMargin ? [...REVENUE_COLUMNS, ...MARGIN_COLUMNS] : REVENUE_COLUMNS
  const sort = columns.includes(column) && (dir === 'asc' || dir === 'desc')
    ? { column: column as MoneyColumn, desc: dir === 'desc' }
    : DEFAULT_MONEY_VIEW.sort
  return { period, range, branchCode, channel: channel === 'POS' || channel === 'B2B' ? channel : 'all', sort }
}

/** `params` with the view written into it; unrelated state, including a chosen chart day, survives. */
export function withMoneyView(params: URLSearchParams, view: MoneyView): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set('period', view.range ? 'custom' : String(view.period))
  if (view.range) { next.set('from', view.range.from); next.set('to', view.range.to) }
  else { next.delete('from'); next.delete('to') }
  if (view.branchCode) next.set('branch', view.branchCode); else next.delete('branch')
  if (view.channel === 'all') next.delete('channel'); else next.set('channel', view.channel)
  next.set('sort', `${view.sort.column}.${view.sort.desc ? 'desc' : 'asc'}`)
  return next
}

export function moneyBranchHref(code: string, view: MoneyView): string {
  const query = withMoneyView(new URLSearchParams(), view)
  return `/money/branch/${encodeURIComponent(code)}?${query.toString()}`
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
  daysCount: number
  company: CompanyRow
  branches: BranchRow[]
  /** B2B invoices, one row per ERP code — never a branch. */
  b2b: BranchRow[]
  marginVsPrevious: number | null
}

export const B2B_CHANNEL = 'B2B'

export interface MoneyDataScope {
  latestDate?: string
  range?: MoneyRange | null
  branchCode?: string | null
  channel?: MoneyChannel
}

/** The reporting name is an ERP value; display a linked MOS name first, otherwise title-case it. */
export function displayBranchName(erpName: string, mosName?: string | null): string {
  if (mosName?.trim()) return mosName.trim()
  return erpName.trim().replace(/[\p{L}\p{M}]+/gu, (word) =>
    word === word.toUpperCase() && word.length <= 3
      ? word
      : `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`,
  )
}

export function sparklinePoints(values: readonly (number | null)[], width = 64, height = 24) {
  const inset = 6
  const plotWidth = width - inset * 2
  const plotHeight = height - inset * 2
  const received = values.flatMap((value, i) => value === null ? [] : [{
    x: Number((inset + i * plotWidth / Math.max(values.length - 1, 1)).toFixed(1)), value,
  }])
  if (!received.length) return null
  const low = Math.min(...received.map((point) => point.value))
  const high = Math.max(...received.map((point) => point.value))
  const points = received.map(({ x, value }) => ({
    x, y: Number((high === low ? height / 2 : height - inset - (value - low) / (high - low) * plotHeight).toFixed(1)),
  }))
  return { points: points.map(({ x, y }) => `${x},${y}`).join(' '), end: points.at(-1)! }
}

export function moneyHeadline(table: BranchTable, period: number, t: Translate, range?: MoneyRange | null, locale?: 'en' | 'id') {
  const mover = table.branches.filter((row) => row.vsPrevious !== null)
    .sort((a, b) => Math.abs(b.vsPrevious!) - Math.abs(a.vsPrevious!))[0] ?? null
  const values = {
    days: period, revenue: formatIDRCompact(table.company.revenue),
    change: table.company.vsPrevious === null ? t('money.delta.noComparison') : signedChange(table.company.vsPrevious).text,
  }
  return {
    sentence: range
      ? t('money.overview.headline.custom', { ...values, from: formatDayMonthYear(range.from, locale), to: formatDayMonthYear(range.to, locale) })
      : t('money.overview.headline', values),
    mover,
    missing: table.branches.filter((row) => row.latestDay === null),
  }
}

/** Daily revenue of one row group; a date absent from the map was not received. */
interface Series { code: string; name: string; byDate: Map<string, number> }

function seriesOf(rows: SalesDailyRevenueRow[], branchNames?: ReadonlyMap<string, string>): Series[] {
  const groups = new Map<string, Series>()
  for (const r of rows) {
    const mosName = r.branch_id ? branchNames?.get(r.branch_id) : null
    const g = groups.get(r.branch_code) ?? {
      code: r.branch_code,
      name: displayBranchName(r.branch_name ?? r.branch_code, mosName),
      byDate: new Map(),
    }
    if (mosName) g.name = displayBranchName(r.branch_name ?? r.branch_code, mosName)
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

/** Returns null when the selected channel/branch has no rows in the requested window. */
export function buildBranchTable(
  revenue: SalesDailyRevenueRow[],
  margin: SalesMarginDailyRow[] | null,
  period: MoneyPeriod,
  branchNames?: ReadonlyMap<string, string>,
  scope: MoneyDataScope = {},
): BranchTable | null {
  const syncedDate = scope.latestDate ?? latestReportingDate(revenue)
  if (!syncedDate) return null
  const window = resolveMoneyWindow({ period, range: scope.range ?? null }, syncedDate)
  const dates = Array.from({ length: window.days }, (_, i) => isoDaysBefore(window.to, window.days - i - 1))
  const selected = revenue.filter((row) => (!scope.branchCode || row.branch_code === scope.branchCode)
    && (!scope.channel || scope.channel === 'all' || row.channel === scope.channel))
  const current = selected.filter((row) => row.revenue_date >= window.from && row.revenue_date <= window.to)
  if (current.length === 0) return null
  const currentCodes = new Set(current.map((row) => row.branch_code))
  const visible = selected.filter((row) => currentCodes.has(row.branch_code))
  const latestDate = window.to
  const previousStart = isoDaysBefore(window.from, window.days)
  const previousEnd = isoDaysBefore(window.from, 1)
  const receivedDates = new Set(revenue.map((row) => row.revenue_date))
  const b2bOnly = scope.channel === 'B2B' || Boolean(scope.branchCode && current.every((row) => row.channel === B2B_CHANNEL))
  const visibleMargin = b2bOnly ? null : margin
  let companyPeriod: Pairs = { current: 0, earlier: 0 }
  let companyWeekday: Pairs = { current: 0, earlier: 0 }

  const toRow = (s: Series, kind: 'branch' | 'b2b'): BranchRow => {
    if (kind === 'b2b') for (const d of receivedDates) if (!s.byDate.has(d)) s.byDate.set(d, 0)
    const periodPairs = pairSums(s.byDate, dates, window.days)
    const weekdayPairs = pairSums(s.byDate, [latestDate], 7)
    companyPeriod = addPairs(companyPeriod, periodPairs)
    companyWeekday = addPairs(companyWeekday, weekdayPairs)
    const row: BranchRow = {
      code: s.code, name: s.name,
      revenue: dates.reduce((sum, d) => sum + (s.byDate.get(d) ?? 0), 0),
      vsPrevious: change(periodPairs), latestDay: s.byDate.get(latestDate) ?? null,
      vsWeekday: change(weekdayPairs), trend: dates.map((date) => s.byDate.get(date) ?? null),
    }
    if (visibleMargin) row.margin = kind === 'b2b' ? null : marginFigures(visibleMargin.filter((m) => m.branch_code === s.code), window.from, window.to)
    return row
  }

  const byRevenue = (a: BranchRow, b: BranchRow) => b.revenue - a.revenue
  const branches = seriesOf(visible.filter((r) => r.channel !== B2B_CHANNEL), branchNames).map((s) => toRow(s, 'branch')).sort(byRevenue)
  const b2b = seriesOf(visible.filter((r) => r.channel === B2B_CHANNEL), branchNames).map((s) => toRow(s, 'b2b')).sort(byRevenue)
  const all = [...branches, ...b2b]
  const companyDaily = new Map<string, number>()
  if (scope.channel === 'B2B') for (const date of receivedDates) companyDaily.set(date, 0)
  for (const row of visible) companyDaily.set(row.revenue_date, (companyDaily.get(row.revenue_date) ?? 0) + row.clean_revenue)
  const scopedMargin = visibleMargin?.filter((row) => !scope.branchCode || row.branch_code === scope.branchCode) ?? null
  const companyMargin = scopedMargin ? marginFigures(scopedMargin, window.from, window.to) : null
  const previousMargin = scopedMargin ? marginFigures(scopedMargin, previousStart, previousEnd).pct : null
  const company: CompanyRow = {
    revenue: all.reduce((s, r) => s + r.revenue, 0), vsPrevious: change(companyPeriod),
    latestDay: all.some((row) => row.latestDay !== null) ? all.reduce((s, r) => s + (r.latestDay ?? 0), 0) : null,
    vsWeekday: change(companyWeekday),
    missingLatest: branches.filter((r) => r.latestDay === null).length,
    trend: dates.map((date) => companyDaily.get(date) ?? null),
  }
  if (companyMargin) company.margin = companyMargin
  const marginVsPrevious = companyMargin?.pct !== null && companyMargin && previousMargin !== null
    ? companyMargin.pct - previousMargin : null
  return { latestDate, daysCount: window.days, company, branches, b2b, marginVsPrevious }
}
