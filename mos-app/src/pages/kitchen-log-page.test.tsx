// KitchenLogPage tests — TDD, AC-tagged
// Covers: AC-020/021/022/030 (submit/validation/transfer cap), all states (loading,
// empty, error, submitting, success, offline-in-every-state RI-2, unauthenticated),
// BU-resolution failure (#3), inline note reveal (#6), touch floors (RI-3);
// #233 stream context: AC-002 (default from shared.default_stream(), switchable),
// FR-002 (no default → explicit choice), FR-005 (the enumerable catalog only), AC-004 (no
// raw-material input), AC-006 (effective target + already-logged, stream-scoped),
// AC-012b frontend half (rows carry the SELECTED stream pair).

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
  // `streamCatalogFrom` is pure catalog arithmetic, not IO — the page uses it to build the
  // stream picker out of the loaded pairs, so the real one is kept and only the reads
  // are mocked.
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>(
    '@/lib/db/kitchen-logs',
  )
  return {
    streamCatalogFrom: actual.streamCatalogFrom,
    listActiveWipItems: vi.fn(),
    listCaptureFormItems: vi.fn(),
    fetchPlanMap: vi.fn(),
    fetchStockMap: vi.fn(),
    fetchActualsMap: vi.fn(),
    listStreamPairs: vi.fn(),
    resolveKitchenBuId: vi.fn(),
    insertKitchenLogBatch: vi.fn(),
  }
})
// The person's own default stream — the ONE shape-validated resolver (default-stream.ts,
// #234 consolidation), shared with the stock page.
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
// The missing-item report (AC-013) files through the Daily Log data layer — mocked like the rest.
vi.mock('@/lib/db/ops-log', () => ({ addLogEntry: vi.fn() }))
import {
  listCaptureFormItems,
  fetchActualsMap,
  fetchPlanMap,
  fetchStockMap,
  listStreamPairs,
  resolveKitchenBuId,
  insertKitchenLogBatch,
} from '@/lib/db/kitchen-logs'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listActiveBranches } from '@/lib/db/branches'
import { streamKey } from '@/lib/kitchen-action-label'
import type {
  BranchOption,
  CaptureFormItem,
  ProductionStream,
  StreamPair,
} from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockListCaptureFormItems = vi.mocked(listCaptureFormItems)
const mockFetchPlanMap = vi.mocked(fetchPlanMap)
const mockFetchStockMap = vi.mocked(fetchStockMap)
const mockFetchActualsMap = vi.mocked(fetchActualsMap)
const mockFetchDefaultStream = vi.mocked(fetchDefaultStream)
const mockListStreamPairs = vi.mocked(listStreamPairs)
const mockResolveKitchenBuId = vi.mocked(resolveKitchenBuId)
const mockInsertKitchenLogBatch = vi.mocked(insertKitchenLogBatch)
const mockListActiveBranches = vi.mocked(listActiveBranches)

// The canonical branch catalog (OD-WAY-39) — "Transfer to Bungur" is a transfer whose
// destination IS the origin. The ROASTERY is deliberately in the catalog: it is a branch
// (a transfer destination) but carries NO production stream (FR-005, OD-WAY-42), so it
// must never surface in the stream picker — asserted below.
const BRANCH_RUMAH_RAMES: BranchOption = {
  id: '30000000-0000-0000-0000-0000000000b1', code: 'rumah_rames', name: 'Rumah Rames',
}
const BRANCH_RADIANT: BranchOption = {
  id: '30000000-0000-0000-0000-0000000000b2', code: 'radiant', name: 'Radiant',
}
const BRANCH_GORDI_HQ: BranchOption = {
  id: '30000000-0000-0000-0000-0000000000b3', code: 'gordi_hq', name: 'Gordi HQ',
}
const BRANCH_ROASTERY: BranchOption = {
  id: '30000000-0000-0000-0000-0000000000b4', code: 'roastery', name: 'Roastery',
}
const BRANCHES: BranchOption[] = [BRANCH_GORDI_HQ, BRANCH_RADIANT, BRANCH_ROASTERY, BRANCH_RUMAH_RAMES]
// The enumerable stream catalog (FR-005): the live stream Teams' pairs — roastery has none.
const STREAM_PAIRS: StreamPair[] = [BRANCH_GORDI_HQ, BRANCH_RADIANT, BRANCH_RUMAH_RAMES].flatMap(
  b => (['kitchen', 'bar'] as const).map(activity => ({ branch_id: b.id, activity })),
)
// The person's own default stream (FR-001) — what the default-stream.ts resolver returns
// (already resolved against the branch catalog).
const DEFAULT_STREAM: ProductionStream = { branch: BRANCH_RUMAH_RAMES, activity: 'kitchen' }
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
      email: 'budi@example.test',
      archived_at: null,
      must_change_password: false,
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

