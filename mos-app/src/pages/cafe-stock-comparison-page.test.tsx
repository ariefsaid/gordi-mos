import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComparisonPage, ComparisonRow, SourceState } from '@/lib/db/cafe-stock-comparison'
import { CafeStockComparisonPage } from './cafe-stock-comparison-page'

const B1 = '2d63ab19-142c-5ecb-9f88-6b512eebe581'
const B2 = '3c5514a1-49fc-5c1d-94f8-5f459fd28220'
const SNAPSHOT = '00000000-0000-0000-0000-00000000ed01'
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
vi.mock('@/lib/db/cafe-stock-comparison', () => ({ listStockComparison: stubs.list, getStockComparisonItem: stubs.item, listEsbStockMovements: stubs.movements }))
vi.mock('@/components/kitchen/cafe-items-empty-state', () => ({ CafeItemsEmptyState: () => <p>No items</p> }))

const ITEMS = [
  { id: 'i1', name: 'Beef patty', category: 'Protein', kind: 'WIP', unitId: 'u1', unitName: 'Porsi' },
  { id: 'i2', name: 'Whipping cream', category: 'Dairy', kind: 'RAW', unitId: 'u2', unitName: 'L' },
  { id: 'i3', name: 'Eggplant', category: null, kind: 'RAW', unitId: 'u3', unitName: 'KG' },
]
const source: SourceState = {
  connection: 'connected', snapshot_id: SNAPSHOT, mapping_version: null, as_of: '2026-10-14T16:59:59.999999Z',
  synced_at: '2026-10-15T18:00:00Z', complete: true, missing_scopes: [], stale_after_hours: 24,
  count_stale_after_hours: 24, last_complete_snapshot_id: SNAPSHOT,
}
const noSource: SourceState = {
  connection: 'not_connected', snapshot_id: null, mapping_version: null, as_of: null,
  synced_at: null, complete: false, missing_scopes: [], stale_after_hours: 24,
  count_stale_after_hours: 24, last_complete_snapshot_id: null,
}
const makeRow = (overrides: Partial<ComparisonRow> = {}): ComparisonRow => ({
  key: 'i1:u1', item_id: 'i1', item_name: 'Beef patty', kind: 'WIP', category: 'Protein', unit_id: 'u1', unit_name: 'Porsi',
  expected: { quantity: '120', unit_code: 'PORSI', as_of: source.as_of!, business_date: '2026-10-14', basis: 'end_of_day', provenance: 'source_row', snapshot_id: SNAPSHOT, row_complete: true },
  count: { id: 'c1', quantity: '112', unit_id: 'u1', unit_name: 'Porsi', count_date: '2026-10-14', submitted_at: '2026-10-14T14:00:00Z', status: 'Submitted' },
  difference: '-8', difference_pct: '-6.666666667', missing: null, flags: ['shortage', 'pending_confirmation'], indicative: false,
  ...overrides,
})
const rows: ComparisonRow[] = [
  makeRow(),
  makeRow({
    key: 'i2:u2', item_id: 'i2', item_name: 'Whipping cream', kind: 'RAW', category: 'Dairy', unit_id: 'u2', unit_name: 'L',
    expected: { quantity: '0', unit_code: 'L', as_of: source.as_of!, business_date: '2026-10-14', basis: 'end_of_day', provenance: 'source_row', snapshot_id: SNAPSHOT, row_complete: true },
    count: { id: 'c2', quantity: '0', unit_id: 'u2', unit_name: 'L', count_date: '2026-10-14', submitted_at: '2026-10-14T13:00:00Z', status: 'Confirmed' },
    difference: '0', difference_pct: '0', flags: ['no_difference'],
  }),
  makeRow({
    key: 'i3:u3', item_id: 'i3', item_name: 'Eggplant', kind: 'RAW', category: null, unit_id: 'u3', unit_name: 'KG',
    expected: null, count: null, difference: null, difference_pct: null, missing: 'mapping_needed', flags: ['mapping_needed'],
  }),
]
const comparisonPage = (pageRows: ComparisonRow[], options: { next?: string | null; source?: SourceState; total?: number; shown?: number } = {}): ComparisonPage => ({
  rows: pageRows,
  next: options.next ?? null,
  generation: SNAPSHOT,
  source: options.source ?? source,
  counts: { total: options.total ?? rows.length, shown_scope: options.shown ?? pageRows.length, gaps: 1, needs_data: 1, counted: 2, zero: 1 },
  counts_complete: true,
})
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
  stubs.list.mockResolvedValue(comparisonPage(rows))
  stubs.item.mockResolvedValue({ row: rows[0], source, source_unit_quantity: null })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Stock comparison', () => {
  it('reads real ESB EOD and Count values and displays signed, flagged differences', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Stock comparison' })).toBeInTheDocument()
    const table = await screen.findByRole('table')
    const beef = within(table).getByText('Beef patty').closest('tr')!
    expect(within(beef).getByText('120')).toBeInTheDocument()
    expect(within(beef).getByText('112')).toBeInTheDocument()
    expect(within(beef).getByText('-8')).toBeInTheDocument()
    expect(within(beef).getByText('Pending confirmation')).toBeInTheDocument()
    const cream = within(table).getByText('Whipping cream').closest('tr')!
    expect(within(cream).getAllByText('0')).toHaveLength(3)
    const eggplant = within(table).getByText('Eggplant').closest('tr')!
    expect(within(eggplant).getByText('Mapping needed')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Only differences/ })).toBeEnabled()
    expect(stubs.list).toHaveBeenCalledWith(expect.objectContaining({
      stream: { branch_id: B1, activity: 'kitchen' }, category: null, sort: 'gap', dir: 'desc',
    }))
  })

  it('keeps the source quantity but hides Counts and derived values when the Count read fails', async () => {
    reads.counts.mockRejectedValue(new Error('Count read unavailable'))
    renderPage()
    const table = await screen.findByRole('table')
    const beef = within(table).getByText('Beef patty').closest('tr')!
    expect(within(beef).getByText('120')).toBeInTheDocument()
    expect(beef).not.toHaveTextContent('112')
    expect(beef).not.toHaveTextContent('-8')
    expect(beef).toHaveTextContent('Physical stock counts could not be read, so Last stock count is blank for now.')
  })

  it('retains live Count readings but blanks expected and differences while disconnected', async () => {
    stubs.list.mockResolvedValue(comparisonPage(rows.map((row) => ({
      ...row, expected: null, difference: null, difference_pct: null, missing: 'not_connected', flags: [],
    })), { source: noSource, shown: 3 }))
    renderPage()
    expect((await screen.findAllByText(/ESB stock not connected yet/)).length).toBeGreaterThan(0)
    const table = await screen.findByRole('table')
    const beef = within(table).getByText('Beef patty').closest('tr')!
    expect(within(beef).getByText('112')).toBeInTheDocument()
    expect(within(beef).getAllByText('–').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('checkbox', { name: /Only differences/ })).toBeDisabled()
    expect(stubs.list).toHaveBeenCalledTimes(1)
  })

  it('keeps unknown rows in Only differences and delegates the filter to the server', async () => {
    const user = userEvent.setup()
    stubs.list.mockImplementation(async (scope: { only_differences: boolean }) => scope.only_differences
      ? comparisonPage([rows[0], rows[2]], { shown: 2 })
      : comparisonPage(rows))
    renderPage()
    await screen.findByRole('table')
    await user.click(screen.getByRole('checkbox', { name: /Only differences/ }))
    await waitFor(() => expect(stubs.list).toHaveBeenLastCalledWith(expect.objectContaining({ only_differences: true })))
    const filteredTable = await screen.findByRole('table')
    expect(within(filteredTable).getByText('Beef patty')).toBeInTheDocument()
    expect(within(filteredTable).getByText('Eggplant')).toBeInTheDocument()
    expect(within(filteredTable).queryByText('Whipping cream')).not.toBeInTheDocument()
  })

  it('shows and clears a no-match state when the server returns no filtered rows', async () => {
    const user = userEvent.setup()
    stubs.list.mockImplementation(async (scope: { q: string }) => scope.q
      ? comparisonPage([], { total: rows.length, shown: 0 })
      : comparisonPage(rows))
    renderPage()
    await screen.findByRole('table')
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'm')
    expect(await screen.findAllByText('No items match your filter.')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(stubs.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: '' }))
  })

  it('uses the generation-bound cursor to fetch the next server page', async () => {
    const many = Array.from({ length: 51 }, (_, index) => makeRow({
      key: `item-${index + 1}:u1`, item_id: `item-${index + 1}`, item_name: `Item ${index + 1}`,
    }))
    stubs.list.mockImplementation(async (scope: { cursor?: string }) => scope.cursor
      ? comparisonPage([many[50]], { total: 51, shown: 51 })
      : comparisonPage(many.slice(0, 50), { next: 'next-page-cursor', total: 51, shown: 51 }))
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('Item 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Item 51')).toBeInTheDocument()
    await waitFor(() => expect(stubs.list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next-page-cursor' })))
    expect(screen.queryByText('Item 1')).not.toBeInTheDocument()
  })

  it('restarts server pagination when a filter changes', async () => {
    const many = Array.from({ length: 51 }, (_, index) => makeRow({
      key: `item-${index + 1}:u1`, item_id: `item-${index + 1}`, item_name: `Item ${index + 1}`,
    }))
    stubs.list.mockImplementation(async (scope: { cursor?: string }) => scope.cursor
      ? comparisonPage([many[50]], { total: 51, shown: 51 })
      : comparisonPage(many.slice(0, 50), { next: 'next-page-cursor', total: 51, shown: 51 }))
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Item 1')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Item 51')
    await user.type(screen.getByRole('searchbox', { name: 'Search items' }), 'm')
    await screen.findByText('Item 1')
    await waitFor(() => expect(stubs.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'm', cursor: undefined })))
  })

  it('opens the authorized item detail while ESB movements remain deferred', async () => {
    const user = userEvent.setup()
    renderPage()
    const table = await screen.findByRole('table')
    await user.click(within(table).getByRole('button', { name: /Open Beef patty/ }))
    expect(await screen.findByRole('heading', { level: 2, name: /Beef patty/ })).toBeInTheDocument()
    expect(screen.getByText('Stock count history')).toBeInTheDocument()
    expect(screen.getByText('MOS movements')).toBeInTheDocument()
    expect(screen.getByText('ESB movements')).toBeInTheDocument()
    expect(stubs.item).toHaveBeenCalledWith(expect.objectContaining({ item_id: 'i1', unit_id: 'u1', generation: SNAPSHOT }))
    expect(stubs.movements).not.toHaveBeenCalled()
  })

  it('shows older counts in the selected unit when newer counts use another unit', async () => {
    reads.counts.mockImplementation(async (read: { unitId?: string; after?: readonly string[] | null }) => {
      if (read.after) return { rows: [], next: null }
      const result = read.unitId === 'u1' ? line({ id: 'older', counted_quantity: 37 }) : line({ item_unit_id: 'other' })
      return { rows: [result], next: ['2026-10-14', 't', result.id] }
    })
    const user = userEvent.setup()
    renderPage()
    const table = await screen.findByRole('table')
    await user.click(within(table).getByRole('button', { name: /Open Beef patty/ }))
    expect(await screen.findByText('37 Porsi')).toBeInTheDocument()
    expect(reads.counts).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'i1', unitId: 'u1' }))
  })

  it('is closed to everyone without Count-review authority and reads nothing', async () => {
    auth.roles = ['member']
    renderPage()
    expect(await screen.findByText('Stock comparison is for people who review stock counts')).toBeInTheDocument()
    expect(reads.items).not.toHaveBeenCalled()
    expect(reads.counts).not.toHaveBeenCalled()
    expect(stubs.list).not.toHaveBeenCalled()
    expect(screen.getAllByRole('link', { name: 'Back to Café' }).length).toBeGreaterThan(0)
  })

  it('limits a stream supervisor to her own streams: another stream by deep link shows no access', async () => {
    auth.roles = ['supervisor']
    mine.keys = new Set([`${B1}|kitchen`])
    renderPage(`?stream=${B2}:bar`)
    expect(await screen.findByText('Stock comparison is for people who review stock counts')).toBeInTheDocument()
    expect(reads.items).not.toHaveBeenCalled()
    expect(stubs.list).not.toHaveBeenCalled()
    cleanup()
    renderPage(`?stream=${B1}:kitchen`)
    await waitFor(() => expect(stubs.list).toHaveBeenCalledTimes(1))
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
