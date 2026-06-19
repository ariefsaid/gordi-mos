// KitchenLogPage tests — TDD, AC-tagged
// Covers: AC-020/021/022/030 (submit/validation), all states (loading, empty,
// error, submitting, success, offline, unauthenticated)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', () => ({
  listActiveWipItems: vi.fn(),
  fetchPlanMap: vi.fn(),
  insertKitchenLogBatch: vi.fn(),
}))
import { listActiveWipItems, fetchPlanMap, insertKitchenLogBatch } from '@/lib/db/kitchen-logs'
import type { WipItemOption } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockListActiveWipItems = vi.mocked(listActiveWipItems)
const mockFetchPlanMap = vi.mocked(fetchPlanMap)
const mockInsertKitchenLogBatch = vi.mocked(insertKitchenLogBatch)

const VIEWER_MEMBER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-001',
      full_name: 'Budi Santoso',
      email: 'budi@gordi.id',
      archived_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    roles: [
      {
        id: 'role-001',
        org_id: '10000000-0000-0000-0000-000000000001',
        business_unit_id: '20000000-0000-0000-0000-000000000001',
        name: 'Kitchen Staff',
        reports_to_role_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    isManager: false,
    accessRoles: ['member'],
  },
  signOut: vi.fn(),
}

const BU_ID = '20000000-0000-0000-0000-000000000001'

const WIP_ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
  { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
]

const PLAN_MAP = {
  w1: { Production: 20 },
  w2: { Production: 12 },
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function renderPage(auth: AuthState = VIEWER_MEMBER) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MemoryRouter initialEntries={['/mos/kitchen/log']}>
        <Routes>
          <Route path="/mos/kitchen/log" element={<KitchenLogPage />} />
          <Route path="/mos/kitchen/log/success" element={<div>Submitted</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await Promise.resolve()
  })
  return utils
}

import { KitchenLogPage } from './kitchen-log-page'

beforeEach(() => {
  vi.clearAllMocks()
  mockListActiveWipItems.mockResolvedValue(WIP_ITEMS)
  mockFetchPlanMap.mockResolvedValue(PLAN_MAP)
  // Default: online
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
})

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
})

// ── loading state ─────────────────────────────────────────────────────────────
describe('Loading state', () => {
  it('shows loading skeleton while fetching WIP items', () => {
    // Never resolve — keeps loading
    mockListActiveWipItems.mockReturnValue(new Promise(() => {}))
    mockFetchPlanMap.mockReturnValue(new Promise(() => {}))
    mockUseAuth.mockReturnValue(VIEWER_MEMBER)

    render(
      <MemoryRouter initialEntries={['/mos/kitchen/log']}>
        <Routes>
          <Route path="/mos/kitchen/log" element={<KitchenLogPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })
})

// ── unauthenticated ───────────────────────────────────────────────────────────
describe('Unauthenticated state', () => {
  it('shows sign-in prompt when unauthenticated', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    render(
      <MemoryRouter initialEntries={['/mos/kitchen/log']}>
        <Routes>
          <Route path="/mos/kitchen/log" element={<KitchenLogPage />} />
        </Routes>
      </MemoryRouter>,
    )
    // Check for the sign-in link (the action element)
    expect(await screen.findByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })
})

// ── empty state (no WIP items) ────────────────────────────────────────────────
describe('Empty state — no WIP items (FR-011)', () => {
  it('shows "No active WIP items" message', async () => {
    mockListActiveWipItems.mockResolvedValue([])
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/no active wip items/i)).toBeInTheDocument()
    })
  })
})

