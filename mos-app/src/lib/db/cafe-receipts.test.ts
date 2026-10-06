import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'
import {
  cafeReceiptArrivalDateBounds,
  listCafeReceivableItems,
  normalizeCafeReceiptQuantity,
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
})
