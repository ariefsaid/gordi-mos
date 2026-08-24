// KitchenPlanPage tests — TDD, AC-tagged.
// S2 — /mos/kitchen/plan — the plan EDITOR (ops_lead/admin) + the read-only
// 14-day "pesanan" HORIZON (member). Design authority: design-plan §S2.
// Proves (unit): AC-024 (member sees the 14-day forward horizon read-only — no
// logging/approve affordance), FR-030/031 (ops_lead edits a cell → upsert, the
// payload sends qty_porsi, never org_id/plan_by). Covers every state: loading,
// empty, error+retry, saving/saved, offline, member-read-only, unauthenticated.
//
// DD-5 (v4 typed-qty port): the editor journey is TYPE the amount, then Enter/Tab/blur
// to commit — never increment. The owner killed the −/+ stepper ("the production is not
// logged incrementally. it should be typed in the amount being produced. mostly are
// 10-20+. incremental is just too tedious."), so these tests assert the typed journey
// and the ABSENCE of any −/+ affordance; Escape discards without saving (I5 /
// OD-REDESIGN-22, via useInlineCommit).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

// PageFamilyFrame (the v4 shell chrome this page ports to — #197) calls useLocation()
// unconditionally, so every render needs Router context, not just the ones that render a
// <Link>. Mirrors kitchen-log-page.test.tsx's own wrapper.
function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  return { ...actual, listActiveWipItems: vi.fn() }
})
import { listActiveWipItems } from '@/lib/db/kitchen-logs'

vi.mock('@/lib/db/kitchen-plans', () => ({
  listKitchenPlans: vi.fn(),
  listPesanan: vi.fn(),
  upsertKitchenPlan: vi.fn(),
}))
import { listKitchenPlans, listPesanan, upsertKitchenPlan } from '@/lib/db/kitchen-plans'

vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
import { listActiveBranches } from '@/lib/db/branches'

import { KitchenPlanPage } from './kitchen-plan-page'
import type { WipItemOption, PlanCell, PesananRow } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockItems = vi.mocked(listActiveWipItems)
const mockPlans = vi.mocked(listKitchenPlans)
const mockPesanan = vi.mocked(listPesanan)
const mockUpsert = vi.mocked(upsertKitchenPlan)
const mockBranches = vi.mocked(listActiveBranches)

