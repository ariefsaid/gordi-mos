// MoneyPage — /money is one branch table. Two gates meet here:
//   READ — which roles reach the route is router.tsx's (router.test.tsx).
//   COST — whether a viewer inside that read RECEIVES margin is this page's: below the margin tier
//          the margin query is never issued, so no hidden figure reaches the browser.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/lib/db/reporting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting')>('@/lib/db/reporting')
  return { ...actual, listSalesDailyRevenue: vi.fn() }
})
vi.mock('@/lib/db/reporting-margin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting-margin')>('@/lib/db/reporting-margin')
  return { ...actual, listSalesMarginDaily: vi.fn() }
})
vi.mock('@/auth/use-auth')
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'
import { listSalesMarginDaily, type SalesMarginDailyRow } from '@/lib/db/reporting-margin'
import { useAuth } from '@/auth/use-auth'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ReportingRowCapError } from '@/lib/db/reporting-shared'
import { MoneyPage } from './money-page'

const mockRev = vi.mocked(listSalesDailyRevenue)
const mockMarg = vi.mocked(listSalesMarginDaily)
const mockUseAuth = vi.mocked(useAuth)

function authViewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'u-1', full_name: 'Test Person',
        email: 't@example.test', must_change_password: false, archived_at: null, created_at: '2026-01-01', updated_at: '2026-01-01',
      },
      roles: [],
      isManager: false,
      accessRoles,
      affiliated: [],
    },
    signOut: vi.fn(),
  }
}

