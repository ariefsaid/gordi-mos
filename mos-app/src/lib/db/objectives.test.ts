import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  listObjectives, listObjectivesAll, createObjective, renameObjective, setObjectiveArchived,
  readObjective, updateObjective,
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
    expect(rec.selects).toContain('id,name,archived_at,business_unit_id,accountable_person_id,period_year')
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

  it('carries unit, owner and year when given (#801)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: {}, error: null }] }, rec) as never)

    await createObjective('Kitchen Waste Down', { business_unit_id: 'bu-1', accountable_person_id: 'p-1', period_year: 2026 })

    expect(rec.inserts).toEqual([{ name: 'Kitchen Waste Down', business_unit_id: 'bu-1', accountable_person_id: 'p-1', period_year: 2026 }])
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

describe('readObjective (#813 — record surface)', () => {
  it('returns the full record row for a known id', async () => {
    const rec = freshRec()
    const row = {
      id: 'obj-1', name: 'Grow revenue', archived_at: null,
      business_unit_id: 'bu-1', accountable_person_id: 'p-1', period_year: 2026,
      description: 'The one we committed to.', updated_at: '2026-09-01T00:00:00Z',
    }
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: row, error: null }] }, rec) as never)

    const result = await readObjective('obj-1')

    expect(result).toEqual(row)
    expect(rec.eqs).toContainEqual(['id', 'obj-1'])
    expect(rec.selects).toContain(
      'id,name,archived_at,business_unit_id,accountable_person_id,period_year,description,updated_at',
    )
  })

  it('resolves to null for an unknown id (maybeSingle returns null data + null error)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: null }] }, rec) as never)

    const result = await readObjective('obj-missing')

    // The caller renders a not-found INSIDE the record frame; null means the read
    // succeeded and there is no such row visible to the viewer — never an error.
    expect(result).toBeNull()
  })

  it('throws on a non-null PostgREST error (never swallows RLS refusals)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: { message: 'perm denied' } }] }, rec) as never)

    await expect(readObjective('obj-1')).rejects.toThrow(/readObjective failed — perm denied/)
  })
})

describe('updateObjective (#813 — record edits)', () => {
  it('patches only the fields the caller sends (Details tab Saving/Saved is per-field)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: null }] }, rec) as never)

    await updateObjective('obj-1', { period_year: 2027 })

    expect(rec.updates).toEqual([{ period_year: 2027 }])
    expect(rec.eqs).toContainEqual(['id', 'obj-1'])
  })

  it('accepts all five patchable fields (name · unit · accountable · year · description)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: null }] }, rec) as never)

    await updateObjective('obj-1', {
      name: 'Renamed',
      business_unit_id: 'bu-2',
      accountable_person_id: 'p-3',
      period_year: 2027,
      description: 'Refined.',
    })

    expect(rec.updates).toEqual([{
      name: 'Renamed',
      business_unit_id: 'bu-2',
      accountable_person_id: 'p-3',
      period_year: 2027,
      description: 'Refined.',
    }])
  })

  it('surfaces the DB refusal so the record can show its Saving error state', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ objectives: [{ data: null, error: { message: 'row-level security' } }] }, rec) as never)

    await expect(updateObjective('obj-1', { name: 'X' })).rejects.toThrow(/updateObjective failed — row-level security/)
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
