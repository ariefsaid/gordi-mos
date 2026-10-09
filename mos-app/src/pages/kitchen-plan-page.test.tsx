// KitchenPlanPage tests — TDD, AC-tagged.
// S2 — /cafe/plan — the plan EDITOR (ops_lead/admin) + the read-only
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'
import { APP_ROUTER_BASENAME, appUrl } from '@/config/app-build-settings'

// PageFamilyFrame (the v4 shell chrome this page ports to — #197) calls useLocation()
// unconditionally, so every render needs Router context, not just the ones that render a
// <Link>. Mirrors kitchen-log-page.test.tsx's own wrapper.
function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

function idWrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, { initialLocale: 'id' }, children))
}

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  // #440: the head's stream picker offers the ENUMERATED stream catalog, so the page reads the
  // live stream Teams. Un-mocked that hits Supabase and every bootstrap lands in the error state.
  // #222: every item is on the stream's list unless a test says otherwise.
  return {
    ...actual,
    listStreamPairs: vi.fn(),
    listCafeDestinations: vi.fn(),
    listStreamItemIds: vi.fn(async () => ({ has: () => true })),
  }
})
import { listCafeDestinations, listStreamItemIds, listStreamPairs } from '@/lib/db/kitchen-logs'

vi.mock('@/lib/db/cafe-item-settings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/cafe-item-settings')>('@/lib/db/cafe-item-settings')
  return { ...actual, listCafeItemSettings: vi.fn(), canManageCafeItemSettings: vi.fn(async () => false) }
})
import { listCafeItemSettings, type CafeItemSetting } from '@/lib/db/cafe-item-settings'

// shared.default_stream() (FR-001) — the viewer's own stream. #440: the plan surfaces resolve
// their stream the way the capture surface always did, instead of guessing at the catalog.
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
// #781 coordinator follow-up: useCafeStream now also reads current Team memberships for
// "Your Team" tagging (myStreamKeys) — empty by default here; tests that care override it.
vi.mock('@/lib/db/cafe-opening', () => ({ listCafeViewerTeams: vi.fn().mockResolvedValue([]) }))
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'

vi.mock('@/lib/db/kitchen-plans', () => ({
  listKitchenPlans: vi.fn(),
  listPesanan: vi.fn(),
  upsertKitchenPlan: vi.fn(),
}))
import { listKitchenPlans, listPesanan, upsertKitchenPlan } from '@/lib/db/kitchen-plans'

vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
import { listActiveBranches } from '@/lib/db/branches'

import { KitchenPlanPage } from './kitchen-plan-page'
import { rememberStream } from '@/lib/cafe-stream'
import { resetCafeLocations } from '@/lib/cafe-opening-location'
import type { CafeDestination, WipItemOption, PlanCell, PesananRow } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockPlans = vi.mocked(listKitchenPlans)
const mockPesanan = vi.mocked(listPesanan)
const mockUpsert = vi.mocked(upsertKitchenPlan)
const mockBranches = vi.mocked(listActiveBranches)
const mockStreamPairs = vi.mocked(listStreamPairs)
const mockDestinations = vi.mocked(listCafeDestinations)
const mockDefaultStream = vi.mocked(fetchDefaultStream)
const mockCafeItemSettings = vi.mocked(listCafeItemSettings)

const BRANCHES = [
  { id: 'branch-1', code: 'rumah_rames', name: 'Rumah Rames' },
  { id: 'branch-2', code: 'radiant', name: 'Radiant' },
]
// The live stream Teams behind those branches — the enumerated catalog the head picker offers.
const STREAM_PAIRS = BRANCHES.flatMap(b => [
  { branch_id: b.id, activity: 'kitchen' as const, produces: b.id !== 'branch-2' },
  { branch_id: b.id, activity: 'bar' as const, produces: true },
])
const DESTINATIONS: CafeDestination[] = [
  { origin_branch_id: 'branch-1', origin_activity: 'kitchen', destination_branch_id: 'branch-2' },
  { origin_branch_id: 'branch-1', origin_activity: 'bar', destination_branch_id: 'branch-2' },
  { origin_branch_id: 'branch-2', origin_activity: 'bar', destination_branch_id: 'branch-1' },
]
const OWN_STREAM = { branch: BRANCHES[0], activity: 'kitchen' as const, produces: true }
const RADIANT_KITCHEN = { branch: BRANCHES[1], activity: 'kitchen' as const, produces: false }
const OWN_STREAM_BAR = { branch: BRANCHES[0], activity: 'bar' as const, produces: true }
const RADIANT_BAR = { branch: BRANCHES[1], activity: 'bar' as const, produces: true }
// #781: CafeStreamBar states a resolved stream as an activity-specific Switch beside it on Plan (opens a
// portaled listbox) — or, with no default resolved at all, offers the location's streams as
// direct one-click buttons (CafeStreamChoices), no separate open step. `startsWith` rather than
// an exact match because an option carries an appended tag ("— Your Team" / "— Receiving only")
// when it applies.
function startsWith(label: string) {
  return (accessibleName: string) => accessibleName.startsWith(label)
}

function chooseStream(optionName: string) {
  const switchButton = screen.queryByRole('button', { name: /^switch (kitchen|bar)$/i })
  if (switchButton) {
    fireEvent.click(switchButton)
    fireEvent.click(screen.getByRole('option', { name: startsWith(optionName) }))
    return
  }
  fireEvent.click(screen.getByRole('button', { name: startsWith(optionName) }))
}

function chooseCategory(optionName: string) {
  fireEvent.click(screen.getByRole('combobox', { name: /category/i }))
  fireEvent.click(screen.getByRole('option', { name: optionName }))
}