// Capture-form items with their OFFERED units (#234): w1 carries a transferable alternate
// (→ the change-unit affordance renders, AC-005), w2 has only its default (→ fixed text,
// no affordance). The reader already filtered non-transferable alternates (AC-015 —
// asserted in kitchen-logs.test.ts), so nothing non-offerable appears here.
const WIP_ITEMS: CaptureFormItem[] = [
  {
    id: 'w1', name: 'Ayam Bakar', category: 'Main',
    units: [
      { id: 'u1-porsi', name: 'porsi', is_default: true },
      { id: 'u1-botol', name: 'botol', is_default: false },
    ],
  },
  {
    id: 'w2', name: 'Nasi Goreng', category: 'Main',
    units: [{ id: 'u2-porsi', name: 'porsi', is_default: true }],
  },
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
import { rememberStream } from '@/lib/cafe-stream'

beforeEach(() => {
  vi.clearAllMocks()
  // #440: the Café stream is remembered for the whole module (sessionStorage), so a test that
  // switches streams would otherwise seed the NEXT test's opening stream. Clear it per test.
  rememberStream(null)
  mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS)
  mockListActiveBranches.mockResolvedValue(BRANCHES)
  mockListStreamPairs.mockResolvedValue(STREAM_PAIRS)
  mockFetchDefaultStream.mockResolvedValue(DEFAULT_STREAM)
  mockFetchPlanMap.mockResolvedValue(PLAN_MAP)
  mockFetchStockMap.mockResolvedValue(STOCK_MAP)
  mockFetchActualsMap.mockResolvedValue({})
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
    mockListCaptureFormItems.mockReturnValue(new Promise(() => {}))
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

  // #410: the prompt + button were hardcoded English while the rest of the page is translated.
  it('sign-in prompt renders Indonesian in the id locale', async () => {
    localStorage.setItem('mos.locale', 'id')
    try {
      mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
      const { I18nProvider } = await import('@/i18n/I18nProvider')
      render(
        <I18nProvider>
          <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/log']}>
            <Routes>
              <Route path="/kitchen/log" element={<KitchenLogPage />} />
            </Routes>
          </MemoryRouter>
        </I18nProvider>,
      )
      expect(await screen.findByRole('link', { name: 'Masuk' })).toBeInTheDocument()
      expect(screen.getByText('Anda perlu masuk untuk menggunakan Log Kafe.')).toBeInTheDocument()
      expect(screen.queryByText(/sign in/i)).toBeNull()
    } finally {
      localStorage.removeItem('mos.locale')
    }
  })
})

// ── empty state (no WIP items) ────────────────────────────────────────────────
describe('Empty state — no WIP items (FR-011)', () => {
  it('shows "No active WIP items" message', async () => {
    mockListCaptureFormItems.mockResolvedValue([])
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/no active wip items/i)).toBeInTheDocument()
    })
  })

  // Half B convergence: missing WIP-item configuration is never the 'quiet' ✓ earned-all-clear
  // glyph — it reads as "nothing to log, all done" when it actually means "nothing CAN be
  // logged until an ops lead adds items". 'blank' (—) is the honest "no source configured" read.
  it("Half B convergence: uses the 'blank' (never 'quiet' ✓) EmptyState variant", async () => {
    mockListCaptureFormItems.mockResolvedValue([])
    await renderPage()
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toHaveAttribute('data-empty-variant', 'blank')
    })
    expect(screen.queryByText('✓')).not.toBeInTheDocument()
  })

  // AC-013: the DD-WAY-29 gate can empty this list entirely (nothing confirmed yet) —
  // the report route must be reachable from the empty state too.
  it('AC-013: the missing-item report route is visible even when the gate empties the list', async () => {
    mockListCaptureFormItems.mockResolvedValue([])
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /report it/i })).toBeInTheDocument()
    })
  })
})

