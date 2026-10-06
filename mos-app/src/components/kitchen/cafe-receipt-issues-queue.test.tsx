import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nProvider } from '@/i18n/I18nProvider'
import {
  canManageCafeReceiptIssues,
  closeCafeReceiptIssue,
  linkCafeReceiptIssue,
  listCafeReceiptIssues,
  listCafeReceiptIssueOpenPos,
  type CafeReceiptIssue,
} from '@/lib/db/cafe-receipt-issues'
import { CafeReceiptIssuesQueue } from './cafe-receipt-issues-queue'

vi.mock('@/shell/use-is-offline', () => ({ useIsOffline: vi.fn(() => false) }))
vi.mock('@/lib/db/cafe-receipt-issues', () => ({
  canManageCafeReceiptIssues: vi.fn(),
  closeCafeReceiptIssue: vi.fn(),
  linkCafeReceiptIssue: vi.fn(),
  listCafeReceiptIssues: vi.fn(),
  listCafeReceiptIssueOpenPos: vi.fn(),
  requestCafeReceiptIssuePoRefresh: vi.fn(),
}))

const mockCanManage = vi.mocked(canManageCafeReceiptIssues)
const mockClose = vi.mocked(closeCafeReceiptIssue)
const mockLink = vi.mocked(linkCafeReceiptIssue)
const mockList = vi.mocked(listCafeReceiptIssues)
const mockOpenPos = vi.mocked(listCafeReceiptIssueOpenPos)

const ISSUE: CafeReceiptIssue = {
  id: 'issue-1', receipt_id: 'receipt-1', line_id: 'line-1', item_unit_id: 'unit-1',
  kind: 'no_po', quantity: '2.5', status: 'open', reason: 'The purchase order is not ready',
  created_at: '2026-10-06T09:00:00Z', age_days: 1,
  branch_id: 'branch-1', branch_name: 'Northside Café', activity: 'kitchen', arrival_date: '2026-10-06',
  received_by: 'person-1', receiver_name: 'Shift receiver', received_at: '2026-10-06T09:00:00Z',
  item_name: 'Long-life milk', item_category: 'Dairy', unit_name: 'carton', received_quantity: '2.5',
  photos: [{ lineId: 'line-1', path: 'org/receipt/line/photo.jpg', url: 'https://example.test/photo.jpg' }], portions: [],
  linked_po_number: null, linked_po_date: null, linked_po_created_at: null, closed_note: null,
  resolved_by: null, resolved_by_name: null, resolved_at: null,
}

let serverIssues: CafeReceiptIssue[]

function renderQueue() {
  return render(<I18nProvider><CafeReceiptIssuesQueue /></I18nProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  serverIssues = [ISSUE]
  mockList.mockImplementation(async () => serverIssues)
  mockCanManage.mockResolvedValue(true)
  mockOpenPos.mockResolvedValue({
    options: [{ po_number: 'PO-7', supplier_name: 'Supplier', po_date: '2026-10-05', date_eligible: true, esb_created_at: '2026-10-07T08:00:00Z' }],
    cache_as_of: '2026-10-07T09:00:00Z', is_current: true, refresh_requested_at: null,
  })
  mockLink.mockImplementation(async () => {
    serverIssues = [{ ...ISSUE, status: 'linked', linked_po_number: 'PO-7', linked_po_created_at: '2026-10-07T08:00:00Z',
      portions: [{ po_number: 'PO-7', quantity: '2.5', state: 'held', hold_reason: 'issue_linked' }],
      resolved_by: 'person-2', resolved_by_name: 'Procurement', resolved_at: '2026-10-07T10:00:00Z' }]
    return { status: 'linked', linked_po_number: 'PO-7' }
  })
  mockClose.mockImplementation(async () => {
    serverIssues = [{ ...ISSUE, status: 'closed', closed_note: 'Vendor follow-up', resolved_by: 'person-2', resolved_by_name: 'Procurement', resolved_at: '2026-10-07T10:00:00Z' }]
    return { status: 'closed' }
  })
})

describe('CafeReceiptIssuesQueue', () => {
  it('FR-1034 shows issue evidence, branch, receiver, arrival, age, badge and a resolvable PO action', async () => {
    const user = userEvent.setup()
    renderQueue()

    expect(await screen.findByText('Long-life milk')).toBeInTheDocument()
    expect(screen.getByText('Northside Café')).toBeInTheDocument()
    expect(screen.getByText('The purchase order is not ready')).toBeInTheDocument()
    expect(screen.getByText('1 days old')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 open blocking issues')
    expect(screen.getByRole('link', { name: 'Open photo 1 of 1' })).toHaveAttribute('href', 'https://example.test/photo.jpg')

    await user.click(screen.getByRole('button', { name: 'Link purchase order' }))
    expect(await screen.findByRole('heading', { name: 'Choose an eligible open PO' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Link to PO-7' }))
    await waitFor(() => expect(mockLink).toHaveBeenCalledWith('issue-1', 'PO-7'))
    expect(screen.queryByText('Long-life milk')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'History (1)' }))
    expect(await screen.findByText('Linked to PO-7')).toBeInTheDocument()
    expect(screen.getByText('PO created after delivery')).toBeInTheDocument()
    expect(screen.getByText('Matched 2.5 on PO-7 · held, not posted to ESB')).toBeInTheDocument()
    expect(screen.getByText(/Resolved by Procurement/)).toBeInTheDocument()
  })

  it('FR-1036 shows a late-dated PO but refuses the link before the server action', async () => {
    const user = userEvent.setup()
    mockOpenPos.mockResolvedValue({
      options: [{ po_number: 'PO-LATE', supplier_name: 'Supplier', po_date: '2026-10-07', date_eligible: false, esb_created_at: null }],
      cache_as_of: '2026-10-07T09:00:00Z', is_current: true, refresh_requested_at: null,
    })
    renderQueue()
    await screen.findByText('Long-life milk')
    await user.click(screen.getByRole('button', { name: 'Link purchase order' }))
    const lateOption = await screen.findByRole('button', { name: 'PO must be dated on or before arrival' })
    expect(lateOption).toBeDisabled()
    expect(mockLink).not.toHaveBeenCalled()
  })

  it('FR-1037 requires a non-blank note before close and preserves it in history', async () => {
    const user = userEvent.setup()
    renderQueue()
    await screen.findByText('Long-life milk')
    await user.click(screen.getByRole('button', { name: 'Close issue' }))
    const panel = screen.getByRole('region', { name: 'Close issue with a note' })
    const confirm = within(panel).getByRole('button', { name: 'Close with note' })
    expect(confirm).toBeDisabled()
    await user.type(within(panel).getByRole('textbox', { name: 'Resolution note (required)' }), '  Vendor follow-up  ')
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    await waitFor(() => expect(mockClose).toHaveBeenCalledWith('issue-1', 'Vendor follow-up'))
    await user.click(screen.getByRole('button', { name: 'History (1)' }))
    expect(await screen.findByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('Vendor follow-up')).toBeInTheDocument()
  })

  it('FR-1040 lets a receiver read their own issue but hides every action', async () => {
    mockCanManage.mockResolvedValue(false)
    renderQueue()
    expect(await screen.findByText('Long-life milk')).toBeInTheDocument()
    expect(screen.getByText('You can view issues on receipts you received. Procurement resolves them.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Link purchase order' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close issue' })).toBeNull()
    expect(mockOpenPos).not.toHaveBeenCalled()
  })
})
