// DashboardPage tests — TDD (AC-tagged). The /dashboard composition (Variant B Tabs).
// Proves the page's OWN behavior once mounted: reads BOTH reporting tables (AC-004),
// freshness (AC-020), empty (AC-021), error+retry (AC-023), loading skeleton (AC-022),
// populated render (revenue + GM basis-labelled KPIs, channel-mix string, detail table
// columns, "What's coming" strip, filter-in-place, tab persistence).
// Route-gate (AC-001/002/003) is owned by router.tsx + RequireAccessRole (separate suite).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/db/reporting', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/reporting')>('@/lib/db/reporting')
  return { ...actual, listSalesDailyRevenue: vi.fn() }
})
vi.mock('@/lib/db/reporting-margin', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/db/reporting-margin')>('@/lib/db/reporting-margin')
  return { ...actual, listSalesMarginDaily: vi.fn() }
})
import { listSalesDailyRevenue, type SalesDailyRevenueRow } from '@/lib/db/reporting'
import { listSalesMarginDaily, type SalesMarginDailyRow } from '@/lib/db/reporting-margin'

import { DashboardPage } from './dashboard-page'

const mockRev = vi.mocked(listSalesDailyRevenue)
const mockMarg = vi.mocked(listSalesMarginDaily)

// ── Fixtures (mirror dashboard.test.ts — 60 days, POS + B2B, latest 2026-06-30) ─────
const LATEST = '2026-06-30'
function isoDaysFrom(dateIso: string, delta: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

function revRow(date: string, channel: 'POS' | 'B2B', branchCode: string, branchName: string, revenue: number, txn = 100): SalesDailyRevenueRow {
  return {
    revenue_date: date,
    channel,
    esb_code: channel === 'B2B' ? 'GRI' : 'GKID',
    branch_code: branchCode,
    branch_name: branchName,
    transactions: txn,
    clean_revenue: revenue,
    snapshot_as_of: '2026-07-01T03:14:00Z',
    source_contract_version: 'v1',
  }
}

function sixtyDaysRevenue(): SalesDailyRevenueRow[] {
  const rows: SalesDailyRevenueRow[] = []
  for (let i = 59; i >= 0; i--) {
    const d = isoDaysFrom(LATEST, -i)
    rows.push(revRow(d, 'POS', 'GHQ', 'Gordi HQ', 10_000_000, 200))
    rows.push(revRow(d, 'B2B', 'GRI', 'Gordi Roastery', 5_000_000, 10))
  }
  return rows
}

function margRow(date: string, coverage = 0.95): SalesMarginDailyRow {
  return {
    margin_date: date,
    esb_code: 'GKID',
    branch_code: 'GHQ',
    branch_name: 'Gordi HQ',
    revenue: 10_000_000,
    cogs_interim_sm: 6_000_000,
    cogs_budget_bom: 5_500_000,
    margin_interim: 4_000_000,
    margin_interim_pct: 0.4,
    bom_coverage_pct: coverage,
    snapshot_as_of: '2026-07-01T03:14:00Z',
    source_contract_version: 'pos_margin_interim.v1',
  }
}

function sixtyDaysMargin(coverage = 0.95): SalesMarginDailyRow[] {
  const rows: SalesMarginDailyRow[] = []
  for (let i = 59; i >= 0; i--) rows.push(margRow(isoDaysFrom(LATEST, -i), coverage))
  return rows
}

function setDesktop() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true, configurable: true,
    value: (query: string) => ({
      matches: query === '(min-width: 768px)', media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}
function setPhone() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true, configurable: true,
    value: () => ({
      matches: false, media: '', onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
    }),
  })
}

function renderPage(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setDesktop()
})

describe('DashboardPage — data layer usage', () => {
  it('AC-004: reads via BOTH reporting DALs (revenue + margin) with sinceDays:60', async () => {
    mockRev.mockResolvedValue(sixtyDaysRevenue())
    mockMarg.mockResolvedValue(sixtyDaysMargin())
    renderPage()
    await waitFor(() => expect(mockRev).toHaveBeenCalledWith({ sinceDays: 60 }))
    await waitFor(() => expect(mockMarg).toHaveBeenCalledWith({ sinceDays: 60 }))
  })
})

