// KitchenStockPage tests — TDD, AC-tagged.
// S4 Stock view (/mos/kitchen/stock) — read-only, auto-computed, any authed member.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S4.
// Proves (unit): FR-060/061 (the two cuts stok=usable_qty + tersedia=available_qty
// per active WIP item), AC-031 (usable net), AC-032 (negative balances preserved).
// (AC-033 start/end-of-day cut math is owned at the DB/unit layer for the #45 fn.)
// Covers all states: loading, empty, error+retry, populated, unauthenticated.
// Read-only is the signal: NO edit affordances anywhere.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return { ...actual, fetchKitchenStock: vi.fn() }
})
import { fetchKitchenStock } from '@/lib/db/kitchen-logs'

import { KitchenStockPage } from './kitchen-stock-page'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockFetch = vi.mocked(fetchKitchenStock)

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Budi Santoso',
        email: 'budi@gordi.id', archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  } as AuthState
}

const STOCK_ROWS: KitchenStockRow[] = [
  { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', stok: 12, tersedia: 8 },
  { wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', stok: -3, tersedia: -3 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(viewer(['member']))
  mockFetch.mockResolvedValue([])
})

describe('KitchenStockPage — auth', () => {
  it('auth loading: shows a busy state', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as AuthState)
    render(<KitchenStockPage />, { wrapper })
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('unauthenticated: prompts sign-in, never reads stock', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' } as AuthState)
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/stock']}>
        <I18nProvider>
          <KitchenStockPage />
        </I18nProvider>
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router (basename applied) — not a raw href that skips /mos
    expect(link).toHaveAttribute('href', '/mos/login')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('any authenticated member may view stock (read-only — no role gate)', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    render(<KitchenStockPage />, { wrapper })
    await waitFor(() => expect(mockFetch).toHaveBeenCalled())
    expect(screen.queryByText(/available to ops leads/i)).not.toBeInTheDocument()
  })
})

describe('KitchenStockPage — states', () => {
  it('loading: shows a busy skeleton while stock loads', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    render(<KitchenStockPage />, { wrapper })
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: a calm empty when no items/stock for the date', async () => {
    mockFetch.mockResolvedValue([])
    render(<KitchenStockPage />, { wrapper })
    expect(await screen.findByText(/no .*stock|nothing/i)).toBeInTheDocument()
  })

  it('error + retry: surfaces a retry that re-fetches', async () => {
    mockFetch.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    const retry = await screen.findByRole('button', { name: /retry/i })
    fireEvent.click(retry)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
  })
})

describe('KitchenStockPage — populated (FR-060/061)', () => {
    // The structural cut/negative tests run against the desktop <table> branch.
  afterEach(() => {
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

  it('RI-IXD-6: desktop stock uses the shared DataTable branch, not a kitchen-local table wrapper', async () => {
    setDesktop()
    mockFetch.mockResolvedValue(STOCK_ROWS)
    const { container } = render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(container.querySelector('.dt-table')).not.toBeNull()
    expect(container.querySelector('.ks-tablewrap, .ks-table, .kst-table')).toBeNull()
  })

  it('RI-IXD-6: phone stock uses the shared DataTable card branch, not a parallel local table', async () => {
    setPhone()
    mockFetch.mockResolvedValue(STOCK_ROWS)
    const { container } = render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(container.querySelector('.dt-cards')).not.toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.querySelector('.ks-tablewrap, .ks-table, .kst-table, .ksc-cards')).toBeNull()
  })

  it('renders stock-specific KPI labels (not Log labels)', async () => {
    setDesktop()
    mockFetch.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(screen.getByText(/total on-hand/i)).toBeInTheDocument()
    expect(screen.getByText(/items in stock/i)).toBeInTheDocument()
    expect(screen.getByText(/negative balances/i)).toBeInTheDocument()
    expect(screen.getByText(/available total/i)).toBeInTheDocument()
    expect(screen.queryByText(/made so far/i)).toBeNull()
    expect(screen.queryByText(/% complete/i)).toBeNull()
  })

  it('renders a semantic table with the two cuts (stok + tersedia) per item', async () => {
    setDesktop()
    mockFetch.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    // Column headers name the two cuts (stock = usable, available = available)
    expect(within(table).getByRole('columnheader', { name: /stock/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /available/i })).toBeInTheDocument()

    // Each item is a row showing its two numbers
    const ayamRow = screen.getByText('Ayam Bakar').closest('tr') as HTMLElement
    expect(within(ayamRow).getByText('12')).toBeInTheDocument()
    expect(within(ayamRow).getByText('8')).toBeInTheDocument()
  })

  it('AC-032: preserves negative balances (does not clamp to 0)', async () => {
    setDesktop()
    mockFetch.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    const nasiRow = (await screen.findByText('Nasi Goreng')).closest('tr') as HTMLElement
    // -3 shown, not 0
    expect(within(nasiRow).getAllByText('-3').length).toBeGreaterThan(0)
  })

  it('read-only: no edit/save/approve controls anywhere', async () => {
    mockFetch.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.queryByRole('button', { name: /save|edit|approve|submit/i })).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('numeric cells carry the .tabular class for aligned digits', async () => {
    setDesktop()
    mockFetch.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    const ayamRow = (await screen.findByText('Ayam Bakar')).closest('tr')!
    const numCell = within(ayamRow).getByText('12')
    expect(numCell.closest('.tabular')).not.toBeNull()
  })
})
