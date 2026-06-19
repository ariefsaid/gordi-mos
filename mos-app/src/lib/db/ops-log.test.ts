import { describe, it, expect, vi, beforeEach } from 'vitest'

// The ops data layer reaches ops via supabase.schema('ops').from('log_entries').
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import {
  listLogEntries, addLogEntry, editLogEntry,
  archiveLogEntry, unarchiveLogEntry, getTodayOpsSummary,
} from './ops-log'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness (mirrors tasks.test.ts) ───────────────────────────────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  inserts: unknown[]
  updates: unknown[]
  deletes: string[]
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
    builder.insert = vi.fn((rows: unknown) => { rec.inserts.push(rows); return builder })
    builder.update = vi.fn((patch: unknown) => { rec.updates.push(patch); return builder })
    builder.delete = vi.fn(() => { rec.deletes.push(table); return builder })
    builder.eq = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.is = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.gte = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.lt = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.maybeSingle = vi.fn(() => Promise.resolve(result()))
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], inserts: [], updates: [], deletes: [], orders: [] }
}

beforeEach(() => vi.clearAllMocks())

// Neither a filter nor an inserted/updated payload may carry org_id or created_by (RLS stamps them).
function noServerStamps(rec: Recorder) {
  expect(rec.eqs.filter(([c]) => c === 'org_id')).toHaveLength(0)
  const payloads = [...rec.inserts, ...rec.updates].flat()
  for (const p of payloads) {
    if (p && typeof p === 'object') {
      expect(Object.keys(p)).not.toContain('org_id')
      expect(Object.keys(p)).not.toContain('created_by')
    }
  }
}

describe('listLogEntries', () => {
  it('default: filters non-archived, orders occurred_at desc, no org_id filter, no FK embed (NFR-006)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ log_entries: [{ data: [], error: null }] }, rec) as never)

    await listLogEntries({})

    expect(rec.fromTables).toContain('log_entries')
    // archived hidden by default
    expect(rec.eqs).toContainEqual(['archived_at', null])
    // newest first
    expect(rec.orders).toContainEqual(['occurred_at', { ascending: false }])
    // never an explicit org filter
    expect(rec.eqs.filter(([c]) => c === 'org_id')).toHaveLength(0)
    // no cross-schema embed — every select string must be embed-free (no parentheses)
    for (const s of rec.selects) expect(s).not.toContain('(')
  })

  it('with filters: adds business_unit_id + event_type eqs and OMITS the archived predicate when includeArchived', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ log_entries: [{ data: [], error: null }] }, rec) as never)

    await listLogEntries({ businessUnitId: 'bu-1', eventType: 'qc', includeArchived: true })

    expect(rec.eqs).toContainEqual(['business_unit_id', 'bu-1'])
    expect(rec.eqs).toContainEqual(['event_type', 'qc'])
    expect(rec.eqs.filter(([c]) => c === 'archived_at')).toHaveLength(0)
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ log_entries: [{ data: null, error: { message: 'boom' } }] }, rec) as never,
    )
    await expect(listLogEntries({})).rejects.toThrow(/listLogEntries failed/)
  })
})

describe('addLogEntry', () => {
  it('AC-072: addLogEntry dispatches needs_attention/occurred_at/linked_task_id, never org_id/created_by', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ log_entries: [{ data: { id: 'new-id' }, error: null }] }, rec) as never,
    )

    const id = await addLogEntry({
      businessUnitId: 'bu-1',
      eventType: 'follow_up',
      title: 'logged it',
      detail: 'machine #R-882',
      occurredAt: '2026-06-12T01:00:00.000Z',
      needsAttention: true,
      linkedTaskId: 'task-9',
    })

    expect(id).toBe('new-id')
    const payload = rec.inserts[0] as Record<string, unknown>
    expect(payload.business_unit_id).toBe('bu-1')
    expect(payload.event_type).toBe('follow_up')
    expect(payload.title).toBe('logged it')
    expect(payload.detail).toBe('machine #R-882')
    expect(payload.occurred_at).toBe('2026-06-12T01:00:00.000Z')
    expect(payload.needs_attention).toBe(true)
    expect(payload.linked_task_id).toBe('task-9')
    expect(payload.origin).toBe('manual')
    // server-stamped fields are NEVER sent by the client (NFR-002)
    expect(Object.keys(payload)).not.toContain('org_id')
    expect(Object.keys(payload)).not.toContain('created_by')
    noServerStamps(rec)
  })

  it('omits occurred_at when not provided (DB default now()), defaults optional fields', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ log_entries: [{ data: { id: 'x' }, error: null }] }, rec) as never,
    )
    await addLogEntry({ businessUnitId: 'bu-1', eventType: 'other', title: 'minimal' })
    const payload = rec.inserts[0] as Record<string, unknown>
    expect(Object.keys(payload)).not.toContain('occurred_at')
    expect(payload.needs_attention).toBe(false)
    expect(payload.linked_task_id).toBeNull()
    expect(payload.detail).toBeNull()
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ log_entries: [{ data: null, error: { message: 'nope' } }] }, rec) as never,
    )
    await expect(
      addLogEntry({ businessUnitId: 'bu', eventType: 'other', title: 't' }),
    ).rejects.toThrow(/addLogEntry failed/)
  })
})

