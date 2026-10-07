import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { listCafeReceiptPhotos, signCafeReceiptPhotos } from './cafe-receipt-photos'
import type { ProductionStream } from './kitchen-logs.types'
import {
  cafeReceiptArrivalDateBounds,
  listCafeReceiptDifferences,
  listCafeReceipts,
  listCafeUnsentReceipts,
  listCafeHeldReceipts,
  listCafeReceivableItems,
  listCafeOpenPoIdentities,
  normalizeCafeReceiptQuantity,
  readCafeReceiptPosting,
  releaseCafeReceipts,
  reviewCafeReceipt,
  saveCafeReceiptLineExplanation,
  sendCafeReceiptForReview,
  submitCafeReceipt,
  summarizeCafeReceiptDifferences,
} from './cafe-receipts'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
vi.mock('./cafe-receipt-photos', () => ({
  CAFE_RECEIPT_PHOTO_READ_LIMIT: 50,
  listCafeReceiptPhotos: vi.fn().mockResolvedValue(new Map()),
  signCafeReceiptPhotos: vi.fn(async (records: Array<Record<string, unknown>>) => records.map(record => ({ ...record, url: `https://private.test/${String(record.path)}` }))),
}))

const schemaMock = vi.mocked(supabase.schema)
const STREAM: ProductionStream = {
  branch: { id: 'branch-1', code: 'cafe-branch', name: 'Branch' },
  activity: 'kitchen',
}

beforeEach(() => vi.clearAllMocks())