// The default capture stream (defaultStreamFrom picks the 'rumah_rames' code, or falls
// back to branches[0] — mirrors kitchen-logs.ts DEFAULT_CAPTURE_BRANCH_CODE).
const BRANCHES = [{ id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' }]

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

const ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
  { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
]
const PRODUCE = { action: 'produce' as const, destinationBranchId: null }
const PLAN_CELLS: PlanCell[] = [
  { id: 'pl1', wip_item_id: 'w1', movement: PRODUCE, qty_porsi: 12 },
]
const PESANAN: PesananRow[] = [
  { log_date: '2026-06-21', wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', movement: PRODUCE, qty_porsi: 12 },
  { log_date: '2026-06-28', wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', movement: PRODUCE, qty_porsi: 8 },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue(viewer(['ops_lead']))
  mockItems.mockResolvedValue(ITEMS)
  mockBranches.mockResolvedValue(BRANCHES)
  mockPlans.mockResolvedValue([])
  mockPesanan.mockResolvedValue([])
  mockUpsert.mockResolvedValue('new-id')
})

// ── Auth ──────────────────────────────────────────────────────────────────────
describe('KitchenPlanPage — auth', () => {
  it('auth loading: shows a busy state', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as AuthState)
    render(<KitchenPlanPage />, { wrapper })
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('unauthenticated: prompts sign-in, never reads', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' } as AuthState)
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/plan']}>
        <KitchenPlanPage />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router (basename applied) — not a raw href that skips /mos
    expect(link).toHaveAttribute('href', '/mos/login')
    expect(mockPlans).not.toHaveBeenCalled()
    expect(mockPesanan).not.toHaveBeenCalled()
  })
})

// ── ops_lead → editor mode (FR-030/031) ───────────────────────────────────────
describe('KitchenPlanPage — ops_lead editor (FR-030/031)', () => {
  it('loads active items + the date plan; renders one editable qty per item', async () => {
    mockPlans.mockResolvedValue(PLAN_CELLS)
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    await waitFor(() => expect(mockPlans).toHaveBeenCalled())
    // editable qty inputs exist (the editor affordance) — one per item
    expect(screen.getAllByRole('spinbutton').length).toBeGreaterThanOrEqual(2)
    // pre-filled with the existing plan qty for Ayam Bakar / Production
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue(12)
  })

  it('FR-031: typing an amount + blur commits — upsertKitchenPlan with qty_porsi (no org_id/plan_by)', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled())
    const arg = mockUpsert.mock.calls[0][0]
    expect(arg.qty_porsi).toBe(15)
    expect(arg.wip_item_id).toBe('w1')
    // #247: the movement (DD-WAY-13), not the removed action_type column — plus the
    // (branch, activity) stream the row is being planned against (OD-WAY-28).
    expect(arg.action).toBe('produce')
    expect(arg.destination_branch_id).toBeNull()
    expect(arg.branch_id).toBe('branch-1')
    expect(arg.activity).toBe('kitchen')
    expect(Object.keys(arg)).not.toContain('action_type')
    expect(Object.keys(arg)).not.toContain('org_id')
    expect(Object.keys(arg)).not.toContain('plan_by')
  })

  it('does not save when the value is unchanged (no needless write)', async () => {
    mockPlans.mockResolvedValue(PLAN_CELLS)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.blur(input) // blur with the same value 12
    await new Promise(r => setTimeout(r, 0))
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('shows a quiet saved confirmation after a successful save (no view transition)', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
    // still on the editor (Ayam Bakar still visible) — no navigation
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
  })

  it('save error: surfaces a message, keeps the edit on screen', async () => {
    mockUpsert.mockRejectedValueOnce(new Error('denied'))
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.blur(input)
    // Wait for the GOAL — the error alert surfaces (load-robust: only the alert gates the poll, not the
    // call-count, which under full-suite load could momentarily re-throw inside waitFor and flake).
    // No per-test timeout: it inherits the single global budget (src/test/setup.ts asyncUtilTimeout).
    // This line used to carry `{ timeout: 5000 }`, which became EXACTLY equal to the global once that
    // was raised — redundant, and still the binding constraint. It then failed CI at 5081ms: on a
    // 2-core runner with v8 coverage instrumentation this wait genuinely needs more than 5s, and it
    // passes locally with coverage only because this machine is faster. Two knobs for one budget is
    // how you get one nobody notices is binding, so there is now one.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't save|denied|try again/i)
    })
    // Once the error alert is shown the save has fired exactly once — now a deterministic check.
    expect(mockUpsert).toHaveBeenCalledOnce()
    // the edited row must still be on screen — no navigation on error
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
  })

  it('empty: ops_lead sees an editable blank grid — unplanned reads BLANK (greyed "0" placeholder), not a hard zero', async () => {
    mockPlans.mockResolvedValue([])
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    // DD-5 data-honesty: qty 0 = "nothing planned" → the field is genuinely blank with a
    // greyed "0" placeholder, never a column of committed-looking black zeros.
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    expect(input).toHaveValue(null)
    expect(input).toHaveAttribute('placeholder', '0')
  })

  // ── DD-5: the typed journey (owner ruling — typed, never incremented) ─────────
  it('DD-5: the plan qty is a typed field — NO −/+ stepper affordance renders', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.queryByRole('button', { name: /increase|decrease/i })).toBeNull()
  })

  // Interaction realism: these two drive the field with userEvent (real keystroke
  // sequences, act-settled between events) rather than a single synthetic
  // change+keyDown pair — under full-suite load the synthetic pair could race the
  // field's mount effects and flake (the same load-flake class documented on the
  // save-error test above). The journey asserted is unchanged: type, then Enter/Escape.
  it('DD-5/I5: Enter commits the typed amount', async () => {
    const user = userEvent.setup()
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    await user.type(input, '25{Enter}')
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled())
    expect(mockUpsert.mock.calls[0][0].qty_porsi).toBe(25)
  })

  it('DD-5/I5: while a commit is in flight the field is disabled + aria-busy — Enter-then-blur saves exactly ONCE', async () => {
    const user = userEvent.setup()
    // A slow-resolving upsert holds the commit pending long enough for the follow-up blur.
    let release!: (id: string) => void
    mockUpsert.mockImplementation(() => new Promise<string>(r => { release = r }))
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    await user.type(input, '25{Enter}')
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledOnce())
    // I5 contract (useInlineCommit): pending commit → field disabled + aria-busy.
    expect(input).toBeDisabled()
    expect(input).toHaveAttribute('aria-busy', 'true')
    // Blur while pending must NOT fire a second upsert for the same edit.
    fireEvent.blur(input)
    await new Promise(r => setTimeout(r, 0))
    expect(mockUpsert).toHaveBeenCalledOnce()
    release('new-id')
    // After the commit resolves the field is editable again.
    await waitFor(() => expect(input).not.toBeDisabled())
    expect(mockUpsert).toHaveBeenCalledOnce()
  })

  it('DD-5/I5: Escape discards the draft and restores the saved qty — never saves', async () => {
    const user = userEvent.setup()
    mockPlans.mockResolvedValue(PLAN_CELLS)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    await user.clear(input)
    await user.type(input, '99{Escape}')
    // draft rolled back to the saved 12; tabbing away is then a no-op (no needless write)
    expect(input).toHaveValue(12)
    await user.tab()
    await new Promise(r => setTimeout(r, 0))
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('error + retry: surfaces a retry that re-fetches', async () => {
    mockItems.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(ITEMS)
    render(<KitchenPlanPage />, { wrapper })
    const retry = await screen.findByRole('button', { name: /try again/i })
    fireEvent.click(retry)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
  })

  it('offline: edits blocked + a banner (online-only writes, NFR-008)', async () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    expect(input).toBeDisabled()
    spy.mockRestore()
  })
})

