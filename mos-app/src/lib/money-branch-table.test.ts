import { describe, expect, it } from 'vitest'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { buildBranchTable, moneyHeadline, readMoneyView, sparklinePoints, withMoneyView } from './money-branch-table'
import { translateFor } from '@/i18n/use-t'

describe('readMoneyView — period and sort from the URL', () => {
  const read = (qs: string, canSeeMargin = true) => readMoneyView(new URLSearchParams(qs), { canSeeMargin })

  it('a bare /money opens on 30 days sorted by revenue, highest first', () => {
    expect(read('')).toEqual({ period: 30, sort: { column: 'revenue', desc: true } })
  })

  it('reads a shared link back exactly', () => {
    expect(read('period=7&sort=latest-day.asc')).toEqual({ period: 7, sort: { column: 'latest-day', desc: false } })
    expect(read('period=60&sort=branch.desc')).toEqual({ period: 60, sort: { column: 'branch', desc: true } })
  })

  it('an unknown period or sort falls back to the default instead of an empty table', () => {
    expect(read('period=14&sort=revenue.sideways')).toEqual({ period: 30, sort: { column: 'revenue', desc: true } })
    expect(read('sort=profit.desc').sort).toEqual({ column: 'revenue', desc: true })
  })

  it('a revenue-only viewer opening a link sorted by a margin column gets the default sort', () => {
    expect(read('period=7&sort=margin.desc', false)).toEqual({ period: 7, sort: { column: 'revenue', desc: true } })
    expect(read('period=7&sort=margin.desc', true).sort).toEqual({ column: 'margin', desc: true })
  })
})

describe('withMoneyView — writes the view without touching other params', () => {
  it('writes period and sort as period=N&sort=column.direction', () => {
    const next = withMoneyView(new URLSearchParams('keep=1'), { period: 60, sort: { column: 'vs-weekday', desc: false } })
    expect(next.get('keep')).toBe('1')
    expect(next.get('period')).toBe('60')
    expect(next.get('sort')).toBe('vs-weekday.asc')
  })
})

