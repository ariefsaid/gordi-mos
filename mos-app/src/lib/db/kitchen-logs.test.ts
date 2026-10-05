// kitchen-logs.ts data module tests — TDD (AC-tagged)
// Mirrors the ops-log.test.ts harness pattern (makeSchema + Recorder).
// Key assertions:
//  - status NOT in payload (DB default 'Submitted') — AC-030
//  - org_id / submitted_by NOT in payload (server-stamped) — NFR-003
//  - qty_porsi must be > 0 — AC-020
//  - PlanMap keyed correctly — fetchPlanMap

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the stream-settings boundary separately: listCaptureFormItems delegates to it for a chosen stream.
vi.mock('./cafe-item-settings', async () => {
  const actual = await vi.importActual<typeof import('./cafe-item-settings')>('./cafe-item-settings')
  return { ...actual, listCafeItemSettings: vi.fn() }
})

// Mock supabase at module scope — mirrors ops-log.test.ts pattern
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import type { ProductionStream } from './kitchen-logs.types'
import { listCafeItemSettings } from './cafe-item-settings'
import { supabase } from '@/lib/supabase'
import {
  listActiveWipItems,
  listCaptureFormItems,
  fetchActualsMap,
  fetchPlanMap,
  fetchStockMap,
  fetchKitchenStock,
  listCafeDestinations,
  listStreamPairs,
  resolveKitchenBuId,
  streamCatalogFrom,
  KITCHEN_BU_CODE,
  insertKitchenLog,
  insertKitchenLogBatch,
  listSubmittedKitchenLogs,
  hasSubmittedKitchenProduction,
  approveKitchenLog,
  rejectKitchenLog,
} from './kitchen-logs'

const schemaMock = vi.mocked(supabase.schema)
const mockCafeItemSettings = vi.mocked(listCafeItemSettings)

// The (branch, activity) production stream every read and write is scoped to (OD-WAY-28),
// and the two destinations the incumbent captures. The branch ids are opaque here — the
// point of the catalog is that nothing keys off a name (OD-WAY-39).
const BRANCH_ID = '30000000-0000-0000-0000-0000000000b1'
const RADIANT_ID = '30000000-0000-0000-0000-0000000000b2'
const BUNGUR_ID = BRANCH_ID // "Transfer to Bungur" is a within-books move: destination = origin
const STREAM: ProductionStream = {
  branch: { id: BRANCH_ID, code: 'rumah_rames', name: 'Rumah Rames' },
  activity: 'kitchen',
}

// ── Schema mock harness (mirrors ops-log.test.ts) ───────────────────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  neqs: Array<[string, unknown]>
  iss: Array<[string, unknown]>
  nots: Array<[string, string, unknown]>
  ins: Array<[string, unknown[]]>
  inserts: unknown[]
  updates: unknown[]
  limits: number[]
  orders: Array<[string, unknown]>
  orFilters: string[]
  rpcCalls: Array<[string, unknown]>
}

function makeSchema(
  responses: Record<string, { data: unknown; error: unknown }[]>,
  rec: Recorder,
) {
  const counters: Record<string, number> = {}
  const fromImpl = (table: string) => {
    rec.fromTables.push(table)
    const result = () => {
      const i = counters[table] ?? 0
      counters[table] = i + 1
      const queue = responses[table] ?? []
      return queue[Math.min(i, queue.length - 1)] ?? { data: null, error: null }
    }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((s?: string) => {
      if (s) rec.selects.push(s)
      return builder
    })
    builder.insert = vi.fn((rows: unknown) => {
      rec.inserts.push(rows)
      return builder
    })
    builder.update = vi.fn((row: unknown) => {
      rec.updates.push(row)
      return builder
    })
    builder.eq = vi.fn((c: string, v: unknown) => {
      rec.eqs.push([c, v])
      return builder
    })
    builder.neq = vi.fn((c: string, v: unknown) => {
      rec.neqs.push([c, v])
      return builder
    })
    builder.is = vi.fn((c: string, v: unknown) => {
      rec.iss.push([c, v])
      return builder
    })
    builder.not = vi.fn((c: string, op: string, v: unknown) => {
      rec.nots.push([c, op, v])
      return builder
    })
    builder.in = vi.fn((c: string, values: unknown[]) => {
      rec.ins.push([c, values])
      return builder
    })
    builder.order = vi.fn((c: string, o: unknown) => {
      rec.orders.push([c, o])
      return builder
    })
    builder.or = vi.fn((filter: string) => { rec.orFilters.push(filter); return builder })
    builder.limit = vi.fn((limit: number) => { rec.limits.push(limit); return builder })
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.maybeSingle = vi.fn(() => Promise.resolve(result()))
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve)
    return builder
  }
  // rpc(name) keyed in `responses` under the rpc name; resolves like a thenable.
  const rpcImpl = (name: string, args?: unknown) => {
    rec.rpcCalls.push([name, args])
    const i = (counters[`rpc:${name}`] ?? 0)
    counters[`rpc:${name}`] = i + 1
    const queue = responses[name] ?? []
    const value = queue[Math.min(i, queue.length - 1)] ?? { data: null, error: null }
    return Promise.resolve(value)
  }
  return { from: vi.fn(fromImpl), rpc: vi.fn(rpcImpl) }
}

function freshRec(): Recorder {
  return {
    fromTables: [], selects: [], eqs: [], neqs: [], iss: [], nots: [],
    inserts: [], updates: [], limits: [], orders: [], orFilters: [], rpcCalls: [], ins: [],
  }
}

// Payload must NOT carry server-stamped fields
function assertNoServerStamps(inserts: unknown[]) {
  const payloads = inserts.flat()
  for (const p of payloads) {
    if (p && typeof p === 'object') {
      expect(Object.keys(p)).not.toContain('org_id')
      expect(Object.keys(p)).not.toContain('submitted_by')
      expect(Object.keys(p)).not.toContain('status')
    }
  }
}

beforeEach(() => vi.clearAllMocks())