describe('edit / archive', () => {
  it('editLogEntry maps camelCase input → snake_case columns, updates by id', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ log_entries: [{ data: null, error: null }] }, rec) as never)
    // The form hands editLogEntry the SAME camelCase payload it hands addLogEntry;
    // the data layer is the snake/camel boundary (playbook §8) and must map before .update().
    await editLogEntry('e-1', {
      businessUnitId: 'bu-1',
      eventType: 'qc',
      title: 'new',
      detail: 'd',
      occurredAt: '2026-06-12T03:00:00.000Z',
      needsAttention: false,
      linkedTaskId: 'task-9',
    })
    expect(rec.updates[0]).toEqual({
      business_unit_id: 'bu-1',
      event_type: 'qc',
      title: 'new',
      detail: 'd',
      occurred_at: '2026-06-12T03:00:00.000Z',
      needs_attention: false,
      linked_task_id: 'task-9',
    })
    expect(rec.eqs).toContainEqual(['id', 'e-1'])
    noServerStamps(rec)
  })

  it('editLogEntry maps only the keys provided (partial patch; explicit null clears link)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ log_entries: [{ data: null, error: null }] }, rec) as never)
    await editLogEntry('e-1', { title: 'just title', linkedTaskId: null })
    expect(rec.updates[0]).toEqual({ title: 'just title', linked_task_id: null })
  })

  it('archiveLogEntry sets archived_at to an ISO instant', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ log_entries: [{ data: null, error: null }] }, rec) as never)
    await archiveLogEntry('e-1')
    const patch = rec.updates[0] as Record<string, unknown>
    expect(typeof patch.archived_at).toBe('string')
    expect(new Date(patch.archived_at as string).toISOString()).toBe(patch.archived_at)
    expect(rec.eqs).toContainEqual(['id', 'e-1'])
  })

  it('unarchiveLogEntry clears archived_at to null', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ log_entries: [{ data: null, error: null }] }, rec) as never)
    await unarchiveLogEntry('e-1')
    expect(rec.updates[0]).toEqual({ archived_at: null })
  })
})

describe('getTodayOpsSummary', () => {
  it('AC-080/081: getTodayOpsSummary counts today and flags needs-attention', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema(
        {
          log_entries: [
            {
              data: [
                { needs_attention: false },
                { needs_attention: true },
                { needs_attention: false },
              ],
              error: null,
            },
          ],
        },
        rec,
      ) as never,
    )

    // 2026-06-12T03:00:00Z = 10:00 WIB 12 Jun → window [2026-06-11T17:00Z, 2026-06-12T17:00Z)
    const summary = await getTodayOpsSummary(new Date('2026-06-12T03:00:00Z'))

    expect(summary).toEqual({ count: 3, needsAttention: true })
    expect(rec.eqs).toContainEqual(['archived_at', null])
    expect(rec.eqs).toContainEqual(['occurred_at', '2026-06-11T17:00:00.000Z'])
    expect(rec.eqs).toContainEqual(['occurred_at', '2026-06-12T17:00:00.000Z'])
  })

  it('returns neutral summary when no entries', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ log_entries: [{ data: [], error: null }] }, rec) as never)
    const summary = await getTodayOpsSummary(new Date('2026-06-12T03:00:00Z'))
    expect(summary).toEqual({ count: 0, needsAttention: false })
  })

  it('throws on error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(
      makeSchema({ log_entries: [{ data: null, error: { message: 'fail' } }] }, rec) as never,
    )
    await expect(getTodayOpsSummary(new Date())).rejects.toThrow(/getTodayOpsSummary failed/)
  })
})
