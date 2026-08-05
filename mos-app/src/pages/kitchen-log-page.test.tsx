// KitchenLogPage tests — TDD, AC-tagged
// Covers: AC-020/021/022/030 (submit/validation/transfer cap), all states (loading,
// empty, error, submitting, success, offline-in-every-state RI-2, unauthenticated),
// BU-resolution failure (#3), inline note reveal (#6), touch floors (RI-3).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider, Link } from 'react-router-dom'
import type { AuthState } from '@/auth/context'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  // `defaultStreamFrom` is pure branch-catalog arithmetic, not IO — the page uses it to
  // decide which stream to open on, so the real one is kept and only the reads are mocked.
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>(
    '@/lib/db/kitchen-logs',
  )
  return {
    defaultStreamFrom: actual.defaultStreamFrom,
    listActiveWipItems: vi.fn(),
    fetchPlanMap: vi.fn(),
    fetchStockMap: vi.fn(),
    resolveKitchenBuId: vi.fn(),
    insertKitchenLogBatch: vi.fn(),
  }
})
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
import {
  listActiveWipItems,
  fetchPlanMap,
  fetchStockMap,
  resolveKitchenBuId,
  insertKitchenLogBatch,
} from '@/lib/db/kitchen-logs'
import { listActiveBranches } from '@/lib/db/branches'
import type { BranchOption, WipItemOption } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockListActiveWipItems = vi.mocked(listActiveWipItems)
const mockFetchPlanMap = vi.mocked(fetchPlanMap)
const mockFetchStockMap = vi.mocked(fetchStockMap)
const mockResolveKitchenBuId = vi.mocked(resolveKitchenBuId)
const mockInsertKitchenLogBatch = vi.mocked(insertKitchenLogBatch)
const mockListActiveBranches = vi.mocked(listActiveBranches)

// The canonical branch catalog (OD-WAY-39). The capture surface opens on the branch the one
// physical kitchen's output books to, which is the single (branch, activity) stream captured
// today (DD-WAY-25) — so "Transfer to Bungur" is a transfer whose destination IS the origin.
const BRANCH_RUMAH_RAMES: BranchOption = {
  id: '30000000-0000-0000-0000-0000000000b1', code: 'rumah_rames', name: 'Rumah Rames',
}
const BRANCH_RADIANT: BranchOption = {
  id: '30000000-0000-0000-0000-0000000000b2', code: 'radiant', name: 'Radiant',
}
const BRANCHES: BranchOption[] = [BRANCH_RADIANT, BRANCH_RUMAH_RAMES]
const PRODUCE_KEY = 'produce'
const TRANSFER_RADIANT_KEY = `transfer:${BRANCH_RADIANT.id}`

const VIEWER_MEMBER: AuthState = {
  status: 'authenticated',
  viewer: {
    person: {
      id: '40000000-0000-0000-0000-000000000001',
      org_id: '10000000-0000-0000-0000-000000000001',
      user_id: 'auth-001',
      full_name: 'Budi Santoso',
      email: 'budi@gordi.id',
      must_change_password: false,
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
  w1: { [PRODUCE_KEY]: 20, [TRANSFER_RADIANT_KEY]: 10 },
  w2: { [PRODUCE_KEY]: 12 },
}

// Stock: w1 has 3 on hand, 9 available to transfer.
const STOCK_MAP = {
  w1: { stok: 3, tersedia: 9 },
  w2: { stok: 0, tersedia: 0 },
}

// ── helpers ───────────────────────────────────────────────────────────────────
async function renderPage(auth: AuthState = VIEWER_MEMBER, initialPath = '/mos/kitchen/log') {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MemoryRouter initialEntries={[initialPath]}>
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
  mockListActiveBranches.mockResolvedValue(BRANCHES)
  mockFetchPlanMap.mockResolvedValue(PLAN_MAP)
  mockFetchStockMap.mockResolvedValue(STOCK_MAP)
  mockResolveKitchenBuId.mockResolvedValue(BU_ID)
  // Default: online
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
})

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true })
  // Restore the default (phone → matches:false) matchMedia stub after any
  // setDesktopMatchMedia(true) override, so test order can't leak the branch.
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
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/log']}>
        <Routes>
          <Route path="/kitchen/log" element={<KitchenLogPage />} />
        </Routes>
      </MemoryRouter>,
    )
    // Check for the sign-in link (the action element)
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router (basename applied) — not a raw href that skips /mos
    expect(link).toHaveAttribute('href', '/mos/login')
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

  // Half B convergence: missing WIP-item configuration is never the 'quiet' ✓ earned-all-clear
  // glyph — it reads as "nothing to log, all done" when it actually means "nothing CAN be
  // logged until an ops lead adds items". 'blank' (—) is the honest "no source configured" read.
  it("Half B convergence: uses the 'blank' (never 'quiet' ✓) EmptyState variant", async () => {
    mockListActiveWipItems.mockResolvedValue([])
    await renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toHaveAttribute('data-empty-variant', 'blank')
    })
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })
})

