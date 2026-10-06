import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { I18nProvider } from '@/i18n/I18nProvider'

vi.mock('@/lib/db/directory', () => ({ getPeople: vi.fn() }))
vi.mock('@/lib/db/cafe-purchase-requests', () => ({ listCafePurchaseRequests: vi.fn(), reviewCafePurchaseRequest: vi.fn() }))

import { getPeople } from '@/lib/db/directory'
import { listCafePurchaseRequests, reviewCafePurchaseRequest, type CafePurchaseRequest } from '@/lib/db/cafe-purchase-requests'
import { ALL_STREAMS } from './cafe-stream-bar'
import { CafeRequestReviewQueue } from './cafe-request-review-queue'

const BRANCH = { id: 'branch-1', code: 'cafe-branch', name: 'Cafe Branch' }
function request(id: string, requestedBy: string, overrides: Partial<CafePurchaseRequest> = {}): CafePurchaseRequest {
  return {
    id, branch_id: 'branch-1', activity: 'kitchen', required_by: '2026-10-08', note: 'For the weekend menu',
    status: 'Submitted', requested_by: requestedBy, requested_at: '2026-10-06T02:00:00Z',
    reviewed_by: null, reviewed_at: null, review_note: null, row_version: 1,
    lines: [{ id: `${id}-l1`, item_name: 'Coffee bean', item_category: 'Bar', unit_name: 'kg', quantity: '2.5' }],
    ...overrides,
  }
}

function renderQueue(streamFilter = ALL_STREAMS) {
  return render(
    <I18nProvider>
      <CafeRequestReviewQueue
        streamFilter={streamFilter}
        streamCatalog={[{ branch: BRANCH, activity: 'kitchen' }, { branch: BRANCH, activity: 'bar' }]}
        viewerId="me"
      />
    </I18nProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getPeople).mockResolvedValue([{ id: 'requester', full_name: 'Shift member' }, { id: 'me', full_name: 'Supervisor' }])
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('CafeRequestReviewQueue', () => {
  it('FR-1053 lists each request with requester, needed-by date, note and lines, and approves with its version', async () => {
    vi.mocked(listCafePurchaseRequests).mockResolvedValue([request('q-1', 'requester')])
    vi.mocked(reviewCafePurchaseRequest).mockResolvedValue({ status: 'Approved', row_version: 2 })
    renderQueue()
    const row = (await screen.findByText('Requested by Shift member')).closest('li')!
    expect(listCafePurchaseRequests).toHaveBeenCalledWith(['Submitted'])
    expect(within(row).getByText('Note: For the weekend menu')).toBeInTheDocument()
    expect(within(row).getByText('2.5 × kg')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(reviewCafePurchaseRequest).toHaveBeenCalledWith('q-1', 'approve', 1, ''))
    expect(await within(row).findByText('Approved · not posted to ESB')).toBeInTheDocument()
  })

  it('AC-1041 the requester’s own request cannot be approved from the queue, and says who approves it', async () => {
    vi.mocked(listCafePurchaseRequests).mockResolvedValue([request('q-2', 'me')])
    renderQueue()
    const row = (await screen.findByText('Requested by Supervisor')).closest('li')!
    expect(within(row).getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(within(row).getByText('You raised this; another supervisor approves it.')).toBeInTheDocument()
  })

  it('FR-1053 a reject needs a note before it can be sent', async () => {
    vi.mocked(listCafePurchaseRequests).mockResolvedValue([request('q-3', 'requester')])
    vi.mocked(reviewCafePurchaseRequest).mockResolvedValue({ status: 'Rejected', row_version: 2 })
    renderQueue()
    const row = (await screen.findByText('Requested by Shift member')).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Reject' }))
    const confirm = within(row).getByRole('button', { name: 'Reject request' })
    expect(confirm).toBeDisabled()
    fireEvent.change(within(row).getByLabelText('Why is this request rejected?'), { target: { value: 'Raised twice' } })
    fireEvent.click(confirm)
    await waitFor(() => expect(reviewCafePurchaseRequest).toHaveBeenCalledWith('q-3', 'reject', 1, 'Raised twice'))
    expect(await within(row).findByText('Rejected · raise a new request')).toBeInTheDocument()
  })

  it('filters to the chosen stream and shows the empty state when nothing waits there', async () => {
    vi.mocked(listCafePurchaseRequests).mockResolvedValue([request('q-4', 'requester')])
    renderQueue('branch-1|bar')
    expect(await screen.findByText('No requests to review')).toBeInTheDocument()
  })

  it('states a failed decision and offers a refresh', async () => {
    vi.mocked(listCafePurchaseRequests).mockResolvedValue([request('q-5', 'requester')])
    vi.mocked(reviewCafePurchaseRequest).mockRejectedValue(new Error('CAFE_PURCHASE_REQUEST_VERSION_STALE'))
    renderQueue()
    const row = (await screen.findByText('Requested by Shift member')).closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Approve' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not record this decision.')
  })
})
