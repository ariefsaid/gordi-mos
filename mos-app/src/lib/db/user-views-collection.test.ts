import { describe, it, expect, vi, beforeEach } from 'vitest'

// The collection-view DAL persists typed V3 Work views on the existing mos.user_views substrate.
// It talks to Supabase through supabase.schema('mos'); we mock that seam and assert the exact
// query shape (metadata filters, validate-before-DAL, RLS-safe insert) — no live database.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  listCollectionViews,
  getCollectionView,
  createCollectionView,
  renameCollectionView,
  archiveCollectionView,
} from './user-views-collection'
import type { CollectionViewInput } from './user-views-collection'
import type { CollectionViewSpec } from '@/lib/record-collection/collection-view-spec'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

// ── A valid Task collection spec fixture (distinct PIC/Supervisor, Business Unit — never Team). ──
const taskSpec: CollectionViewSpec = {
  kind: 'collection',
  version: 1,
  collectionId: 'tasks',
  domain: 'tasks',
  presentation: 'table',
  visibleFields: ['title', 'status', 'pic', 'supervisor', 'due', 'businessUnit'],
  query: {
    view: 'my-work',
    q: '',
    businessUnitId: 'bu-cafe',
    status: 'Open',
    picId: 'p-raka',
    supervisorId: 'p-sari',
    includeArchived: false,
    overdueOnly: false,
    occurrenceId: null,
  },
  sort: { field: 'due', direction: 'ascending' },
  grouping: { field: 'occurrence' },
  layout: { density: 'compact' },
}

// The raw snake_case row a PostgREST select returns for the spec above.
const taskRow = {
  id: 'view-1',
  name: 'My overdue café work',
  scope: 'private',
  kind: 'collection',
  context: 'work',
  lifecycle: 'active',
  spec: taskSpec,
  created_at: '2026-07-20T02:00:00Z',
  updated_at: '2026-07-20T03:00:00Z',
  archived_at: null,
}

// ── Chainable Supabase query-builder mock ────────────────────────────────────────
// Every filter method returns the builder; the builder is thenable (terminal await after .order()
// / .eq()), and single()/maybeSingle() resolve the configured result. Calls are recorded so tests
// assert the query shape rather than the mock's plumbing.
interface Recorder {
  table: string | null
  insertPayload: unknown
  updatePayload: unknown
  eqCalls: Array<[string, unknown]>
  isCalls: Array<[string, unknown]>
  orderCalls: Array<[string, unknown]>
}

function makeMosSchema(result: { data: unknown; error: unknown }, rec: Recorder) {
  const fromImpl = (table: string) => {
    rec.table = table
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.insert = vi.fn((payload: unknown) => {
      rec.insertPayload = payload
      return builder
    })
    builder.update = vi.fn((payload: unknown) => {
      rec.updatePayload = payload
      return builder
    })
    builder.eq = vi.fn((col: string, val: unknown) => {
      rec.eqCalls.push([col, val])
      return builder
    })
    builder.is = vi.fn((col: string, val: unknown) => {
      rec.isCalls.push([col, val])
      return builder
    })
    builder.order = vi.fn((col: string, opts: unknown) => {
      rec.orderCalls.push([col, opts])
      return builder
    })
    builder.single = vi.fn(() => Promise.resolve(result))
    builder.maybeSingle = vi.fn(() => Promise.resolve(result))
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function recorder(): Recorder {
  return { table: null, insertPayload: null, updatePayload: null, eqCalls: [], isCalls: [], orderCalls: [] }
}

beforeEach(() => vi.clearAllMocks())

// ── listCollectionViews ──────────────────────────────────────────────────────────
describe('listCollectionViews', () => {
  it('reads only live Work collection rows for the requested collection, newest first, and maps to the typed record', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: [taskRow], error: null }, rec) as never)

    const result = await listCollectionViews('tasks')

    expect(schemaMock).toHaveBeenCalledWith('mos')
    expect(rec.table).toBe('user_views')
    // Metadata filters that pin the partial-index hot path: collection kind, work context, active.
    expect(rec.eqCalls).toContainEqual(['kind', 'collection'])
    expect(rec.eqCalls).toContainEqual(['context', 'work'])
    expect(rec.eqCalls).toContainEqual(['lifecycle', 'active'])
    expect(rec.eqCalls).toContainEqual(['spec->>collectionId', 'tasks'])
    expect(rec.isCalls).toContainEqual(['archived_at', null])
    expect(rec.orderCalls).toContainEqual(['updated_at', { ascending: false }])
    // snake_case → typed camelCase PersistedCollectionView.
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'view-1',
      name: 'My overdue café work',
      scope: 'private',
      kind: 'collection',
      context: 'work',
      lifecycle: 'active',
      spec: taskSpec,
      createdAt: '2026-07-20T02:00:00Z',
      updatedAt: '2026-07-20T03:00:00Z',
      archivedAt: null,
    })
  })

  it('returns [] when the caller has no visible collection views', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: [], error: null }, rec) as never)
    expect(await listCollectionViews('signals')).toEqual([])
  })

  it('throws on a PostgREST error', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: null, error: { message: 'rls denied' } }, rec) as never)
    await expect(listCollectionViews('tasks')).rejects.toThrow(/rls denied/)
  })
})

