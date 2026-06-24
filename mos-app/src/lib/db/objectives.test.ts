import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { listObjectives } from './objectives'
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

describe('listObjectives', () => {
  it('returns mapped rows with id and name', async () => {
    const rec = freshRec()
    const rows = [
      { id: 'obj-1', name: 'Alpha' },
      { id: 'obj-2', name: 'Beta' },
    ]
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: rows, error: null }] }, rec) as never)

    const result = await listObjectives()

    expect(result).toEqual(rows)
    expect(rec.fromTables).toContain('objectives')
    expect(rec.selects).toContain('id,name')
  })

  it('filters archived (archived_at is null) and orders by name', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: [], error: null }] }, rec) as never)

    await listObjectives()

    expect(rec.eqs).toContainEqual(['archived_at', null])
    expect(rec.orders).toContainEqual(['name', undefined])
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: { message: 'obj boom' } }] }, rec) as never)

    await expect(listObjectives()).rejects.toThrow(/listObjectives failed — obj boom/)
  })

  it('returns empty array when data is null and no error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: null }] }, rec) as never)

    const result = await listObjectives()
    expect(result).toEqual([])
  })
})
