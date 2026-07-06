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
  calls: Array<[string, unknown[]]>
}
function freshRec(): Recorder {
  return { fromTables: [], selects: [], limits: [], orders: [], calls: [] }
}
function makeSchema(finalData: unknown[], finalError: unknown, rec: Recorder) {
  const fromImpl = (table: string) => {
    rec.fromTables.push(table)
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
    builder.eq = vi.fn((...args: unknown[]) => { rec.calls.push(['eq', args]); return builder })
    builder.neq = vi.fn((...args: unknown[]) => { rec.calls.push(['neq', args]); return builder })
    builder.in = vi.fn((...args: unknown[]) => { rec.calls.push(['in', args]); return builder })
    builder.gt = vi.fn((...args: unknown[]) => { rec.calls.push(['gt', args]); return builder })
    builder.gte = vi.fn((...args: unknown[]) => { rec.calls.push(['gte', args]); return builder })
    builder.lt = vi.fn((...args: unknown[]) => { rec.calls.push(['lt', args]); return builder })
    builder.lte = vi.fn((...args: unknown[]) => { rec.calls.push(['lte', args]); return builder })
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
  it('applies every resolved filter op + orderBy onto the query chain (FR-UV-006)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema([], null, rec) as never)
    await executeCompiledQuery(mkCompiled({
      resolvedFilters: [
        { column: 'status', op: 'eq', value: 'Open' },
        { column: 'status', op: 'neq', value: 'Done' },
        { column: 'status', op: 'in', value: ['Open', 'Blocked'] },
        { column: 'due_date', op: 'gt', value: '2026-01-01' },
        { column: 'due_date', op: 'gte', value: '2026-01-01' },
        { column: 'due_date', op: 'lt', value: '2026-12-31' },
        { column: 'due_date', op: 'lte', value: '2026-12-31' },
        { column: 'due_date', op: 'between', value: ['2026-01-01', '2026-12-31'] },
        { column: 'due_date', op: 'date-range', value: ['2026-01-01', '2026-12-31'] },
      ],
      resolvedOrderBy: { column: 'due_date', dir: 'asc' },
    }))
    expect(rec.calls.map(([op]) => op)).toEqual(
      ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'gte', 'lte', 'gte', 'lte']
    )
    expect(rec.orders).toEqual([['due_date', { ascending: true }]])
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
    expect(out.rows).toEqual([
      { branch_code: 'BGR', total: 150 },
      { branch_code: 'KMG', total: 200 },
    ])
  })
})

describe('executeCompiledQuery — truncation signal (P1 review fix-wave item 6)', () => {
  it('returns truncated: false when fewer rows than the limit come back', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema([{ id: '1' }, { id: '2' }], null, rec) as never)
    const out = await executeCompiledQuery(mkCompiled({ limit: 50 }))
    expect(out.rows).toHaveLength(2)
    expect(out.truncated).toBe(false)
  })
  it('returns truncated: true when rows.length === the effective limit (the fetch may have been cut off)', async () => {
    const rec = freshRec()
    const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }))
    schemaMock.mockReturnValue(makeSchema(rows, null, rec) as never)
    const out = await executeCompiledQuery(mkCompiled({ limit: 50 }))
    expect(out.rows).toHaveLength(50)
    expect(out.truncated).toBe(true)
  })
  it('falls back to the default 500 limit for the truncation check when compiled.limit is absent', async () => {
    const rec = freshRec()
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }))
    schemaMock.mockReturnValue(makeSchema(rows, null, rec) as never)
    const compiled = mkCompiled()
    delete (compiled as { limit?: number }).limit
    const out = await executeCompiledQuery(compiled)
    expect(out.truncated).toBe(true)
  })
  it('reflects truncation on the post-aggregate row count is NOT what truncated signals — truncated reflects the raw fetch, not the reduced group count', async () => {
    // A capped fetch of `limit` raw rows can reduce to far fewer grouped rows; truncated must
    // still flag that the UNDERLYING fetch was capped (i.e. the aggregate is a LOWER BOUND),
    // not whether the post-groupBy row count happens to equal the limit.
    const rec = freshRec()
    const rows = Array.from({ length: 3 }, () => ({ branch_code: 'BGR', clean_revenue: 1 }))
    schemaMock.mockReturnValue(makeSchema(rows, null, rec) as never)
    const out = await executeCompiledQuery(mkCompiled({
      limit: 3,
      resolvedGroupBy: 'branch_code',
      resolvedAggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
    }))
    expect(out.rows).toEqual([{ branch_code: 'BGR', total: 3 }]) // 1 grouped row
    expect(out.truncated).toBe(true) // but the raw fetch (3) hit the limit (3)
  })
})
