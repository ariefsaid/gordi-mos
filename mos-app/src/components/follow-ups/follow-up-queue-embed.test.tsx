// FollowUpQueueEmbed — Door 1's mount point (Step 9, AC-904/907/908). Proves it
// composes the SAME hook + table pair the canonical FollowUpsPage uses.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import { AuthContext } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/directory', () => ({ getBusinessUnits: vi.fn() }))
vi.mock('@/lib/db/follow-ups', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/follow-ups')>('@/lib/db/follow-ups')
  return { ...actual, listFollowUps: vi.fn(), transitionFollowUp: vi.fn() }
})

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
    person: { id: 'p1', org_id: 'org-1', user_id: 'u1', full_name: 'Sales', email: null, archived_at: null, created_at: '', updated_at: '' },
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
  mockGetBusinessUnits.mockResolvedValue([{ id: 'bu-sales', name: 'B2B Sales', code: 'b2b_sales' }])
  mockListFollowUps.mockResolvedValue([row])
})

describe('FollowUpQueueEmbed', () => {
  it('AC-904: renders the live queue via the same table used by the canonical page', async () => {
    renderEmbed()
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Follow-up queue' })).toBeInTheDocument()
  })

  it('AC-907: exposes the same lifecycle-action buttons as the canonical page', async () => {
    renderEmbed()
    await screen.findByText('PT Big Buyer')
    expect(screen.getByRole('button', { name: 'Chase' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument()
  })

  it('AC-908: the row source link points at the canonical /work/follow-ups/:id route', async () => {
    renderEmbed()
    await screen.findByText('PT Big Buyer')
    expect(screen.getByRole('link', { name: /Read-only source INV-1001/ })).toHaveAttribute(
      'href', '/work/follow-ups/fu-1',
    )
  })
})
