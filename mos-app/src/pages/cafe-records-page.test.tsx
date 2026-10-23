import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeRecordsPage } from './cafe-records-page'
import { requiredSources } from '@/lib/cafe-records/sources'
import { clearRecordsCache } from '@/lib/cafe-records/use-records-sources'
import { clearRecordsLookupCache } from '@/lib/cafe-records/use-records-lookups'
import type { CafeRecordCount, CafeRecordLog } from '@/lib/db/cafe-records'
import type { CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import { formatDayMonthYear, wibToday } from '@/lib/format/date'
import { resolvePreset } from '@/lib/cafe-records/period'

const B1 = '2d63ab19-142c-5ecb-9f88-6b512eebe581'
const auth = vi.hoisted(() => ({ viewer: 'p1' }))
const reads = vi.hoisted(() => ({
  logs: vi.fn(), counts: vi.fn(), receipts: vi.fn(), requests: vi.fn(),
}))

vi.mock('@/auth/use-auth', () => ({
  useAuth: () => ({ status: 'authenticated', viewer: { person: { id: auth.viewer }, accessRoles: ['member'], roles: [], isManager: false, affiliated: [] }, signOut: vi.fn() }),
}))
// Stable references, like the real hook's state: a fresh array per render would re-run every lookup forever.
const catalog = vi.hoisted(() => {
  const stream = { branch: { id: '2d63ab19-142c-5ecb-9f88-6b512eebe581', code: 'gordi_hq', name: 'Gordi HQ' }, activity: 'bar' as const, produces: true }
  const options = [stream]
  const branches = [stream.branch]
  const value = {
    options, branches, destinations: [], locationOptions: options, stream, homeStream: stream, myStreamKeys: new Set<string>(), branchId: stream.branch.id,
    resolve: async () => value, adopt: () => undefined, setStream: () => undefined,
  }
  return value
})
vi.mock('@/lib/use-cafe-stream', () => ({ useCafeStream: () => catalog }))
vi.mock('@/lib/db/cafe-item-settings', () => ({ listCafeItemSettings: async () => [{ id: 'i1', mosName: 'Pickled onion', units: [{ id: 'u1', name: 'Batch' }] }] }))
vi.mock('@/lib/db/branches', () => ({ listBranchesByIds: async () => [] }))
vi.mock('@/lib/db/cafe-records', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db/cafe-records')>()),
  listCafeRecordLogs: reads.logs, listCafeRecordCounts: reads.counts, listCafeRecordReceipts: reads.receipts, listCafeRecordRequests: reads.requests,
  listCafeRecordReceiptLines: async () => [], listCafeRecordRequestLines: async () => [],
  listCafeRecordPeople: async (ids: string[]) => ids.map(id => ({ id, full_name: 'Bayu Barista' })), listCafeRecordUnits: async () => [{ id: 'u1', unit_name: 'Batch' }],
}))
vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: () => false }))

const log = (over: Partial<CafeRecordLog> = {}): CafeRecordLog => ({
  id: 'l1', batch_id: null, log_date: '2026-10-14', branch_id: B1, activity: 'bar', action: 'produce', action_label: 'Production', destination_branch_id: null, production_location_id: null, from_storage_location_id: null, to_storage_location_id: null,
  wip_item_id: 'i1', item_unit_id: 'u1', qty_porsi: 12, entry_quantity: null, entry_unit_factor: null, entry_unit_name: null, notes: null, status: 'Approved',
  submitted_by: 'p9', created_at: '2026-10-14T03:00:00+00:00', updated_at: 'x', reviewed_by: null, reviewed_at: null, review_note: null, posted_to_esb: false,
  posted_at: null, esb_doc_num: null, superseded_by: null, item_name: 'Pickled onion', ...over,
})
const count = (): CafeRecordCount => ({
  id: 'c1', branch_id: B1, activity: 'bar', count_date: '2026-10-14', wip_item_id: 'i1', item_name: 'Pickled onion', item_category: null,
  item_kind: 'WIP', item_unit_id: 'u1', unit_name: 'Batch', counted_quantity: 4, status: 'Confirmed', posting_status: 'not_needed', submitted_by: 'p-count',
  submitted_at: '2026-10-14T05:00:00Z', reviewed_at: null, row_version: 1,
})
const request = (): CafePurchaseRequest => ({
  id: 'r1', branch_id: B1, activity: 'bar', required_by: '2026-10-20', note: null, status: 'Submitted', requested_by: 'p1',
  requested_at: '2026-10-14T01:00:00Z', reviewed_by: null, reviewed_at: null, review_note: null, row_version: 1,
  lines: [{ id: 'rl1', wip_item_id: 'i1', item_unit_id: 'u1', item_name: 'Pickled onion', item_category: null, unit_name: 'Batch', quantity: '2' }],
})
const page = (rows: unknown[]) => async (read: { after?: readonly string[] | null }) => (read.after ? { rows: [], next: null } : { rows, next: rows.length ? ['2026-10-14', 't', 'l'] : null })

