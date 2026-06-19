import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase module. directory.ts uses supabase.schema('shared') for BUs and people.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { getBusinessUnits, getPeople } from './directory'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

// ── Chainable mock builder ────────────────────────────────────────────────────
function makeSharedSchema(responses: Record<string, { data: unknown; error: unknown }>) {
  const fromImpl = (table: string) => {
    const result = responses[table] ?? { data: null, error: null }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
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
