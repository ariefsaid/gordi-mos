import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { listCafeReceiptLinePhotos } from './cafe-receipt-photos'
import {
  closeCafeReceiptIssue,
  linkCafeReceiptIssue,
  listCafeReceiptIssues,
  listCafeReceiptIssueOpenPos,
  requestCafeReceiptIssuePoRefresh,
  setCafeReceiptIssueAccess,
} from './cafe-receipt-issues'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
vi.mock('./cafe-receipt-photos', () => ({ listCafeReceiptLinePhotos: vi.fn() }))

const schemaMock = vi.mocked(supabase.schema)
const photosMock = vi.mocked(listCafeReceiptLinePhotos)

function queryMock(response: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {}
  for (const method of ['select', 'in', 'eq', 'is', 'order', 'limit']) query[method] = vi.fn(() => query)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
  return query
}

beforeEach(() => {
  vi.clearAllMocks()
  photosMock.mockResolvedValue([])
})

describe('Café receipt issues adapter', () => {
  it('FR-1034 reads issue evidence, receipt context, age, and photos without inventing resolved fields', async () => {
    const issues = queryMock({ data: [{
      id: 'issue-1', receipt_id: 'receipt-1', line_id: 'line-1', item_unit_id: 'unit-1',
      kind: 'no_po', quantity: '2.5', status: 'open', reason: 'PO not raised yet', created_at: '2026-10-06T10:00:00Z',
      linked_po_number: null, linked_po_date: null, linked_po_created_at: null, closed_note: null, resolved_at: null,
    }], error: null })
    const receipts = queryMock({ data: [{
      id: 'receipt-1', branch_id: 'branch-1', activity: 'kitchen', arrival_date: '2026-10-06',
      received_by: 'person-1', received_at: '2026-10-06T09:00:00Z', delivery_note_number: null,
    }], error: null })
    const lines = queryMock({ data: [{
      id: 'line-1', item_name: 'Long-life milk', item_category: 'Dairy', unit_name: 'carton',
      received_quantity: '2.5', conditions: [], condition_reason: 'PO not raised yet',
    }], error: null })
    const portions = queryMock({ data: [], error: null })
    const branches = queryMock({ data: [{ id: 'branch-1', name: 'Northside Café' }], error: null })
    const people = queryMock({ data: [{ id: 'person-1', full_name: 'Shift receiver' }], error: null })
    schemaMock.mockReturnValue({
      from: vi.fn((table: string) => ({
        cafe_receipt_issues: issues,
        cafe_receipts: receipts,
        cafe_receipt_lines: lines,
        cafe_receipt_portions: portions,
        branches,
        people,
      }[table])),
    } as never)
    photosMock.mockResolvedValue([{ lineId: 'line-1', path: 'org/receipt/line/photo.jpg', url: 'signed-url' }])

    await expect(listCafeReceiptIssues({ now: new Date('2026-10-07T10:00:00Z') })).resolves.toMatchObject([{
      id: 'issue-1', kind: 'no_po', quantity: '2.5', status: 'open', reason: 'PO not raised yet',
      item_name: 'Long-life milk', unit_name: 'carton', branch_name: 'Northside Café',
      receiver_name: 'Shift receiver', age_days: 1, photos: [{ url: 'signed-url' }], portions: [],
    }])
    expect(photosMock).toHaveBeenCalledWith(['line-1'])
  })

  it('NFR-1001 link and close send only the issue key, selected PO number, or required note', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { status: 'linked', linked_po_number: 'PO-1' }, error: null })
      .mockResolvedValueOnce({ data: { status: 'closed' }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(linkCafeReceiptIssue('issue-1', 'PO-1')).resolves.toEqual({ status: 'linked', linked_po_number: 'PO-1' })
    await expect(closeCafeReceiptIssue('issue-1', '  Vendor follow-up  ')).resolves.toEqual({ status: 'closed' })
    expect(rpc).toHaveBeenNthCalledWith(1, 'link_cafe_receipt_issue', { p_issue_id: 'issue-1', p_po_number: 'PO-1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'close_cafe_receipt_issue', { p_issue_id: 'issue-1', p_note: 'Vendor follow-up' })
  })

  it('FR-1035 offers only same-branch cached open POs containing the exact product detail', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      options: [{ po_number: 'PO-1', supplier_name: 'Supplier', po_date: '2026-10-05', date_eligible: true, esb_created_at: '2026-10-05T08:00:00Z' }],
      cache_as_of: '2026-10-07T09:00:00Z', is_current: true, refresh_requested_at: null,
    }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(listCafeReceiptIssueOpenPos('issue-1')).resolves.toEqual({
      options: [{ po_number: 'PO-1', supplier_name: 'Supplier', po_date: '2026-10-05', date_eligible: true, esb_created_at: '2026-10-05T08:00:00Z' }],
      cache_as_of: '2026-10-07T09:00:00Z', is_current: true, refresh_requested_at: null,
    })
    expect(rpc).toHaveBeenCalledWith('cafe_receipt_issue_open_pos', { p_issue_id: 'issue-1' })
  })

  it('FR-1032 requests a worker-owned cache refresh and manages the Admin capability only through RPCs', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { requested_at: '2026-10-07T10:00:00Z' }, error: null })
      .mockResolvedValueOnce({ data: { enabled: true }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(requestCafeReceiptIssuePoRefresh('issue-1')).resolves.toEqual({ requested_at: '2026-10-07T10:00:00Z' })
    await expect(setCafeReceiptIssueAccess('person-1', true)).resolves.toBe(true)
    expect(rpc).toHaveBeenNthCalledWith(1, 'request_cafe_receipt_issue_po_refresh', { p_issue_id: 'issue-1' })
    expect(rpc).toHaveBeenNthCalledWith(2, 'set_cafe_receipt_issue_access', { p_person_id: 'person-1', p_enabled: true })
  })
})
