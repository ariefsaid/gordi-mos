import { beforeEach, describe, expect, it, vi } from 'vitest'

const schemaMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/supabase', () => ({ supabase: { schema: schemaMock } }))

import { loadRecordHistory } from './record-history'

type Query = { schema: string; table: string; select?: string; filters: Array<[string, string, unknown]>; order: string[]; limit?: number; or?: string }

function install(responses: Record<string, unknown>, queries: Query[]) {
  schemaMock.mockImplementation((schema: string) => ({
    from(table: string) {
      const q: Query = { schema, table, filters: [], order: [] }
      queries.push(q)
      const b: Record<string, unknown> = {}
      b.select = vi.fn((c: string) => { q.select = c; return b })
      b.eq = vi.fn((c: string, v: unknown) => { q.filters.push(['eq', c, v]); return b })
      b.in = vi.fn((c: string, v: unknown) => { q.filters.push(['in', c, v]); return b })
      b.order = vi.fn((c: string, o?: { ascending: boolean }) => { q.order.push(`${c}:${o?.ascending === false ? 'desc' : 'asc'}`); return b })
      b.or = vi.fn((f: string) => { q.or = f; return b })
      b.limit = vi.fn((n: number) => { q.limit = n; return b })
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(responses[`${schema}.${table}`] ?? { data: [], error: null }).then(resolve)
      return b
    },
  }))
}

const row = (over: Record<string, unknown>) => ({
  id: 'h1', action: 'update', field_name: 'name', old_value: 'A', new_value: 'B',
  occurred_at: '2026-09-30T02:00:00Z', channel: 'app', actor: { full_name: 'Dewi Director' }, ...over,
})

describe('loadRecordHistory', () => {
  beforeEach(() => schemaMock.mockReset())

  it('reads only shared.record_history for this record, newest first', async () => {
    const queries: Query[] = []
    install({ 'shared.record_history': { data: [row({})], error: null } }, queries)
    const result = await loadRecordHistory('objectives', 'obj-1')
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({ schema: 'shared', table: 'record_history' })
    expect(queries[0].filters).toEqual(expect.arrayContaining([
      ['eq', 'schema_name', 'mos'], ['eq', 'table_name', 'objectives'], ['eq', 'record_key', 'obj-1'],
    ]))
    expect(queries[0].order).toEqual(['occurred_at:desc', 'id:desc'])
    expect(queries[0].limit).toBe(50)
    expect(result.entries).toEqual([{
      id: 'h1', action: 'update', field: 'name', oldValue: 'A', newValue: 'B',
      occurredAt: '2026-09-30T02:00:00Z', channel: 'app', actorName: 'Dewi Director',
    }])
  })

  it('an older page is a keyset filter on (occurred_at, id), never a bigger limit', async () => {
    const queries: Query[] = []
    install({ 'shared.record_history': { data: [row({ id: 'h9' })], error: null } }, queries)
    await loadRecordHistory('work_lines', 'wl-1', { occurredAt: '2026-09-29T00:00:10Z', id: 'h49' })
    expect(queries[0].or).toBe('occurred_at.lt.2026-09-29T00:00:10Z,and(occurred_at.eq.2026-09-29T00:00:10Z,id.lt.h49)')
    expect(queries[0].limit).toBe(50)
  })

  it('resolves reference values (including archived people) with one batch lookup per kind', async () => {
    const queries: Query[] = []
    install({
      'shared.record_history': { data: [
        row({ id: 'h1', field_name: 'accountable_person_id', old_value: 'p-old', new_value: 'p-new' }),
        row({ id: 'h2', field_name: 'business_unit_id', old_value: null, new_value: 'bu-1' }),
        row({ id: 'h3', field_name: 'objective_id', old_value: 'o-1', new_value: null }),
        row({ id: 'h4', field_name: 'name', old_value: 'p-old', new_value: 'x' }),
      ], error: null },
      'shared.people': { data: [{ id: 'p-old', full_name: 'Old Person' }, { id: 'p-new', full_name: 'New Person' }], error: null },
      'shared.business_units': { data: [{ id: 'bu-1', name: 'Retail Ops' }], error: null },
      'mos.objectives': { data: [{ id: 'o-1', name: 'Q3 Growth' }], error: null },
    }, queries)
    const { names } = await loadRecordHistory('work_lines', 'wl-1')
    expect(names.get('p-new')).toBe('New Person')
    expect(names.get('bu-1')).toBe('Retail Ops')
    expect(names.get('o-1')).toBe('Q3 Growth')
    const people = queries.find((q) => q.table === 'people')!
    expect(people.filters).toEqual([['in', 'id', ['p-old', 'p-new']]])
    expect(queries.filter((q) => q.table === 'people')).toHaveLength(1)
  })

  it('skips lookups when no reference field is present', async () => {
    const queries: Query[] = []
    install({ 'shared.record_history': { data: [row({})], error: null } }, queries)
    await loadRecordHistory('objectives', 'obj-1')
    expect(queries.map((q) => q.table)).toEqual(['record_history'])
  })

  it('falls back to a null actor and app channel defaults never invented', async () => {
    install({ 'shared.record_history': { data: [row({ actor: null })], error: null } }, [])
    const { entries } = await loadRecordHistory('objectives', 'obj-1')
    expect(entries[0].actorName).toBeNull()
  })

  it('throws on a read error so the UI can show its error state', async () => {
    install({ 'shared.record_history': { data: null, error: { message: 'boom' } } }, [])
    await expect(loadRecordHistory('objectives', 'obj-1')).rejects.toThrow(/history/)
  })
})
