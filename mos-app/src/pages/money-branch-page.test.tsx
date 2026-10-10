// MoneyBranchPage — /money/branch/:code. Same two gates as /money: below the margin tier the margin
// query is never issued and margin, uncovered items and the ask are absent. The ask sends only the
// view (code, period, chosen day); the function builds the Task's text.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/lib/db/reporting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting')>('@/lib/db/reporting')
  return { ...actual, listSalesDailyRevenue: vi.fn() }
})
vi.mock('@/lib/db/reporting-margin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting-margin')>('@/lib/db/reporting-margin')
  return { ...actual, listSalesMarginDaily: vi.fn() }
})
vi.mock('@/lib/db/money-branch', () => ({ listUncoveredCafeItems: vi.fn(), askBranchLead: vi.fn() }))
vi.mock('@/auth/use-auth')
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'
import { listSalesMarginDaily, type SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { askBranchLead, listUncoveredCafeItems } from '@/lib/db/money-branch'
import { useAuth } from '@/auth/use-auth'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ReportingRowCapError } from '@/lib/db/reporting-shared'
import { MoneyBranchPage } from './money-branch-page'

const mockRev = vi.mocked(listSalesDailyRevenue)
const mockMarg = vi.mocked(listSalesMarginDaily)
const mockUncovered = vi.mocked(listUncoveredCafeItems)
const mockAsk = vi.mocked(askBranchLead)
const mockUseAuth = vi.mocked(useAuth)

function authViewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'u-1', full_name: 'Test Person',
        email: 't@example.test', must_change_password: false, archived_at: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      },
      roles: [], isManager: false, accessRoles, affiliated: [],
    },
    signOut: vi.fn(),
  }
}

