// KitchenStockPage tests — TDD, AC-tagged.
// S4 Stock view (/cafe/stock) — read-only, auto-computed, any authed member.
// Design authority: docs/plans/2026-06-20-kitchen-ui-design-plan.md §S4.
//
// Proves (unit): AC-011's RENDER half (#237, FR-060/061) — the page reads ONE selected
// (branch, activity) stream (default from shared.default_stream(), switchable — in the
// EMPTY state too, FR-003), places the system-quantity column directly beside the ERP
// inventory comparison column, never renders a stale stream's rows under a newer
// stream's label, and never labels the central kitchen "HQ"/"Stok HQ" (the CONTEXT.md
// trap — that label collides with the GHQ branch). The NET itself (approved production
// − approved transfers, per stream, cross-stream isolated) is owned at pgTAP:
// supabase/tests/ops_09_daily_log_and_stock.sql + ops_10_carried_contracts.sql block H
// — this file mocks fetchKitchenStock at that seam. Plus AC-032 (negative balances
// preserved) and the shared-kit reflow invariants (RI-IXD-6). Covers all states:
// loading, empty, error+retry, populated, unauthenticated. Read-only is the signal:
// NO edit affordances anywhere.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement, type ReactNode } from 'react'
import type { AuthState } from '@/auth/context'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'

vi.mock('@/lib/db/kitchen-logs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/db/kitchen-logs')>('@/lib/db/kitchen-logs')
  // listStreamPairs is the six-stream catalog read (#440): the head's ONE picker offers the
  // enumerated streams, never a branch × activity cross-product that can name a pair which is
  // not a stream. Un-mocked it hits Supabase and every bootstrap lands in the error state.
  return { ...actual, fetchKitchenStock: vi.fn(), listStreamPairs: vi.fn() }
})
import { fetchKitchenStock, listStreamPairs } from '@/lib/db/kitchen-logs'

vi.mock('@/lib/db/branches', () => ({ listActiveBranches: vi.fn() }))
import { listActiveBranches } from '@/lib/db/branches'

// shared.default_stream() (FR-001) — the viewer's live primary stream Team. Un-mocked
// it hits Supabase for real and every bootstrap lands in the error state.
vi.mock('@/lib/db/default-stream', () => ({ fetchDefaultStream: vi.fn() }))
import { fetchDefaultStream } from '@/lib/db/default-stream'

import { KitchenStockPage } from './kitchen-stock-page'
import { rememberStream } from '@/lib/cafe-stream'
import { branchDisplayName } from '@/lib/kitchen-action-label'
import type { KitchenStockRow } from '@/lib/db/kitchen-logs.types'

const mockUseAuth = vi.mocked(useAuth)
const mockFetchStock = vi.mocked(fetchKitchenStock)
const mockBranches = vi.mocked(listActiveBranches)
const mockDefaultStream = vi.mocked(fetchDefaultStream)
const mockStreamPairs = vi.mocked(listStreamPairs)

function wrapper({ children }: { children: ReactNode }) {
  return createElement(MemoryRouter, null, createElement(I18nProvider, null, children))
}

