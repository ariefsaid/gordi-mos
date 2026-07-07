import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import { I18nProvider } from '@/i18n/I18nProvider'
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

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(viewer)
  mockGetBusinessUnits.mockResolvedValue([{ id: 'bu-sales', name: 'B2B Sales', code: 'b2b_sales' }])
  mockListFollowUps.mockResolvedValue([row])
  mockTransition.mockResolvedValue(row)
})

describe('FollowUpsPage', () => {
  it('AC-520: renders queue rows with lifecycle actions', async () => {
    render(createElement(FollowUpsPage), { wrapper })
    expect(await screen.findByText('PT Big Buyer')).toBeInTheDocument()
    expect(screen.getAllByText(/Rp/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Chase' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Settle' })).toBeInTheDocument()
  })

  it('AC-521: keeps settle disabled until amount, cash-in date, and evidence are present', async () => {
    const user = userEvent.setup()
    render(createElement(FollowUpsPage), { wrapper })
    await user.click(await screen.findByRole('button', { name: 'Settle' }))
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
})