const LATEST = '2026-10-05'
function day(offset: number): string {
  const d = new Date(`${LATEST}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}
const SYNCED = new Date(Date.now() - 2 * 3600_000).toISOString()
function rev(date: string, code: string, name: string, amount: number): SalesDailyRevenueRow {
  return {
    revenue_date: date, channel: 'POS', esb_code: code, branch_code: code, branch_name: name, branch_id: code === 'GHQ' ? 'b-ghq' : null,
    transactions: 10, clean_revenue: amount, snapshot_as_of: SYNCED, source_contract_version: 'v1',
  }
}
// GHQ: 14 200 000 on the latest day, 18 900 000 on the same weekday a week earlier.
const REVENUE: SalesDailyRevenueRow[] = [
  ...Array.from({ length: 14 }, (_, i) => rev(day(i), 'GHQ', 'Gordi HQ', i === 0 ? 14_200_000 : i === 7 ? 18_900_000 : 15_000_000 + i * 100_000)),
  ...Array.from({ length: 14 }, (_, i) => rev(day(i), 'CKL', 'Cikal', 5_000_000)),
]
const MARGIN: SalesMarginDailyRow[] = Array.from({ length: 14 }, (_, i) => ({
  margin_date: day(i), esb_code: 'GHQ', branch_code: 'GHQ', branch_name: 'Gordi HQ', branch_id: 'b-ghq',
  revenue: 10_000_000, cogs_interim_sm: 4_120_000, cogs_budget_bom: 3_400_000, margin_interim: 5_880_000,
  bom_coverage_pct: 0.8, snapshot_as_of: SYNCED, source_contract_version: 'v1',
}))

function Where() {
  const location = useLocation()
  return <output data-testid="where">{location.pathname + location.search}</output>
}
function renderBranch(accessRoles: string[], path = '/money/branch/GHQ?period=7', locale: 'en' | 'id' = 'en') {
  mockUseAuth.mockReturnValue(authViewer(accessRoles))
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/money/branch/:code" element={<MoneyBranchPage />} />
          <Route path="*" element={<p>elsewhere</p>} />
        </Routes>
        <Where />
      </MemoryRouter>
    </I18nProvider>,
  )
}
const where = () => screen.getByTestId('where').textContent
const readout = () => screen.getByText(/· Rp|· not received/, { selector: '.money-chart__readout' })

beforeEach(() => {
  vi.clearAllMocks()
  mockRev.mockResolvedValue(REVENUE)
  mockMarg.mockResolvedValue(MARGIN)
  mockUncovered.mockResolvedValue([{ id: 'i-1', name: 'Cold brew base', activities: ['bar'] }])
  mockAsk.mockResolvedValue({ kind: 'created', taskId: 'task-9' })
})

describe('MoneyBranchPage — the day chart', () => {
  it('reads the latest day against the same weekday last week, and moves a day at a time by keyboard', async () => {
    renderBranch(['finance'])
    expect(await screen.findByRole('heading', { level: 1, name: 'Gordi HQ' })).toBeInTheDocument()
    expect(readout()).toHaveTextContent('Mon 5 Oct · Rp 14.200.000 · same day last week Rp 18.900.000 (−24,9%)')
    const chart = screen.getByRole('group', { name: 'Gordi HQ revenue per day' })
    chart.focus()
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    await waitFor(() => expect(where()).toBe(`/money/branch/GHQ?period=7&d=${day(3)}`))
    expect(readout()).toHaveTextContent(/^Fri 2 Oct · Rp 15\.300\.000/)
    fireEvent.keyDown(chart, { key: 'Home' })
    await waitFor(() => expect(where()).toContain(`d=${day(6)}`))
    fireEvent.keyDown(chart, { key: 'End' })
    await waitFor(() => expect(where()).toContain(`d=${LATEST}`))
    expect(chart).toHaveAttribute('aria-describedby')
  })

  it('a branch missing the latest day opens on its last received day; the missing day reads "not received", never zero', async () => {
    mockRev.mockResolvedValue(REVENUE.filter((r) => !(r.branch_code === 'GHQ' && r.revenue_date === LATEST)))
    renderBranch(['finance'])
    await screen.findByRole('heading', { level: 1, name: 'Gordi HQ' })
    expect(readout()).toHaveTextContent(/^Sun 4 Oct · Rp /)
    expect(screen.getByText(/Sales through Sun 4 Oct/)).toBeInTheDocument()
    expect(screen.getByText(/over 7 days · 1 day not received/)).toBeInTheDocument()
    const chart = screen.getByRole('group', { name: 'Gordi HQ revenue per day' })
    fireEvent.keyDown(chart, { key: 'End' })
    await waitFor(() => expect(readout()).toHaveTextContent('Mon 5 Oct · not received'))
  })

  it('held arrow keys move one day per press, before the URL catches up', async () => {
    renderBranch(['finance'])
    await screen.findByRole('heading', { level: 1, name: 'Gordi HQ' })
    const chart = screen.getByRole('group', { name: 'Gordi HQ revenue per day' })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    await waitFor(() => expect(where()).toBe(`/money/branch/GHQ?period=7&d=${day(3)}`))
  })

  it('the days are also a table, newest first', async () => {
    renderBranch(['finance'])
    const table = await screen.findByRole('table', { name: /Gordi HQ revenue per day, 7 days/ })
    const firstRow = within(table).getAllByRole('row')[1]
    expect(firstRow).toHaveTextContent('Mon 5 OctRp 14.200.000−24,9%Rp 18.900.000')
  })
})

describe('MoneyBranchPage — what each tier receives', () => {
  it('a supervisor never issues the margin query and gets no margin, uncovered items or ask', async () => {
    renderBranch(['supervisor'])
    await screen.findByRole('heading', { level: 1, name: 'Gordi HQ' })
    expect(mockMarg).not.toHaveBeenCalled()
    expect(mockUncovered).not.toHaveBeenCalled()
    expect(screen.queryByText(/margin|COGS|recipe/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /Ask/ })).toBeNull()
  })

  it('finance reads margin and COGS against budget for the period in the URL', async () => {
    renderBranch(['finance'])
    expect(await screen.findByRole('heading', { name: 'Margin, last 7 days' })).toBeInTheDocument()
    expect(screen.getByText('COGS 41,2% of revenue against a 34,0% budget: 7,2 points over.')).toBeInTheDocument()
    expect(screen.getByText('58,8%')).toBeInTheDocument()
    expect(screen.getByText('Recipe vs stock cost', { selector: 'dt' })).toBeInTheDocument()
  })

  it('COGS on its budget reads as on budget, not "0,0 points under"', async () => {
    mockMarg.mockResolvedValue(MARGIN.map((m) => ({ ...m, cogs_budget_bom: m.cogs_interim_sm })))
    renderBranch(['finance'])
    expect(await screen.findByText('COGS 41,2% of revenue, on its 41,2% budget.')).toBeInTheDocument()
  })

  it('each Café item without a recipe opens Café items on that item and stream', async () => {
    renderBranch(['manager'])
    const link = await screen.findByRole('link', { name: 'Cold brew base' })
    expect(mockUncovered).toHaveBeenCalledWith('b-ghq')
    expect(link).toHaveAttribute('href', '/cafe/items?q=Cold+brew+base&stream=b-ghq%7Cbar')
  })

  it('an ESB branch not linked to a MOS branch says why no Café items are listed', async () => {
    renderBranch(['finance'], '/money/branch/CKL?period=7')
    expect(await screen.findByText(/not linked to a MOS branch/)).toBeInTheDocument()
    expect(mockUncovered).not.toHaveBeenCalled()
  })
})

describe('MoneyBranchPage — Ask branch lead', () => {
  it('asks about the chosen day of this view and links to the created Task', async () => {
    const user = userEvent.setup()
    renderBranch(['finance'], `/money/branch/GHQ?period=7&d=${day(2)}`)
    await user.click(await screen.findByRole('button', { name: 'Ask Gordi HQ lead about Sat 3 Oct' }))
    expect(mockAsk).toHaveBeenCalledWith({ code: 'GHQ', period: 7, day: day(2), locale: 'en' })
    const status = (await screen.findByText(/Task created for the Gordi HQ lead about Sat 3 Oct\./)).closest('[role="status"]') as HTMLElement
    expect(status).not.toBeNull()
    // The answer takes focus, so a keyboard user lands next to the Task link.
    expect(status.parentElement).toHaveFocus()
    expect(within(status).getByRole('link', { name: 'Open the Task' })).toHaveAttribute('href', '/work/tasks/task-9')
  })

  it('no lead is said plainly, not as a failure', async () => {
    mockAsk.mockResolvedValue({ kind: 'no-lead' })
    const user = userEvent.setup()
    renderBranch(['manager'])
    await user.click(await screen.findByRole('button', { name: /^Ask Gordi HQ lead/ }))
    expect((await screen.findByText(/Gordi HQ has no Café Team lead in MOS\./)).closest('[role="status"]')).not.toBeNull()
  })

  it('a failure says so and the Ask button asks again', async () => {
    mockAsk.mockRejectedValueOnce(new Error('down'))
    const user = userEvent.setup()
    renderBranch(['finance'])
    const ask = await screen.findByRole('button', { name: /^Ask Gordi HQ lead/ })
    await user.click(ask)
    expect(await screen.findByRole('alert')).toHaveTextContent('The Task could not be created.')
    await user.click(ask)
    expect(await screen.findByText(/Task created/)).toBeInTheDocument()
  })

  it('a change of day clears the answer about the previous one', async () => {
    const user = userEvent.setup()
    renderBranch(['finance'])
    await user.click(await screen.findByRole('button', { name: /^Ask Gordi HQ lead/ }))
    await screen.findByText(/Task created/)
    fireEvent.keyDown(screen.getByRole('group', { name: 'Gordi HQ revenue per day' }), { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.queryByText(/Task created/)).toBeNull())
  })

  it('an ESB code not linked to a MOS branch gets no Ask', async () => {
    renderBranch(['finance'], '/money/branch/CKL?period=7')
    await screen.findByRole('heading', { level: 1, name: 'Cikal' })
    expect(screen.queryByRole('button', { name: /^Ask/ })).toBeNull()
  })
})

describe('MoneyBranchPage — states', () => {
  it('a failed margin read keeps the revenue and says only margin failed', async () => {
    mockMarg.mockRejectedValueOnce(new Error('down'))
    const user = userEvent.setup()
    renderBranch(['finance'])
    expect(await screen.findByRole('heading', { level: 1, name: 'Gordi HQ' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Gordi HQ revenue per day' })).toBeInTheDocument()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Margin figures could not be loaded')
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Margin, last 7 days' })).toBeInTheDocument()
  })

  it('too many rows names the next step and offers no Try again', async () => {
    mockRev.mockRejectedValue(new ReportingRowCapError('too many'))
    renderBranch(['finance'])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Tell the admin.')
    expect(within(alert).queryByRole('button')).toBeNull()
  })

  it('an unknown branch says nothing has been received for it, with a way back to Money', async () => {
    renderBranch(['finance'], '/money/branch/NOPE?period=30')
    expect(await screen.findByText('No sales for this branch')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Money/ })).toHaveAttribute('href', '/money?period=30')
  })

  it('a supervisor who sees one branch has no link back to a table that would send them here again', async () => {
    mockRev.mockResolvedValue(REVENUE.filter((r) => r.branch_code === 'GHQ'))
    renderBranch(['supervisor'])
    await screen.findByRole('heading', { level: 1, name: 'Gordi HQ' })
    expect(screen.queryByRole('link', { name: /Money/ })).toBeNull()
  })

  it('the period control changes the period in the URL and keeps the chosen day', async () => {
    const user = userEvent.setup()
    renderBranch(['finance'], `/money/branch/GHQ?period=7&d=${day(1)}`)
    await user.click(await screen.findByRole('button', { name: '30 days' }))
    expect(where()).toBe(`/money/branch/GHQ?period=30&d=${day(1)}`)
  })

  it('Indonesian', async () => {
    renderBranch(['finance'], '/money/branch/GHQ?period=7', 'id')
    expect(await screen.findByRole('button', { name: /^Tanya kepala Gordi HQ soal / })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Margin, 7 hari terakhir' })).toBeInTheDocument()
  })
})