describe('DashboardPage — states', () => {
  it('AC-022: loading — shows a busy skeleton before data resolves', () => {
    mockRev.mockReturnValue(new Promise(() => {}))
    mockMarg.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('AC-021: empty — names the snapshot source, no KPI tiles, no zero-revenue KPI', async () => {
    mockRev.mockResolvedValue([])
    mockMarg.mockResolvedValue([])
    renderPage()
    expect(await screen.findByRole('heading', { name: /no sales snapshot/i })).toBeInTheDocument()
    expect(screen.getByText(/no sales snapshot rows are available/i)).toBeInTheDocument()
    // No KPI tile values rendered.
    expect(screen.queryAllByRole('group', { name: /revenue/i })).toHaveLength(0)
    expect(screen.queryByText(/^Rp 0/)).not.toBeInTheDocument()
  })

  it('money-3: the empty state carries the dash-empty-fill scoping class so it centers within the full remaining viewport at ≥1280px instead of a stranded fixed-height block', async () => {
    mockRev.mockResolvedValue([])
    mockMarg.mockResolvedValue([])
    renderPage()
    const heading = await screen.findByRole('heading', { name: /no sales snapshot/i })
    expect(heading.closest('[data-testid="empty-state"]')).toHaveClass('dash-empty-fill')
  })

  it('AC-023: error — non-secret retry, no DSN/token/SQL/stack text', async () => {
    mockRev.mockRejectedValueOnce(new Error('permission denied for schema reporting'))
    mockMarg.mockResolvedValue([])
    renderPage()
    const retry = await screen.findByRole('button', { name: /retry|try again/i })
    expect(retry).toBeInTheDocument()
    const bodyText = document.body.textContent ?? ''
    expect(bodyText).not.toMatch(/postgres|dsn|token|jwt|stack|SELECT |permission denied/i)
  })

  it('AC-023: retry re-fetches and can recover to populated', async () => {
    mockRev.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(sixtyDaysRevenue())
    mockMarg.mockResolvedValue(sixtyDaysMargin())
    renderPage()
    const retry = await screen.findByRole('button', { name: /retry|try again/i })
    fireEvent.click(retry)
    await waitFor(() => expect(mockRev).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: /daily revenue/i })).toBeInTheDocument()
  })
})

describe('DashboardPage — Follow-up queue door (Step 9, AC-903)', () => {
  it('AC-903: hides the Follow-up queue link while SHOW_FOLLOWUPS is dark-launched off', () => {
    mockRev.mockReturnValue(new Promise(() => {}))
    mockMarg.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.queryByRole('link', { name: 'Follow-up queue' })).not.toBeInTheDocument()
  })
})