// ── listActiveWipItems / listCaptureFormItems — the reader split ─────────────
// The DD-WAY-29 gate scopes absence to the CAPTURE form only (FR-011): with a
// stream, capture reads the Café settings; before selection it uses the prior gated
// catalog as a read-only choice surface. listActiveWipItems stays the UNGATED active-item
// read that feeds the stock/verification plane (FR-060, OD-WAY-45) and Plan.
describe('listActiveWipItems — the ungated stock/plan read', () => {
  const WIP_ROWS = [
    { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
    { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
  ]

  it('queries wip_items with flag_active=true ordered by name — NOT the gated view (FR-060)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ wip_items: [{ data: WIP_ROWS, error: null }] }, rec) as never,
    )

    const result = await listActiveWipItems()
    expect(rec.fromTables).toContain('wip_items')
    expect(rec.fromTables).not.toContain('capture_form_items')
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Ayam Bakar')
    expect(rec.eqs).toContainEqual(['flag_active', true])
    expect(rec.eqs).toContainEqual(['reference_source', 'manual'])
    expect(rec.eqs).toContainEqual(['kind', 'WIP'])
    expect(rec.orders).toContainEqual(['name', { ascending: true }])
    expect(rec.selects).toContain('id,name,category')
  })

  it('throws on PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ wip_items: [{ data: null, error: { message: 'table not found' } }] }, rec) as never,
    )
    await expect(listActiveWipItems()).rejects.toThrow('listActiveWipItems failed')
  })

  it('returns empty array when no active items', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ wip_items: [{ data: [], error: null }] }, rec) as never,
    )
    const result = await listActiveWipItems()
    expect(result).toEqual([])
  })
})

describe('listCaptureFormItems — stream-aware capture-form read (FR-011, DD-WAY-29, FR-032)', () => {
  // One row per confirmed (item, unit), the view's shape after #234.
  const unitRow = (
    wip_item_id: string,
    name: string,
    item_unit_id: string,
    unit_name: string,
    is_default: boolean,
    is_transferable = true,
    category: string | null = 'Main',
  ) => ({ wip_item_id, name, category, item_unit_id, unit_name, is_default, is_transferable })

  const VIEW_ROWS = [
    unitRow('w1', 'Ayam Bakar', 'u1', 'porsi', true),
    unitRow('w2', 'Nasi Goreng', 'u2', 'porsi', true),
  ]

  it('uses stream MOS names and shown ERP details while retaining listed manual items', async () => {
    mockCafeItemSettings.mockResolvedValue([
      {
        id: 'w2', erpName: 'ERP Nasi Goreng', mosName: 'MOS Nasi Goreng', category: 'Main', kind: 'WIP', isActive: true,
        defaultUnitId: 'u2-each',
        units: [
          { id: 'u2-each', name: 'each', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 },
          { id: 'u2-case', name: 'case', isShown: true, isDefault: false, labelOrdinal: null, labelCount: 1 },
        ],
        unitMultiples: [0.5, 2],
      },
      {
        id: 'raw-1', erpName: 'ERP Beans', mosName: 'ERP Beans', category: 'Main', kind: 'RAW', isActive: true,
        defaultUnitId: 'u-kg',
        units: [{ id: 'u-kg', name: 'kg', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
      },
      {
        id: 'w4', erpName: 'ERP Unconfigured', mosName: 'ERP Unconfigured', category: 'Main', kind: 'WIP', isActive: true,
        defaultUnitId: null, units: [],
      },
      {
        id: 'w5', erpName: 'ERP Off-stream', mosName: 'ERP Off-stream', category: 'Main', kind: 'WIP', isActive: true,
        defaultUnitId: 'u5',
        units: [{ id: 'u5', name: 'each', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
      },
    ])
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      capture_form_items: [{ data: [
        unitRow('w2', 'Legacy ERP name', 'legacy-u2', 'legacy unit', true),
        unitRow('w3', 'Manual Stew', 'manual-u3', 'porsi', true),
        unitRow('w4', 'Legacy unconfigured name', 'legacy-u4', 'porsi', true),
      ], error: null }],
      stream_items: [{ data: [
        { wip_item_id: 'w2' }, { wip_item_id: 'w3' }, { wip_item_id: 'w4' }, { wip_item_id: 'raw-1' },
      ], error: null }],
    }, rec) as never)

    const result = await listCaptureFormItems(STREAM)
    expect(mockCafeItemSettings).toHaveBeenCalledWith(STREAM)
    expect(result).toEqual([
      {
        id: 'w3', name: 'Manual Stew', category: 'Main',
        units: [{ id: 'manual-u3', name: 'porsi', is_default: true }],
      },
      {
        id: 'w2', name: 'MOS Nasi Goreng', category: 'Main', kind: 'WIP',
        units: [{ id: 'u2-each', name: 'each', is_default: true }],
        unit_multiples: [0.5, 2],
      },
    ])
    expect(rec.fromTables).toEqual(expect.arrayContaining(['capture_form_items', 'stream_items']))
  })

  it('offers active team-classified RAW and WIP items for transfer, but not inactive or unclassified rows', async () => {
    mockCafeItemSettings.mockResolvedValue([
      {
        id: 'raw-1', erpName: 'ERP Beans', mosName: 'Beans', category: 'Main', kind: 'RAW', isActive: true,
        defaultUnitId: 'raw-unit',
        units: [{ id: 'raw-unit', name: 'kg', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
      },
      {
        id: 'wip-1', erpName: 'ERP Stew', mosName: 'Stew', category: 'Main', kind: 'WIP', isActive: true,
        defaultUnitId: 'wip-unit',
        units: [{ id: 'wip-unit', name: 'tray', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
      },
      {
        id: 'inactive', erpName: 'ERP Disabled', mosName: 'Disabled', category: 'Main', kind: 'RAW', isActive: false,
        defaultUnitId: 'disabled-unit',
        units: [{ id: 'disabled-unit', name: 'kg', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
      },
      {
        id: 'unset', erpName: 'ERP Unclassified', mosName: 'Unclassified', category: 'Main', kind: null, isActive: true,
        defaultUnitId: 'unset-unit',
        units: [{ id: 'unset-unit', name: 'kg', isShown: true, isDefault: true, labelOrdinal: null, labelCount: 1 }],
      },
    ])
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      capture_form_items: [{ data: [], error: null }],
      stream_items: [{ data: ['raw-1', 'wip-1', 'inactive', 'unset'].map(wip_item_id => ({ wip_item_id })), error: null }],
    }, rec) as never)

    const result = await listCaptureFormItems(STREAM, 'transfer')
    expect(result.map(item => [item.id, item.kind])).toEqual([['raw-1', 'RAW'], ['wip-1', 'WIP']])
  })

  it('keeps the ERP default as the only capture coordinate and exposes configured factors separately', async () => {
    mockCafeItemSettings.mockResolvedValue([{
      id: 'w2', erpName: 'ERP Nasi Goreng', mosName: 'MOS Nasi Goreng', category: 'Main', kind: 'WIP', isActive: true,
      defaultUnitId: 'detail-a', unitMultiples: [0.5, 2],
      units: [
        { id: 'detail-a', name: 'each', isShown: true, isDefault: true, labelOrdinal: 1, labelCount: 2 },
        { id: 'detail-b', name: 'each', isShown: true, isDefault: false, labelOrdinal: 2, labelCount: 2 },
      ],
    }])
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      capture_form_items: [{ data: [], error: null }],
      stream_items: [{ data: [{ wip_item_id: 'w2' }], error: null }],
    }, rec) as never)

    const result = await listCaptureFormItems(STREAM)
    expect(result[0]?.units).toEqual([
      { id: 'detail-a', name: 'each (1/2)', is_default: true },
    ])
    expect(result[0]?.unit_multiples).toEqual([0.5, 2])
  })

  it('reads the gated capture_form_items view ordered by name — never raw wip_items', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ capture_form_items: [{ data: VIEW_ROWS, error: null }] }, rec) as never,
    )

    const result = await listCaptureFormItems()
    expect(rec.fromTables).toContain('capture_form_items')
    expect(rec.fromTables).not.toContain('wip_items')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 'w1',
      name: 'Ayam Bakar',
      category: 'Main',
      units: [{ id: 'u1', name: 'porsi', is_default: true }],
    })
    expect(rec.orders).toContainEqual(['name', { ascending: true }])
    expect(rec.selects).toContain(
      'wip_item_id,name,category,item_unit_id,unit_name,is_default,is_transferable',
    )
  })

  it('folds multiple confirmed units of one item into ONE item carrying its offered units, default first (FR-020/021)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          capture_form_items: [
            {
              data: [
                // name-ordered as the view returns them — the default is NOT first here,
                // proving the reader reorders rather than trusting row order
                unitRow('w1', 'Ayam Bakar', 'u1b', 'botol', false),
                unitRow('w1', 'Ayam Bakar', 'u1', 'porsi', true),
                unitRow('w2', 'Nasi Goreng', 'u2', 'porsi', true),
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )
    const result = await listCaptureFormItems()
    expect(result.map(r => r.id)).toEqual(['w1', 'w2'])
    expect(result[0].units).toEqual([
      { id: 'u1', name: 'porsi', is_default: true },
      { id: 'u1b', name: 'botol', is_default: false },
    ])
  })

  it('AC-015 / FR-032: a NON-TRANSFERABLE alternate is never offered — dropped by the reader, whatever the view returns', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          capture_form_items: [
            {
              data: [
                unitRow('w1', 'Ayam Bakar', 'u1', 'porsi', true),
                unitRow('w1', 'Ayam Bakar', 'u1b', 'botol', false, true),
                unitRow('w1', 'Ayam Bakar', 'u1k', 'karton', false, false), // never offered
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )
    const result = await listCaptureFormItems()
    expect(result[0].units.map(u => u.id)).toEqual(['u1', 'u1b'])
  })

  it('FR-032: a non-transferable DEFAULT still renders — the fixed unit is master data, only ALTERNATES are offers', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          capture_form_items: [
            { data: [unitRow('w1', 'Ayam Bakar', 'u1', 'porsi', true, false)], error: null },
          ],
        },
        rec,
      ) as never,
    )
    const result = await listCaptureFormItems()
    expect(result).toHaveLength(1)
    expect(result[0].units).toEqual([{ id: 'u1', name: 'porsi', is_default: true }])
  })

  it('an item whose confirmed rows yield NO offerable unit is absent — a row that cannot name its unit cannot be captured', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          capture_form_items: [
            // no default in the view (unconfirmed), only a non-transferable alternate
            { data: [unitRow('w1', 'Ayam Bakar', 'u1k', 'karton', false, false)], error: null },
          ],
        },
        rec,
      ) as never,
    )
    expect(await listCaptureFormItems()).toEqual([])
  })

  it('throws on PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ capture_form_items: [{ data: null, error: { message: 'view not found' } }] }, rec) as never,
    )
    await expect(listCaptureFormItems()).rejects.toThrow('listCaptureFormItems failed')
  })

  it('returns empty array when nothing is confirmed', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ capture_form_items: [{ data: [], error: null }] }, rec) as never,
    )
    const result = await listCaptureFormItems()
    expect(result).toEqual([])
  })
})

