import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'
import {
  cafeReceiptArrivalDateBounds,
  listCafeReceipts,
  listCafeReceivableItems,
  normalizeCafeReceiptQuantity,
  reviewCafeReceipt,
  sendCafeReceiptForReview,
  submitCafeReceipt,
} from './cafe-receipts'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))

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

  it('NFR-1001 Count submit sends only the stream, date, key and (product detail, quantity) pairs', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { receipt_id: 'r-1', outcome: 'created', row_version: 1 }, error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    const line = { item_unit_id: 'kg', quantity: '2.5', org_id: 'other', status: 'Approved' }

    await expect(submitCafeReceipt(STREAM, '2026-10-06', 'key-1', [line])).resolves
      .toEqual({ receipt_id: 'r-1', outcome: 'created', row_version: 1 })
    expect(rpc).toHaveBeenCalledWith('submit_cafe_receipt', {
      p_branch_id: 'branch-1', p_activity: 'kitchen', p_arrival_date: '2026-10-06', p_client_key: 'key-1',
      p_lines: [{ item_unit_id: 'kg', quantity: '2.5' }],
    })
  })

  it('FR-1018 reads receipts with their lines, optionally only the receiver’s own, and rejects malformed rows', async () => {
    const query: Record<string, unknown> = {}
    const row = {
      id: 'r-1', activity: 'bar', status: 'Approved', posting_status: 'not_posted',
      lines: [{ id: 'l-1', item_name: 'Milk', unit_name: 'l', received_quantity: 24 }],
    }
    let response: { data: unknown; error: unknown } = { data: [row], error: null }
    for (const method of ['select', 'in', 'eq', 'order', 'limit']) query[method] = vi.fn(() => query)
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)

    const [receipt] = await listCafeReceipts(['Approved'], { receivedBy: 'me', limit: 5 })
    expect(receipt.lines[0].received_quantity).toBe('24')
    expect(query.eq).toHaveBeenCalledWith('received_by', 'me')
    expect(query.limit).toHaveBeenCalledWith(5)

    response = { data: [{ ...row, status: 'Posted' }], error: null }
    await expect(listCafeReceipts(['Approved'])).rejects.toThrow('invalid receipt row')
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
})