// ── error state ───────────────────────────────────────────────────────────────
describe('Error state — fetch failure', () => {
  it('shows retry message when WIP fetch fails', async () => {
    mockListCaptureFormItems.mockRejectedValue(new Error('network error'))
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/couldn’t load the dish list/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  it('retries on retry click', async () => {
    mockListCaptureFormItems
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

  // AC-013 (FR-012): an item absent under the DD-WAY-29 gate must never read as a bug with
  // no exit — the capture surface carries a visible route to report it missing.
  it('AC-013: offers a visible route to report a missing item on the loaded surface', async () => {
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /report it/i })).toBeInTheDocument()
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

    // w1: transfer plan 10 (absolute — FR-014 scopes stock subtraction to production);
    // tersedia 9. Log 9 with a note (off-plan 9 != 10 needs a note, but 9 <= tersedia
    // so it's NOT rejected for availability).
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
    // Enough available for the full plan: transfer target = the ABSOLUTE plan (10,
    // FR-014 — stock is never subtracted on transfers), tersedia 12 covers it.
    mockFetchStockMap.mockResolvedValue({
      w1: { stok: 3, tersedia: 12 },
      w2: { stok: 0, tersedia: 0 },
    })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    // log exactly the plan (10) — on-target, no note, and 10 <= tersedia 12 → no cap
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '10' } })
      await Promise.resolve()
    })

    expect((qtyInput as HTMLInputElement).value).toBe('10')
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

    // Set Nasi Goreng (plan=12, stok 0 → effective target 12, FR-014) to exactly 12
    // (on-target — no note required)
    const nasiInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(nasiInput, { target: { value: '12' } })

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
    expect(line.wip_item_id).toBe('w2')
    expect(line.qty_porsi).toBe(12)
    // #234 / FR-020: nothing was changed, so the row is bound to the item's DEFAULT unit —
    // the common path entered no unit, yet the payload names its coordinate.
    expect(line.item_unit_id).toBe('u2-porsi')
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

    // Set Nasi Goreng (plan=12, stok 0 -> effective target 12, FR-014) to exactly 12 (on-target)
    const nasiInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(nasiInput, { target: { value: '12' } })

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

// ── #234 / FR-021/022: the change-unit path binds the submitted row ────────────
describe('FR-021/022: "change unit" re-binds the row to the chosen item-unit', () => {
  it('choosing the alternate on a two-unit item submits THAT item-unit id; the one-unit item shows no affordance', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // AC-005 at the surface: w1 (two offered units) carries the affordance, w2 does not.
    expect(screen.getByRole('button', { name: /change unit for ayam bakar/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change unit for nasi goreng/i })).toBeNull()

    // The deliberate extra click, then the alternate.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /change unit for ayam bakar/i }))
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox', { name: /unit for ayam bakar/i }), {
        target: { value: 'u1-botol' },
      })
      await Promise.resolve()
    })

    // w1: plan 20, stok 3 → effective target 17; log 17 (on-target, no note gate).
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '17' } })
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^submit/i })[0])
      await Promise.resolve()
    })

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    // FR-022: the row is bound to the ALTERNATE's item-unit id — the ERP coordinate IS the
    // unit; no separate unit field, no qty conversion.
    expect(mockInsertKitchenLogBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({ wip_item_id: 'w1', qty_porsi: 17, item_unit_id: 'u1-botol' }),
    ])
  })
})

