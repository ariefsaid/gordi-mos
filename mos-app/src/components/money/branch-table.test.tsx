// BranchTable — a change from outside (period, sort) settles in a bounded number of commits.
// TanStack recomputes the sorted rows whenever the sorting state changes identity and queues a
// page-index reset each time; a table that hands it a new array every render commits forever, and
// in the app the router's transition then never lands (a sort survived no period change).
import { Profiler } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { SalesDailyRevenueRow } from '@/lib/db/reporting'
import { buildBranchTable, type MoneyPeriod, type MoneySort } from '@/lib/money-branch-table'
import { BranchTable } from './branch-table'

const LATEST = '2026-10-05'
function day(offset: number): string {
  const d = new Date(`${LATEST}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}
const ROWS: SalesDailyRevenueRow[] = Array.from({ length: 14 }, (_, i) => [
  ['alpha', 'Alpha', 2_000_000 + i], ['beta', 'Beta', 1_000_000 + 3 * i],
].map(([code, name, amount]) => ({
  revenue_date: day(i), channel: 'POS', esb_code: 'X', branch_code: code as string, branch_name: name as string,
  branch_id: null, transactions: 1, clean_revenue: amount as number, snapshot_as_of: '2026-10-05T19:05:00Z',
  source_contract_version: 'v1',
}))).flat()

function Harness({ period, sort, onCommit }: { period: MoneyPeriod; sort: MoneySort; onCommit: () => void }) {
  return (
    <I18nProvider initialLocale="en">
      <MemoryRouter>
        <Profiler id="table" onRender={onCommit}>
          <BranchTable data={buildBranchTable(ROWS, null, 30)!} period={period} sort={sort} onSortChange={() => {}} />
        </Profiler>
      </MemoryRouter>
    </I18nProvider>
  )
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('BranchTable — re-render after a change from outside', () => {
  it('a new period or sort settles in a few commits, with the sort it was given', async () => {
    let commits = 0
    const onCommit = () => { commits += 1 }
    const sort: MoneySort = { column: 'vs-weekday', desc: true }
    const { rerender } = render(<Harness period={30} sort={sort} onCommit={onCommit} />)
    await settle()
    commits = 0
    rerender(<Harness period={7} sort={{ ...sort }} onCommit={onCommit} />)
    await settle()
    expect(commits).toBeLessThanOrEqual(2)
    expect(screen.getByRole('columnheader', { name: /^vs same day last week/ })).toHaveAttribute('aria-sort', 'descending')
  })
})

describe('BranchTable — one term for recipe coverage (#1453)', () => {
  const margin = ROWS.filter((r) => r.branch_code === 'alpha').map((r) => ({
    margin_date: r.revenue_date, esb_code: 'X', branch_code: 'alpha', branch_name: 'Alpha', branch_id: null,
    revenue: r.clean_revenue, cogs_interim_sm: 700_000, cogs_budget_bom: 650_000, margin_interim: r.clean_revenue - 700_000,
    bom_coverage_pct: 90, snapshot_as_of: r.snapshot_as_of, source_contract_version: 'v1',
  }))
  it.each([['en', 'Recipe coverage'], ['id', 'Cakupan resep']] as const)('the phone company line uses the column header term (%s)', (locale, term) => {
    const { container } = render(
      <I18nProvider initialLocale={locale}>
        <MemoryRouter>
          <BranchTable data={buildBranchTable(ROWS, margin, 30)!} period={30} sort={{ column: 'revenue', desc: true }} onSortChange={() => {}} />
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(screen.getByRole('columnheader', { name: new RegExp(`^${term}`) })).toBeInTheDocument()
    expect(container.querySelector('.money-table__company-margin')?.textContent?.toLowerCase()).toContain(term.toLowerCase())
    expect(container.querySelector('.money-table__cell--coverage .money-table__cell-value')?.textContent).toBe('90%')
  })
})