function viewer(accessRoles: string[], personId = 'p-1'): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: personId, org_id: 'org-1', user_id: 'auth-1', full_name: 'Dina',
        email: 'dina@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [], isManager: false, accessRoles, affiliated: [],
    },
    signOut: vi.fn(),
  } as AuthState
}

const ITEMS: WipItemOption[] = [
  { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
  { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
]
// Every Plan row is an ESB item on the stream, configured as an active WIP item with a porsi default.
const esb = (item: WipItemOption): CafeItemSetting => ({
  id: item.id, erpName: item.name, mosName: item.name, category: item.category, kind: 'WIP', isActive: true,
  defaultUnitId: `${item.id}-porsi`,
  units: [{ id: `${item.id}-porsi`, name: 'porsi', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
})
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
  // #440: the Café stream is remembered module-wide in sessionStorage — clear it so one test's
  // switch never seeds the next test's default.
  rememberStream(null)
  resetCafeLocations()
  mockUseAuth.mockReturnValue(viewer(['ops_lead']))
  mockBranches.mockResolvedValue(BRANCHES)
  mockStreamPairs.mockResolvedValue(STREAM_PAIRS)
  mockDestinations.mockResolvedValue(DESTINATIONS)
  mockDefaultStream.mockResolvedValue(OWN_STREAM)
  mockCafeItemSettings.mockResolvedValue(ITEMS.map(esb))
  mockPlans.mockResolvedValue([])
  mockPesanan.mockResolvedValue([])
  vi.mocked(listCafeViewerTeams).mockResolvedValue([])
  mockUpsert.mockResolvedValue('new-id')
})

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
      <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe/plan')]}>
        <KitchenPlanPage />
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router with the configured build base path.
    expect(link).toHaveAttribute('href', appUrl('/login'))
    expect(mockPlans).not.toHaveBeenCalled()
    expect(mockPesanan).not.toHaveBeenCalled()
  })
})