function Spy({ seen }: { seen: string[] }) {
  const location = useLocation()
  const navigate = useNavigate()
  seen.push(location.search)
  ;(window as unknown as { __nav: typeof navigate }).__nav = navigate
  return null
}

function renderPage(search = '', seen: string[] = []) {
  return render(<MemoryRouter initialEntries={[`/cafe/records${search}`]}><Spy seen={seen} /><CafeRecordsPage /></MemoryRouter>)
}

const defaultMatchMedia = window.matchMedia

function usePhoneViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({ matches: false, media, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
  })
}

beforeEach(() => {
  clearRecordsCache(); clearRecordsLookupCache()
  reads.logs.mockImplementation(page([log()]))
  reads.counts.mockImplementation(page([]))
  reads.receipts.mockImplementation(page([]))
  reads.requests.mockImplementation(page([]))
})
afterEach(() => { cleanup(); vi.clearAllMocks(); window.matchMedia = defaultMatchMedia; auth.viewer = 'p1' })

describe('which sources a view must read', () => {
  it('reads only what the question needs, and everything while an item history is open', () => {
    expect(requiredSources({ question: 'made', reading: 'summary', history: '', entry: '' })).toEqual(['logs'])
    expect(requiredSources({ question: 'received', reading: 'entries', history: '', entry: '' })).toEqual(['receipts'])
    expect(requiredSources({ question: 'everything', reading: 'summary', history: '', entry: '' })).toEqual(['logs', 'counts', 'receipts', 'requests'])
    expect(requiredSources({ question: 'made', reading: 'day', history: '', entry: '' })).toEqual(['logs', 'counts'])
    expect(requiredSources({ question: 'made', reading: 'summary', history: 'i1', entry: '' })).toEqual(['logs', 'counts', 'receipts', 'requests'])
    expect(requiredSources({ question: 'made', reading: 'summary', history: '', entry: 'receipt:abc' })).toEqual(['logs', 'receipts'])
  })
})

