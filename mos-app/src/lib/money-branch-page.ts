// money-branch-page.ts — the Branch page (/money/branch/:code): the view it keeps in the URL and
// the figures it draws. Pure: no DB access and no clock; the window anchors to the latest reporting
// day across every branch, so a branch that has not sent that day shows it as not received.
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { latestReportingDate } from '@/lib/db/reporting'
import { isoDaysBefore } from '@/lib/trailing-window'
import {
  B2B_CHANNEL,
  displayBranchName,
  marginFigures,
  readMoneyView,
  resolveMoneyWindow,
  type MarginFigures,
  type MoneyDataScope,
  type MoneyView,
} from '@/lib/money-branch-table'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export interface BranchView extends MoneyView {
  /** The chosen chart day (?d=YYYY-MM-DD); null = the latest day. */
  day: string | null
}

export function readBranchView(params: URLSearchParams, options: { canSeeMargin: boolean; latestDate?: string } = { canSeeMargin: true }): BranchView {
  const view = readMoneyView(params, options)
  const d = params.get('d')
  return { ...view, day: d && ISO_DAY.test(d) ? d : null }
}

export interface BranchDay {
  date: string
  /** Revenue that day; null when the branch did not send it. */
  value: number | null
  /** The same weekday a week earlier; null when that day was not received. */
  compare: number | null
  marginPct?: number | null
}

export interface BranchPage {
  code: string
  name: string
  /** The MOS branch the ERP code is linked to; null until someone maps it. */
  branchId: string | null
  isB2B: boolean
  latestDate: string
  daysCount: number
  /** The selected range's days, oldest first. */
  days: BranchDay[]
  total: number
  vsPrevious: number | null
  /** Present only when margin rows were read; null on B2B (margin covers POS branches). */
  margin?: MarginFigures | null
}

export function buildBranchPage(
  revenue: SalesDailyRevenueRow[], margin: SalesMarginDailyRow[] | null, code: string, period: MoneyView['period'],
  branchNames?: ReadonlyMap<string, string>, scope: MoneyDataScope = {},
): BranchPage | null {
  const syncedDate = scope.latestDate ?? latestReportingDate(revenue)
  if (!syncedDate) return null
  const window = resolveMoneyWindow({ period, range: scope.range ?? null }, syncedDate)
  const own = revenue.filter((r) => r.branch_code === code
    && (!scope.channel || scope.channel === 'all' || r.channel === scope.channel))
  if (!own.some((r) => r.revenue_date >= window.from && r.revenue_date <= window.to)) return null
  const isB2B = own.every((r) => r.channel === B2B_CHANNEL)
  const byDate = new Map<string, number>()
  for (const r of own) byDate.set(r.revenue_date, (byDate.get(r.revenue_date) ?? 0) + r.clean_revenue)
  if (isB2B) for (const r of revenue) if (!byDate.has(r.revenue_date)) byDate.set(r.revenue_date, 0)

  const days: BranchDay[] = Array.from({ length: window.days }, (_, i) => {
    const date = isoDaysBefore(window.to, window.days - i - 1)
    return { date, value: byDate.get(date) ?? null, compare: byDate.get(isoDaysBefore(date, 7)) ?? null }
  })
  let currentPair = 0
  let previousPair = 0
  for (const d of days) {
    const earlier = byDate.get(isoDaysBefore(d.date, window.days))
    if (d.value !== null && earlier !== undefined) { currentPair += d.value; previousPair += earlier }
  }
  if (margin && !isB2B) {
    const dailyMargin = new Map(margin.filter((row) => row.branch_code === code).map((row) => [
      row.margin_date, row.revenue > 0 && row.margin_interim !== null ? row.margin_interim / row.revenue : null,
    ]))
    for (const d of days) d.marginPct = dailyMargin.get(d.date) ?? null
  }
  const latest = own.reduce((a, b) => (b.revenue_date > a.revenue_date ? b : a))
  const branchId = own.find((r) => r.branch_id)?.branch_id ?? null
  const page: BranchPage = {
    code, name: displayBranchName(latest.branch_name ?? code, branchId ? branchNames?.get(branchId) : null),
    branchId, isB2B, latestDate: window.to, daysCount: window.days, days,
    total: days.reduce((s, d) => s + (d.value ?? 0), 0),
    vsPrevious: previousPair > 0 ? currentPair / previousPair - 1 : null,
  }
  if (margin) page.margin = isB2B ? null : marginFigures(margin.filter((m) => m.branch_code === code), window.from, window.to)
  return page
}
