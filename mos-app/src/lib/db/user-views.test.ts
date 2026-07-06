// DAL tests for mos.user_views (AC-UV-014). Adapted from the sibling internal project's
// db/userViews.ts tests; mirrors the tasks.test.ts recorder pattern (mock supabase.schema).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  listUserViews, getUserView, createUserView, updateUserView, archiveUserView,
} from './user-views'
import { supabase } from '@/lib/supabase'
import type { CompositionSpec } from '@/lib/viewspec/types'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness (mirrors tasks.test.ts's makeSchema) ──────────────────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  isCalls: Array<[string, unknown]>
  inserts: unknown[]
  updates: unknown[]
  orders: Array<[string, unknown]>
}
function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], isCalls: [], inserts: [], updates: [], orders: [] }
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
    builder.insert = vi.fn((rows: unknown) => { rec.inserts.push(rows); return builder })
    builder.update = vi.fn((patch: unknown) => { rec.updates.push(patch); return builder })
    builder.eq = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.is = vi.fn((c: string, v: unknown) => { rec.isCalls.push([c, v]); return builder })
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.maybeSingle = vi.fn(() => Promise.resolve(result()))
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

const SAMPLE_SPEC: CompositionSpec = {
  version: 1,
  panels: [{ id: 'p1', primitive: 'DataTable', querySpec: { entity: 'objectives', select: ['id', 'name'] } }],
}

beforeEach(() => vi.clearAllMocks())

describe('listUserViews — AC-UV-014', () => {
  it('calls schema(mos).from(user_views), filters archived_at null, orders by updated_at desc, never sends org_id/owner_id', async () => {
    const rec = freshRec()
    const row = { id: 'v1', name: 'My view', spec: SAMPLE_SPEC, scope: 'private', created_at: 'a', updated_at: 'b', archived_at: null }
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: [row], error: null }] }, rec) as never)

    const rows = await listUserViews()

    expect(schemaMock).toHaveBeenCalledWith('mos')
    expect(rec.fromTables).toContain('user_views')
    expect(rec.selects.join(' ')).not.toMatch(/org_id|owner_id/)
    expect(rec.isCalls).toContainEqual(['archived_at', null])
    expect(rec.orders).toContainEqual(['updated_at', { ascending: false }])
    expect(rows).toEqual([row])
  })

  it('throws a contextful error on a PostgREST failure', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: null, error: { message: 'boom' } }] }, rec) as never)
    await expect(listUserViews()).rejects.toThrow(/listUserViews failed — boom/)
  })
})

describe('getUserView — AC-UV-014', () => {
  it('returns null when no row is found', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: null, error: null }] }, rec) as never)
    expect(await getUserView('nope')).toBeNull()
  })

  it('throws on a PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: null, error: { message: 'read boom' } }] }, rec) as never)
    await expect(getUserView('v1')).rejects.toThrow(/getUserView failed — read boom/)
  })
})

describe('createUserView — AC-UV-014', () => {
  it('inserts exactly { name, spec, scope } — never org_id/owner_id', async () => {
    const rec = freshRec()
    const created = { id: 'v1', name: 'My view', spec: SAMPLE_SPEC, scope: 'private', created_at: 'a', updated_at: 'a', archived_at: null }
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: created, error: null }] }, rec) as never)

    const out = await createUserView({ name: 'My view', spec: SAMPLE_SPEC, scope: 'private' })

    expect(out).toEqual(created)
    const payload = rec.inserts[0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['name', 'scope', 'spec'])
    expect(payload).not.toHaveProperty('org_id')
    expect(payload).not.toHaveProperty('owner_id')
  })

  it('defaults scope to private when omitted', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: { id: 'v1' }, error: null }] }, rec) as never)
    await createUserView({ name: 'X', spec: SAMPLE_SPEC })
    expect((rec.inserts[0] as Record<string, unknown>).scope).toBe('private')
  })

  it('throws on a PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: null, error: { message: 'insert boom' } }] }, rec) as never)
    await expect(createUserView({ name: 'X', spec: SAMPLE_SPEC })).rejects.toThrow(/createUserView failed — insert boom/)
  })
})

describe('updateUserView — AC-UV-014', () => {
  it('sends { name, spec, scope, updated_at } — never org_id/owner_id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: null, error: null }] }, rec) as never)
    await updateUserView('v1', { name: 'Renamed', spec: SAMPLE_SPEC, scope: 'shared_team' })
    const payload = rec.updates[0] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['name', 'scope', 'spec', 'updated_at'].sort())
    expect(payload).not.toHaveProperty('org_id')
    expect(payload).not.toHaveProperty('owner_id')
    expect(rec.eqs).toContainEqual(['id', 'v1'])
  })

  it('throws on a PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: null, error: { message: 'update boom' } }] }, rec) as never)
    await expect(updateUserView('v1', { name: 'X', spec: SAMPLE_SPEC })).rejects.toThrow(/updateUserView failed — update boom/)
  })
})

describe('archiveUserView — AC-UV-014', () => {
  it('sets archived_at + updated_at, filters by id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: null, error: null }] }, rec) as never)
    await archiveUserView('v1')
    const payload = rec.updates[0] as Record<string, unknown>
    expect(payload.archived_at).not.toBeNull()
    expect(payload.updated_at).not.toBeNull()
    expect(rec.eqs).toContainEqual(['id', 'v1'])
  })

  it('throws on a PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ user_views: [{ data: null, error: { message: 'archive boom' } }] }, rec) as never)
    await expect(archiveUserView('v1')).rejects.toThrow(/archiveUserView failed — archive boom/)
  })
})
