import { describe, expect, it } from 'vitest'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { branchViewPath, buildBranchPage, readBranchView } from './money-branch-page'

const LATEST = '2026-10-05'
function day(offset: number): string {
  const d = new Date(`${LATEST}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}
function rev(date: string, code: string, amount: number, channel = 'POS'): SalesDailyRevenueRow {
  return {
    revenue_date: date, channel, esb_code: code, branch_code: code, branch_name: code.toUpperCase(),
    branch_id: code === 'ghq' ? 'b-ghq' : null, transactions: 1, clean_revenue: amount,
    snapshot_as_of: '2026-10-05T19:05:00Z', source_contract_version: 'v1',
  }
}
// ghq every day for 21 days; ckl misses the latest day; b2b invoices on day 0 only.
const ROWS: SalesDailyRevenueRow[] = [
  ...Array.from({ length: 21 }, (_, i) => rev(day(i), 'ghq', 1_000_000 + i * 10_000)),
  ...Array.from({ length: 20 }, (_, i) => rev(day(i + 1), 'ckl', 500_000)),
  rev(day(0), 'rst', 4_000_000, 'B2B'),
]
const MARGIN: SalesMarginDailyRow[] = Array.from({ length: 7 }, (_, i) => ({
  margin_date: day(i), esb_code: 'ghq', branch_code: 'ghq', branch_name: 'GHQ', branch_id: 'b-ghq',
  revenue: 1_000_000, cogs_interim_sm: 400_000, cogs_budget_bom: 350_000, margin_interim: 600_000,
  bom_coverage_pct: 0.8, snapshot_as_of: '2026-10-05T19:05:00Z', source_contract_version: 'v1',
}))

describe('readBranchView', () => {
  it('reads the period and a well-formed day, else the defaults', () => {
    expect(readBranchView(new URLSearchParams('period=7&d=2026-10-03'))).toEqual({ period: 7, day: '2026-10-03' })
    expect(readBranchView(new URLSearchParams('period=14&d=yesterday'))).toEqual({ period: 30, day: null })
  })
})

describe('branchViewPath', () => {
  it('keeps the period and the chosen day, and encodes the code', () => {
    expect(branchViewPath('G H', 7, '2026-10-05')).toBe('/money/branch/G%20H?period=7&d=2026-10-05')
    expect(branchViewPath('ghq', 30, null)).toBe('/money/branch/ghq?period=30')
  })
})

describe('buildBranchPage', () => {
  it('lays the period out day by day, oldest first, each against the same weekday a week earlier', () => {
    const page = buildBranchPage(ROWS, null, 'ghq', 7)!
    expect(page.name).toBe('GHQ')
    expect(page.branchId).toBe('b-ghq')
    expect(page.latestDate).toBe(LATEST)
    expect(page.days.map((d) => d.date)).toEqual([6, 5, 4, 3, 2, 1, 0].map(day))
    expect(page.days[6]).toEqual({ date: LATEST, value: 1_000_000, compare: 1_070_000 })
    expect(page.total).toBe(page.days.reduce((s, d) => s + (d.value ?? 0), 0))
    expect(page.margin).toBeUndefined()
  })

  it('a day the branch did not send is null, never zero; the company latest day still anchors the window', () => {
    const page = buildBranchPage(ROWS, null, 'ckl', 7)!
    expect(page.latestDate).toBe(LATEST)
    expect(page.days[6]).toEqual({ date: LATEST, value: null, compare: 500_000 })
  })

  it('B2B counts a received day without an invoice as zero, and carries no margin', () => {
    const page = buildBranchPage(ROWS, MARGIN, 'rst', 7)!
    expect(page.isB2B).toBe(true)
    expect(page.days[5].value).toBe(0)
    expect(page.margin).toBeNull()
  })

  it('a margin viewer gets the branch margin for the period', () => {
    const page = buildBranchPage(ROWS, MARGIN, 'ghq', 7)!
    expect(page.margin!.pct).toBeCloseTo(0.6, 10)
    expect(page.margin!.budgetBasis).toEqual({ cogsShare: 0.4, budgetShare: 0.35 })
  })

  it('an unknown branch is null', () => {
    expect(buildBranchPage(ROWS, null, 'nope', 7)).toBeNull()
    expect(buildBranchPage([], null, 'ghq', 7)).toBeNull()
  })
})
