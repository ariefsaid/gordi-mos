import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

describe('CafeCountReviewQueue', () => {
  it('shows Count, Expected balance and Variance, while only a ready zero Variance can be confirmed', async () => {
    const { container } = renderQueue()
    expect(await screen.findByText('Raw flour')).toBeInTheDocument()
    const labels = [...container.querySelectorAll('.cafe-count-review__facts dt')].map(node => node.textContent)
    expect(labels).toContain('Count')
    expect(labels).toContain('Expected balance')
    expect(labels).toContain('Variance')
    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1)
    const rawRow = screen.getByText('Raw flour').closest('.cafe-count-review__row')! as HTMLElement
    expect(within(rawRow).getByText('Category: Pantry')).toBeInTheDocument()
    expect(within(rawRow).getByText('Stream: Cafe Branch · Kitchen')).toBeInTheDocument()
    expect(screen.getAllByText('Non-zero Variance · remains Submitted')).toHaveLength(2)
    const negativeRow = screen.getByText('Dried tomatoes').closest('.cafe-count-review__row') as HTMLElement
    expect(negativeRow.querySelectorAll('.cafe-count-review__facts dd')[2]).toHaveTextContent('-0.25 kg')
    expect(screen.getAllByText('Expected balance is not ready yet.').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Stock/)).not.toBeInTheDocument()
  })

  it('confirms through the versioned RPC and closes a zero Variance as not needed', async () => {
    mockConfirm.mockResolvedValue({
      line_id: 'zero', status: 'Confirmed', posting_status: 'not_needed', row_version: 3, variance: '0',
    })
    renderQueue()
    await screen.findByText('Raw flour')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith('zero', 2))
    expect(await screen.findByText('Confirmed · Not needed')).toBeInTheDocument()
  })
})
