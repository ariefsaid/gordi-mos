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