// ── submitting state ──────────────────────────────────────────────────────────
describe('Submitting state', () => {
  it('shows spinner and disables Submit button while submitting', async () => {
    // Never resolves — stays in submitting state
    mockInsertKitchenLogBatch.mockReturnValue(new Promise(() => {}))
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Set Nasi Goreng (plan=12, stok 0 -> effective target 12, FR-014) to exactly 12 (on-target)
    const nasiInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(nasiInput, { target: { value: '12' } })

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

    // Set Nasi Goreng (plan=12, stok 0 -> effective target 12, FR-014) to exactly 12 (on-target)
    const nasiInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(nasiInput, { target: { value: '12' } })

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
    mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS)
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
    mockListCaptureFormItems.mockRejectedValue(new Error('network error'))
    await renderPage()
    await waitFor(() => {
      // an explicit offline alert is present alongside Retry
      expect(screen.getByRole('alert', { name: /offline/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  it('RI-2: surfaces the offline indicator in the LOADING branch', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    mockListCaptureFormItems.mockReturnValue(new Promise(() => {}))
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

    // Nasi Goreng: plan 12, stok 0 -> effective target 12 (FR-014) -> on-target, no note
    const nasiInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(nasiInput, { target: { value: '12' } })

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
    mockListCaptureFormItems.mockRejectedValue(new Error('network error'))
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
const WIP_ITEMS_WITH_OFFPLAN: CaptureFormItem[] = [
  ...WIP_ITEMS,
  // off-plan for Production
  { id: 'w3', name: 'Sambal Matah', category: 'Side', units: [{ id: 'u3-porsi', name: 'porsi', is_default: true }] },
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
    mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS_WITH_OFFPLAN)
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
    mockListCaptureFormItems.mockResolvedValue([
      { id: 'w1', name: 'Ayam Bakar', category: 'Main', units: [{ id: 'u1-porsi', name: 'porsi', is_default: true }] },
      { id: 'w2', name: 'Nasi Goreng', category: 'Rice', units: [{ id: 'u2-porsi', name: 'porsi', is_default: true }] },
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

// ─────────────────────────────────────────────────────────────────────────────
// #233 — capture surface with stream context, all streams (bar-capture spec).
// AC-002 (default pre-selected + switchable), FR-002 (no default → explicit choice),
// FR-005 (the catalog's streams, roastery never one), AC-004 (no raw-material input),
// AC-006 (plan-as-placeholder + effective target + already-logged + note-on-blur,
// stream-scoped), AC-012b frontend half (the submitted rows carry the SELECTED pair).
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-002 / FR-001: the capture surface opens on the person's own stream and stays switchable", () => {
  it('AC-002: pre-selects the shared.default_stream() pair — not a hardcoded branch', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'bar' })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const picker = screen.getByRole('combobox', { name: /production stream/i })
    expect(picker).toHaveValue(streamKey(BRANCH_RADIANT.id, 'bar'))
    // …and the stream-scoped reads were asked for THAT stream, not a constant.
    const expected = expect.objectContaining({
      branch: expect.objectContaining({ id: BRANCH_RADIANT.id }),
      activity: 'bar',
    })
    expect(mockFetchPlanMap).toHaveBeenCalledWith(expect.any(String), expected)
    expect(mockFetchStockMap).toHaveBeenCalledWith(expect.any(String), expected)
    expect(mockFetchActualsMap).toHaveBeenCalledWith(expect.any(String), expected)
  })

  it('issue 440: the stream reads in the PAGE HEAD — the one place every Café surface states it', async () => {
    // The picker used to live in the toolbar's scope block, beside the movement control, on the
    // two surfaces that had one at all. #440 moved it into the shared head so a person walking
    // Log → Plan → Stock reads which books they are in from the same spot every time.
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'bar' })
    const { container } = await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const head = container.querySelector('[data-testid="page-head"]') as HTMLElement
    const picker = within(head).getByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.selectedOptions[0].textContent).toBe('Radiant · Bar')
    // and nowhere else on the surface — two pickers for one fact is how they come to disagree
    expect(screen.getAllByRole('combobox', { name: /production stream/i })).toHaveLength(1)
  })

  it('AC-002/AC-012b (frontend half): switching streams re-scopes plan/stock/actuals and the submitted rows carry the SWITCHED pair', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Default is (Rumah Rames, kitchen); the barista helping at GHQ switches (FR-003).
    const picker = screen.getByRole('combobox', { name: /production stream/i })
    await act(async () => {
      fireEvent.change(picker, { target: { value: streamKey(BRANCH_GORDI_HQ.id, 'bar') } })
      await Promise.resolve()
    })
    await waitFor(() => screen.getByText('Nasi Goreng'))

    const switched = expect.objectContaining({
      branch: expect.objectContaining({ id: BRANCH_GORDI_HQ.id }),
      activity: 'bar',
    })
    expect(mockFetchPlanMap).toHaveBeenCalledWith(expect.any(String), switched)
    expect(mockFetchStockMap).toHaveBeenCalledWith(expect.any(String), switched)
    expect(mockFetchActualsMap).toHaveBeenCalledWith(expect.any(String), switched)

    // Log Nasi Goreng on-target (plan 12, stok 0 → effective 12) and submit.
    const nasiInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(nasiInput, { target: { value: '12' } })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^submit/i })[0])
      await Promise.resolve()
    })

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    // The row carries the PICKER's pair (AC-012b's frontend half) — never a constant.
    expect(mockInsertKitchenLogBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        wip_item_id: 'w2', qty_porsi: 12,
        branch_id: BRANCH_GORDI_HQ.id, activity: 'bar',
      }),
    ])
  })
})