// ── #440: the stream this plan belongs to, stated in the head ─────────────────
describe('KitchenPlanPage — the stream reads in the page head (#440)', () => {
  it('the editor states the stream it is writing into, canonically', async () => {
    mockDefaultStream.mockResolvedValue(RADIANT_BAR)
    const { container } = render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const head = container.querySelector('[data-testid="page-head"]') as HTMLElement
    expect(within(head).getByTestId('cafe-stream')).toHaveTextContent('Radiant · Bar')
    expect(mockPlans.mock.calls[0][1]).toEqual(RADIANT_BAR)
  })

  it('Plan opens straight on its stream as a heading, with an action-specific Switch and no "Stream" label', async () => {
    mockDefaultStream.mockResolvedValue(OWN_STREAM)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.getByRole('heading', { level: 2, name: 'Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(screen.queryByText(/^stream$/i)).toBeNull()
    expect(screen.getByRole('button', { name: /^switch kitchen$/i })).toBeInTheDocument()
    // No chooser first: the stream is already resolved, so no stream buttons precede the list.
    expect(screen.queryByText(/choose a production stream/i)).toBeNull()
  })

  it('switching the stream in the head re-reads THAT stream\'s plan', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    // This case switches activity inside the selected branch; the next cases also cover the
    // deliberate cross-branch choice now offered by Change.
    chooseStream('Rumah Rames · Bar')
    await waitFor(() => expect(mockPlans).toHaveBeenCalledTimes(2))
    expect(mockPlans.mock.calls[1][1]).toEqual(OWN_STREAM_BAR)
  })

  it('offers another working branch through Switch without adding a Location field', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    fireEvent.click(screen.getByRole('button', { name: /^switch kitchen$/i }))
    const offered = screen.getAllByRole('option').map(o => o.textContent?.trim() ?? '')

    expect(offered.some(label => label.includes('Radiant') && /other location/i.test(label))).toBe(true)
    expect(screen.queryByRole('combobox', { name: /location/i })).toBeNull()
  })

  it('commits the selected branch before re-reading that branch\'s plan', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    chooseStream('Radiant · Kitchen')

    await waitFor(() => expect(mockPlans).toHaveBeenCalledTimes(2))
    expect(mockPlans.mock.calls[1][1]).toEqual(RADIANT_KITCHEN)
    expect(screen.getByRole('heading', { level: 2, name: 'Radiant · Kitchen' })).toBeInTheDocument()
  })

  it('account switch: a delayed previous viewer plan cannot replace the next viewer\'s plan', async () => {
    let resolvePrevious!: (cells: PlanCell[]) => void
    const previousPlan = new Promise<PlanCell[]>(resolve => { resolvePrevious = resolve })
    mockPlans.mockReturnValueOnce(previousPlan).mockResolvedValueOnce([
      { id: 'plan-b', wip_item_id: 'w1', movement: PRODUCE, qty_porsi: 27 },
    ])

    let currentViewer = viewer(['ops_lead'], 'person-a')
    mockUseAuth.mockImplementation(() => currentViewer)
    const { rerender } = render(<KitchenPlanPage />, { wrapper })
    await waitFor(() => expect(mockPlans).toHaveBeenCalledTimes(1))

    currentViewer = viewer(['ops_lead'], 'person-b')
    rerender(<KitchenPlanPage />)
    const quantity = await screen.findByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    await waitFor(() => expect(quantity).toHaveValue('27'))

    await act(async () => {
      resolvePrevious([{ id: 'plan-a', wip_item_id: 'w1', movement: PRODUCE, qty_porsi: 91 }])
      await Promise.resolve()
    })

    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue('27')
  })

  it('the member pesanan face states its stream too — a read-only surface still says which books', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    mockDefaultStream.mockResolvedValue(RADIANT_BAR)
    mockPesanan.mockResolvedValue(PESANAN)
    const { container } = render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const head = container.querySelector('[data-testid="page-head"]') as HTMLElement
    expect(within(head).getByTestId('cafe-stream')).toHaveTextContent('Radiant · Bar')
  })

  it('issue 440: the branch × activity pair of selects is GONE — one control names the stream, once', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    // #781: the stream is a stated fact, never a combobox — one statement for the whole surface.
    expect(screen.getAllByTestId('cafe-stream')).toHaveLength(1)
    expect(screen.queryByRole('combobox', { name: /^branch$/i })).toBeNull()
    expect(screen.queryByRole('combobox', { name: /^activity$/i })).toBeNull()
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
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue('12')
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

  it.each(['1,5', '1.5'])('rejects decimal plan input %s instead of rounding or saving it', async raw => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const input = await screen.findByLabelText(/planned quantity for ayam bakar/i)
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'decimal')
    await waitFor(() => expect(input).toBeEnabled())
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, raw)
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent(/whole numbers only/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('shows the integer-only correction in Indonesian', async () => {
    render(<KitchenPlanPage />, { wrapper: idWrapper })
    await screen.findByText('Ayam Bakar')
    const input = await screen.findByLabelText(/jumlah yang direncanakan untuk ayam bakar/i)
    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('inputmode', 'decimal')
    await waitFor(() => expect(input).toBeEnabled())
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, '1,5')
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent(/bilangan bulat/i)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('a save resolving after a stream switch cannot overwrite the new stream plan', async () => {
    let resolveSave!: (id: string) => void
    mockPlans.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'new-stream-plan', wip_item_id: 'w1', movement: PRODUCE, qty_porsi: 27 },
    ])
    mockUpsert.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve }))
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    const quantity = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(quantity, { target: { value: '15' } })
    fireEvent.blur(quantity)
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledOnce())

    chooseStream('Radiant · Bar')
    await screen.findByRole('heading', { level: 2, name: 'Radiant · Bar' })
    await waitFor(() => expect(mockPlans).toHaveBeenCalledTimes(2))
    const newStreamQuantity = await screen.findByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    await waitFor(() => expect(newStreamQuantity).toHaveValue('27'))

    await act(async () => { resolveSave('late-kitchen-plan') })

    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue('27')
    expect(screen.queryByText(/saving/i)).not.toBeInTheDocument()
  })

  it('names the original stream when a pending save fails after switching', async () => {
    let rejectSave!: (error: Error) => void
    mockUpsert.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject }))
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    const quantity = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(quantity, { target: { value: '15' } })
    fireEvent.blur(quantity)
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledOnce())

    chooseStream('Radiant · Bar')
    await screen.findByRole('heading', { level: 2, name: 'Radiant · Bar' })
    await waitFor(() => expect(mockPlans).toHaveBeenCalledTimes(2))
    await act(async () => { rejectSave(new Error('network failure')) })

    expect(await screen.findByText(/could not confirm the plan save for rumah rames · kitchen/i)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
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
    // #979: the same input is still mounted and still holds the typed amount after the rejection
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBe(input)
    expect(input).toBeInTheDocument()
    expect(input).toHaveValue('15')
    // retry (Enter on the still-typed amount) succeeds: that amount is what gets persisted
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(2))
    expect(mockUpsert.mock.calls[1][0].qty_porsi).toBe(15)
    expect(mockUpsert.mock.calls[1][0].wip_item_id).toBe('w1')
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toHaveValue('15')
  })

  it('(#981) editor search keeps real typing intact, the URL follows, and clearing empties both', async () => {
    const user = userEvent.setup({ delay: null })
    function Probe() {
      return <output aria-label="url">{useLocation().search}</output>
    }
    render(
      <MemoryRouter initialEntries={['/cafe/plan']}>
        <I18nProvider><KitchenPlanPage /><Probe /></I18nProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Ayam Bakar')
    const box = screen.getByRole('searchbox', { name: /find an item to plan/i })
    await user.type(box, 'nasi goreng')
    expect(box).toHaveValue('nasi goreng')
    expect(screen.getByRole('status', { name: 'url' })).toHaveTextContent('?q=nasi+goreng')
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    await user.click(box)
    await user.keyboard('{Control>}a{/Control}{Delete}')
    expect(box).toHaveValue('')
    expect(screen.getByRole('status', { name: 'url' })).toHaveTextContent(/^$/)
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
  })

  it('uses stream MOS names and shows its default plus other allowed ERP details', async () => {
    mockCafeItemSettings.mockResolvedValue([{
      id: 'w1',
      erpName: 'ERP Ayam Bakar',
      mosName: 'House Chicken',
      category: 'Main',
      kind: 'WIP',
      isActive: true,
      defaultUnitId: 'unit-kg',
      units: [
        { id: 'unit-kg', name: 'kg', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 },
        { id: 'unit-case', name: 'case', isShown: true, isDefault: false, labelOrdinal: null, labelCount: 1 },
        { id: 'unit-hidden', name: 'hidden detail', isShown: false, isDefault: false, labelOrdinal: null, labelCount: 1 },
      ],
    }])
    render(<KitchenPlanPage />, { wrapper })

    await screen.findByText('House Chicken')
    expect(mockCafeItemSettings).toHaveBeenCalledWith(OWN_STREAM)
    expect(screen.getByText('kg')).toBeInTheDocument()
    expect(screen.getByText('Also shown for logging: case')).toBeInTheDocument()
    expect(screen.queryByText(/hidden detail/)).toBeNull()
    expect(screen.queryByText('ERP Ayam Bakar')).toBeNull()
  })

  it('reads each plan quantity in the item\'s default ESB unit, beside the field', async () => {
    mockCafeItemSettings.mockResolvedValue([{
      id: 'w1', erpName: 'Ayam Bakar Madu Bumbu Rujak Porsi Katering Besar', mosName: 'Ayam Bakar Madu Bumbu Rujak Porsi Katering Besar',
      category: 'Main', kind: 'WIP', isActive: true, defaultUnitId: 'unit-batch',
      units: [{ id: 'unit-batch', name: 'Batch @50porsi', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
    }])
    render(<KitchenPlanPage />, { wrapper })
    const field = await screen.findByRole('spinbutton', { name: /planned quantity for ayam bakar madu/i })
    expect(field.parentElement).toHaveTextContent('Batch @50porsi')
    expect(screen.getAllByText('Batch @50porsi')).toHaveLength(1)
  })

  it('labels Plan rows as WIP and offers only enabled item kinds', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(screen.getByText('Ayam Bakar').parentElement).toHaveTextContent('WIP - Ayam Bakar')
    fireEvent.click(screen.getByRole('combobox', { name: /kind/i }))
    const listbox = screen.getByRole('listbox', { name: /kind/i })
    expect(within(listbox).getByRole('option', { name: 'WIP' })).toBeInTheDocument()
    expect(within(listbox).queryByRole('option', { name: 'RAW' })).toBeNull()
  })

  it('empty: ops_lead sees an editable blank grid — unplanned reads BLANK (greyed "0" placeholder), not a hard zero', async () => {
    mockPlans.mockResolvedValue([])
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    // DD-5 data-honesty: qty 0 = "nothing planned" → the field is genuinely blank with a
    // greyed "0" placeholder, never a column of committed-looking black zeros.
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    expect(input).toHaveValue('')
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
    expect(input).toHaveAttribute('data-escape-layer', 'nested')
    await user.clear(input)
    await user.type(input, '99{Escape}')
    // draft rolled back to the saved 12; tabbing away is then a no-op (no needless write)
    expect(input).toHaveValue('12')
    await user.tab()
    await new Promise(r => setTimeout(r, 0))
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('error + retry: surfaces a retry that re-fetches', async () => {
    mockCafeItemSettings.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(ITEMS.map(esb))
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
    expect(screen.getByText(/items planned/i)).toBeInTheDocument()
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

  it('does not duplicate the summary with a second empty-plan sentence', async () => {
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

    expect(screen.queryByText('Nothing planned yet')).toBeNull()
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

  it('R7: the editor has no help-tip control in the page chrome', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.queryByRole('button', { name: /^help$/i })).toBeNull()
  })

  // ONE Log link for the whole screen, at every width, beside the toolbar rather than
  // duplicated per group header.
  it('R7: the desktop face carries exactly one Log link for the screen, not per-group links', async () => {
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
    expect(
      screen.getByRole('link', { name: /see these in the café log/i }),
    ).toHaveAttribute("href", "/cafe/production")
    expect(screen.queryAllByRole('link', { name: /see .* in the café log/i })).toHaveLength(1)
    expect(screen.getByText('Ayam Bakar').closest('a')).toBeNull()
  })

  it('R7: the phone face keeps the same single Log link (it no longer vanishes at that width)', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(
      screen.getByRole('link', { name: /see .* in the café log/i }),
    ).toHaveAttribute('href', '/cafe/production')
    expect(screen.queryAllByRole('link', { name: /see .* in the café log/i })).toHaveLength(1)
    expect(screen.getByText('Ayam Bakar').closest('a')).toBeNull()
  })

  it('phone (default matchMedia): renders the cards branch, NOT the desktop table', async () => {
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    // the desktop table aria-label is absent on phone (one branch in the DOM — P-4)
    expect(screen.queryByRole('table', { name: /café plan/i })).toBeNull()
  })

  it.each([
    ['producing', OWN_STREAM],
    ['receiving-only', RADIANT_KITCHEN],
  ] as const)('phone ignores desktop category query for the %s Plan list', async (_state, stream) => {
    mockDefaultStream.mockResolvedValue(stream)
    mockCafeItemSettings.mockResolvedValue([
      esb({ ...ITEMS[0], category: 'Main' }),
      esb({ ...ITEMS[1], category: 'Rice' }),
    ])
    render(
      <MemoryRouter initialEntries={['/cafe/plan?category=__no_matching_category__']}>
        <I18nProvider><KitchenPlanPage /></I18nProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    if (stream.produces === false) {
      expect(screen.getByRole('heading', { name: /receiving-only stream/i })).toBeInTheDocument()
    }
  })

  it('desktop applies the selected category query to the Plan list', async () => {
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
    mockCafeItemSettings.mockResolvedValue([
      esb({ ...ITEMS[0], category: 'Main' }),
      esb({ ...ITEMS[1], category: 'Rice' }),
    ])
    render(
      <MemoryRouter initialEntries={['/cafe/plan?category=Rice']}>
        <I18nProvider><KitchenPlanPage /></I18nProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
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
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveAttribute('id', 'cafe-plan-category')
  })
})

// ── member → read-only pesanan (AC-024) ───────────────────────────────────────
// #784 AC-057: the DB half (#778, closed) widened plan-row writes to the stream's own
// supervisor, not only ops_lead/admin — a supervisor's Approve/Reject rights on Review
// already worked this way (kitchen-gates.ts canReviewCafe). The frontend face-picker here
// had not caught up: a supervisor still landed on the read-only pesanan horizon with no
// path to the editor the database would now accept their writes through.
describe('KitchenPlanPage — stream supervisor editor (#784 AC-057)', () => {
  beforeEach(() => mockUseAuth.mockReturnValue(viewer(['supervisor'])))

  it('a stream supervisor gets the same editable grid as ops_lead, and can save', async () => {
    mockPlans.mockResolvedValue(PLAN_CELLS)
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    expect(input).toHaveValue('12')
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.blur(input)
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled())
    expect(mockUpsert.mock.calls[0][0].qty_porsi).toBe(20)
  })

  // gpt-6-luna review (74d4ebf7): the gate above was ROLE-only — any supervisor got the
  // editor for whatever stream she happened to be viewing, and RLS (ops.is_stream_reviewer)
  // rejects a write on a stream she doesn't hold. The field itself must check the SELECTED
  // stream, not only the role.
  it("issue 783/784 hardening: her field disables on a stream she does not hold, even though her role opened the editor face", async () => {
    mockPlans.mockResolvedValue(PLAN_CELLS)
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBeEnabled()

    // Same branch, a DIFFERENT stream (bar, not her kitchen home) — she holds no membership
    // on it at all (the default listCafeViewerTeams mock resolves []).
    chooseStream('Rumah Rames · Bar')
    await waitFor(() => expect(mockPlans).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBeDisabled()
  })

  it('issue 783/784 hardening: an OPEN-ENDED membership on that other stream keeps it writable', async () => {
    mockPlans.mockResolvedValue(PLAN_CELLS)
    vi.mocked(listCafeViewerTeams).mockResolvedValue([
      {
        id: 'team-rrs-bar', name: 'Rumah Rames Bar', business_unit_id: 'bu-1', site_id: null,
        is_primary: false, branch_id: BRANCHES[0].id, activity: 'bar', effective_to: null,
      },
    ])
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()

    chooseStream('Rumah Rames · Bar')
    await waitFor(() => expect(mockPlans).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBeEnabled()
  })
})

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

  it('member pesanan rows use the stream MOS name and allowed ERP detail labels', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    mockCafeItemSettings.mockResolvedValue([{
      id: 'w1',
      erpName: 'ERP Ayam Bakar',
      mosName: 'House Chicken',
      category: 'Main',
      kind: 'WIP',
      isActive: true,
      defaultUnitId: 'unit-porsi',
      units: [
        { id: 'unit-porsi', name: 'porsi', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 },
        { id: 'unit-case', name: 'case', isShown: true, isDefault: false, labelOrdinal: null, labelCount: 1 },
      ],
    }])
    render(<KitchenPlanPage />, { wrapper })

    await screen.findByText('House Chicken')
    expect(screen.getByText('porsi')).toBeInTheDocument()
    expect(screen.getByText('Also shown for logging: case')).toBeInTheDocument()
    expect(screen.queryByText('ERP Ayam Bakar')).toBeNull()
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
    expect(screen.getByText('Ayam Bakar').parentElement).toHaveTextContent('WIP - Ayam Bakar')
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

  it('R7: the pesanan item name stays plain text', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.queryByRole('link', { name: /see .* in the café log/i })).toBeNull()
    expect(screen.getByText('Ayam Bakar').closest('a')).toBeNull()
  })

  it('(#401) a member can find a dish by name — search narrows the horizon (Nielsen Café·Plan 16/32: ~231 rows, no way to narrow)', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    fireEvent.change(
      screen.getByRole('searchbox', { name: /find an item in the plan/i }),
      { target: { value: 'nasi' } },
    )
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('(#981) pesanan search keeps fast typing intact', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const box = screen.getByRole('searchbox', { name: /find an item in the plan/i })
    await userEvent.setup({ delay: null }).type(box, 'nasi goreng')
    expect(box).toHaveValue('nasi goreng')
  })

  it('(#401/I7) hydrates the pesanan search from ?q= on load (a refreshed/shared link reproduces the filtered view)', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(
      <MemoryRouter initialEntries={['/cafe/plan?q=nasi']}>
        <I18nProvider><KitchenPlanPage /></I18nProvider>
      </MemoryRouter>,
    )
    await screen.findByText('Nasi Goreng')
    expect(screen.getByRole('searchbox', { name: /find an item in the plan/i })).toHaveValue('nasi')
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('Pesanan Switch reaches another readable branch when the active branch has one stream', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    mockDefaultStream.mockResolvedValue(RADIANT_KITCHEN)
    mockStreamPairs.mockResolvedValue([STREAM_PAIRS[2], STREAM_PAIRS[0]])
    mockPesanan.mockImplementation(async (_from, _days, selected) => (
      selected.branch.id === BRANCHES[1].id
        ? [{ ...PESANAN[1], log_date: '2026-06-21' }]
        : [PESANAN[0]]
    ))

    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText('Nasi Goreng')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^switch kitchen$/i }))
    const otherLocation = screen.getByRole('option', {
      name: /Rumah Rames · Kitchen.*Other location/i,
    })
    fireEvent.click(otherLocation)

    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.queryByText('Nasi Goreng')).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(mockPesanan.mock.calls.at(-1)?.[2]).toEqual(OWN_STREAM)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('(#401) the category filter narrows the horizon too', async () => {
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
    mockPesanan.mockResolvedValue([
      { ...PESANAN[0], category: 'Main' },
      { ...PESANAN[1], category: 'Rice' },
    ])
    mockCafeItemSettings.mockResolvedValue([esb({ ...ITEMS[0], category: 'Main' }), esb({ ...ITEMS[1], category: 'Rice' })])
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.getByRole('combobox', { name: /category/i })).toHaveAttribute('id', 'cafe-plan-category')
    chooseCategory('Rice')
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('phone shows all Pesanan rows even when a shared desktop URL carries a category filter', async () => {
    mockPesanan.mockResolvedValue([
      { ...PESANAN[0], category: 'Main' },
      { ...PESANAN[1], category: 'Rice' },
    ])
    render(
      <MemoryRouter initialEntries={['/cafe/plan?category=Main']}>
        <I18nProvider><KitchenPlanPage /></I18nProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
  })

  it('(#401) a filter that matches nothing shows the shared no-match copy, not a broken table', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    fireEvent.change(
      screen.getByRole('searchbox', { name: /find an item in the plan/i }),
      { target: { value: 'zzz' } },
    )
    expect(await screen.findByText(/no items match your filter/i)).toBeInTheDocument()
  })

  it('(#401) the read-only face explains itself and offers the log CTA', async () => {
    mockPesanan.mockResolvedValue(PESANAN)
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByText(/this is the 14-day order horizon/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open the café log/i })).toHaveAttribute("href", "/cafe/production")
    // AC-024 still held: the explainer adds no capture affordance
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })
})

