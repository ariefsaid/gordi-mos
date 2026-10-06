// KitchenLogPage tests — TDD, AC-tagged
// Covers: AC-020/021/022/030 (submit/validation/transfer cap), all states (loading,
// empty, error, submitting, success, offline-in-every-state RI-2, unauthenticated),
// BU-resolution failure (#3), inline note reachability (#6), touch floors (RI-3);
// #233 stream context: AC-002 (default from shared.default_stream(), switchable),
// FR-002 (no default → explicit choice), FR-005 (the enumerable catalog only), AC-004 (no
// raw-material input), AC-006 (effective target + already-logged, stream-scoped),
// AC-012b frontend half (rows carry the SELECTED stream pair).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Profiler, StrictMode, Suspense, type ReactNode } from 'react'
import { installDisabledBlur } from '@/test/browser-focus-fixup'
import { APP_ROUTER_BASENAME, appUrl } from '@/config/app-build-settings'
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider, Link } from 'react-router-dom'
import type { AuthState } from '@/auth/context'
import * as kitchenItemList from '@/lib/kitchen-item-list'

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
    listCafeDestinations: vi.fn(),
    resolveKitchenBuId: vi.fn(),
    insertKitchenLogBatch: vi.fn(),
    listStreamItemIds: vi.fn(),
    isItemNotOnStreamError: actual.isItemNotOnStreamError,
  }
})
// The person's own default stream — the ONE shape-validated resolver (default-stream.ts,
// #234 consolidation), shared with the stock page.
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
// #781 coordinator follow-up: useCafeStream now also reads current Team memberships for
// "Your Team" tagging (myStreamKeys) — empty by default here; tests that care override it.
vi.mock('@/lib/db/cafe-opening', () => ({ listCafeViewerTeams: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
// Missing-item reports now use their stream-scoped Café settings queue data layer.
vi.mock('@/lib/db/cafe-missing-item-reports', () => ({ reportMissingCafeItem: vi.fn() }))
import {
  listCaptureFormItems,
  fetchActualsMap,
  fetchPlanMap,
  fetchStockMap,
  listCafeDestinations,
  listStreamPairs,
  resolveKitchenBuId,
  insertKitchenLogBatch,
  listStreamItemIds,
} from '@/lib/db/kitchen-logs'
import { fetchDefaultStream } from '@/lib/db/default-stream'
import { listCafeViewerTeams } from '@/lib/db/cafe-opening'
import { listActiveBranches } from '@/lib/db/branches'
import type {
  ActualUnitTotal,
  BranchOption,
  CaptureFormItem,
  CafeDestination,
  ProductionStream,
  StreamPair,
} from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockListCaptureFormItems = vi.mocked(listCaptureFormItems)
const mockFetchPlanMap = vi.mocked(fetchPlanMap)
const mockFetchStockMap = vi.mocked(fetchStockMap)
const mockFetchActualsMap = vi.mocked(fetchActualsMap)
const mockFetchDefaultStream = vi.mocked(fetchDefaultStream)
const mockListCafeViewerTeams = vi.mocked(listCafeViewerTeams)
const mockListStreamPairs = vi.mocked(listStreamPairs)
const mockListCafeDestinations = vi.mocked(listCafeDestinations)
const mockResolveKitchenBuId = vi.mocked(resolveKitchenBuId)
const mockInsertKitchenLogBatch = vi.mocked(insertKitchenLogBatch)
const mockListActiveBranches = vi.mocked(listActiveBranches)
const mockListStreamItemIds = vi.mocked(listStreamItemIds)

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
// The enumerable stream catalog (FR-005), as this fixture stages it: three branches × two
// activities. A SUBSET of the live catalog (which also has cikal/bar, OD-WAY-79) — what these
// tests assert is that the picker offers EXACTLY the pairs it is given, so the count below is
// this list's length, not the catalog's. Roastery has no stream Team and so appears in neither.
const STREAM_PAIRS: StreamPair[] = [BRANCH_GORDI_HQ, BRANCH_RADIANT, BRANCH_RUMAH_RAMES].flatMap(
  b => (['kitchen', 'bar'] as const).map(activity => ({
    branch_id: b.id,
    activity,
    produces: !(b === BRANCH_RADIANT && activity === 'kitchen'),
  })),
)
const CAFE_DESTINATIONS: CafeDestination[] = [
  { origin_branch_id: BRANCH_GORDI_HQ.id, origin_activity: 'kitchen', destination_branch_id: 'cikal' },
  { origin_branch_id: BRANCH_GORDI_HQ.id, origin_activity: 'bar', destination_branch_id: 'cikal' },
  { origin_branch_id: BRANCH_RUMAH_RAMES.id, origin_activity: 'kitchen', destination_branch_id: BRANCH_RADIANT.id },
  { origin_branch_id: BRANCH_RUMAH_RAMES.id, origin_activity: 'bar', destination_branch_id: BRANCH_GORDI_HQ.id },
  { origin_branch_id: BRANCH_RUMAH_RAMES.id, origin_activity: 'bar', destination_branch_id: BRANCH_RADIANT.id },
  { origin_branch_id: BRANCH_RADIANT.id, origin_activity: 'bar', destination_branch_id: BRANCH_GORDI_HQ.id },
  { origin_branch_id: BRANCH_RADIANT.id, origin_activity: 'bar', destination_branch_id: BRANCH_RUMAH_RAMES.id },
]
// The person's own default stream (FR-001) — what the default-stream.ts resolver returns
// (already resolved against the branch catalog).
const DEFAULT_STREAM: ProductionStream = { branch: BRANCH_RUMAH_RAMES, activity: 'kitchen', produces: true }
const PRODUCE_KEY = 'produce'
const TRANSFER_RADIANT_KEY = `transfer:${BRANCH_RADIANT.id}`
const loggedUnit = (
  itemUnitId: string | null,
  quantity: number,
  unitName: string | null,
  logId = 'log-history',
): ActualUnitTotal => ({
  key: itemUnitId ? `unit:${itemUnitId}` : `unknown:${logId}`,
  item_unit_id: itemUnitId,
  unit_name: unitName,
  qty_porsi: quantity,
})

// #781: CafeStreamBar states a resolved stream as text with a quiet "Switch" beside it (opens a
// portaled listbox, same as Select's) — or, with no default resolved at all, offers the
// location's streams as direct one-click buttons (CafeStreamChoices) with no separate open step.
// `startsWith` rather than an exact match because an option carries an appended tag ("— Your
// Team" / "— Receiving only") when it applies; the journey below is real either way.
function startsWith(label: string) {
  return (accessibleName: string) => accessibleName.startsWith(label)
}

async function chooseStream(optionName: string) {
  const switchButton = screen.queryByRole('button', { name: /^change stream$/i })
  if (switchButton) {
    fireEvent.click(switchButton)
    fireEvent.click(await screen.findByRole('option', { name: startsWith(optionName) }))
    return
  }
  fireEvent.click(await screen.findByRole('button', { name: startsWith(optionName) }))
}

async function chooseCategory(optionName: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: /category/i }))
  await user.click(await screen.findByRole('option', { name: optionName }))
}

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
    // Kitchen Staff works a café line — the affiliated default every pre-existing capture test
    // below assumes; the AC-744 block overrides this to [] for the unaffiliated personas.
    affiliated: ['cafe'],
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

const RAW_MILK_ITEM: CaptureFormItem = {
  id: 'w3', name: 'Fresh milk', category: 'Dairy', kind: 'RAW',
  units: [{ id: 'u3-litre', name: 'litre', is_default: true }],
}

const PLAN_MAP = {
  w1: { [PRODUCE_KEY]: 20, [TRANSFER_RADIANT_KEY]: 10 },
  w2: { [PRODUCE_KEY]: 12 },
}

// Stock: w1 has 3 on hand, 9 available to transfer.
const STOCK_MAP = {
  w1: { stok: 3, tersedia: 9 },
  w2: { stok: 0, tersedia: 0 },
}

// An ops lead may switch to any location's stream (explicit, committing that location).
const OPS_LEAD: AuthState = {
  ...VIEWER_MEMBER,
  viewer: { ...(VIEWER_MEMBER as Extract<AuthState, { status: 'authenticated' }>).viewer, accessRoles: ['ops_lead'] },
} as AuthState