// ── error state ───────────────────────────────────────────────────────────────
describe('Error state — fetch failure', () => {
  it('shows retry message when WIP fetch fails', async () => {
    mockListActiveWipItems.mockRejectedValue(new Error('network error'))
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/couldn’t load the dish list/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  it('retries on retry click', async () => {
    mockListActiveWipItems
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(WIP_ITEMS)
    mockFetchPlanMap.mockResolvedValue(PLAN_MAP)

    await renderPage()
    await waitFor(() => screen.getByRole('button', { name: /try again/i }))

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }))
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

  // v4 P0 (design critique): the footer is now DELIBERATELY sticky — on phone the scroll
  // container ran ~3,000px, so Submit was unreachable without a long scroll past the FAB.
  // jsdom does not compute real layout from imported stylesheets (vite.config.ts `css: false`
  // — verified project-wide convention), so this asserts against the actual authored CSS
  // (the same pattern page-head-ownership.test.ts uses), not a jsdom computed style that would
  // never reflect `position: sticky` either way. The goal — the footer must never permanently
  // hide the final dish row — now holds via reserved bottom padding on the list container
  // instead of static flow; that's covered by the sibling assertion below.
  it('B3: the sticky footer is pinned above the fold with an opaque surface + no resting shadow', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Nasi Goreng'))
    const form = document.getElementById('kitchen-log-form') as HTMLFormElement
    const footer = form.querySelector('.kl-footer') as HTMLElement
    expect(footer).not.toBeNull()

    const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-log-page.css'), 'utf8')
    const rule = css.slice(css.indexOf('.kl-footer {'), css.indexOf('.kl-footer {') + 400)
    expect(rule).toMatch(/position:\s*sticky/)
    expect(rule).toMatch(/bottom:\s*0/)
    expect(rule).toMatch(/background:\s*var\(--card\)/)
    expect(rule).toMatch(/border-top:\s*1px solid var\(--border\)/)
    // Soft-Elevation Rule: a flat utility surface never carries a resting shadow.
    expect(rule).not.toMatch(/box-shadow/)
  })

  it('B3b: the list container reserves bottom room so the sticky footer cannot permanently cover the final row', async () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-log-page.css'), 'utf8')
    expect(css).toMatch(/\.kl-form \.dt-table,\s*\n\.kl-form \.dt-cards \{/)
    expect(css).toMatch(/margin-bottom:\s*88px/)
    expect(css).toMatch(/margin-bottom:\s*calc\(140px \+ env\(safe-area-inset-bottom/)
  })
})

// ── AC-020/021: variance note gate ────────────────────────────────────────────
describe('AC-020/021: variance-note gate (note required when qty differs from effective target)', () => {
  it('AC-020: blocks submit and shows note-required cue when qty != plan and no note', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Nasi Goreng'))

    // v4: type the produced qty directly (Nasi Goreng plan=12) to a non-plan qty (7), then
    // blur — the variance-note gate reveals on blur, not per keystroke.
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '7' } })
      fireEvent.blur(qtyInput)
      await Promise.resolve()
    })

    // Should show the note-required cue on the row, localized to the active session
    // locale (cafe-1 fix — the i18n seam; default test locale is English, VARIANCE_NOTE_CUE's
    // 'en' catalog rendering, not the raw ID gate-logic constant).
    await waitFor(() => {
      expect(screen.getByText(/note required — off plan/i)).toBeInTheDocument()
    })
    // insertKitchenLogBatch should NOT have been called
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('#6: reveals the note field on BLUR once qty != target (no submit needed)', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Nasi Goreng'))

    // No note field before any input
    expect(screen.queryByRole('textbox', { name: /note for nasi goreng/i })).toBeNull()

    // Type an off-target qty (plan=12, qty=1 → off-target). v4: the note reveals on BLUR,
    // never per keystroke (a required textarea must not shove itself into the row mid-number).
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '1' } })
      await Promise.resolve()
    })
    expect(screen.queryByRole('textbox', { name: /note for nasi goreng/i })).toBeNull()

    await act(async () => {
      fireEvent.blur(qtyInput)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /note for nasi goreng/i })).toBeInTheDocument()
      // Row-level note cue, localized (cafe-1 fix — default test locale is English)
      expect(screen.getByText(/note required — off plan/i)).toBeInTheDocument()
    })
    // No submit attempt occurred
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('AC-021: off-plan item (no plan row) requires a note', async () => {
    // No plans → every staged item is off-target
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Type a qty for Ayam Bakar, then blur to reveal the gate.
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '1' } })
      fireEvent.blur(qtyInput)
      await Promise.resolve()
    })

    await waitFor(() => {
      // Row-level note cue, localized (cafe-1 fix — default test locale is English)
      expect(screen.getByText(/note required — off plan/i)).toBeInTheDocument()
    })
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })
})

