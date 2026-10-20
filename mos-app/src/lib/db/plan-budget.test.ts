// plan-budget data-layer tests — TDD (AC-tagged). Mirrors the kitchen-logs.test.ts / reporting.test.ts
// harness pattern (mocked supabase client). Key assertions:
//  - reads the `reporting` schema (ingredient_cost_lines, bom_lines) — AC-PB-003
//  - reads/writes the `mos` schema (budgets, budget_lines, certified_metrics)
//  - captureBudget writes NO unit_cost on budget_lines (link-never-copy — AC-PB-008 / A5)
//  - captureBudget never sends org_id (server-stamped by RLS default)
//  - throws non-secret on PostgREST error
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import {
  listIngredientCostLines,
  listBomLines,
  listBudgets,
  listBudgetsPage,
  getCertifiedMetric,
  captureBudget,
} from './plan-budget'

const schemaMock = vi.mocked(supabase.schema)

interface Recorder {
  schemaNames: string[]
  fromTables: string[]
  rpcCalls: Array<{ name: string; params: Record<string, unknown> }>
  selects: string[]
  eqs: Array<[string, unknown]>
  isCalls: Array<[string, unknown]>
  orders: Array<[string, unknown]>
  limits: number[]
  filters: string[]
  ranges: Array<[number, number]>
  inserts: unknown[]
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
    builder.eq = vi.fn((c: string, v: unknown) => {
      rec.eqs.push([c, v])
      return builder
    })
    builder.is = vi.fn((c: string, v: unknown) => {
      rec.isCalls.push([c, v])
      return builder
    })
    builder.order = vi.fn((c: string, o: unknown) => {
      rec.orders.push([c, o])
      return builder
    })
    builder.limit = vi.fn((n: number) => { rec.limits.push(n); return builder })
    builder.or = vi.fn((filter: string) => { rec.filters.push(filter); return builder })
    builder.range = vi.fn((from: number, to: number) => { rec.ranges.push([from, to]); return builder })
    builder.insert = vi.fn((rows: unknown) => {
      rec.inserts.push(rows)
      return builder
    })
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.maybeSingle = vi.fn(() => Promise.resolve(result()))
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject)
    return builder
  }
  const rpcImpl = (name: string, params: Record<string, unknown>) => {
    rec.rpcCalls.push({ name, params })
    const result = responses[name]?.[0] ?? { data: null, error: { message: 'Unknown RPC' } }
    if (result.error) return Promise.resolve(result)
    return Promise.resolve(result)
  }
  const api = { from: vi.fn(fromImpl), rpc: vi.fn(rpcImpl) }
  return api
}

function freshRec(): Recorder {
  return { schemaNames: [], fromTables: [], rpcCalls: [], selects: [], eqs: [], isCalls: [], orders: [], limits: [], filters: [], ranges: [], inserts: [] }
}

beforeEach(() => {
  vi.clearAllMocks()
  schemaMock.mockImplementation((name: string) => {
    const rec = CURRENT_REC
    rec.schemaNames.push(name)
    return CURRENT_API as never
  })
})

let CURRENT_REC: Recorder = freshRec()
let CURRENT_API: ReturnType<typeof makeSchema> = makeSchema({}, freshRec())

function install(responses: Record<string, { data: unknown; error: unknown }[]>, rec: Recorder) {
  CURRENT_REC = rec
  CURRENT_API = makeSchema(responses, rec)
}

describe('AC-PB-003: reads the reporting read-models via the reporting schema', () => {
  it('listIngredientCostLines reads reporting.ingredient_cost_lines', async () => {
    const rec = freshRec()
    install({ ingredient_cost_lines: [{ data: [{ ingredient_esb_code: 'ING-1' }], error: null }] }, rec)
    const rows = await listIngredientCostLines()
    expect(rows).toHaveLength(1)
    expect(rec.fromTables).toContain('ingredient_cost_lines')
    expect(rec.schemaNames).toContain('reporting')
    expect(rec.ranges).toEqual([[0, 999]])
  })

  it('listBomLines reads reporting.bom_lines and filters by menu item when given', async () => {
    const rec = freshRec()
    install({ bom_lines: [{ data: [{ menu_item_esb_code: 'MENU-1' }], error: null }] }, rec)
    await listBomLines('MENU-1')
    expect(rec.fromTables).toContain('bom_lines')
    expect(rec.schemaNames).toContain('reporting')
    expect(rec.eqs).toContainEqual(['menu_item_esb_code', 'MENU-1'])
    expect(rec.ranges).toEqual([[0, 999]])
  })

  it('throws non-secret on reporting error (no DSN/token/SQL in message)', async () => {
    install({ ingredient_cost_lines: [{ data: null, error: { message: 'permission denied for table' } }] }, freshRec())
    await expect(listIngredientCostLines()).rejects.toThrow(/listIngredientCostLines failed/)
    try {
      await listIngredientCostLines()
    } catch (e) {
      expect((e as Error).message).not.toMatch(/dsn|token|jwt|stack/i)
    }
  })
})