// ── #401 locale seam: the band and the save status render the active locale ──────
describe('KitchenPlanPage — locale id (#401)', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue(viewer(['ops_lead']))
    mockPlans.mockResolvedValue(PLAN_CELLS)
  })

  it('the summary band renders Indonesian (reused plannedTotal key + the new label)', async () => {
    render(<KitchenPlanPage />, { wrapper: idWrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.getByRole('group', { name: 'Ringkasan perencanaan' })).toBeInTheDocument()
    expect(screen.getByText('Total rencana')).toBeInTheDocument()
    expect(screen.getByText('Item direncanakan')).toBeInTheDocument()
    expect(screen.queryByText(/planned total/i)).toBeNull()
  })

  it('(#401) the in-flight save status is catalog Indonesian, never hardcoded "Saving…"', async () => {
    let release!: (id: string) => void
    mockUpsert.mockImplementation(() => new Promise<string>(r => { release = r }))
    const user = userEvent.setup()
    render(<KitchenPlanPage />, { wrapper: idWrapper })
    // PlanQtyField's aria is English in both locales (out-of-scope finding — see plan notes)
    const input = await screen.findByRole('spinbutton', { name: /jumlah yang direncanakan untuk ayam bakar/i })
    await user.type(input, '15{Enter}')
    expect(await screen.findByText('Menyimpan…')).toBeInTheDocument()
    expect(screen.queryByText(/saving/i)).toBeNull()
    release('new-id')
    await waitFor(() => expect(input).not.toBeDisabled())
  })

  it('(#401) the saved tick reads from the catalog ("Tersimpan"), never hardcoded "Saved"', async () => {
    const user = userEvent.setup()
    render(<KitchenPlanPage />, { wrapper: idWrapper })
    const input = await screen.findByRole('spinbutton', { name: /jumlah yang direncanakan untuk ayam bakar/i })
    await user.type(input, '15{Enter}')
    expect(await screen.findByText(/tersimpan/i)).toBeInTheDocument()
    expect(screen.queryByText(/saved/i)).toBeNull()
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
    render(<KitchenPlanPage />, { wrapper })
    await waitFor(() => expect(document.title).toBe(cafeDocTitle('cafe.pageTitle.plan')))
  })
})

