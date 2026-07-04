import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { executeCompiledQuery } from './executor'
import { supabase } from '@/lib/supabase'
import type { CompiledQuery } from './types'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness ────────────────────────────────────────────────────────────
// A chainable query-builder recorder — mirrors the plain-object + real `.then` pattern used by
// src/lib/db/tasks.test.ts (a Proxy whose `get` trap masks `then` is NOT awaitable; a real object
// with a genuine thenable `.then` is). Records from/select/limit/order/eq calls for assertion.
interface Recorder {
  fromTables: string[]
  selects: string[]
  limits: number[]
  orders: Array<[string, unknown]>
}
function freshRec(): Recorder {
  return { fromTables: [], selects: [], limits: [], orders: [] }
}
function makeSchema(finalData: unknown[], finalError: unknown, rec: Recorder) {
  const fromImpl = (table: string) => {
    rec.fromTables.push(table)
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
    builder.eq = vi.fn(() => builder)
    builder.neq = vi.fn(() => builder)
    builder.in = vi.fn(() => builder)
    builder.gt = vi.fn(() => builder)
    builder.gte = vi.fn(() => builder)
    builder.lt = vi.fn(() => builder)
    builder.lte = vi.fn(() => builder)
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.limit = vi.fn((n: number) => { rec.limits.push(n); return builder })
    builder.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: finalData, error: finalError }).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function mkCompiled(over: Partial<CompiledQuery> = {}): CompiledQuery {
  return {
    entity: 'tasks', schema: 'mos', table: 'tasks',
    resolvedSelect: ['id', 'title'], resolvedFilters: [],
    limit: 50, ...over,
  } as CompiledQuery
}

beforeEach(() => { schemaMock.mockReset() })

describe('executeCompiledQuery — AC-UV-008 (schema-scoped dispatch)', () => {
  it('dispatches via supabase.schema("mos").from("tasks")', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema([], null, rec) as never)
    await executeCompiledQuery(mkCompiled())
    expect(schemaMock).toHaveBeenCalledWith('mos')
    expect(rec.fromTables).toEqual(['tasks'])
    expect(rec.selects).toEqual(['id,title'])
    expect(rec.limits).toEqual([50])
  })
  it('dispatches reporting via supabase.schema("reporting").from("sales_daily_revenue")', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema([], null, rec) as never)
    await executeCompiledQuery(mkCompiled({ entity: 'sales_daily_revenue', schema: 'reporting', table: 'sales_daily_revenue' }))
    expect(schemaMock).toHaveBeenCalledWith('reporting')
    expect(rec.fromTables).toEqual(['sales_daily_revenue'])
  })
  it('throws on a PostgREST error (MOS DAL convention)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema([], { message: 'boom' }, rec) as never)
    await expect(executeCompiledQuery(mkCompiled())).rejects.toThrow(/executeCompiledQuery failed — boom/)
  })
})

describe('executeCompiledQuery — AC-UV-009 (in-mem aggregate)', () => {
  it('applies groupBy + sum over the returned rows', async () => {
    const rows = [
      { branch_code: 'BGR', clean_revenue: 100 },
      { branch_code: 'BGR', clean_revenue: 50 },
      { branch_code: 'KMG', clean_revenue: 200 },
    ]
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema(rows, null, rec) as never)
    const out = await executeCompiledQuery(mkCompiled({
      resolvedGroupBy: 'branch_code',
      resolvedAggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
    }))
    expect(out).toEqual([
      { branch_code: 'BGR', total: 150 },
      { branch_code: 'KMG', total: 200 },
    ])
  })
})