// ── fetchPlanMap ──────────────────────────────────────────────────────────────
describe('fetchPlanMap', () => {
  it('builds a PlanMap keyed by wip_item_id/movement', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_plans: [
            {
              data: [
                { wip_item_id: 'w1', action: 'produce', destination_branch_id: null, qty_porsi: 12 },
                { wip_item_id: 'w1', action: 'transfer', destination_branch_id: RADIANT_ID, qty_porsi: 5 },
                { wip_item_id: 'w2', action: 'produce', destination_branch_id: null, qty_porsi: 20 },
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )

    const map = await fetchPlanMap('2026-06-20', STREAM)
    expect(map['w1']['produce']).toBe(12)
    expect(map['w1'][`transfer:${RADIANT_ID}`]).toBe(5)
    expect(map['w2']['produce']).toBe(20)
    expect(map['w1'][`transfer:${BUNGUR_ID}`]).toBeUndefined()
    expect(rec.eqs).toContainEqual(['log_date', '2026-06-20'])
  })

  it('returns empty map when no plan rows', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_plans: [{ data: [], error: null }] }, rec) as never,
    )
    const map = await fetchPlanMap('2026-06-20', STREAM)
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_plans: [{ data: null, error: { message: 'failed' } }] },
        rec,
      ) as never,
    )
    await expect(fetchPlanMap('2026-06-20', STREAM)).rejects.toThrow('fetchPlanMap failed')
  })
})