// ── helpers ───────────────────────────────────────────────────────────────────
async function renderPage(
  auth: AuthState = VIEWER_MEMBER,
  initialPath = appUrl('/cafe'),
  location?: { activeBranchId: string; activeBranchName: string },
  leading?: ReactNode,
) {
  mockUseAuth.mockReturnValue(auth)
  let utils!: ReturnType<typeof render>
  await act(async () => {
    utils = render(
      <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[initialPath]}>
        <Routes>
          <Route path="/cafe" element={<KitchenLogPage mode="production" leading={leading} {...location} />} />
          <Route path="/cafe/transfer" element={<KitchenLogPage mode="transfer" leading={leading} {...location} />} />
          <Route path="/cafe/success" element={<div>Submitted</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await Promise.resolve()
  })
  return utils
}

async function renderTransferPage(auth: AuthState = VIEWER_MEMBER, location?: { activeBranchId: string; activeBranchName: string }) {
  return renderPage(auth, appUrl('/cafe/transfer'), location)
}

import { KitchenLogPage } from './kitchen-log-page'
import { rememberStream } from '@/lib/cafe-stream'
import { activeCafeLocation, rememberCafeLocation, resetCafeLocations } from '@/lib/cafe-opening-location'
import { cafeDraftCount } from '@/lib/cafe-capture-draft'

beforeEach(() => {
  vi.clearAllMocks()
  // #440: the Café stream is remembered for the whole module (sessionStorage), so a test that
  // switches streams would otherwise seed the NEXT test's opening stream. Clear it per test.
  rememberStream(null)
  resetCafeLocations()
  mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS)
  mockListActiveBranches.mockResolvedValue(BRANCHES)
  mockListStreamPairs.mockResolvedValue(STREAM_PAIRS)
  mockListCafeDestinations.mockResolvedValue(CAFE_DESTINATIONS)
  mockFetchDefaultStream.mockResolvedValue(DEFAULT_STREAM)
  mockListCafeViewerTeams.mockResolvedValue([])
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
  it('settles the production route without deriving grouped rows during bootstrap', async () => {
    const item: CaptureFormItem = {
      ...WIP_ITEMS[0],
      unit_multiples: [0.5, 2],
    }
    let completeItems!: (items: CaptureFormItem[]) => void
    mockListCaptureFormItems.mockImplementation(() => new Promise(resolve => { completeItems = resolve }))
    mockUseAuth.mockReturnValue(VIEWER_MEMBER)
    const groupedRows = vi.spyOn(kitchenItemList, 'kitchenDataTableGroups')
    let commits = 0

    try {
      await act(async () => {
        render(
          <StrictMode>
            <Suspense fallback={<div role="status">Loading route</div>}>
              <Profiler id="cafe-production" onRender={() => { commits += 1 }}>
                <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe/production')]}>
                  <Routes>
                    <Route path="/cafe/production" element={<KitchenLogPage mode="production" activeBranchId={BRANCH_RUMAH_RAMES.id} activeBranchName={BRANCH_RUMAH_RAMES.name} />} />
                  </Routes>
                </MemoryRouter>
              </Profiler>
            </Suspense>
          </StrictMode>,
        )
        await Promise.resolve()
      })

      expect(screen.getByRole('main')).toBeVisible()
      expect(groupedRows.mock.calls).toHaveLength(0)

      await act(async () => {
        completeItems([item])
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(await screen.findByText(item.name)).toBeInTheDocument()
      expect(groupedRows).toHaveBeenCalled()
      expect(commits).toBeLessThan(20)
    } finally {
      groupedRows.mockRestore()
    }
  })

  it('shows loading skeleton while fetching WIP items', () => {
    // Never resolve — keeps loading
    mockListCaptureFormItems.mockReturnValue(new Promise(() => {}))
    mockFetchPlanMap.mockReturnValue(new Promise(() => {}))
    mockUseAuth.mockReturnValue(VIEWER_MEMBER)

    render(
      <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe')]}>
        <Routes>
          <Route path="/cafe" element={<KitchenLogPage />} />
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
      <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe')]}>
        <Routes>
          <Route path="/cafe" element={<KitchenLogPage />} />
        </Routes>
      </MemoryRouter>,
    )
    // Check for the sign-in link (the action element)
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router with the configured build base path.
    expect(link).toHaveAttribute('href', appUrl('/login'))
  })

  // #410: the prompt + button were hardcoded English while the rest of the page is translated.
  it('sign-in prompt renders Indonesian in the id locale', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' })
    const { I18nProvider } = await import('@/i18n/I18nProvider')
    render(
      <I18nProvider initialLocale="id">
        <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe')]}>
          <Routes>
            <Route path="/cafe" element={<KitchenLogPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    )
    expect(await screen.findByRole('link', { name: 'Masuk' })).toBeInTheDocument()
    expect(screen.getByText('Anda perlu masuk untuk menggunakan Log Kafe.')).toBeInTheDocument()
    expect(screen.queryByText(/sign in/i)).toBeNull()
  })
})

// ── empty state (no WIP items) ────────────────────────────────────────────────
describe('Empty state — no WIP items (FR-011)', () => {
  it('issue 222: an empty item list names the stream and keeps a disabled sticky submit — no error', async () => {
    mockListCaptureFormItems.mockResolvedValue([])
    mockFetchPlanMap.mockResolvedValue({
      'removed-item-a': { [PRODUCE_KEY]: 4 },
      'removed-item-b': { [PRODUCE_KEY]: 9 },
    })
    mockFetchActualsMap.mockRejectedValue(new Error('optional history read failed'))
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText('No items for Rumah Rames · Kitchen')).toBeInTheDocument()
    })
    expect(screen.getByText(/an ops lead or admin can add them/i)).toBeInTheDocument()
    expect(mockListCaptureFormItems).toHaveBeenCalledWith(DEFAULT_STREAM, 'produce')
    expect(mockFetchPlanMap).toHaveBeenCalled()
    expect(mockFetchActualsMap).toHaveBeenCalled()
    expect(mockFetchStockMap).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/counts unavailable/i)
    expect(screen.queryByText(/Planned items\s*0/)).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^submit/i })).toBeDisabled()
    expect(document.querySelector('.cafe-capture-footer')).toHaveTextContent(/0 items/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /report it/i })).toBeInTheDocument()
  })

  it.each([
    { viewport: 'phone', wide: false },
    { viewport: 'desktop', wide: true },
  ])('$viewport keeps submitted membership counts when the offered roster is empty', async ({ wide }) => {
    setWideMatchMedia(wide)
    mockListCaptureFormItems.mockResolvedValue([])
    mockFetchPlanMap.mockResolvedValue({
      'removed-item-a': { [PRODUCE_KEY]: 4 },
      'removed-item-b': { [PRODUCE_KEY]: 9 },
    })
    mockFetchActualsMap.mockResolvedValue({
      'removed-item-a': { [PRODUCE_KEY]: [loggedUnit('archived-unit', 3, 'box')] },
      'removed-item-c': { [PRODUCE_KEY]: [loggedUnit(null, 8, null, 'legacy-row')] },
    })

    await renderPage()
    await waitFor(() => expect(screen.getByRole('group', {
      name: 'Planned, made, and off-plan item counts',
    })).toBeInTheDocument())

    const summary = screen.getByRole('group', { name: 'Planned, made, and off-plan item counts' })
    expect(summary).toHaveTextContent(/Planned items\s*2/)
    expect(summary).toHaveTextContent(/Made items\s*2/)
    expect(summary).toHaveTextContent(/Off-plan items\s*1/)
    expect(summary).not.toHaveTextContent('Counts include items outside this list.')
    expect(mockFetchStockMap).not.toHaveBeenCalled()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^submit/i })).toBeDisabled()
    expect(document.querySelector('.cafe-capture-footer')).toHaveTextContent(/0 items/i)
    expect(screen.getByRole('button', { name: /report it/i })).toBeInTheDocument()
  })

  it('empty transfer roster keeps counts scoped to the selected destination', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RUMAH_RAMES, activity: 'bar' })
    mockListCaptureFormItems.mockResolvedValue([])
    mockFetchPlanMap.mockResolvedValue({
      'radiant-planned': { [TRANSFER_RADIANT_KEY]: 4 },
      'hq-planned-a': { [`transfer:${BRANCH_GORDI_HQ.id}`]: 2 },
      'hq-planned-b': { [`transfer:${BRANCH_GORDI_HQ.id}`]: 6 },
    })
    mockFetchActualsMap.mockResolvedValue({
      'radiant-planned': { [TRANSFER_RADIANT_KEY]: [loggedUnit('u-r', 5, 'batch')] },
      'radiant-off-plan': { [TRANSFER_RADIANT_KEY]: [loggedUnit('u-ro', 2, 'batch')] },
      'hq-planned-a': { [`transfer:${BRANCH_GORDI_HQ.id}`]: [loggedUnit('u-h', 3, 'batch')] },
    })

    await renderTransferPage()
    const radiantTab = await screen.findByRole('tab', { name: /transfer to radiant/i })
    const hqTab = screen.getByRole('tab', { name: /transfer to gordi hq/i })
    await userEvent.click(radiantTab)
    let summary = screen.getByRole('group', {
      name: 'Planned, transferred, and off-plan item counts for Radiant',
    })
    expect(summary).toHaveTextContent(/Planned\s*1/)
    expect(summary).toHaveTextContent(/Transferred\s*2/)
    expect(summary).toHaveTextContent(/Off-plan\s*1/)
    expect(summary).not.toHaveTextContent(/Made items|Produced items/i)

    await userEvent.click(hqTab)
    summary = screen.getByRole('group', {
      name: 'Planned, transferred, and off-plan item counts for Gordi HQ',
    })
    expect(summary).toHaveTextContent(/Planned\s*2/)
    expect(summary).toHaveTextContent(/Transferred\s*1/)
    expect(summary).toHaveTextContent(/Off-plan\s*0/)
    expect(summary).not.toHaveTextContent('Counts include items outside this list.')
    expect(mockFetchStockMap).not.toHaveBeenCalled()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^submit/i })).toBeDisabled()
    expect(document.querySelector('.cafe-capture-footer')).toHaveTextContent(/0 items/i)
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
  it('rejected item read renders the error alert with Retry, not the empty form', async () => {
    mockListCaptureFormItems.mockRejectedValue(new Error('network error'))
    await renderPage()
    await waitFor(() => {
      expect(screen.getByText(/couldn’t load the item list/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/no active wip items/i)).not.toBeInTheDocument()
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
      expect(screen.getByText('Ayam Bakar').parentElement).toHaveTextContent('WIP - Ayam Bakar')
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

  it('production capture is scoped to production and has no movement selector', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /log production/i })).toBeInTheDocument()
  })

  it('shows the unitless plan quantity as a placeholder without entering it as a value', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    const quantity = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    expect(quantity).toHaveAttribute('placeholder', '20')
    expect(quantity).toHaveValue('')
  })

  it('shows pinned Submit button', async () => {
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
    })
  })

  it('counts invalid quantities in the submit band and blocks batch submission until fixed', async () => {
    await renderPage()
    const quantity = await screen.findByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(quantity, { target: { value: '1,125' } })
    fireEvent.blur(quantity)

    const footer = document.querySelector('.kl-footer') as HTMLElement
    expect(within(footer).getByRole('button', { name: '1 item needs fixing' })).toBeInTheDocument()
    expect(within(footer).getByRole('button', { name: /^submit$/i })).toBeDisabled()
  })

  it('clears search and restores the raw invalid draft from the needs-fixing action', async () => {
    setDesktopMatchMedia(true)
    await renderPage()
    const quantity = await screen.findByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(quantity, { target: { value: '1,125' } })
    fireEvent.blur(quantity)

    const search = screen.getByRole('searchbox', { name: /find an item/i })
    fireEvent.change(search, { target: { value: 'nasi' } })
    expect(screen.queryByRole('spinbutton', { name: /quantity produced for ayam bakar/i })).toBeNull()

    const footer = document.querySelector('.kl-footer') as HTMLElement
    fireEvent.click(within(footer).getByRole('button', { name: '1 item needs fixing' }))
    expect(search).toHaveValue('')
    const restored = await screen.findByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    expect(restored).toHaveValue('1,125')
    expect(restored).toHaveFocus()
  })

  it('expands the invalid row\'s group and restores its draft from the needs-fixing action', async () => {
    setDesktopMatchMedia(true)
    mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS_WITH_OFFPLAN)
    await renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /expand not planned today/i }))
    const quantity = await screen.findByRole('spinbutton', { name: /quantity produced for sambal matah/i })
    fireEvent.change(quantity, { target: { value: '1,125' } })
    fireEvent.blur(quantity)
    fireEvent.click(screen.getByRole('button', { name: /collapse not planned today/i }))
    expect(screen.queryByRole('spinbutton', { name: /quantity produced for sambal matah/i })).toBeNull()

    const footer = document.querySelector('.kl-footer') as HTMLElement
    fireEvent.click(within(footer).getByRole('button', { name: '1 item needs fixing' }))
    const restored = await screen.findByRole('spinbutton', { name: /quantity produced for sambal matah/i })
    expect(restored).toHaveValue('1,125')
    expect(screen.getByRole('button', { name: /collapse not planned today/i })).toBeInTheDocument()
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
    const ruleStart = css.indexOf('.cafe-capture-footer.kl-footer {')
    const rule = css.slice(ruleStart, ruleStart + 500)
    const baseFooter = css.slice(css.indexOf('.kl-footer {'), css.indexOf('.kl-footer {') + 700)
    expect(baseFooter).toMatch(/position:\s*sticky/)
    expect(rule).toMatch(/bottom:\s*0/)
    expect(css.slice(css.indexOf('.kl-footer {'), css.indexOf('.kl-footer {') + 400)).toMatch(/background:\s*var\(--card\)/)
    // The shorthand alone is not enough evidence of an opaque surface — pin the
    // `background-color` longhand too (see the rule's own comment).
    expect(css.slice(css.indexOf('.kl-footer {'), css.indexOf('.kl-footer {') + 400)).toMatch(/background-color:\s*var\(--card\)/)
    expect(css.slice(css.indexOf('.kl-footer {'), css.indexOf('.kl-footer {') + 400)).toMatch(/border-top:\s*1px solid var\(--border\)/)
    // Soft-Elevation Rule: a flat utility surface never carries a resting shadow.
    expect(rule).not.toMatch(/box-shadow/)
  })

  it('B3b: the list container reserves bottom room so the sticky footer cannot permanently cover the final row', async () => {
    const css = readFileSync(resolve(process.cwd(), 'src/pages/kitchen-log-page.css'), 'utf8')
    expect(css).toMatch(/\.kl-form \.dt-table,\s*\n\.kl-form \.dt-cards \{/)
    // The shared clearance token follows the footer's tallest rendered state on both the
    // desktop table and the phone-card list, including the phone safe-area inset.
    expect(css).toMatch(/--kl-footer-clearance:\s*113px/)
    expect(css).toMatch(/\.kl-form \.dt-table\s*\{\s*margin-bottom:\s*var\(--kl-footer-clearance\)/)
    expect(css).toMatch(/\.kl-form \.dt-cards\s*\{\s*padding-bottom:\s*calc\(var\(--kl-footer-clearance\) \+ env\(safe-area-inset-bottom/)
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
      expect(screen.getByText(/note required before submit/i)).toBeInTheDocument()
    })
    // insertKitchenLogBatch should NOT have been called
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('#6: reveals the note field as soon as an off-plan qty makes Submit unavailable', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Nasi Goreng'))

    // No note field before any staged quantity
    expect(screen.queryByRole('textbox', { name: /^note for /i })).toBeNull()

    // Type an off-target qty (plan=12, qty=1 → off-target). The footer gate is live while the
    // quantity input remains focused, so the field that satisfies it must be reachable without
    // requiring an undocumented blur/tap-away step.
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '1' } })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /^note for nasi goreng$/i })).toBeInTheDocument()
      // Row-level note cue, localized (cafe-1 fix — default test locale is English)
      expect(screen.getByText(/note required before submit/i)).toBeInTheDocument()
    })
    // No submit attempt occurred
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('AC-021: off-plan item (no plan row) requires a note', async () => {
    // No plans → every staged item is off-target
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Type a qty for Ayam Bakar, then blur to apply the invalid-state cue.
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '1' } })
      fireEvent.blur(qtyInput)
      await Promise.resolve()
    })

    await waitFor(() => {
      // Row-level note cue, localized (cafe-1 fix — default test locale is English)
      expect(screen.getByText(/note required before submit/i)).toBeInTheDocument()
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

    // The note field is already reachable from the live gate; blur still applies invalid styling.
    // Fill it
    fireEvent.blur(qtyInput)
    const note = await screen.findByRole('textbox', { name: /^note for ayam bakar$/i })
    fireEvent.change(note, { target: { value: 'extra batch' } })

    await waitFor(() => {
      expect(submit).not.toBeDisabled()
    })
  })
})

