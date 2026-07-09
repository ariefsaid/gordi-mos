// PricingPage tests — TDD (AC-tagged). Route /mos/plan/pricing (finance/admin-gated at the router).
// Proves the page's OWN behavior once mounted: the candidate price × the linked certified budgeted
// COGS -> margin (AC-PB-005, read-only), the fail-loud freshness/certification warning (AC-PB-006),
// and that the price is never written (MOS is the pre-flight, not the price-setter — ADR-0022 D5).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/plan-budget', () => ({
  listBudgets: vi.fn(),
  getCertifiedMetric: vi.fn(),
}))
vi.mock('@/auth/use-auth', () => ({ useAuth: vi.fn(() => ({ status: 'authenticated' })) }))

import { listBudgets, getCertifiedMetric } from '@/lib/db/plan-budget'
import { PricingPage } from './pricing-page'

const FRESH = '2026-07-01T00:00:00Z'
const STALE = '2026-01-01T00:00:00Z'

function renderPage() {
  return render(
    <I18nProvider>
      <PricingPage />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCertifiedMetric).mockResolvedValue({ key: 'cogs.budgeted', name: 'Budgeted COGS', certified: true })
})

describe('PricingPage — states', () => {
  it('loading: shows a busy skeleton', () => {
    vi.mocked(listBudgets).mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: names the upstream capture step when no budgets exist', async () => {
    vi.mocked(listBudgets).mockResolvedValue([])
    renderPage()
    expect(await screen.findByText(/no budgets captured yet/i)).toBeInTheDocument()
  })

  it('error: retryable', async () => {
    vi.mocked(listBudgets).mockRejectedValue(new Error('boom'))
    renderPage()
    expect(await screen.findByRole('button', { name: /retry|try again/i })).toBeInTheDocument()
  })
})

describe('PricingPage — AC-PB-005: read-only margin check', () => {
  beforeEach(() => {
    vi.mocked(listBudgets).mockResolvedValue([
      {
        id: 'b1',
        menu_item_esb_code: 'MENU-CAPPUC',
        menu_item_name: 'Cappuccino',
        scenario_label: 'Baseline',
        scenario_type: 'baseline',
        owning_bu_id: 'bu-1',
        total_budgeted_cogs: 9000,
        cost_basis_as_of: FRESH,
        certified_metric_key: 'cogs.budgeted',
        is_complete: true,
      },
    ])
  })

  it('computes gross margin + margin-% from the candidate price vs the linked COGS', async () => {
    renderPage()
    await screen.findByText(/budget scenario/i)
    fireEvent.change(screen.getByLabelText(/candidate price \(rp\)/i), { target: { value: '30000' } })
    // margin = 30000 - 9000 = 21000; margin% = 70%
    await waitFor(() => {
      expect(screen.getByTestId('pricing-result')).toHaveTextContent('Rp 21,000')
      expect(screen.getByTestId('pricing-result')).toHaveTextContent('70%')
    })
  })

  it('margin-% is shown (never a price write — no price-input for ecommerce/POS)', async () => {
    renderPage()
    await screen.findByText(/budget scenario/i)
    // The page has ONE price INPUT (the candidate); there is no "set price" / "save price" action.
    fireEvent.change(screen.getByLabelText(/candidate price \(rp\)/i), { target: { value: '10000' } })
    await waitFor(() => expect(screen.getByTestId('pricing-result')).toHaveTextContent('10%'))
    expect(screen.queryByRole('button', { name: /save|set price|publish/i })).not.toBeInTheDocument()
  })

  it('shows the budgeted COGS + basis as-of the LINKED budget (the certified number)', async () => {
    renderPage()
    expect(await screen.findByText(/Rp 9,000/)).toBeInTheDocument()
    expect(screen.getByText(/basis as of/i)).toBeInTheDocument()
  })
})

describe('PricingPage — AC-PB-006: fail-loud freshness warning', () => {
  it('renders a freshness warning when the cost basis is stale', async () => {
    vi.mocked(listBudgets).mockResolvedValue([
      {
        id: 'b1',
        menu_item_esb_code: 'MENU-CROISS',
        menu_item_name: 'Croissant',
        scenario_label: 'Baseline',
        scenario_type: 'baseline',
        owning_bu_id: 'bu-1',
        total_budgeted_cogs: 12000,
        cost_basis_as_of: STALE,
        certified_metric_key: 'cogs.budgeted',
        is_complete: true,
      },
    ])
    renderPage()
    const warn = await screen.findByTestId('pricing-freshness-warning')
    expect(warn).toBeInTheDocument()
    expect(warn.textContent).toMatch(/do not price/i)
  })

  it('renders a fail-loud warning when the metric definition is uncertified', async () => {
    vi.mocked(getCertifiedMetric).mockResolvedValue({ key: 'cogs.budgeted', name: 'Budgeted COGS', certified: false })
    vi.mocked(listBudgets).mockResolvedValue([
      {
        id: 'b1',
        menu_item_esb_code: 'MENU-X',
        menu_item_name: 'X',
        scenario_label: 'Baseline',
        scenario_type: 'baseline',
        owning_bu_id: 'bu-1',
        total_budgeted_cogs: 12000,
        cost_basis_as_of: FRESH,
        certified_metric_key: 'cogs.budgeted',
        is_complete: true,
      },
    ])
    renderPage()
    // "not certified" surfaces in BOTH the fail-loud badge and the pricing warning.
    expect((await screen.findAllByText(/not certified/i)).length).toBeGreaterThanOrEqual(1)
  })
})
