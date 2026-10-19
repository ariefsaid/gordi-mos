import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CafeCountLine } from '@/lib/db/cafe-count'

vi.mock('@/lib/db/cafe-count', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-count')>()
  return { ...actual, listCafeCountLines: vi.fn(), confirmCafeCountLine: vi.fn(), confirmCafeCountLines: vi.fn(), rejectCafeCountLine: vi.fn(), listCafeCountNotCounted: vi.fn() }
})
vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn(async () => [
  { id: 'person-floor', full_name: 'Floor Counter' }, { id: 'person-recount', full_name: 'Shift Recounter' },
]) }))
vi.mock('@/lib/db/cafe-opening', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/db/cafe-opening')>(), wibToday: () => '2026-10-06' }))
const desktop = vi.hoisted(() => ({ value: true }))
vi.mock('@/shell/use-is-desktop', () => ({ useIsDesktop: () => desktop.value }))

import { confirmCafeCountLine, confirmCafeCountLines, listCafeCountLines, listCafeCountNotCounted, rejectCafeCountLine } from '@/lib/db/cafe-count'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeCountReviewQueue } from './cafe-count-review-queue'

const mockList = vi.mocked(listCafeCountLines)
const mockConfirm = vi.mocked(confirmCafeCountLine)
const STREAM = { branch: { id: 'branch-1', code: 'cafe-branch', name: 'Cafe Branch' }, activity: 'kitchen' as const }

function line(overrides: Partial<CafeCountLine> & Pick<CafeCountLine, 'id' | 'item_name'>): CafeCountLine {
  const { id, item_name, ...rest } = overrides
  return {
    id,
    branch_id: 'branch-1', activity: 'kitchen', count_date: '2026-10-06',
    wip_item_id: `item-${id}`, item_name, item_category: 'Pantry',
    item_kind: 'RAW', item_unit_id: `unit-${id}`, unit_name: 'kg',
    counted_quantity: '2.0000', variance: '0.0000', expected_balance: '2.0000',
    submitted_by: 'person-floor', recounted_quantity: null, recounted_by: null, recounted_at: null,
    reason: null, review_note: null,
    expected_status: 'ready', expected_recorded_at: '2026-10-06T04:00:00.000Z',
    status: 'Submitted', posting_status: 'not_posted', submitted_at: '2026-10-06T03:00:00.000Z',
    reviewed_at: null, row_version: 2,
    ...rest,
  }
}

function renderQueue({ streamFilter = ALL_STREAMS, viewerId = 'person-reviewer' }: { streamFilter?: string; viewerId?: string } = {}) {
  return render(
    <I18nProvider>
      <CafeCountReviewQueue
        viewerId={viewerId}
        streamFilter={streamFilter}
        streamCatalog={[STREAM]}
        canReviewAll
        reviewableStreamKeys={new Set()}
      />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  desktop.value = true
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  mockList.mockResolvedValue([
    line({ id: 'zero', item_name: 'Raw flour' }),
    line({ id: 'variance', item_name: 'Dried beans', counted_quantity: '5.0000', expected_balance: '4.0000', variance: '1.0000' }),
    line({ id: 'negative-variance', item_name: 'Dried tomatoes', counted_quantity: '1.2500', expected_balance: '1.5000', variance: '-0.2500' }),
    line({ id: 'waiting', item_name: 'Chickpeas', expected_status: 'waiting', expected_balance: null, expected_recorded_at: null, variance: null }),
  ])
})

function fact(label: string): HTMLElement {
  return screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement
}

const openRow = async (name: RegExp) => {
  fireEvent.click(await screen.findByRole('button', { name }))
}