// ── #744 AC-007: the capture page presents the affiliation gate ────────────────────────────
// RLS is the control (NFR-001); this is the presentation of the same rule. Sales (unaffiliated)
// sees every row and a one-line reason, but no enabled submit and no write control at all — the
// missing-item report is a write too, so it closes with the same gate; a Café-affiliated viewer
// (or an ops_lead/admin via the same selector) captures as before. The selector fails CLOSED:
// `affiliated` is required on the payload and an empty array is capture-closed.
describe('AC-744  AC-007: Café capture renders read-only for the unaffiliated', () => {
  const UNAFFILIATED: AuthState = {
    ...VIEWER_MEMBER,
    viewer: { ...VIEWER_MEMBER.viewer, affiliated: [] },
  }

  it.each([false, true])('states the read-only reason once (wide=%s)', async (wide) => {
    setWideMatchMedia(wide)
    await renderPage(UNAFFILIATED)
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Read-only, not hidden: the capture form and its rows render, but write controls are closed.
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    expect(qtyInput).toBeVisible()
    expect(qtyInput).toBeDisabled()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()

    // The ONE line stating why capture is closed.
    expect(screen.getByRole('status')).toHaveTextContent(/read café records/i)
    expect(screen.getAllByText(/you can read café records/i)).toHaveLength(1)

    // No enabled submit control, even with a staged line.
    fireEvent.change(qtyInput, { target: { value: '20' } })
    const submit = screen.getAllByRole('button', { name: /^submit/i })[0]
    expect(submit).toBeDisabled()
  })

  it('an affiliated viewer gets capture active — no reason line, submit enabled on an on-plan line', async () => {
    await renderPage({ ...VIEWER_MEMBER, viewer: { ...VIEWER_MEMBER.viewer, affiliated: ['cafe'] } })
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.queryByRole('status')).toBeNull()

    // Plan 20 minus 3 on hand = effective target 17 (kitchen-gates.effectiveTarget). Staging
    // exactly the target is on-plan, so nothing else blocks. Blur before asserting the settled
    // staged state.
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(qtyInput, { target: { value: '17' } })
    fireEvent.blur(qtyInput)
    const submit = screen.getAllByRole('button', { name: /^submit/i })[0]
    await waitFor(() => expect(submit).toBeEnabled())
  })

  it('an ops_lead without membership keeps capture active — the same selector the DB policy arms', async () => {
    await renderPage({
      ...VIEWER_MEMBER,
      viewer: { ...VIEWER_MEMBER.viewer, affiliated: [], accessRoles: ['ops_lead'] },
    })
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.queryByRole('status')).toBeNull()
  })

  // #744 review: the missing-item report files a WRITE (ops.log_entries), so it closes with
  // the same capture gate — on BOTH mounts (full list and empty state).
  it('an unaffiliated viewer sees no missing-item report control on the loaded surface', async () => {
    await renderPage(UNAFFILIATED)
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.queryByRole('button', { name: /report it/i })).not.toBeInTheDocument()
  })

  it('an unaffiliated viewer sees no report control on the empty state either', async () => {
    mockListCaptureFormItems.mockResolvedValue([])
    await renderPage(UNAFFILIATED)
    await waitFor(() => screen.getByTestId('empty-state'))

    expect(screen.queryByRole('button', { name: /report it/i })).not.toBeInTheDocument()
  })

  it('an affiliated viewer keeps the missing-item report control', async () => {
    await renderPage() // VIEWER_MEMBER: Kitchen Staff, affiliated
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.getByRole('button', { name: /report it/i })).toBeInTheDocument()
  })

  // #744 review: with capture closed the footer's stream hint and tally describe a submit
  // path the viewer cannot take — the reason line is the ONE message.
  it('with capture closed and no stream, the stream hint and the tally are suppressed', async () => {
    mockFetchDefaultStream.mockResolvedValue(null) // FR-002: the state that would hint
    await renderPage(UNAFFILIATED)
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.queryByText(/choose a production stream/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pending review/i)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/read café records/i)
  })

  it('with capture open, the same missing-stream state shows the hint but no misleading tally', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    await renderPage() // affiliated
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    // Two things now say "choose a production stream" (the top guidance and the footer's
    // own reason) — both present is fine, but there must be no stale/misleading tally.
    expect(screen.getAllByText(/choose a production stream/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/pending review/i)).not.toBeInTheDocument()
  })
})

// ── F3b: disabled Submit shows an inline reason message ──────────────
// The footer does not restate the field's own note cue verbatim — it
// names a COUNT and is itself a control that jumps to and focuses the first unresolved note.
describe('F3b: disabled Submit shows a note-missing pointer when a variance note is missing', () => {
  it.each([false, true])('shows one note-missing pointer near Submit (wide=%s)', async (wide) => {
    setWideMatchMedia(wide)
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

    // A button, not a passive status line: the count is named and it is itself the destination
    // back to the field the count is about.
    const pointer = screen.getByRole('button', { name: /1 note missing/i })
    expect(pointer).toBeInTheDocument()
    fireEvent.click(pointer)
    const note = await screen.findByRole('textbox', { name: /^note for ayam bakar$/i })
    expect(note).toHaveFocus()
  })

  it('the pointer disappears when the required note is filled', async () => {
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(qtyInput, { target: { value: '1' } })

    // Pointer shows while the note is empty
    expect(screen.getByRole('button', { name: /note missing/i })).toBeInTheDocument()

    // Fill the required note (the field is reachable as soon as the live gate appears).
    fireEvent.blur(qtyInput)
    const note = await screen.findByRole('textbox', { name: /^note for ayam bakar$/i })
    fireEvent.change(note, { target: { value: 'extra batch today' } })

    // Once the note is filled, Submit re-enables and the pointer disappears
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /note missing/i })).toBeNull()
    })
  })

  // An empty note is skipped by Tab, so the pointer must stay reachable by keyboard even while a
  // stock-cap error also blocks Submit.
  it('a keyboard user can reach the missing note when a stock-cap error is also showing', async () => {
    mockFetchPlanMap.mockResolvedValue({})
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })
    const user = userEvent.setup()
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i })
    await user.click(qtyInput)
    await user.type(qtyInput, '10') // above the 9 available: a stock-cap error, and off plan
    await waitFor(() => {
      expect(screen.getByText(/insufficient stock — produce first/i)).toBeInTheDocument()
    })

    let pointer: HTMLElement | null = null
    for (let i = 0; i < 40 && !pointer; i += 1) {
      await user.tab()
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) continue
      if (active.getAttribute('aria-label')?.match(/^note for ayam bakar$/i)) break
      if (/note missing/i.test(active.textContent ?? '')) pointer = active
    }
    const note = screen.getByRole('textbox', { name: /^note for ayam bakar$/i })
    if (pointer) {
      await user.keyboard('{Enter}')
    }
    expect(note).toHaveFocus()
  })
})

// ── AC-022: transfer over-availability REJECTS the submit (FR-023) ─────────────
// Parity with the OLD app (app/main.py ~L618-661): an over-`tersedia` transfer is a
// HARD STOP ("Produksi dulu sebelum transfer"), NOT a silent clamp. The typed qty is
// kept; Submit is blocked + the offending line shows the produce-first cue.
describe('AC-022: transfer over-availability rejects submit — "Insufficient stock — produce first" (FR-023)', () => {
  it('AC-022: an over-tersedia Transfer qty is NOT clamped — keeps the typed value + shows the cue', async () => {
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Switch to a Transfer action_type (w1 tersedia=9)
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    // The transfer qty input for Ayam Bakar (w1)
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i })

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
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i })
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
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    // w1: transfer plan 10 (absolute — FR-014 scopes stock subtraction to production);
    // tersedia 9. Log 9 with a note (off-plan 9 != 10 needs a note, but 9 <= tersedia
    // so it's NOT rejected for availability).
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '9' } })
      fireEvent.blur(qtyInput)
      await Promise.resolve()
    })
    expect(screen.queryByText(/insufficient stock/i)).toBeNull()
    const note = screen.getByRole('textbox', { name: /^note for ayam bakar$/i })
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
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
      await Promise.resolve()
    })

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i })
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
  it.each(['1,5', '1.5'])('production accepts %s and saves 1.5', async raw => {
    mockInsertKitchenLogBatch.mockResolvedValue(['decimal-production-log'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i }), { target: { value: raw } })
    fireEvent.change(await screen.findByRole('textbox', { name: /^note for ayam bakar$/i }), { target: { value: 'small batch' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^submit/i })[0]!)

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    expect(mockInsertKitchenLogBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({ action: 'produce', wip_item_id: 'w1', qty_porsi: 1.5, entry_quantity: 1.5 }),
    ])
  })

  it.each(['1,5', '1.5'])('transfer accepts %s and saves 1.5', async raw => {
    mockInsertKitchenLogBatch.mockResolvedValue(['decimal-transfer-log'])
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))

    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i }), { target: { value: raw } })
    fireEvent.change(await screen.findByRole('textbox', { name: /^note for ayam bakar$/i }), { target: { value: 'small transfer' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^submit/i })[0]!)

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    expect(mockInsertKitchenLogBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({ action: 'transfer', destination_branch_id: BRANCH_RADIANT.id, wip_item_id: 'w1', qty_porsi: 1.5, entry_quantity: 1.5 }),
    ])
  })

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
    expect(document.querySelector('.kls-meta')?.textContent).toContain('12 porsi')
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
    await userEvent.click(screen.getByRole('combobox', { name: /unit for ayam bakar/i }))
    await userEvent.click(await screen.findByRole('option', { name: 'botol' }))

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
    expect(document.querySelector('.kls-meta')?.textContent).toContain('17 botol')
  })
})

describe('issue 1345: manager-defined multiples keep the ERP default coordinate', () => {
  it('starts on the default and submits converted quantity plus the typed amount and factor', async () => {
    mockListCaptureFormItems.mockResolvedValue([{
      id: 'w1', name: 'Ayam Bakar', category: 'Main',
      units: [{ id: 'u1-default', name: 'porsi', is_default: true }],
      unit_multiples: [0.5, 2],
    }])
    mockInsertKitchenLogBatch.mockResolvedValue(['multiple-log-1'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const qtyInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    expect(qtyInput).toHaveValue('')
    expect(screen.getByRole('button', { name: /change unit for ayam bakar/i })).toHaveTextContent('porsi')

    await userEvent.click(screen.getByRole('button', { name: /change unit for ayam bakar/i }))
    await userEvent.click(screen.getByRole('combobox', { name: /unit for ayam bakar/i }))
    await userEvent.click(await screen.findByRole('option', { name: '0.5 porsi' }))
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '34' } })
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    expect(mockInsertKitchenLogBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        wip_item_id: 'w1',
        item_unit_id: 'u1-default',
        qty_porsi: 17,
        entry_quantity: 34,
        entry_unit_factor: 0.5,
      }),
    ])
    expect(document.querySelector('.kls-meta')?.textContent).toContain('34 × 0.5 porsi')
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

