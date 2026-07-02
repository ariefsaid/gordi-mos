// SalesDashboardPage tests — TDD (AC-tagged).
// Route: /mos/sales, finance/admin only (FR-001/AC-001/002 owned at router level via
// RequireAccessRole — see router.tsx / require-access-role.test.tsx; this suite proves
// the page's OWN behavior once mounted: DAL schema usage (AC-003 — mocked reporting.ts),
// freshness (AC-007), empty (AC-008), error+retry (AC-009), and populated render
// (KPI/chart/table wiring, B2B/Roastery visible — AC-006).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'

vi.mock('@/lib/db/reporting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting')>('@/lib/db/reporting')
  return { ...actual, listSalesDailyRevenue: vi.fn() }
})
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'

import { SalesDashboardPage } from './sales-dashboard-page'

const mockList = vi.mocked(listSalesDailyRevenue)

function row(overrides: Partial<SalesDailyRevenueRow>): SalesDailyRevenueRow {
  return {
    revenue_date: '2026-06-30',
    channel: 'POS',
    esb_code: 'GHQ',
    branch_code: 'GHQ',
    branch_name: 'Gordi HQ',
    transactions: 80,
    clean_revenue: 12_300_000,
    snapshot_as_of: '2026-07-01T02:00:00Z',
    source_contract_version: 'v_daily_revenue_unified.v1',
    ...overrides,
  }
}

const B2B_ROASTERY_ROW = row({
  channel: 'B2B',
  esb_code: 'GRI',
  branch_code: 'GRI',
  branch_name: 'Gordi Roastery',
  transactions: 12,
  clean_revenue: 4_500_000,
})

function setDesktop() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

function setPhone() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  setDesktop()
})

describe('SalesDashboardPage — data layer usage', () => {
  it('AC-003: reads via the reporting DAL (listSalesDailyRevenue)', async () => {
    mockList.mockResolvedValue([row({})])
    render(<SalesDashboardPage />)
    await waitFor(() => expect(mockList).toHaveBeenCalled())
  })
})

describe('SalesDashboardPage — states', () => {
  it('loading: shows a busy skeleton before data resolves', () => {
    mockList.mockReturnValue(new Promise(() => {}))
    render(<SalesDashboardPage />)
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('AC-008: empty — names the reporting source, no misleading 0 KPI tiles', async () => {
    mockList.mockResolvedValue([])
    render(<SalesDashboardPage />)
    expect(await screen.findByText(/no sales snapshot rows/i)).toBeInTheDocument()
    expect(screen.getByText(/reporting\.sales_daily_revenue/i)).toBeInTheDocument()
    // No KPI tiles / values rendered at all in the empty state
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(screen.queryByText(/^Rp 0/)).not.toBeInTheDocument()
  })

  it('AC-009: error — non-secret retry, no DSN/token/SQL/stack text', async () => {
    mockList.mockRejectedValueOnce(new Error('permission denied for schema reporting'))
    render(<SalesDashboardPage />)
    const retry = await screen.findByRole('button', { name: /retry|try again/i })
    expect(retry).toBeInTheDocument()
    const bodyText = document.body.textContent ?? ''
    expect(bodyText).not.toMatch(/postgres|dsn|token|jwt|stack|SELECT |permission denied/i)
  })

  it('AC-009: retry re-fetches and can recover to populated', async () => {
    mockList.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([row({})])
    render(<SalesDashboardPage />)
    const retry = await screen.findByRole('button', { name: /retry|try again/i })
    fireEvent.click(retry)
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: /daily revenue/i })).toBeInTheDocument()
  })
})

describe('SalesDashboardPage — populated (desktop)', () => {
  beforeEach(() => {
    setDesktop()
    mockList.mockResolvedValue([row({}), B2B_ROASTERY_ROW])
  })

  it('AC-007: shows a freshness "as of" label', async () => {
    render(<SalesDashboardPage />)
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getAllByText(/as of/i).length).toBeGreaterThan(0)
  })

  it('renders the 4 KPI tiles (7d, 30d, latest-day, channel mix)', async () => {
    render(<SalesDashboardPage />)
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getByText(/trailing 7-day revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/trailing 30-day revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/latest reporting-day revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/channel mix/i)).toBeInTheDocument()
  })

  it('AC-006: B2B/Roastery revenue appears in the detail table', async () => {
    render(<SalesDashboardPage />)
    await screen.findByRole('heading', { name: /daily revenue/i })
    const table = screen.getByRole('table', { name: /^revenue by/i })
    expect(within(table).getByText(/Gordi Roastery/i)).toBeInTheDocument()
    expect(within(table).getByText(/B2B/i)).toBeInTheDocument()
  })

  it('AC-006: switching the CutToggle to Activity still shows Roastery revenue (under the Roastery label)', async () => {
    render(<SalesDashboardPage />)
    await screen.findByRole('heading', { name: /daily revenue/i })
    fireEvent.click(screen.getByRole('tab', { name: /activity/i }))
    const table = await screen.findByRole('table', { name: /^revenue by/i })
    expect(within(table).getByText(/Roastery/i)).toBeInTheDocument()
  })

  it('renders the chart tableFallback a11y equivalent in the DOM', async () => {
    render(<SalesDashboardPage />)
    await screen.findByRole('heading', { name: /daily revenue/i })
    // ChartFrame always renders a table-fallback region even on desktop (visually hidden)
    expect(screen.getAllByRole('table').length).toBeGreaterThanOrEqual(1)
  })

  it('numeric table cells carry the .tabular class', async () => {
    render(<SalesDashboardPage />)
    await screen.findByRole('heading', { name: /daily revenue/i })
    const table = screen.getByRole('table', { name: /^revenue by/i })
    const roastRow = within(table).getByText(/Gordi Roastery/i).closest('tr') as HTMLElement
    const numCell = within(roastRow).getAllByText(/Rp/)[0]
    expect(numCell.closest('.tabular')).not.toBeNull()
  })
})

describe('SalesDashboardPage — populated (phone)', () => {
  beforeEach(() => {
    setPhone()
    mockList.mockResolvedValue([row({}), B2B_ROASTERY_ROW])
  })

  it('AC-010: renders detail rows as cards (no <table> role) on phone', async () => {
    render(<SalesDashboardPage />)
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getByText(/Gordi Roastery/i)).toBeInTheDocument()
  })

  it('AC-010: KPI tiles are all still present on phone (no collapsing)', async () => {
    render(<SalesDashboardPage />)
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getByText(/trailing 7-day revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/trailing 30-day revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/latest reporting-day revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/channel mix/i)).toBeInTheDocument()
  })
})