// ── insertKitchenLog — payload contract (AC-020/030) ─────────────────────────
describe('insertKitchenLog — payload contract (AC-020/030)', () => {
  const BU_ID = '20000000-0000-0000-0000-000000000001'
  const WIP_ID = 'w1'

  it('AC-030: sends correct payload WITHOUT status/org_id/submitted_by', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_logs: [{ data: { id: 'log-001' }, error: null }] },
        rec,
      ) as never,
    )

    await insertKitchenLog({
      business_unit_id: BU_ID,
      log_date: '2026-06-20',
      branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
      wip_item_id: WIP_ID,
      qty_porsi: 8,
      notes: 'test note',
    })

    expect(rec.inserts).toHaveLength(1)
    const payload = rec.inserts[0] as Record<string, unknown>

    // Required fields
    expect(payload.business_unit_id).toBe(BU_ID)
    expect(payload.log_date).toBe('2026-06-20')   // DB column is `log_date`
    // The stream is on every row (OD-WAY-28) and the movement replaces the stored
    // three-literal action_type (DD-WAY-13). v4 asserted `action_type: 'Production'`; that
    // column does not exist in the squashed baseline, and the label it named is derived.
    expect(payload.branch_id).toBe(BRANCH_ID)
    expect(payload.activity).toBe('kitchen')
    expect(payload.action).toBe('produce')
    expect(payload.destination_branch_id).toBeNull()
    expect(payload).not.toHaveProperty('action_type')
    expect(payload.wip_item_id).toBe(WIP_ID)
    expect(payload.qty_porsi).toBe(8)
    expect(payload.notes).toBe('test note')
    // #234 / FR-020: no unit entered on the common path → an explicit null, which the DB
    // binds to the item's DEFAULT unit server-side.
    expect(payload.item_unit_id).toBeNull()

    // MUST NOT send server-stamped fields (NFR-003)
    assertNoServerStamps([payload])
    // should not send the old (wrong) 'date' key
    expect(payload).not.toHaveProperty('date')
  })

  it('includes typed quantity and selected factor while retaining the ERP default unit id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema(
      { kitchen_logs: [{ data: { id: 'log-multiple' }, error: null }] },
      rec,
    ) as never)
    await insertKitchenLog({
      business_unit_id: BU_ID,
      log_date: '2026-06-20',
      branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
      wip_item_id: WIP_ID,
      item_unit_id: 'u-default',
      qty_porsi: 1.5,
      entry_quantity: 3,
      entry_unit_factor: 0.5,
    })
    expect(rec.inserts[0]).toMatchObject({
      item_unit_id: 'u-default',
      qty_porsi: 1.5,
      entry_quantity: 3,
      entry_unit_factor: 0.5,
    })
  })

  it('FR-021/022 (#234): an explicit item-unit binding rides the payload — the change-unit path', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_logs: [{ data: { id: 'log-003' }, error: null }] },
        rec,
      ) as never,
    )

    await insertKitchenLog({
      business_unit_id: BU_ID,
      log_date: '2026-06-20',
      branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
      wip_item_id: WIP_ID,
      item_unit_id: 'u-botol',
      qty_porsi: 2,
    })

    const payload = rec.inserts[0] as Record<string, unknown>
    expect(payload.item_unit_id).toBe('u-botol')
  })

  it('AC-020: rejects when qty_porsi = 0', async () => {
    await expect(
      insertKitchenLog({
        business_unit_id: BU_ID,
        log_date: '2026-06-20',
        branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
        wip_item_id: WIP_ID,
        qty_porsi: 0,
      }),
    ).rejects.toThrow('qty_porsi must be > 0')
  })

  it('AC-020: rejects when qty_porsi is negative', async () => {
    await expect(
      insertKitchenLog({
        business_unit_id: BU_ID,
        log_date: '2026-06-20',
        branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
        wip_item_id: WIP_ID,
        qty_porsi: -1,
      }),
    ).rejects.toThrow('qty_porsi must be > 0')
  })

  it('sends null notes when omitted', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_logs: [{ data: { id: 'log-002' }, error: null }] },
        rec,
      ) as never,
    )

    await insertKitchenLog({
      business_unit_id: BU_ID,
      log_date: '2026-06-20',
      branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'transfer',
      destination_branch_id: RADIANT_ID,
      wip_item_id: WIP_ID,
      qty_porsi: 5,
    })

    const payload = rec.inserts[0] as Record<string, unknown>
    expect(payload.notes).toBeNull()
  })

  it('throws on PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_logs: [{ data: null, error: { message: 'RLS denied' } }] },
        rec,
      ) as never,
    )

    await expect(
      insertKitchenLog({
        business_unit_id: BU_ID,
        log_date: '2026-06-20',
        branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
        wip_item_id: WIP_ID,
        qty_porsi: 10,
      }),
    ).rejects.toThrow('insertKitchenLog failed')
  })
})

// ── insertKitchenLogBatch — AC-030 increment semantics ────────────────────────
describe('insertKitchenLogBatch — AC-030 increment semantics', () => {
  const BU_ID = '20000000-0000-0000-0000-000000000001'

  it('AC-030: inserts multiple rows, each as a new row (increment semantics)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_logs: [{ data: [{ id: 'log-1' }, { id: 'log-2' }], error: null }] },
        rec,
      ) as never,
    )

    const ids = await insertKitchenLogBatch([
      {
        business_unit_id: BU_ID,
        log_date: '2026-06-20',
        branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
        wip_item_id: 'w1',
        qty_porsi: 5,
      },
      {
        business_unit_id: BU_ID,
        log_date: '2026-06-20',
        branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
        wip_item_id: 'w1',
        qty_porsi: 3,
      },
    ])

    expect(ids).toEqual(['log-1', 'log-2'])
    const rows = rec.inserts[0] as Record<string, unknown>[]
    expect(rows).toHaveLength(2)
    // CRITICAL: each row is a new insert (increment semantics — no upsert/on-conflict)
    assertNoServerStamps(rows)
  })

  it('returns [] for empty input without calling supabase', async () => {
    const result = await insertKitchenLogBatch([])
    expect(result).toEqual([])
    expect(schemaMock).not.toHaveBeenCalled()
  })

  it('rejects if any line has qty_porsi = 0', async () => {
    await expect(
      insertKitchenLogBatch([
        {
          business_unit_id: BU_ID,
          log_date: '2026-06-20',
          branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
          wip_item_id: 'w1',
          qty_porsi: 5,
        },
        {
          business_unit_id: BU_ID,
          log_date: '2026-06-20',
          branch_id: BRANCH_ID,
      activity: 'kitchen',
      action: 'produce',
      destination_branch_id: null,
          wip_item_id: 'w2',
          qty_porsi: 0,
        },
      ]),
    ).rejects.toThrow('qty_porsi must be > 0')
  })
})

// ── resolveKitchenBuId — Retail Ops BU resolution by stable code (#3, spec §3.3, ADR-0019 D1) ──
describe('resolveKitchenBuId — resolves the kitchen business unit by stable code', () => {
  it('queries shared.business_units by code = retail_ops and returns its id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          business_units: [
            { data: { id: 'kb-bu-1', code: KITCHEN_BU_CODE }, error: null },
          ],
        },
        rec,
      ) as never,
    )

    const id = await resolveKitchenBuId()
    expect(id).toBe('kb-bu-1')
    // resolves BY CODE (not display name, not viewer.roles[0]) — spec §3.3, ADR-0019 D1 remap
    expect(rec.fromTables).toContain('business_units')
    expect(rec.eqs).toContainEqual(['code', KITCHEN_BU_CODE])
  })

  it('throws a clear "cannot log without the kitchen BU" error when the BU is absent', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ business_units: [{ data: null, error: null }] }, rec) as never,
    )
    await expect(resolveKitchenBuId()).rejects.toThrow(/kitchen.*business unit|retail_ops/i)
  })

  it('throws on a PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { business_units: [{ data: null, error: { message: 'boom' } }] },
        rec,
      ) as never,
    )
    await expect(resolveKitchenBuId()).rejects.toThrow('resolveKitchenBuId failed')
  })
})

