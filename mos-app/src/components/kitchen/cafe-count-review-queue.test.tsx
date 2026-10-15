import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CafeCountLine } from '@/lib/db/cafe-count'

vi.mock('@/lib/db/cafe-count', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-count')>()
  return { ...actual, listCafeCountLines: vi.fn(), confirmCafeCountLine: vi.fn() }
})

import { confirmCafeCountLine, listCafeCountLines } from '@/lib/db/cafe-count'
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
    expected_status: 'ready', expected_recorded_at: '2026-10-06T04:00:00.000Z',
    status: 'Submitted', posting_status: 'not_posted', submitted_at: '2026-10-06T03:00:00.000Z',
    reviewed_at: null, row_version: 2,
    ...rest,
  }
}

function renderQueue() {
  return render(
    <I18nProvider>
      <CafeCountReviewQueue
        streamFilter={ALL_STREAMS}
        streamCatalog={[STREAM]}
        canReviewAll
        reviewableStreamKeys={new Set()}
      />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
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
    expect(fact('Stock count')).toHaveTextContent('2 kg')
    expect(fact('Expected balance')).toHaveTextContent('2 kg')
    expect(fact('Variance')).toHaveTextContent('0 kg')
    expect(screen.getByRole('heading', { name: 'Raw flour' }).closest('article')).toHaveTextContent('Pantry')
    expect(screen.getByRole('heading', { name: 'Raw flour' }).closest('article')).toHaveTextContent('Cafe Branch · Kitchen')
    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1)

    await openRow(/Dried beans/)
    expect(screen.getByText('Non-zero Variance · remains Submitted')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()

    await openRow(/Dried tomatoes/)
    expect(fact('Variance')).toHaveTextContent('-0.25 kg')
    expect(screen.getByText('Non-zero Variance · remains Submitted')).toBeInTheDocument()
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
})
