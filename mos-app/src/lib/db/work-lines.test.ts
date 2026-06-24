import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { listWorkLines } from './work-lines'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

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
    builder.is = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], orders: [] }
}

beforeEach(() => vi.clearAllMocks())

describe('listWorkLines', () => {
  it('returns rows with id, name, and type', async () => {
    const rec = freshRec()
    const rows = [
      { id: 'wl-1', name: 'Daily IG Content', type: 'process' as const },
      { id: 'wl-2', name: 'New Menu Design', type: 'project' as const },
    ]
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: rows, error: null }] }, rec) as never)

    const result = await listWorkLines()

    expect(result).toEqual(rows)
    expect(rec.fromTables).toContain('work_lines')
    expect(rec.selects).toContain('id,name,type')
  })

  it('filters archived (archived_at is null) and orders by name', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: [], error: null }] }, rec) as never)

    await listWorkLines()

    expect(rec.eqs).toContainEqual(['archived_at', null])
    expect(rec.orders).toContainEqual(['name', undefined])
  })

  it('includes type field (project | process) in the returned shape', async () => {
    const rec = freshRec()
    const rows = [
      { id: 'wl-3', name: 'Brand Refresh', type: 'project' as const },
    ]
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: rows, error: null }] }, rec) as never)

    const result = await listWorkLines()
    expect(result[0].type).toBe('project')
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: { message: 'wl boom' } }] }, rec) as never)

    await expect(listWorkLines()).rejects.toThrow(/listWorkLines failed — wl boom/)
  })

  it('returns empty array when data is null and no error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: null }] }, rec) as never)

    const result = await listWorkLines()
    expect(result).toEqual([])
  })
})