// #1142: a person with no primary stream who belongs to exactly one Café team opens on it.
describe('KitchenPlanPage — no primary stream (#1142)', () => {
  const cafeTeam = (id: string, branchIdx: number, activity: 'kitchen' | 'bar') => ({
    id, name: id, business_unit_id: 'bu-1', site_id: null, is_primary: false,
    branch_id: BRANCHES[branchIdx].id, activity, effective_to: null,
  })

  it('one Café team, not primary: Plan opens on its stream, with the Switch action', async () => {
    mockDefaultStream.mockResolvedValue(null)
    vi.mocked(listCafeViewerTeams).mockResolvedValue([cafeTeam('t-rr-kitchen', 0, 'kitchen')])
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.getByRole('heading', { level: 2, name: 'Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Choose a kitchen or bar' })).toBeNull()
    expect(screen.getByRole('button', { name: /^switch kitchen$/i })).toBeInTheDocument()
    expect(mockPlans.mock.calls[0][1]).toEqual(OWN_STREAM)
  })

  it('several Café teams, none primary: Plan uses the shared stream-choice state, not an unscoped catalog', async () => {
    mockDefaultStream.mockResolvedValue(null)
    vi.mocked(listCafeViewerTeams).mockResolvedValue([
      cafeTeam('t-rr-kitchen', 0, 'kitchen'), cafeTeam('t-rr-bar', 0, 'bar'),
    ])
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByRole('heading', { name: 'Choose a kitchen or bar' })).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    expect(screen.queryByRole('combobox', { name: /category/i })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('button', { name: /^switch/i })).toBeNull()
    expect(mockPlans).not.toHaveBeenCalled()
  })
})

