import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'
import {
  canManageCafeItemSettings,
  listCafeItemSettings,
  listCafeLogItems,
  saveCafeItemSettings,
} from './cafe-item-settings'

vi.mock('@/lib/supabase', () => ({ schema: vi.fn(), supabase: { schema: vi.fn() } }))

const schemaMock = vi.mocked(supabase.schema)
const STREAM: ProductionStream = {
  branch: { id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' },
  activity: 'kitchen',
}

function makeQuery(response: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.order = vi.fn(() => query)
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(response).then(resolve)
  return query
}

function rows() {
  return [
    {
      item_id: 'item-1', erp_name: 'ERP Flour', mos_name: 'MOS Flour', category: 'Kitchen', kind: 'RAW',
      item_unit_id: 'unit-a', unit_name: 'kg', default_item_unit_id: 'unit-b', unit_is_default: false, unit_is_shown: true,
    },
    {
      item_id: 'item-1', erp_name: 'ERP Flour', mos_name: 'MOS Flour', category: 'Kitchen', kind: 'RAW',
      item_unit_id: 'unit-b', unit_name: 'kg', default_item_unit_id: 'unit-b', unit_is_default: true, unit_is_shown: true,
    },
    {
      item_id: 'item-2', erp_name: 'ERP Salt', mos_name: 'ERP Salt', category: 'Kitchen', kind: 'RAW',
      item_unit_id: 'unit-c', unit_name: 'bag', default_item_unit_id: null, unit_is_default: false, unit_is_shown: false,
    },
    {
      item_id: 'item-3', erp_name: 'ERP Item Without Details', mos_name: 'ERP Item Without Details', category: null, kind: 'WIP',
      item_unit_id: null, unit_name: null, default_item_unit_id: null, unit_is_default: false, unit_is_shown: false,
    },
  ]
}

beforeEach(() => vi.clearAllMocks())

describe('café item settings reader', () => {
  it('groups stream rows, keeps zero-detail items and disambiguates repeated ERP unit labels', async () => {
    const query = makeQuery({ data: rows(), error: null })
    const from = vi.fn(() => query)
    schemaMock.mockReturnValue({ from } as never)

    await expect(listCafeItemSettings(STREAM)).resolves.toEqual([
      {
        id: 'item-1', erpName: 'ERP Flour', mosName: 'MOS Flour', category: 'Kitchen', kind: 'RAW', defaultUnitId: 'unit-b',
        units: [
          { id: 'unit-a', name: 'kg', isShown: true, isDefault: false, labelOrdinal: 1, labelCount: 2 },
          { id: 'unit-b', name: 'kg', isShown: true, isDefault: true, labelOrdinal: 2, labelCount: 2 },
        ],
      },
      {
        id: 'item-3', erpName: 'ERP Item Without Details', mosName: 'ERP Item Without Details', category: null, kind: 'WIP',
        defaultUnitId: null, units: [],
      },
      {
        id: 'item-2', erpName: 'ERP Salt', mosName: 'ERP Salt', category: 'Kitchen', kind: 'RAW',
        defaultUnitId: null,
        units: [{ id: 'unit-c', name: 'bag', isShown: false, isDefault: false, labelOrdinal: null, labelCount: 1 }],
      },
    ])
    expect(from).toHaveBeenCalledWith('cafe_item_settings_read')
    expect(query.eq).toHaveBeenNthCalledWith(1, 'branch_id', 'branch-1')
    expect(query.eq).toHaveBeenNthCalledWith(2, 'activity', 'kitchen')
    expect(query.select).toHaveBeenCalledWith(expect.not.stringContaining('esb_product'))
  })

  it('returns configured log items only, and includes only shown ERP details', async () => {
    const loggableRows = rows().filter(row => row.item_id !== 'item-1').concat(rows().filter(row => row.item_id === 'item-1'))
    const query = makeQuery({ data: loggableRows, error: null })
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)

    await expect(listCafeLogItems(STREAM)).resolves.toEqual([{
      id: 'item-1',
      name: 'MOS Flour',
      category: 'Kitchen',
      kind: 'RAW',
      defaultUnit: { id: 'unit-b', name: 'kg' },
      units: [
        { id: 'unit-a', name: 'kg', isDefault: false, labelOrdinal: 1, labelCount: 2 },
        { id: 'unit-b', name: 'kg', isDefault: true, labelOrdinal: 2, labelCount: 2 },
      ],
    }])
  })

  it('fails closed on unknown kinds, inconsistent rows and failed reads', async () => {
    const invalidKind = makeQuery({ data: [{ ...rows()[0], kind: 'OTHER' }], error: null })
    schemaMock.mockReturnValue({ from: vi.fn(() => invalidKind) } as never)
    await expect(listCafeItemSettings(STREAM)).rejects.toThrow('unknown item kind')

    const inconsistent = makeQuery({ data: [rows()[0], { ...rows()[1], mos_name: 'Different name' }], error: null })
    schemaMock.mockReturnValue({ from: vi.fn(() => inconsistent) } as never)
    await expect(listCafeItemSettings(STREAM)).rejects.toThrow('item details disagree')

    const failed = makeQuery({ data: null, error: { message: 'offline' } })
    schemaMock.mockReturnValue({ from: vi.fn(() => failed) } as never)
    await expect(listCafeItemSettings(STREAM)).rejects.toThrow('listCafeItemSettings failed: offline')
  })

  it('uses the server permission predicate and passes one atomic per-item save', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(canManageCafeItemSettings()).resolves.toBe(true)
    await saveCafeItemSettings({
      stream: STREAM,
      itemId: 'item-1',
      mosName: 'MOS Flour',
      defaultUnitId: 'unit-b',
      shownUnitIds: ['unit-a', 'unit-b'],
    })
    expect(rpc).toHaveBeenNthCalledWith(1, 'can_manage_cafe_item_settings')
    expect(rpc).toHaveBeenNthCalledWith(2, 'save_cafe_item_settings', {
      p_branch_id: 'branch-1',
      p_activity: 'kitchen',
      p_wip_item_id: 'item-1',
      p_mos_name: 'MOS Flour',
      p_default_item_unit_id: 'unit-b',
      p_shown_item_unit_ids: ['unit-a', 'unit-b'],
    })
  })
})
