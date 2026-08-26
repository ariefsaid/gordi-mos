// FollowUpQueueEmbed — Door 1's mount point (Step 9, AC-904/907/908). Proves it composes the
// shared useFollowUpQueue + FollowUpQueueTable pair. NOT "the same pair the canonical
// FollowUpsPage uses" — that page imports neither (#428).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { OverlayHostProvider, OverlayHostSlot } from '@/shell/overlay-host'

vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn() }))
vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, listFollowUps: vi.fn(), transitionFollowUp: vi.fn() }
})
// JQ-4 / D-A4: with a host mounted the embed opens the SHARED record host in the panel. Stub the
// record body so this test's oracle stays the OPEN grammar (panel mounts), not the record internals.
vi.mock('./follow-up-record-host', () => ({
  FollowUpRecordHost: ({ followUpId }: { followUpId: string }) => (
    <div data-testid="follow-up-record-host" data-follow-up-id={followUpId} />
  ),
}))

import { getBusinessUnits } from '@/lib/db/directory'
import { listFollowUps, type FollowUpRow } from '@/lib/db/follow-ups'
import { FollowUpQueueEmbed } from './follow-up-queue-embed'

const mockGetBusinessUnits = vi.mocked(getBusinessUnits)
const mockListFollowUps = vi.mocked(listFollowUps)

const row: FollowUpRow = {
  id: 'fu-1', org_id: 'org-1', counterparty: 'PT Big Buyer', kind: 'b2b_ar', lane: 'b2b_sales',
  source_invoice_ref: 'INV-1001', original_amount: 1000000, running_balance: 1000000, state: 'open',
  promise_date: null, issued_date: '2026-06-01', due_date: '2026-06-30', assigned_to: null, notes: null,
  created_at: '2026-07-01T00:00:00Z', updated_at: '2026-07-01T00:00:00Z',
}

const viewer: AuthState = {
  status: 'authenticated',
  viewer: {
    person: { id: 'p1', org_id: 'org-1', user_id: 'u1', full_name: 'Sales', email: null, must_change_password: false, archived_at: null, created_at: '', updated_at: '' },
    roles: [{ id: 'r1', org_id: 'org-1', business_unit_id: 'bu-sales', name: 'Sales Lead', reports_to_role_id: null, created_at: '', updated_at: '' }],
    isManager: false,
    accessRoles: [],
  },
  signOut: vi.fn(),
}

function renderEmbed() {
  return render(
    <I18nProvider>
      <AuthContext.Provider value={viewer}>
        <MemoryRouter initialEntries={['/work/tasks?view=followups']}>
          <FollowUpQueueEmbed />
        </MemoryRouter>
      </AuthContext.Provider>
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Force desktop (matches follow-ups-page.test.tsx's applyViewport(true) / T-C3's own
  // matchMedia stub) so DataTable renders its <table> branch, not the phone-card list —
  // AC-904 asserts the table renders; jsdom's global default stub is matches:false.
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
  mockGetBusinessUnits.mockResolvedValue([{ id: 'bu-sales', name: 'B2B Sales', code: 'b2b_sales' }])
  mockListFollowUps.mockResolvedValue([row])
})

describe('FollowUpQueueEmbed', () => {
  it('AC-904: renders the live queue via the shared FollowUpQueueTable', async () => {
    renderEmbed()
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'AR Follow-up queue' })).toBeInTheDocument()
  })

  it('AC-907: exposes the shared FollowUpQueueTable lifecycle-action buttons', async () => {
    renderEmbed()
    await screen.findByText('PT Big Buyer')
    expect(screen.getByRole('button', { name: 'Chase' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument()
  })

  it('AC-908 (DD-WAY-36): with no overlay host mounted, the source ref is plain text — no link to a deleted route', async () => {
    renderEmbed()
    await screen.findByText('PT Big Buyer')
    expect(screen.getByText('INV-1001')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Read-only source/i })).toBeNull()
  })

  it('JQ-4 / D-A4: with the overlay host mounted, the row opens the shared record host in the panel (not a bare Link)', async () => {
    render(
      <I18nProvider>
        <AuthContext.Provider value={viewer}>
          <MemoryRouter initialEntries={['/work/tasks?view=followups']}>
            <OverlayHostProvider>
              <FollowUpQueueEmbed />
              <OverlayHostSlot owner="shell" />
            </OverlayHostProvider>
          </MemoryRouter>
        </AuthContext.Provider>
      </I18nProvider>,
    )
    await screen.findByText('PT Big Buyer')

    // The counterparty cell now renders a BUTTON opening the shared panel — never the legacy Link.
    expect(screen.queryByRole('link', { name: /Read-only source INV-1001/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Open follow-up INV-1001/ }))

    expect(screen.getByTestId('follow-up-record-host')).toHaveAttribute('data-follow-up-id', 'fu-1')
    // DD-WAY-36: the Work record page is deleted, so the panel chrome offers no Open-full-page.
    expect(screen.queryByRole('button', { name: 'Open full page' })).toBeNull()
    expect(document.querySelectorAll('[data-overlay-host]').length).toBe(1)
  })

  // Half B convergence: the shared LoadingShell (role=status + aria-busy), never a bare
  // SkeletonRows with no busy announcement.
  it('announces role=status aria-busy while the queue loads', async () => {
    mockListFollowUps.mockReturnValue(new Promise(() => {})) // never resolves
    renderEmbed()
    const status = await screen.findByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
  })
})