// OD-CAFE-6: the member Pesanan face follows the same ladder as the editor.
describe('KitchenPlanPage — Pesanan default follows the one stream rule (OD-CAFE-6)', () => {
  beforeEach(() => mockUseAuth.mockReturnValue(viewer(['member'])))

  it('no home stream, ONE Café stream Team: Pesanan opens on it, heading + Switch', async () => {
    mockDefaultStream.mockResolvedValue(null)
    mockPesanan.mockResolvedValue(PESANAN)
    vi.mocked(listCafeViewerTeams).mockResolvedValue([{
      id: 't-rr-kitchen', name: 't-rr-kitchen', business_unit_id: 'bu-1', site_id: null,
      is_primary: false, branch_id: BRANCHES[0].id, activity: 'kitchen', effective_to: null,
    }])
    render(<KitchenPlanPage />, { wrapper })
    await waitFor(() => expect(mockPesanan).toHaveBeenCalled())
    expect(mockPesanan.mock.calls[0][2]).toEqual(OWN_STREAM)
    expect(screen.getByRole('heading', { level: 2, name: 'Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^switch kitchen$/i })).toBeInTheDocument()
  })
})

// ── #548 FR-006/AC-006: the stream precondition is quiet at rest, alerts on attempt ──
describe('FR-006/AC-006: the stream precondition speaks Log\'s two-state grammar', () => {
  it('AC-006: no stream → the shared stream choice is the only planning task; no unscoped catalog appears', async () => {
    mockDefaultStream.mockResolvedValue(null)
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByRole('heading', { name: 'Choose a kitchen or bar' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelector('.msr')).toBeNull()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('AC-006: choosing a stream reveals its catalog and enables planning', async () => {
    mockDefaultStream.mockResolvedValue(null)
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByRole('heading', { name: 'Choose a kitchen or bar' })).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    chooseStream('Rumah Rames · Kitchen')
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Choose a kitchen or bar' })).toBeNull(),
    )
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    const input = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(input, { target: { value: '15' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ branch_id: 'branch-1', activity: 'kitchen', qty_porsi: 15 }),
      ),
    )
  })
})

describe('DD-MVP-9: the Plan editor treats a receiving-only stream as readable, not writable', () => {
  it('shows a receiving-only state with a Stock handoff instead of plan inputs', async () => {
    mockDefaultStream.mockResolvedValue(RADIANT_KITCHEN)
    mockPlans.mockResolvedValue(PLAN_CELLS)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(screen.getByTestId('cafe-stream')).toHaveTextContent('Radiant · Kitchen')
    expect(screen.getByRole('heading', { name: /receiving-only stream/i })).toBeInTheDocument()
    expect(screen.getByText(
      'This stream receives stock, so production capture and planning are unavailable here.',
    )).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view café stock/i })).toHaveAttribute('href', '/cafe/stock')
    const planCard = screen.getByText('Ayam Bakar').closest('.dt-card')
    expect(planCard).not.toBeNull()
    expect(planCard).toHaveTextContent('12')
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})

// ── #548 FR-007/AC-007: Plan's phone face is the compact capture row ───────
describe('FR-007/AC-007: Plan\'s phone face is the compact capture row', () => {
  it('AC-007: phone width with planned items → each row is the compact capture row (identity + typed field/unit), not the generic record card', async () => {
    mockPlans.mockResolvedValue(PLAN_CELLS) // Ayam Bakar planned 12
    render(<KitchenPlanPage />, { wrapper })
    const card = (await screen.findByText('Ayam Bakar')).closest('.dt-card')
    expect(card).not.toBeNull()
    expect(card).toHaveClass('dt-card--compact') // PhoneCard applies it when renderCard is supplied
    expect(card!.querySelector('.kp-card-head')).not.toBeNull()
    // identity left, typed plan field + unit right — the SAME field the desktop cell mounts
    expect(
      within(card as HTMLElement).getByRole('spinbutton', { name: /planned quantity for ayam bakar/i }),
    ).toBeInTheDocument()
    expect(card!.textContent).toContain('porsi')
    // and EVERY row is that row — the unplanned one too
    expect(screen.getByText('Nasi Goreng').closest('.dt-card--compact')).not.toBeNull()
    // no per-card field label: the generic <dl> fallback is gone
    expect(document.querySelector('.dt-card-detail')).toBeNull()
  })
})


it('gives a receiving-only member a Stock handoff without production inputs', async () => {
  mockUseAuth.mockReturnValue(viewer(['member']))
  mockDefaultStream.mockResolvedValue(RADIANT_KITCHEN)
  render(<KitchenPlanPage />, { wrapper })
  expect(await screen.findByRole('heading', { name: /receiving-only stream/i })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /view café stock/i })).toHaveAttribute('href', '/cafe/stock')
  expect(screen.queryByRole('spinbutton')).toBeNull()
  expect(mockUpsert).not.toHaveBeenCalled()
})

