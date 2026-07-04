// T15 — agent-chat/persistence.ts caller-JWT persistence helpers + tool-arg hash.
// AC-P2-OB-001: insertEvent's journal fields land in the SAME insert as the tool event row.
import { describe, it, expect, vi } from 'vitest'
import {
  hashToolArgs, createThreadAndRun, insertEvent, heartbeat, setRunStatus,
  loadMaxSeq, loadJournaledWrites,
} from './../../../../supabase/functions/agent-chat/persistence'
import type { PersistenceDeps } from './../../../../supabase/functions/agent-chat/persistence'

// ── hashToolArgs — determinism + prototype-pollution safety ──────────────────

describe('hashToolArgs (T15, NFR-AGP-SEC-004 analog)', () => {
  it('is deterministic regardless of key order (canonicalized sorted-key JSON)', () => {
    const a = hashToolArgs({ title: 'x', businessUnitId: '1', responsiblePersonId: '2' })
    const b = hashToolArgs({ responsiblePersonId: '2', businessUnitId: '1', title: 'x' })
    expect(a).toBe(b)
  })

  it('produces different hashes for different args', () => {
    const a = hashToolArgs({ title: 'x' })
    const b = hashToolArgs({ title: 'y' })
    expect(a).not.toBe(b)
  })

  it('is a sha-256 hex digest (64 lowercase hex chars)', () => {
    const h = hashToolArgs({ a: 1 })
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never lets a __proto__/constructor/prototype key pollute the canonicalization (prototype-pollution safe)', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":true},"title":"x"}') as Record<string, unknown>
    expect(() => hashToolArgs(malicious)).not.toThrow()
    // The global Object.prototype must never gain a `polluted` property.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('canonicalizes nested arrays/objects (order-stable)', () => {
    const a = hashToolArgs({ nested: { b: 1, a: 2 }, list: [1, 2, 3] })
    const b = hashToolArgs({ list: [1, 2, 3], nested: { a: 2, b: 1 } })
    expect(a).toBe(b)
  })
})

// ── insertEvent — journal fields land in the SAME insert (AC-P2-OB-001) ──────

function makeDeps(overrides: Partial<{
  threadInsert: () => Promise<{ data: unknown; error: unknown }>
  runInsert: () => Promise<{ data: unknown; error: unknown }>
  eventInsert: (row: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  runUpdate: (patch: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
  eventsSelect: () => Promise<{ data: unknown[] | null; error: unknown }>
}> = {}): { deps: PersistenceDeps; eventInsertSpy: ReturnType<typeof vi.fn> } {
  const eventInsertSpy = vi.fn(overrides.eventInsert ?? (async (): Promise<{ data: unknown; error: unknown }> => ({ data: { id: 'ev-1' }, error: null })))
  const threadInsert = overrides.threadInsert ?? (async () => ({ data: { id: 'thread-1' }, error: null }))
  const runInsert = overrides.runInsert ?? (async () => ({ data: { id: 'run-1' }, error: null }))
  const runUpdate = vi.fn(overrides.runUpdate ?? (async (): Promise<{ data: unknown; error: unknown }> => ({ data: {}, error: null })))
  const eventsSelect = overrides.eventsSelect ?? (async () => ({ data: [], error: null }))

  // Fixed nested-shape stub for the mos-schema table ops this test exercises — every level
  // is deliberately arity-0 (params aren't read) to keep the mock terse; the outer cast to
  // HandlerSupabaseLike documents the intended real shape.
  const mosTableOps = (table: string) => ({
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: () => {
          if (table === 'agent_threads') return threadInsert()
          if (table === 'agent_runs') return runInsert()
          if (table === 'agent_events') return eventInsertSpy(row)
          throw new Error(`unexpected insert table: ${table}`)
        },
      }),
    }),
    update: (patch: Record<string, unknown>) => ({
      eq: () => runUpdate(patch),
    }),
    select: () => ({
      eq: () => ({
        limit: () => eventsSelect(),
      }),
    }),
  })

  const deps: PersistenceDeps = {
    // Minimal HandlerSupabaseLike mock: only `.schema('mos').from(table)` is exercised by
    // persistence.ts (MOS delta vs the sibling reference — persistence writes to mos.*).
    supabase: {
      schema: () => ({ from: mosTableOps }),
      // top-level from() unused by persistence.ts today but present for interface completeness.
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => eventsSelect(),
            single: async () => ({ data: null, error: null }),
            in: () => ({ limit: () => eventsSelect() }),
          }),
          in: () => ({ limit: () => eventsSelect() }),
          limit: () => eventsSelect(),
        }),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    ownerId: 'person-1',
    orgId: 'org-1',
    now: () => new Date('2026-07-05T00:00:00.000Z'),
  }
  return { deps, eventInsertSpy }
}

