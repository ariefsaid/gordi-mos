// KitchenLogPage tests — TDD, AC-tagged
// Covers: AC-020/021/022/030 (submit/validation/transfer cap), all states (loading,
// empty, error, submitting, success, offline-in-every-state RI-2, unauthenticated),
// BU-resolution failure (#3), inline note reveal (#6), touch floors (RI-3).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', () => ({
  listActiveWipItems: vi.fn(),
  fetchPlanMap: vi.fn(),
  fetchStockMap: vi.fn(),
  resolveKitchenBuId: vi.fn(),
  insertKitchenLogBatch: vi.fn(),
}))
import {
  listActiveWipItems,
  fetchPlanMap,
  fetchStockMap,
  resolveKitchenBuId,
  insertKitchenLogBatch,
} from '@/lib/db/kitchen-logs'
import type { WipItemOption } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockListActiveWipItems = vi.mocked(listActiveWipItems)
const mockFetchPlanMap = vi.mocked(fetchPlanMap)
const mockFetchStockMap = vi.mocked(fetchStockMap)
const mockResolveKitchenBuId = vi.mocked(resolveKitchenBuId)
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

// The Kitchen-and-Bar BU id resolved BY NAME (#3) — NOT viewer.roles[0].business_unit_id.
const BU_ID = '30000000-0000-0000-0000-0000000000kb'

const WIP_ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
  { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
]

const PLAN_MAP = {
  w1: { Production: 20, 'Transfer to Radiant': 10 },
  w2: { Production: 12 },
}

// Stock: w1 has 3 on hand, 9 available to transfer.
const STOCK_MAP = {
  w1: { stok: 3, tersedia: 9 },
  w2: { stok: 0, tersedia: 0 },
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
  mockFetchStockMap.mockResolvedValue(STOCK_MAP)
  mockResolveKitchenBuId.mockResolvedValue(BU_ID)
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
describe('AC-020/021: variance-note gate (note required when qty differs from effective target)', () => {
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

    // Should show the ID note-required cue (NFR-012 content)
    await waitFor(() => {
      expect(screen.getByText(/catatan wajib/i)).toBeInTheDocument()
    })
    // insertKitchenLogBatch should NOT have been called
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('#6: reveals the note field INLINE as soon as qty != target (no submit needed)', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Nasi Goreng'))

    // No note field before any input
    expect(screen.queryByRole('textbox', { name: /note for nasi goreng/i })).toBeNull()

    // One increment (plan=12, qty=1 → off-target) reveals the note inline
    const incBtn = screen.getAllByRole('button', { name: /increase nasi goreng/i })[0]
    await act(async () => {
      fireEvent.click(incBtn)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /note for nasi goreng/i })).toBeInTheDocument()
      expect(screen.getByText(/catatan wajib/i)).toBeInTheDocument()
    })
    // No submit attempt occurred
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('AC-021: off-plan item (no plan row) requires a note', async () => {
    // No plans → every staged item is off-target
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
      expect(screen.getByText(/catatan wajib/i)).toBeInTheDocument()
    })
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })
})

