import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  listWorkLines, listWorkLinesAll, createWorkLine, renameWorkLine, setWorkLineArchived, setWorkLineType,
  readWorkLine, updateWorkLine,
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
    builder.maybeSingle = vi.fn(() => builder)
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
    expect(rec.selects).toContain('id,name,type,objective_id')
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
    expect(rec.selects).toContain('id,name,type,objective_id,archived_at,business_unit_id,accountable_person_id')
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

  it('carries unit and Accountable person when given (#801)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: {}, error: null }] }, rec) as never)

    await createWorkLine('Kitchen Opening', 'process', { business_unit_id: 'bu-1', accountable_person_id: 'p-1' })

    expect(rec.inserts).toEqual([{ name: 'Kitchen Opening', type: 'process', business_unit_id: 'bu-1', accountable_person_id: 'p-1' }])
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: { message: 'denied' } }] }, rec) as never)
    await expect(createWorkLine('X', 'process')).rejects.toThrow(/createWorkLine failed — denied/)
  })
})

describe('setWorkLineType', () => {
  it('updates type by id — the lock once a run exists is the database\'s (#801)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: null }] }, rec) as never)

    await setWorkLineType('wl-1', 'process')

    expect(rec.updates).toEqual([{ type: 'process' }])
    expect(rec.eqs).toContainEqual(['id', 'wl-1'])
  })

  it('surfaces the refusal', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: { message: 'type is locked once an occurrence exists' } }] }, rec) as never)
    await expect(setWorkLineType('wl-1', 'project')).rejects.toThrow(/setWorkLineType failed — type is locked/)
  })
})

describe('renameWorkLine', () => {
  it('updates name by id', async () => {
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

describe('readWorkLine (#806 — record surface)', () => {
  it('returns the full record row for a known id', async () => {
    const rec = freshRec()
    const row = {
      id: 'wl-1', name: 'Brand Refresh', type: 'project',
      objective_id: 'ob-1', business_unit_id: 'bu-1',
      accountable_person_id: 'p-1', responsible_person_id: 'p-2',
      archived_at: null, updated_at: '2026-09-01T00:00:00Z',
    }
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: row, error: null }] }, rec) as never)

    const result = await readWorkLine('wl-1')

    expect(result).toEqual(row)
    expect(rec.eqs).toContainEqual(['id', 'wl-1'])
    expect(rec.selects).toContain('id,name,type,objective_id,business_unit_id,accountable_person_id,responsible_person_id,archived_at,updated_at')
  })

  it('resolves to null for an unknown id (maybeSingle returns null data + null error)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: null }] }, rec) as never)

    const result = await readWorkLine('wl-missing')

    // The caller renders a not-found INSIDE the record frame; null means the read
    // succeeded and there is no such row visible to the viewer — never an error.
    expect(result).toBeNull()
  })

  it('throws on a non-null PostgREST error (never swallows RLS refusals)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: { message: 'perm denied' } }] }, rec) as never)

    await expect(readWorkLine('wl-1')).rejects.toThrow(/readWorkLine failed — perm denied/)
  })
})

describe('updateWorkLine (#806 — record edits)', () => {
  it('patches only the fields the caller sends (Details tab Saving/Saved is per-field)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: null }] }, rec) as never)

    await updateWorkLine('wl-1', { objective_id: 'ob-2' })

    // No org_id (the DB stamps it), no other field the viewer didn't touch —
    // any extra key here would let a stale edit race clobber a concurrent one.
    expect(rec.updates).toEqual([{ objective_id: 'ob-2' }])
    expect(rec.eqs).toContainEqual(['id', 'wl-1'])
  })

  it('accepts all five patchable fields (name · unit · accountable · responsible · objective)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: null }] }, rec) as never)

    await updateWorkLine('wl-1', {
      name: 'Renamed',
      business_unit_id: 'bu-2',
      accountable_person_id: 'p-3',
      responsible_person_id: 'p-4',
      objective_id: 'ob-9',
    })

    expect(rec.updates).toEqual([{
      name: 'Renamed',
      business_unit_id: 'bu-2',
      accountable_person_id: 'p-3',
      responsible_person_id: 'p-4',
      objective_id: 'ob-9',
    }])
  })

  it('surfaces the DB refusal so the record can show its Saving error state', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ work_lines: [{ data: null, error: { message: 'row-level security' } }] }, rec) as never)

    // The DB is the authority (NFR-004); the client mirror `canManageDefinition` merely
    // hides the affordance for a viewer whose write would 42501 anyway.
    await expect(updateWorkLine('wl-1', { name: 'X' })).rejects.toThrow(/updateWorkLine failed — row-level security/)
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