describe('issue 222: the plan offers the stream\'s own item list', () => {
  const mockOffered = vi.mocked(listStreamItemIds)
  const WITH_UNLISTED: WipItemOption[] = [...ITEMS, { id: 'w3', name: 'Es Teh', category: 'Drinks' }]
  const NOT_ON_LIST = new Error('upsertKitchenPlan failed — CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream\'s item list')

  it('a row already planned for an off-list item stays, labelled and editable; an off-list item with no plan is not offered', async () => {
    mockCafeItemSettings.mockResolvedValue(WITH_UNLISTED.map(esb))
    mockOffered.mockResolvedValue(new Set(['w2']))
    mockPlans.mockResolvedValue(PLAN_CELLS) // Ayam Bakar (w1) planned at 12, then left the list
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Nasi Goreng')

    expect(screen.queryByText('Es Teh')).not.toBeInTheDocument()
    expect(screen.getAllByText('Not on this stream’s list')).toHaveLength(1)
    expect(screen.getByText('Not on this stream’s list').closest('tr, .kp-card')).toHaveTextContent('Ayam Bakar')
    const ayam = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    expect(ayam).toBeEnabled()
    fireEvent.change(ayam, { target: { value: '15' } })
    fireEvent.blur(ayam)
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ wip_item_id: 'w1', qty_porsi: 15 })))
    expect(mockOffered).toHaveBeenCalledWith(OWN_STREAM)
  })

  it('keeps only persisted inactive or reclassified rows for amendment, not new planning', async () => {
    mockOffered.mockResolvedValue(new Set(['w2', 'w3', 'w4', 'w5']))
    mockCafeItemSettings.mockResolvedValue([{
      id: 'w3', erpName: 'Curry · ERP reference', mosName: 'Archived curry', category: 'Prep',
      kind: 'WIP', isActive: false, defaultUnitId: null, units: [],
    }, {
      id: 'w4', erpName: 'Rice · ERP reference', mosName: 'Reclassified rice', category: 'Prep',
      kind: 'RAW', isActive: true, defaultUnitId: null, units: [],
    }, {
      id: 'w5', erpName: 'Retired · ERP reference', mosName: 'Unplanned inactive item', category: 'Prep',
      kind: 'WIP', isActive: false, defaultUnitId: null, units: [],
    }])
    mockPlans.mockResolvedValue([
      { id: 'legacy-plan', wip_item_id: 'w3', movement: PRODUCE, qty_porsi: 8 },
      { id: 'reclassified-plan', wip_item_id: 'w4', movement: PRODUCE, qty_porsi: 5 },
    ])
    render(<KitchenPlanPage />, { wrapper })

    expect(await screen.findByText('Archived curry')).toBeInTheDocument()
    expect(screen.getByText('Inactive — existing plan only')).toBeInTheDocument()
    expect(screen.queryByText('Unplanned inactive item')).not.toBeInTheDocument()
    expect(screen.getByText('Reclassified rice')).toBeInTheDocument()
    expect(screen.getByText('Not WIP — existing plan only')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for reclassified rice/i })).toHaveValue('5')
    const input = screen.getByRole('spinbutton', { name: /planned quantity for archived curry/i })
    expect(input).toHaveValue('8')
    expect(input).toBeEnabled()
    fireEvent.change(input, { target: { value: '10' } })
    fireEvent.blur(input)
    await waitFor(() => expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      wip_item_id: 'w3', action: 'produce', qty_porsi: 10,
    })))
    expect(mockUpsert.mock.calls[0][0].log_date).toBe(mockPlans.mock.calls[0][0])

    const transferTab = screen.getAllByRole('tab').find(tab => /transfer/i.test(tab.getAttribute('aria-label') ?? ''))
    expect(transferTab).toBeDefined()
    fireEvent.click(transferTab!)
    const transferInput = screen.getByRole('spinbutton', { name: /planned quantity for archived curry/i })
    expect(transferInput).toHaveValue('')
    expect(transferInput).toBeDisabled()
    expect(screen.getByRole('spinbutton', { name: /planned quantity for reclassified rice/i })).toBeDisabled()
    expect(mockUpsert).toHaveBeenCalledOnce()
  })

  it('an empty list names the stream from the settings the page already read', async () => {
    mockOffered.mockResolvedValue(new Set())
    mockCafeItemSettings.mockResolvedValue([])
    render(<KitchenPlanPage />, { wrapper })
    expect(await screen.findByRole('heading', { name: 'No ESB items on Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    // The empty state uses the settings the page already read rather than reading them again.
    expect(mockCafeItemSettings).toHaveBeenCalledTimes(1)
  })

  it('a save refused as off-list reads as guidance and the row turns read-only', async () => {
    mockOffered.mockResolvedValueOnce(new Set(['w1', 'w2'])).mockResolvedValue(new Set(['w2']))
    mockUpsert.mockRejectedValueOnce(NOT_ON_LIST)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const ayam = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(ayam, { target: { value: '9' } })
    fireEvent.blur(ayam)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer on this stream.s list, so it can.t be planned here/i)
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBeDisabled())
    expect(screen.getByText('Not on this stream’s list')).toBeInTheDocument()
  })

  it('a switch while the refused save re-reads the list keeps the NEW stream\'s list', async () => {
    let kitchenReads = 0
    let releaseStale: (ids: Set<string>) => void = () => {}
    mockOffered.mockImplementation(async (s) => {
      if (s.activity === 'bar') return new Set(['w1', 'w2'])
      kitchenReads += 1
      if (kitchenReads === 1) return new Set(['w1', 'w2'])
      return new Promise<Set<string>>((resolve) => { releaseStale = resolve })
    })
    mockUpsert.mockRejectedValueOnce(NOT_ON_LIST)
    render(<KitchenPlanPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const ayam = screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })
    fireEvent.change(ayam, { target: { value: '9' } })
    fireEvent.blur(ayam)
    await screen.findByRole('alert')
    await waitFor(() => expect(kitchenReads).toBe(2))

    chooseStream('Rumah Rames · Bar')
    await waitFor(() => expect(mockPlans.mock.calls.at(-1)?.[1]).toEqual(OWN_STREAM_BAR))
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBeEnabled())
    await act(async () => { releaseStale(new Set(['w2'])) })

    expect(screen.getByRole('spinbutton', { name: /planned quantity for ayam bakar/i })).toBeEnabled()
    expect(screen.queryByText('Not on this stream’s list')).toBeNull()
  })
})
