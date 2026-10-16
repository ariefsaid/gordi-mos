import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeStockComparisonPage } from './cafe-stock-comparison-page'

const B1 = '2d63ab19-142c-5ecb-9f88-6b512eebe581'
const B2 = '3c5514a1-49fc-5c1d-94f8-5f459fd28220'
const auth = vi.hoisted(() => ({ roles: ['admin'] as string[] }))
const reads = vi.hoisted(() => ({ items: vi.fn(), counts: vi.fn() }))
const stubs = vi.hoisted(() => ({ list: vi.fn(), item: vi.fn(), movements: vi.fn() }))
const mine = vi.hoisted(() => ({ keys: new Set<string>() }))

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: 'p1' }, accessRoles: auth.roles, roles: [], isManager: false, affiliated: [] }, signOut: vi.fn() }),
}))
const catalog = vi.hoisted(() => {
  const a = { branch: { id: '2d63ab19-142c-5ecb-9f88-6b512eebe581', code: 'gordi_hq', name: 'Gordi HQ' }, activity: 'kitchen' as const, produces: true }
  const b = { branch: { id: '3c5514a1-49fc-5c1d-94f8-5f459fd28220', code: 'rumah_rames', name: 'Rumah Rames' }, activity: 'bar' as const, produces: true }
  const options = [a, b]
  const value = {
    options, branches: [a.branch, b.branch], destinations: [], locationOptions: options, stream: a, homeStream: a, get myStreamKeys() { return mine.keys }, branchId: a.branch.id,
    resolve: async () => value, adopt: () => undefined, setStream: vi.fn(),
  }
  return value
})
vi.mock('@/lib/use-cafe-stream', () => ({ useCafeStream: () => catalog }))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => false }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => true }))
vi.mock('@/shell/use-is-split-width', () => ({ useIsRecordSplit: () => true }))
vi.mock('@/lib/db/cafe-count', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/db/cafe-count')>()), listCafeCountableItems: reads.items }))
vi.mock('@/lib/db/cafe-records', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/db/cafe-records')>()), listCafeRecordCounts: reads.counts }))
// The disconnected stubs must never be reached from the screen.
vi.mock('@/lib/db/cafe-stock-comparison', () => ({ listStockComparison: stubs.list, getStockComparisonItem: stubs.item, listEsbStockMovements: stubs.movements }))
vi.mock('@/components/kitchen/cafe-items-empty-state', () => ({ CafeItemsEmptyState: () => <p>No items</p> }))

const ITEMS = [
  { id: 'i1', name: 'Beef patty', category: 'Protein', kind: 'WIP', unitId: 'u1', unitName: 'Porsi' },
  { id: 'i2', name: 'Whipping cream', category: 'Dairy', kind: 'RAW', unitId: 'u2', unitName: 'L' },
]
const line = (over: Record<string, unknown>) => ({
  id: 'c1', branch_id: B1, activity: 'kitchen', count_date: '2026-10-14', wip_item_id: 'i1', item_name: 'Beef patty', item_category: 'Protein', item_kind: 'WIP',
  item_unit_id: 'u1', unit_name: 'Porsi', counted_quantity: 112, status: 'Confirmed', posting_status: 'not_needed', submitted_at: '2026-10-14T14:00:00Z', reviewed_at: null, row_version: 1, ...over,
})
const countsPage = (rows: unknown[]) => async (read: { after?: readonly string[] | null }) => (read.after ? { rows: [], next: null } : { rows, next: rows.length ? ['2026-10-14', 't', 'x'] : null })

function renderPage(search = `?stream=${B1}:kitchen`) {
  return render(<MemoryRouter initialEntries={[`/cafe/stock-comparison${search}`]}><CafeStockComparisonPage /></MemoryRouter>)
}

beforeEach(() => {
  auth.roles = ['admin']
  mine.keys = new Set()
  reads.items.mockResolvedValue(ITEMS)
  reads.counts.mockImplementation(countsPage([
    line({ id: 'old', count_date: '2026-10-10', counted_quantity: 50 }),
    line({ id: 'new', count_date: '2026-10-14', counted_quantity: 112, status: 'Submitted' }),
  ]))
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Stock comparison (preview)', () => {
  it('shows the real Counts and the not-connected notice, with every ESB cell blank', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Stock comparison' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Preview the table with sample figures' })).toBeInTheDocument()
    expect(screen.getAllByText(/ESB stock not connected yet/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/ESB expected and differences are unavailable/).length).toBeGreaterThan(0)
    const table = await screen.findByRole('table')
    const row = within(table).getByText('Beef patty').closest('tr')!
    // The newest non-Rejected Count (Submitted) wins over the older one, and says it is pending.
    expect(within(row).getByText('112')).toBeInTheDocument()
    expect(within(row).getAllByText('Pending confirmation').length).toBeGreaterThan(0)
    expect(within(row).queryByText('50')).not.toBeInTheDocument()
    // The item with no Count is Not counted, never zero; no ESB number or difference appears anywhere.
    const other = within(table).getByText('Whipping cream').closest('tr')!
    expect(within(other).getByText('Not counted')).toBeInTheDocument()
    expect(within(row).queryByText(/^[+-]\d/)).not.toBeInTheDocument()
    expect(within(row).getAllByText('–').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('checkbox', { name: /Only differences/ })).toBeDisabled()
    for (const fn of Object.values(stubs)) expect(fn).not.toHaveBeenCalled()
  })

  it('says a failed Count read is not an empty one: Count blank, Retry Counts, no Not counted', async () => {
    reads.counts.mockRejectedValue(new Error('down'))
    renderPage()
    expect((await screen.findAllByText(/Physical stock counts could not be read/)).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Retry stock counts' })).toBeInTheDocument()
    expect(screen.queryByText('Not counted')).not.toBeInTheDocument()
  })

  it('opens the labelled sample, which fills the table, the flags and the item panel without any read of ESB', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Preview the table with sample figures' }))
    expect(await screen.findByText(/Made-up sample figures/)).toBeInTheDocument()
    const table = await screen.findByRole('table')
    expect(within(table).getAllByText('Shortage').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('Surplus').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('Zero expected').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('Unit mismatch').length).toBeGreaterThan(0)
    expect(screen.getByText('Needs data')).toBeInTheDocument()
    await user.click(within(table).getByRole('button', { name: /Open Beef patty/ }))
    expect(await screen.findByRole('heading', { level: 2, name: /Beef patty/ })).toBeInTheDocument()
    expect(screen.getByText('Stock count history')).toBeInTheDocument()
    expect(screen.getByText('MOS movements')).toBeInTheDocument()
    expect(screen.getByText('ESB movements')).toBeInTheDocument()
    for (const fn of Object.values(stubs)) expect(fn).not.toHaveBeenCalled()
  })

  it('is closed to everyone without Count-review authority and reads nothing', async () => {
    auth.roles = ['member']
    renderPage()
    expect(await screen.findByText('Stock comparison is for people who review stock counts')).toBeInTheDocument()
    expect(reads.items).not.toHaveBeenCalled()
    expect(reads.counts).not.toHaveBeenCalled()
    expect(screen.getAllByRole('link', { name: 'Back to Café' }).length).toBeGreaterThan(0)
  })

  it('limits a stream supervisor to her own streams: another stream by deep link shows no access', async () => {
    auth.roles = ['supervisor']
    mine.keys = new Set([`${B1}|kitchen`])
    renderPage(`?stream=${B2}:bar`)
    expect(await screen.findByText('Stock comparison is for people who review stock counts')).toBeInTheDocument()
    expect(reads.items).not.toHaveBeenCalled()
    cleanup()
    renderPage(`?stream=${B1}:kitchen`)
    await waitFor(() => expect(reads.items).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('never remembers a stream choice for the rest of the Café', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('table')
    const bar = screen.queryByRole('button', { name: /switch/i })
    if (bar) await user.click(bar)
    expect(catalog.setStream).not.toHaveBeenCalled()
  })
})
