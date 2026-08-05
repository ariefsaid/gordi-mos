// kitchen-logs.ts data module tests — TDD (AC-tagged)
// Mirrors the ops-log.test.ts harness pattern (makeSchema + Recorder).
// Key assertions:
//  - status NOT in payload (DB default 'Submitted') — AC-030
//  - org_id / submitted_by NOT in payload (server-stamped) — NFR-003
//  - qty_porsi must be > 0 — AC-020
//  - PlanMap keyed correctly — fetchPlanMap

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase at module scope — mirrors ops-log.test.ts pattern
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import type { ProductionStream } from './kitchen-logs.types'
import { supabase } from '@/lib/supabase'
import {
  listActiveWipItems,
  listCaptureFormItems,
  fetchPlanMap,
  fetchStockMap,
  fetchKitchenStock,
  fetchKitchenStockAcrossStreams,
  resolveKitchenBuId,
  KITCHEN_BU_CODE,
  insertKitchenLog,
  insertKitchenLogBatch,
  listSubmittedKitchenLogs,
  approveKitchenLog,
  rejectKitchenLog,
} from './kitchen-logs'

const schemaMock = vi.mocked(supabase.schema)

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
  inserts: unknown[]
  updates: unknown[]
  orders: Array<[string, unknown]>
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
    builder.order = vi.fn((c: string, o: unknown) => {
      rec.orders.push([c, o])
      return builder
    })
    builder.limit = vi.fn(() => builder)
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
  return { fromTables: [], selects: [], eqs: [], inserts: [], updates: [], orders: [], rpcCalls: [] }
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
// The DD-WAY-29 gate scopes absence to the CAPTURE form only (FR-011):
//   * listCaptureFormItems reads the gated ops.capture_form_items view — only
//     confirmed item-units, no flag consulted client-side.
//   * listActiveWipItems stays the UNGATED active-item read that feeds the
//     stock/verification plane (FR-060, OD-WAY-45) and the plan surface — an
//     unconfirmed item still has real balances to verify.
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

describe('listCaptureFormItems — the gated capture-form read (FR-011, DD-WAY-29)', () => {
  const VIEW_ROWS = [
    { wip_item_id: 'w1', name: 'Ayam Bakar', category: 'Main' },
    { wip_item_id: 'w2', name: 'Nasi Goreng', category: 'Main' },
  ]

  it('reads the gated capture_form_items view ordered by name — never raw wip_items', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ capture_form_items: [{ data: VIEW_ROWS, error: null }] }, rec) as never,
    )

    const result = await listCaptureFormItems()
    expect(rec.fromTables).toContain('capture_form_items')
    expect(rec.fromTables).not.toContain('wip_items')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: 'w1', name: 'Ayam Bakar', category: 'Main' })
    expect(rec.orders).toContainEqual(['name', { ascending: true }])
    expect(rec.selects).toContain('wip_item_id,name,category')
  })

  it('collapses multiple confirmed units of one item to a single item row', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          capture_form_items: [
            {
              data: [
                { wip_item_id: 'w1', name: 'Ayam Bakar', category: 'Main' },
                { wip_item_id: 'w1', name: 'Ayam Bakar', category: 'Main' },
                { wip_item_id: 'w2', name: 'Nasi Goreng', category: 'Main' },
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

    // MUST NOT send server-stamped fields (NFR-003)
    assertNoServerStamps([payload])
    // should not send the old (wrong) 'date' key
    expect(payload).not.toHaveProperty('date')
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
      { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: 'Main', stok: 12, tersedia: 8 },
      // negative balances preserved, not clamped (FR-061, AC-032)
      { wip_item_id: 'w2', wip_item_name: 'Nasi Goreng', category: 'Main', stok: -3, tersedia: -3 },
    ])
  })

  it('lists every active item even when it has no stock row (defaults to 0/0)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          wip_items: [
            { data: [{ id: 'w1', name: 'Ayam Bakar', category: 'Main' }], error: null },
          ],
          kitchen_stock_for_date: [{ data: [], error: null }],
        },
        rec,
      ) as never,
    )
    const rows = await fetchKitchenStock('2026-06-20', STREAM)
    expect(rows).toEqual([
      { wip_item_id: 'w1', wip_item_name: 'Ayam Bakar', category: 'Main', stok: 0, tersedia: 0 },
    ])
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

// ── fetchKitchenStockAcrossStreams — the #198 multi-stream Stock view ──────────
describe('fetchKitchenStockAcrossStreams — one row per (active item × stream), stream shown (#198)', () => {
  const OTHER_STREAM: ProductionStream = {
    branch: { id: RADIANT_ID, code: 'radiant', name: 'Radiant' },
    activity: 'kitchen',
  }

  it('fetches every given stream and tags each returned row with its own stream', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          wip_items: [
            { data: [{ id: 'w1', name: 'Ayam Bakar', category: 'Main' }], error: null },
          ],
          kitchen_stock_for_date: [
            { data: [{ wip_item_id: 'w1', usable_qty: 12, available_qty: 8 }], error: null },
            { data: [{ wip_item_id: 'w1', usable_qty: 0, available_qty: 0 }], error: null },
          ],
        },
        rec,
      ) as never,
    )

    const rows = await fetchKitchenStockAcrossStreams('2026-06-20', [STREAM, OTHER_STREAM])
    expect(rows).toHaveLength(2) // 1 item × 2 streams
    expect(rows.find(r => r.stream.branch.id === BRANCH_ID)).toMatchObject({
      wip_item_id: 'w1', stok: 12, tersedia: 8, stream: STREAM,
    })
    expect(rows.find(r => r.stream.branch.id === RADIANT_ID)).toMatchObject({
      wip_item_id: 'w1', stok: 0, tersedia: 0, stream: OTHER_STREAM,
    })
  })

  it('returns [] for an empty stream list', async () => {
    expect(await fetchKitchenStockAcrossStreams('2026-06-20', [])).toEqual([])
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
    expect(rows[0]).toMatchObject({
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
    })
    expect(rows[1].wip_item_name).toBe('Cold Brew')
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
