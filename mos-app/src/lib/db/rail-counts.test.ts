import { describe, it, expect, vi, beforeEach } from 'vitest'

// getRailCounts reaches mos via supabase.schema('mos').from(table).select('*', {count,head}) then a
// chain of filter builders, awaited for { count, error }. Mock a chainable builder that records the
// table + filters and resolves a queued { count, error } per table.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { getRailCounts } from './rail-counts'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

interface Rec { tables: string[]; selects: Array<[string, unknown]>; filters: string[] }
type Result = { count: number | null; error: unknown }

function makeClient(byTable: Record<string, Result>, rec: Rec) {
  function fromImpl(table: string) {
    rec.tables.push(table)
    const result: Result = byTable[table] ?? { count: 0, error: null }
    const builder: Record<string, unknown> = {}
    // The awaited value: a head-count builder is thenable and resolves to { count, error }.
    builder.then = (resolve: (v: Result) => unknown) => resolve(result)
    builder.select = vi.fn((s: string, opts?: unknown) => { rec.selects.push([s, opts]); return builder })
    builder.is = vi.fn((c: string) => { rec.filters.push(`is:${c}`); return builder })
    builder.neq = vi.fn((c: string, v: unknown) => { rec.filters.push(`neq:${c}=${String(v)}`); return builder })
    builder.in = vi.fn((c: string, v: unknown[]) => { rec.filters.push(`in:${c}=${v.join(',')}`); return builder })
    return builder
  }
  return { from: vi.fn((table: string) => fromImpl(table)) }
}

function freshRec(): Rec { return { tables: [], selects: [], filters: [] } }

beforeEach(() => vi.clearAllMocks())

describe('getRailCounts — the one cheap rail aggregate', () => {
  it('returns the open-task and attention-signal head counts', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: 11, error: null }, signals: { count: 3, error: null } }, rec) as never,
    )
    const counts = await getRailCounts()
    expect(counts).toEqual({ openTasks: 11, attentionSignals: 3 })
    expect(rec.tables).toEqual(expect.arrayContaining(['tasks', 'signals']))
  })

  it('issues HEAD exact-count selects (no rows fetched)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: 1, error: null }, signals: { count: 1, error: null } }, rec) as never,
    )
    await getRailCounts()
    for (const [, opts] of rec.selects) {
      expect(opts).toEqual({ count: 'exact', head: true })
    }
  })

  it('scopes open tasks to non-archived + non-Done, and signals to non-retracted needs-attention/urgent', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: 0, error: null }, signals: { count: 0, error: null } }, rec) as never,
    )
    await getRailCounts()
    expect(rec.filters).toEqual(expect.arrayContaining([
      'is:archived_at', 'neq:status=Done',
      'is:retracted_at', 'in:attention=Needs attention,Urgent',
    ]))
  })

  it('coalesces a null count to 0', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: null, error: null }, signals: { count: null, error: null } }, rec) as never,
    )
    expect(await getRailCounts()).toEqual({ openTasks: 0, attentionSignals: 0 })
  })

  it('throws when a count query errors (so the caller can drop the badges)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: null, error: { message: 'rls denied' } }, signals: { count: 2, error: null } }, rec) as never,
    )
    await expect(getRailCounts()).rejects.toThrow(/rail count failed/)
  })
})