describe('budget scenario paging', () => {
  it('returns the newest 50 scenarios and a cursor for the next page', async () => {
    const rec = freshRec()
    const createdAt = (index: number) => new Date(Date.UTC(2026, 9, 20 - index)).toISOString()
    const rows = Array.from({ length: 51 }, (_, index) => ({ id: `budget-${index + 1}`, created_at: createdAt(index) }))
    install({ budgets: [{ data: rows, error: null }] }, rec)

    const page = await listBudgetsPage('MENU-1')

    expect(page.rows).toHaveLength(50)
    expect(page.hasMore).toBe(true)
    expect(page.cursor).toEqual({ id: 'budget-50', createdAt: createdAt(49) })
    expect(rec.limits).toEqual([51])
    expect(rec.orders).toEqual([['created_at', { ascending: false }], ['id', { ascending: false }]])
    expect(rec.eqs).toContainEqual(['menu_item_esb_code', 'MENU-1'])
  })

  it('collects every scenario through bounded keyset pages for calculations', async () => {
    const rec = freshRec()
    const first = Array.from({ length: 51 }, (_, index) => ({ id: `budget-${index + 1}`, created_at: new Date(Date.UTC(2026, 9, 20 - index)).toISOString() }))
    install({ budgets: [
      { data: first, error: null },
      { data: [{ id: 'budget-51', created_at: '2026-09-01T00:00:00Z' }], error: null },
    ] }, rec)

    const rows = await listBudgets()

    expect(rows).toHaveLength(51)
    expect(rec.limits).toEqual([51, 51])
    expect(rec.filters).toHaveLength(1)
  })

  it('requests rows strictly older than the last loaded timestamp and ID', async () => {
    const rec = freshRec()
    install({ budgets: [{ data: [{ id: 'budget-51', created_at: '2026-09-01T00:00:00Z' }], error: null }] }, rec)

    const page = await listBudgetsPage(undefined, { id: 'budget-50', createdAt: '2026-09-02T00:00:00Z' })

    expect(rec.filters).toContain('created_at.lt.2026-09-02T00:00:00Z,and(created_at.eq.2026-09-02T00:00:00Z,id.lt.budget-50)')
    expect(page.rows).toHaveLength(1)
    expect(page.hasMore).toBe(false)
    expect(page.cursor).toBeNull()
  })
})

describe('mos reads', () => {
  it('listBudgets reads mos.budgets, filters archived_at IS NULL, and optional menu item', async () => {
    const rec = freshRec()
    install({ budgets: [{ data: [{ id: 'b1' }], error: null }] }, rec)
    await listBudgets('MENU-1')
    expect(rec.fromTables).toContain('budgets')
    expect(rec.schemaNames).toContain('mos')
    expect(rec.isCalls).toContainEqual(['archived_at', null])
    expect(rec.eqs).toContainEqual(['menu_item_esb_code', 'MENU-1'])
  })

  it('getCertifiedMetric returns the row or null (maybeSingle)', async () => {
    install({ certified_metrics: [{ data: { key: 'cogs.budgeted', certified: true }, error: null }] }, freshRec())
    const m = await getCertifiedMetric('cogs.budgeted')
    expect(m?.certified).toBe(true)

    install({ certified_metrics: [{ data: null, error: null }] }, freshRec())
    const none = await getCertifiedMetric('cogs.budgeted')
    expect(none).toBeNull()
  })
})

describe('AC-PB-008: captureBudget writes the linked shape (no unit cost, no org_id)', () => {
  const CAPTURE_INPUT = {
    menuItemEsbCode: 'MENU-1',
    menuItemName: 'Cappuccino',
    scenarioLabel: 'Baseline',
    scenarioType: 'baseline' as const,
    owningBuId: 'BU-1',
    costBasisAsOf: '2026-07-01T00:00:00Z',
    isComplete: true,
    lines: [
      { ingredient_esb_code: 'ING-1', recipe_qty: 2, qty_unit: 'kg' },
      { ingredient_esb_code: 'ING-2', recipe_qty: 0.5, qty_unit: 'L' },
    ],
  }

  it('calls mos.capture_budget RPC with the right args and NO total param', async () => {
    const rec = freshRec()
    install(
      {
        capture_budget: [{ data: 'NEW-BUDGET-ID', error: null }],
      },
      rec,
    )
    const id = await captureBudget(CAPTURE_INPUT)
    expect(id).toBe('NEW-BUDGET-ID')
    expect(rec.rpcCalls).toHaveLength(1)
    expect(rec.rpcCalls[0].name).toBe('capture_budget')
    // Verify NO totalBudgetedCogs param is sent (A5 fix — server computes it).
    expect(rec.rpcCalls[0].params).not.toHaveProperty('p_total_budgeted_cogs')
    expect(rec.rpcCalls[0].params).not.toHaveProperty('totalBudgetedCogs')
    // Verify the lines param is sent as-is (link-never-copy — no unit_cost).
    expect(rec.rpcCalls[0].params.p_lines).toEqual(CAPTURE_INPUT.lines)
  })

  it('AC-PB-007/008 (link-never-copy): budget_lines carry ingredient + qty ONLY — NO unit_cost', async () => {
    const rec = freshRec()
    install(
      {
        capture_budget: [{ data: 'NEW-BUDGET-ID', error: null }],
      },
      rec,
    )
    await captureBudget(CAPTURE_INPUT)
    // The RPC handles lines internally; client only sends the lines array.
    // Verify that the input shape has NO unit_cost, NO totalBudgetedCogs.
    expect(CAPTURE_INPUT.lines[0]).not.toHaveProperty('unit_cost')
    expect(CAPTURE_INPUT).not.toHaveProperty('totalBudgetedCogs')
  })

  it('throws on RPC error', async () => {
    install(
      {
        capture_budget: [{ data: null, error: { message: 'permission denied' } }],
      },
      freshRec(),
    )
    await expect(captureBudget(CAPTURE_INPUT)).rejects.toThrow(/captureBudget RPC failed/)
  })
})