// ── fetchStockMap — stock + availability per item (#4, FR-022/023, AC-022) ─────
// FIX 1: wired to the corrected #45 contract — ops.kitchen_stock_for_date(p_as_of)
// returning { wip_item_id, usable_qty, available_qty }, mapped to the StockMap shape
// { stok: usable_qty, tersedia: available_qty }.
describe('fetchStockMap — stok/tersedia per WIP item via kitchen_stock_for_date (FR-022/023)', () => {
  it('calls ops.kitchen_stock_for_date(p_as_of) and maps usable_qty/available_qty by item', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_stock_for_date: [
            {
              data: [
                { wip_item_id: 'w1', usable_qty: 3, available_qty: 9 },
                { wip_item_id: 'w2', usable_qty: 0, available_qty: 0 },
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )

    const map = await fetchStockMap('2026-06-20', STREAM)
    expect(map['w1']).toEqual({ stok: 3, tersedia: 9 })
    expect(map['w2']).toEqual({ stok: 0, tersedia: 0 })
    // dispatched to the corrected #45 contract: kitchen_stock_for_date(p_as_of)
    expect(rec.rpcCalls).toContainEqual([
      'kitchen_stock_for_date',
      { p_as_of: '2026-06-20', p_branch_id: BRANCH_ID, p_activity: 'kitchen' },
    ])
  })

  it('returns an empty map when no stock rows', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_stock_for_date: [{ data: [], error: null }] }, rec) as never,
    )
    const map = await fetchStockMap('2026-06-20', STREAM)
    expect(Object.keys(map)).toHaveLength(0)
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_stock_for_date: [{ data: null, error: { message: 'fn missing' } }] },
        rec,
      ) as never,
    )
    await expect(fetchStockMap('2026-06-20', STREAM)).rejects.toThrow('fetchStockMap failed')
  })
})

// ── fetchKitchenStock — the read-only Stock view's list shape (S4, FR-060/061) ─
describe('fetchKitchenStock — per-item stock rows for the Stock view (FR-060/061)', () => {
  beforeEach(() => mockCafeItemSettings.mockResolvedValue([]))

  it('joins active WIP item names with kitchen_stock_for_date rows (stok/tersedia)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          // listActiveWipItems read — deliberately UNGATED (FR-060: stock is the
          // verification plane and keeps seeing every active item)
          wip_items: [
            {
              data: [
                { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
                { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
              ],
              error: null,
            },
          ],
          // kitchen_stock_for_date rpc
          kitchen_stock_for_date: [
            {
              data: [
                { wip_item_id: 'w1', usable_qty: 12, available_qty: 8 },
                { wip_item_id: 'w2', usable_qty: -3, available_qty: -3 },
              ],
              error: null,
            },
          ],
          stream_items: [{ data: [{ wip_item_id: 'w1' }, { wip_item_id: 'w2' }], error: null }],
        },
        rec,
      ) as never,
    )

    const rows = await fetchKitchenStock('2026-06-20', STREAM)
    expect(rec.rpcCalls).toContainEqual([
      'kitchen_stock_for_date',
      { p_as_of: '2026-06-20', p_branch_id: BRANCH_ID, p_activity: 'kitchen' },
    ])
    expect(rows).toEqual([
      { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: 'Main', on_stream: true, stok: 12, tersedia: 8 },
      // negative balances preserved, not clamped (FR-061, AC-032)
      { wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', category: 'Main', on_stream: true, stok: -3, tersedia: -3 },
    ])
  })

  it('lists every item on the stream\'s list even when it has no stock row (defaults to 0/0)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          wip_items: [
            { data: [{ id: 'w1', name: 'Ayam Bakar', category: 'Main' }], error: null },
          ],
          kitchen_stock_for_date: [{ data: [], error: null }],
          stream_items: [{ data: [{ wip_item_id: 'w1' }], error: null }],
        },
        rec,
      ) as never,
    )
    const rows = await fetchKitchenStock('2026-06-20', STREAM)
    expect(rows).toEqual([
      { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: 'Main', on_stream: true, stok: 0, tersedia: 0 },
    ])
  })

  it('uses returned stock rows for ERP eligibility and joins nonempty settings without losing zero or negative stock', async () => {
    mockCafeItemSettings.mockResolvedValue([
      { id: 'manual-shared', erpName: 'ERP duplicate', mosName: 'ERP duplicate MOS name', category: 'ERP category', kind: 'WIP', isActive: true, defaultUnitId: null, units: [] },
      { id: 'raw-zero', erpName: 'Raw rice · ERP', mosName: 'Rice for prep', category: 'Dry goods', kind: 'RAW', isActive: true, defaultUnitId: null, units: [] },
      { id: 'active-wip', erpName: 'Curry · ERP', mosName: 'Curry base', category: 'Prep', kind: 'WIP', isActive: true, defaultUnitId: null, units: [] },
      { id: 'inactive-balance', erpName: 'Legacy spice · ERP', mosName: 'Legacy spice', category: 'Seasoning', kind: 'RAW', isActive: false, defaultUnitId: null, units: [] },
      { id: 'without-row', erpName: 'Unlisted · ERP', mosName: 'Unlisted item', category: 'Other', kind: 'WIP', isActive: true, defaultUnitId: null, units: [] },
    ])
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          wip_items: [{
            data: [{ id: 'manual-shared', name: 'Manual name wins', category: 'Manual category' }],
            error: null,
          }],
          kitchen_stock_for_date: [{
            data: [
              { wip_item_id: 'manual-shared', usable_qty: 0, available_qty: 0 },
              { wip_item_id: 'raw-zero', usable_qty: 0, available_qty: 0 },
              { wip_item_id: 'active-wip', usable_qty: -4, available_qty: -2 },
              { wip_item_id: 'inactive-balance', usable_qty: 6, available_qty: 6 },
            ],
            error: null,
          }],
          stream_items: [{ data: [
            { wip_item_id: 'manual-shared' },
            { wip_item_id: 'raw-zero' },
            { wip_item_id: 'active-wip' },
          ], error: null }],
        },
        rec,
      ) as never,
    )

    const rows = await fetchKitchenStock('2026-06-20', STREAM)
    expect(rows).toEqual([
      { wip_item_id: 'manual-shared', wip_item_name: 'Manual name wins', category: 'Manual category', on_stream: true, stok: 0, tersedia: 0 },
      { wip_item_id: 'raw-zero', wip_item_name: 'Rice for prep', category: 'Dry goods', on_stream: true, stok: 0, tersedia: 0 },
      { wip_item_id: 'active-wip', wip_item_name: 'Curry base', category: 'Prep', on_stream: true, stok: -4, tersedia: -2 },
      { wip_item_id: 'inactive-balance', wip_item_name: 'Legacy spice', category: 'Seasoning', on_stream: false, stok: 6, tersedia: 6 },
    ])
    expect(rows.filter(row => row.wip_item_id === 'manual-shared')).toHaveLength(1)
    expect(rows.some(row => row.wip_item_id === 'without-row')).toBe(false)
  })

  it('issue 222: an item off the stream\'s list shows, labelled, only while it holds a balance there', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          wip_items: [{
            data: [
              { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
              { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
              { id: 'w3', name: 'Es Teh', category: 'Drinks' },
              { id: 'w4', name: 'Kopi', category: 'Drinks' },
            ],
            error: null,
          }],
          kitchen_stock_for_date: [{
            data: [
              { wip_item_id: 'w1', usable_qty: 0, available_qty: 0 },
              { wip_item_id: 'w2', usable_qty: 5, available_qty: 5 },
              { wip_item_id: 'w3', usable_qty: 0, available_qty: 0 },
              { wip_item_id: 'w4', usable_qty: 0, available_qty: -2 },
            ],
            error: null,
          }],
          stream_items: [{ data: [{ wip_item_id: 'w1' }], error: null }],
        },
        rec,
      ) as never,
    )
    const rows = await fetchKitchenStock('2026-06-20', STREAM)
    expect(rows.map(r => [r.wip_item_id, r.on_stream])).toEqual([
      ['w1', true], ['w2', false], ['w4', false],
    ])
    expect(rec.eqs).toEqual(expect.arrayContaining([['branch_id', BRANCH_ID], ['activity', 'kitchen']]))
  })

  it('returns [] when there are no active items', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          wip_items: [{ data: [], error: null }],
          kitchen_stock_for_date: [{ data: [], error: null }],
        },
        rec,
      ) as never,
    )
    const rows = await fetchKitchenStock('2026-06-20', STREAM)
    expect(rows).toEqual([])
  })

  it('throws on a stock-fetch error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          wip_items: [{ data: [{ id: 'w1', name: 'Ayam Bakar', category: 'Main' }], error: null }],
          kitchen_stock_for_date: [{ data: null, error: { message: 'fn missing' } }],
        },
        rec,
      ) as never,
    )
    await expect(fetchKitchenStock('2026-06-20', STREAM)).rejects.toThrow('fetchStockMap failed')
  })
})

