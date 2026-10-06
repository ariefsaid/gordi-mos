import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { listCafeReceipts, type CafeReceipt } from './cafe-receipts'
import {
  closeCafeReceiptIssue,
  getCafeReceiptIssueAccess,
  linkCafeReceiptIssue,
  listCafeReceiptIssueOpenPos,
  listCafeReceiptIssues,
  setCafeReceiptIssueAccess,
} from './cafe-receipt-issues'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
vi.mock('./cafe-receipts', () => ({ listCafeReceipts: vi.fn() }))

const schemaMock = vi.mocked(supabase.schema)
const receiptsMock = vi.mocked(listCafeReceipts)

const LINE = {
  id: 'line-1', item_unit_id: 'unit-1', item_name: 'Long-life milk', item_category: 'Dairy', unit_name: 'carton',
  received_quantity: '6', conditions: [], condition_reason: null, condition_updated_at: null,
  photos: [{ lineId: 'line-1', path: 'org/receipt-1/line-1/photo.jpg', url: 'https://private.test/photo.jpg' }],
}
const RECEIPT = {
  id: 'receipt-1', branch_id: 'branch-1', activity: 'kitchen', arrival_date: '2026-10-06', delivery_note_number: null,
  status: 'Approved', posting_status: 'not_posted', posting_hold_reason: null, received_by: 'person-1',
  received_at: '2026-10-06T02:00:00Z', submitted_at: null, reviewed_by: 'person-2', reviewed_at: null, review_note: null,
  row_version: 3, lines: [LINE], posting: null,
} as unknown as CafeReceipt
const ISSUE_ROW = {
  id: 'issue-1', receipt_id: 'receipt-1', line_id: 'line-1', kind: 'over', quantity: '2.0000', status: 'open',
  created_at: '2026-10-06T03:00:00Z', linked_po_number: null, po_created_after_delivery: false, closed_note: null,
  resolved_by: null, resolved_at: null,
}

function issuesQuery(response: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'order', 'limit']) query[method] = vi.fn(() => query)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  receiptsMock.mockResolvedValue([RECEIPT])
})

describe('Café receipt issues adapter', () => {
  it('FR-1034 reads each issue with its Approved receipt, line and photos from the shared receipt read', async () => {
    const query = issuesQuery({ data: [ISSUE_ROW, { ...ISSUE_ROW, id: 'issue-2', kind: 'short' }], error: null })
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)

    const issues = await listCafeReceiptIssues()

    expect(issues.map(issue => [issue.id, issue.kind, issue.quantity, issue.line.item_name, issue.receipt.arrival_date]))
      .toEqual([['issue-1', 'over', '2.0000', 'Long-life milk', '2026-10-06'], ['issue-2', 'short', '2.0000', 'Long-life milk', '2026-10-06']])
    expect(issues[0].line.photos).toHaveLength(1)
    // One receipt read for both issues, by id: no second photo or line path to drift from review.
    expect(receiptsMock).toHaveBeenCalledTimes(1)
    expect(receiptsMock).toHaveBeenCalledWith(['Approved'], { ids: ['receipt-1'], limit: 1 })
  })

  it('FR-1034 an empty list reads no receipts, and a row without its receipt is refused', async () => {
    schemaMock.mockReturnValue({ from: vi.fn(() => issuesQuery({ data: [], error: null })) } as never)
    await expect(listCafeReceiptIssues()).resolves.toEqual([])
    expect(receiptsMock).not.toHaveBeenCalled()

    schemaMock.mockReturnValue({ from: vi.fn(() => issuesQuery({ data: [{ ...ISSUE_ROW, line_id: 'other' }], error: null })) } as never)
    await expect(listCafeReceiptIssues()).rejects.toThrow('invalid issue row')
  })

  it('NFR-1001 link and close send only the issue, the chosen PO number or the trimmed note', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { status: 'open', linked_po_number: 'PO-1', matched_quantity: '1', remaining_quantity: '1', posting: 'held', po_created_after_delivery: true }, error: null })
      .mockResolvedValueOnce({ data: { status: 'closed' }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(linkCafeReceiptIssue('issue-1', 'PO-1')).resolves.toEqual({
      status: 'open', matched_quantity: '1', remaining_quantity: '1', posting: 'held', po_created_after_delivery: true,
    })
    await closeCafeReceiptIssue('issue-1', '  Supplier credit  ')
    expect(rpc).toHaveBeenNthCalledWith(1, 'link_cafe_receipt_issue', { p_issue_id: 'issue-1', p_po_number: 'PO-1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'close_cafe_receipt_issue', { p_issue_id: 'issue-1', p_note: 'Supplier credit' })
  })

  it('FR-1036 a refused link surfaces the database token for a plain explanation', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'CAFE_RECEIPT_ISSUE_PO_AFTER_ARRIVAL: the PO must be dated on or before the arrival date' } }) } as never)
    await expect(linkCafeReceiptIssue('issue-1', 'PO-2')).rejects.toThrow('CAFE_RECEIPT_ISSUE_PO_AFTER_ARRIVAL')
  })

  it('FR-1035 reads the PO picker with each PO date eligibility and the cache as-of time', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      options: [{ po_number: 'PO-1', supplier_name: null, po_date: '2026-10-06', date_eligible: false, created_after_delivery: true }],
      cache_as_of: '2026-10-07T01:00:00Z', is_current: true, refresh_requested_at: null,
    }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(listCafeReceiptIssueOpenPos('issue-1')).resolves.toEqual({
      options: [{ po_number: 'PO-1', supplier_name: null, po_date: '2026-10-06', date_eligible: false, created_after_delivery: true }],
      cache_as_of: '2026-10-07T01:00:00Z', is_current: true, refresh_requested_at: null,
    })
    expect(rpc).toHaveBeenCalledWith('cafe_receipt_issue_open_pos', { p_issue_id: 'issue-1' })
  })

  it('FR-1040 the capability is read and written only through the admin RPCs, and a write is confirmed', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { enabled: false }, error: null })
      .mockResolvedValueOnce({ data: { enabled: true }, error: null })
      .mockResolvedValueOnce({ data: { enabled: false }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(getCafeReceiptIssueAccess('person-1')).resolves.toBe(false)
    await setCafeReceiptIssueAccess('person-1', true)
    await expect(setCafeReceiptIssueAccess('person-1', true)).rejects.toThrow('not saved')
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_cafe_receipt_issue_access', { p_person_id: 'person-1', p_enabled: true })
  })
})