// ── Stream item lists (#222) ──────────────────────────────────────────────────
describe('issue 222: capture offers the stream\'s own item list', () => {
  const NOT_ON_LIST = new Error('insertKitchenLogBatch failed — CAFE_ITEM_NOT_ON_STREAM: the item is not on this stream\'s item list')

  it('switching stream re-reads the list for the new stream', async () => {
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText('Ayam Bakar'))
    mockListCaptureFormItems.mockResolvedValue([WIP_ITEMS[1]])
    await chooseStream('Gordi HQ · Kitchen')
    await waitFor(() => expect(screen.queryByText('Ayam Bakar')).not.toBeInTheDocument())
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(mockListCaptureFormItems).toHaveBeenLastCalledWith(
      expect.objectContaining({ branch: BRANCH_GORDI_HQ, activity: 'kitchen' }),
      'produce',
    )
  })

  it('issue 979: a failed submit gives focus back to the quantity being typed and keeps it; one retry saves once', async () => {
    const restore = installDisabledBlur()
    try {
      mockInsertKitchenLogBatch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(['log-1'])
      await renderPage()
      await waitFor(() => screen.getByText('Ayam Bakar'))
      const ayam = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
      ayam.focus()
      fireEvent.change(ayam, { target: { value: '17' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^submit/i }))
        await Promise.resolve()
      })
      await screen.findByRole('alert')
      expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1)
      await waitFor(() => expect(ayam).toHaveFocus())
      expect(ayam).toHaveValue('17')

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^submit/i }))
        await Promise.resolve()
      })
      await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(2))
    } finally { restore() }
  })

  it('a line refused as off-list keeps the draft, is marked, and says what to do; clearing it lets Submit through', async () => {
    mockInsertKitchenLogBatch.mockRejectedValueOnce(NOT_ON_LIST).mockResolvedValueOnce(['log-1'])
    // The list changed while the form was open: Nasi Goreng is still listed, Ayam Bakar is not.
    mockListStreamItemIds.mockResolvedValue(new Set(['w2']))
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayam = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    const nasi = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(ayam, { target: { value: '17' } })
    fireEvent.change(nasi, { target: { value: '12' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^submit/i }))
      await Promise.resolve()
    })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/no longer on this stream.s list\. clear the marked lines or switch stream/i)
    expect(ayam).toHaveValue('17')
    expect(nasi).toHaveValue('12')
    expect(screen.getAllByText('Not on this stream’s list')).toHaveLength(1)
    const marked = screen.getByText('Not on this stream’s list').closest('tr, .dt-card')
    expect(marked).toHaveTextContent('Ayam Bakar')

    fireEvent.change(ayam, { target: { value: '0' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^submit/i }))
      await Promise.resolve()
    })
    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(2))
    expect(mockInsertKitchenLogBatch.mock.calls[1][0].map(row => row.wip_item_id)).toEqual(['w2'])
    await waitFor(() => expect(screen.queryByText('Not on this stream’s list')).not.toBeInTheDocument())
  })

  it('switching stream with typed quantities asks first; Cancel keeps them, confirming switches', async () => {
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText('Ayam Bakar'))
    const nasi = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(nasi, { target: { value: '12' } })

    await chooseStream('Gordi HQ · Kitchen')
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/you have 1 quantity entered for rumah rames · kitchen/i)
    expect(dialog).toHaveTextContent(/switching to gordi hq · kitchen clears them/i)
    const planCallsBefore = mockFetchPlanMap.mock.calls.length

    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(nasi).toHaveValue('12')
    expect(screen.getByTestId('cafe-stream')).toHaveTextContent('Rumah Rames · Kitchen')
    expect(mockFetchPlanMap.mock.calls.length).toBe(planCallsBefore)

    await chooseStream('Gordi HQ · Kitchen')
    const again = await screen.findByRole('dialog')
    await act(async () => {
      fireEvent.click(within(again).getByRole('button', { name: /discard and switch/i }))
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByTestId('cafe-stream')).toHaveTextContent('Gordi HQ · Kitchen')
    })
    expect(screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })).not.toHaveValue('12')
  })
})

// ── submit error ──────────────────────────────────────────────────────────────
describe('Submit error state', () => {
  it.each([false, true])('reports a submit failure once (wide=%s)', async (wide) => {
    setWideMatchMedia(wide)
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
    // The failure is told in plain words, in the pinned action bar beside Submit, and the entry
    // survives so the same Submit can be pressed again.
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/couldn.t submit\. your entries are still here/i)
    expect(alert).not.toHaveTextContent(/server error/i)
    expect(alert.closest('.kl-footer')).not.toBeNull()
    expect(nasiInput).toHaveValue('12')
    expect(screen.getByRole('button', { name: /^submit/i })).toBeEnabled()
  })

  it.each([false, true])('announces a successful submit once in the pinned action bar (wide=%s)', async (wide) => {
    setWideMatchMedia(wide)
    mockInsertKitchenLogBatch.mockResolvedValue(['log-ok'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i }), { target: { value: '12' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await Promise.resolve()
    })
    const done = await screen.findByText(/submitted/i)
    expect(done.closest('.kl-footer')).not.toBeNull()
  })
})

// ── offline write-blocked state (NFR-008) ─────────────────────────────────────
describe('Offline / write-blocked state (NFR-008)', () => {
  it.each([false, true])('shows the offline message once (wide=%s)', async (wide) => {
    setWideMatchMedia(wide)
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true })
    await renderPage()
    await waitFor(() => {
      expect(screen.getByRole('alert', { name: /offline/i })).toBeInTheDocument()
      expect(screen.getAllByText(/you’re offline — logging needs a connection/i)).toHaveLength(1)
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
  it('renders one page title and keeps the selected stream and date on a single context line', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const head = screen.getByTestId('page-head')
    // the signed mockup .content-header chrome (icon + title + count/meta), same as S2–S5
    expect(head).toHaveClass('content-header')
    // ONE accessible heading carrying the page title (RI-IA-1)
    const h1 = within(head).getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Log production')
    const context = head.querySelector('.cafe-capture-context') as HTMLElement
    expect(context).toBeInTheDocument()
    expect(context.querySelector('[data-testid="cafe-stream"]')).toBeInTheDocument()
    expect(within(context).getByText(/^\w{3} \d{1,2} \w{3,5}$/)).toBeInTheDocument()
    expect(head.querySelector('.page-head-meta')).toBeNull()
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
      <MemoryRouter basename={APP_ROUTER_BASENAME} initialEntries={[appUrl('/cafe')]}>
        <Routes>
          <Route path="/cafe" element={<KitchenLogPage />} />
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

// Force the responsive capture hooks to read the requested viewport before render.
function setWideMatchMedia(wide: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: wide && (query === '(min-width: 768px)' || query === '(min-width: 1280px)'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}

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

// Ticket R4 / FR-018: Log carries one truthful summary rule in the page head. Its actual
// figure comes from submitted day entries, not the editable line state; the old KPI tiles and
// help tip are retired from the capture surface.
describe('R4 / FR-018: Log summary line', () => {
  it('shows plan, submitted made and off-plan totals in the head without KPI tiles or help', async () => {
    mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS_WITH_OFFPLAN)
    mockFetchActualsMap.mockResolvedValue({
      w1: { [PRODUCE_KEY]: [
        loggedUnit('u1-porsi', 12, 'porsi'),
        loggedUnit('u1-botol', 500, 'botol'),
      ] },
      w3: { [PRODUCE_KEY]: [loggedUnit(null, 7, null, 'log-off-plan')] },
    })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const summary = document.querySelector('.msr') as HTMLElement
    expect(summary).not.toBeNull()
    expect(summary.textContent).toMatch(/Planned items\s*2/)
    expect(summary.textContent).toMatch(/Made items\s*2/)
    expect(summary.textContent).toMatch(/Off-plan items\s*1/)
    expect(summary.textContent).not.toMatch(/on plan/i)
    expect(document.querySelector('.kks')).toBeNull()
    expect(screen.queryByRole('button', { name: /^help$/i })).toBeNull()
  })

  it('transfer labels and submitted summary name the destination instead of production', async () => {
    setDesktopMatchMedia(true)
    mockFetchActualsMap.mockResolvedValue({ w1: { [TRANSFER_RADIANT_KEY]: [loggedUnit('u1-porsi', 19, 'porsi')] } })
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const tab = screen.getByRole('tab', { name: /transfer to radiant/i })
    fireEvent.click(tab)
    const quantity = screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i })
    expect(quantity).toBeInTheDocument()

    const summary = document.querySelector('.msr') as HTMLElement
    expect(summary.textContent).toMatch(/Transferred\s*1/)
    expect(summary.textContent).not.toMatch(/19/)
    expect(summary.textContent).not.toMatch(/Made|Produced/i)
    expect(screen.getByRole('table', { name: /café transfer/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /transferred to radiant/i })).toBeInTheDocument()
  })

  it('keeps the summary truthful while a quantity is only staged', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const summary = document.querySelector('.msr') as HTMLElement
    const atRest = summary.textContent
    const qty = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(qty, { target: { value: '5' } })
    expect(summary.textContent).toBe(atRest)
    expect(summary.textContent).toMatch(/Made items\s*0/)
  })

  it('renders a zero-plan summary rather than a second empty-state sentence', async () => {
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(document.querySelector('.msr')?.textContent).toMatch(/Planned items\s*0/)
    expect(screen.queryByText(/planned total/i)).toBeNull()
  })

  it('does not label bound transfer capture units as unrecorded', async () => {
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const card = screen.getByText('Ayam Bakar').closest('.kl-row')!
    expect(card.querySelector('.kl-card-meta')).toHaveTextContent(/Stock\s*3/i)
    expect(card).not.toHaveTextContent('Unit not recorded')

    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
    const meta = card.querySelector('.kl-card-meta')!
    expect(meta).toHaveTextContent(/Available\s*9/i)
    expect(meta).not.toHaveTextContent('Unit not recorded')
    expect(card.querySelector('.kls-availability-fact')).not.toBeInTheDocument()
  })

  it('shows stock once when transfer availability equals stock', async () => {
    mockFetchStockMap.mockResolvedValue({ w1: { stok: 3, tersedia: 3 }, w2: { stok: 0, tersedia: 0 } })
    await renderTransferPage()
    const card = (await screen.findByText('Ayam Bakar')).closest('.kl-row')!
    expect(card.querySelector('.kl-card-meta')).toHaveTextContent(/Stock\s*3/)
    expect(card.querySelector('.kl-card-meta')).not.toHaveTextContent('Available')
    expect(card.querySelector('.kls-availability-fact')).not.toBeInTheDocument()
  })

  it('directs a row without a capture unit to Café item settings', async () => {
    mockListCaptureFormItems.mockResolvedValue([{ ...WIP_ITEMS[0], units: [] }])
    await renderPage()
    const card = (await screen.findByText('Ayam Bakar')).closest('.kl-row')!
    expect(card).toHaveTextContent('Choose a capture unit in Café item settings.')
    expect(within(card as HTMLElement).queryByText('porsi')).not.toBeInTheDocument()
  })

  it('does not label a bound production capture unit as unrecorded', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const card = screen.getByText('Ayam Bakar').closest('.kl-row')!
    expect(card.querySelector('.kl-card-meta')).toHaveTextContent(/Stock\s*3/i)
    expect(card).not.toHaveTextContent('Unit not recorded')
  })
})

// task 10b — Planned/Off-plan group split
describe('OD-K-5: Planned/Off-plan group split (desktop)', () => {
  it('a receiving-only phone list has no production-capture hint', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'kitchen', produces: false })
    mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS_WITH_OFFPLAN)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.getByRole('heading', { name: /receiving-only stream/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view café stock/i })).toBeInTheDocument()
    expect(screen.queryByText(/log as produced/i)).toBeNull()
  })

  it('a planned item lands in Planned; an unplanned one lands in Off-plan', async () => {
    setDesktopMatchMedia(true)
    mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS_WITH_OFFPLAN)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // both non-empty group headers render with the right counts (2 planned, 1 off-plan).
    const plannedHead = screen.getByRole('button', { name: /collapse planned today/i }).closest('tr')!
    expect(within(plannedHead).getByText('2')).toBeInTheDocument()
    const offplanHead = screen.getByRole('button', { name: /expand not planned today/i }).closest('tr')!
    expect(within(offplanHead).getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('Enter the amount produced')).not.toBeInTheDocument()
    expect(screen.queryByText('Sambal Matah')).toBeNull()
  })

  it('omits a zero-row group and opens Off-plan when Planned is empty', async () => {
    setDesktopMatchMedia(true)
    mockListCaptureFormItems.mockResolvedValue(WIP_ITEMS_WITH_OFFPLAN)
    mockFetchPlanMap.mockResolvedValue({})
    await renderPage()
    await waitFor(() => screen.getByText('Sambal Matah'))

    expect(screen.queryByRole('button', { name: /collapse planned today/i })).toBeNull()
    expect(screen.getByRole('button', { name: /collapse not planned today/i })).toBeInTheDocument()
    expect(screen.getByText('Sambal Matah')).toBeInTheDocument()
  })
})