describe('FR-002: no stream-linked primary Team → an explicit stream choice is required before capture', () => {
  it('renders the "choose stream" placeholder, fetches no stream-scoped data, and blocks Submit with the reason', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const picker = screen.getByRole('combobox', { name: /production stream/i })
    expect(picker).toHaveValue('')
    expect(screen.getByRole('option', { name: /choose stream/i })).toBeInTheDocument()
    // No stream → nothing to scope the plan/stock/actuals reads to (never a guess).
    expect(mockFetchPlanMap).not.toHaveBeenCalled()
    expect(mockFetchStockMap).not.toHaveBeenCalled()
    expect(mockFetchActualsMap).not.toHaveBeenCalled()
    // Submit is disabled up front and the reason is named beside it.
    expect(screen.getByText(/choose a production stream before submitting/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^submit/i })[0]).toBeDisabled()
  })

  it('choosing a stream from the picker loads it and capture proceeds against the chosen pair', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const picker = screen.getByRole('combobox', { name: /production stream/i })
    await act(async () => {
      fireEvent.change(picker, { target: { value: streamKey(BRANCH_RADIANT.id, 'bar') } })
      await Promise.resolve()
    })
    await waitFor(() => screen.getByText('Nasi Goreng'))
    expect(screen.queryByText(/choose a production stream before submitting/i)).toBeNull()

    const nasiInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(nasiInput, { target: { value: '12' } })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^submit/i })[0])
      await Promise.resolve()
    })
    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    expect(mockInsertKitchenLogBatch.mock.calls[0][0][0]).toEqual(
      expect.objectContaining({ branch_id: BRANCH_RADIANT.id, activity: 'bar' }),
    )
  })
})

describe('FR-005: the picker offers exactly the enumerable stream catalog — the roastery is never a stream', () => {
  it('lists all six {branch × activity} streams and no roastery option', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const picker = screen.getByRole('combobox', { name: /production stream/i })
    const options = within(picker).getAllByRole('option')
    // Six streams — no placeholder (a default resolved), no roastery, no seventh.
    expect(options).toHaveLength(6)
    const labels = options.map(o => o.textContent)
    // CANONICAL catalog names (OD-WAY-39) — never the 'Bungur' destination alias:
    // a Rumah Rames barista picking their own stream reads 'Rumah Rames', not the
    // incumbent's transfer-destination label.
    for (const branchLabel of ['Gordi HQ', 'Radiant', 'Rumah Rames']) {
      for (const activity of ['Kitchen', 'Bar']) {
        expect(labels).toContain(`${branchLabel} · ${activity}`)
      }
    }
    expect(labels.join(' ')).not.toMatch(/bungur/i)
    expect(within(picker).queryByRole('option', { name: /roastery/i })).toBeNull()
  })
})