// ── F3: Submit disabled while a required variance-note is unresolved (FR-022) ─────
// The click-re-gate stays (defense in depth — AC-020/021 above); F3 surfaces the same
// gate as an EXPLICIT disabled control so "not ready" reads as disabled, not enabled-
// until-bounced. needsVarianceNote is the existing pure gate (lib/kitchen-gates.ts).
describe('F3: Submit disabled while a required variance-note is unresolved', () => {
  it('a staged off-plan line with no note disables Submit (the blocking state is visible)', async () => {
    // No plans → every staged item is off-target (needs a note)
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Stage an off-plan line (qty=1, no plan → needs a variance note)
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(qtyInput, { target: { value: '1' } })

    // Submit is disabled while the note is unresolved (F3 explicit disabled state)
    const submit = screen.getAllByRole('button', { name: /^submit/i })[0]
    expect(submit).toBeDisabled()
  })

  it('entering the required note re-enables Submit', async () => {
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Stage an off-plan line
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(qtyInput, { target: { value: '1' } })

    const submit = screen.getAllByRole('button', { name: /^submit/i })[0]
    expect(submit).toBeDisabled()

    // Reveal the note field on blur (v4: the reveal is blur-gated, not per keystroke) and fill it
    fireEvent.blur(qtyInput)
    const note = await screen.findByRole('textbox', { name: /note for ayam bakar/i })
    fireEvent.change(note, { target: { value: 'extra batch' } })

    await waitFor(() => {
      expect(submit).not.toBeDisabled()
    })
  })
})

// ── F3b: disabled Submit shows an inline reason message (Fix 3) ──────────────
describe('F3b: disabled Submit shows reason message when variance note is missing', () => {
  it('shows "Note required to submit" near the Submit button when a note is required and missing', async () => {
    // No plans → every staged item is off-target (needs a variance note)
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Stage an off-plan line (qty=1, plan=0 → off-target → variance note required)
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(qtyInput, { target: { value: '1' } })

    // The Submit button is disabled (F3 existing gate — unchanged)
    const submit = screen.getAllByRole('button', { name: /^submit/i })[0]
    expect(submit).toBeDisabled()

    // FIX 3: a visible inline reason message must appear near the Submit button
    // so the blocker is visible without clicking (not enabled-until-bounced).
    expect(screen.getByText(/note required to submit/i)).toBeInTheDocument()
  })

  it('reason message disappears when the required note is filled', async () => {
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(qtyInput, { target: { value: '1' } })

    // Reason message shows while note is empty
    expect(screen.getByText(/note required to submit/i)).toBeInTheDocument()

    // Fill the required note (blur first — v4: the note field reveals on blur)
    fireEvent.blur(qtyInput)
    const note = await screen.findByRole('textbox', { name: /note for ayam bakar/i })
    fireEvent.change(note, { target: { value: 'extra batch today' } })

    // Once the note is filled, Submit re-enables and the reason message disappears
    await waitFor(() => {
      expect(screen.queryByText(/note required to submit/i)).toBeNull()
    })
  })
})