// ── getCollectionView ──────────────────────────────────────────────────────────
describe('getCollectionView', () => {
  it('fetches one collection row by id and maps it to the typed record', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: taskRow, error: null }, rec) as never)

    const result = await getCollectionView('view-1')

    expect(rec.eqCalls).toContainEqual(['id', 'view-1'])
    expect(rec.eqCalls).toContainEqual(['kind', 'collection'])
    expect(result?.id).toBe('view-1')
    expect(result?.spec).toEqual(taskSpec)
  })

  it('returns null when the row is not found or not visible', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: null, error: null }, rec) as never)
    expect(await getCollectionView('missing')).toBeNull()
  })

  it('throws on a PostgREST error', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: null, error: { message: 'boom' } }, rec) as never)
    await expect(getCollectionView('view-1')).rejects.toThrow(/boom/)
  })
})

// ── createCollectionView ──────────────────────────────────────────────────────────
describe('createCollectionView', () => {
  it('validates the spec, stamps the metadata tuple, never sends org_id/owner_id, and maps the result', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: taskRow, error: null }, rec) as never)

    const input: CollectionViewInput = { name: 'My overdue café work', scope: 'private', spec: taskSpec }
    const result = await createCollectionView(input)

    const payload = rec.insertPayload as Record<string, unknown>
    expect(payload.name).toBe('My overdue café work')
    expect(payload.scope).toBe('private')
    expect(payload.spec).toEqual(taskSpec)
    expect(payload.kind).toBe('collection')
    expect(payload.context).toBe('work')
    expect(payload.lifecycle).toBe('active')
    // RLS stamps identity — the client must never send these (AC-UV-014 discipline).
    expect(payload).not.toHaveProperty('org_id')
    expect(payload).not.toHaveProperty('owner_id')
    expect(result.id).toBe('view-1')
  })

  it('rejects an invalid spec BEFORE any database call (validate-before-DAL)', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: taskRow, error: null }, rec) as never)

    // A Task view carrying a Team visible field is rejected pre-Issue-8 — it must never reach INSERT.
    const badSpec = {
      ...taskSpec,
      visibleFields: [...taskSpec.visibleFields, 'team'],
    } as unknown as CollectionViewSpec

    await expect(
      createCollectionView({ name: 'bad', scope: 'private', spec: badSpec }),
    ).rejects.toThrow(/team/i)
    expect(schemaMock).not.toHaveBeenCalled()
  })

  it('throws on a PostgREST error', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: null, error: { message: 'insert failed' } }, rec) as never)
    await expect(
      createCollectionView({ name: 'x', scope: 'private', spec: taskSpec }),
    ).rejects.toThrow(/insert failed/)
  })
})

// ── renameCollectionView ──────────────────────────────────────────────────────────
describe('renameCollectionView', () => {
  it('updates only the name (and updated_at) for the given id', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: null, error: null }, rec) as never)

    await renameCollectionView('view-1', 'Renamed view')

    const payload = rec.updatePayload as Record<string, unknown>
    expect(payload.name).toBe('Renamed view')
    expect(payload).toHaveProperty('updated_at')
    expect(payload).not.toHaveProperty('kind')
    expect(payload).not.toHaveProperty('context')
    expect(rec.eqCalls).toContainEqual(['id', 'view-1'])
  })

  it('throws on a PostgREST error', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: null, error: { message: 'rename failed' } }, rec) as never)
    await expect(renameCollectionView('view-1', 'x')).rejects.toThrow(/rename failed/)
  })
})

// ── archiveCollectionView ──────────────────────────────────────────────────────────
describe('archiveCollectionView', () => {
  it('soft-archives by setting lifecycle=archived + archived_at + updated_at', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: null, error: null }, rec) as never)

    await archiveCollectionView('view-1')

    const payload = rec.updatePayload as Record<string, unknown>
    expect(payload.lifecycle).toBe('archived')
    expect(payload).toHaveProperty('archived_at')
    expect(payload.archived_at).not.toBeNull()
    expect(payload).toHaveProperty('updated_at')
    expect(rec.eqCalls).toContainEqual(['id', 'view-1'])
  })

  it('throws on a PostgREST error', async () => {
    const rec = recorder()
    schemaMock.mockReturnValue(makeMosSchema({ data: null, error: { message: 'archive failed' } }, rec) as never)
    await expect(archiveCollectionView('view-1')).rejects.toThrow(/archive failed/)
  })
})
