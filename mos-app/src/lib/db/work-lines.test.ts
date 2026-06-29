import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  listWorkLines, listWorkLinesAll, createWorkLine, renameWorkLine, setWorkLineArchived,
} from './work-lines'
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

describe('listWorkLinesAll (management)', () => {
  it('selects archived_at and orders archived-first then name', async () => {
    const rec = freshRec()
    const rows = [
      { id: 'wl-1', name: 'Active', type: 'project', archived_at: null },
      { id: 'wl-2', name: 'Gone', type: 'process', archived_at: '2026-06-01T00:00:00Z' },
    ]
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: rows, error: null }] }, rec) as never)

    const result = await listWorkLinesAll()

    expect(result).toEqual(rows)
    expect(rec.selects).toContain('id,name,type,archived_at')
    expect(rec.orders).toContainEqual(['archived_at', { nullsFirst: true }])
    expect(rec.orders).toContainEqual(['name', undefined])
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: { message: 'boom' } }] }, rec) as never)
    await expect(listWorkLinesAll()).rejects.toThrow(/listWorkLinesAll failed — boom/)
  })
})

describe('createWorkLine', () => {
  it('inserts name + type, never sends org_id, returns the new row', async () => {
    const rec = freshRec()
    const row = { id: 'wl-9', name: 'New', type: 'project', archived_at: null }
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: row, error: null }] }, rec) as never)

    const result = await createWorkLine('New', 'project')

    expect(result).toEqual(row)
    expect(rec.inserts).toEqual([{ name: 'New', type: 'project' }])
    expect(rec.inserts[0]).not.toHaveProperty('org_id')
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: { message: 'denied' } }] }, rec) as never)
    await expect(createWorkLine('X', 'process')).rejects.toThrow(/createWorkLine failed — denied/)
  })
})

describe('renameWorkLine', () => {
  it('updates name by id (no type change — FR-014)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: null }] }, rec) as never)

    await renameWorkLine('wl-1', 'Renamed')

    expect(rec.updates).toEqual([{ name: 'Renamed' }])
    expect(rec.eqs).toContainEqual(['id', 'wl-1'])
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: { message: 'nope' } }] }, rec) as never)
    await expect(renameWorkLine('wl-1', 'X')).rejects.toThrow(/renameWorkLine failed — nope/)
  })
})

describe('setWorkLineArchived', () => {
  it('sets archived_at to a timestamp when archiving', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: null }] }, rec) as never)

    await setWorkLineArchived('wl-1', true)

    expect(rec.eqs).toContainEqual(['id', 'wl-1'])
    const payload = rec.updates[0] as { archived_at: string | null }
    expect(typeof payload.archived_at).toBe('string')
  })

  it('clears archived_at to null when unarchiving', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: null }] }, rec) as never)

    await setWorkLineArchived('wl-1', false)

    expect(rec.updates).toEqual([{ archived_at: null }])
  })
})