// Worked example, latest reporting day Mon 5 Oct 2026, period 7:
//   Alpha  every day received: 2,0 jt a day now, 1,0 jt a day the week before.
//   Beta   5 Oct not received; 2,0 jt a day now, 1,5 jt a day the week before.
//   B2B    one invoice in each week: 5,0 jt on 5 Oct, 2,5 jt on 28 Sep.
const LATEST = '2026-10-05'
function day(offset: number): string {
  const d = new Date(`${LATEST}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}
function rev(date: string, branch_code: string, branch_name: string, clean_revenue: number, channel = 'POS'): SalesDailyRevenueRow {
  return {
    revenue_date: date, channel, esb_code: 'X', branch_code, branch_name, branch_id: null, transactions: 10,
    clean_revenue, snapshot_as_of: '2026-10-05T19:05:00Z', source_contract_version: 'v1',
  }
}
function revenueRows(): SalesDailyRevenueRow[] {
  const rows: SalesDailyRevenueRow[] = []
  for (let i = 0; i < 14; i++) {
    const current = i < 7
    rows.push(rev(day(i), 'alpha', 'Alpha', current ? 2_000_000 : 1_000_000))
    if (i !== 0) rows.push(rev(day(i), 'beta', 'Beta', current ? 2_000_000 : 1_500_000))
  }
  rows.push(rev(day(0), 'roastery', 'Gordi Roastery', 5_000_000, 'B2B'))
  rows.push(rev(day(7), 'roastery', 'Gordi Roastery', 2_500_000, 'B2B'))
  return rows
}
function marginRows(): SalesMarginDailyRow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    margin_date: day(i), esb_code: 'X', branch_code: 'alpha', branch_name: 'Alpha', branch_id: null,
    revenue: 2_000_000, cogs_interim_sm: 700_000, cogs_budget_bom: 600_000, margin_interim: 1_300_000,
    bom_coverage_pct: 0.9, snapshot_as_of: '2026-10-05T19:05:00Z', source_contract_version: 'v1',
  }))
}

describe('buildBranchTable', () => {
  it('returns nothing to draw when no sales have been received', () => {
    expect(buildBranchTable([], null, 7)).toBeNull()
  })

  it('a branch row carries period revenue, the change on the same days, the latest day and the same weekday', () => {
    const table = buildBranchTable(revenueRows(), null, 7)!
    expect(table.latestDate).toBe(LATEST)
    const alpha = table.branches.find((r) => r.code === 'alpha')!
    expect(alpha).toMatchObject({ name: 'Alpha', revenue: 14_000_000, latestDay: 2_000_000 })
    expect(alpha.vsPrevious).toBeCloseTo(1, 10)
    expect(alpha.vsWeekday).toBeCloseTo(1, 10)
  })

  it('a day a branch has not sent is left out of both periods, never counted as zero', () => {
    const beta = buildBranchTable(revenueRows(), null, 7)!.branches.find((r) => r.code === 'beta')!
    expect(beta.revenue).toBe(12_000_000)
    // 6 complete day pairs: 12,0 jt against 9,0 jt.
    expect(beta.vsPrevious).toBeCloseTo(1 / 3, 10)
    expect(beta.latestDay).toBeNull()
    expect(beta.vsWeekday).toBeNull()
  })

  it('B2B invoices sit in their own group, apart from the branches', () => {
    const table = buildBranchTable(revenueRows(), null, 7)!
    expect(table.branches.map((r) => r.code)).toEqual(['alpha', 'beta'])
    expect(table.b2b).toHaveLength(1)
    expect(table.b2b[0]).toMatchObject({ code: 'roastery', revenue: 5_000_000, latestDay: 5_000_000 })
    expect(table.b2b[0].vsPrevious).toBeCloseTo(1, 10)
  })

  it('the company row totals every row and names how many branches are missing the latest day', () => {
    const company = buildBranchTable(revenueRows(), null, 7)!.company
    expect(company.revenue).toBe(31_000_000)
    // Like-for-like: 31,0 jt against 7,0 + 9,0 + 2,5 = 18,5 jt.
    expect(company.vsPrevious).toBeCloseTo(31 / 18.5 - 1, 10)
    expect(company.latestDay).toBe(7_000_000)
    expect(company.missingLatest).toBe(1)
    // Same weekday counts only rows that sent both days: 7,0 jt against 3,5 jt.
    expect(company.vsWeekday).toBeCloseTo(1, 10)
  })

  it('margin figures are only present when margin rows were read', () => {
    const table = buildBranchTable(revenueRows(), null, 7)!
    for (const row of [table.company, ...table.branches, ...table.b2b]) expect('margin' in row).toBe(false)
  })

  it('a margin viewer gets interim margin, COGS against budget in points, and recipe coverage', () => {
    const table = buildBranchTable(revenueRows(), marginRows(), 7)!
    const alpha = table.branches.find((r) => r.code === 'alpha')!
    // (14,0 − 4,9) / 14,0 = 65%; (4,9 − 4,2) / 14,0 = 5 points over budget.
    expect(alpha.margin!.pct).toBeCloseTo(0.65, 10)
    expect(alpha.margin!.cogsVsBudget).toBeCloseTo(0.05, 10)
    expect(alpha.margin!.coverage).toBeCloseTo(0.9, 10)
    // The sentence's two shares: 35% COGS against a 30% budget.
    expect(alpha.margin!.budgetBasis!.cogsShare).toBeCloseTo(0.35, 10)
    expect(alpha.margin!.budgetBasis!.budgetShare).toBeCloseTo(0.3, 10)
    expect(table.branches.find((r) => r.code === 'beta')!.margin).toEqual({ pct: null, cogsVsBudget: null, coverage: null, budgetBasis: null })
    expect(table.company.margin!.pct).toBeCloseTo(0.65, 10)
    expect(table.b2b[0].margin).toBeNull()
  })

  it('builds a plain headline sentence, picks the largest POS mover, and names missing branches', () => {
    const table = buildBranchTable(revenueRows(), null, 7)!
    const headline = moneyHeadline(table, 7, translateFor('en'))
    expect(headline.sentence).toBe('Over the last 7 days, revenue was Rp 31 jt (+67,6% vs the previous period).')
    expect(headline.mover).toMatchObject({ code: 'alpha', name: 'Alpha', vsPrevious: 1 })
    expect(headline.missing.map((row) => row.name)).toEqual(['Beta'])
  })

  it('maps received values to normalized sparkline points and leaves gaps', () => {
    expect(sparklinePoints([0, 5, null, 10])).toEqual({ points: '0,22 21.3,12 64,2', end: { x: 64, y: 2 } })
  })
})
