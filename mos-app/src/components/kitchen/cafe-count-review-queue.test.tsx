import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'
import type { CafeCountLine } from '@/lib/db/cafe-count'

vi.mock('@/lib/db/cafe-count', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-count')>()
  return { ...actual, listCafeCountReviewLines: vi.fn(), confirmCafeCountLine: vi.fn() }
})

import { confirmCafeCountLine, listCafeCountReviewLines } from '@/lib/db/cafe-count'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeCountReviewQueue } from './cafe-count-review-queue'

const mockList = vi.mocked(listCafeCountReviewLines)
const mockConfirm = vi.mocked(confirmCafeCountLine)
const STREAM = { branch: { id: 'branch-1', code: 'cafe-branch', name: 'Cafe Branch' }, activity: 'kitchen' as const }

function line(overrides: Partial<CafeCountLine> & Pick<CafeCountLine, 'id' | 'item_name'>): CafeCountLine {
  const { id, item_name, ...rest } = overrides
  return {
    id,
    branch_id: 'branch-1', activity: 'kitchen', count_date: '2026-10-06',
    wip_item_id: `item-${id}`, item_name, item_category: 'Pantry',
    item_kind: 'RAW', item_unit_id: `unit-${id}`, unit_name: 'kg',
    counted_quantity: '2.0000', submitted_by: 'submitter-1',
    recounted_quantity: null, recounted_by: null, recounted_at: null,
    reason: null, reason_entered_by: null, reason_entered_at: null,
    variance: '0.0000', expected_balance: '2.0000',
    expected_status: 'ready', expected_recorded_at: '2026-10-06T04:00:00.000Z',
    status: 'Submitted', posting_status: 'not_posted', submitted_at: '2026-10-06T03:00:00.000Z',
    reviewed_at: null, row_version: 2,
    ...rest,
  }
}

function renderQueue({ canReviewAll = true, viewerPersonId = 'independent-reviewer' }: {
  canReviewAll?: boolean
  viewerPersonId?: string | null
} = {}) {
  return render(
    <I18nProvider>
      <CafeCountReviewQueue
        streamFilter={ALL_STREAMS}
        streamCatalog={[STREAM]}
        canReviewAll={canReviewAll}
        reviewableStreamKeys={new Set(['branch-1|kitchen'])}
        viewerPersonId={viewerPersonId ?? null}
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
    expect(labels).toContain('First count')
    expect(labels).toContain('Recount')
    expect(labels).toContain('Final counted')
    expect(labels).toContain('Expected balance')
    expect(labels).toContain('Variance')
    expect(labels).toContain('Reason')
    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1)
    const rawRow = screen.getByText('Raw flour').closest('.cafe-count-review__row')! as HTMLElement
    expect(within(rawRow).getByText('Category: Pantry')).toBeInTheDocument()
    expect(within(rawRow).getByText('Stream: Cafe Branch · Kitchen')).toBeInTheDocument()
    expect(screen.getAllByText('Recount needed · remains Submitted')).toHaveLength(2)
    const negativeRow = screen.getByText('Dried tomatoes').closest('.cafe-count-review__row') as HTMLElement
    expect(negativeRow.querySelectorAll('.cafe-count-review__facts dd')[4]).toHaveTextContent('-0.25 kg')
    expect(screen.getAllByText('Expected balance is not ready yet.').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Stock/)).not.toBeInTheDocument()
  })

  it('AC-019 confirms a completed non-zero recount as held through the versioned RPC', async () => {
    mockList.mockResolvedValue([line({
      id: 'recounted', item_name: 'Slow-roasted coffee beans for the weekend service',
      counted_quantity: '5.0000', recounted_quantity: '4.5000', recounted_by: 'recounter-1',
      recounted_at: '2026-10-06T04:30:00.000Z', reason: 'Recounted the shelf stock.',
      reason_entered_by: 'recounter-1', reason_entered_at: '2026-10-06T04:31:00.000Z',
      expected_balance: '4.0000', variance: '0.5000', row_version: 4,
    })])
    mockConfirm.mockResolvedValue({
      line_id: 'recounted', status: 'Confirmed', posting_status: 'held', row_version: 5, variance: '0.5',
    })
    renderQueue()
    const row = (await screen.findByText('Slow-roasted coffee beans for the weekend service')).closest('.cafe-count-review__row') as HTMLElement
    expect(within(row).getByText('Recounted the shelf stock.')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Confirm' }))

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith('recounted', 4))
    expect(await screen.findByText('Confirmed · Not posted (held)')).toBeInTheDocument()
  })

  it('OD-2026-10-06-ERP-MIN exposes no confirm action to a stream reviewer', async () => {
    mockList.mockResolvedValue([line({ id: 'reviewer', item_name: 'Raw flour' })])
    renderQueue({ canReviewAll: false })

    const row = (await screen.findByText('Raw flour')).closest('.cafe-count-review__row') as HTMLElement
    expect(within(row).getByText('Only Ops Leads and admins can confirm.')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('OD-2026-10-06-ERP-MIN exposes no confirm action to the submitter or re-counter', async () => {
    mockList.mockResolvedValue([line({
      id: 'self', item_name: 'Raw flour', recounted_quantity: '2.0000', recounted_by: 'submitter-1',
      recounted_at: '2026-10-06T04:30:00.000Z', reason: 'Recounted.', reason_entered_by: 'submitter-1',
      reason_entered_at: '2026-10-06T04:31:00.000Z',
    })])
    renderQueue({ viewerPersonId: 'submitter-1' })

    const row = (await screen.findByText('Raw flour')).closest('.cafe-count-review__row') as HTMLElement
    expect(within(row).getByText('The submitter or re-counter cannot confirm this Count.')).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
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