describe("AC-004 / FR-010: no raw-material input on any stream's form; fixed unit, no unit input", () => {
  it("a bar stream's form carries one qty input per item + fixed unit label — no raw-material field, no unit input", async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_GORDI_HQ, activity: 'bar' })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Exactly one typed-qty input per confirmed item — nothing else numeric to fill.
    const qtyInputs = screen.getAllByRole('spinbutton')
    expect(qtyInputs).toHaveLength(WIP_ITEMS.length)
    // No raw-material capture anywhere (OD-WAY-45: raw usage is derived, never typed).
    expect(screen.queryByText(/raw material|bahan baku/i)).toBeNull()
    expect(screen.queryByRole('spinbutton', { name: /raw|bahan/i })).toBeNull()
    // No note fields at rest (the variance note is gate-revealed, not a standing input).
    expect(screen.queryByRole('textbox')).toBeNull()
    // Each row shows its fixed unit as TEXT beside the qty (FR-020) — no unit input:
    // the only comboboxes on the surface are the stream picker and the category filter.
    expect(screen.getAllByText('porsi')).toHaveLength(WIP_ITEMS.length)
    for (const combobox of screen.getAllByRole('combobox')) {
      const name = combobox.getAttribute('aria-label') ?? ''
      expect(name).toMatch(/production stream|category/i)
    }
  })
})

describe('AC-006 / FR-014/015: plan-as-placeholder + effective target + already-logged + note-on-blur, stream-scoped', () => {
  // The spec's own numbers: plan 10, already logged 4, 2 in stock → effective target 8.
  const AC6_PLAN = { w1: { [PRODUCE_KEY]: 10 } }
  const AC6_STOCK = { w1: { stok: 2, tersedia: 2 }, w2: { stok: 0, tersedia: 0 } }
  const AC6_ACTUALS = { w1: { [PRODUCE_KEY]: 4 } }

  beforeEach(() => {
    mockFetchPlanMap.mockResolvedValue(AC6_PLAN)
    mockFetchStockMap.mockResolvedValue(AC6_STOCK)
    mockFetchActualsMap.mockResolvedValue(AC6_ACTUALS)
  })

  it('AC-006: the plan seeds the placeholder, "logged 4" renders, and qty == plan − stock passes without a note', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const qty = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    // Plan-as-placeholder (FR-015): the greyed anchor is the plan, not an entry.
    expect(qty).toHaveAttribute('placeholder', '10')
    // The running "already logged N" actuals (FR-014) — from the DB, not the form.
    const meta = document.querySelector('.kls-meta')
    expect(meta?.textContent).toMatch(/logged\s*4/)

    // Effective target = plan − stock = 8 (FR-014): logging exactly 8 is on-target.
    await act(async () => {
      fireEvent.change(qty, { target: { value: '8' } })
      fireEvent.blur(qty)
      await Promise.resolve()
    })
    expect(screen.queryByText(/note required — off plan/i)).toBeNull()
  })

  it('AC-006: a variant qty reveals the required-note gate on blur', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const qty = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    // 10 is the RAW plan — off the effective target (8), so the gate must reveal on blur.
    await act(async () => {
      fireEvent.change(qty, { target: { value: '10' } })
      await Promise.resolve()
    })
    expect(screen.queryByText(/note required — off plan/i)).toBeNull() // not before blur
    await act(async () => {
      fireEvent.blur(qty)
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByText(/note required — off plan/i)).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /note for ayam bakar/i })).toBeInTheDocument()
    })
  })

  it("AC-006 stream-scoped: switching streams shows the CHOSEN stream's already-logged, not the old one's", async () => {
    mockFetchActualsMap.mockImplementation(async (_date, stream) =>
      stream.branch.id === BRANCH_GORDI_HQ.id ? { w1: { [PRODUCE_KEY]: 9 } } : AC6_ACTUALS,
    )
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(document.querySelector('.kls-meta')?.textContent).toMatch(/logged\s*4/)

    const picker = screen.getByRole('combobox', { name: /production stream/i })
    await act(async () => {
      fireEvent.change(picker, { target: { value: streamKey(BRANCH_GORDI_HQ.id, 'kitchen') } })
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(document.querySelector('.kls-meta')?.textContent).toMatch(/logged\s*9/)
    })
  })
})