describe('DashboardPage — populated (desktop, Summary tab)', () => {
  beforeEach(() => {
    setDesktop()
    mockRev.mockResolvedValue(sixtyDaysRevenue())
    mockMarg.mockResolvedValue(sixtyDaysMargin(0.7)) // partial DQ
  })

  it('AC-020: shows a freshness "as of" label', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    // The snapshot timestamp renders somewhere on the page (page head + global toolbar).
    expect(screen.getAllByText(/2026/i).length).toBeGreaterThan(0)
  })

  it('AC-020: freshness reads as a human WIB time, never a raw ISO timestamp', async () => {
    // A finance reader glances at "as of …" to trust the figures — it must be legible
    // (e.g. "1 Jul 2026, 10:14 WIB"), not a machine ISO string. Every "as of" label on
    // the page (page head + chart) routes through the shared FreshnessLabel, so the raw
    // `2026-07-01T03:14:00Z` fixture must never leak to the DOM.
    const { container } = renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
    expect(screen.getAllByText(/WIB/).length).toBeGreaterThan(0)
  })

  it('renders the revenue KPI tiles (7d, 30d, latest-day, avg check, channel mix)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getByText(/trailing 7-day revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/trailing 30-day revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/latest reporting-day revenue/i)).toBeInTheDocument()
    // "Avg check" also appears as a table column header — scope to the KPI tile label.
    expect(screen.getAllByText(/avg check/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/channel mix/i)).toBeInTheDocument()
  })

  it('AC-009: channel mix renders as a "POS x% · B2B y%" string', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getByText(/POS \d+% · B2B \d+%/)).toBeInTheDocument()
  })

  it('AC-008: GM tiles carry the basis label "interim — stock-movement"', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    // Multiple GM/COGS tiles each carry the basis chip.
    const basisChips = screen.getAllByText('interim — stock-movement')
    expect(basisChips.length).toBeGreaterThanOrEqual(3) // GM%, GM amt, COGS
  })

  it('AC-024: GM tiles carry a DQ badge (partial when bom_coverage < 0.9)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    // The partial DQ badge renders on the GM tiles + the BOM-coverage tile.
    expect(screen.getAllByText(/BOM coverage: partial/i).length).toBeGreaterThan(0)
  })

  it('AC-010: renders the "What\'s coming" strip with the four stub KPIs', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getAllByText(/needs warehouse data/i).length).toBeGreaterThanOrEqual(4)
    expect(screen.getAllByText(/^Opex$/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/material usage/i)).toBeInTheDocument()
    expect(screen.getByText(/labor cost/i)).toBeInTheDocument()
    expect(screen.getByText(/roastery yield/i)).toBeInTheDocument()
  })

  it('sets the document title to the Money noun (page identity, not "Dashboard")', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(document.title).toBe('Money — Gordi MOS')
  })

  it('AC-011: renders the global toolbar above the tabs (cut + window + freshness)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getByRole('toolbar', { name: /dashboard filters/i })).toBeInTheDocument()
    // The view tablist carries the Money noun (page identity), not "Dashboard".
    expect(screen.getByRole('tablist', { name: /money view/i })).toBeInTheDocument()
  })

  it('AC-016: clicking the 7-day revenue tile filters the window in-place (no page load)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    const tile7d = screen.getByRole('button', { name: /trailing 7-day revenue/i })
    fireEvent.click(tile7d)
    // The 7d tile becomes selected (aria-current).
    await waitFor(() => expect(tile7d).toHaveAttribute('aria-current', 'true'))
  })

  it('AC-017: Summary exposes a parameterized full-detail door carrying the active window and cut', async () => {
    renderPage('/money')
    await screen.findByRole('heading', { name: /daily revenue/i })
    const detail = screen.getByRole('link', { name: /view full detail/i })
    expect(detail).toHaveAttribute('href', '/money/detail?window=30d&cut=branch')
  })

  it('AC-017: direct parameterized Detail URLs hydrate the same window and cut controls', async () => {
    renderPage('/money/detail?window=7d&cut=channel')
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getByRole('tab', { name: '7d' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: '30d' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Channel' })).toHaveAttribute('aria-selected', 'true')
  })

  it('renders the chart a11y table fallback in the DOM', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getAllByRole('table').length).toBeGreaterThanOrEqual(1)
  })
})

describe('DashboardPage — Detail tab', () => {
  beforeEach(() => {
    setDesktop()
    mockRev.mockResolvedValue(sixtyDaysRevenue())
    mockMarg.mockResolvedValue(sixtyDaysMargin())
  })

  it('AC-015/AC-018: switching to the Detail tab shows the full detail table columns', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    fireEvent.click(screen.getByRole('tab', { name: /detail/i }))
    const table = await screen.findByRole('table', { name: /revenue breakdown/i })
    // Spec-mandated columns (AC-018): dimension/cut, revenue, transactions, share, avg check, COGS, GM, margin %.
    expect(within(table).getByRole('columnheader', { name: /^revenue$/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /txns/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /^share$/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /avg check/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /cogs/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /^gross margin$/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /margin %/i })).toBeInTheDocument()
  })
})

describe('DashboardPage — populated (phone)', () => {
  beforeEach(() => {
    setPhone()
    mockRev.mockResolvedValue(sixtyDaysRevenue())
    mockMarg.mockResolvedValue(sixtyDaysMargin())
  })

  it('AC-020: renders KPI tiles + chart on phone (Summary tab)', async () => {
    renderPage()
    await screen.findByRole('heading', { name: /daily revenue/i })
    expect(screen.getByText(/trailing 7-day revenue/i)).toBeInTheDocument()
  })
})
