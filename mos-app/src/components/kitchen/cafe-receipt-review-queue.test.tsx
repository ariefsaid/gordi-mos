import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
vi.mock('@/lib/db/cafe-receipts', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-receipts')>()
  return {
    ...actual, listCafeReceipts: vi.fn(), reviewCafeReceipt: vi.fn(), listCafeReceiptDifferences: vi.fn(),
    readCafeReceiptPosting: vi.fn(), listCafeHeldReceipts: vi.fn(), listCafeUnsentReceipts: vi.fn(),
  }
})

import { getPeople } from '@/lib/db/directory'
import {
  listCafeHeldReceipts, listCafeReceiptDifferences, listCafeReceipts, listCafeUnsentReceipts, readCafeReceiptPosting, reviewCafeReceipt,
  type CafeReceipt,
} from '@/lib/db/cafe-receipts'
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
      id: `${id}-l1`, item_unit_id: 'unit-kg', item_name: 'Coffee bean', item_category: 'Bar', unit_name: 'kg', received_quantity: '2.5',
      conditions: [], condition_reason: null, condition_updated_at: null, photos: [],
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
  vi.mocked(listCafeReceiptDifferences).mockResolvedValue([])
  vi.mocked(readCafeReceiptPosting).mockResolvedValue(null)
  vi.mocked(listCafeHeldReceipts).mockResolvedValue([])
  vi.mocked(listCafeUnsentReceipts).mockResolvedValue({ receipts: [], more: 0 })
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
        id: 'line-evidence', item_unit_id: 'unit-l', item_name: 'Fresh milk', item_category: 'Dairy', unit_name: 'l', received_quantity: '11',
        conditions: ['damaged_wrong'], condition_reason: 'Seal broken on arrival', condition_updated_at: null,
        photos: [{ lineId: 'line-evidence', path: 'org/receipt/line/photo.jpg', url: 'https://private.test/photo' }],
      }],
    })])
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(within(row).getByText('Seal broken on arrival')).toBeInTheDocument()
    expect(within(row).getByText('Damaged or wrong')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Open photo 1 of 1' })).toHaveAttribute('href', 'https://private.test/photo')
    expect(within(row).getAllByText('Fresh milk')).toHaveLength(1)
  })

  it('FR-1038 a receipt line linked to a PO created after delivery says so in the review row', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-late', 'receiver', {
      lines: [{
        id: 'line-late', item_unit_id: 'unit-l', item_name: 'Fresh milk', item_category: 'Dairy', unit_name: 'l', received_quantity: '11',
        conditions: [], condition_reason: null, condition_updated_at: null, po_created_after_delivery: true, photos: [],
      }],
    })])
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(within(row).getByText('PO created after delivery')).toBeInTheDocument()
  })

  it('NFR-1006 a receipt whose photos could not be read says so on that receipt, and its decision stays available', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-photos', 'receiver', {
      photosUnavailable: true,
      lines: [{
        id: 'line-evidence', item_unit_id: 'unit-l', item_name: 'Fresh milk', item_category: 'Dairy', unit_name: 'l', received_quantity: '11',
        conditions: ['damaged_wrong'], condition_reason: 'Seal broken on arrival', condition_updated_at: null, photos: [],
      }],
    })])
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(within(row).getByText('Photos unavailable')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('FR-1042 after approval the row shows the receipt’s posting state read back from the server', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-9', 'receiver')])
    vi.mocked(reviewCafeReceipt).mockResolvedValue({ status: 'Approved', row_version: 3 })
    vi.mocked(readCafeReceiptPosting).mockResolvedValue({ state: 'queued', matched: true, unmatched: 1, openIssues: 1 })
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    expect(await within(row).findByText('Approved · queued for ESB · not on an open PO: 1 · open Receipt issues: 1')).toBeInTheDocument()
    expect(readCafeReceiptPosting).toHaveBeenCalledWith('r-9')
  })

  it('FR-1042 a failed read-back after approval claims no posting state', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-10', 'receiver')])
    vi.mocked(reviewCafeReceipt).mockResolvedValue({ status: 'Approved', row_version: 3 })
    vi.mocked(readCafeReceiptPosting).mockRejectedValue(new Error('network'))
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    expect(await within(row).findByText('Approved · posting state not loaded; refresh to see it')).toBeInTheDocument()
  })

  it('FR-1030 the queue carries the release control for held receipts', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([])
    vi.mocked(listCafeHeldReceipts).mockResolvedValue([{ branchId: 'b-1', branchName: 'Gordi HQ', heldReceipts: 2, postingEnabled: true }])
    renderQueue()
    expect(await screen.findByRole('button', { name: 'Release to ESB: Gordi HQ' })).toBeInTheDocument()
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

  it('FR-1032 a reviewer sees each line’s difference with the open-PO cache’s as-of time', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-4', 'receiver')])
    vi.mocked(listCafeReceiptDifferences).mockResolvedValue([
      { receipt_id: 'r-4', line_id: 'r-4-l1', item_unit_id: 'unit-kg', outcome: 'over', cache_as_of: '2026-10-06T02:10:00Z' },
    ])
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(await within(row).findByText('Over the open PO')).toBeInTheDocument()
    expect(within(row).getByText('Open POs as of 06 Oct 09:10')).toBeInTheDocument()
    expect(vi.mocked(listCafeReceiptDifferences)).toHaveBeenCalledWith(['r-4'])
  })

  it('FR-1032 a stale or never-read cache tells the reviewer the difference is not yet known', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-5', 'receiver')])
    vi.mocked(listCafeReceiptDifferences).mockResolvedValue([
      { receipt_id: 'r-5', line_id: 'r-5-l1', item_unit_id: 'unit-kg', outcome: 'unknown', cache_as_of: null },
    ])
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(await within(row).findByText('Difference not yet known')).toBeInTheDocument()
    expect(within(row).getByText('Open POs not read from ESB yet')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('FR-1032 a stale cache gives the reason the difference is not known', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-6', 'receiver')])
    vi.mocked(listCafeReceiptDifferences).mockResolvedValue([
      { receipt_id: 'r-6', line_id: 'r-6-l1', item_unit_id: 'unit-kg', outcome: 'unknown', cache_as_of: '2026-10-05T23:05:00Z' },
    ])
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(await within(row).findByText('Open POs as of 06 Oct 06:05 · too old to compare')).toBeInTheDocument()
  })

  it('NFR-1006 a failed difference read says so, never that the open POs were not read', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-7', 'receiver')])
    vi.mocked(listCafeReceiptDifferences).mockRejectedValue(new Error('network'))
    renderQueue()
    const row = (await screen.findByText('Received by Shift member')).closest('li')!
    expect(await within(row).findByText('Difference could not be loaded; refresh to try again')).toBeInTheDocument()
    expect(within(row).queryByText('Open POs not read from ESB yet')).toBeNull()
  })

  it('FR-1012 a Counted receipt not yet sent shows as “Counted, not sent” with its age and cannot be decided', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-06T04:00:00Z') })
    try {
      vi.mocked(listCafeReceipts).mockResolvedValue([])
      vi.mocked(listCafeUnsentReceipts).mockResolvedValue({
        receipts: [receipt('r-8', 'receiver', { status: 'Counted', submitted_at: null, row_version: 1 })], more: 0,
      })
      renderQueue()
      const row = (await screen.findByText('Received by Shift member')).closest('li')!
      expect(within(row).getByText('Counted, not sent · locked 2h ago')).toBeInTheDocument()
      expect(within(row).queryByRole('button', { name: 'Approve' })).toBeNull()
      expect(within(row).queryByRole('button', { name: 'Reject' })).toBeNull()
      expect(vi.mocked(listCafeReceipts)).toHaveBeenCalledWith(['Submitted'], { photosFor: ['Submitted'] })
    } finally {
      vi.useRealTimers()
    }
  })

  it('FR-1044 with more unsent receipts than the list holds, the oldest are listed after the decidable ones and the rest are counted', async () => {
    vi.mocked(listCafeReceipts).mockResolvedValue([receipt('r-sent', 'me')])
    vi.mocked(listCafeUnsentReceipts).mockResolvedValue({
      receipts: Array.from({ length: 50 }, (_, index) => receipt(`r-unsent-${index}`, 'receiver', {
        status: 'Counted', submitted_at: null, received_at: new Date(Date.parse('2026-09-01T02:00:00Z') + index * 3_600_000).toISOString(),
      })),
      more: 7,
    })
    renderQueue()
    const rows = await screen.findAllByRole('listitem')
    const receiptRows = rows.filter(row => row.classList.contains('cafe-receipt-review__row'))
    expect(receiptRows).toHaveLength(51)
    expect(within(receiptRows[0]).getByText('Received by Reviewer')).toBeInTheDocument()
    expect(within(receiptRows[1]).getByText(/^Counted, not sent · locked/)).toBeInTheDocument()
    expect(screen.getByText('Unsent receipts are listed oldest first; 7 newer ones across all streams are not listed.')).toBeInTheDocument()
  })
})
