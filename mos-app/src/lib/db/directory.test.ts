import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase module. directory.ts uses supabase.schema('shared') for BUs and people.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { getBusinessUnits, getDownlinePersonIds, getPeople, searchPeopleByName } from './directory'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

// ── Chainable mock builder ────────────────────────────────────────────────────
function makeSharedSchema(
  responses: Record<string, { data: unknown; error: unknown }>,
  rec?: { isCalls: Array<[string, unknown]>; ilikes?: Array<[string, unknown]> },
) {
  const fromImpl = (table: string) => {
    const result = responses[table] ?? { data: null, error: null }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.is = vi.fn((col: string, val: unknown) => {
      rec?.isCalls.push([col, val])
      return builder
    })
    builder.ilike = vi.fn((col: string, val: unknown) => {
      rec?.ilikes?.push([col, val])
      return builder
    })
    builder.limit = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

beforeEach(() => vi.clearAllMocks())

// ── getBusinessUnits ──────────────────────────────────────────────────────────
describe('getBusinessUnits', () => {
  it('AC-C1-BU: reads from shared schema, returns id+name pairs ordered by name', async () => {
    const data = [
      { id: '20000000-0000-0000-0000-000000000001', name: 'Cafe Ops – General' },
      { id: '20000000-0000-0000-0000-000000000002', name: 'Kitchen and Bar' },
    ]
    schemaMock.mockReturnValue(makeSharedSchema({ business_units: { data, error: null } }) as never)

    const result = await getBusinessUnits()
    expect(result).toEqual(data)
    // Must use schema('shared')
    expect(schemaMock).toHaveBeenCalledWith('shared')
  })

  it('AC-C1-BU-err: throws on PostgREST error', async () => {
    schemaMock.mockReturnValue(
      makeSharedSchema({ business_units: { data: null, error: { message: 'db down' } } }) as never,
    )
    await expect(getBusinessUnits()).rejects.toThrow(/db down/)
  })

  it('AC-C1-BU-empty: returns empty array when no BUs exist', async () => {
    schemaMock.mockReturnValue(makeSharedSchema({ business_units: { data: [], error: null } }) as never)
    const result = await getBusinessUnits()
    expect(result).toEqual([])
  })

  it('AC-C1-BU-archived: filters out archived (legacy/retired) business units — the query excludes them server-side', async () => {
    const rec = { isCalls: [] as Array<[string, unknown]> }
    // The mock only returns the LIVE row (mirrors what `.is('archived_at', null)` would return
    // from a real archived_at-filtered query) — the assertion proves the filter was applied by
    // the query builder, not merely that the caller drops legacy rows client-side.
    const data = [
      { id: '20000000-0000-0000-0000-000000000014', name: 'Retail Ops' },
    ]
    schemaMock.mockReturnValue(
      makeSharedSchema({ business_units: { data, error: null } }, rec) as never,
    )

    const result = await getBusinessUnits()
    expect(result).toEqual(data)
    expect(rec.isCalls).toContainEqual(['archived_at', null])
  })
})

// ── getPeople ─────────────────────────────────────────────────────────────────
describe('getPeople', () => {
  it('AC-C1-P: reads from shared schema, returns id+full_name pairs for active people', async () => {
    const data = [
      { id: '40000000-0000-0000-0000-000000000001', full_name: 'Cahya Cafe' },
      { id: '40000000-0000-0000-0000-000000000002', full_name: 'Krishna Kitchen' },
    ]
    schemaMock.mockReturnValue(makeSharedSchema({ people: { data, error: null } }) as never)

    const result = await getPeople()
    expect(result).toEqual(data)
    // Must use schema('shared')
    expect(schemaMock).toHaveBeenCalledWith('shared')
  })

  it('AC-C1-P-err: throws on PostgREST error', async () => {
    schemaMock.mockReturnValue(
      makeSharedSchema({ people: { data: null, error: { message: 'rls denied' } } }) as never,
    )
    await expect(getPeople()).rejects.toThrow(/rls denied/)
  })

  it('AC-C1-P-empty: returns empty array when no people', async () => {
    schemaMock.mockReturnValue(makeSharedSchema({ people: { data: [], error: null } }) as never)
    const result = await getPeople()
    expect(result).toEqual([])
  })
})

// ── getDownlinePersonIds (AC-060 plumbing: who may the composer offer as PIC) ─────────────────
// Role tree: exec -> lead -> staff -> sub. viewer holds `lead`, so the downline is everyone
// holding staff or sub, walked through the role graph rather than the person graph.
describe('getDownlinePersonIds', () => {
  const roles = [
    { id: 'exec', reports_to_role_id: null },
    { id: 'lead', reports_to_role_id: 'exec' },
    { id: 'staff', reports_to_role_id: 'lead' },
    { id: 'staff2', reports_to_role_id: 'exec' },
    { id: 'sub', reports_to_role_id: 'staff' },
  ]
  const assignments = [
    { person_id: 'viewer', role_id: 'lead' },
    { person_id: 'author', role_id: 'staff' },
    { person_id: 'report', role_id: 'sub' },
    { person_id: 'dualhat', role_id: 'staff' },
    { person_id: 'dualhat', role_id: 'staff2' },
    { person_id: 'lead2holder', role_id: 'staff2' },
    { person_id: 'exec-holder', role_id: 'exec' },
  ]
  const schema = () => makeSharedSchema({
    person_roles: { data: assignments, error: null },
    roles: { data: roles, error: null },
  })

  it('AC-060: walks the role tree DOWN from the viewer\'s own role(s), across multiple hops', async () => {
    schemaMock.mockReturnValue(schema() as never)
    const result = await getDownlinePersonIds('viewer')
    expect(new Set(result)).toEqual(new Set(['author', 'report', 'dualhat']))
  })

  it('AC-060: a person is included once even if a downline role reaches them twice', async () => {
    schemaMock.mockReturnValue(schema() as never)
    const result = await getDownlinePersonIds('viewer')
    expect(result.filter((id) => id === 'dualhat')).toHaveLength(1)
  })

  it('AC-060: a leaf-role viewer with nobody reporting to them has an empty downline', async () => {
    schemaMock.mockReturnValue(schema() as never)
    const result = await getDownlinePersonIds('report')
    expect(result).toEqual([])
  })

  it('AC-060: a manager two levels up (exec) reaches the whole downline, not just direct reports', async () => {
    schemaMock.mockReturnValue(schema() as never)
    const result = await getDownlinePersonIds('exec-holder')
    expect(new Set(result)).toEqual(new Set(['viewer', 'author', 'report', 'dualhat', 'lead2holder']))
  })

  it('AC-060: throws on a PostgREST error from either query', async () => {
    schemaMock.mockReturnValue(makeSharedSchema({
      person_roles: { data: null, error: { message: 'rls denied' } },
      roles: { data: roles, error: null },
    }) as never)
    await expect(getDownlinePersonIds('viewer')).rejects.toThrow(/rls denied/)
  })
// ── searchPeopleByName (⌘K palette read path, #748) ───────────────────────
describe('searchPeopleByName', () => {
  const personRow = { id: '40000000-0000-0000-0000-000000000001', full_name: 'Cahya Cafe' }

  it('AC-C1-P-search: reads shared.people ilike full_name, active-only, limited — and escapes LIKE wildcards', async () => {
    const rec = { isCalls: [] as Array<[string, unknown]>, ilikes: [] as Array<[string, unknown]> }
    schemaMock.mockReturnValue(makeSharedSchema({ people: { data: [personRow], error: null } }, rec) as never)

    const result = await searchPeopleByName('cah')
    expect(result).toEqual([personRow])
    expect(schemaMock).toHaveBeenCalledWith('shared')
    expect(rec.isCalls).toContainEqual(['archived_at', null])
    expect(rec.ilikes).toContainEqual(['full_name', '%cah%'])
    // A wildcard in the query is escaped, so "50_" matches a literal underscore — not any char.
    await searchPeopleByName('50_')
    expect(rec.ilikes).toContainEqual(['full_name', '%50\\_%'])
  })

  it('AC-C1-P-search-err: throws on PostgREST error', async () => {
    schemaMock.mockReturnValue(
      makeSharedSchema({ people: { data: null, error: { message: 'rls denied' } } }) as never,
    )
    await expect(searchPeopleByName('cah')).rejects.toThrow(/searchPeopleByName failed — rls denied/)
  })

  it('AC-C1-P-search-empty: returns empty array when nothing matches', async () => {
    schemaMock.mockReturnValue(makeSharedSchema({ people: { data: [], error: null } }) as never)
    const result = await searchPeopleByName('nobody')
    expect(result).toEqual([])
  })
})
