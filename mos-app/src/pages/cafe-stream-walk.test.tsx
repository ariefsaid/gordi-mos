// The Café walk (#440) — the journey the ticket is actually about.
//
// A person opens Café · Stock, sees they are in the wrong books, switches to Radiant · Bar,
// and walks to Café · Plan. Before this, Plan resolved a stream of its own (the catalog's
// first branch), so it opened on someone else's numbers and never said so. Each page's own
// suite proves its head STATES the stream; this file proves the two agree — which is the
// defect, and which no single-page test can see.
//
// Mounted as real routes and unmounted between them, because that is what navigation does:
// a selection that only survives inside one component's state would pass a same-mount test
// and fail the walk.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return {
    ...actual,
    fetchKitchenStock: vi.fn(),
    listStreamPairs: vi.fn(),
    listActiveWipItems: vi.fn(),
  }
})
import { fetchKitchenStock, listStreamPairs, listActiveWipItems } from '@/lib/db/kitchen-logs'

vi.mock('@/lib/db/kitchen-plans', () => ({
  listKitchenPlans: vi.fn(),
  listPesanan: vi.fn(),
  upsertKitchenPlan: vi.fn(),
}))
import { listKitchenPlans, listPesanan } from '@/lib/db/kitchen-plans'

vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
import { listActiveBranches } from '@/lib/db/branches'

vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
import { fetchDefaultStream } from '@/lib/db/default-stream'

import { KitchenStockPage } from './kitchen-stock-page'
import { KitchenPlanPage } from './kitchen-plan-page'
import { rememberStream } from '@/lib/cafe-stream'

const BRANCH_RR = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const BRANCH_RAD = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const BRANCHES = [BRANCH_RAD, BRANCH_RR]
const STREAM_PAIRS = BRANCHES.flatMap(b => [
  { branch_id: b.id, activity: 'kitchen' as const },
  { branch_id: b.id, activity: 'bar' as const },
])
const OWN_STREAM = { branch: BRANCH_RR, activity: 'kitchen' as const }
const RADIANT_BAR = { branch: BRANCH_RAD, activity: 'bar' as const }

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Dina',
        email: 'dina@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles,
    },
    signOut: vi.fn(),
  } as AuthState
}

beforeEach(() => {
  vi.clearAllMocks()
  rememberStream(null)
  vi.mocked(useAuth).mockReturnValue(viewer(['ops_lead']))
  vi.mocked(listActiveBranches).mockResolvedValue(BRANCHES)
  vi.mocked(listStreamPairs).mockResolvedValue(STREAM_PAIRS)
  vi.mocked(fetchDefaultStream).mockResolvedValue(OWN_STREAM)
  vi.mocked(fetchKitchenStock).mockResolvedValue([])
  vi.mocked(listActiveWipItems).mockResolvedValue([{ id: 'w1', name: 'Ayam Bakar', category: 'Main' }])
  vi.mocked(listKitchenPlans).mockResolvedValue([])
  vi.mocked(listPesanan).mockResolvedValue([])
})

describe('issue 440: the Café stream survives the walk between surfaces', () => {
  it('switching on Stock decides which books Plan opens on', async () => {
    const stock = render(<KitchenStockPage />, { wrapper })
    await waitFor(() => expect(fetchKitchenStock).toHaveBeenCalled())
    expect(vi.mocked(fetchKitchenStock).mock.calls[0][1]).toEqual(OWN_STREAM)

    fireEvent.change(screen.getByRole('combobox', { name: /production stream/i }), {
      target: { value: `${BRANCH_RAD.id}|bar` },
    })
    await waitFor(() => expect(fetchKitchenStock).toHaveBeenCalledTimes(2))
    stock.unmount() // …and walks to Plan

    render(<KitchenPlanPage />, { wrapper })
    await waitFor(() => expect(listKitchenPlans).toHaveBeenCalled())
    expect(vi.mocked(listKitchenPlans).mock.calls[0][1]).toEqual(RADIANT_BAR)
    // …and Plan SAYS so, rather than showing another stream's numbers under no name at all.
    const picker = await screen.findByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.selectedOptions[0].textContent).toBe('Radiant · Bar')
  })

  it('with nothing chosen, every surface opens on the person\'s OWN stream', async () => {
    const stock = render(<KitchenStockPage />, { wrapper })
    await waitFor(() => expect(fetchKitchenStock).toHaveBeenCalled())
    expect(vi.mocked(fetchKitchenStock).mock.calls[0][1]).toEqual(OWN_STREAM)
    stock.unmount()

    render(<KitchenPlanPage />, { wrapper })
    await waitFor(() => expect(listKitchenPlans).toHaveBeenCalled())
    expect(vi.mocked(listKitchenPlans).mock.calls[0][1]).toEqual(OWN_STREAM)
  })

  it('the member pesanan horizon follows the same stream, not the catalog\'s first branch', async () => {
    // AC-024's read-only face. It used to resolve `defaultStreamFrom` — the catalog default —
    // so a Radiant barista read Gordi HQ's plan and had nothing on screen to tell them.
    rememberStream(RADIANT_BAR)
    vi.mocked(useAuth).mockReturnValue(viewer(['member']))
    render(<KitchenPlanPage />, { wrapper })
    await waitFor(() => expect(listPesanan).toHaveBeenCalled())
    expect(vi.mocked(listPesanan).mock.calls[0][2]).toEqual(RADIANT_BAR)
    const picker = await screen.findByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.selectedOptions[0].textContent).toBe('Radiant · Bar')
  })
})