// task 10c — search-mini filters rows (desktop)
describe('OD-K-5: search-mini filters', () => {
  it('typing in Find an item narrows the table to matching dishes', async () => {
    setDesktopMatchMedia(true)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    fireEvent.change(screen.getByRole('searchbox', { name: /find an item/i }), { target: { value: 'nasi' } })
    // only Nasi Goreng remains
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('keeps fast typing intact: "nasi goreng" typed with no delay is exactly what the box shows (#981)', async () => {
    setDesktopMatchMedia(true)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    const box = screen.getByRole('searchbox', { name: /find an item/i })
    await userEvent.setup({ delay: null }).type(box, 'nasi goreng')
    expect(box).toHaveValue('nasi goreng')
  })

  it('I7 / D-E1: hydrates the search from ?q= on load (a refreshed/shared link reproduces the filtered view)', async () => {
    setDesktopMatchMedia(true)
    await renderPage(VIEWER_MEMBER, `${appUrl('/cafe')}?q=nasi`)
    await waitFor(() => screen.getByText('Nasi Goreng'))

    // The search box is pre-filled from the URL and the table is already narrowed — no retype.
    expect(screen.getByRole('searchbox', { name: /find an item/i })).toHaveValue('nasi')
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

    await chooseCategory('Rice')
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it.each([
    {
      surface: 'Production',
      path: `${appUrl('/cafe')}?category=Unmatched&kind=RAW`,
      items: WIP_ITEMS,
      visibleNames: ['Ayam Bakar', 'Nasi Goreng'],
    },
    {
      surface: 'Transfer',
      path: `${appUrl('/cafe/transfer')}?category=Dairy&kind=RAW`,
      items: [...WIP_ITEMS, RAW_MILK_ITEM],
      visibleNames: ['Ayam Bakar', 'Nasi Goreng', 'Fresh milk'],
    },
  ])('phone copied $surface links do not narrow rows with hidden Category and Kind controls', async ({ path, items, visibleNames }) => {
    mockListCaptureFormItems.mockResolvedValue(items)
    await renderPage(VIEWER_MEMBER, path)
    await waitFor(() => expect(screen.getByText(visibleNames[0])).toBeInTheDocument())

    const user = userEvent.setup()
    for (const collapsedGroup of screen.queryAllByRole('button', { name: /^Expand / })) {
      await user.click(collapsedGroup)
    }
    for (const name of visibleNames) expect(screen.getByText(name)).toBeInTheDocument()

    const search = screen.getByRole('searchbox', { name: /find an item/i })
    await user.type(search, 'nasi')
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    for (const name of visibleNames.filter(name => name !== 'Nasi Goreng')) {
      expect(screen.queryByText(name)).toBeNull()
    }
  })

  it('receiving-only phone category filters narrow rows and can be changed', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'kitchen', produces: false })
    mockListCaptureFormItems.mockResolvedValue([
      WIP_ITEMS[0],
      { ...WIP_ITEMS[1], category: 'Rice' },
    ])
    await renderPage(VIEWER_MEMBER, `${appUrl('/cafe')}?category=Main`)
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(screen.getByRole('heading', { name: /receiving-only stream/i })).toBeInTheDocument()
    expect(screen.queryByText('Nasi Goreng')).toBeNull()

    await chooseCategory('Rice')
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
  })

  it('receiving Transfer phone filters keep mixed WIP and RAW rows selectable by kind', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'kitchen', produces: false })
    mockListCaptureFormItems.mockResolvedValue([...WIP_ITEMS, RAW_MILK_ITEM])
    await renderPage(VIEWER_MEMBER, appUrl('/cafe/transfer'))
    await waitFor(() => screen.getByText('Ayam Bakar'))
    const user = userEvent.setup()
    for (const collapsedGroup of screen.queryAllByRole('button', { name: /^Expand / })) {
      await user.click(collapsedGroup)
    }
    await waitFor(() => screen.getByText('Fresh milk'))
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()

    await chooseCategory('Dairy')
    expect(screen.getByText('Fresh milk')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    expect(screen.queryByText('Nasi Goreng')).toBeNull()

    await user.click(screen.getByRole('combobox', { name: /item kind/i }))
    await user.click(await screen.findByRole('option', { name: 'WIP' }))
    expect(screen.getByText('No items match your filter.')).toBeInTheDocument()

    await chooseCategory('All categories')
    expect(screen.getByText('Ayam Bakar')).toBeInTheDocument()
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByText('Fresh milk')).toBeNull()

    await user.click(screen.getByRole('combobox', { name: /item kind/i }))
    await user.click(await screen.findByRole('option', { name: 'RAW' }))
    expect(screen.getByText('Fresh milk')).toBeInTheDocument()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    expect(screen.queryByText('Nasi Goreng')).toBeNull()
  })

  it('ignores a stale RAW filter query on production, where RAW items are unavailable', async () => {
    setDesktopMatchMedia(true)
    await renderPage(VIEWER_MEMBER, `${appUrl('/cafe')}?kind=RAW`)
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(screen.getByText('Nasi Goreng')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /kind/i })).not.toBeInTheDocument()
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

  it('counts an invalid quantity draft in the discard confirmation', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '1,125' } })
    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('This clears 1 typed quantity')
  })

  it('counts an invalid edit once even when the row had a previously valid quantity', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })
    fireEvent.change(ayamInput, { target: { value: '1,125' } })
    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }))

    expect(await screen.findByRole('dialog')).toHaveTextContent('This clears 1 typed quantity')
  })
})

// task 10f — phone footer counts staged items only; unlike units across items are never summed.
describe('OD-K-5: sticky-footer tally', () => {
  it('tally reads the staged item count beside a single full-width submit action', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    const nasiInput = screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i })
    fireEvent.change(ayamInput, { target: { value: '20' } })
    fireEvent.change(nasiInput, { target: { value: '12' } })

    const footer = document.querySelector('.kl-footer') as HTMLElement
    expect(within(footer).getByText(/2 items/i)).toBeInTheDocument()
    expect(within(footer).queryByText(/32 porsi/i)).toBeNull()
    expect(within(footer).getByRole('button', { name: /^discard$/i })).toHaveClass('kl-discard-link')
    expect(within(footer).getByRole('button', { name: /submit 2/i })).toHaveClass('kl-submit')
    expect(footer.querySelector('.kl-footer-actions')).toBeNull()
  })

  it('wide-screen summary keeps per-item quantities and units separate with one sticky submit', async () => {
    setWideMatchMedia(true)
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001', 'log-002'])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    fireEvent.click(screen.getByRole('button', { name: /change unit for ayam bakar/i }))
    await userEvent.click(screen.getByRole('combobox', { name: /unit for ayam bakar/i }))
    await userEvent.click(await screen.findByRole('option', { name: 'botol' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i }), { target: { value: '17' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i }), { target: { value: '12' } })

    const aside = screen.getByRole('complementary', { name: 'Capture summary' })
    expect(aside).toHaveTextContent('17 botol')
    expect(aside).toHaveTextContent('12 porsi')
    expect(aside.querySelector('.kl-capture-summary__totals')).toBeNull()
    expect(aside).not.toHaveTextContent('29')
    expect(within(aside).queryByRole('button', { name: /submit/i })).toBeNull()
    const submit = screen.getByRole('button', { name: /submit/i })
    expect(document.querySelectorAll('.cafe-capture-footer .kl-submit')).toHaveLength(1)
    fireEvent.click(submit)
    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledOnce())
  })

  it('shows the zero count, but no Discard link, before anything is staged', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const footer = document.querySelector('.kl-footer') as HTMLElement
    expect(within(footer).getByText(/0 items/i)).toBeInTheDocument()
    expect(within(footer).getByRole('button', { name: /^submit$/i })).toBeDisabled()
    expect(within(footer).queryByRole('button', { name: /^discard$/i })).not.toBeInTheDocument()
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
    // With the default fixture every row is planned, so the zero Off-plan group is omitted.
    expect(screen.getByRole('button', { name: /collapse planned today/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /off-plan/i })).toBeNull()
  })

  it('desktop: the <table> renders; the phone card reflow is absent', async () => {
    setDesktopMatchMedia(true)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    const table = screen.getByRole('table', { name: /café production log/i })
    expect(table).toBeInTheDocument()
    expect(within(table).queryByText('Unit not recorded')).not.toBeInTheDocument()
    expect(document.querySelector('.dt-cards')).toBeNull()
  })

  it('phone capture cards omit redundant category captions and show current stock figure', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const card = screen.getByText('Ayam Bakar').closest('.kl-row')
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).queryByText('Main')).toBeNull()
    expect(within(card as HTMLElement).getByText('3')).toBeInTheDocument()
    expect(within(card as HTMLElement).getByText(/stock/i)).toBeInTheDocument()
  })

  it('phone row keeps plan and stock together under the item name and uses plan as the quantity placeholder', async () => {
    setWideMatchMedia(false)
    mockFetchPlanMap.mockResolvedValue({
      w1: { [PRODUCE_KEY]: 10 },
      w2: { [PRODUCE_KEY]: 12 },
    })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const card = screen.getByText('Ayam Bakar').closest('.kl-row') as HTMLElement
    const plan = card.querySelector('.kl-card-plan')
    expect(plan).not.toBeNull()
    expect(plan?.textContent).toContain('Plan')
    expect(plan?.textContent).toContain('10')
    expect(plan?.closest('.kl-card-meta')).toHaveTextContent('Stock')
    expect(plan?.closest('.kl-card-meta')).not.toHaveTextContent('Unit not recorded')
    expect(within(card).getByRole('spinbutton', { name: /quantity produced for ayam bakar/i }))
      .toHaveAttribute('placeholder', '10')
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
          path: '/cafe',
          element: (
            <>
              <KitchenLogPage />
              <Link to="/elsewhere">Go to dashboard</Link>
            </>
          ),
        },
        { path: '/elsewhere', element: <h1>Elsewhere</h1> },
      ],
      { basename: APP_ROUTER_BASENAME, initialEntries: [appUrl('/cafe')] },
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
// AC-006 (separate unitless plan fact + effective target + already-logged + live note gate,
// stream-scoped), AC-012b frontend half (the submitted rows carry the SELECTED pair).
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-002 / FR-001: the capture surface opens on the person's own stream and stays switchable", () => {
  it('AC-002: pre-selects the shared.default_stream() pair — not a hardcoded branch', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'bar' })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // #781: the head STATES the resolved stream as text — no control to read a value off.
    expect(within(screen.getByTestId('cafe-stream')).getByText('Radiant · Bar')).toBeInTheDocument()
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
    expect(within(head).getByTestId('cafe-stream')).toHaveTextContent('Radiant · Bar')
    // and nowhere else on the surface — two statements for one fact is how they come to disagree
    expect(screen.getAllByTestId('cafe-stream')).toHaveLength(1)
  })

  it('AC-002/AC-012b (frontend half): switching streams re-scopes plan/stock/actuals and the submitted rows carry the SWITCHED pair', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Default is (Rumah Rames, kitchen); the barista helping at GHQ switches (FR-003).
    await chooseStream('Gordi HQ · Bar')
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
  it('renders the "choose stream" guidance placeholder in place of the list, fetches no stream-scoped data, and offers no Submit', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    // #781 item 2 / B5: with no default resolved the head states nothing (B12 — an empty
    // control must never sit above the page's own content), and the guidance state offers the
    // location's own streams as direct one-click choices instead of a control to be opened first.
    expect(screen.queryByTestId('cafe-stream')).toBeNull()
    const choice = screen.getByRole('button', { name: startsWith('Radiant · Bar') })
    expect(choice).toBeInTheDocument()
    // No stream → nothing to scope the plan/stock/actuals reads to (never a guess).
    expect(mockFetchPlanMap).not.toHaveBeenCalled()
    expect(mockFetchStockMap).not.toHaveBeenCalled()
    expect(mockFetchActualsMap).not.toHaveBeenCalled()
    // Nothing can be staged without a stream, so the action bar is absent: the placeholder is the
    // one message, and there is no Submit to press.
    expect(screen.queryByText(/choose a production stream before submitting/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^submit/i })).toBeNull()
    // Nothing that LOOKS like an editable quantity field is rendered until a stream makes it
    // one — not merely disabled, absent. Dish names are absent too (no list).
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()

    // One click selects and opens capture — never a control that only focuses another control.
    fireEvent.click(choice)
    await waitFor(() => screen.getByText('Nasi Goreng'))
  })

  it('choosing a stream from the picker loads it and capture proceeds against the chosen pair', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    await chooseStream('Radiant · Bar')
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

  // Coordinator follow-up to item 1: marking is not defaulting. A person whose home Team is an
  // office Team (not a stream) but who is a CURRENT member of SEVERAL stream Teams has no default
  // (OD-CAFE-6 rung 4 — only a SOLE stream Team defaults), and must see their streams marked
  // "Your Team" and listed first among the choices.
  it('several current stream memberships (no home stream) are marked "Your Team" and listed first, with nothing preselected', async () => {
    mockFetchDefaultStream.mockResolvedValue(null) // the home Team is an office Team — no default
    mockListCafeViewerTeams.mockResolvedValue([
      {
        id: 'team-office', name: 'Ops Office', business_unit_id: 'bu-1', site_id: null,
        is_primary: true, branch_id: null, activity: null, effective_to: null,
      },
      {
        id: 'team-ghq-kitchen', name: 'Gordi HQ Kitchen', business_unit_id: 'bu-1', site_id: null,
        is_primary: false, branch_id: BRANCH_GORDI_HQ.id, activity: 'kitchen', effective_to: null,
      },
      {
        id: 'team-ghq-bar', name: 'Gordi HQ Bar', business_unit_id: 'bu-1', site_id: null,
        is_primary: false, branch_id: BRANCH_GORDI_HQ.id, activity: 'bar', effective_to: null,
      },
    ])
    await renderPage()
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    // Nothing preselected — the office Team is still not a stream.
    expect(screen.queryByText('Nasi Goreng')).toBeNull()
    expect(mockFetchPlanMap).not.toHaveBeenCalled()

    const group = screen.getByRole('group', { name: /production stream/i })
    const choices = within(group).getAllByRole('button')
    expect(choices[0]).toHaveTextContent('Gordi HQ · Kitchen')
    expect(choices[0]).toHaveTextContent('Your Team')
  })
})

