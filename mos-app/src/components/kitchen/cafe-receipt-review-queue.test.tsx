import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
vi.mock('@/lib/db/cafe-receipts', () => ({ listCafeReceipts: vi.fn(), reviewCafeReceipt: vi.fn() }))

import { getPeople } from '@/lib/db/directory'
import { listCafeReceipts, reviewCafeReceipt, type CafeReceipt } from '@/lib/db/cafe-receipts'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeReceiptReviewQueue } from './cafe-receipt-review-queue'

const BRANCH = { id: 'branch-1', code: 'cafe-branch', name: 'Cafe Branch' }
function receipt(id: string, receivedBy: string, overrides: Partial<CafeReceipt> = {}): CafeReceipt {
  return {
    id, branch_id: 'branch-1', activity: 'kitchen', arrival_date: '2026-10-06', delivery_note_number: 'DN-7',
    status: 'Submitted', posting_status: 'not_posted', posting_hold_reason: null, received_by: receivedBy,
    received_at: '2026-10-06T02:00:00Z', submitted_at: '2026-10-06T02:05:00Z', reviewed_by: null, reviewed_at: null,
    review_note: null, row_version: 2,
    lines: [{
      id: `${id}-l1`, item_name: 'Coffee bean', item_category: 'Bar', unit_name: 'kg', received_quantity: '2.5',
      conditions: [], condition_reason: null, photos: [],
    }],
    ...overrides,
  }
}

function renderQueue() {
  return render(
    <I18nProvider>
      <CafeReceiptReviewQueue streamFilter={ALL_STREAMS} streamCatalog={[{ branch: BRANCH, activity: 'kitchen' }]} viewerId="me" />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPeople).mockResolvedValue([{ id: 'receiver', full_name: 'Shift member' }, { id: 'me', full_name: 'Reviewer' }])
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('CafeReceiptReviewQueue', () => {
  it('FR-1018 lists each receipt with receiver, arrival date, delivery note and lines, and approves with its version', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-1', 'receiver')])
    vi.mocked(reviewCafeReceipt).mockResolvedValue({ status: 'Approved', row_version: 3 })
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(within(row).getByText('Delivery note DN-7')).toBeInTheDocument()
    expect(within(row).getByText('2.5 × kg')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(reviewCafeReceipt).toHaveBeenCalledWith('r-1', 'approve', 2, ''))
    expect(await within(row).findByText('Approved · not posted to ESB')).toBeInTheDocument()
  })

  it('AC-1012 the reviewer sees each conditioned line’s reason and private photo', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-evidence', 'receiver', {
      lines: [{
        id: 'line-evidence', item_name: 'Fresh milk', item_category: 'Dairy', unit_name: 'l', received_quantity: '11',
        conditions: ['damaged_wrong'], condition_reason: 'Seal broken on arrival',
        photos: [{ lineId: 'line-evidence', path: 'org/receipt/line/photo.jpg', url: 'https://private.test/photo' }],
      }],
    })])
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(within(row).getByText('Seal broken on arrival')).toBeInTheDocument()
    expect(within(row).getByText('Damaged or wrong')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Open photo 1 of 1' })).toHaveAttribute('href', 'https://private.test/photo')
  })

  it('FR-1020 the receiver’s own receipt cannot be approved from the queue but can be rejected', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-2', 'me')])
    renderQueue()
    const row = (await screen.findByText('Received by Reviewer')).closest('li')!
    expect(within(row).getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(within(row).getByText('You received this; another reviewer approves it.')).toBeInTheDocument()
  })

  it('FR-1021 a reject needs a note before it can be sent', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-3', 'receiver')])
    vi.mocked(reviewCafeReceipt).mockResolvedValue({ status: 'Rejected', row_version: 3 })
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Reject' }))
    const confirm = within(row).getByRole('button', { name: 'Reject receipt' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(row).getByLabelText('Why is this receipt rejected?'), { target: { value: 'Counted in crates' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(reviewCafeReceipt).toHaveBeenCalledWith('r-3', 'reject', 2, 'Counted in crates'))
    expect(await within(row).findByText('Rejected · re-enter as a new receipt')).toBeInTheDocument()
  })
})