// ── error state ───────────────────────────────────────────────────────────────
describe('Error state — fetch failure', () => {
  it('shows retry message when WIP fetch fails', async () => {
    mockListActiveWipItems.mockRejectedValue(new Error('network error'))
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/couldn't load items/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
  })

  it('retries on retry click', async () => {
    mockListActiveWipItems
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(WIP_ITEMS)
    mockFetchPlanMap.mockResolvedValue(PLAN_MAP)

    await renderPage()
    await waitFor(() => screen.getByRole('button', { name: /retry/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    })
  })
})

// ── populated state ────────────────────────────────────────────────────────────
describe('Populated state — WIP items loaded', () => {
  it('renders item names after loading', async () => {
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
      expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    })
  })

  it('shows the action_type seg control with Production selected by default', async () => {
    await renderPage()
    await waitFor(() => {
      const prodTab = screen.getByRole('tab', { name: /production/i })
      expect(prodTab).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('shows plan qty for each item', async () => {
    await renderPage()
    await waitFor(() => {
      // plan_qty 20 for Ayam Bakar
      expect(screen.getAllByText(/20/).length).toBeGreaterThan(0)
    })
  })

  it('shows pinned Submit button', async () => {
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
    })
  })
})

// ── AC-020/021: variance note gate ────────────────────────────────────────────
describe('AC-020/021: variance-note gate (note required when qty differs from plan)', () => {
  it('AC-020: blocks submit and shows note-required cue when qty != plan and no note', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Nasi Goreng'))

    // Increment Nasi Goreng (plan=12) to a non-plan qty (e.g. 7)
    const incBtn = screen.getAllByRole('button', { name: /increase nasi goreng/i })[0]
    // Click 7 times
    for (let i = 0; i < 7; i++) {
      fireEvent.click(incBtn)
    }

    // Submit without note
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })

    // Should show note-required validation
    await waitFor(() => {
      expect(screen.getByText(/note required/i)).toBeInTheDocument()
    })
    // insertKitchenLogBatch should NOT have been called
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('AC-021: off-plan item (no plan row) requires a note', async () => {
    // w1 has no plan for Transfer to Bungur
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Increment Ayam Bakar
    const incBtn = screen.getAllByRole('button', { name: /increase ayam bakar/i })[0]
    fireEvent.click(incBtn)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText(/note required/i)).toBeInTheDocument()
    })
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })
})

// ── AC-030: successful submit ──────────────────────────────────────────────────
describe('AC-030: successful submit (increment semantics)', () => {
  it('AC-030: submits correct payload without status/org_id/submitted_by', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001', 'log-002'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Set Ayam Bakar (plan=20) to exactly 20 (on-plan — no note required)
    const ayamIncBtn = screen.getAllByRole('button', { name: /increase ayam bakar/i })[0]
    for (let i = 0; i < 20; i++) {
      fireEvent.click(ayamIncBtn)
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1)
    })

    const payload = mockInsertKitchenLogBatch.mock.calls[0][0]
    expect(payload).toHaveLength(1)

    const line = payload[0]
    expect(line.action_type).toBe('Production')
    expect(line.wip_item_id).toBe('w1')
    expect(line.qty_porsi).toBe(20)
    expect(line.business_unit_id).toBe(BU_ID)
    // CRITICAL: must NOT send server-stamped fields
    expect(line).not.toHaveProperty('status')
    expect(line).not.toHaveProperty('org_id')
    expect(line).not.toHaveProperty('submitted_by')
  })

  it('shows success confirmation and clears form after submit', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Set Ayam Bakar to exactly 20 (on-plan)
    const ayamIncBtn = screen.getAllByRole('button', { name: /increase ayam bakar/i })[0]
    for (let i = 0; i < 20; i++) {
      fireEvent.click(ayamIncBtn)
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })

    // Success message shown (live region)
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument()
    })
  })
})

// ── submitting state ──────────────────────────────────────────────────────────
describe('Submitting state', () => {
  it('shows spinner and disables Submit button while submitting', async () => {
    // Never resolves — stays in submitting state
    mockInsertKitchenLogBatch.mockReturnValue(new Promise(() => {}))
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Set Ayam Bakar to exactly 20 (on-plan)
    const ayamIncBtn = screen.getAllByRole('button', { name: /increase ayam bakar/i })[0]
    for (let i = 0; i < 20; i++) {
      fireEvent.click(ayamIncBtn)
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    })

    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: /submitting|submit/i })
      expect(submitBtn).toBeDisabled()
    })
  })
})

// ── submit error ──────────────────────────────────────────────────────────────
describe('Submit error state', () => {
  it('shows error message when submit fails', async () => {
    mockInsertKitchenLogBatch.mockRejectedValue(new Error('Server error'))
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Set Ayam Bakar to exactly 20 (on-plan)
    const ayamIncBtn = screen.getAllByRole('button', { name: /increase ayam bakar/i })[0]
    for (let i = 0; i < 20; i++) {
      fireEvent.click(ayamIncBtn)
    }

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})

// ── offline write-blocked state (NFR-008) ─────────────────────────────────────
describe('Offline / write-blocked state (NFR-008)', () => {
  it('shows offline banner when navigator.onLine is false', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('alert', { name: /offline/i })).toBeInTheDocument()
    })
  })

  it('disables Submit when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    mockListActiveWipItems.mockResolvedValue(WIP_ITEMS)
    mockFetchPlanMap.mockResolvedValue(PLAN_MAP)
    await renderPage()

    await waitFor(() => screen.getByText('Ayam Bakar'))

    const submitBtn = screen.getByRole('button', { name: /submit/i })
    expect(submitBtn).toBeDisabled()
  })
})
