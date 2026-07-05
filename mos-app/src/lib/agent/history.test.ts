// T6 (P3a) — loadThreadForDisplay + listThreads: the client-side reconstruction of a persisted
// deputy thread for display. Mirrors useAssistantPanel's mergeEvent mapping (assistant text ->
// TranscriptItem) but reads from mos.agent_threads/agent_runs/agent_events (RLS-scoped, owner-only)
// instead of live SSE. AC-P3-RP-003.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase module: history.ts reaches mos via supabase.schema('mos').from(...).
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { loadThreadForDisplay, listThreads } from './history'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

/** A chainable query-builder recorder: each .from(table) returns a builder whose terminal
 *  awaited result is the queued response for that table. */
function makeSchema(responses: Record<string, { data: unknown; error: unknown }>) {
  const fromImpl = (table: string) => {
    const result = responses[table] ?? { data: null, error: null }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.limit = vi.fn(() => builder)
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

beforeEach(() => vi.clearAllMocks())

describe('loadThreadForDisplay (T6, AC-P3-RP-003)', () => {
  it("folds a thread's most-recent run's events into TranscriptItem[], binding the run id", async () => {
    schemaMock.mockReturnValue(
      makeSchema({
        agent_runs: { data: [{ id: 'run-2', created_at: '2026-07-05T00:00:00.000Z' }], error: null },
        agent_events: {
          data: [
            { id: 'e1', type: 'user', text: 'hello', payload: {} },
            { id: 'e2', type: 'assistant', text: 'hi there', payload: {} },
            { id: 'e3', type: 'status', text: null, payload: { status: 'completed' } },
          ],
          error: null,
        },
      }) as never,
    )

    const result = await loadThreadForDisplay('thread-1')

    expect(schemaMock).toHaveBeenCalledWith('mos')
    expect(result.activeRunId).toBe('run-2')
    expect(result.transcript).toEqual([
      { id: 'e1', role: 'user', text: 'hello' },
      { id: 'e2', role: 'assistant', text: 'hi there' },
    ])
  })

  it('returns an empty transcript + null activeRunId when the thread has no runs', async () => {
    schemaMock.mockReturnValue(makeSchema({ agent_runs: { data: [], error: null } }) as never)
    const result = await loadThreadForDisplay('thread-empty')
    expect(result.activeRunId).toBeNull()
    expect(result.transcript).toEqual([])
  })

  it('fails open to an empty transcript on a read error (never throws)', async () => {
    schemaMock.mockReturnValue(
      makeSchema({ agent_runs: { data: null, error: { message: 'boom' } } }) as never,
    )
    const result = await loadThreadForDisplay('thread-x')
    expect(result).toEqual({ activeRunId: null, transcript: [] })
  })
})

describe('listThreads (T7, AC-P3-RP-003 ThreadList)', () => {
  it("lists the owner's threads ordered updated_at desc", async () => {
    schemaMock.mockReturnValue(
      makeSchema({
        agent_threads: {
          data: [
            { id: 't2', title: 'Second', updated_at: '2026-07-05T01:00:00.000Z' },
            { id: 't1', title: 'First', updated_at: '2026-07-04T00:00:00.000Z' },
          ],
          error: null,
        },
      }) as never,
    )

    const threads = await listThreads()
    expect(schemaMock).toHaveBeenCalledWith('mos')
    expect(threads).toEqual([
      { id: 't2', title: 'Second', updated_at: '2026-07-05T01:00:00.000Z' },
      { id: 't1', title: 'First', updated_at: '2026-07-04T00:00:00.000Z' },
    ])
  })

  it('fails open to [] on a read error', async () => {
    schemaMock.mockReturnValue(
      makeSchema({ agent_threads: { data: null, error: { message: 'boom' } } }) as never,
    )
    const threads = await listThreads()
    expect(threads).toEqual([])
  })
})
