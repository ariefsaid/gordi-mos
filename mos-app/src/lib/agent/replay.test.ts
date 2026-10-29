// T4 — replayRunHistory reconstructs ModelMessage[] from persisted agent_events (AC-P3-RP-001).
// Pure: deps.supabase is injected (caller-JWT, owner RLS — the deputy invariant holds by
// construction; replay never re-executes a tool, only rebuilds messages, NFR-P3-RP-001).
import { describe, it, expect } from 'vitest'
import { replayRunHistory } from './../../../../supabase/functions/agent-chat/replay'
import type { PersistenceDeps } from './../../../../supabase/functions/agent-chat/persistence'
import type { ModelMessage } from './../../../../supabase/functions/_shared/modelClient'

interface EventRow {
  type: string
  text?: string | null
  payload?: Record<string, unknown> | null
}

/** Build a PersistenceDeps whose mos.agent_events select returns the given seq-ordered rows. */
function depsReturning(rows: EventRow[], cap = 1000): PersistenceDeps {
  const supabase = {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: rows.slice(0, cap), error: null }),
              range: (start: number, end: number) => ({ limit: async () => ({ data: rows.slice(start, Math.min(end + 1, start + cap)), error: null }) }),
            }),
          }),
        }),
      }),
    }),
  }
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    ownerId: 'person-1',
    orgId: 'org-1',
    now: () => new Date('2026-07-06T00:00:00.000Z'),
  }
}

describe('replayRunHistory — reconstruct ModelMessage[] from events (AC-P3-RP-001)', () => {
  it('rebuilds user/assistant(text)/assistant(tool_calls)/tool with paired tool_call_id, in seq order', async () => {
    const rows: EventRow[] = [
      { type: 'user', text: 'how many objectives?' },
      { type: 'assistant', text: 'let me check', payload: {} },
      {
        type: 'assistant',
        text: '',
        payload: { tool_calls: [{ id: 'tc-1', type: 'function', function: { name: 'query_entity', arguments: '{"entity":"objectives"}' } }] },
      },
      { type: 'tool', payload: { tool_call_id: 'tc-1', name: 'query_entity', input: { entity: 'objectives' }, result: { rowCount: 2, rows: [{ id: '1' }, { id: '2' }] } } },
      { type: 'status', payload: { status: 'completed' } },
    ]

    const msgs = await replayRunHistory(depsReturning(rows), 'run-1')

    const expected: ModelMessage[] = [
      { role: 'user', content: 'how many objectives?' },
      { role: 'assistant', content: 'let me check' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'tc-1', type: 'function', function: { name: 'query_entity', arguments: '{"entity":"objectives"}' } }] },
      { role: 'tool', tool_call_id: 'tc-1', name: 'query_entity', content: JSON.stringify({ rowCount: 2, rows: [{ id: '1' }, { id: '2' }] }) },
    ]
    expect(msgs).toEqual(expected)
  })

  it('the assistant tool_use id equals the following tool message tool_call_id (pairing invariant)', async () => {
    const rows: EventRow[] = [
      { type: 'user', text: 'q' },
      { type: 'assistant', text: '', payload: { tool_calls: [{ id: 'call-abc', type: 'function', function: { name: 'query_entity', arguments: '{}' } }] } },
      { type: 'tool', payload: { tool_call_id: 'call-abc', name: 'query_entity', result: { rowCount: 0 } } },
    ]
    const msgs = await replayRunHistory(depsReturning(rows), 'run-1')
    const assistant = msgs.find((m) => m.role === 'assistant' && m.tool_calls)
    const tool = msgs.find((m) => m.role === 'tool')
    expect(assistant?.tool_calls?.[0].id).toBe('call-abc')
    expect(tool?.tool_call_id).toBe('call-abc')
    expect(tool?.tool_call_id).toBe(assistant?.tool_calls?.[0].id)
  })

  it('skips status / system / artifact (lifecycle + journal, not model turns)', async () => {
    const rows: EventRow[] = [
      { type: 'status', payload: { status: 'running' } },
      { type: 'user', text: 'hi' },
      { type: 'system', text: 'write_resolved' },
      { type: 'artifact', payload: { kind: 'compose_view' } },
      { type: 'assistant', text: 'hello', payload: {} },
      { type: 'status', payload: { status: 'completed' } },
    ]
    const msgs = await replayRunHistory(depsReturning(rows), 'run-1')
    expect(msgs).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('defensively skips a tool event whose tool_call_id has no matching assistant tool_use (never a malformed message)', async () => {
    const rows: EventRow[] = [
      { type: 'user', text: 'hi' },
      // orphan tool: no preceding assistant tool_use with id 'tc-orphan'
      { type: 'tool', payload: { tool_call_id: 'tc-orphan', name: 'query_entity', result: { rowCount: 1 } } },
      { type: 'assistant', text: 'ok', payload: {} },
    ]
    const msgs = await replayRunHistory(depsReturning(rows), 'run-1')
    expect(msgs).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' },
    ])
  })

  it('rejects a failed history read and accepts a genuinely empty history', async () => {
    const depsErr: PersistenceDeps = {
      ...depsReturning([]),
      supabase: {
        schema: () => ({
          from: () => ({
            select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: 'boom' } }), range: () => ({ limit: async () => ({ data: null, error: { code: 'boom' } }) }) }) }) }),
          }),
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }
    await expect(replayRunHistory(depsErr, 'run-1')).rejects.toThrow('PERSISTENCE_UNAVAILABLE')
    expect(await replayRunHistory(depsReturning([]), 'run-1')).toEqual([])
  })
})


it('replays recent turns and complete multi-tool pairs spanning capped pages beyond 1000 events', async () => {
  const rows: EventRow[] = Array.from({ length: 999 }, () => ({ type: 'status' }))
  rows.push(
    { type: 'assistant', payload: { tool_calls: [
      { id: 'call-a', type: 'function', function: { name: 'query_entity', arguments: '{}' } },
      { id: 'call-b', type: 'function', function: { name: 'query_entity', arguments: '{}' } },
    ] } },
    { type: 'tool', payload: { tool_call_id: 'call-a', result: 'first' } },
    { type: 'tool', payload: { tool_call_id: 'call-b', result: 'second' } },
    { type: 'user', text: 'recent message' },
  )
  const messages = await replayRunHistory(depsReturning(rows, 2), 'run-1')
  expect(messages.map(message => message.role)).toEqual(['assistant', 'tool', 'tool', 'user'])
  expect(messages[0].tool_calls?.map(call => call.id)).toEqual(['call-a', 'call-b'])
  expect(messages.slice(1, 3).map(message => message.tool_call_id)).toEqual(['call-a', 'call-b'])
  expect(messages.at(-1)?.content).toBe('recent message')
})

it.each(['missing', 'duplicate', 'interrupted'] as const)('rejects a %s result in a completed tool batch before model replay', async mode => {
  const rows: EventRow[] = [
    { type: 'assistant', payload: { tool_calls: [
      { id: 'call-a', type: 'function', function: { name: 'query_entity', arguments: '{}' } },
      { id: 'call-b', type: 'function', function: { name: 'query_entity', arguments: '{}' } },
    ] } },
    { type: 'tool', payload: { tool_call_id: 'call-a', result: 'first' } },
  ]
  if (mode === 'duplicate') rows.push({ type: 'tool', payload: { tool_call_id: 'call-a', result: 'duplicate' } })
  if (mode === 'interrupted') rows.push({ type: 'user', text: 'new turn before the pair completes' })
  await expect(replayRunHistory(depsReturning(rows), 'run-1')).rejects.toThrow('PERSISTENCE_UNAVAILABLE')
})
