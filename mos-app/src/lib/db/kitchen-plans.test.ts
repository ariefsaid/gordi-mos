// kitchen-plans.ts data module tests — TDD (AC-tagged).
// S2 — the daily plan editor + the 14-day "pesanan" read horizon.
// Mirrors the kitchen-logs.test.ts schema-mock harness (makeSchema + Recorder).
// Key assertions:
//  - listKitchenPlans(date) reads ops.kitchen_plans for ONE date → PlanCell[] (editor).
//  - listPesanan(from, days) reads the forward horizon → PesananRow[] (member read, AC-024).
//  - upsertKitchenPlan: select-then-insert/update; client NEVER sends org_id/plan_by;
//    a NEW key INSERTs, an EXISTING key UPDATEs by id (FR-031 replace/upsert).

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import { listKitchenPlans, listPesanan, upsertKitchenPlan } from './kitchen-plans'

const schemaMock = vi.mocked(supabase.schema)

interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  gtes: Array<[string, unknown]>
  ltes: Array<[string, unknown]>
  inserts: unknown[]
  updates: unknown[]
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
    builder.update = vi.fn((row: unknown) => {
      rec.updates.push(row)
      return builder
    })
    builder.eq = vi.fn((c: string, v: unknown) => {
      rec.eqs.push([c, v])
      return builder
    })
    builder.gte = vi.fn((c: string, v: unknown) => {
      rec.gtes.push([c, v])
      return builder
    })
    builder.lte = vi.fn((c: string, v: unknown) => {
      rec.ltes.push([c, v])
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
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], gtes: [], ltes: [], inserts: [], updates: [], orders: [] }
}

function assertNoServerStamps(payloads: unknown[]) {
  for (const p of payloads.flat()) {
    if (p && typeof p === 'object') {
      expect(Object.keys(p)).not.toContain('org_id')
      expect(Object.keys(p)).not.toContain('plan_by')
    }
  }
}

beforeEach(() => vi.clearAllMocks())

// ── listKitchenPlans (editor — one date) ──────────────────────────────────────
describe('listKitchenPlans', () => {
  it('reads ops.kitchen_plans for the date → PlanCell[] (carries the row id for upsert)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_plans: [
            {
              data: [
                { id: 'pl1', wip_item_id: 'w1', action_type: 'Production', qty_porsi: 12 },
                { id: 'pl2', wip_item_id: 'w2', action_type: 'Transfer to Radiant', qty_porsi: 5 },
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )
    const cells = await listKitchenPlans('2026-06-20')
    expect(cells).toHaveLength(2)
    expect(cells[0]).toEqual({ id: 'pl1', wip_item_id: 'w1', action_type: 'Production', qty_porsi: 12 })
    expect(rec.eqs).toContainEqual(['log_date', '2026-06-20'])
  })

  it('returns [] when no plan rows', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_plans: [{ data: [], error: null }] }, rec) as never,
    )
    expect(await listKitchenPlans('2026-06-20')).toEqual([])
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_plans: [{ data: null, error: { message: 'boom' } }] }, rec) as never,
    )
    await expect(listKitchenPlans('2026-06-20')).rejects.toThrow('listKitchenPlans failed')
  })
})

// ── listPesanan (14-day forward read horizon — AC-024) ────────────────────────
describe('listPesanan (AC-024)', () => {
  it('reads the date window [from, from+days-1] inclusive, item name embedded', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_plans: [
            {
              data: [
                { log_date: '2026-06-20', wip_item_id: 'w1', action_type: 'Production', qty_porsi: 12, wip_items: { name: 'Ayam Bakar' } },
                { log_date: '2026-06-27', wip_item_id: 'w2', action_type: 'Production', qty_porsi: 8, wip_items: [{ name: 'Nasi Goreng' }] },
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )
    const rows = await listPesanan('2026-06-20', 14)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      log_date: '2026-06-20', wip_item_id: 'w1', action_type: 'Production',
      qty_porsi: 12, wip_item_name: 'Ayam Bakar',
    })
    // tolerates the embed as object OR array (PostgREST to-one variance)
    expect(rows[1].wip_item_name).toBe('Nasi Goreng')
    // window: gte from, lte from+13 (14-day inclusive horizon)
    expect(rec.gtes).toContainEqual(['log_date', '2026-06-20'])
    expect(rec.ltes).toContainEqual(['log_date', '2026-07-03'])
  })

  it('returns [] when nothing planned in the horizon', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_plans: [{ data: [], error: null }] }, rec) as never,
    )
    expect(await listPesanan('2026-06-20', 14)).toEqual([])
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ kitchen_plans: [{ data: null, error: { message: 'boom' } }] }, rec) as never,
    )
    await expect(listPesanan('2026-06-20', 14)).rejects.toThrow('listPesanan failed')
  })
})

// ── upsertKitchenPlan (FR-031 replace/upsert; NFR-003 no server stamps) ───────
describe('upsertKitchenPlan', () => {
  const INPUT = {
    log_date: '2026-06-20',
    wip_item_id: 'w1',
    action_type: 'Production' as const,
    qty_porsi: 15,
  }

  it('INSERTs a new key — never sends org_id/plan_by; sends log_date + qty_porsi', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          // 1st read (existence probe) → none; then insert returns the new id
          kitchen_plans: [
            { data: null, error: null }, // maybeSingle existence probe: no row
            { data: { id: 'new1' }, error: null }, // insert .select().single()
          ],
        },
        rec,
      ) as never,
    )
    const id = await upsertKitchenPlan(INPUT)
    expect(id).toBe('new1')
    expect(rec.inserts).toHaveLength(1)
    expect(rec.updates).toHaveLength(0)
    assertNoServerStamps(rec.inserts)
    const payload = (rec.inserts[0] as Record<string, unknown>)
    expect(payload.qty_porsi).toBe(15)
    expect(payload.log_date).toBe('2026-06-20') // DB column is `log_date`
    expect(payload.action_type).toBe('Production')
  })

  it('UPDATEs when the key already exists (replace semantics, by id)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_plans: [
            { data: { id: 'exist1' }, error: null }, // probe finds an existing row
            { data: { id: 'exist1' }, error: null }, // update .select().single()
          ],
        },
        rec,
      ) as never,
    )
    const id = await upsertKitchenPlan(INPUT)
    expect(id).toBe('exist1')
    expect(rec.inserts).toHaveLength(0)
    expect(rec.updates).toHaveLength(1)
    assertNoServerStamps(rec.updates)
    expect(rec.eqs).toContainEqual(['id', 'exist1']) // updated by id
    expect((rec.updates[0] as Record<string, unknown>).qty_porsi).toBe(15)
  })

  it('rejects a negative qty (kitchen_plans allows ≥ 0, not < 0)', async () => {
    await expect(upsertKitchenPlan({ ...INPUT, qty_porsi: -1 })).rejects.toThrow('qty_porsi')
  })

  it('allows qty 0 (plan can zero out a line — distinct from logs > 0)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_plans: [
            { data: null, error: null },
            { data: { id: 'z' }, error: null },
          ],
        },
        rec,
      ) as never,
    )
    await expect(upsertKitchenPlan({ ...INPUT, qty_porsi: 0 })).resolves.toBe('z')
  })

  it('throws on a write error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          kitchen_plans: [
            { data: null, error: null }, // probe ok
            { data: null, error: { message: 'denied' } }, // insert fails (RLS)
          ],
        },
        rec,
      ) as never,
    )
    await expect(upsertKitchenPlan(INPUT)).rejects.toThrow('upsertKitchenPlan failed')
  })
})
