import { describe, it, expect, vi, beforeEach } from 'vitest'

// The follow-ups data layer reaches mos via supabase.schema('mos').from(...). A single chainable
// recorder captures the query shape so we can assert it without a live Postgres (mirrors tasks.ts §8).
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { searchFollowUpsByCounterparty } from './follow-ups'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

interface Rec {
  from: string[]
  selects: string[]
  ilikes: Array<[string, unknown]>
  orders: Array<[string, unknown]>
  limits: number[]
}
function freshRec(): Rec {
  return { from: [], selects: [], ilikes: [], orders: [], limits: [] }
}

function mockSupabase(result: { data: unknown; error: unknown }, rec: Rec) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
  builder.ilike = vi.fn((c: string, v: unknown) => { rec.ilikes.push([c, v]); return builder })
  builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
  builder.limit = vi.fn((n: number) => { rec.limits.push(n); return builder })
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  schemaMock.mockImplementation(() => ({
    from: vi.fn((table: string) => { rec.from.push(`mos.${table}`); return builder }),
  }) as never)
}

beforeEach(() => vi.clearAllMocks())

// ── searchFollowUpsByCounterparty (⌘K palette read path, OD-REDESIGN-91 #4/B2) ──
describe('searchFollowUpsByCounterparty', () => {
  it('#B2: selects id,counterparty from mos.follow_ups ilike counterparty, newest-touched first, limited', async () => {
    const rec = freshRec()
    mockSupabase({ data: [{ id: 'f1', counterparty: 'Acme Corp' }], error: null }, rec)

    const rows = await searchFollowUpsByCounterparty('  acme  ', 5)
    expect(rows).toEqual([{ id: 'f1', counterparty: 'Acme Corp' }])
    expect(rec.from).toContain('mos.follow_ups')
    expect(rec.selects).toContain('id,counterparty')
    expect(rec.ilikes).toContainEqual(['counterparty', '%acme%'])
    expect(rec.orders[0]).toEqual(['updated_at', { ascending: false }])
    expect(rec.limits).toContain(5)
  })

  it('#B2: an empty/whitespace query short-circuits to [] without querying', async () => {
    const rec = freshRec()
    mockSupabase({ data: [], error: null }, rec)
    expect(await searchFollowUpsByCounterparty('   ')).toEqual([])
    expect(rec.from).not.toContain('mos.follow_ups')
  })

  it('#B2: throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    mockSupabase({ data: null, error: { message: 'search boom' } }, rec)
    await expect(searchFollowUpsByCounterparty('x')).rejects.toThrow(
      /searchFollowUpsByCounterparty failed — search boom/,
    )
  })
})
