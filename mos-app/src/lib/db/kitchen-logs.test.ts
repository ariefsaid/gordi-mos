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
  insertKitchenLog,
  insertKitchenLogBatch,
} from './kitchen-logs'

const schemaMock = vi.mocked(supabase.schema)

// ── Schema mock harness (mirrors ops-log.test.ts) ───────────────────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  inserts: unknown[]
  orders: Array<[string, unknown]>
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
    builder.eq = vi.fn((c: string, v: unknown) => {
      rec.eqs.push([c, v])
      return builder
    })
    builder.order = vi.fn((c: string, o: unknown) => {
      rec.orders.push([c, o])
      return builder
    })
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], inserts: [], orders: [] }
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
    expect(rec.eqs).toContainEqual(['date', '2026-06-20'])
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
    expect(payload.date).toBe('2026-06-20')       // DB column is `date`
    expect(payload.action_type).toBe('Production')
    expect(payload.wip_item_id).toBe(WIP_ID)
    expect(payload.qty_porsi).toBe(8)
    expect(payload.notes).toBe('test note')

    // MUST NOT send server-stamped fields (NFR-003)
    assertNoServerStamps([payload])
    // should not send log_date (DB column is `date`)
    expect(payload).not.toHaveProperty('log_date')
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
