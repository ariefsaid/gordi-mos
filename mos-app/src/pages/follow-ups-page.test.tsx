import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider, OverlayHostSlot } from '@/shell/overlay-host'
import type { AuthState } from '@/auth/context'
import { FollowUpsPage } from './follow-ups-page'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn() }))
vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, listFollowUps: vi.fn(), transitionFollowUp: vi.fn() }
})

import { useAuth } from '@/auth/use-auth'
import { getBusinessUnits } from '@/lib/db/directory'
import { listFollowUps, transitionFollowUp, type FollowUpRow } from '@/lib/db/follow-ups'

const mockUseAuth = vi.mocked(useAuth)
const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockListFollowUps = vi.mocked(listFollowUps)
const mockTransition = vi.mocked(transitionFollowUp)

function applyViewport(isDesktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)' ? isDesktop : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1000000, running_balance: 1000000, state: 'open',
  promise_date: null, issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: null, notes: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

const viewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'p1', org_id: 'org-1', user_id: 'u1', full_name: 'Sales', email: null, archived_at: null, created_at: '', updated_at: '' },
    roles: [{ id: 'r1', org_id: 'org-1', business_unit_id: 'bu-sales', name: 'Sales Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
    isManager: false,
    accessRoles: [],
  },
  signOut: vi.fn(),
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

function renderRoute(initialEntry: string) {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        I18nProvider,
        null,
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/work/follow-ups', element: createElement(FollowUpsPage) }),
          createElement(Route, { path: '/work/follow-ups/:id', element: createElement(FollowUpsPage) }),
        ),
      ),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  applyViewport(true)
  mockUseAuth.mockReturnValue(viewer)
  mockGetBusinessUnits.mockResolvedValue([{ id: 'bu-sales', name: 'B2B Sales', code: 'b2b_sales' }])
  mockListFollowUps.mockResolvedValue([row])
  mockTransition.mockResolvedValue(row)
})

describe('FollowUpsPage', () => {
  it('uses the V3 Workspace family and states the collection job once', async () => {
    const { container } = render(createElement(FollowUpsPage), { wrapper })
    await screen.findByText('PT Big Buyer')
    expect(container.querySelector('[data-page-family="workspace"]')).toBeTruthy()
    expect(screen.getByText('Chase, settle, and confirm invoice-grain commitments')).toBeInTheDocument()
  })

  it('AC-520: renders queue rows in the shared DataTable with lifecycle actions', async () => {
    const { container } = render(createElement(FollowUpsPage), { wrapper })
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Follow-up queue' })).toBeInTheDocument()
    expect(container.querySelector('.dt-table')).toBeTruthy()
    expect(container.querySelector('.follow-ups-table')).toBeNull()
    expect(screen.getAllByText(/Rp/).length).toBeGreaterThan(0)
    expect(container.querySelector('.status-pill')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Chase' })).toHaveClass('btn')
    expect(screen.getByRole('button', { name: 'Settle' })).toHaveClass('btn')
  })

  it('AC-520: renders the shared DataTable card list below 768px, not a horizontal-overflow table', async () => {
    applyViewport(false)
    const { container } = render(createElement(FollowUpsPage), { wrapper })
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.querySelector('.dt-cards')).toBeTruthy()
    expect(container.querySelector('.follow-ups-table-wrap')).toBeNull()
  })

  it('AC-520: /work/follow-ups/:id opens a read-only detail panel for that follow-up', async () => {
    renderRoute('/work/follow-ups/fu-1')
    expect(await screen.findByRole('complementary', { name: 'Follow-up detail' })).toHaveTextContent('INV-1001')
    expect(screen.getByRole('complementary', { name: 'Follow-up detail' })).toHaveTextContent('PT Big Buyer')
  })

  it('AC-520: renders queue rows with lifecycle actions', async () => {
    render(createElement(FollowUpsPage), { wrapper })
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.getAllByText(/Rp/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Chase' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument()
  })

  it('AC-521: keeps settle disabled until amount, cash-in date, and evidence are present', async () => {
    const user = userEvent.setup()
    const { container } = render(createElement(FollowUpsPage), { wrapper })
    await user.click(await screen.findByRole('button', { name: 'Settle' }))
    expect(container.querySelectorAll('.mk-textinput')).toHaveLength(3)
    const submit = screen.getByRole('button', { name: 'Submit' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('Cash-in date'), '2026-07-02')
    await user.type(screen.getByLabelText('Evidence'), 'TRF-2')
    expect(submit).toBeEnabled()
  })

  it('AC-513: hides confirm from a non-finance chaser', async () => {
    mockListFollowUps.mockResolvedValue([{ ...row, state: 'settled', running_balance: 0 }])
    render(createElement(FollowUpsPage), { wrapper })
    await waitFor(() => expect(screen.getByText('settled')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull()
  })

  it('uses shared state-kit for loading, empty, and error states', async () => {
    mockListFollowUps.mockReturnValueOnce(new Promise(() => {}))
    const loading = render(createElement(FollowUpsPage), { wrapper })
    expect(loading.container.querySelector('.skeleton-rows')).toBeTruthy()
    loading.unmount()

    mockListFollowUps.mockResolvedValueOnce([])
    const empty = render(createElement(FollowUpsPage), { wrapper })
    await waitFor(() => expect(screen.getByText('No follow-ups in your lane')).toBeInTheDocument())
    expect(empty.container.querySelector('.empty-state')).toBeTruthy()
    empty.unmount()

    mockListFollowUps.mockRejectedValueOnce(new Error('network down'))
    const errorView = render(createElement(FollowUpsPage), { wrapper })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('network down'))
    expect(errorView.container.querySelector('.error-state')).toBeTruthy()
  })

  describe('drawer-first record door (Luna audit B4 / FR-V3 record-open parity)', () => {
    // The follow-up queue row should open the record IN CONTEXT through the shared overlay host
    // (panel mode, preserving the queue), not navigate directly to the page route. The canonical
    // page route is still reachable via the host chrome's Open-full-page button (entry.pageTo).
    function renderWithHost() {
      return render(
        createElement(
          MemoryRouter,
          { initialEntries: ['/work/follow-ups'] },
          createElement(
            I18nProvider,
            null,
            createElement(
              OverlayHostProvider,
              null,
              createElement(FollowUpsPage),
              createElement(OverlayHostSlot, { owner: 'shell' }),
            ),
          ),
        ),
      )
    }

    it('the counterparty row opens the follow-up record through the shared overlay host (panel mode)', async () => {
      const { container } = renderWithHost()
      // Wait for the queue row to mount.
      const openBtn = await screen.findByRole('button', { name: /Open follow-up INV-1001/i })
      // No overlay host slot is populated before the click.
      expect(container.querySelectorAll('[data-overlay-host]').length).toBe(0)

      await userEvent.setup().click(openBtn)

      // After the click, the shared host has an active session rendering the follow-up record panel.
      // The FollowUpRecordHost loads via getFollowUp (mocked via the actual module — returns undefined
      // here, so the host shows its loading skeleton, which proves the panel mounted).
      await waitFor(() => {
        expect(container.querySelectorAll('[data-overlay-host]').length).toBe(1)
      })
      // The counterparty name now appears TWICE: once in the queue row (still mounted behind the
      // panel — drawer-first preserves context) and once in the panel title (host chrome renders
      // entry.title = row.counterparty). This double-occurrence IS the drawer-first proof.
      expect(screen.getAllByText('PT Big Buyer').length).toBe(2)
    })
  })
})
