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

import { supabase } from '@/lib/supabase'
import {
  listActiveWipItems,
  fetchPlanMap,
  fetchStockMap,
  fetchKitchenStock,
  resolveKitchenBuId,
  KITCHEN_BU_NAME,
  insertKitchenLog,
  insertKitchenLogBatch,
  listSubmittedKitchenLogs,
  approveKitchenLog,
  rejectKitchenLog,
} from './kitchen-logs'

const schemaMock = vi.mocked(supabase.schema)

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

// ── listActiveWipItems ────────────────────────────────────────────────────────
describe('listActiveWipItems', () => {
  const WIP_ROWS = [
    { id: 'w1', name: 'Ayam Bakar', category: 'Main' },
    { id: 'w2', name: 'Nasi Goreng', category: 'Main' },
  ]

  it('queries wip_items with flag_active=true ordered by name', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ wip_items: [{ data: WIP_ROWS, error: null }] }, rec) as never,
    )

    const result = await listActiveWipItems()
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

// ── fetchPlanMap ──────────────────────────────────────────────────────────────
describe('fetchPlanMap', () => {
  it('builds a PlanMap keyed by wip_item_id/action_type', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_plans: [
            {
              data: [
                { wip_item_id: 'w1', action_type: 'Production', qty_porsi: 12 },
                { wip_item_id: 'w1', action_type: 'Transfer to Radiant', qty_porsi: 5 },
                { wip_item_id: 'w2', action_type: 'Production', qty_porsi: 20 },
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )

    const map = await fetchPlanMap('2026-06-20')
    expect(map['w1']['Production']).toBe(12)
    expect(map['w1']['Transfer to Radiant']).toBe(5)
    expect(map['w2']['Production']).toBe(20)
    expect(map['w1']['Transfer to Bungur']).toBeUndefined()
    expect(rec.eqs).toContainEqual(['log_date', '2026-06-20'])
  })

  it('returns empty map when no plan rows', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_plans: [{ data: [], error: null }] }, rec) as never,
    )
    const map = await fetchPlanMap('2026-06-20')
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
    await expect(fetchPlanMap('2026-06-20')).rejects.toThrow('fetchPlanMap failed')
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
      action_type: 'Production',
      wip_item_id: WIP_ID,
      qty_porsi: 8,
      notes: 'test note',
    })

    expect(rec.inserts).toHaveLength(1)
    const payload = rec.inserts[0] as Record<string, unknown>

    // Required fields
    expect(payload.business_unit_id).toBe(BU_ID)
    expect(payload.log_date).toBe('2026-06-20')   // DB column is `log_date`
    expect(payload.action_type).toBe('Production')
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
        action_type: 'Production',
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
        action_type: 'Production',
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
      action_type: 'Transfer to Radiant',
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
        action_type: 'Production',
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
        action_type: 'Production',
        wip_item_id: 'w1',
        qty_porsi: 5,
      },
      {
        business_unit_id: BU_ID,
        log_date: '2026-06-20',
        action_type: 'Production',
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
          action_type: 'Production',
          wip_item_id: 'w1',
          qty_porsi: 5,
        },
        {
          business_unit_id: BU_ID,
          log_date: '2026-06-20',
          action_type: 'Production',
          wip_item_id: 'w2',
          qty_porsi: 0,
        },
      ]),
    ).rejects.toThrow('qty_porsi must be > 0')
  })
})

// ── resolveKitchenBuId — Kitchen and Bar BU resolution (#3, spec §3.3) ─────────
describe('resolveKitchenBuId — resolves the Kitchen and Bar business unit by name', () => {
  it('queries shared.business_units by the Kitchen-and-Bar name and returns its id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          business_units: [
            { data: { id: 'kb-bu-1', name: KITCHEN_BU_NAME }, error: null },
          ],
        },
        rec,
      ) as never,
    )

    const id = await resolveKitchenBuId()
    expect(id).toBe('kb-bu-1')
    // resolves BY NAME (not viewer.roles[0]) — spec §3.3
    expect(rec.fromTables).toContain('business_units')
    expect(rec.eqs).toContainEqual(['name', KITCHEN_BU_NAME])
  })

  it('throws a clear "cannot log without the kitchen BU" error when the BU is absent', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ business_units: [{ data: null, error: null }] }, rec) as never,
    )
    await expect(resolveKitchenBuId()).rejects.toThrow(/kitchen.*business unit|Kitchen and Bar/i)
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

    const map = await fetchStockMap('2026-06-20')
    expect(map['w1']).toEqual({ stok: 3, tersedia: 9 })
    expect(map['w2']).toEqual({ stok: 0, tersedia: 0 })
    // dispatched to the corrected #45 contract: kitchen_stock_for_date(p_as_of)
    expect(rec.rpcCalls).toContainEqual(['kitchen_stock_for_date', { p_as_of: '2026-06-20' }])
  })

  it('returns an empty map when no stock rows', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_stock_for_date: [{ data: [], error: null }] }, rec) as never,
    )
    const map = await fetchStockMap('2026-06-20')
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
    await expect(fetchStockMap('2026-06-20')).rejects.toThrow('fetchStockMap failed')
  })
})

// ── fetchKitchenStock — the read-only Stock view's list shape (S4, FR-060/061) ─
describe('fetchKitchenStock — per-item stock rows for the Stock view (FR-060/061)', () => {
  it('joins active WIP item names with kitchen_stock_for_date rows (stok/tersedia)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          // listActiveWipItems read
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

    const rows = await fetchKitchenStock('2026-06-20')
    expect(rec.rpcCalls).toContainEqual(['kitchen_stock_for_date', { p_as_of: '2026-06-20' }])
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
    const rows = await fetchKitchenStock('2026-06-20')
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
    const rows = await fetchKitchenStock('2026-06-20')
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
    await expect(fetchKitchenStock('2026-06-20')).rejects.toThrow('fetchStockMap failed')
  })
})

// ── listSubmittedKitchenLogs — review queue read (FR-040, AC-040/090) ──────────
describe('listSubmittedKitchenLogs — the ops_lead review queue (FR-040)', () => {
  const SUBMITTED_ROWS = [
    {
      id: 'log-1',
      log_date: '2026-06-20',
      action_type: 'Production',
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
      action_type: 'Transfer to Radiant',
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

    // Flattened display shape
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      id: 'log-1',
      wip_item_name: 'Nasi Goreng',
      log_date: '2026-06-20',
      action_type: 'Production',
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