// ── listSubmittedKitchenLogs — review queue read (FR-040, AC-040/090) ──────────
describe('listSubmittedKitchenLogs — the ops_lead review queue (FR-040)', () => {
  const SUBMITTED_ROWS = [
    {
      id: 'log-1',
      log_date: '2026-06-20',
      action: 'produce',
      destination_branch_id: null,
      branch_id: BRANCH_ID,
      activity: 'kitchen',
      action_label: 'Production',
      wip_item_id: 'w1',
      wip_items: { name: 'Nasi Goreng' },
      qty_porsi: 8,
      notes: 'kurang bahan',
      status: 'Submitted',
      submitted_by: 'p1',
      business_unit_id: 'kb',
      created_at: '2026-06-20T09:12:00Z',
    },
    {
      id: 'log-2',
      log_date: '2026-06-20',
      action: 'transfer',
      destination_branch_id: RADIANT_ID,
      branch_id: BRANCH_ID,
      activity: 'kitchen',
      action_label: 'Transfer to Radiant',
      wip_item_id: 'w2',
      wip_items: { name: 'Cold Brew' },
      qty_porsi: 42,
      notes: null,
      status: 'Submitted',
      submitted_by: 'p2',
      business_unit_id: 'kb',
      created_at: '2026-06-20T13:02:00Z',
    },
  ]

  it('FR-040: queries kitchen_logs filtered to status=Submitted for the date, embedding the WIP name', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_logs: [{ data: SUBMITTED_ROWS, error: null }] }, rec) as never,
    )

    const rows = await listSubmittedKitchenLogs('2026-06-20')

    // ONLY Submitted logs (the GIGO queue, FR-040)
    expect(rec.eqs).toContainEqual(['status', 'Submitted'])
    expect(rec.eqs).toContainEqual(['log_date', '2026-06-20'])
    expect(rec.fromTables).toContain('kitchen_logs')
    // same-schema embed of the WIP item name (FR-040 plan-vs-logged display)
    expect(rec.selects.join(' ')).toMatch(/wip_items/)
    // carries the row's own (branch, activity) stream (#197/#198) — the queue's per-row
    // plan lookup depends on this being selected, not assumed from a single default.
    expect(rec.selects.join(' ')).toMatch(/branch_id/)
    expect(rec.selects.join(' ')).toMatch(/activity/)

    // Flattened display shape
    expect(rows).toHaveLength(2)
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'log-1',
        wip_item_name: 'Nasi Goreng',
        log_date: '2026-06-20',
        action_type: 'Production',
        action: 'produce',
        destination_branch_id: null,
        branch_id: BRANCH_ID,
        activity: 'kitchen',
        qty_porsi: 8,
        submitted_by: 'p1',
      }),
      expect.objectContaining({ id: 'log-2', wip_item_name: 'Cold Brew' }),
    ]))
  })

  it('keeps the review queue oldest-first with an ascending keyset window', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_logs: [{ data: [], error: null }] }, rec) as never,
    )
    const cursor = { created_at: '2026-06-20T09:12:00Z', id: 'log-1' }

    await listSubmittedKitchenLogs('2026-06-20', { before: cursor })

    expect(rec.orders).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(rec.orFilters).toEqual([
      `created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`,
    ])
  })

  it('returns [] when nothing is Submitted (the good-empty queue)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_logs: [{ data: [], error: null }] }, rec) as never,
    )
    const rows = await listSubmittedKitchenLogs('2026-06-20')
    expect(rows).toEqual([])
  })

  it('throws on PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_logs: [{ data: null, error: { message: 'RLS denied' } }] }, rec) as never,
    )
    await expect(listSubmittedKitchenLogs('2026-06-20')).rejects.toThrow('listSubmittedKitchenLogs failed')
  })

  it('tolerates a missing embedded wip_items (renders a dash placeholder name)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_logs: [
            {
              data: [{ ...SUBMITTED_ROWS[0], wip_items: null }],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )
    const rows = await listSubmittedKitchenLogs('2026-06-20')
    expect(rows[0].wip_item_name).toBe('—')
  })
})