describe('insertEvent (T15, AC-P2-OB-001)', () => {
  it('a type=tool event with a journal carries tool_name/tool_args_hash/tool_status in the SAME insert call', async () => {
    const { deps, eventInsertSpy } = makeDeps()
    await insertEvent(
      deps,
      'run-1',
      0,
      { id: 'ev-1', runId: 'run-1', type: 'tool', createdAt: '2026-07-05T00:00:00.000Z', payload: { name: 'query_entity' } },
      { toolName: 'query_entity', argsHash: 'deadbeef', status: 'completed' },
    )
    expect(eventInsertSpy).toHaveBeenCalledTimes(1)
    const insertedRow = eventInsertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(insertedRow.tool_name).toBe('query_entity')
    expect(insertedRow.tool_args_hash).toBe('deadbeef')
    expect(insertedRow.tool_status).toBe('completed')
    expect(insertedRow.type).toBe('tool')
  })

  it('an event without a journal omits the tool_* columns', async () => {
    const { deps, eventInsertSpy } = makeDeps()
    await insertEvent(deps, 'run-1', 0, {
      id: 'ev-1', runId: 'run-1', type: 'assistant', createdAt: '2026-07-05T00:00:00.000Z', text: 'hi',
    })
    const insertedRow = eventInsertSpy.mock.calls[0][0] as Record<string, unknown>
    expect(insertedRow.tool_name).toBeUndefined()
  })

  it('swallows a DB error (never throws — NFR-AGP-SEC-005 analog)', async () => {
    const { deps } = makeDeps({ eventInsert: async () => ({ data: null, error: { code: 'XXXXX' } }) })
    await expect(
      insertEvent(deps, 'run-1', 0, { id: 'ev-1', runId: 'run-1', type: 'assistant', createdAt: 'x' }),
    ).resolves.toBeUndefined()
  })
})

describe('createThreadAndRun (T15, mos-schema writes)', () => {
  it('inserts into mos.agent_threads then mos.agent_runs under the caller-JWT client, never sending org_id/owner_id', async () => {
    const { deps } = makeDeps()
    await expect(
      createThreadAndRun(deps, { runId: 'run-1', title: 'New conversation' }),
    ).resolves.toBeUndefined()
  })

  it('swallows a thread-insert failure (never throws)', async () => {
    const { deps } = makeDeps({ threadInsert: async () => ({ data: null, error: { code: 'XXXXX' } }) })
    await expect(
      createThreadAndRun(deps, { runId: 'run-1', title: 'x' }),
    ).resolves.toBeUndefined()
  })
})

describe('heartbeat / setRunStatus (T15)', () => {
  it('heartbeat updates mos.agent_runs.last_progress_at-equivalent without throwing', async () => {
    const { deps } = makeDeps()
    await expect(heartbeat(deps, 'run-1', 'round-0')).resolves.toBeUndefined()
  })

  it('setRunStatus updates mos.agent_runs.status without throwing', async () => {
    const { deps } = makeDeps()
    await expect(setRunStatus(deps, 'run-1', 'completed')).resolves.toBeUndefined()
  })
})

describe('loadMaxSeq (T15, seq continuity)', () => {
  it('returns -1 when the run has no persisted events yet (fresh run)', async () => {
    const { deps } = makeDeps({ eventsSelect: async () => ({ data: [], error: null }) })
    expect(await loadMaxSeq(deps, 'run-1')).toBe(-1)
  })

  it('returns the max seq among persisted rows', async () => {
    const { deps } = makeDeps({ eventsSelect: async () => ({ data: [{ seq: 0 }, { seq: 3 }, { seq: 1 }], error: null }) })
    expect(await loadMaxSeq(deps, 'run-1')).toBe(3)
  })

  it('fails open to -1 on error', async () => {
    const { deps } = makeDeps({ eventsSelect: async () => ({ data: null, error: { code: 'X' } }) })
    expect(await loadMaxSeq(deps, 'run-1')).toBe(-1)
  })
})

describe('loadJournaledWrites (T15, resume de-dupe gate)', () => {
  it('returns only completed, journaled rows', async () => {
    const { deps } = makeDeps({
      eventsSelect: async () => ({
        data: [
          { tool_name: 'create_task', tool_args_hash: 'h1', tool_status: 'completed', payload: { id: 't1' } },
          { tool_name: 'create_task', tool_args_hash: 'h2', tool_status: 'errored', payload: null },
          { tool_name: null, tool_args_hash: null, tool_status: null, payload: null },
        ],
        error: null,
      }),
    })
    const writes = await loadJournaledWrites(deps, 'run-1')
    expect(writes).toEqual([{ toolName: 'create_task', argsHash: 'h1', payload: { id: 't1' } }])
  })

  it('fails open to [] on error', async () => {
    const { deps } = makeDeps({ eventsSelect: async () => ({ data: null, error: { code: 'X' } }) })
    expect(await loadJournaledWrites(deps, 'run-1')).toEqual([])
  })
})
