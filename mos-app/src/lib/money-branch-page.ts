// money-branch-page.ts — the Branch page (/money/branch/:code): the view it keeps in the URL and
// the figures it draws. Pure: no DB access and no clock; the window anchors to the latest reporting
// day across every branch, so a branch that has not sent that day shows it as not received.
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { latestReportingDate } from '@/lib/db/reporting'
import { resolveWindow } from '@/lib/dashboard'
import { isoDaysBefore } from '@/lib/trailing-window'
import {
  B2B_CHANNEL,
  DEFAULT_MONEY_VIEW,
  MONEY_PERIODS,
  marginFigures,
  type MarginFigures,
  type MoneyPeriod,
} from '@/lib/money-branch-table'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export interface BranchView {
  period: MoneyPeriod
  /** The chosen chart day (?d=YYYY-MM-DD); null = the latest day. */
  day: string | null
}

export function readBranchView(params: URLSearchParams): BranchView {
  const period = MONEY_PERIODS.find((p) => String(p) === params.get('period')) ?? DEFAULT_MONEY_VIEW.period
  const d = params.get('d')
  return { period, day: d && ISO_DAY.test(d) ? d : null }
}

export interface BranchDay {
  date: string
  /** Revenue that day; null when the branch did not send it. */
  value: number | null
  /** The same weekday a week earlier; null when that day was not received. */
  compare: number | null
}

export interface BranchPage {
  code: string
  name: string
  /** The MOS branch the ERP code is linked to; null until someone maps it. */
  branchId: string | null
  isB2B: boolean
  latestDate: string
  /** The period's days, oldest first. */
  days: BranchDay[]
  total: number
  /** Present only when margin rows were read; null on B2B (margin covers POS branches). */
  margin?: MarginFigures | null
}

/** The page for `code` over `period` days, or null when no sales have been received or the code
 *  has none in the rows read. */
export function buildBranchPage(
  revenue: SalesDailyRevenueRow[],
  margin: SalesMarginDailyRow[] | null,
  code: string,
  period: MoneyPeriod,
): BranchPage | null {
  const latestDate = latestReportingDate(revenue)
  const own = revenue.filter((r) => r.branch_code === code)
  if (!latestDate || own.length === 0) return null
  const isB2B = own.some((r) => r.channel === B2B_CHANNEL)
  const byDate = new Map<string, number>()
  for (const r of own) byDate.set(r.revenue_date, (byDate.get(r.revenue_date) ?? 0) + r.clean_revenue)
  // An invoice-less day is a zero, not a gap: B2B counts every day the snapshot covers.
  if (isB2B) for (const r of revenue) if (!byDate.has(r.revenue_date)) byDate.set(r.revenue_date, 0)

  const { start, end } = resolveWindow({ kind: 'preset', days: period }, latestDate)
  const days = Array.from({ length: period }, (_, i) => {
    const date = isoDaysBefore(end, period - 1 - i)
    return { date, value: byDate.get(date) ?? null, compare: byDate.get(isoDaysBefore(date, 7)) ?? null }
  })
  const latest = own.reduce((a, b) => (b.revenue_date > a.revenue_date ? b : a))
  const page: BranchPage = {
    code,
    name: latest.branch_name ?? code,
    branchId: own.find((r) => r.branch_id)?.branch_id ?? null,
    isB2B,
    latestDate,
    days,
    total: days.reduce((s, d) => s + (d.value ?? 0), 0),
  }
  if (margin) page.margin = isB2B ? null : marginFigures(margin.filter((m) => m.branch_code === code), start, end)
  return page
}