// OD-CAFE-6: Log's default follows the shared ladder, and it LOOKS like Plan — heading + Change.
describe('OD-CAFE-6: Log opens by the one stream rule, with one look', () => {
  const sole = {
    id: 'team-ghq-kitchen', name: 'Gordi HQ Kitchen', business_unit_id: 'bu-1', site_id: null,
    is_primary: false, branch_id: BRANCH_GORDI_HQ.id, activity: 'kitchen' as const, effective_to: null,
  }

  it('rung 2: no home stream but ONE stream Team → opens on it, no picker', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    mockListCafeViewerTeams.mockResolvedValue([sole])
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(within(screen.getByTestId('cafe-stream')).getByText('Gordi HQ · Kitchen')).toBeInTheDocument()
    expect(screen.queryByText(/choose a production stream to start logging/i)).toBeNull()
    expect(mockFetchPlanMap.mock.calls[0][1]).toMatchObject({ branch: BRANCH_GORDI_HQ, activity: 'kitchen' })
  })

  it('rung 1: the home stream outranks a stream chosen elsewhere in Café', async () => {
    rememberStream({ branch: BRANCH_RUMAH_RAMES, activity: 'bar', produces: true }, '40000000-0000-0000-0000-000000000001', BRANCH_RUMAH_RAMES.id)
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(within(screen.getByTestId('cafe-stream')).getByText('Rumah Rames · Kitchen')).toBeInTheDocument()
  })

  it('shows the stream as a heading with a Change link — no "Stream:" label, no "Switch"', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const bar = screen.getByTestId('cafe-stream')
    expect(within(bar).getByRole('heading', { name: 'Rumah Rames · Kitchen' })).toBeInTheDocument()
    expect(within(bar).getByRole('button', { name: /^change stream$/i })).toHaveTextContent('Change')
    expect(within(bar).queryByText(/^stream:?$/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^switch/i })).toBeNull()
  })
})

describe('recorded ERP unit labels', () => {
  it('uses the exact offered unit label when current ERP units share a name', async () => {
    setWideMatchMedia(false)
    mockListCaptureFormItems.mockResolvedValue([
      {
        ...WIP_ITEMS[0],
        units: [
          { id: 'u1-batch-a', name: 'batch (1/2)', is_default: true },
          { id: 'u1-batch-b', name: 'batch (2/2)', is_default: false },
        ],
      },
      WIP_ITEMS[1],
    ])
    mockFetchActualsMap.mockResolvedValue({
      w1: { [PRODUCE_KEY]: [
        loggedUnit('u1-batch-a', 2, 'batch'),
        loggedUnit('u1-batch-b', 500, 'batch'),
      ] },
    })
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const meta = document.querySelector('.kls-meta')
    expect(meta?.textContent).toContain('2 batch (1/2)')
    expect(meta?.textContent).toContain('500 batch (2/2)')
  })
})

describe('DD-MVP-9: a receiving-only stream remains readable but cannot capture production', () => {
  it.each([
    { frame: 'without a leading slot', leading: undefined },
    { frame: 'with a leading slot', leading: <span>Opening door</span> },
  ])('keeps the receiving view factual and read-only $frame', async ({ leading }) => {
    setWideMatchMedia(false)
    mockFetchDefaultStream.mockResolvedValue({
      branch: BRANCH_RADIANT,
      activity: 'kitchen',
      produces: false,
    })
    mockFetchActualsMap.mockResolvedValue({ w1: { [PRODUCE_KEY]: [loggedUnit('u1-porsi', 4, 'porsi')] } })
    await renderPage(VIEWER_MEMBER, appUrl('/cafe'), undefined, leading)
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(within(screen.getByTestId('cafe-stream')).getByText('Radiant · Kitchen')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /receiving-only stream/i })).toBeInTheDocument()
    expect(screen.getByText('This stream receives stock, so production capture and planning are unavailable here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view café stock/i })).toHaveAttribute('href', appUrl('/cafe/stock'))
    expect(screen.getByLabelText('Café log — receiving-only read view')).toBeInTheDocument()

    const ayamCard = screen.getByText('Ayam Bakar').closest<HTMLElement>('.dt-card')!
    expect(within(ayamCard).getByText('Plan')).toBeInTheDocument()
    expect(within(ayamCard).getByText('20')).toBeInTheDocument()
    const stockFact = within(ayamCard).getByText('Stock').parentElement!
    expect(stockFact).toHaveTextContent(/Stock\s*3\s*Unit not recorded/i)
    expect(within(ayamCard).getByText('Made today')).toBeInTheDocument()
    expect(within(ayamCard).getByText('4 porsi')).toBeInTheDocument()
    expect(screen.queryByText('Made', { exact: true })).toBeNull()
    expect(screen.queryByText('Off-plan', { exact: true })).toBeNull()

    if (leading) expect(screen.getByText('Opening door')).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: /café log capture/i })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('button', { name: /^submit/i })).toBeNull()
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })
})

describe('FR-005: the picker offers exactly the catalog pairs it is given — the roastery is never a stream', () => {
  it('lists exactly the catalog pairs it is given, and no roastery option', async () => {
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText('Ayam Bakar'))

    fireEvent.click(screen.getByRole('button', { name: /^change stream$/i }))
    const listbox = screen.getByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    // Exactly STREAM_PAIRS minus the stream already in view — no placeholder (a default
    // resolved), no roastery, and nothing the fixture did not stage. Pinned to the fixture's own
    // length so growing the live catalog does not touch this test.
    expect(options).toHaveLength(STREAM_PAIRS.length - 1)
    const labels = options.map(o => o.textContent ?? '')
    const inView = screen.getByTestId('cafe-stream').querySelector('.cafe-stream__value')?.textContent
    // CANONICAL catalog names (OD-WAY-39) — never the 'Bungur' destination alias:
    // a Rumah Rames barista picking their own stream reads 'Rumah Rames', not the
    // incumbent's transfer-destination label. `startsWith` because the person's own stream
    // (item 1) carries an appended "— Your Team" tag.
    for (const branchLabel of ['Gordi HQ', 'Radiant', 'Rumah Rames']) {
      for (const activity of ['Kitchen', 'Bar']) {
        const name = `${branchLabel} · ${activity}`
        expect(labels.some(label => label.startsWith(name))).toBe(name !== inView)
      }
    }
    expect(labels.join(' ')).not.toMatch(/bungur/i)
    expect(within(listbox).queryByRole('option', { name: /roastery/i })).toBeNull()
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
    // Each row shows its fixed unit as TEXT beside the qty (FR-020) — no unit input. The only
    // comboboxes are the visible kind and category list filters.
    expect(screen.getAllByText('porsi')).toHaveLength(WIP_ITEMS.length)
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: /category/i })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /kind/i })).not.toBeInTheDocument()
  })
})

describe('AC-006 / FR-014/015: unitless plan fact + effective target + already-logged + live note gate, stream-scoped', () => {
  // Legacy AC-006 values exercise the unchanged note gate; this display does not establish
  // equivalence between the plan and stock units.
  const AC6_PLAN = { w1: { [PRODUCE_KEY]: 10 } }
  const AC6_STOCK = { w1: { stok: 2, tersedia: 2 }, w2: { stok: 0, tersedia: 0 } }
  const AC6_ACTUALS = { w1: { [PRODUCE_KEY]: [loggedUnit('u1-porsi', 4, 'porsi')] } }

  beforeEach(() => {
    mockFetchPlanMap.mockResolvedValue(AC6_PLAN)
    mockFetchStockMap.mockResolvedValue(AC6_STOCK)
    mockFetchActualsMap.mockResolvedValue(AC6_ACTUALS)
  })

  it('AC-006: a logged row keeps the plan unitless, shows actual history, and keeps the gate', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const qty = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    // The plan is a visual entry aid only; the recorded item-unit binding remains explicit.
    expect(qty).toHaveAttribute('placeholder', '10')
    // The running "already logged N" actuals (FR-014) — from the DB, not the form. The
    // English catalog says "logged" and the Indonesian catalog says "sudah".
    const meta = document.querySelector('.kls-meta')
    expect(meta?.textContent).toMatch(/(?:logged|sudah)\s*4/)

    // Legacy fixture value 8 satisfies the unchanged note gate; this display does not assert
    // that plan and stock units are equivalent.
    await act(async () => {
      fireEvent.change(qty, { target: { value: '8' } })
      fireEvent.blur(qty)
      await Promise.resolve()
    })
    expect(screen.queryByText(/note required before submit/i)).toBeNull()
  })

  it('AC-006: a variant qty reveals the required-note gate while still focused', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const qty = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    // This legacy fixture value exercises the existing required-note path; it does not assert
    // unit equivalence between plan, stock, and the selected input.
    await act(async () => {
      fireEvent.change(qty, { target: { value: '10' } })
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.getByText(/note required before submit/i)).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /^note for ayam bakar$/i })).toBeInTheDocument()
    })
  })

  it("AC-006 stream-scoped: switching streams shows the CHOSEN stream's already-logged, not the old one's", async () => {
    mockFetchActualsMap.mockImplementation(async (_date, stream) =>
      stream.branch.id === BRANCH_GORDI_HQ.id
        ? { w1: { [PRODUCE_KEY]: [loggedUnit('u1-porsi', 9, 'porsi')] } }
        : AC6_ACTUALS,
    )
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(document.querySelector('.kls-meta')?.textContent).toMatch(/(?:logged|sudah)\s*4/)

    await chooseStream('Gordi HQ · Kitchen')
    await waitFor(() => {
      expect(document.querySelector('.kls-meta')?.textContent).toMatch(/logged\s*9/)
    })
  })
})

describe('phone focused-quantity visibility after reactive footer layout', () => {
  function setBounds(element: HTMLElement, rect: DOMRect) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect)
  }

  function setFooterRendered(footer: HTMLElement, rendered: boolean) {
    vi.spyOn(footer, 'getClientRects').mockReturnValue(
      (rendered ? [footer.getBoundingClientRect()] : []) as unknown as DOMRectList,
    )
  }

  async function prepareGeometry(inputBounds: [number, number], footerBounds: [number, number], rendered = true) {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    const qty = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i }) as HTMLInputElement
    const footer = document.querySelector('.kl-footer') as HTMLElement
    const scroll = vi.fn()
    qty.scrollIntoView = scroll
    setBounds(qty, new DOMRect(0, inputBounds[0], 100, inputBounds[1] - inputBounds[0]))
    setBounds(footer, new DOMRect(0, footerBounds[0], 390, footerBounds[1] - footerBounds[0]))
    setFooterRendered(footer, rendered)
    qty.focus()
    return { qty, scroll }
  }

  it.each([
    { kind: 'partly overlapping', input: [590, 626] as [number, number], footer: [619, 780] as [number, number] },
    { kind: 'fully below', input: [803, 847] as [number, number], footer: [619, 784] as [number, number] },
  ])('scrolls only the focused quantity when it is $kind and keeps its focus and draft', async ({ input, footer }) => {
    const { qty, scroll } = await prepareGeometry(input, footer)
    fireEvent.change(qty, { target: { value: '1' } })

    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    expect(qty).toHaveFocus()
    expect(qty).toHaveValue('1')
  })

  it('does not scroll a quantity that is already above the footer', async () => {
    const { qty, scroll } = await prepareGeometry([560, 600], [619, 780])
    fireEvent.change(qty, { target: { value: '1' } })
    expect(scroll).not.toHaveBeenCalled()
    expect(qty).toHaveFocus()
    expect(qty).toHaveValue('1')
  })

  it('does not move a focused note field when another quantity updates', async () => {
    const { qty, scroll } = await prepareGeometry([803, 847], [619, 784])
    fireEvent.change(qty, { target: { value: '1' } })
    const note = await screen.findByRole('textbox', { name: /^note for ayam bakar$/i })
    scroll.mockClear()
    note.focus()
    fireEvent.change(qty, { target: { value: '2' } })
    expect(scroll).not.toHaveBeenCalled()
    expect(note).toHaveFocus()
  })

  it('does not scroll when the footer has no rendered box', async () => {
    const { qty, scroll } = await prepareGeometry([803, 847], [0, 0], false)
    fireEvent.change(qty, { target: { value: '1' } })
    expect(scroll).not.toHaveBeenCalled()
    expect(qty).toHaveFocus()
    expect(qty).toHaveValue('1')
  })
})

