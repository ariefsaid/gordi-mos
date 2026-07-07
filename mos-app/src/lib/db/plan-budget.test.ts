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
  getCertifiedMetric,
  captureBudget,
} from './plan-budget'

const schemaMock = vi.mocked(supabase.schema)

interface Recorder {
  schemaNames: string[]
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  isCalls: Array<[string, unknown]>
  orders: Array<[string, unknown]>
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
  // schema() returns the {from, rpc} object; also record the schema name requested.
  const api = { from: vi.fn(fromImpl) }
  return api
}

function freshRec(): Recorder {
  return { schemaNames: [], fromTables: [], selects: [], eqs: [], isCalls: [], orders: [], inserts: [] }
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
  })

  it('listBomLines reads reporting.bom_lines and filters by menu item when given', async () => {
    const rec = freshRec()
    install({ bom_lines: [{ data: [{ menu_item_esb_code: 'MENU-1' }], error: null }] }, rec)
    await listBomLines('MENU-1')
    expect(rec.fromTables).toContain('bom_lines')
    expect(rec.schemaNames).toContain('reporting')
    expect(rec.eqs).toContainEqual(['menu_item_esb_code', 'MENU-1'])
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
    totalBudgetedCogs: 40000,
    costBasisAsOf: '2026-07-01T00:00:00Z',
    isComplete: true,
    lines: [
      { ingredient_esb_code: 'ING-1', recipe_qty: 2, qty_unit: 'kg' },
      { ingredient_esb_code: 'ING-2', recipe_qty: 0.5, qty_unit: 'L' },
    ],
  }

  it('inserts a budget row (mos.budgets) + its lines (mos.budget_lines)', async () => {
    const rec = freshRec()
    install(
      {
        budgets: [{ data: { id: 'NEW-BUDGET' }, error: null }],
        budget_lines: [{ data: null, error: null }],
      },
      rec,
    )
    const id = await captureBudget(CAPTURE_INPUT)
    expect(id).toBe('NEW-BUDGET')
    expect(rec.inserts).toHaveLength(2) // the budget row + the lines array

    // The budget row payload — no server-stamped org_id/created_by/created_at.
    const budgetPayload = rec.inserts[0] as Record<string, unknown>
    expect(budgetPayload.menu_item_esb_code).toBe('MENU-1')
    expect(budgetPayload.total_budgeted_cogs).toBe(40000)
    expect(Object.keys(budgetPayload)).not.toContain('org_id')
    expect(Object.keys(budgetPayload)).not.toContain('created_by')
    expect(Object.keys(budgetPayload)).not.toContain('created_at')
  })

  it('AC-PB-007/008 (link-never-copy): budget_lines carry ingredient + qty ONLY — NO unit_cost', async () => {
    const rec = freshRec()
    install(
      {
        budgets: [{ data: { id: 'NEW-BUDGET' }, error: null }],
        budget_lines: [{ data: null, error: null }],
      },
      rec,
    )
    await captureBudget(CAPTURE_INPUT)
    const lineRows = rec.inserts[1] as Array<Record<string, unknown>>
    expect(lineRows).toHaveLength(2)
    for (const row of lineRows) {
      expect(row).toHaveProperty('ingredient_esb_code')
      expect(row).toHaveProperty('recipe_qty')
      expect(row).toHaveProperty('qty_unit')
      // A5 link-never-copy: there is NO embedded/copied unit cost on a budget line.
      expect(Object.keys(row)).not.toContain('unit_cost')
      expect(Object.keys(row)).not.toContain('cost')
    }
  })

  it('throws on insert error', async () => {
    install(
      {
        budgets: [{ data: null, error: { message: 'row-level security policy' } }],
        budget_lines: [{ data: null, error: null }],
      },
      freshRec(),
    )
    await expect(captureBudget(CAPTURE_INPUT)).rejects.toThrow(/captureBudget/)
  })
})