describe('CafeCountReviewQueue', () => {
  it('shows Count, Expected balance and Variance, while only a ready zero Variance can be confirmed', async () => {
    renderQueue()
    await openRow(/Raw flour/)
    expect(fact('First count')).toHaveTextContent('2 kg')
    expect(fact('Expected balance')).toHaveTextContent('2 kg')
    expect(fact('Variance')).toHaveTextContent('0 kg')
    expect(screen.getByRole('heading', { name: 'Raw flour' }).closest('article')).toHaveTextContent('Pantry')
    expect(screen.getByRole('heading', { name: 'Raw flour' }).closest('article')).toHaveTextContent('Cafe Branch · Kitchen')
    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1)

    await openRow(/Dried beans/)
    expect(screen.getAllByText('Waiting for the floor: recount').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()

    await openRow(/Dried tomatoes/)
    expect(fact('Variance')).toHaveTextContent('-0.25 kg')
    expect(screen.getAllByText('Waiting for the floor: recount').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()

    await openRow(/Chickpeas/)
    expect(screen.getAllByText('Expected balance is not ready yet.').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /stock/i })).not.toBeInTheDocument() // no door to Stock while the balance is not ready
  })

  it('loads Submitted Counts across dates, oldest first, with each date in the shared short format', async () => {
    mockList.mockResolvedValue([
      line({ id: 'older', item_name: 'Earlier Count', count_date: '2026-10-04' }),
      line({ id: 'newer', item_name: 'Later Count', count_date: '2026-10-06' }),
    ])
    renderQueue()

    await screen.findByRole('button', { name: /Earlier Count/ })
    expect(mockList).toHaveBeenCalledWith()
    const rows = screen.getAllByRole('button', { name: /(Earlier|Later) Count/ })
    expect(rows[0]).toHaveTextContent('Earlier Count')
    expect(rows[0]).toHaveTextContent('Sun 4 Oct')
    expect(rows[1]).toHaveTextContent('Later Count')
    expect(rows[1]).toHaveTextContent('Tue 6 Oct')
    expect(rows[0]).not.toHaveTextContent('2026-10-04')
  })

  it('says there are no Submitted Counts and leaves page refresh to Review', async () => {
    mockList.mockResolvedValue([])
    renderQueue()
    expect(await screen.findByText('No Submitted stock counts.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument()
  })

  it('confirms through the versioned RPC and closes a zero Variance as not needed', async () => {
    mockConfirm.mockResolvedValue({
      line_id: 'zero', status: 'Confirmed', posting_status: 'not_needed', row_version: 3, variance: '0',
    })
    renderQueue()
    await openRow(/Raw flour/)
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith('zero', 2))
    expect(await screen.findByRole('status')).toHaveTextContent('Confirmed · Not needed')
  })

  it('shows the first count, recount, final counted and reason, says what the floor still owes, and confirms a complete line as held', async () => {
    mockList.mockResolvedValue([
      line({ id: 'explained', item_name: 'Dried beans', counted_quantity: '5.0000', recounted_quantity: '4.5000', expected_balance: '4.0000', variance: '0.5000', reason: 'Half a bag spilled' }),
      line({ id: 'unexplained', item_name: 'Chickpeas', counted_quantity: '5.0000', recounted_quantity: '4.5000', expected_balance: '4.0000', variance: '0.5000' }),
    ])
    mockConfirm.mockResolvedValue({ line_id: 'explained', status: 'Confirmed', posting_status: 'held', row_version: 5, variance: '0.5' })
    renderQueue()

    await openRow(/Chickpeas/)
    expect(fact('Reason')).toHaveTextContent('None')
    expect(screen.getAllByText('Waiting for the floor: reason').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()

    await openRow(/Dried beans/)
    expect(fact('First count')).toHaveTextContent('5 kg')
    expect(fact('Recount')).toHaveTextContent('4.5 kg')
    expect(fact('Final counted')).toHaveTextContent('4.5 kg')
    expect(fact('Variance')).toHaveTextContent('0.5 kg')
    expect(fact('Reason')).toHaveTextContent('Half a bag spilled')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith('explained', 2))
    expect(await screen.findByRole('status')).toHaveTextContent('Confirmed, not posted')
  })

  for (const width of ['phone', 'desktop'] as const) {
    it(`AC-025 at ${width} width: variance lines first with every fact, waiting lines say what is missing, one action confirms all zero-variance lines, and not-yet-counted items are listed`, async () => {
      desktop.value = width === 'desktop'
      mockList.mockResolvedValue([
        line({ id: 'zero-1', item_name: 'Raw flour' }),
        line({ id: 'zero-2', item_name: 'Rice' }),
        line({ id: 'zero-own', item_name: 'Sugar', submitted_by: 'person-reviewer' }),
        line({ id: 'explained', item_name: 'Dried beans', counted_quantity: '5.0000', recounted_quantity: '4.5000', recounted_by: 'person-recount', expected_balance: '4.0000', variance: '0.5000', reason: 'Half a bag spilled' }),
        line({ id: 'unrecounted', item_name: 'Chickpeas', counted_quantity: '5.0000', expected_balance: '4.0000', variance: '1.0000' }),
      ])
      vi.mocked(listCafeCountNotCounted).mockResolvedValue([{ id: 'salt', name: 'Sea salt', category: null, kind: 'RAW', unitId: 'u', unitName: 'kg' }])
      vi.mocked(confirmCafeCountLines).mockResolvedValue([
        { line_id: 'zero-1', outcome: 'confirmed', posting_status: 'not_needed', row_version: 3 },
        { line_id: 'zero-2', outcome: 'confirmed', posting_status: 'not_needed', row_version: 3 },
      ])
      renderQueue({ streamFilter: 'branch-1|kitchen' })

      const rows = await screen.findAllByRole('button', { name: /Raw flour|Rice|Sugar|Dried beans|Chickpeas/ })
      expect(rows.slice(0, 2).map(row => row.textContent)).toEqual([expect.stringContaining('Dried beans'), expect.stringContaining('Chickpeas')])
      expect(rows[1]).toHaveTextContent('Waiting for the floor: recount')
      expect(await screen.findByText(/Sea salt/)).toBeInTheDocument()
      expect(screen.getByText('Not yet counted today (1)')).toBeInTheDocument()
      expect(listCafeCountNotCounted).toHaveBeenCalledWith(STREAM, '2026-10-06')

      await openRow(/Dried beans/)
      for (const [label, value] of [['First count', '5 kg'], ['Recount', '4.5 kg'], ['Final counted', '4.5 kg'], ['Expected balance', 'as of'], ['Variance', '0.5 kg'], ['Reason', 'Half a bag spilled'], ['Counted by', 'Floor Counter'], ['Recounted by', 'Shift Recounter']] as const) {
        expect(fact(label)).toHaveTextContent(value)
      }

      fireEvent.click(screen.getByRole('button', { name: 'Confirm all 2 with no difference · Cafe Branch · Kitchen · Tue 6 Oct' }))
      await waitFor(() => expect(confirmCafeCountLines).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'zero-1', row_version: 2 }), expect.objectContaining({ id: 'zero-2', row_version: 2 }),
      ]))
      expect(await screen.findAllByText(/Confirmed · Not needed/)).toHaveLength(2)
    })
  }

  it('AC-023 a reviewer never confirms a line they counted, alone or among chosen lines', async () => {
    mockList.mockResolvedValue([
      line({ id: 'own', item_name: 'Sugar', submitted_by: 'person-reviewer' }),
      line({ id: 'other', item_name: 'Rice', counted_quantity: '3.0000', expected_balance: '2.0000', recounted_quantity: '2.0000', variance: '0.0000' }),
    ])
    vi.mocked(confirmCafeCountLines).mockResolvedValue([{ line_id: 'other', outcome: 'refused', reason: 'CAFE_COUNT_VERSION_STALE' }])
    renderQueue()
    await openRow(/Sugar/)
    expect(screen.getByText('You counted this line. Another reviewer confirms it.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Choose Sugar to confirm' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Choose Rice to confirm' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm selected (1)' }))
    await waitFor(() => expect(confirmCafeCountLines).toHaveBeenCalledWith([expect.objectContaining({ id: 'other', row_version: 2 })]))
    expect(await screen.findByText('1 could not be confirmed. Refresh to see the latest.')).toBeInTheDocument()
  })

  it('AC-024 a reject needs a note and leaves the line rejected for the counter to enter again', async () => {
    vi.mocked(rejectCafeCountLine).mockResolvedValue({ row_version: 3 })
    renderQueue()
    await openRow(/Dried beans/)
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const reject = screen.getByRole('button', { name: 'Reject count' })
    expect(reject).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: /What is wrong with this figure/ }), { target: { value: 'Typed 5, shelf holds 50' } })
    fireEvent.click(reject)
    await waitFor(() => expect(rejectCafeCountLine).toHaveBeenCalledWith('variance', 2, 'Typed 5, shelf holds 50'))
    expect(await screen.findAllByText('Rejected · the counter enters it again')).not.toHaveLength(0)
    expect(fact('Reject note')).toHaveTextContent('Typed 5, shelf holds 50')
  })
})