// 14 days to Mon 5 Oct 2026. Gordi HQ sells more than Cikal; B2B invoices once.
const LATEST = '2026-10-05'
function day(offset: number): string {
  const d = new Date(`${LATEST}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}
const SYNCED = new Date(Date.now() - 2 * 3600_000).toISOString()
function rev(date: string, code: string, name: string, amount: number, channel = 'POS', snapshot = SYNCED): SalesDailyRevenueRow {
  return {
    revenue_date: date, channel, esb_code: 'X', branch_code: code, branch_name: name, branch_id: null,
    transactions: 10, clean_revenue: amount, snapshot_as_of: snapshot, source_contract_version: 'v1',
  }
}
function revenue(codes = ['gordi_hq', 'cikal'], snapshot = SYNCED): SalesDailyRevenueRow[] {
  const rows: SalesDailyRevenueRow[] = []
  for (let i = 0; i < 14; i++) {
    if (codes.includes('gordi_hq')) rows.push(rev(day(i), 'gordi_hq', 'Gordi HQ', 20_000_000, 'POS', snapshot))
    if (codes.includes('cikal')) rows.push(rev(day(i), 'cikal', 'Cikal', 15_000_000, 'POS', snapshot))
  }
  if (codes.includes('roastery')) rows.push(rev(day(0), 'roastery', 'Gordi Roastery', 40_000_000, 'B2B', snapshot))
  return rows
}
function margin(): SalesMarginDailyRow[] {
  return Array.from({ length: 14 }, (_, i) => ({
    margin_date: day(i), esb_code: 'X', branch_code: 'gordi_hq', branch_name: 'Gordi HQ', branch_id: null,
    revenue: 20_000_000, cogs_interim_sm: 7_000_000, cogs_budget_bom: 6_800_000, margin_interim: 13_000_000,
    bom_coverage_pct: 0.9, snapshot_as_of: SYNCED, source_contract_version: 'v1',
  }))
}

function Where() {
  const location = useLocation()
  return <output data-testid="where">{location.pathname + location.search}</output>
}
function BranchStandIn() {
  return <p>branch {useParams().code}</p>
}
function renderMoney(accessRoles: string[], path = '/money', locale: 'en' | 'id' = 'en') {
  mockUseAuth.mockReturnValue(authViewer(accessRoles))
  return render(
    <I18nProvider initialLocale={locale}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/money" element={<MoneyPage />} />
          <Route path="/money/branch/:code" element={<BranchStandIn />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </I18nProvider>,
  )
}
const where = () => screen.getByTestId('where').textContent
const table = () => screen.getByRole('table')
const bodyRowNames = () => within(table()).getAllByRole('rowheader').map((c) => c.querySelector('a, .money-table__name')?.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  mockRev.mockResolvedValue(revenue(['gordi_hq', 'cikal', 'roastery']))
  mockMarg.mockResolvedValue(margin())
})

describe('MoneyPage — what each tier receives', () => {
  it('a supervisor never issues the margin query, and no margin column or note is drawn', async () => {
    renderMoney(['supervisor'])
    await screen.findByRole('table')
    expect(mockRev).toHaveBeenCalledWith({ sinceDays: 120 })
    expect(mockMarg).not.toHaveBeenCalled()
    const headers = within(table()).getAllByRole('columnheader').map((h) => h.textContent!.replace(/[↑↓]/g, ''))
    expect(headers).toEqual(['Branch', 'Revenue', 'vs previous period', 'Latest day', 'vs same day last week', 'Trend'])
    expect(screen.queryByText(/margin|COGS|recipe/i)).toBeNull()
  })

  it('finance reads both read-models over 120 days and sees the margin columns and the basis note', async () => {
    renderMoney(['finance'])
    await screen.findByRole('table')
    expect(mockMarg).toHaveBeenCalledWith({ sinceDays: 120 })
    const headers = within(table()).getAllByRole('columnheader').map((h) => h.textContent!.replace(/[↑↓]/g, ''))
    expect(headers.slice(5)).toEqual(['Margin % (interim)', 'COGS vs budget', 'Recipe vs stock cost', 'Trend'])
    expect(screen.getByText('Margin is interim: from stock movement, not yet reconciled.')).toBeInTheDocument()
    expect(screen.getByText('Margin covers POS branches only.')).toBeInTheDocument()
  })

  it('shows the recipe-budget marker in the COGS KPI bullet', async () => {
    renderMoney(['finance'])
    const tile = await screen.findByRole('group', { name: 'COGS vs budget' })
    const meter = within(tile).getByRole('meter')
    expect(meter).toHaveAttribute('aria-valuenow', '35')
    expect(meter.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  it('uses proportional figures for Money KPIs', async () => {
    renderMoney(['finance'])
    await screen.findByRole('table')
    const values = Array.from(document.querySelectorAll('.money-overview__kpis .kpi-tile-value'))
    expect(values).toHaveLength(4)
    expect(values.every((value) => !value.classList.contains('tabular'))).toBe(true)
  })

  it('a supervisor granted one branch lands on that branch', async () => {
    mockRev.mockResolvedValue(revenue(['cikal']))
    renderMoney(['supervisor'], '/money?period=7')
    await waitFor(() => expect(where()).toBe('/money/branch/cikal?period=7'))
  })
})

describe('MoneyPage — the table', () => {
  it('the company row comes first, then branches by revenue, then B2B in its own group', async () => {
    renderMoney(['manager'])
    await screen.findByRole('table')
    expect(bodyRowNames()).toEqual(['Company', 'Gordi HQ', 'Cikal', 'B2B (invoices)'])
    const groups = within(table()).getAllByRole('rowgroup')
    expect(within(groups.at(-1)!).getByText('B2B (invoices)')).toBeInTheDocument()
  })

  it('every branch name is a link to its Branch page carrying the period, and the company row is not', async () => {
    renderMoney(['manager'], '/money?period=7')
    await screen.findByRole('table')
    expect(screen.getByRole('link', { name: 'Gordi HQ' })).toHaveAttribute('href', '/money/branch/gordi_hq?period=7')
    expect(screen.getByRole('link', { name: 'B2B (invoices)' })).toHaveAttribute('href', '/money/branch/roastery?period=7')
    expect(screen.queryByRole('link', { name: 'Company' })).toBeNull()
  })

  it('clicking anywhere on a branch row opens that branch', async () => {
    renderMoney(['manager'])
    const cikal = await screen.findByRole('link', { name: 'Cikal' })
    fireEvent.click(within(cikal.closest('tr')!).getAllByRole('cell')[0])
    await waitFor(() => expect(where()).toBe('/money/branch/cikal?period=30'))
  })

  it('figures use tabular digits and id-ID formats', async () => {
    renderMoney(['manager'])
    const hq = (await screen.findByRole('link', { name: 'Gordi HQ' })).closest('tr')!
    // 30-day period, 14 days received: 14 × 20,0 jt.
    const revenueCell = within(hq).getByText('Rp 280 jt')
    expect(revenueCell.closest('.tabular')).not.toBeNull()
    // (20,0 − 7,0) / 20,0 = 65%; (7,0 − 6,8) / 20,0 = 1 point over budget.
    expect(within(hq).getByText('65,0%')).toBeInTheDocument()
    expect(within(hq).getByText('+1,0 pts')).toBeInTheDocument()
  })
})

describe('MoneyPage — period and sort live in the URL', () => {
  it('choosing a period writes it to the URL and marks the choice pressed', async () => {
    renderMoney(['manager'])
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => expect(where()).toBe('/money?period=7&sort=revenue.desc'))
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a header sorts the branches and writes the sort to the URL', async () => {
    renderMoney(['manager'])
    await screen.findByRole('table')
    fireEvent.click(within(screen.getByRole('columnheader', { name: /^Revenue/ })).getByRole('button'))
    await waitFor(() => expect(where()).toBe('/money?period=30&sort=revenue.asc'))
    expect(bodyRowNames()).toEqual(['Company', 'Cikal', 'Gordi HQ', 'B2B (invoices)'])
    expect(screen.getByRole('columnheader', { name: /^Revenue/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('choosing a period after sorting keeps the sort', async () => {
    renderMoney(['manager'])
    await screen.findByRole('table')
    fireEvent.click(within(screen.getByRole('columnheader', { name: /^Latest day/ })).getByRole('button'))
    await waitFor(() => expect(where()).toBe('/money?period=30&sort=latest-day.desc'))
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => expect(where()).toBe('/money?period=7&sort=latest-day.desc'))
    expect(screen.getByRole('columnheader', { name: /^Latest day/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('a reloaded link restores the period and the sort it was shared with', async () => {
    renderMoney(['manager'], '/money?period=60&sort=branch.asc')
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: '60 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('columnheader', { name: /^Branch/ })).toHaveAttribute('aria-sort', 'ascending')
    expect(bodyRowNames()).toEqual(['Company', 'Cikal', 'Gordi HQ', 'B2B (invoices)'])
  })

  it('a period change re-draws from rows already held instead of reading again', async () => {
    renderMoney(['manager'])
    await screen.findByRole('table')
    fireEvent.click(screen.getByRole('button', { name: '7 days' }))
    await waitFor(() => expect(where()).toContain('period=7'))
    expect(mockRev).toHaveBeenCalledTimes(1)
  })
})

describe('MoneyPage — states in text', () => {
  it('loading shows a busy table-shaped skeleton with the period control disabled', () => {
    mockRev.mockReturnValue(new Promise(() => {}))
    renderMoney(['manager'])
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7 days' })).toBeDisabled()
  })

  it('empty says when the sync runs and who to tell, and Check again reads again', async () => {
    mockRev.mockResolvedValue([])
    renderMoney(['manager'])
    expect(await screen.findByText('No sales have been received yet')).toBeInTheDocument()
    expect(screen.getByText(/nightly sync runs at 02:00/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(mockRev).toHaveBeenCalledTimes(2))
  })

  it('an error names the cause once, beside one Try again', async () => {
    mockRev.mockRejectedValue(new Error('boom'))
    renderMoney(['manager'])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Sales figures could not be loaded: the reporting service did not answer.')
    expect(within(alert).getAllByRole('button')).toHaveLength(1)
  })

  it('a failed margin read keeps the revenue table and says only margin failed', async () => {
    mockMarg.mockRejectedValueOnce(new Error('down'))
    renderMoney(['finance'])
    await screen.findByRole('table')
    expect(screen.getByRole('alert')).toHaveTextContent('Margin figures could not be loaded')
  })

  it('more rows than one read may hold says so, instead of blaming the reporting service', async () => {
    mockRev.mockRejectedValue(new ReportingRowCapError('listSalesDailyRevenue needs more than 20000 rows'))
    renderMoney(['manager'])
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('There are more sales rows than Money can read at once. Tell the admin.')
    expect(alert).not.toHaveTextContent('did not answer')
    // Reading again returns the same rows: no Try again that cannot succeed (#1453).
    expect(within(alert).queryByRole('button')).toBeNull()
  })

  it('a slow earlier read that lands after a newer one does not replace the newer figures', async () => {
    let finishFirst: (rows: SalesDailyRevenueRow[]) => void = () => {}
    mockRev.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve }))
    mockRev.mockResolvedValueOnce(revenue(['gordi_hq', 'cikal', 'roastery']))
    renderMoney(['manager'])
    // The viewer comes back to the tab while the first read is still out: a second read starts.
    document.dispatchEvent(new Event('visibilitychange'))
    await screen.findByRole('table')
    expect(screen.getByText('B2B (invoices)')).toBeInTheDocument()
    finishFirst(revenue(['gordi_hq']))
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByText('B2B (invoices)')).toBeInTheDocument()
    expect(screen.getByText('Cikal')).toBeInTheDocument()
  })

  it('a failed background refresh keeps the figures already on screen and says so', async () => {
    renderMoney(['manager'])
    await screen.findByRole('table')
    mockRev.mockRejectedValueOnce(new Error('boom'))
    // Coming back to the tab reads again, so a page left open overnight picks up the sync.
    document.dispatchEvent(new Event('visibilitychange'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Showing the figures loaded earlier. The refresh failed: the reporting service did not answer.')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Gordi HQ' })).toBeInTheDocument()
  })

  it('the freshness sentence names the last day of sales and the sync, and says "last synced" when stale', async () => {
    mockRev.mockResolvedValue(revenue(['gordi_hq', 'cikal'], '2026-09-01T19:05:00Z'))
    renderMoney(['finance'])
    expect(await screen.findByText(/^Sales through Mon 5 Oct · last synced/)).toBeInTheDocument()
  })

  it('a latest day a branch has not sent reads "not received", and the company row counts it', async () => {
    mockRev.mockResolvedValue(revenue(['gordi_hq', 'cikal']).filter((r) => !(r.branch_code === 'cikal' && r.revenue_date === LATEST)))
    renderMoney(['supervisor'])
    const cikal = (await screen.findByRole('link', { name: 'Cikal' })).closest('tr')!
    expect(within(cikal).getByText('not received')).toBeInTheDocument()
    expect(screen.getByText('1 branch missing the latest day')).toBeInTheDocument()
  })

  it('every string follows the viewer\'s language', async () => {
    renderMoney(['finance'], '/money', 'id')
    await screen.findByRole('table')
    expect(screen.getByRole('button', { name: '7 hari' })).toBeInTheDocument()
    expect(bodyRowNames()[0]).toBe('Perusahaan')
    expect(screen.getByText('Margin hanya mencakup cabang POS.')).toBeInTheDocument()
  })
})