// ── AC-022: transfer over-availability REJECTS the submit (FR-023) ─────────────
// Parity with the OLD app (app/main.py ~L618-661): an over-`tersedia` transfer is a
// HARD STOP ("Produksi dulu sebelum transfer"), NOT a silent clamp. The typed qty is
// kept; Submit is blocked + the offending line shows the produce-first cue.
describe('AC-022: transfer over-availability rejects submit — "Stok kurang — produksi dulu" (FR-023)', () => {
  it('AC-022: an over-tersedia Transfer qty is NOT clamped — keeps the typed value + shows the cue', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Switch to a Transfer action_type (w1 tersedia=9)
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    // The qty input for Ayam Bakar (w1)
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity for ayam bakar/i })

    // Type 10 (exceeds tersedia 9) — the value is KEPT (not clamped) and the cue shows
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '10' } })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText(/stok kurang — produksi dulu/i)).toBeInTheDocument()
    })
    // NOT clamped: the input keeps the real typed value (10), unlike the old silent-cap behavior
    expect((qtyInput as HTMLInputElement).value).toBe('10')
  })

  it('AC-022: an over-tersedia Transfer line blocks Submit (button disabled)', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '10' } }) // > tersedia 9
      await Promise.resolve()
    })

    // Submit is blocked while the line exceeds availability
    const submit = screen.getAllByRole('button', { name: /^submit/i })[0]
    expect(submit).toBeDisabled()
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('AC-022: an at-tersedia Transfer qty submits fine (no reject)', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    // w1: plan 10, stok 3 → effective target 7; tersedia 9. Log 9 with a note (off-target
    // 9 != 7 needs a note, but 9 <= tersedia so it's NOT rejected for availability).
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '9' } })
      await Promise.resolve()
    })
    expect(screen.queryByText(/stok kurang/i)).toBeNull()
    const note = screen.getByRole('textbox', { name: /note for ayam bakar/i })
    await act(async () => {
      fireEvent.change(note, { target: { value: 'extra ship' } })
      await Promise.resolve()
    })

    const submit = screen.getAllByRole('button', { name: /^submit/i })[0]
    expect(submit).not.toBeDisabled()
    await act(async () => {
      fireEvent.click(submit)
      await Promise.resolve()
    })
    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    expect(mockInsertKitchenLogBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({ wip_item_id: 'w1', qty_porsi: 9, action_type: 'Transfer to Radiant' }),
    ])
  })

  it('AC-022: a Transfer of <= tersedia is allowed with no cap cue', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity for ayam bakar/i })
    // effective target = max(plan 10 − stok 3, 0) = 7 → log exactly 7 (on-target, no note, no cap)
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '7' } })
      await Promise.resolve()
    })

    expect((qtyInput as HTMLInputElement).value).toBe('7')
    expect(screen.queryByText(/stok kurang/i)).toBeNull()
    expect(screen.queryByText(/catatan wajib/i)).toBeNull()
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

  // RI-2: offline indicator surfaced in EVERY state, including load-failure —
  // never a bare Retry loop when navigator.onLine === false.
  it('RI-2: surfaces the offline indicator in the ERROR branch (not a bare Retry loop)', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    mockListActiveWipItems.mockRejectedValue(new Error('network error'))
    await renderPage()
    await waitFor(() => {
      // an explicit offline alert is present alongside Retry
      expect(screen.getByRole('alert', { name: /offline/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
  })

  it('RI-2: surfaces the offline indicator in the LOADING branch', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    mockListActiveWipItems.mockReturnValue(new Promise(() => {}))
    mockFetchPlanMap.mockReturnValue(new Promise(() => {}))
    mockFetchStockMap.mockReturnValue(new Promise(() => {}))
    mockResolveKitchenBuId.mockReturnValue(new Promise(() => {}))
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
      expect(screen.getByRole('alert', { name: /offline/i })).toBeInTheDocument()
    })
  })
})

// ── BU resolution (#3) ────────────────────────────────────────────────────────
describe('#3: Kitchen-and-Bar BU resolution', () => {
  it('stamps the resolved Kitchen BU id on every submitted line (not viewer.roles[0])', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayamIncBtn = screen.getAllByRole('button', { name: /increase ayam bakar/i })[0]
    for (let i = 0; i < 20; i++) fireEvent.click(ayamIncBtn)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    expect(mockInsertKitchenLogBatch.mock.calls[0][0][0].business_unit_id).toBe(BU_ID)
  })

  it('renders an error state (not the form) when the kitchen BU cannot be resolved', async () => {
    mockResolveKitchenBuId.mockRejectedValue(
      new Error('Kitchen business unit ("Kitchen and Bar") not found — cannot log without it.'),
    )
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
    // The capture form must NOT render without a resolved BU
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })
})

// ── I3: S1 uses the ONE shared content PageHead (not a bespoke .kl-head) ───────
describe('I3: shared PageHead variant="content"', () => {
  it('renders the shared content PageHead (testid + content-header chrome + h1 title + date in meta)', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const head = screen.getByTestId('page-head')
    // the signed mockup .content-header chrome (icon + title + count/meta), same as S2–S5
    expect(head).toHaveClass('content-header')
    // ONE accessible heading carrying the page title (RI-IA-1)
    const h1 = within(head).getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Kitchen · Log')
    // the log date rides in the meta slot (today, WIB) — a YYYY-MM-DD string
    expect(within(head).getByText(/^\d{4}-\d{2}-\d{2}$/)).toBeInTheDocument()
    // the bespoke hand-rolled header is gone
    expect(document.querySelector('.kl-head')).toBeNull()
  })
})

// ── RI-3: touch floors on error/unauthenticated affordances ───────────────────
describe('RI-3: interactive controls meet the 44px touch floor', () => {
  it('Retry carries the .btn-touch floor on the error state', async () => {
    mockListActiveWipItems.mockRejectedValue(new Error('network error'))
    await renderPage()
    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(retry.className).toMatch(/btn-touch/)
  })

  it('Sign-in carries the .btn-touch floor on the unauthenticated state', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    render(
      <MemoryRouter initialEntries={['/mos/kitchen/log']}>
        <Routes>
          <Route path="/mos/kitchen/log" element={<KitchenLogPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const signin = await screen.findByRole('link', { name: /sign in/i })
    expect(signin.className).toMatch(/btn-touch/)
  })
})