// ── C5: editor new-behavior (KPI strip + reflow branch + category grouping) ─────
describe('KitchenPlanPage — editor redesign (OD-K-5 §4)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(viewer(['ops_lead']))
    mockPlans.mockResolvedValue(PLAN_CELLS)
  })
  // Restore the default phone matchMedia stub after any desktop override so test
  // order can't leak the branch (mirrors the log page test's afterEach).
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

  // ── #401 / DD-WAY-40 (OD-WAY-74 #2 "enforce"): the figures band is the Metric
  // summary rule — one inline line of label:value, never a tile row. The retired
  // word-tiles ('Active action'/'Plan status' with 'write surface'/'editing today'
  // captions) are the exact defect class the rule kills on a capture surface.
  it('the figures band is the summary RULE: two numbers, no tiles (#401/DD-WAY-40)', async () => {
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
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    // PLAN_CELLS has one Production cell: Ayam Bakar qty 12 → total 12, dishes 1
    const band = screen.getByRole('group', { name: /planning summary/i })
    expect(document.querySelector('.msr')).not.toBeNull()
    // never the retired tile strip (KitchenKpiStrip stays for Stock, not here)
    expect(document.querySelector('.kks')).toBeNull()
    const values = Array.from(band.querySelectorAll('.msr-value')).map(el => el.textContent)
    expect(values).toEqual(['12', '1'])
    expect(values.every(v => /^\d+$/.test(v ?? ''))).toBe(true)
  })

  it('renders the two plan metrics under their catalog labels — never the retired word-tiles', async () => {
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
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.getByText(/planned total/i)).toBeInTheDocument()
    expect(screen.getByText(/dishes planned/i)).toBeInTheDocument()
    expect(screen.queryByText(/active action/i)).toBeNull()
    expect(screen.queryByText(/plan status/i)).toBeNull()
    expect(screen.queryByText(/write surface/i)).toBeNull()
    expect(screen.queryByText(/editing today/i)).toBeNull()
    expect(screen.queryByText(/made so far/i)).toBeNull()
    expect(screen.queryByText(/% complete/i)).toBeNull()
  })

  it('an empty plan keeps NUMBER slots (0/0) — the human sentence lives in the page note, not the band', async () => {
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
    mockPlans.mockResolvedValue([])
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const band = screen.getByRole('group', { name: /planning summary/i })
    expect(Array.from(band.querySelectorAll('.msr-value')).map(el => el.textContent)).toEqual(['0', '0'])
    expect(screen.queryByText(/no plan created yet/i)).toBeNull()
  })

  it('explains an empty plan as a live-entered absence', async () => {
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
    mockPlans.mockResolvedValue([])
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(screen.getByText('Nothing planned yet')).toBeInTheDocument()
  })

  it('groups dishes by category (F2 categories render as group headers)', async () => {
    const { container } = render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    // ITEMS both carry category 'Main' → one group header 'Main' (phone-default cards).
    // Selector note: grouping now renders via the shared DataTable. Phone cards emit the
    // group label under .dt-cards-group-label (desktop would be .dt-group-label); this
    // test runs the default phone matchMedia, so query the phone class — a mechanical
    // selector update, the goal (category group label renders) is unchanged.
    const labels = Array.from(container.querySelectorAll('.dt-cards-group-label')).map(el => el.textContent)
    expect(labels).toContain('Main')
  })

  it('(#401) the editor carries in-app help — HelpTip in the meta line (H10)', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    fireEvent.click(screen.getByRole('button', { name: /^help$/i }))
    const panel = await screen.findByRole('note')
    expect(panel.textContent).toContain('there is no submit button')
  })

  it('(#401) the editor dish name drills to the Café log (/cafe/log?q=<dish>)', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(
      screen.getByRole('link', { name: /see ayam bakar in the café log/i }),
    ).toHaveAttribute('href', '/cafe/log?q=Ayam%20Bakar')
  })

  it('phone (default matchMedia): renders the cards branch, NOT the desktop table', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    // the desktop table aria-label is absent on phone (one branch in the DOM — P-4)
    expect(screen.queryByRole('table', { name: /café plan/i })).toBeNull()
  })

  it('desktop matchMedia: renders the table branch, NOT the cards', async () => {
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
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByRole('table', { name: /café plan/i })).toBeInTheDocument()
  })
})