describe('stale-response race: an older stream fetch resolving LAST never lands under a newer stream', () => {
  it('the newer switch owns the form — the stale response is discarded, and the picker stays mounted mid-switch', async () => {
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Switch #1 → (Radiant, bar): its plan fetch HANGS — it will resolve last, stale.
    let resolveStale!: (map: Record<string, Partial<Record<string, number>>>) => void
    mockFetchPlanMap.mockImplementationOnce(
      () => new Promise(res => { resolveStale = res }),
    )
    await chooseStream('Radiant · Bar')

    // While switch #1 is in flight the Switch action MUST stay mounted (FR-003 — a slow
    // stream is never a dead end; getByRole throws here if the switch unmounts it).
    const switchDuringLoad = screen.getByRole('button', { name: /^change stream$/i })

    // Switch #2 → (Gordi HQ, kitchen): the LATEST read — resolves immediately (w2 → 33).
    mockFetchPlanMap.mockResolvedValueOnce({ w2: { [PRODUCE_KEY]: 33 } })
    fireEvent.click(switchDuringLoad)
    fireEvent.click(await screen.findByRole('option', { name: startsWith('Gordi HQ · Kitchen') }))
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
    expect(within(screen.getByTestId('cafe-stream')).getByText('Gordi HQ · Kitchen')).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: /quantity produced for nasi goreng/i }),
    ).toHaveAttribute('placeholder', '33')
  })
})

// ── AC-007 (#235): the destination picker, both movement classes, both surfaces ─
// FR-013. The movement control IS the destination picker — there is no second surface for
// movements — and cross-branch offers follow org-scoped route rows, so both classes
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
    await renderTransferPage(OPS_LEAD)
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

  it('AC-007: the KITCHEN surface follows its route rows without a held own-branch option', async () => {
    // The default fixture stream is (Rumah Rames, kitchen). Its route rows allow Radiant, not GHQ;
    // the held intra-branch movement is offered from the bar surface only.
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.queryByRole('tab', { name: /transfer to bungur within branch · bar/i })).toBeNull()
    expect(screen.getByRole('tab', { name: 'Transfer to Radiant' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Transfer to Gordi HQ' })).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Production' })).not.toBeInTheDocument()
  })

  it('AC-007: the qualified option follows the ORIGIN, not a hardcoded branch', async () => {
    // On a Radiant stream it is RADIANT that is intra-branch and Bungur that is a cross-branch
    // destination — the mirror image of the two tests above. Without this, a qualifier pinned
    // to the incumbent's one branch would pass both of them.
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'bar' })
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(
      screen.getByRole('tab', { name: /transfer to radiant within branch · kitchen/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Transfer to Bungur' })).toBeInTheDocument()
  })

  it('AC-007: with no resolved stream (FR-002) nothing is intra-branch yet, so no option is qualified', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    await renderTransferPage()
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('AC-007: an intra-branch movement is submitted as destination = the origin branch', async () => {
    // The offer is only half of it — the row it produces is what the held arm (AC-008) reads.
    // Destination equals origin, and the activity travels as the row's own stream, NOT as a
    // property of the destination: there is no destination-activity field to send (OD-WAY-44).
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RUMAH_RAMES, activity: 'bar' })
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /transfer to bungur within branch · kitchen/i }))
      await Promise.resolve()
    })

    // w1: tersedia 9, no plan for this movement → 2 is under the cap and off-plan, so the
    // variance note is required (unchanged gate — an intra-branch movement is a transfer like
    // any other on the way in; what differs is only what dispatch does with it).
    const qtyInput = screen.getByRole('spinbutton', { name: /quantity to transfer to bungur for ayam bakar/i })
    await act(async () => {
      fireEvent.change(qtyInput, { target: { value: '2' } })
      fireEvent.blur(qtyInput)
      await Promise.resolve()
    })
    const note = screen.getByRole('textbox', { name: /^note for ayam bakar$/i })
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
    await waitFor(() => expect(document.title).toBe(cafeDocTitle('nav.cafe.production')))
  })
})

// #586: `lines` staged ONE row per item across every movement segment. Type a qty under
// Produce, click a Transfer tab that never touches that item, and the OLD code left the
// same qty sitting there under Transfer too — with the tally footer still counting it and
// Submit filing it under whichever segment was active. RED on the pre-fix page: no dialog
// ever opens (handleMovementChange called setMovement directly), so `findByRole('dialog')`
// times out, and the switched-to tab keeps showing the stale 15 instead of a blank field.
// The old Produce↔Transfer tab workflow is retired; these assertions target the former single-route UI.
describe.skip('issue 586 legacy: cross-action movement switching is replaced by separate routes', () => {
  it('switching tabs with a staged qty opens the confirm dialog and keeps the OLD tab selected until it resolves', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '15' } })
    expect((ayamInput as HTMLInputElement).value).toBe('15')

    fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))

    // The confirm is open, and the segmented control has NOT switched yet — the movement
    // stays Produce (a controlled tab strip) until the dialog resolves.
    const dialog = await screen.findByRole('dialog')
    expect(screen.getByRole('tab', { name: /^production$/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /transfer to radiant/i })).toHaveAttribute('aria-selected', 'false')
    expect(within(dialog).getByText(/1 typed quantity/i)).toBeInTheDocument()
  })

  it('confirming the switch clears the staged qty and moves the tab to Transfer', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '15' } })

    fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /switch and clear/i }))

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /transfer to radiant/i })).toHaveAttribute('aria-selected', 'true')
    })
    // The line staged under Produce (15) is gone — it never rides into the Transfer
    // segment's tally or a Transfer submit (the exact defect this test guards against).
    // A positive read of the reset footer, not just the absence of the old "1 item" text
    // (which would pass just as happily on a footer showing some OTHER stale count).
    const transferInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    expect((transferInput as HTMLInputElement).value).toBe('')
    // The tally renders only while something is staged, so the positive read of "the switch
    // actually cleared it" is that the tally is gone — never a "0 items · 0 portions" render
    // that could just as happily pass on a footer silently re-rendering a stale zero next to a
    // live Submit.
    expect(document.querySelector('.kl-tally-num')).toBeNull()
  })

  it('cancelling the switch keeps the staged qty AND the original tab selected', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '15' } })

    fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(screen.getByRole('tab', { name: /^production$/i })).toHaveAttribute('aria-selected', 'true')
    expect((screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i }) as HTMLInputElement).value).toBe('15')
  })

  it('switching tabs with NOTHING staged switches immediately — no dialog', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))

    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /transfer to radiant/i })).toHaveAttribute('aria-selected', 'true')
    })
  })

  // ConfirmDialog is safe both mounted styles; conditional mount kept for unmount-cleanup —
  // confirm-dialog.tsx owns the contract this test exercises against a real caller.
  it('a second staged switch opens a FRESH, usable dialog — busy state from the first confirm does not carry over', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // First switch: stage, switch, confirm — this is the click that sets ConfirmDialog's
    // internal `busy` true on an always-mounted instance.
    const ayamInput = screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '15' } })
    fireEvent.click(screen.getByRole('tab', { name: /transfer to radiant/i }))
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /switch and clear/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    // Stage again under Transfer, then switch back to Production — the SECOND confirm.
    const transferInput = screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i })
    fireEvent.change(transferInput, { target: { value: '9' } })
    fireEvent.click(screen.getByRole('tab', { name: /^production$/i }))
    dialog = await screen.findByRole('dialog')

    const confirmBtn = within(dialog).getByRole('button', { name: /switch and clear/i })
    const cancelBtn = within(dialog).getByRole('button', { name: /cancel/i })
    expect(confirmBtn).not.toBeDisabled()
    expect(cancelBtn).not.toBeDisabled()
    expect(confirmBtn).toHaveTextContent(/switch and clear/i)
  })
})

describe('/cafe/transfer destination selection', () => {
  it('starts on an eligible transfer destination and confirms before clearing staged work on change', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RUMAH_RAMES, activity: 'bar' })
    await renderTransferPage()
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(1))

    const tabs = screen.getAllByRole('tab')
    const currentTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true')!
    const nextTab = tabs.find(tab => tab !== currentTab)!
    expect(currentTab).toHaveAccessibleName(/transfer to/i)

    const quantity = screen.getByRole('spinbutton', { name: /quantity .* for ayam bakar/i })
    fireEvent.change(quantity, { target: { value: '15' } })
    fireEvent.click(nextTab)

    const dialog = await screen.findByRole('dialog')
    expect(currentTab).toHaveAttribute('aria-selected', 'true')
    expect(nextTab).toHaveAttribute('aria-selected', 'false')
    fireEvent.click(within(dialog).getByRole('button', { name: /switch and clear/i }))

    await waitFor(() => expect(nextTab).toHaveAttribute('aria-selected', 'true'))
    expect((screen.getByRole('spinbutton', { name: /quantity .* for ayam bakar/i }) as HTMLInputElement).value).toBe('')
  })

  it('reviews a phone Transfer draft by destination and unit without changing submitted totals', async () => {
    setWideMatchMedia(false)
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RUMAH_RAMES, activity: 'bar' })
    mockFetchActualsMap.mockResolvedValue({ w1: { [TRANSFER_RADIANT_KEY]: [loggedUnit('u1-porsi', 7, 'porsi')] } })
    await renderTransferPage()
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(1))

    const user = userEvent.setup()
    await user.click(screen.getByRole('tab', { name: 'Transfer to Radiant' }))
    const submittedSummary = screen.getByRole('group', { name: 'Planned, transferred, and off-plan item counts for Radiant' })
    expect(submittedSummary).toHaveTextContent(/Transferred\s*1/)
    const submittedSnapshot = submittedSummary.textContent

    for (const collapsedGroup of screen.queryAllByRole('button', { name: /^Expand / })) {
      await user.click(collapsedGroup)
    }
    await user.click(screen.getByRole('button', { name: /change unit for ayam bakar/i }))
    await user.click(await screen.findByRole('combobox', { name: /unit for ayam bakar/i }))
    await user.click(await screen.findByRole('option', { name: 'botol' }))
    await user.type(screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i }), '2')
    await user.type(screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for nasi goreng/i }), '3')

    const draft = screen.getByRole('region', { name: 'Transfer draft' })
    expect(draft).toHaveTextContent('Destination')
    expect(draft).toHaveTextContent('Radiant')
    expect(draft).toHaveTextContent('Ayam Bakar')
    expect(draft).toHaveTextContent('2 botol')
    expect(draft).toHaveTextContent('Nasi Goreng')
    expect(draft).toHaveTextContent('3 porsi')
    expect(draft.querySelector('.kl-capture-summary__totals')).toBeNull()
    expect(draft).not.toHaveTextContent(/5/)
    expect(submittedSummary.textContent).toBe(submittedSnapshot)
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })

  it('keeps the committed destination and draft on Cancel, then focuses the confirmed destination', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RUMAH_RAMES, activity: 'bar' })
    await renderTransferPage()
    await waitFor(() => expect(screen.getAllByRole('tab').length).toBeGreaterThan(1))

    const user = userEvent.setup()
    const tabs = screen.getAllByRole('tab')
    const currentTab = tabs.find(tab => tab.getAttribute('aria-selected') === 'true')!
    const nextTab = tabs.find(tab => tab !== currentTab)!
    const quantity = screen.getByRole('spinbutton', { name: /quantity .* for ayam bakar/i })
    await user.type(quantity, '15')
    await waitFor(() => expect(quantity).toHaveValue('15'))

    await user.click(currentTab)
    await user.keyboard('{ArrowRight}')
    let dialog = await screen.findByRole('dialog')
    expect(currentTab).toHaveAttribute('aria-selected', 'true')
    expect(nextTab).toHaveAttribute('aria-selected', 'false')
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(currentTab).toHaveFocus()
    expect((quantity as HTMLInputElement).value).toBe('15')

    await user.keyboard('{ArrowRight}')
    dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /switch and clear/i }))
    await waitFor(() => {
      expect(nextTab).toHaveAttribute('aria-selected', 'true')
      expect(nextTab).toHaveFocus()
    })
    expect((screen.getByRole('spinbutton', { name: /quantity .* for ayam bakar/i }) as HTMLInputElement).value).toBe('')
    expect(mockInsertKitchenLogBatch).not.toHaveBeenCalled()
  })
})