describe('Café receipt adapter', () => {
  it('FR-1008 a received quantity is a positive decimal with comma or point; zero and blank are not lines', () => {
    expect(normalizeCafeReceiptQuantity('')).toBeNull()
    expect(normalizeCafeReceiptQuantity('0')).toBeNull()
    expect(normalizeCafeReceiptQuantity('0,000')).toBeNull()
    expect(normalizeCafeReceiptQuantity('2,5')).toBe('2.5')
    expect(normalizeCafeReceiptQuantity('-1')).toBeNull()
  })

  it('FR-1004 bounds the arrival date to today and yesterday unless the person may backdate', () => {
    expect(cafeReceiptArrivalDateBounds('2026-03-01', false)).toEqual({ min: '2026-02-28', max: '2026-03-01' })
    expect(cafeReceiptArrivalDateBounds('2026-03-01', true)).toEqual({ max: '2026-03-01' })
  })

  it('FR-1007 groups the server’s product details per item with the stream default unit first', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [
      { item_id: 'bean', item_name: 'Bean', item_category: 'Bar', item_kind: 'RAW', item_unit_id: 'bag', unit_name: 'bag', is_default_unit: false },
      { item_id: 'bean', item_name: 'Bean', item_category: 'Bar', item_kind: 'RAW', item_unit_id: 'kg', unit_name: 'kg', is_default_unit: true },
      { item_id: 'cup', item_name: 'Cup', item_category: null, item_kind: null, item_unit_id: 'pcs', unit_name: 'pcs', is_default_unit: false },
    ], error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(listCafeReceivableItems(STREAM)).resolves.toEqual([
      { id: 'bean', name: 'Bean', category: 'Bar', kind: 'RAW', defaultUnitId: 'kg', units: [{ id: 'kg', name: 'kg' }, { id: 'bag', name: 'bag' }] },
      { id: 'cup', name: 'Cup', category: null, kind: null, defaultUnitId: 'pcs', units: [{ id: 'pcs', name: 'pcs' }] },
    ])
    expect(rpc).toHaveBeenCalledWith('cafe_receivable_items', { p_branch_id: 'branch-1', p_activity: 'kitchen' })
  })

  it('AC-1045 reads open-PO identities through the floor-safe RPC and returns no quantity or price fields', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      as_of: '2026-10-06T02:10:00Z', is_current: true,
      purchase_orders: [{
        po_number: 'PO-1043', supplier_name: 'Sample supplier', po_date: '2026-10-04', esb_created_at: '2026-10-04T01:00:00Z',
        items: [{ item_unit_id: 'kg', item_name: 'Coffee bean', unit_name: 'kg', outstanding_quantity: 80, unit_price: 7.5 }],
        purchase_order_total: 900,
      }],
    }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(listCafeOpenPoIdentities('branch-1')).resolves.toEqual({
      asOf: '2026-10-06T02:10:00Z', isCurrent: true,
      purchaseOrders: [{
        poNumber: 'PO-1043', supplierName: 'Sample supplier', poDate: '2026-10-04',
        items: [{ itemUnitId: 'kg', itemName: 'Coffee bean', unitName: 'kg' }],
      }],
    })
    expect(schemaMock).toHaveBeenCalledWith('ops')
    expect(rpc).toHaveBeenCalledWith('cafe_open_po_identities', { p_branch_id: 'branch-1' })
  })

  it('NFR-1001 Count submit sends only allowed line facts (never org or status)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      receipt_id: 'r-1', outcome: 'created', row_version: 1,
      lines: [{
        id: 'line-1', item_unit_id: 'kg', item_name: 'Bean', item_category: 'Bar', unit_name: 'kg', received_quantity: '2.5',
        conditions: ['damaged_wrong'], condition_reason: null, condition_updated_at: '2026-10-06T02:00:00Z',
      }],
    }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    const line = { item_unit_id: 'kg', quantity: '2.5', damaged_wrong: true, org_id: 'other', status: 'Approved' }

    await expect(submitCafeReceipt(STREAM, '2026-10-06', 'key-1', [line])).resolves
      .toEqual({
        receipt_id: 'r-1', outcome: 'created', row_version: 1,
        lines: [{
          id: 'line-1', item_unit_id: 'kg', item_name: 'Bean', item_category: 'Bar', unit_name: 'kg', received_quantity: '2.5',
          conditions: ['damaged_wrong'], condition_reason: null, condition_updated_at: '2026-10-06T02:00:00Z',
          po_created_after_delivery: false, photos: [],
        }],
      })
    expect(rpc).toHaveBeenCalledWith('submit_cafe_receipt', {
      p_branch_id: 'branch-1', p_activity: 'kitchen', p_arrival_date: '2026-10-06', p_client_key: 'key-1',
      p_lines: [{ item_unit_id: 'kg', quantity: '2.5', damaged_wrong: true }],
    })
  })

  it('FR-1018 reads receipts with their lines, optionally only the receiver’s own, and rejects malformed rows', async () => {
    const query: Record<string, unknown> = {}
    const row = {
      id: 'r-1', activity: 'bar', status: 'Approved', posting_status: 'not_posted',
      lines: [{
        id: 'l-1', item_name: 'Milk', item_category: 'Dairy', unit_name: 'l', received_quantity: 24,
        conditions: [], condition_reason: null, po_created_after_delivery: true,
      }],
      posting: { state: 'queued', matched: true, unmatched: 0, open_issues: 0, po_created_after_delivery: true },
    }
    let response: { data: unknown; error: unknown } = { data: [row], error: null }
    for (const method of ['select', 'in', 'eq', 'order', 'limit']) query[method] = vi.fn(() => query)
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)

    const [receipt] = await listCafeReceipts(['Approved'], { receivedBy: 'me', limit: 5 })
    expect(receipt.lines[0]).toMatchObject({ received_quantity: '24', conditions: [], condition_reason: null, photos: [] })
    // FR-1038 on the receipt line and the posting trail, read from the database's computed fields.
    expect(receipt.lines[0].po_created_after_delivery).toBe(true)
    expect(receipt.posting?.poCreatedAfterDelivery).toBe(true)
    expect(String((query.select as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('po_created_after_delivery:cafe_receipt_line_po_created_after_delivery')
    expect(query.eq).toHaveBeenCalledWith('received_by', 'me')
    expect(query.limit).toHaveBeenCalledWith(5)
    expect(query.in).not.toHaveBeenCalledWith('id', expect.anything())

    await listCafeReceipts(['Approved'], { ids: ['r-1', 'r-2'] })
    expect(query.in).toHaveBeenCalledWith('id', ['r-1', 'r-2'])

    response = { data: [{ ...row, status: 'Posted' }], error: null }
    await expect(listCafeReceipts(['Approved'])).rejects.toThrow('invalid receipt row')
  })

  it('NFR-1006 reads photos by receipt, 50 receipts a request, and marks a failed read unavailable instead of failing the list', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      id: `r-${index}`, activity: 'kitchen', status: 'Counted', posting_status: 'not_posted',
      lines: [{ id: `l-${index}`, item_name: 'Milk', item_category: null, unit_name: 'l', received_quantity: 1, conditions: [], condition_reason: null }],
    }))
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'in', 'eq', 'order', 'limit']) query[method] = vi.fn(() => query)
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)
    vi.mocked(listCafeReceiptPhotos)
      .mockResolvedValueOnce(new Map([['r-0', [{ lineId: 'l-0', path: 'org/r-0/l-0/p.jpg', createdAt: 't' }]]]))
      .mockRejectedValueOnce(new Error('listCafeReceiptPhotos failed: statement timeout'))
      .mockResolvedValueOnce(new Map())

    const receipts = await listCafeReceipts(['Counted'], { limit: 120 })

    expect(vi.mocked(listCafeReceiptPhotos).mock.calls.map(([ids]) => ids.length)).toEqual([50, 50, 20])
    expect(vi.mocked(listCafeReceiptPhotos).mock.calls[1][0][0]).toBe('r-50')
    expect(receipts).toHaveLength(120)
    expect(receipts[0]).toMatchObject({ photosUnavailable: false, lines: [{ photos: [{ path: 'org/r-0/l-0/p.jpg', url: 'https://private.test/org/r-0/l-0/p.jpg' }] }] })
    expect(receipts.filter(receipt => receipt.photosUnavailable).map(receipt => receipt.id))
      .toEqual(rows.slice(50, 100).map(row => row.id))
  })

  it('FR-1018 reads and signs photos only for the asked statuses, and only those on the receipt’s own lines', async () => {
    const line = (id: string) => ({ id, item_name: 'Milk', item_category: null, unit_name: 'l', received_quantity: 1, conditions: [], condition_reason: null })
    const rows = [
      { id: 'r-sub', activity: 'kitchen', status: 'Submitted', posting_status: 'not_posted', lines: [line('l-sub')] },
      { id: 'r-cnt', activity: 'kitchen', status: 'Counted', posting_status: 'not_posted', lines: [line('l-cnt')] },
    ]
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'in', 'eq', 'order', 'limit']) query[method] = vi.fn(() => query)
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)
    vi.mocked(listCafeReceiptPhotos).mockResolvedValueOnce(new Map([['r-sub', [
      { lineId: 'l-sub', path: 'org/r-sub/l-sub/a.jpg', createdAt: 't' },
      { lineId: 'l-elsewhere', path: 'org/r-sub/l-elsewhere/b.jpg', createdAt: 't' },
    ]]]))

    const receipts = await listCafeReceipts(['Submitted', 'Counted'], { photosFor: ['Submitted'] })

    expect(vi.mocked(listCafeReceiptPhotos)).toHaveBeenCalledWith(['r-sub'])
    expect(vi.mocked(signCafeReceiptPhotos)).toHaveBeenCalledWith([{ lineId: 'l-sub', path: 'org/r-sub/l-sub/a.jpg', createdAt: 't' }])
    expect(receipts.map(receipt => receipt.lines[0].photos.length)).toEqual([1, 0])
  })

  it('FR-1044 reads Counted receipts oldest first, without photos, and says how many newer ones the limit left out', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => ({
      id: `r-${index}`, activity: 'kitchen', status: 'Counted', posting_status: 'not_posted', lines: [],
    }))
    const query: Record<string, unknown> = {}
    for (const method of ['select', 'in', 'eq', 'order', 'limit']) query[method] = vi.fn(() => query)
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, count: 53, error: null }).then(resolve)
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)

    const unsent = await listCafeUnsentReceipts()

    expect(query.in).toHaveBeenCalledWith('status', ['Counted'])
    expect(query.order).toHaveBeenCalledWith('received_at', { ascending: true })
    expect(query.limit).toHaveBeenCalledWith(50)
    expect(vi.mocked(query.select as () => unknown).mock.calls[0]).toEqual([expect.any(String), { count: 'exact' }])
    expect(listCafeReceiptPhotos).not.toHaveBeenCalled()
    expect(unsent.receipts.map(receipt => receipt.id)).toEqual(rows.map(row => row.id))
    expect(unsent.more).toBe(3)
  })

  it('AC-1011 explanation writer passes only a line id, damage flag and trimmed reason', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: {
      line_id: 'line-1', conditions: ['damaged_wrong'], condition_reason: 'Seal torn', condition_updated_at: 'now',
    }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(saveCafeReceiptLineExplanation('line-1', true, '  Seal torn  ')).resolves.toEqual({
      conditions: ['damaged_wrong'], condition_reason: 'Seal torn', condition_updated_at: 'now',
    })
    expect(rpc).toHaveBeenCalledWith('set_cafe_receipt_line_explanation', {
      p_line_id: 'line-1', p_damaged_wrong: true, p_reason: 'Seal torn',
    })
  })

  it('FR-1042 reads each receipt’s posting state with it and refuses an unknown state', async () => {
    const query: Record<string, unknown> = {}
    const row = {
      id: 'r-1', activity: 'kitchen', status: 'Approved', posting_status: 'not_posted', lines: [],
      posting: { state: 'queued', matched: true, unmatched: 2, open_issues: 1 },
    }
    let response: { data: unknown; error: unknown } = { data: [row, { ...row, id: 'r-2', status: 'Submitted', posting: null }], error: null }
    for (const method of ['select', 'in', 'eq', 'order', 'limit', 'maybeSingle']) query[method] = vi.fn(() => query)
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)

    const [approved, submitted] = await listCafeReceipts(['Approved', 'Submitted'])
    expect(approved.posting).toEqual({ state: 'queued', matched: true, unmatched: 2, openIssues: 1, poCreatedAfterDelivery: false })
    expect(submitted.posting).toBeNull()
    expect(String(vi.mocked(query.select as () => unknown).mock.calls[0])).toContain('posting:cafe_receipt_posting')

    response = { data: { posting: { state: 'posted', matched: true, unmatched: 0, open_issues: 0 } }, error: null }
    await expect(readCafeReceiptPosting('r-1')).resolves.toEqual({ state: 'posted', matched: true, unmatched: 0, openIssues: 0, poCreatedAfterDelivery: false })
    expect(query.eq).toHaveBeenLastCalledWith('id', 'r-1')

    response = { data: [{ ...row, posting: { state: 'sent', matched: true, unmatched: 0, open_issues: 0 } }], error: null }
    await expect(listCafeReceipts(['Approved'])).rejects.toThrow('invalid receipt row')
  })

  it('FR-1030 lists held receipts per branch and releases one branch, reporting what was queued', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ branch_id: 'b-1', branch_name: 'HQ', held_receipts: 3, posting_enabled: true }], error: null })
      .mockResolvedValueOnce({ data: { released_receipts: 2, queued_portions: 4, held_portions: 1, held_receipts: 1, held_location_missing: 0 }, error: null })
      .mockResolvedValueOnce({ data: { released_receipts: 0, queued_portions: 0, held_portions: 1, held_receipts: 1, held_location_missing: 1, reason: 'po_data_not_current' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'CAFE_RECEIPT_RELEASE_FORBIDDEN' } })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(listCafeHeldReceipts()).resolves.toEqual([{ branchId: 'b-1', branchName: 'HQ', heldReceipts: 3, postingEnabled: true }])
    expect(rpc).toHaveBeenLastCalledWith('cafe_held_receipts')
    await expect(releaseCafeReceipts('b-1')).resolves.toEqual({ releasedReceipts: 2, queuedPortions: 4, heldPortions: 1, heldReceipts: 1, heldLocationMissing: 0, waitingForPoData: false })
    expect(rpc).toHaveBeenLastCalledWith('release_cafe_receipts', { p_branch_id: 'b-1' })
    await expect(releaseCafeReceipts('b-1')).resolves.toEqual({ releasedReceipts: 0, queuedPortions: 0, heldPortions: 1, heldReceipts: 1, heldLocationMissing: 1, waitingForPoData: true })
    await expect(releaseCafeReceipts('b-1')).rejects.toThrow('CAFE_RECEIPT_RELEASE_FORBIDDEN')
  })

  it('FR-1016 / FR-1019 send and review pass only the receipt, version, decision and trimmed note', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { status: 'Submitted', row_version: 2 }, error: null })
      .mockResolvedValueOnce({ data: { status: 'Rejected', row_version: 3 }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'CAFE_RECEIPT_SELF_APPROVAL' } })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(sendCafeReceiptForReview('r-1', 1, '  ')).resolves.toEqual({ status: 'Submitted', row_version: 2 })
    expect(rpc).toHaveBeenLastCalledWith('send_cafe_receipt_for_review',
      { p_receipt_id: 'r-1', p_expected_version: 1, p_delivery_note_number: null })
    await expect(reviewCafeReceipt('r-1', 'reject', 2, ' wrong unit ')).resolves.toEqual({ status: 'Rejected', row_version: 3 })
    expect(rpc).toHaveBeenLastCalledWith('review_cafe_receipt',
      { p_receipt_id: 'r-1', p_decision: 'reject', p_expected_version: 2, p_note: 'wrong unit' })
    await expect(reviewCafeReceipt('r-1', 'approve', 3, '')).rejects.toThrow('CAFE_RECEIPT_SELF_APPROVAL')
  })

  it('FR-1012 reads labels for the asked receipts and refuses a row that is not a known label', async () => {
    const row = { receipt_id: 'r', line_id: 'l', item_unit_id: 'u', outcome: 'over', cache_as_of: '2026-10-06T02:00:00Z' }
    const rpc = vi.fn().mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: [{ ...row, outcome: '4.5' }], error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    await expect(listCafeReceiptDifferences(['r'])).resolves.toEqual([row])
    expect(rpc).toHaveBeenCalledWith('cafe_receipt_po_differences', { p_receipt_ids: ['r'] })
    await expect(listCafeReceiptDifferences(['r'])).rejects.toThrow('invalid difference row')
    await expect(listCafeReceiptDifferences([])).resolves.toEqual([])
    expect(rpc).toHaveBeenCalledTimes(2)
  })

  it('FR-1012 a receipt is known only when every line has a label; labels key by product detail and it counts the lines that differ', () => {
    const line = (id: string, outcome: 'over' | 'matches' | 'unknown') =>
      ({ receipt_id: 'r', line_id: id, item_unit_id: `u-${id}`, outcome, cache_as_of: null })
    expect(summarizeCafeReceiptDifferences([])).toEqual({ known: false, asOf: null })
    expect(summarizeCafeReceiptDifferences([line('a', 'over'), line('b', 'unknown')]).known).toBe(false)
    const summary = summarizeCafeReceiptDifferences([line('a', 'over'), line('b', 'matches')])
    expect(summary.known && [summary.differing, summary.total, summary.byUnit.get('u-a'), summary.byUnit.get('u-b')])
      .toEqual([1, 2, 'over', 'matches'])
  })
})