// ── member → read-only pesanan (AC-024) ───────────────────────────────────────
describe('KitchenPlanPage — member pesanan (AC-024)', () => {
  beforeEach(() => mockUseAuth.mockReturnValue(viewer(['member'])))

  it('AC-024: member sees the 14-day forward horizon read-only', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    await waitFor(() => expect(mockPesanan).toHaveBeenCalled())
    // 14-day horizon requested
    const [, days] = mockPesanan.mock.calls[0]
    expect(days).toBe(14)
  })

  it('AC-024: member NEVER gets edit/save affordances or calls the editor read/write', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('button', { name: /save|edit|approve|submit/i })).toBeNull()
    expect(mockPlans).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('member empty: a calm "nothing planned" — not a broken table', async () => {
    mockPesanan.mockResolvedValue([])
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText(/nothing planned/i)).toBeInTheDocument()
  })

  it('member rows are grouped by date with the planned qty shown', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    // the planned qty renders (tabular)
    expect(screen.getByText('12')).toBeInTheDocument()
    // a date group header for the two distinct dates (grouped by date)
    expect(screen.getByText('2026-06-21')).toBeInTheDocument()
    expect(screen.getByText('2026-06-28')).toBeInTheDocument()
  })

  it('member error + retry: re-fetches the horizon', async () => {
    mockPesanan.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    const retry = await screen.findByRole('button', { name: /try again/i })
    fireEvent.click(retry)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
  })

  it('(#401) the pesanan item name drills to the Café log too', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(
      screen.getByRole('link', { name: /see ayam bakar in the café log/i }),
    ).toHaveAttribute('href', '/cafe/log?q=Ayam%20Bakar')
  })

  it('(#401) a member can find a dish by name — search narrows the horizon (Nielsen Café·Plan 16/32: ~231 rows, no way to narrow)', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    fireEvent.change(
      screen.getByRole('searchbox', { name: /find a dish in the plan/i }),
      { target: { value: 'nasi' } },
    )
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('(#401/I7) hydrates the pesanan search from ?q= on load (a refreshed/shared link reproduces the filtered view)', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(
      <MemoryRouter initialEntries={['/cafe/plan?q=nasi']}>
        <I18nProvider><KitchenPlanPage /></I18nProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Nasi Goreng')
    expect(screen.getByRole('searchbox', { name: /find a dish in the plan/i })).toHaveValue('nasi')
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('(#401) the category filter narrows the horizon too', async () => {
    mockPesanan.mockResolvedValue([
      { ...PESANAN[0], category: 'Main' },
      { ...PESANAN[1], category: 'Rice' },
    ])
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    fireEvent.change(screen.getByRole('combobox', { name: /category/i }), { target: { value: 'Rice' } })
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('(#401) a filter that matches nothing shows the shared no-match copy, not a broken table', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    fireEvent.change(
      screen.getByRole('searchbox', { name: /find a dish in the plan/i }),
      { target: { value: 'zzz' } },
    )
    expect(await screen.findByText(/no dishes match your filter/i)).toBeInTheDocument()
  })

  it('(#401) the read-only face explains itself and offers the log CTA', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText(/this is the 14-day order horizon/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open the café log/i })).toHaveAttribute('href', '/cafe/log')
    // AC-024 still held: the explainer adds no capture affordance
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
})

// ── #401 locale seam: the band and the save status render the active locale ──────
describe('KitchenPlanPage — locale id (#401)', () => {
  beforeEach(() => {
    localStorage.setItem('mos.locale', 'id')
    mockUseAuth.mockReturnValue(viewer(['ops_lead']))
    mockPlans.mockResolvedValue(PLAN_CELLS)
  })
  afterEach(() => localStorage.clear())

  it('the summary band renders Indonesian (reused plannedTotal key + the new label)', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.getByRole('group', { name: 'Ringkasan perencanaan' })).toBeInTheDocument()
    expect(screen.getByText('Total rencana')).toBeInTheDocument()
    expect(screen.getByText('Menu direncanakan')).toBeInTheDocument()
    expect(screen.queryByText(/planned total/i)).toBeNull()
  })

  it('(#401) the in-flight save status is catalog Indonesian, never hardcoded "Saving…"', async () => {
    let release!: (id: string) => void
    mockUpsert.mockImplementation(() => new Promise<string>(r => { release = r }))
    const user = userEvent.setup()
    render(<KitchenPlanPage />, { wrapper })
    // PlanQtyField's aria is English in both locales (out-of-scope finding — see plan notes)
    const input = await screen.findByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    await user.type(input, '15{Enter}')
    expect(await screen.findByText('Menyimpan…')).toBeInTheDocument()
    expect(screen.queryByText(/saving/i)).toBeNull()
    release('new-id')
    await waitFor(() => expect(input).not.toBeDisabled())
  })

  it('(#401) the saved tick reads from the catalog ("Tersimpan"), never hardcoded "Saved"', async () => {
    const user = userEvent.setup()
    render(<KitchenPlanPage />, { wrapper })
    const input = await screen.findByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    await user.type(input, '15{Enter}')
    expect(await screen.findByText(/tersimpan/i)).toBeInTheDocument()
    expect(screen.queryByText(/saved/i)).toBeNull()
  })
})
