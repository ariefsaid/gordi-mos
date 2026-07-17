import { describe, it, expect, vi, beforeEach } from 'vitest'

// The ops data layer reaches ops via supabase.schema('ops').from('log_entries').
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { getTodayOpsSummary } from './ops-log'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness (mirrors tasks.test.ts) ───────────────────────────────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  orders: Array<[string, unknown]>
}

function makeSchema(responses: Record<string, { data: unknown; error: unknown }[]>, rec: Recorder) {
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
    builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
    builder.eq = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.is = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.gte = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.lt = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.maybeSingle = vi.fn(() => Promise.resolve(result()))
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], orders: [] }
}

beforeEach(() => vi.clearAllMocks())

describe('getTodayOpsSummary', () => {
  it('AC-080/081: getTodayOpsSummary counts today and flags needs-attention', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          log_entries: [
            {
              data: [
                { needs_attention: false },
                { needs_attention: true },
                { needs_attention: false },
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )

    // 2026-06-12T03:00:00Z = 10:00 WIB 12 Jun → window [2026-06-11T17:00Z, 2026-06-12T17:00Z)
    const summary = await getTodayOpsSummary(new Date('2026-06-12T03:00:00Z'))

    expect(summary).toEqual({ count: 3, needsAttention: true })
    expect(rec.eqs).toContainEqual(['archived_at', null])
    expect(rec.eqs).toContainEqual(['occurred_at', '2026-06-11T17:00:00.000Z'])
    expect(rec.eqs).toContainEqual(['occurred_at', '2026-06-12T17:00:00.000Z'])
  })

  it('returns neutral summary when no entries', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ log_entries: [{ data: [], error: null }] }, rec) as never)
    const summary = await getTodayOpsSummary(new Date('2026-06-12T03:00:00Z'))
    expect(summary).toEqual({ count: 0, needsAttention: false })
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ log_entries: [{ data: null, error: { message: 'fail' } }] }, rec) as never,
    )
    await expect(getTodayOpsSummary(new Date())).rejects.toThrow(/getTodayOpsSummary failed/)
  })
})