// ── AC-022: transfer over-availability REJECTS the submit (FR-023) ─────────────
// Parity with the OLD app (app/main.py ~L618-661): an over-`tersedia` transfer is a
// HARD STOP ("Produksi dulu sebelum transfer"), NOT a silent clamp. The typed qty is
// kept; Submit is blocked + the offending line shows the produce-first cue.
describe('AC-022: transfer over-availability rejects submit — "Insufficient stock — produce first" (FR-023)', () => {
  it('AC-022: an over-tersedia Transfer qty is NOT clamped — keeps the typed value + shows the cue', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Switch to a Transfer action_type (w1 tersedia=9)
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    // The qty input for Ayam Bakar (w1)
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })

    // Type 10 (exceeds tersedia 9) — the value is KEPT (not clamped) and the cue shows
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '10' } })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByText(/insufficient stock — produce first/i)).toBeInTheDocument()
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

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
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
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '9' } })
      fireEvent.blur(qtyInput)
      await Promise.resolve()
    })
    expect(screen.queryByText(/insufficient stock/i)).toBeNull()
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
      // v4 named the movement by its derived label; the row carries the movement itself.
      expect.objectContaining({
        wip_item_id: 'w1', qty_porsi: 9,
        action: 'transfer', destination_branch_id: BRANCH_RADIANT.id,
        branch_id: BRANCH_RUMAH_RAMES.id, activity: 'kitchen',
      }),
    ])
  })

  it('AC-022: a Transfer of <= tersedia is allowed with no cap cue', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    // effective target = max(plan 10 − stok 3, 0) = 7 → log exactly 7 (on-target, no note, no cap)
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '7' } })
      await Promise.resolve()
    })

    expect((qtyInput as HTMLInputElement).value).toBe('7')
    expect(screen.queryByText(/insufficient stock/i)).toBeNull()
    expect(screen.queryByText(/note required/i)).toBeNull()
  })
})

