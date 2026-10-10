import { describe, expect, it } from 'vitest'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import type { SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { buildBranchTable, moneyHeadline, readMoneyView, sparklinePoints, withMoneyView } from './money-branch-table'
import { buildBranchPage } from './money-branch-page'
import { translateFor } from '@/i18n/use-t'

describe('readMoneyView — period and sort from the URL', () => {
  const read = (qs: string, canSeeMargin = true, latestDate?: string) => readMoneyView(new URLSearchParams(qs), { canSeeMargin, latestDate })

  it('a bare /money opens on 30 days sorted by revenue, highest first', () => {
    expect(read('')).toEqual({ period: 30, range: null, branchCode: null, channel: 'all', sort: { column: 'revenue', desc: true } })
  })

  it('reads a shared link back exactly', () => {
    expect(read('period=7&sort=latest-day.asc')).toMatchObject({ period: 7, sort: { column: 'latest-day', desc: false } })
    expect(read('period=60&sort=branch.desc')).toMatchObject({ period: 60, sort: { column: 'branch', desc: true } })
    expect(read('period=90').period).toBe(90)
  })

  it('an unknown period or sort falls back to the default instead of an empty table', () => {
    expect(read('period=14&sort=revenue.sideways')).toMatchObject({ period: 30, range: null, sort: { column: 'revenue', desc: true } })
    expect(read('sort=profit.desc').sort).toEqual({ column: 'revenue', desc: true })
  })

  it('a revenue-only viewer opening a link sorted by a margin column gets the default sort', () => {
    expect(read('period=7&sort=margin.desc', false)).toMatchObject({ period: 7, sort: { column: 'revenue', desc: true } })
    expect(read('period=7&sort=margin.desc', true).sort).toEqual({ column: 'margin', desc: true })
  })

  it('reads a valid custom range and both filters from a shared URL', () => {
    const view = read('period=custom&from=2026-09-01&to=2026-09-30&branch=GHQ&channel=B2B&sort=branch.asc', true, '2026-10-05')
    expect(view).toMatchObject({
      period: 30, range: { from: '2026-09-01', to: '2026-09-30' },
      branchCode: 'GHQ', channel: 'B2B', sort: { column: 'branch', desc: false },
    })
  })

  it.each([
    ['impossible calendar date', '2026-02-30', '2026-03-01'],
    ['reversed range', '2026-09-30', '2026-09-01'],
    ['end after latest synced day', '2026-09-01', '2026-10-06'],
  ])('rejects a custom range with %s', (_reason, from, to) => {
    const view = read(`period=custom&from=${from}&to=${to}`, true, '2026-10-05')
    expect(view.range).toBeNull()
  })
})

describe('withMoneyView — writes the view without touching other params', () => {
  it('writes period and sort as period=N&sort=column.direction', () => {
    const next = withMoneyView(new URLSearchParams('keep=1'), { period: 60, range: null, branchCode: null, channel: 'all', sort: { column: 'vs-weekday', desc: false } })
    expect(next.get('keep')).toBe('1')
    expect(next.get('period')).toBe('60')
    expect(next.get('sort')).toBe('vs-weekday.asc')
  })

  it('round-trips custom dates and branch/channel filters without dropping unrelated state', () => {
    const view = {
      period: 30, range: { from: '2026-09-01', to: '2026-09-30' }, branchCode: 'GHQ', channel: 'POS',
      sort: { column: 'branch', desc: false },
    } as ReturnType<typeof readMoneyView>
    const next = withMoneyView(new URLSearchParams('keep=1'), view)
    expect(next.toString()).toBe('keep=1&period=custom&from=2026-09-01&to=2026-09-30&branch=GHQ&channel=POS&sort=branch.asc')
    expect(readMoneyView(next, { canSeeMargin: true, latestDate: '2026-10-05' })).toMatchObject(view)
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

  it('displays linked MOS branch names and title-cases unmapped ERP names without changing source rows', () => {
    const linked = { ...rev(day(0), 'cikal', 'GORDI CIKAL', 10), branch_id: 'branch-cikal' }
    const unmapped = rev(day(0), 'radiant', 'GORDI RADIANT', 20)
    const rows = [linked, unmapped]
    const names = new Map([['branch-cikal', 'Gordi Cikal']])
    const table = buildBranchTable(rows, null, 7, names)!
    const page = buildBranchPage(rows, null, 'cikal', 7, names)!

    expect(table.branches.map((row) => [row.code, row.name])).toEqual([
      ['radiant', 'Gordi Radiant'], ['cikal', 'Gordi Cikal'],
    ])
    expect(page.name).toBe('Gordi Cikal')
    expect(linked.branch_name).toBe('GORDI CIKAL')
    expect(unmapped.branch_name).toBe('GORDI RADIANT')
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

  it('leaves a company trend gap for a day with no received revenue', () => {
    const rows = revenueRows().filter((row) => row.revenue_date !== day(2))
    const company = buildBranchTable(rows, null, 7)!.company
    expect(company.trend[4]).toBeNull()
  })

  it('margin figures are only present when margin rows were read', () => {
    const table = buildBranchTable(revenueRows(), null, 7)!
    for (const row of [table.company, ...table.branches, ...table.b2b]) expect('margin' in row).toBe(false)
  })

  it('custom dates and branch/channel filters scope the company, headline inputs and rows identically', () => {
    const table = buildBranchTable(revenueRows(), null, 30, undefined, {
      latestDate: LATEST, range: { from: day(6), to: day(0) }, branchCode: 'alpha', channel: 'POS',
    })!
    expect(table.latestDate).toBe(LATEST)
    expect(table.company).toMatchObject({ revenue: 14_000_000, latestDay: 2_000_000, trend: Array(7).fill(2_000_000) })
    expect(table.branches.map((row) => row.code)).toEqual(['alpha'])
    expect(table.b2b).toEqual([])
    expect(table.branches[0].vsPrevious).toBeCloseTo(1, 10)
  })

  it('company margin and prior comparison use the same branch as filtered revenue', () => {
    const betaMargin = marginRows().map((row) => ({
      ...row, branch_code: 'beta', branch_name: 'Beta', revenue: 2_000_000,
      cogs_interim_sm: 1_000_000, cogs_budget_bom: 800_000, margin_interim: 1_000_000,
    }))
    const table = buildBranchTable(revenueRows(), [...marginRows(), ...betaMargin], 7, undefined, {
      latestDate: LATEST, branchCode: 'beta', channel: 'POS',
    })!
    expect(table.company.revenue).toBe(12_000_000)
    expect(table.company.latestDay).toBeNull()
    expect(table.company.margin?.pct).toBeCloseTo(0.5, 10)
    expect(table.marginVsPrevious).toBeNull()
  })

  it('a branch with only comparison-period rows is an empty current-period selection', () => {
    expect(buildBranchTable(revenueRows(), null, 30, undefined, {
      latestDate: LATEST, range: { from: day(0), to: day(0) }, branchCode: 'beta', channel: 'POS',
    })).toBeNull()
  })

  it('a B2B channel filter removes POS rows and margin figures from the same view', () => {
    const table = buildBranchTable(revenueRows(), marginRows(), 7, undefined, {
      latestDate: LATEST, channel: 'B2B',
    })!
    expect(table.company.revenue).toBe(5_000_000)
    expect(table.branches).toEqual([])
    expect(table.b2b).toHaveLength(1)
    expect('margin' in table.company).toBe(false)
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

  it('keeps the sparkline endpoint ring inside its viewBox at compact width', () => {
    const trend = sparklinePoints([0, 5, null, 10])!
    const markerExtent = 4.5 + 2 / 2
    const viewBox = { width: 64, height: 24 }

    expect(trend.points).toBe('6,18 23.3,12 58,6')
    expect(trend.end.x - markerExtent).toBeGreaterThanOrEqual(0)
    expect(trend.end.x + markerExtent).toBeLessThanOrEqual(viewBox.width)
    expect(trend.end.y - markerExtent).toBeGreaterThanOrEqual(0)
    expect(trend.end.y + markerExtent).toBeLessThanOrEqual(viewBox.height)
    expect((markerExtent * 2 * 48) / viewBox.width).toBeGreaterThanOrEqual(8)
  })
})
