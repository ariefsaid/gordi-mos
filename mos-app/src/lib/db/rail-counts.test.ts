import { describe, it, expect, vi, beforeEach } from 'vitest'

// getRailCounts reaches mos via supabase.schema('mos').from('tasks').select('*', {count,head}) then
// a chain of filter builders, awaited for { count, error }. Mock a chainable builder that records
// the table + filters and resolves a queued { count, error }.
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
    builder.or = vi.fn((value: string) => { rec.filters.push(`or:${value}`); return builder })
    return builder
  }
  return { from: vi.fn((table: string) => fromImpl(table)) }
}

function freshRec(): Rec { return { tables: [], selects: [], filters: [] } }

const TEAM_ID = '50000000-0000-0000-0000-000000000001'
const BU_ID = '60000000-0000-0000-0000-000000000001'

beforeEach(() => vi.clearAllMocks())

describe('getRailCounts — the one cheap rail aggregate', () => {
  it('returns no count without a viewer person id', async () => {
    expect(await getRailCounts()).toBeNull()
  })
  it('returns the open-task and attention-signal head counts', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: 11, error: null }, signals: { count: 3, error: null } }, rec) as never,
    )
    const counts = await getRailCounts('40000000-0000-0000-0000-000000000001')
    expect(counts).toEqual({ openTasks: 11 })
    expect(rec.tables).toEqual(['tasks'])
  })

  it('issues HEAD exact-count selects (no rows fetched)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: 1, error: null } }, rec) as never,
    )
    await getRailCounts('40000000-0000-0000-0000-000000000001')
    for (const [, opts] of rec.selects) {
      expect(opts).toEqual({ count: 'exact', head: true })
    }
  })

  it('scopes open tasks to non-archived + non-Done and to the viewer R/A filter', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: 0, error: null }, signals: { count: 0, error: null } }, rec) as never,
    )
    await getRailCounts('40000000-0000-0000-0000-000000000001')
    expect(rec.filters).toEqual(expect.arrayContaining([
      'is:archived_at', 'neq:status=Done',
      'or:responsible_person_id.eq.40000000-0000-0000-0000-000000000001,accountable_person_id.eq.40000000-0000-0000-0000-000000000001',
    ]))
  })

  it('AC-014: Team work count uses team ids plus the legacy BU fallback', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeClient({ tasks: { count: 4, error: null } }, rec) as never)
    await getRailCounts('40000000-0000-0000-0000-000000000001', 'team-work', [TEAM_ID], [BU_ID])
    expect(rec.filters).toContain(
      `or:team_id.in.(${TEAM_ID}),and(team_id.is.null,business_unit_id.in.(${BU_ID}))`,
    )
  })

  it('keeps a non-uuid id out of the or() filter string, the same guard personId gets', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeClient({ tasks: { count: 4, error: null } }, rec) as never)
    await getRailCounts(
      '40000000-0000-0000-0000-000000000001',
      'team-work',
      [TEAM_ID, 'team-cafe,responsible_person_id.not.is.null'],
      [BU_ID],
    )
    expect(rec.filters).toContain(
      `or:team_id.in.(${TEAM_ID}),and(team_id.is.null,business_unit_id.in.(${BU_ID}))`,
    )
  })

  it('reads zero rows rather than the org when no id survives the uuid guard', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeClient({ tasks: { count: 0, error: null } }, rec) as never)
    await getRailCounts('40000000-0000-0000-0000-000000000001', 'team-work', ['team-cafe'], ['bu-retail'])
    expect(rec.filters).toContain('in:id=')
    expect(rec.filters.some((f) => f.startsWith('or:'))).toBe(false)
  })

  it('coalesces a null count to 0', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: null, error: null } }, rec) as never,
    )
    expect(await getRailCounts('40000000-0000-0000-0000-000000000001')).toEqual({ openTasks: 0 })
  })

  it('throws when a count query errors (so the caller can drop the badges)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeClient({ tasks: { count: null, error: { message: 'rls denied' } } }, rec) as never,
    )
    await expect(getRailCounts('40000000-0000-0000-0000-000000000001')).rejects.toThrow(/rail count failed/)
  })
})