function viewer(accessRoles: string[]): AuthState {
  return {
    status: 'authenticated',
    viewer: {
      person: {
        id: 'p-1', org_id: 'org-1', user_id: 'auth-1', full_name: 'Budi Santoso',
        email: 'budi@example.test', must_change_password: false, archived_at: null,
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      roles: [],
      isManager: false,
      accessRoles,
    },
    signOut: vi.fn(),
  } as AuthState
}

// The catalog DELIBERATELY contains the GHQ branch: the FR-061 trap is precisely that
// "Stok HQ" (the incumbent's label for the CENTRAL kitchen, which books to Rumah Rames)
// collides with this branch. The central kitchen must render under the Rumah Rames
// display alias ('Bungur'), never "HQ".
const BRANCH_GHQ = { id: 'branch-ghq', code: 'gordi_hq', name: 'Gordi HQ' }
const BRANCH_RR = { id: 'branch-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const BRANCH_RAD = { id: 'branch-rad', code: 'radiant', name: 'Radiant' }
const CENTRAL_KITCHEN = { branch: BRANCH_RR, activity: 'kitchen' as const }
const RADIANT_BAR = { branch: BRANCH_RAD, activity: 'bar' as const }

const STOCK_ROWS: KitchenStockRow[] = [
  { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: null, stok: 12, tersedia: 8 },
  { wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', category: null, stok: -3, tersedia: -3 },
]

// The live stream Teams — six of them, {GHQ, Radiant, Rumah Rames} × {kitchen, bar}. The
// roastery is deliberately absent from this list even where it is a branch: it is never a stream.
const STREAM_PAIRS = [BRANCH_GHQ, BRANCH_RAD, BRANCH_RR].flatMap(b => [
  { branch_id: b.id, activity: 'kitchen' as const },
  { branch_id: b.id, activity: 'bar' as const },
])

/** The head picker's option value for a stream — what a switch fires. */
function streamOption(branchId: string, activity: 'kitchen' | 'bar'): string {
  return `${branchId}|${activity}`
}

beforeEach(() => {
  vi.clearAllMocks()
  // #440: the Café stream is remembered for the whole module, in sessionStorage — so a test
  // that switches streams would otherwise seed the NEXT test's default. Clear it per test.
  rememberStream(null)
  mockUseAuth.mockReturnValue(viewer(['member']))
  mockBranches.mockResolvedValue([BRANCH_GHQ, BRANCH_RAD, BRANCH_RR])
  mockStreamPairs.mockResolvedValue(STREAM_PAIRS)
  mockDefaultStream.mockResolvedValue(CENTRAL_KITCHEN)
  mockFetchStock.mockResolvedValue([])
})

function setDesktop() {
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
}
function setPhone() {
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
}
afterEach(() => { setPhone() })

describe('KitchenStockPage — auth', () => {
  it('auth loading: shows a busy state', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as AuthState)
    render(<KitchenStockPage />, { wrapper })
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('unauthenticated: prompts sign-in, never reads stock', async () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated' } as AuthState)
    render(
      <MemoryRouter basename="/mos" initialEntries={['/mos/kitchen/stock']}>
        <I18nProvider>
          <KitchenStockPage />
        </I18nProvider>
      </MemoryRouter>,
    )
    const link = await screen.findByRole('link', { name: /sign in/i })
    expect(link).toBeInTheDocument()
    // Link must resolve via the SPA router (basename applied) — not a raw href that skips /mos
    expect(link).toHaveAttribute('href', '/mos/login')
    expect(mockFetchStock).not.toHaveBeenCalled()
    expect(mockDefaultStream).not.toHaveBeenCalled()
  })

  it('any authenticated member may view stock (read-only — no role gate)', async () => {
    mockUseAuth.mockReturnValue(viewer(['member']))
    render(<KitchenStockPage />, { wrapper })
    await waitFor(() => expect(mockFetchStock).toHaveBeenCalled())
    expect(screen.queryByText(/available to ops leads/i)).not.toBeInTheDocument()
  })
})

describe('KitchenStockPage — states', () => {
  it('loading: shows a busy skeleton while stock loads', () => {
    mockFetchStock.mockReturnValue(new Promise(() => {})) // never resolves
    render(<KitchenStockPage />, { wrapper })
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('empty: a calm empty when no items/stock for the date', async () => {
    mockFetchStock.mockResolvedValue([])
    render(<KitchenStockPage />, { wrapper })
    expect(await screen.findByText(/no .*stock|nothing/i)).toBeInTheDocument()
  })

  it('error + retry: surfaces a retry that re-fetches', async () => {
    mockFetchStock.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    const retry = await screen.findByRole('button', { name: /try again/i })
    fireEvent.click(retry)
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
  })
})

describe('KitchenStockPage — per-stream scope (#237, AC-011: default from shared.default_stream(), switchable)', () => {
  it('reads stock for the shared.default_stream() stream, not a hardcoded one', async () => {
    mockDefaultStream.mockResolvedValue(RADIANT_BAR)
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await waitFor(() => expect(mockFetchStock).toHaveBeenCalled())
    expect(mockFetchStock).toHaveBeenCalledTimes(1)
    const [, stream] = mockFetchStock.mock.calls[0]
    expect(stream).toEqual(RADIANT_BAR)
  })

  // CHANGED by #440 (owner ruling): a viewer with no stream default gets an explicit choice
  // here, exactly as the capture surface already gave them — not a silent fall back to the
  // catalog's first branch. This surface answers "how much stock is there"; answering it about
  // books the viewer never picked is worse than asking which books they mean.
  it('FR-002 (#440): no stream default → asks for an explicit choice and reads NOTHING', async () => {
    mockDefaultStream.mockResolvedValue(null)
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    expect(await screen.findByText(/choose a stream/i)).toBeInTheDocument()
    expect(mockFetchStock).not.toHaveBeenCalled()
    const picker = screen.getByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.value).toBe('')
  })

  it('issue 440: the head STATES the stream in view — canonical branch · activity', async () => {
    mockDefaultStream.mockResolvedValue(RADIANT_BAR)
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    const { container } = render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const head = container.querySelector('[data-testid="page-head"]')
    expect(head?.textContent).toContain('Stream')
    const picker = within(head as HTMLElement).getByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.selectedOptions[0].textContent).toBe('Radiant · Bar')
  })

  it('issue 440: a stream chosen elsewhere in Café wins over the viewer\'s own default', async () => {
    // The person switched to Radiant · Bar on Log; Stock must open on the same books rather
    // than snapping back to their own stream and showing a different branch's numbers.
    rememberStream(RADIANT_BAR)
    mockDefaultStream.mockResolvedValue(CENTRAL_KITCHEN)
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await waitFor(() => expect(mockFetchStock).toHaveBeenCalled())
    const [, stream] = mockFetchStock.mock.calls[0]
    expect(stream).toEqual(RADIANT_BAR)
  })

  it('AC-011: switching the stream re-reads the net FOR THE SELECTED STREAM (never keeps another stream\'s rows)', async () => {
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    const switched: KitchenStockRow[] = [
      { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: null, stok: 4, tersedia: 4 },
    ]
    mockFetchStock.mockResolvedValue(switched)

    const picker = screen.getByRole('combobox', { name: /production stream/i })
    fireEvent.change(picker, { target: { value: streamOption(BRANCH_RAD.id, 'kitchen') } })
    await waitFor(() => expect(mockFetchStock).toHaveBeenCalledTimes(2))
    const [, stream] = mockFetchStock.mock.calls[1]
    expect(stream).toEqual({ branch: BRANCH_RAD, activity: 'kitchen' })

    fireEvent.change(picker, { target: { value: streamOption(BRANCH_RAD.id, 'bar') } })
    await waitFor(() => expect(mockFetchStock).toHaveBeenCalledTimes(3))
    const [, streamAfterActivity] = mockFetchStock.mock.calls[2]
    expect(streamAfterActivity).toEqual({ branch: BRANCH_RAD, activity: 'bar' })
  })

  it('stale-response race: a SLOWER older fetch resolving last never overwrites the newer stream\'s rows', async () => {
    // Bootstrap lands stream rows; then two switches whose fetches resolve OUT OF
    // ORDER — the older (stale) one last. Without the generation guard the stale
    // rows would render under the newer stream's label: this test fails on the
    // unguarded implementation (verified red before the guard existed).
    mockFetchStock.mockResolvedValueOnce(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    let resolveStale!: (rows: KitchenStockRow[]) => void
    const stalePromise = new Promise<KitchenStockRow[]>(res => { resolveStale = res })
    mockFetchStock.mockReturnValueOnce(stalePromise) // switch #1 — will resolve LAST
    fireEvent.change(screen.getByRole('combobox', { name: /production stream/i }), {
      target: { value: streamOption(BRANCH_RAD.id, 'kitchen') },
    })

    mockFetchStock.mockResolvedValueOnce([
      { wip_item_id: 'w9', wip_item_name: 'Fresh Dish', category: null, stok: 7, tersedia: 7 },
    ]) // switch #2 — the latest read
    fireEvent.change(screen.getByRole('combobox', { name: /production stream/i }), {
      target: { value: streamOption(BRANCH_RAD.id, 'bar') },
    })
    await screen.findByText('Fresh Dish')

    // NOW the stale response arrives.
    resolveStale([
      { wip_item_id: 'w8', wip_item_name: 'Stale Dish', category: null, stok: 99, tersedia: 99 },
    ])
    // Flush the stale continuation, then assert the newer stream's rows still win.
    await waitFor(() => expect(screen.queryByText('Stale Dish')).toBeNull())
    expect(screen.getByText('Fresh Dish')).toBeInTheDocument()
  })

  it('FR-003: an EMPTY stream still offers the picker (no implicit wall) and switching away works', async () => {
    mockFetchStock.mockResolvedValueOnce([]) // default stream is empty
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText(/no stock to show/i)

    // The picker is present in the empty state — an empty stream is not a dead end.
    const picker = screen.getByRole('combobox', { name: /production stream/i })
    expect(picker).toBeInTheDocument()
    expect(picker).not.toBeDisabled()

    mockFetchStock.mockResolvedValueOnce(STOCK_ROWS)
    fireEvent.change(picker, { target: { value: streamOption(BRANCH_RAD.id, 'kitchen') } })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()
    const [, stream] = mockFetchStock.mock.calls[1]
    expect(stream).toEqual({ branch: BRANCH_RAD, activity: 'kitchen' })
  })

  // INVERTED by #238's owner ruling (CONTEXT.md, Production stream). #237 shipped this surface
  // naming the stream through the 'Bungur' display alias and pinned that here — which encoded the
  // wrong rule: the capture page's stream picker had always used the canonical catalog name and
  // explicitly refused the alias, so one stream read under two names depending on which surface
  // was open. The ruling: a stream is named by its branch's CANONICAL name everywhere it is named
  // AS A STREAM; the alias names a transfer DESTINATION and the derived action label, which is
  // where the incumbent used it and where OD-K-1 parity lives.
  //
  // The assertion was inverted rather than deleted, and it now pins BOTH halves — canonical for
  // the stream, alias still alive for the destination — so the DISTINCTION is what is asserted.
  // Deleting the alias half would have left nothing standing between "the alias moved" and "the
  // alias was dropped", and dropping it would break incumbent parity.
  it('AC-011 / FR-061 (#238 ruling): the stream is named CANONICALLY — and never "HQ"/"Stok HQ"', async () => {
    setDesktop()
    mockDefaultStream.mockResolvedValue(CENTRAL_KITCHEN)
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    // The selected stream option for the central kitchen reads the CATALOG name, matching the
    // capture surface exactly — the two are routinely open side by side.
    const picker = screen.getByRole('combobox', { name: /production stream/i }) as HTMLSelectElement
    expect(picker.value).toBe(streamOption(BRANCH_RR.id, 'kitchen'))
    expect(picker.selectedOptions[0].textContent).toBe('Rumah Rames · Kitchen')
    expect(picker.textContent).not.toMatch(/Bungur/)

    // The incumbent's trap label never renders, anywhere on the surface. Unchanged, and the
    // reason FR-061 exists: "Stok HQ" means the central kitchen, which books to Rumah Rames.
    expect(screen.queryByText(/stok hq/i)).toBeNull()
    // The caption names the stream the same way — canonical, and still never "HQ" for these books.
    const caption = screen.getByRole('table').querySelector('caption')
    expect(caption?.textContent).toContain('Rumah Rames')
    expect(caption?.textContent).not.toMatch(/Bungur/)
    expect(caption?.textContent).not.toMatch(/HQ/)
  })

  it('AC-011 (#238 ruling, the other half): the Bungur alias is ALIVE for a transfer DESTINATION', async () => {
    // The alias was not dropped, only confined. branchDisplayName is what the derived action
    // label ("Transfer to Bungur") and every destination offer resolve through — the incumbent's
    // own string, and OD-K-1 parity is behavioural. Pinned at the helper, because that is the one
    // seam both halves of the rule pass through: a future "cleanup" deleting BRANCH_DISPLAY_ALIAS
    // would go red here while every stream-naming assertion above stayed green.
    expect(branchDisplayName(BRANCH_RR)).toBe('Bungur')
    expect(BRANCH_RR.name).toBe('Rumah Rames')
  })
})

describe('KitchenStockPage — populated (FR-060/061, AC-011)', () => {
  it('RI-IXD-6: desktop stock uses the shared DataTable branch, not a kitchen-local table wrapper', async () => {
    setDesktop()
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    const { container } = render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(container.querySelector('.dt-table')).not.toBeNull()
    expect(container.querySelector('.ks-tablewrap, .ks-table, .kst-table')).toBeNull()
  })

  it('RI-IXD-6: phone stock uses the shared DataTable card branch, not a parallel local table', async () => {
    setPhone()
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    const { container } = render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(container.querySelector('.dt-cards')).not.toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
    expect(container.querySelector('.ks-tablewrap, .ks-table, .kst-table, .ksc-cards')).toBeNull()
  })

  it('renders stock-specific KPI labels (not Log labels)', async () => {
    setDesktop()
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    expect(screen.getByText(/total on-hand/i)).toBeInTheDocument()
    expect(screen.getByText(/items in stock/i)).toBeInTheDocument()
    expect(screen.getByText(/negative balances/i)).toBeInTheDocument()
    expect(screen.getByText(/available total/i)).toBeInTheDocument()
    expect(screen.queryByText(/made so far/i)).toBeNull()
    expect(screen.queryByText(/% complete/i)).toBeNull()
  })

  it('no-data rows keep the Negative balances KPI neutral, not success-green', async () => {
    setDesktop()
    mockFetchStock.mockResolvedValue([
      { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: null, stok: 0, tersedia: 0 },
      { wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', category: null, stok: 0, tersedia: 0 },
    ])
    const { container } = render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    const tile = screen.getByText(/negative balances/i).closest('.kks-tile') as HTMLElement
    expect(tile).not.toBeNull()
    expect(tile.textContent).toMatch(/no stock data yet/i)
    expect(tile.querySelector('.pill--success')).toBeNull()
    expect(tile.querySelector('.pill--neutral')).not.toBeNull()
    expect(container.querySelector('.kks')).not.toBeNull()
  })

  it('explains all-zero stock as live-entered absence, not a broken feed', async () => {
    setDesktop()
    mockFetchStock.mockResolvedValue([
      { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: null, stok: 0, tersedia: 0 },
      { wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', category: null, stok: 0, tersedia: 0 },
    ])
    render(<KitchenStockPage />, { wrapper })

    await screen.findByText('Ayam Bakar')
    expect(screen.getByText('No entries logged yet today')).toBeInTheDocument()
  })

  it('AC-011 (render): the system-quantity column sits DIRECTLY BESIDE the ERP inventory column — the net itself is owned by pgTAP ops_09/ops_10', async () => {
    setDesktop()
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()

    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader').map(h => h.textContent ?? '')
    const stokIdx = headers.findIndex(h => /^stock$/i.test(h.trim()))
    const erpIdx = headers.findIndex(h => /erp inventory/i.test(h))
    expect(stokIdx).toBeGreaterThan(-1)
    expect(erpIdx).toBe(stokIdx + 1) // beside, not merely present

    // The per-stream net values render in the row (12 = Σ produce − Σ transfer for the
    // selected stream — the DB function's contract, mocked here at its seam).
    const ayamRow = screen.getByText('Ayam Bakar').closest('tr') as HTMLElement
    expect(within(ayamRow).getByText('12')).toBeInTheDocument()
    expect(within(ayamRow).getByText('8')).toBeInTheDocument()
    // ERP comparison cell is a visible placeholder until the ERP read is wired.
    expect(within(ayamRow).getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/erp inventory not connected yet/i)).toBeInTheDocument()
  })

  it('renders a semantic table with the two cuts (stok + tersedia) per item', async () => {
    setDesktop()
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    expect(await screen.findByText('Ayam Bakar')).toBeInTheDocument()

    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    // Column headers name the two cuts (stock = usable, available = available)
    expect(within(table).getByRole('columnheader', { name: /stock/i })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /available/i })).toBeInTheDocument()

    // Each item is a row showing its two numbers
    const ayamRow = screen.getByText('Ayam Bakar').closest('tr') as HTMLElement
    expect(within(ayamRow).getByText('12')).toBeInTheDocument()
    expect(within(ayamRow).getByText('8')).toBeInTheDocument()
  })

  it('AC-032: preserves negative balances (does not clamp to 0)', async () => {
    setDesktop()
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    const nasiRow = (await screen.findByText('Nasi Goreng')).closest('tr') as HTMLElement
    // -3 shown, not 0
    expect(within(nasiRow).getAllByText('-3').length).toBeGreaterThan(0)
  })

  it('read-only: no edit/save/approve controls anywhere (the stream scope is a read scope, not an edit)', async () => {
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.queryByRole('button', { name: /save|edit|approve|submit/i })).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('numeric cells carry the .tabular class for aligned digits', async () => {
    setDesktop()
    mockFetchStock.mockResolvedValue(STOCK_ROWS)
    render(<KitchenStockPage />, { wrapper })
    const ayamRow = (await screen.findByText('Ayam Bakar')).closest('tr')!
    const numCell = within(ayamRow).getByText('12')
    expect(numCell.closest('.tabular')).not.toBeNull()
  })
})

// #400 i18n port: the Stock KPI strip renders Indonesian under the id locale — AC "every
// surface listed renders Indonesian". RED first: the strip computes English literals today.
describe('KitchenStockPage — locale seam (#400)', () => {
  beforeEach(() => {
    setDesktop()
    localStorage.setItem('mos.locale', 'id')
    mockFetchStock.mockResolvedValue(STOCK_ROWS) // one negative row → 'perlu ditinjau'
  })
  afterEach(() => localStorage.clear())

  it('renders the whole KPI strip in Bahasa Indonesia', async () => {
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    expect(screen.getByRole('region', { name: 'Ringkasan stok' })).toBeInTheDocument()
    expect(screen.getByText('Total stok fisik')).toBeInTheDocument()
    expect(screen.getByText('Item bersisa stok')).toBeInTheDocument()
    expect(screen.getByText('Saldo minus')).toBeInTheDocument()
    expect(screen.getByText('Total tersedia')).toBeInTheDocument()
    expect(screen.getByText('perlu ditinjau')).toBeInTheDocument()
    expect(screen.getByText('siap ditransfer')).toBeInTheDocument()
    expect(screen.getByText('1 kosong/minus')).toBeInTheDocument() // inStock.delta
    // the English strip is gone
    expect(screen.queryByText(/total on-hand/i)).toBeNull()
    expect(screen.queryByText(/negative balances/i)).toBeNull()
  })

  // #411 review: a translation must not change what a number MEANS. The port replaced the
  // on-hand tile's only unit ('portions') with a qualifier, leaving a bare count with no unit
  // anywhere; and it moved 'transfer-ready' onto the delta while the sub-line started claiming
  // the figure is 'cumulative' — it is a cross-item total for ONE day (Σ tersedia), not a
  // running total. Both tiles now say in Indonesian exactly what they said in English.
  it('keeps the unit on the on-hand tile and does not restate what the available total means', async () => {
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')

    const onHand = screen.getByText('Total stok fisik').closest('.kks-tile') as HTMLElement
    expect(onHand.textContent).toMatch(/porsi/)

    const available = screen.getByText('Total tersedia').closest('.kks-tile') as HTMLElement
    expect(available.textContent).toMatch(/siap ditransfer/)
    expect(available.textContent).not.toMatch(/kumulatif/)
  })

  it('phone summary line is Indonesian', async () => {
    setPhone()
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const phone = document.querySelector('.kks-phone') as HTMLElement
    expect(phone).not.toBeNull()
    expect(phone.textContent).toMatch(/Stok/)
    expect(phone.textContent).toMatch(/2 item/)
    expect(phone.textContent).toMatch(/5 tersedia/) // Σ tersedia = 8 + (−3)
  })

  it('all-zero stock keeps the neutral “belum ada data stok” delta', async () => {
    mockFetchStock.mockResolvedValue([
      { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: null, stok: 0, tersedia: 0 },
    ])
    render(<KitchenStockPage />, { wrapper })
    await screen.findByText('Ayam Bakar')
    const tile = screen.getByText('Saldo minus').closest('.kks-tile') as HTMLElement
    expect(tile.textContent).toMatch(/belum ada data stok/)
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
    render(<KitchenStockPage />, { wrapper })
    await waitFor(() => expect(document.title).toBe(cafeDocTitle('nav.cafe.stock')))
  })
})