// ── AC-030: successful submit ──────────────────────────────────────────────────
describe('AC-030: successful submit (increment semantics)', () => {
  it('AC-030: submits correct payload without status/org_id/submitted_by', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001', 'log-002'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Set Ayam Bakar (plan=20) to exactly 20 (on-plan — no note required)
    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })

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
    // The stream is on the row (OD-WAY-28) and the movement replaced the stored
    // three-literal action_type (DD-WAY-13). v4 asserted `action_type: 'Production'`; the
    // column it named does not exist in the squashed baseline, and the label it carried is
    // derived from exactly the two fields asserted here.
    expect(line.branch_id).toBe(BRANCH_RUMAH_RAMES.id)
    expect(line.activity).toBe('kitchen')
    expect(line.action).toBe('produce')
    expect(line.destination_branch_id).toBeNull()
    expect(line).not.toHaveProperty('action_type')
    expect(line.wip_item_id).toBe('w1')
    expect(line.qty_porsi).toBe(20)
    expect(line.business_unit_id).toBe(BU_ID)
    // CRITICAL: must NOT send server-stamped fields
    expect(line).not.toHaveProperty('status')
    expect(line).not.toHaveProperty('org_id')
    expect(line).not.toHaveProperty('submitted_by')
  }, 10_000)

  it('shows success confirmation and clears form after submit', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Set Ayam Bakar to exactly 20 (on-plan)
    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })

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
    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })

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
    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })

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
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
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

    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    expect(mockInsertKitchenLogBatch.mock.calls[0][0][0].business_unit_id).toBe(BU_ID)
  })

  it('renders an error state (not the form) when the kitchen BU cannot be resolved', async () => {
    mockResolveKitchenBuId.mockRejectedValue(
      new Error('Kitchen business unit (code "retail_ops") not found — cannot log without it.'),
    )
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
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
    expect(h1).toHaveTextContent('Café · Log')
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
    const retry = await screen.findByRole('button', { name: /try again/i })
    expect(retry.className).toMatch(/btn-touch/)
  })

  it('Sign-in carries the .btn-touch floor on the unauthenticated state', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/log']}>
        <Routes>
          <Route path="/kitchen/log" element={<KitchenLogPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const signin = await screen.findByRole('link', { name: /sign in/i })
    expect(signin.className).toMatch(/btn-touch/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// OD-K-5 redesign tests (plan §10 task 10): KPI strip, group split, search,
// category filter, Discard, tally, reflow branch (P-4: one branch in the DOM).
// The AC goal-oracles above are unchanged; these cover the NEW presentational
// behavior. Default render = phone (jsdom matchMedia → false).
// ─────────────────────────────────────────────────────────────────────────────

// Force the useIsDesktop() hook to read "desktop" by overriding matchMedia before
// render. The hook reads matchMedia synchronously in its useState initializer.
function setDesktopMatchMedia(desktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: desktop && query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// extra item with NO plan → exercises the Off-plan group
const WIP_ITEMS_WITH_OFFPLAN: WipItemOption[] = [
  { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
  { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
  { id: 'w3', name: 'Sambal Matah', category: 'Side' }, // off-plan for Production
]

// task 10a — the derived plan figures render in the page-head meta line.
// v4 (2026-07-27, owner-directed): the standalone KPI-strip band (desktop 4 tiles / phone
// one-line summary) is gone from this page. The date chip and the planned-total band were
// "two stacked lines saying very little" — they are now ONE compacted meta line (`kl-meta-
// line`) in the PageHead, showing the planned total + dish count. `madeSoFar`/`pctComplete`
// were dropped from the head entirely (plan §"Metric summary rule" — those numbers reflected
// typed-not-yet-submitted quantities, so the head would report "0 / -548 vs plan" a second
// after a successful submit; visibly absent beats confidently wrong). The goal this test
// protects — the day's planned figures are readable at a glance — is unchanged; the STEPS
// were rewritten to the new meta-line rendering, and per-row feedback (kl-status) already has
// its own coverage below.
describe('OD-K-5: the planned total + dish count render in the page-head meta line', () => {
  it('shows the planned total and dish count regardless of viewport (phone)', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    // 2 planned dishes (w1:20, w2:12) → plannedTotal 32, plannedDishCount 2
    const head = screen.getByTestId('page-head')
    expect(within(head).getByText('32')).toBeInTheDocument()
    expect(within(head).getByText('2')).toBeInTheDocument()
  })

  it('shows the same planned total and dish count on desktop (no width branch)', async () => {
    setDesktopMatchMedia(true)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    const head = screen.getByTestId('page-head')
    expect(within(head).getByText('32')).toBeInTheDocument()
    expect(within(head).getByText('2')).toBeInTheDocument()
  })

  it('omits the planned-total meta line entirely when nothing is planned for this action_type', async () => {
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(document.querySelector('.kl-plan-sum')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// DD-7 regression guard — the summary band reported TYPED production as LOGGED.
//
// The band derived "Made so far", "% complete", "−N vs plan" and "−N portions short" from
// `lines` — the quantities typed INTO THE FORM, not the day's submitted production — while a
// provenance note beneath it simultaneously read "No entries logged yet today". One second after
// a successful submit the same band reset to "Made so far 0 / −548 vs plan" on a day when 548
// portions HAD been logged. PRODUCT.md principle 4: a confident wrong number is the worst outcome
// MOS can produce.
//
// The fix removed those metrics rather than restyling them, but the INVARIANT is what is guarded
// here, not the deletion: nothing on the band may present a figure derived from unsaved form state
// as if it were logged production, and no "nothing has been logged today" claim may be derived
// from unsaved input either. (The sticky-footer tally is explicitly the staged-work counter —
// "pending review on Submit" — so it is not a band claim and is deliberately out of scope.)
const LOGGED_PRODUCTION_CLAIMS = [
  /made so far/i,      // kitchen.kpi.madeSoFar
  /% complete/i,       // kitchen.kpi.pctComplete
  /vs plan/i,          // kitchen.kpi.madeSoFar.behind — "−N vs plan"
  /portions short/i,   // kitchen.kpi.dishesRemaining.short — "−N portions short"
  /logged yet today/i, // the provenance note — "No entries logged yet today"
]

describe('DD-7: the summary band never reports typed-but-unsaved quantities as logged production', () => {
  // "The band" = everything the screen states ABOVE the capture form: the page head, plus any
  // summary rendered between it and the form. Read structurally (not by class name) so the guard
  // survives the band being restyled or moved — it is the CLAIM that is protected, not a selector.
  function bandText(): string {
    const head = screen.getByTestId('page-head').textContent ?? ''
    const page = document.querySelector('.kl-page')
    const form = document.getElementById('kitchen-log-form')
    const aboveForm = page
      ? Array.from(page.childNodes).filter(n => n !== form).map(n => n.textContent ?? '').join('')
      : ''
    return head + aboveForm
  }

  // Asserted at BOTH widths: the band that carried the defect was width-branched (desktop metric
  // tiles / phone one-line summary), so a guard that only ran one branch could miss the other.
  async function bandNeverClaimsLoggedProduction() {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // The band as it stands before anyone touches the form: the day's PLAN, and nothing that
    // claims produced/complete/short figures.
    const bandAtRest = bandText()
    for (const claim of LOGGED_PRODUCTION_CLAIMS) {
      expect(document.body.textContent).not.toMatch(claim)
    }

    // The floor worker types what they made for Ayam Bakar (plan 20). Staged only — the day's
    // logged production is still exactly what it was, because nothing has been submitted.
    const ayam = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    await act(async () => {
      fireEvent.change(ayam, { target: { value: '7' } })
      await Promise.resolve()
    })
    expect((ayam as HTMLInputElement).value).toBe('7')
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()

    // The band is unmoved — it states the plan, which unsaved input cannot change. Not one figure
    // above the form may move on a keystroke, whatever it is called…
    expect(bandText()).toBe(bandAtRest)
    // …and the surface still makes no produced/complete/short claim, nor the opposite claim that
    // nothing has been logged today, on the strength of what is only typed into the form.
    for (const claim of LOGGED_PRODUCTION_CLAIMS) {
      expect(document.body.textContent).not.toMatch(claim)
    }
  }

  it('DD-7: phone — typing a quantity moves no "made / % complete / vs plan" figure on the band, and no "nothing logged today" claim is derived from unsaved input', async () => {
    await bandNeverClaimsLoggedProduction()
  })

  it('DD-7: desktop — the same invariant holds on the wide band', async () => {
    setDesktopMatchMedia(true)
    await bandNeverClaimsLoggedProduction()
  })
})

// task 10b — Planned/Off-plan group split
describe('OD-K-5: Planned/Off-plan group split (desktop)', () => {
  it('a planned item lands in Planned; an unplanned one lands in Off-plan', async () => {
    setDesktopMatchMedia(true)
    mockListActiveWipItems.mockResolvedValue(WIP_ITEMS_WITH_OFFPLAN)
    await renderPage()
    await waitFor(() => screen.getByText('Sambal Matah'))

    // both group headers render with the right counts (2 planned, 1 off-plan)
    const plannedHead = screen.getByRole('button', { name: /collapse planned today/i }).closest('tr')!
    expect(within(plannedHead).getByText('2')).toBeInTheDocument()
    const offplanHead = screen.getByRole('button', { name: /collapse off-plan/i }).closest('tr')!
    expect(within(offplanHead).getByText('1')).toBeInTheDocument()
  })
})

// task 10c — search-mini filters rows (desktop)
describe('OD-K-5: search-mini filters', () => {
  it('typing in Find a dish narrows the table to matching dishes', async () => {
    setDesktopMatchMedia(true)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    fireEvent.change(screen.getByRole('searchbox', { name: /find a dish/i }), { target: { value: 'nasi' } })
    // only Nasi Goreng remains
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('I7 / D-E1: hydrates the search from ?q= on load (a refreshed/shared link reproduces the filtered view)', async () => {
    setDesktopMatchMedia(true)
    await renderPage(VIEWER_MEMBER, '/mos/kitchen/log?q=nasi')
    await waitFor(() => screen.getByText('Nasi Goreng'))

    // The search box is pre-filled from the URL and the table is already narrowed — no retype.
    expect(screen.getByRole('searchbox', { name: /find a dish/i })).toHaveValue('nasi')
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })
})

// task 10d — category chip filters (desktop)
describe('OD-K-5: category filter narrows rows', () => {
  it('choosing a category shows only that category\'s dishes', async () => {
    setDesktopMatchMedia(true)
    mockListActiveWipItems.mockResolvedValue([
      { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
      { id: 'w2', name: 'Nasi Goreng', category: 'Rice' },
    ])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    fireEvent.change(screen.getByRole('combobox', { name: /category/i }), { target: { value: 'Rice' } })
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })
})

// task 10e — Discard (confirmed) resets all staged qty_porsi to 0
describe('OD-K-5: Discard resets staged entries (confirmed)', () => {
  it('confirmed Discard clears every staged qty back to 0', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // stage Ayam Bakar to 20 (on-plan, no note)
    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })
    expect((ayamInput as HTMLInputElement).value).toBe('20')

    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    // The house dialog, not the browser's: it is labelled in the app's own locale.
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^discard$/i }))
    // v4: qty resets to BLANK (not "0") — a blank field is the at-rest state, distinguishable
    // from a deliberate zero (wip-item-stepper.tsx).
    await waitFor(() => {
      expect((ayamInput as HTMLInputElement).value).toBe('')
    })
  })

  it('cancelled Discard keeps the staged entries', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })

    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect((ayamInput as HTMLInputElement).value).toBe('20') // unchanged
  })
})

// task 10f — sticky-footer tally reads {stagedCount} dishes · {madeSoFar} units
describe('OD-K-5: sticky-footer tally', () => {
  it('tally reads the staged dish count + units made so far', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // stage Ayam Bakar (plan=20) to 20 → stagedCount=1, madeSoFar=20
    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })

    expect(screen.getByText(/1 dish/i)).toBeInTheDocument()
    expect(screen.getByText(/20 portions/i)).toBeInTheDocument()
  })
})

// task 10g — reflow branch (P-4): exactly ONE of table|cards in the DOM (shared DataTable)
describe('OD-K-5: reflow = one branch in the DOM (P-4)', () => {
  it('phone: the shared DataTable cards render; the desktop <table> is absent', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    // P-4 invariant: phone renders the shared card reflow (.dt-cards), NOT the desktop <table>
    expect(screen.queryByRole('table', { name: /café production log/i })).toBeNull()
    expect(document.querySelector('.dt-cards')).not.toBeNull()
    // the Planned/Off-plan groups render on phone via the shared DataTable collapse toggle
    expect(screen.getByRole('button', { name: /collapse planned today/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /collapse off-plan/i })).toBeInTheDocument()
  })

  it('desktop: the <table> renders; the phone card reflow is absent', async () => {
    setDesktopMatchMedia(true)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(screen.getByRole('table', { name: /café production log/i })).toBeInTheDocument()
    expect(document.querySelector('.dt-cards')).toBeNull()
  })
})