describe('Café Records page', () => {
  it.each(['summary', 'entries', 'day'])('shows outlet sends separately in the %s reading', async reading => {
    reads.logs.mockImplementation(page([log({ action: 'outlet_send', activity: 'kitchen', qty_porsi: 4 })]))
    renderPage(`?question=sent&reading=${reading}`)
    expect(await screen.findByRole('button', { name: /Pickled onion/ })).toBeInTheDocument()
    expect(screen.getAllByText('4').length).toBeGreaterThan(0)
    if (reading === 'entries') {
      await userEvent.click(screen.getByRole('button', { name: /Opens the entry/ }))
      expect((await screen.findAllByText('No ESB posting')).length).toBeGreaterThan(0)
      expect(screen.getAllByText('Sent to outlet').length).toBeGreaterThan(0)
    }
  })

  it('opens on all readable records, the day summary, today, in the viewer\'s own stream', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { level: 1, name: 'Records' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Day summary', selected: true })).toBeInTheDocument()
    expect(screen.getByText(formatDayMonthYear(wibToday()))).toBeInTheDocument()
  })

  it('shows the stored Count submitter in Entries and the entry detail', async () => {
    reads.counts.mockImplementation(page([count()]))
    renderPage('?question=counted&reading=entries')
    expect(await screen.findByText(/Bayu Barista/)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Opens the entry/ }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Pickled onion' })).toBeInTheDocument()
    expect(screen.getByText('Bayu Barista')).toBeInTheDocument()
    expect(reads.counts).toHaveBeenCalled()
  })

  it('opens item history for a request line through its stored item identity', async () => {
    reads.requests.mockImplementation(page([request()]))
    renderPage('?question=requested&reading=entries')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Open history of Pickled onion' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Pickled onion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Requested/ })).toBeInTheDocument()
    expect(screen.queryByText(/no stored item link/i)).toBeNull()
  })

  it('shows the item and its day row once the sources settle', async () => {
    renderPage('?question=made&reading=summary')
    expect(await screen.findByRole('button', { name: /Pickled onion.*Opens the item history/ })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(reads.logs).toHaveBeenCalled()
    expect(reads.logs.mock.calls[0][0]).toMatchObject({ stream: { branchId: B1, activity: 'bar' } })
    expect(reads.counts).not.toHaveBeenCalled()
  })

  it('pushes a history entry for a tab and a record, so Back returns to the list', async () => {
    const seen: string[] = []
    renderPage('?question=made&reading=summary', seen)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: 'Entries' }))
    expect(seen.at(-1)).toContain('reading=entries')
    await user.click(await screen.findByRole('button', { name: /Opens the entry/ }))
    expect(seen.at(-1)).toContain('entry=log%3Al1')
    expect(await screen.findByRole('heading', { name: 'Pickled onion', level: 2 })).toBeInTheDocument()
    ;(window as unknown as { __nav: (n: number) => void }).__nav(-1)
    await waitFor(() => expect(seen.at(-1)).not.toContain('entry='))
    expect(seen.at(-1)).toContain('reading=entries')
  })

  it('replaces an invalid link with the usual view and says so', async () => {
    renderPage('?question=nonsense&period=forever')
    expect(await screen.findByText(/were not valid, so the usual view is shown/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Day summary', selected: true })).toBeInTheDocument()
  })

  it('says a source could not load, keeps the others, and retries only that source', async () => {
    reads.counts.mockRejectedValueOnce(new Error('network'))
    renderPage('?question=everything&reading=summary')
    const alert = await screen.findByText(/Could not load Stock count records/)
    expect(alert).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Pickled onion.*Opens the item history/ })).toBeInTheDocument()
    reads.logs.mockClear()
    await userEvent.setup().click(within(alert.closest('.notice') as HTMLElement).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(reads.counts.mock.calls.length).toBeGreaterThan(1))
    expect(reads.logs).not.toHaveBeenCalled()
  })

  it('never reads an empty result as denial, and shows the access message only for a real denial', async () => {
    renderPage('?question=made&reading=summary&period=last-month')
    reads.logs.mockImplementation(page([]))
    expect(screen.queryByText(/not available to your account/)).toBeNull()
    cleanup()
    clearRecordsCache()
    reads.logs.mockRejectedValue(Object.assign(new Error('permission denied'), { code: '42501' }))
    renderPage('?question=made&reading=summary')
    expect(await screen.findByText('These records are not available to your account')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Back to Café' }).length).toBeGreaterThan(0)
  })

  it('keeps a failed source distinct from an empty answer and offers its retry', async () => {
    reads.logs.mockRejectedValue(new Error('network unavailable'))
    renderPage('?question=made&reading=summary')

    expect(await screen.findByText(/Could not load production, transfer and waste records/)).toBeInTheDocument()
    expect(screen.queryByText('No production, transfer and waste records in this period')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('focuses Question when opening the full scope editor', async () => {
    renderPage()
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Change scope' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Question' })).toHaveFocus())
  })

  it('keeps the scoped answer and dates in the empty state; Change period opens the editor on Period', async () => {
    reads.logs.mockImplementation(page([]))
    renderPage('?question=made&reading=summary')
    expect(await screen.findByText('No production, transfer and waste records in this period')).toBeInTheDocument()
    expect(screen.getByText(/No records match “What was produced\?” in Gordi HQ · Bar for/)).toBeInTheDocument()
    const changePeriod = screen.getByRole('button', { name: 'Change period' })
    await userEvent.setup().click(changePeriod)
    const period = screen.getByRole('combobox', { name: 'Period' })
    await waitFor(() => expect(period).toHaveFocus())
    expect(screen.getByRole('button', { name: 'Change scope' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('updates both the open editor and collapsed scope summary when Back changes the URL', async () => {
    const seen: string[] = []
    renderPage('?question=made&period=today&reading=summary', seen)
    await screen.findByRole('heading', { level: 1, name: 'Records' })
    const changeScope = screen.getByRole('button', { name: 'Change scope' })
    expect(screen.queryByRole('combobox', { name: 'Question' })).toBeNull()
    const scopeSummary = within(screen.getByRole('region', { name: 'Scope of the records' }))
    expect(scopeSummary.getByText('What was produced?')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(changeScope)
    const question = screen.getByRole('combobox', { name: 'Question' })
    await user.click(question)
    await user.click(screen.getByRole('option', { name: 'How much was wasted?' }))
    await waitFor(() => expect(new URLSearchParams(seen.at(-1)).get('question')).toBe('wasted'))
    expect(question).toHaveTextContent('How much was wasted?')
    expect(scopeSummary.getByText('How much was wasted?')).toBeInTheDocument()

    ;(window as unknown as { __nav: (n: number) => void }).__nav(-1)
    await waitFor(() => expect(question).toHaveTextContent('What was produced?'))
    expect(scopeSummary.getByText('What was produced?')).toBeInTheDocument()
    await user.click(changeScope)
    expect(screen.queryByRole('combobox', { name: 'Question' })).toBeNull()
    expect(scopeSummary.getByText('What was produced?')).toBeInTheDocument()
  })

  it('restores an edited exact question, stream, and date range after a route remount', async () => {
    const exactUrl = `?question=made&period=custom&from=2026-10-10&to=2026-10-14&stream=${encodeURIComponent(`${B1}:bar`)}&reading=entries`
    const seen: string[] = []
    const first = renderPage(exactUrl, seen)
    await screen.findByRole('heading', { level: 1, name: 'Records' })

    const scope = () => within(screen.getByRole('region', { name: 'Scope of the records' }))
    expect(scope().getByText('What was produced?')).toBeInTheDocument()
    expect(scope().getByText('Gordi HQ · Bar')).toBeInTheDocument()
    expect(scope().getByText(`${formatDayMonthYear('2026-10-10')} to ${formatDayMonthYear('2026-10-14')}`)).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Change scope' }))
    const question = screen.getByRole('combobox', { name: 'Question' })
    await user.click(question)
    await user.click(screen.getByRole('option', { name: 'How much was wasted?' }))
    await user.clear(screen.getByRole('textbox', { name: 'From' }))
    await user.type(screen.getByRole('textbox', { name: 'From' }), '11/10/2026')
    await user.clear(screen.getByRole('textbox', { name: 'To' }))
    await user.type(screen.getByRole('textbox', { name: 'To' }), '13/10/2026')
    await user.click(screen.getByRole('button', { name: 'Apply range' }))
    await user.click(screen.getByRole('combobox', { name: 'Production stream' }))
    await user.click(screen.getByRole('option', { name: 'All readable streams' }))
    await waitFor(() => {
      const params = new URLSearchParams(seen.at(-1))
      expect(params.get('question')).toBe('wasted')
      expect(params.get('from')).toBe('2026-10-11')
      expect(params.get('to')).toBe('2026-10-13')
      expect(params.get('stream')).toBe('all')
    })
    const editedUrl = new URLSearchParams(seen.at(-1))
    expect(editedUrl.get('period')).toBe('custom')
    expect(editedUrl.get('from')).toBe('2026-10-11')
    expect(editedUrl.get('to')).toBe('2026-10-13')
    expect(editedUrl.get('stream')).toBe('all')
    expect(editedUrl.get('reading')).toBe('entries')
    first.unmount()

    renderPage(seen.at(-1) ?? exactUrl)
    await screen.findByRole('heading', { level: 1, name: 'Records' })
    expect(scope().getByText('How much was wasted?')).toBeInTheDocument()
    expect(scope().getByText('All readable streams')).toBeInTheDocument()
    expect(scope().getByText(`${formatDayMonthYear('2026-10-11')} to ${formatDayMonthYear('2026-10-13')}`)).toBeInTheDocument()
  })

  it('lets a phone reader change period and stream from the empty state and shows the effective dates', async () => {
    usePhoneViewport()
    reads.logs.mockImplementation(page([]))
    const seen: string[] = []
    renderPage('?question=made&reading=summary', seen)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Change period' }))

    const period = screen.getByRole('combobox', { name: 'Period' })
    expect(period).toHaveFocus()
    await user.click(period)
    await user.click(await screen.findByRole('option', { name: 'Last month' }))
    const range = resolvePreset('last-month', wibToday())
    await waitFor(() => {
      const params = new URLSearchParams(seen.at(-1))
      expect(params.get('period')).toBe('last-month')
      expect(params.get('from')).toBe(range.from)
      expect(params.get('to')).toBe(range.to)
    })
    expect(screen.getByText(`${formatDayMonthYear(range.from)} to ${formatDayMonthYear(range.to)}`)).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Production stream' }))
    await user.click(await screen.findByRole('option', { name: 'All readable streams' }))
    await waitFor(() => expect(new URLSearchParams(seen.at(-1)).get('stream')).toBe('all'))
  })

  it('changes Records sort from the phone Filters panel with one URL history step', async () => {
    usePhoneViewport()
    const seen: string[] = []
    renderPage('?question=made&reading=entries', seen)
    await waitFor(() => expect(within(screen.getByLabelText('Search and filter the records')).getByRole('status')).toHaveTextContent('Newest first'))
    const user = userEvent.setup()
    await user.click(screen.getByText('Filters & sort'))
    await user.click(screen.getByRole('combobox', { name: 'Sort' }))
    await user.click(await screen.findByRole('option', { name: 'Item A to Z' }))
    await waitFor(() => {
      const params = new URLSearchParams(seen.at(-1))
      expect(params.get('sort')).toBe('item')
      expect(params.has('dir')).toBe(false)
    })

    ;(window as unknown as { __nav: (n: number) => void }).__nav(-1)
    await waitFor(() => expect(new URLSearchParams(seen.at(-1)).has('sort')).toBe(false))
    expect(new URLSearchParams(seen.at(-1)).get('reading')).toBe('entries')
  })

  it('lets a phone reader change period and stream from the empty state and shows the effective dates', async () => {
    usePhoneViewport()
    reads.logs.mockImplementation(page([]))
    const seen: string[] = []
    renderPage('?question=made&reading=summary', seen)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Change period' }))

    const period = screen.getByRole('combobox', { name: 'Period' })
    expect(period).toHaveFocus()
    await user.click(period)
    await user.click(await screen.findByRole('option', { name: 'Last month' }))
    const range = resolvePreset('last-month', wibToday())
    await waitFor(() => {
      const params = new URLSearchParams(seen.at(-1))
      expect(params.get('period')).toBe('last-month')
      expect(params.get('from')).toBe(range.from)
      expect(params.get('to')).toBe(range.to)
    })
    expect(screen.getByText(`${formatDayMonthYear(range.from)} to ${formatDayMonthYear(range.to)}`)).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Production stream' }))
    await user.click(await screen.findByRole('option', { name: 'All readable streams' }))
    await waitFor(() => expect(new URLSearchParams(seen.at(-1)).get('stream')).toBe('all'))
  })

  it('changes Records sort from the phone Filters panel with one URL history step', async () => {
    usePhoneViewport()
    const seen: string[] = []
    renderPage('?question=made&reading=entries', seen)
    await waitFor(() => expect(within(screen.getByLabelText('Search and filter the records')).getByRole('status')).toHaveTextContent('Newest first'))
    const user = userEvent.setup()
    await user.click(screen.getByText('Filters & sort'))
    await user.click(screen.getByRole('combobox', { name: 'Sort' }))
    await user.click(await screen.findByRole('option', { name: 'Item A to Z' }))
    await waitFor(() => {
      const params = new URLSearchParams(seen.at(-1))
      expect(params.get('sort')).toBe('item')
      expect(params.has('dir')).toBe(false)
    })

    ;(window as unknown as { __nav: (n: number) => void }).__nav(-1)
    await waitFor(() => expect(new URLSearchParams(seen.at(-1)).has('sort')).toBe(false))
    expect(new URLSearchParams(seen.at(-1)).get('reading')).toBe('entries')
  })

  it('does not carry one account\'s rows to another: switching the viewer starts from nothing', async () => {
    const view = renderPage('?question=made&reading=summary')
    expect(await screen.findByRole('button', { name: /Pickled onion.*Opens the item history/ })).toBeInTheDocument()
    cleanup()
    clearRecordsCache()
    auth.viewer = 'p2'
    reads.logs.mockImplementation(page([]))
    view.unmount()
    renderPage('?question=made&reading=summary')
    await waitFor(() => expect(screen.queryByRole('button', { name: /Pickled onion.*Opens the item history/ })).toBeNull())
  })
})
