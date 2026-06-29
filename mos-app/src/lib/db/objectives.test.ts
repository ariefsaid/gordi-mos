import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  listObjectives, listObjectivesAll, createObjective, renameObjective, setObjectiveArchived,
} from './objectives'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  orders: Array<[string, unknown]>
  inserts: unknown[]
  updates: unknown[]
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
    builder.eq = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.insert = vi.fn((p: unknown) => { rec.inserts.push(p); return builder })
    builder.update = vi.fn((p: unknown) => { rec.updates.push(p); return builder })
    builder.single = vi.fn(() => builder)
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], orders: [], inserts: [], updates: [] }
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

describe('listObjectivesAll (management)', () => {
  it('selects archived_at and orders archived-first then name', async () => {
    const rec = freshRec()
    const rows = [
      { id: 'o-1', name: 'Active', archived_at: null },
      { id: 'o-2', name: 'Gone', archived_at: '2026-06-01T00:00:00Z' },
    ]
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: rows, error: null }] }, rec) as never)

    const result = await listObjectivesAll()

    expect(result).toEqual(rows)
    expect(rec.selects).toContain('id,name,archived_at')
    expect(rec.orders).toContainEqual(['archived_at', { nullsFirst: true }])
    expect(rec.orders).toContainEqual(['name', undefined])
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: { message: 'boom' } }] }, rec) as never)
    await expect(listObjectivesAll()).rejects.toThrow(/listObjectivesAll failed — boom/)
  })
})

describe('createObjective', () => {
  it('inserts name, never sends org_id, returns the new row', async () => {
    const rec = freshRec()
    const row = { id: 'o-9', name: 'New', archived_at: null }
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: row, error: null }] }, rec) as never)

    const result = await createObjective('New')

    expect(result).toEqual(row)
    expect(rec.inserts).toEqual([{ name: 'New' }])
    expect(rec.inserts[0]).not.toHaveProperty('org_id')
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: { message: 'denied' } }] }, rec) as never)
    await expect(createObjective('X')).rejects.toThrow(/createObjective failed — denied/)
  })
})

describe('renameObjective', () => {
  it('updates name by id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: null }] }, rec) as never)

    await renameObjective('o-1', 'Renamed')

    expect(rec.updates).toEqual([{ name: 'Renamed' }])
    expect(rec.eqs).toContainEqual(['id', 'o-1'])
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: { message: 'nope' } }] }, rec) as never)
    await expect(renameObjective('o-1', 'X')).rejects.toThrow(/renameObjective failed — nope/)
  })
})

describe('setObjectiveArchived', () => {
  it('sets archived_at to a timestamp when archiving', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: null }] }, rec) as never)

    await setObjectiveArchived('o-1', true)

    expect(rec.eqs).toContainEqual(['id', 'o-1'])
    const payload = rec.updates[0] as { archived_at: string | null }
    expect(typeof payload.archived_at).toBe('string')
  })

  it('clears archived_at to null when unarchiving', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: null }] }, rec) as never)

    await setObjectiveArchived('o-1', false)

    expect(rec.updates).toEqual([{ archived_at: null }])
  })
})