// GAP-4 / OD-REDESIGN-91 #9 — the route-leave dirty guard. The live-reproduced loss (staged
// quantities silently vanishing on navigation) must become impossible: leaving with staged-but-
// unsubmitted entries asks stay/discard. Mounted under a DATA router (the guard's useBlocker seam,
// matching the app's createBrowserRouter) — the rest of this suite uses a bare <MemoryRouter>,
// under which the guard degrades to inert, which is why those tests stay green unchanged.
describe('GAP-4/#9: route-leave dirty guard for staged quantities', () => {
  async function renderPageInDataRouter() {
    mockUseAuth.mockReturnValue(VIEWER_MEMBER)
    const router = createMemoryRouter(
      [
        {
          path: '/mos/kitchen/log',
          element: (
            <>
              <KitchenLogPage />
              <Link to="/mos/elsewhere">Go to dashboard</Link>
            </>
          ),
        },
        { path: '/mos/elsewhere', element: <h1>Elsewhere</h1> },
      ],
      { initialEntries: ['/mos/kitchen/log'] },
    )
    await act(async () => {
      render(<RouterProvider router={router} />)
      await Promise.resolve()
    })
    await waitFor(() => screen.getByText('Ayam Bakar'))
  }

  it('with NO staged entries, navigation leaves freely (no prompt)', async () => {
    await renderPageInDataRouter()

    await userEvent.click(screen.getByRole('link', { name: /go to dashboard/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })

  it('with staged entries, "stay" (Cancel) vetoes navigation and keeps the entries', async () => {
    await renderPageInDataRouter()

    // Stage a quantity for Ayam Bakar — the page now holds unsaved work.
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '5' } })
      await Promise.resolve()
    })

    await userEvent.click(screen.getByRole('link', { name: /go to dashboard/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /stay on this page/i }))
    // Vetoed — still on the log page, the staged qty intact.
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Elsewhere' })).toBeNull()
    expect((screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i }) as HTMLInputElement).value).toBe('5')
  })

  it('with staged entries, "discard" completes the navigation', async () => {
    await renderPageInDataRouter()

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '5' } })
      await Promise.resolve()
    })

    await userEvent.click(screen.getByRole('link', { name: /go to dashboard/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /discard and leave/i }))
    expect(await screen.findByRole('heading', { name: 'Elsewhere' })).toBeInTheDocument()
  })
})
