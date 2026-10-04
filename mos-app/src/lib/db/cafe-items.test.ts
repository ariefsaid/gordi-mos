import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'
import { listCafeItemReferences } from './cafe-items'

vi.mock('@/lib/supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

const schemaMock = vi.mocked(supabase.schema)
const STREAM: ProductionStream = {
  branch: { id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' },
  activity: 'kitchen',
}

type Recorder = {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  orders: Array<[string, unknown]>
}

function freshRecorder(): Recorder {
  return { fromTables: [], selects: [], eqs: [], orders: [] }
}

function makeSchema(response: { data: unknown; error: unknown }, recorder: Recorder) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn((columns?: string) => {
    if (columns) recorder.selects.push(columns)
    return builder
  })
  builder.eq = vi.fn((column: string, value: unknown) => {
    recorder.eqs.push([column, value])
    return builder
  })
  builder.order = vi.fn((column: string, options: unknown) => {
    recorder.orders.push([column, options])
    return builder
  })
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
  return {
    from: vi.fn((table: string) => {
      recorder.fromTables.push(table)
      return builder
    }),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('listCafeItemReferences', () => {
  const rawRow = {
    item_id: 'item-1',
    name: 'Flour',
    category: 'Kitchen',
    kind: 'RAW',
    is_active: true,
    erp_category_type_name: 'Inventory',
    has_active_bom_output: false,
    erp_is_stock: true,
    item_unit_id: 'unit-1',
    unit_name: 'kg',
    is_default: true,
    confirmed_at: null,
    esb_product_id: 'product-1',
    esb_product_detail_id: 'detail-1',
  }

  it('returns typed ERP item and unit identifiers for the requested stream and kind', async () => {
    const recorder = freshRecorder()
    schemaMock.mockReturnValue(
      makeSchema({ data: [rawRow], error: null }, recorder) as never,
    )

    await expect(listCafeItemReferences(STREAM, 'RAW')).resolves.toEqual([{
      id: 'item-1',
      name: 'Flour',
      category: 'Kitchen',
      kind: 'RAW',
      unitId: 'unit-1',
      unitName: 'kg',
      isDefaultUnit: true,
      isConfirmed: false,
      erpCategoryTypeName: 'Inventory',
      hasActiveBomOutput: false,
      isStock: true,
      esbProductId: 'product-1',
      esbProductDetailId: 'detail-1',
    }])
    expect(recorder.fromTables).toEqual(['cafe_item_references'])
    expect(recorder.eqs).toEqual([
      ['branch_id', 'branch-1'],
      ['activity', 'kitchen'],
      ['kind', 'RAW'],
      ['is_active', true],
    ])
    expect(recorder.orders).toEqual([
      ['name', { ascending: true }],
      ['unit_name', { ascending: true }],
    ])
  })

  it('keeps legacy WIP units and their confirmation state readable without ERP classification evidence', async () => {
    const recorder = freshRecorder()
    schemaMock.mockReturnValue(
      makeSchema({
        data: [{
          ...rawRow,
          kind: 'WIP',
          erp_category_type_name: null,
          has_active_bom_output: null,
          erp_is_stock: null,
          confirmed_at: '2026-10-01T00:00:00Z',
        }],
        error: null,
      }, recorder) as never,
    )

    const rows = await listCafeItemReferences(STREAM, 'WIP')
    expect(rows[0].kind).toBe('WIP')
    expect(rows[0].isConfirmed).toBe(true)
    expect(rows[0].erpCategoryTypeName).toBeNull()
    expect(rows[0].isStock).toBeNull()
    expect(recorder.eqs).toContainEqual(['kind', 'WIP'])
  })

  it('fails closed on an unknown kind or missing ERP coordinates', async () => {
    const kindRecorder = freshRecorder()
    schemaMock.mockReturnValue(
      makeSchema({ data: [{ ...rawRow, kind: 'OTHER' }], error: null }, kindRecorder) as never,
    )
    await expect(listCafeItemReferences(STREAM, 'RAW')).rejects.toThrow('unknown item kind')

    const identifierRecorder = freshRecorder()
    schemaMock.mockReturnValue(
      makeSchema({
        data: [{
          ...rawRow,
          kind: 'WIP',
          erp_category_type_name: null,
          has_active_bom_output: null,
          esb_product_detail_id: null,
        }],
        error: null,
      }, identifierRecorder) as never,
    )
    await expect(listCafeItemReferences(STREAM, 'WIP')).rejects.toThrow('ERP product identifiers are missing')
  })

  it('throws on a reference-data read error and returns an empty list when the stream has no items', async () => {
    const errorRecorder = freshRecorder()
    schemaMock.mockReturnValue(
      makeSchema({ data: null, error: { message: 'permission denied' } }, errorRecorder) as never,
    )
    await expect(listCafeItemReferences(STREAM, 'RAW')).rejects.toThrow('listCafeItemReferences failed')

    const emptyRecorder = freshRecorder()
    schemaMock.mockReturnValue(
      makeSchema({ data: null, error: null }, emptyRecorder) as never,
    )
    await expect(listCafeItemReferences(STREAM, 'RAW')).resolves.toEqual([])
  })
})