// ── approveKitchenLog — the atomic approve RPC (FR-050, AC-090) ────────────────
describe('approveKitchenLog — calls the approve RPC, returns the minted batch_id (FR-050)', () => {
  it('AC-090: dispatches approve_kitchen_log with the log id + review note, returns batch_id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { approve_kitchen_log: [{ data: 'PR-20260620-003', error: null }] },
        rec,
      ) as never,
    )

    const result = await approveKitchenLog('log-1', 'looks good')

    expect(rec.rpcCalls).toContainEqual([
      'approve_kitchen_log',
      { p_log_id: 'log-1', p_review_note: 'looks good' },
    ])
    expect(result).toEqual({ batch_id: 'PR-20260620-003' })
  })

  it('sends a null review note when omitted (approve note optional unless variance)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { approve_kitchen_log: [{ data: 'PR-20260620-004', error: null }] },
        rec,
      ) as never,
    )

    await approveKitchenLog('log-9')
    expect(rec.rpcCalls).toContainEqual([
      'approve_kitchen_log',
      { p_log_id: 'log-9', p_review_note: null },
    ])
  })

  it('surfaces P0003 (already actioned by someone else) as a typed code so the UI can refresh', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          approve_kitchen_log: [
            { data: null, error: { code: 'P0003', message: 'log not Submitted' } },
          ],
        },
        rec,
      ) as never,
    )

    await expect(approveKitchenLog('log-1')).rejects.toMatchObject({ code: 'P0003' })
  })

  it('surfaces 42501 (not ops_lead / wrong org) as a typed code', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          approve_kitchen_log: [
            { data: null, error: { code: '42501', message: 'permission denied' } },
          ],
        },
        rec,
      ) as never,
    )
    await expect(approveKitchenLog('log-1')).rejects.toMatchObject({ code: '42501' })
  })
})

// ── rejectKitchenLog — guarded Submitted→Rejected UPDATE (FR-041, AC-041) ──────
describe('rejectKitchenLog — guarded UPDATE to Rejected with a required note (FR-041)', () => {
  it('AC-041: updates status=Rejected + review_note on the row id, scoped to Submitted', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_logs: [{ data: { id: 'log-1' }, error: null }] }, rec) as never,
    )

    await rejectKitchenLog('log-1', 'wrong item')

    expect(rec.updates).toHaveLength(1)
    const payload = rec.updates[0] as Record<string, unknown>
    expect(payload.status).toBe('Rejected')
    expect(payload.review_note).toBe('wrong item')
    // NEVER stamps reviewed_by/reviewed_at client-side (server/provenance, NFR-003)
    expect(payload).not.toHaveProperty('reviewed_by')
    expect(payload).not.toHaveProperty('org_id')
    // targets the row id
    expect(rec.eqs).toContainEqual(['id', 'log-1'])
    // idempotency guard: only a still-Submitted log can be rejected — the UPDATE
    // carries .eq('status','Submitted') so a re-reject (already actioned) is a no-op
    // instead of clobbering an Approved/Rejected row (FR-041, mirrors approve's P0003)
    expect(rec.eqs).toContainEqual(['status', 'Submitted'])
  })

  it('AC-041: requires a non-blank review note (the reject note gate)', async () => {
    await expect(rejectKitchenLog('log-1', '   ')).rejects.toThrow(/note/i)
    await expect(rejectKitchenLog('log-1', '')).rejects.toThrow(/note/i)
  })

  it('throws on PostgREST error (e.g. RLS denial / already actioned)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_logs: [{ data: null, error: { message: 'RLS denied' } }] },
        rec,
      ) as never,
    )
    await expect(rejectKitchenLog('log-1', 'note')).rejects.toThrow('rejectKitchenLog failed')
  })
})

// ── #233 stream context: enumerable stream catalog, already-logged ──────────────────
// (The person's own default-stream resolver lives in default-stream.ts — the ONE
// shape-validated reader after the #234 consolidation — and is tested there.)

describe('listStreamPairs + streamCatalogFrom — the enumerable stream catalog (FR-005)', () => {
  it('reads the LIVE stream Teams’ pairs from shared.teams (branch set, not archived)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          teams: [
            {
              data: [
                { branch_id: BRANCH_ID, activity: 'kitchen', produces: true },
                { branch_id: BRANCH_ID, activity: 'bar', produces: true },
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )
    const pairs = await listStreamPairs()
    expect(pairs).toHaveLength(2)
    expect(rec.fromTables).toContain('teams')
    // The catalog predicate: the pair is set and the team is live.
    expect(rec.nots).toContainEqual(['branch_id', 'is', null])
    expect(rec.iss).toContainEqual(['archived_at', null])
  })

  it('streamCatalogFrom resolves pairs against the branch catalog in catalog × activity order, dropping unknown branches', () => {
    const RADIANT = { id: RADIANT_ID, code: 'radiant', name: 'Radiant' }
    const pairs = [
      { branch_id: RADIANT_ID, activity: 'bar' as const, produces: true },
      { branch_id: BRANCH_ID, activity: 'kitchen' as const, produces: true },
      { branch_id: 'gone-branch', activity: 'bar' as const, produces: false }, // archived branch → dropped
    ]
    const catalog = streamCatalogFrom(pairs, [RADIANT, STREAM.branch])
    expect(catalog).toEqual([
      { branch: RADIANT, activity: 'bar', produces: true },
      { branch: STREAM.branch, activity: 'kitchen', produces: true },
    ])
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ teams: [{ data: null, error: { message: 'boom' } }] }, rec) as never,
    )
    await expect(listStreamPairs()).rejects.toThrow('listStreamPairs failed')
  })

  it('reads org-scoped cross-branch destination rows', async () => {
    const rec = freshRec()
    const rows = [{
      origin_branch_id: BRANCH_ID,
      origin_activity: 'kitchen',
      destination_branch_id: RADIANT_ID,
    }]
    schemaMock.mockReturnValue(
      makeSchema({ cafe_destinations: [{ data: rows, error: null }] }, rec) as never,
    )

    await expect(listCafeDestinations()).resolves.toEqual(rows)
    expect(rec.fromTables).toContain('cafe_destinations')
    expect(rec.selects).toContain('origin_branch_id,origin_activity,destination_branch_id')
  })

  it('throws when the destination catalog cannot be read', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ cafe_destinations: [{ data: null, error: { message: 'denied' } }] }, rec) as never,
    )

    await expect(listCafeDestinations()).rejects.toThrow('listCafeDestinations failed')
  })
})