describe('stale-response race: an older stream fetch resolving LAST never lands under a newer stream', () => {
  it('the newer switch owns the form — the stale response is discarded, and the picker stays mounted mid-switch', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Switch #1 → (Radiant, bar): its plan fetch HANGS — it will resolve last, stale.
    let resolveStale!: (map: Record<string, Partial<Record<string, number>>>) => void
    mockFetchPlanMap.mockImplementationOnce(
      () => new Promise(res => { resolveStale = res }),
    )
    const picker = screen.getByRole('combobox', { name: /production stream/i })
    await act(async () => {
      fireEvent.change(picker, { target: { value: streamKey(BRANCH_RADIANT.id, 'bar') } })
      await Promise.resolve()
    })

    // While switch #1 is in flight the picker MUST stay mounted (FR-003 — a slow
    // stream is never a dead end; getByRole throws here if the switch unmounts it).
    const pickerDuringLoad = screen.getByRole('combobox', { name: /production stream/i })

    // Switch #2 → (Gordi HQ, kitchen): the LATEST read — resolves immediately (w2 → 33).
    mockFetchPlanMap.mockResolvedValueOnce({ w2: { [PRODUCE_KEY]: 33 } })
    await act(async () => {
      fireEvent.change(pickerDuringLoad, {
        target: { value: streamKey(BRANCH_GORDI_HQ.id, 'kitchen') },
      })
      await Promise.resolve()
    })
    await waitFor(() => screen.getByText('Nasi Goreng'))
    expect(
      screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i }),
    ).toHaveAttribute('placeholder', '33')

    // NOW the stale switch-#1 response arrives (w2 → 77). It must be discarded: without
    // the request-generation guard it would re-seed the lines with Radiant-bar's plan
    // under the Gordi-HQ label — and submit would file those rows to GHQ's books.
    await act(async () => {
      resolveStale({ w2: { [PRODUCE_KEY]: 77 } })
      await Promise.resolve()
    })
    expect(screen.getByRole('combobox', { name: /production stream/i })).toHaveValue(
      streamKey(BRANCH_GORDI_HQ.id, 'kitchen'),
    )
    expect(
      screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i }),
    ).toHaveAttribute('placeholder', '33')
  })
})