// #586 AC (submit): the AC is that a quantity staged under one movement is never included
// in a submit performed under another — asserted end to end here, not just on the staged
// `lines` state. Stage Nasi Goreng (w2) under Produce, confirm a switch to Transfer, stage
// a DIFFERENT item (Ayam Bakar, w1) under Transfer, and submit: the payload must hold ONLY
// the Transfer line, never the cleared Produce one.
describe('transfer capture submit contract', () => {
  it('submits only the line staged under the movement active at Submit time', async () => {
    mockInsertKitchenLogBatch.mockResolvedValue(['log-001'])
    await renderTransferPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /transfer to radiant/i })).toHaveAttribute('aria-selected', 'true')
    })

    // Select an alternate shown ERP detail and stage Ayam Bakar (w1) under the selected
    // Transfer destination: 9 is within tersedia, but off the absolute plan (10), so it needs a note.
    fireEvent.click(screen.getByRole('button', { name: /change unit for ayam bakar/i }))
    await userEvent.click(screen.getByRole('combobox', { name: /unit for ayam bakar/i }))
    await userEvent.click(await screen.findByRole('option', { name: 'botol' }))
    const ayamInput = screen.getByRole('spinbutton', { name: /quantity to transfer to radiant for ayam bakar/i })
    fireEvent.change(ayamInput, { target: { value: '9' } })
    fireEvent.blur(ayamInput)
    const note = screen.getByRole('textbox', { name: /^note for ayam bakar$/i })
    fireEvent.change(note, { target: { value: 'extra ship' } })

    const submit = screen.getAllByRole('button', { name: /^submit/i })[0]
    expect(submit).not.toBeDisabled()
    fireEvent.click(submit)

    await waitFor(() => expect(mockInsertKitchenLogBatch).toHaveBeenCalledTimes(1))
    // Transfer keeps the selected ERP detail in the same payload as its movement destination.
    expect(mockInsertKitchenLogBatch.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        wip_item_id: 'w1', qty_porsi: 9, item_unit_id: 'u1-botol',
        action: 'transfer', destination_branch_id: BRANCH_RADIANT.id,
      }),
    ])
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
  // Protect the day-level summary, not the capture panel: the latter intentionally reflects
  // staged quantities. The summary rule may sit in the page head or its responsive inline/aside
  // placement, so collect the head plus every rendered metric rule without including entry rows.
  function bandText(): string {
    const head = screen.getByTestId('page-head').textContent ?? ''
    const metrics = Array.from(document.querySelectorAll('.msr')).map(node => node.textContent ?? '').join('')
    return head + metrics
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

// ── OD-CAFE-1: production capture is location-bound ──────────────────────────────────────────
// The picker offered every stream in the org while the page named the location you were at, so
// production done at one branch could be filed against another branch's books with nothing asking
// whether that was meant. These assert the boundary, and that the transfer workflow — whose whole
// job IS crossing branches — is not collateral damage.
describe('OD-CAFE-1 — the production picker is bounded by the active location', () => {
  const HQ = { activeBranchId: BRANCH_GORDI_HQ.id, activeBranchName: BRANCH_GORDI_HQ.name }

  it('offers only the active location’s streams, not every branch’s', async () => {
    await renderPage(VIEWER_MEMBER, appUrl('/cafe'), HQ)
    // The remembered default (Rumah Rames) is outside HQ, so this opens on the no-stream
    // guidance state (OD-CAFE-1) — the one-step choice itself is still reachable (#781 item 2).
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    const group = screen.getByRole('group', { name: /production stream/i })
    const offered = within(group).getAllByRole('button').map(o => o.textContent?.trim() ?? '')

    expect(offered.some(label => label.includes('Gordi HQ'))).toBe(true)
    // Every other branch in the catalog is absent — this is the defect, stated as an assertion.
    expect(offered.some(label => label.includes('Radiant'))).toBe(false)
    expect(offered.some(label => label.includes('Rumah Rames'))).toBe(false)
  })

  it('treats a remembered stream from another location as stale, and says which location this is', async () => {
    // The person's own default stream is Rumah Rames; they are standing at Gordi HQ.
    await renderPage(VIEWER_MEMBER, appUrl('/cafe'), HQ)
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    // #781/B12: with nothing resolved the head states NOTHING — not silently re-pointed at an
    // HQ stream, and not left showing Rumah Rames either.
    expect(screen.queryByTestId('cafe-stream')).toBeNull()
    const reason = screen.getByText(/belongs to another location/i)
    expect(reason).toBeInTheDocument()
    // It names BOTH: the stale stream (which the silent head no longer shows anywhere) and
    // where you are, so the guidance state reads as a boundary rather than a lost setting.
    expect(reason).toHaveTextContent('Rumah Rames')
    expect(reason).toHaveTextContent('Gordi HQ')
    expect(screen.getByRole('button', { name: /^submit$/i })).toBeDisabled()
  })

  it('keeps the person’s own default when they are standing at its location', async () => {
    await renderPage(VIEWER_MEMBER, appUrl('/cafe'), {
      activeBranchId: BRANCH_RUMAH_RAMES.id, activeBranchName: BRANCH_RUMAH_RAMES.name,
    })
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(screen.getByTestId('cafe-stream')).toHaveTextContent('Rumah Rames')
    expect(screen.queryByText(/belongs to another location/i)).toBeNull()
  })

  it('leaves the transfer workflow crossing branches — the catalog is bounded for the PICKER only', async () => {
    await renderTransferPage(VIEWER_MEMBER, {
      activeBranchId: BRANCH_RUMAH_RAMES.id, activeBranchName: BRANCH_RUMAH_RAMES.name,
    })
    await waitFor(() => screen.getByText('Ayam Bakar'))

    // Destinations are other branches by definition; filtering the catalog itself would have
    // deleted them along with the wrong-books risk.
    expect(screen.getByRole('tab', { name: /transfer to radiant/i })).toBeInTheDocument()
  })
})

// OD-CAFE-1 at the Café root with Opening hidden: no `activeBranchId` is passed, so the page
// derives the location itself — session choice, else the home stream's branch, else the only
// branch the person has a stream Team at, else ask.
describe('OD-CAFE-1 — the root Log is location-bound without the Opening wrapper', () => {
  const PERSON = VIEWER_MEMBER.status === 'authenticated' ? VIEWER_MEMBER.viewer.person.id : ''
  const labels = (nodes: HTMLElement[]) => nodes.map(o => o.textContent?.trim() ?? '')
  const team = (branchId: string, activity: 'kitchen' | 'bar') => ({
    id: `t-${branchId}-${activity}`, name: 't', business_unit_id: 'bu-1', site_id: null,
    is_primary: false, branch_id: branchId, activity, effective_to: null,
  })

  it('home stream names the location: Change offers only that location’s other streams', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    fireEvent.click(screen.getByRole('button', { name: /^change stream$/i }))
    const offered = labels(await screen.findAllByRole('option'))
    expect(offered).toEqual(['Rumah Rames · Bar'])
  })

  it('no home stream but one branch of stream Teams: the choice is that branch’s streams only', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    mockListCafeViewerTeams.mockResolvedValue([
      team(BRANCH_RUMAH_RAMES.id, 'kitchen'), team(BRANCH_RUMAH_RAMES.id, 'bar'),
    ])
    await renderPage()
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))
    expect(document.querySelector('.msr')).toBeNull()

    const group = screen.getByRole('group', { name: /production stream/i })
    const offered = labels(within(group).getAllByRole('button'))
    expect(offered).toHaveLength(2)
    expect(offered.every(label => label.includes('Rumah Rames'))).toBe(true)
  })

  it('no location resolves (Teams at several branches, no home): the choice is only their Team streams', async () => {
    mockFetchDefaultStream.mockResolvedValue(null)
    mockListCafeViewerTeams.mockResolvedValue([
      team(BRANCH_RUMAH_RAMES.id, 'kitchen'), team(BRANCH_GORDI_HQ.id, 'bar'),
    ])
    await renderPage()
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    const group = screen.getByRole('group', { name: /production stream/i })
    const offered = labels(within(group).getAllByRole('button')).map(label => label.replace(/Your Team$/, '').trim())
    expect(offered.sort()).toEqual(['Gordi HQ · Bar', 'Rumah Rames · Kitchen'])
  })

  it('a session location outranks the home stream, whose stream is then stale and not captured against', async () => {
    mockFetchDefaultStream.mockResolvedValue({ branch: BRANCH_RADIANT, activity: 'bar', produces: true })
    rememberCafeLocation(PERSON, { branchId: BRANCH_RUMAH_RAMES.id, branchName: BRANCH_RUMAH_RAMES.name })
    await renderPage()
    await waitFor(() => screen.getByText(/choose a production stream to start logging/i))

    expect(screen.queryByText('Ayam Bakar')).toBeNull()
    const group = screen.getByRole('group', { name: /production stream/i })
    const offered = labels(within(group).getAllByRole('button'))
    expect(offered.length).toBeGreaterThan(0)
    expect(offered.every(label => label.includes('Rumah Rames'))).toBe(true)
  })

  it('choosing another branch’s stream commits that location before capture', async () => {
    await renderPage(OPS_LEAD)
    await waitFor(() => screen.getByText('Ayam Bakar'))
    expect(activeCafeLocation(PERSON)?.branchId).not.toBe(BRANCH_RADIANT.id)

    // Another location's stream is marked as such before it is chosen.
    fireEvent.click(screen.getByRole('button', { name: /^change stream$/i }))
    expect(labels(await screen.findAllByRole('option'))).toContain('Radiant · Bar — Other location')
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await chooseStream('Radiant · Bar')
    await waitFor(() => expect(mockFetchPlanMap.mock.calls.at(-1)?.[1]).toMatchObject({ branch: BRANCH_RADIANT, activity: 'bar' }))

    expect(activeCafeLocation(PERSON)?.branchId).toBe(BRANCH_RADIANT.id)
    // The picker is now bounded to the NEW location: Radiant's other stream, plus other locations.
    fireEvent.click(screen.getByRole('button', { name: /^change stream$/i }))
    const offered = labels(await screen.findAllByRole('option'))
    expect(offered).toContain('Radiant · Kitchen — Receiving only')
    expect(offered).not.toContain('Radiant · Bar')
  })

  it('a person with no Team at another branch is not offered it (no silent mixing)', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))
    fireEvent.click(screen.getByRole('button', { name: /^change stream$/i }))
    const offered = labels(await screen.findAllByRole('option'))
    expect(offered.some(label => /Radiant|Gordi HQ/.test(label))).toBe(false)
  })
})

// The capture form's half of the dirty-draft contract. The Café root asks before a location
// switch throws away a count in progress, and it can only ask because THIS form publishes what
// it is holding. The root's half is covered in cafe-opening-page.test.tsx, but those tests stub
// this form out and seed the count by hand — so deleting the publishing effect below left them
// all green. This owns the half that makes the feature work.
describe('the capture form publishes what it is holding', () => {
  it('a typed quantity reaches the module the Café root reads before it discards a draft', async () => {
    await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    expect(cafeDraftCount()).toBe(0)

    await act(async () => {
      fireEvent.change(
        screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i }),
        { target: { value: '3' } },
      )
      await Promise.resolve()
    })

    await waitFor(() => expect(cafeDraftCount()).toBe(1))
  })

  it('stops holding a count once the form goes away', async () => {
    const utils = await renderPage()
    await waitFor(() => screen.getByText('Ayam Bakar'))

    await act(async () => {
      fireEvent.change(
        screen.getByRole('spinbutton', { name: /quantity produced for ayam bakar/i }),
        { target: { value: '2' } },
      )
      await Promise.resolve()
    })
    await waitFor(() => expect(cafeDraftCount()).toBe(1))

    // A count that outlived its form would make the root warn about work that no longer exists.
    await act(async () => { utils.unmount() })
    expect(cafeDraftCount()).toBe(0)
  })
})