describe('fetchActualsMap — the already-logged actuals, stream-scoped (FR-014, AC-006)', () => {
  it('preserves recorded unit identities, aggregating only the same known unit and keeping each unknown row separate', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_logs: [
            {
              data: [
                { id: 'log-1', wip_item_id: 'w1', action: 'produce', destination_branch_id: null, item_unit_id: 'u-batch-1', qty_porsi: 2 },
                { id: 'log-2', wip_item_id: 'w1', action: 'produce', destination_branch_id: null, item_unit_id: 'u-batch-1', qty_porsi: 1 },
                { id: 'log-3', wip_item_id: 'w1', action: 'produce', destination_branch_id: null, item_unit_id: 'u-batch-2', qty_porsi: 500 },
                { id: 'log-4', wip_item_id: 'w1', action: 'produce', destination_branch_id: null, item_unit_id: null, qty_porsi: 7 },
                { id: 'log-5', wip_item_id: 'w1', action: 'produce', destination_branch_id: null, item_unit_id: null, qty_porsi: 9 },
                { id: 'log-6', wip_item_id: 'w1', action: 'transfer', destination_branch_id: RADIANT_ID, item_unit_id: 'u-batch-1', qty_porsi: 4 },
              ],
              error: null,
            },
          ],
          item_units: [{
            data: [
              { id: 'u-batch-1', unit_name: 'batch' },
              { id: 'u-batch-2', unit_name: 'batch' },
            ],
            error: null,
          }],
        },
        rec,
      ) as never,
    )
    const map = await fetchActualsMap('2026-08-08', STREAM)
    expect(map['w1']['produce']).toEqual([
      { key: 'unit:u-batch-1', item_unit_id: 'u-batch-1', unit_name: 'batch', qty_porsi: 3 },
      { key: 'unit:u-batch-2', item_unit_id: 'u-batch-2', unit_name: 'batch', qty_porsi: 500 },
      { key: 'unknown:log-4', item_unit_id: null, unit_name: null, qty_porsi: 7 },
      { key: 'unknown:log-5', item_unit_id: null, unit_name: null, qty_porsi: 9 },
    ])
    expect(map['w1'][`transfer:${RADIANT_ID}`]).toEqual([
      { key: 'unit:u-batch-1', item_unit_id: 'u-batch-1', unit_name: 'batch', qty_porsi: 4 },
    ])
    expect(rec.selects).toContain('id,wip_item_id,action,destination_branch_id,item_unit_id,qty_porsi,entry_quantity,entry_unit_factor,entry_unit_name')
    expect(rec.selects).toContain('id,unit_name')
    expect(rec.ins).toContainEqual(['id', ['u-batch-1', 'u-batch-2']])
    expect(rec.fromTables).toContain('item_units')
    // Scoped to the SELECTED stream and date; Rejected rows excluded.
    expect(rec.eqs).toContainEqual(['log_date', '2026-08-08'])
    expect(rec.eqs).toContainEqual(['branch_id', STREAM.branch.id])
    expect(rec.eqs).toContainEqual(['activity', STREAM.activity])
    expect(rec.neqs).toContainEqual(['status', 'Rejected'])
    // A restarted waste draft is replaced, not added: only the live row counts.
    expect(rec.iss).toContainEqual(['superseded_by', null])
  })

  it('keeps each newly captured multiple as its own history entry even on the same default unit', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      kitchen_logs: [{ data: [
        { id: 'log-half-1', wip_item_id: 'w1', action: 'produce', destination_branch_id: null, item_unit_id: 'u-each', qty_porsi: 1, entry_quantity: 2, entry_unit_factor: 0.5, entry_unit_name: 'each' },
        { id: 'log-half-2', wip_item_id: 'w1', action: 'produce', destination_branch_id: null, item_unit_id: 'u-each', qty_porsi: 1.5, entry_quantity: 3, entry_unit_factor: 0.5, entry_unit_name: 'each' },
      ], error: null }],
      item_units: [{ data: [{ id: 'u-each', unit_name: 'each' }], error: null }],
    }, rec) as never)

    await expect(fetchActualsMap('2026-08-08', STREAM)).resolves.toEqual({
      w1: { produce: [
        { key: 'log:log-half-1', item_unit_id: 'u-each', unit_name: 'each', qty_porsi: 1, entry_quantity: 2, entry_unit_factor: 0.5, entry_unit_name: 'each' },
        { key: 'log:log-half-2', item_unit_id: 'u-each', unit_name: 'each', qty_porsi: 1.5, entry_quantity: 3, entry_unit_factor: 0.5, entry_unit_name: 'each' },
      ] },
    })
  })

  it('returns an empty map when nothing is logged yet', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_logs: [{ data: [], error: null }] }, rec) as never,
    )
    expect(Object.keys(await fetchActualsMap('2026-08-08', STREAM))).toHaveLength(0)
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        { kitchen_logs: [{ data: null, error: { message: 'boom' } }] },
        rec,
      ) as never,
    )
    await expect(fetchActualsMap('2026-08-08', STREAM)).rejects.toThrow('fetchActualsMap failed')
  })

  it('keeps a known unit ID distinct when its archived or inactive display metadata cannot be resolved', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({
        kitchen_logs: [{
          data: [{ id: 'log-unknown-unit', wip_item_id: 'w2', action: 'produce', destination_branch_id: null, item_unit_id: 'u-archived', qty_porsi: 3 }],
          error: null,
        }],
        item_units: [{ data: [], error: null }],
      }, rec) as never,
    )

    await expect(fetchActualsMap('2026-08-08', STREAM)).resolves.toEqual({
      w2: {
        produce: [{ key: 'unit:u-archived', item_unit_id: 'u-archived', unit_name: null, qty_porsi: 3 }],
      },
    })
  })
})


describe('hasSubmittedKitchenProduction — the gate outside the review page', () => {
  it.each([[[], false], [[{ id: 'unloaded-production' }], true]] as const)('checks the stream/day with a bounded existence read', async (data, expected) => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ kitchen_logs: [{ data, error: null }] }, rec) as never)
    expect(await hasSubmittedKitchenProduction('2026-10-05', BRANCH_ID, 'bar')).toBe(expected)
    expect(rec.selects).toEqual(['id'])
    expect(rec.eqs).toEqual([['log_date', '2026-10-05'], ['branch_id', BRANCH_ID], ['activity', 'bar'], ['status', 'Submitted'], ['action', 'produce']])
    expect(rec.limits).toEqual([1])
  })
  it('fails the read when the gate cannot be checked', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ kitchen_logs: [{ data: null, error: { message: 'offline' } }] }, rec) as never)
    await expect(hasSubmittedKitchenProduction('2026-10-05', BRANCH_ID, 'bar')).rejects.toThrow('hasSubmittedKitchenProduction failed')
  })
})