// ── AC-007 (#235): the destination picker, both movement classes, both surfaces ─
// FR-013. The movement control IS the destination picker — there is no second surface for
// movements — and the list it offers is derived from the branch catalog, so both classes
// come out of one derivation:
//
//   CROSS-BRANCH        any branch that is not the origin's. "Another branch's bar" and the
//                       kitchen's existing cross-branch transfers are the SAME offer, because
//                       a destination is a branch and carries no activity (OD-WAY-44).
//   INTRA-BRANCH        the origin's own branch, offered from either activity surface and
//                       recorded as destination = own branch. Unqualified it reads as a second
//                       entry for the person's own branch name, which is why the counterpart
//                       activity rides along as a display gloss.
//
// The gloss is the assertable half of "offerable": these tests read the option the way a
// barista does, not by pulling a branch id out of the component's props.
describe('AC-007: destinations cover both movement classes from both activity surfaces (FR-013)', () => {
  it('AC-007: the BAR surface offers another branch AND its own branch qualified as the kitchen', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RUMAH_RAMES, activity: 'bar' })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Intra-branch: destination = own branch, read as "to our kitchen" (bar → own kitchen).
    expect(
      screen.getByRole('tab', { name: /transfer to bungur within branch · kitchen/i }),
    ).toBeInTheDocument()

    // Cross-branch: another branch, offered exactly as it always was — a bar → bar movement
    // and a kitchen → another branch movement are one and the same offer.
    expect(screen.getByRole('tab', { name: 'Transfer to Radiant' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Transfer to Gordi HQ' })).toBeInTheDocument()
  })

  it('AC-007: the KITCHEN surface offers its own branch qualified as the bar, with the incumbent cross-branch transfers preserved', async () => {
    // The default fixture stream is (Rumah Rames, kitchen) — the incumbent's own stream, whose
    // cross-branch labels are the ones OD-K-1 parity is measured against. They must come
    // through this change byte-identical; only the own-branch entry gains its qualifier.
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(
      screen.getByRole('tab', { name: /transfer to bungur within branch · bar/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Transfer to Radiant' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Production' })).toBeInTheDocument()
  })

  it('AC-007: the qualified option follows the ORIGIN, not a hardcoded branch', async () => {
    // On a Radiant stream it is RADIANT that is intra-branch and Bungur that is a cross-branch
    // destination — the mirror image of the two tests above. Without this, a qualifier pinned
    // to the incumbent's one branch would pass both of them.
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'bar' })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(
      screen.getByRole('tab', { name: /transfer to radiant within branch · kitchen/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Transfer to Bungur' })).toBeInTheDocument()
  })

  it('AC-007: with no resolved stream (FR-002) nothing is intra-branch yet, so no option is qualified', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.queryByRole('tab', { name: /within branch/i })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Transfer to Bungur' })).toBeInTheDocument()
  })

  it('AC-007: an intra-branch movement is submitted as destination = the origin branch', async () => {
    // The offer is only half of it — the row it produces is what the held arm (AC-008) reads.
    // Destination equals origin, and the activity travels as the row's own stream, NOT as a
    // property of the destination: there is no destination-activity field to send (OD-WAY-44).
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RUMAH_RAMES, activity: 'bar' })
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to bungur within branch · kitchen/i }))
      await Promise.resolve()
    })

    // w1: tersedia 9, no plan for this movement → 2 is under the cap and off-plan, so the
    // variance note is required (unchanged gate — an intra-branch movement is a transfer like
    // any other on the way in; what differs is only what dispatch does with it).
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '2' } })
      fireEvent.blur(qtyInput)
      await Promise.resolve()
    })
    const note = screen.getByRole('textbox', { name: /note for ayam bakar/i })
    await act(async () => {
      fireEvent.change(note, { target: { value: 'cut fruit to the kitchen' } })
      await Promise.resolve()
    })

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /^submit/i })[0])
      await Promise.resolve()
    })

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    expect(mockInsertKitchenLogBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        wip_item_id: 'w1', qty_porsi: 2,
        action: 'transfer',
        branch_id: BRANCH_RUMAH_RAMES.id,
        destination_branch_id: BRANCH_RUMAH_RAMES.id,
        activity: 'bar',
      }),
    ])
  })
})

// ── issue 455: the browser tab names the same module the rail and breadcrumb do ──────────
// Asserted against the CATALOG, not a literal: pinning "Log · Café — Gordi MOS" here would
// pass just as happily with the retired `nav.kitchen.*` strings copied into it.
import { messages } from '@/i18n/messages'
import { interpolate } from '@/i18n/use-t'

function cafeDocTitle(leaf: keyof typeof messages.en): string {
  return interpolate(messages.en['common.docTitle'], {
    page: `${messages.en[leaf]} · ${messages.en['nav.cafe']}`,
  })
}

describe('issue 455: document title', () => {
  it('titles the tab from the Café nav label, not the retired kitchen one', async () => {
    await renderPage()
    await waitFor(() => expect(document.title).toBe(cafeDocTitle('nav.cafe.log')))
  })
})
