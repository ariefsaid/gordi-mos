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
function makeSchema(finalData: unknown[], finalError: unknown, rec: Recorder, rpc?: unknown) {
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
  // The aggregate path uses .rpc('aggregate_compiled', { p_compiled }) on the schema object.
  // Default rpc = resolve with finalData/finalError; tests can override (e.g. to reject → fallback).
  const schemaObj: Record<string, unknown> = { from: vi.fn(fromImpl) }
  schemaObj.rpc = rpc ?? vi.fn(() => Promise.resolve({ data: finalData as unknown, error: finalError }))
  return schemaObj
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

describe('executeCompiledQuery — AC-UV-009 (in-mem aggregate fallback when RPC unavailable)', () => {
  it('falls back to in-memory groupBy + sum when the aggregate_compiled RPC rejects', async () => {
    // The RPC is the happy path (AC-P2-RT-006). When it rejects (e.g. function missing, db error),
    // the executor falls back to the P1 in-memory reduction over a capped fetch and reports the
    // truncation signal honestly. This preserves the P1 lower-bound contract as a safety net.
    const rows = [
      { branch_code: 'BGR', clean_revenue: 100 },
      { branch_code: 'BGR', clean_revenue: 50 },
      { branch_code: 'KMG', clean_revenue: 200 },
    ]
    const rec = freshRec()
    const rpcRejecting = vi.fn(() => Promise.reject(new Error('rpc unavailable')))
    schemaMock.mockReturnValue(makeSchema(rows, null, rec, rpcRejecting) as never)
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

describe('executeCompiledQuery — AC-P2-RT-006 (DB-side aggregate via mos.aggregate_compiled)', () => {
  it('routes an aggregate query through the RPC and returns truncated:false over the full predicate', async () => {
    // The RPC computes the real SQL aggregate uncapped by the 500 row limit. The executor's job is
    // to call it when resolvedAggregate/resolvedGroupBy is present and map {group_key, agg_value}
    // back to the renderer's { [groupBy]: ..., [alias]: ... } shape. truncated is honestly false:
    // the aggregate covers the full set, not a capped fetch.
    const rec = freshRec()
    const rpcRows = [
      { group_key: 'BGR', agg_value: 60000 },
      { group_key: 'KMG', agg_value: 42000 },
    ]
    const rpcResolving = vi.fn(() => Promise.resolve({ data: rpcRows, error: null }))
    schemaMock.mockReturnValue(makeSchema([], null, rec, rpcResolving) as never)

    const out = await executeCompiledQuery(mkCompiled({
      resolvedGroupBy: 'branch_code',
      resolvedAggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
      resolvedOrderBy: { column: 'total', dir: 'desc' },
    }))

    expect(rpcResolving).toHaveBeenCalledWith('aggregate_compiled', {
      p_compiled: expect.objectContaining({
        entity: 'tasks',
        resolvedGroupBy: 'branch_code',
        resolvedAggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
      }),
    })
    expect(out.rows).toEqual([
      { branch_code: 'BGR', total: 60000 },
      { branch_code: 'KMG', total: 42000 },
    ])
    expect(out.truncated).toBe(false) // the load-bearing assertion: not a lower bound
  })

  it('maps a single-row (no groupBy) aggregate to { [alias]: value } with group_key null', async () => {
    const rec = freshRec()
    const rpcRows = [{ group_key: null, agg_value: 102000 }]
    const rpcResolving = vi.fn(() => Promise.resolve({ data: rpcRows, error: null }))
    schemaMock.mockReturnValue(makeSchema([], null, rec, rpcResolving) as never)

    const out = await executeCompiledQuery(mkCompiled({
      resolvedAggregate: { fn: 'sum', column: 'clean_revenue', alias: 'grand_total' },
    }))

    expect(out.rows).toEqual([{ grand_total: 102000 }])
    expect(out.truncated).toBe(false)
  })

  it('surfaces an RPC error by falling back to in-memory (lower-bound) rather than throwing', async () => {
    // The fallback is the safety net: a transient RPC failure must not break the renderer. The
    // aggregate degrades to a lower bound over the capped fetch and truncated reflects the cap.
    const rec = freshRec()
    const rpcRejecting = vi.fn(() => Promise.reject(new Error('function missing')))
    const rawRows = Array.from({ length: 50 }, () => ({ clean_revenue: 10 }))
    schemaMock.mockReturnValue(makeSchema(rawRows, null, rec, rpcRejecting) as never)

    const out = await executeCompiledQuery(mkCompiled({
      limit: 50,
      resolvedAggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
    }))

    expect(out.rows).toEqual([{ total: 500 }]) // 50 × 10 — a lower bound over the capped fetch
    expect(out.truncated).toBe(true) // honestly flagged: the underlying fetch hit the cap
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
  it('reflects truncation on the post-aggregate row count is NOT what truncated signals — truncated reflects the raw fetch, not the reduced group count (fallback path)', async () => {
    // A capped fetch of `limit` raw rows can reduce to far fewer grouped rows; truncated must
    // still flag that the UNDERLYING fetch was capped (i.e. the aggregate is a LOWER BOUND),
    // not whether the post-groupBy row count happens to equal the limit. Exercises the in-memory
    // fallback (RPC rejects); on the RPC happy path truncated is always false (full predicate).
    const rec = freshRec()
    const rows = Array.from({ length: 3 }, () => ({ branch_code: 'BGR', clean_revenue: 1 }))
    const rpcRejecting = vi.fn(() => Promise.reject(new Error('rpc unavailable')))
    schemaMock.mockReturnValue(makeSchema(rows, null, rec, rpcRejecting) as never)
    const out = await executeCompiledQuery(mkCompiled({
      limit: 3,
      resolvedGroupBy: 'branch_code',
      resolvedAggregate: { fn: 'sum', column: 'clean_revenue', alias: 'total' },
    }))
    expect(out.rows).toEqual([{ branch_code: 'BGR', total: 3 }]) // 1 grouped row
    expect(out.truncated).toBe(true) // but the raw fetch (3) hit the limit (3)
  })
})
