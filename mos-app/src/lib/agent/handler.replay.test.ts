// T5 — handler replay branch (AC-P3-RP-002). When req.runId && req.replay, the handler prepends
// the system prompt + replayRunHistory's reconstructed ModelMessage[] and appends only the new
// user turn, so the model sees the full DB-backed history (not an empty client-memory transcript).
// No tool re-executes: the prior tool result is rebuilt into a `tool` message (serialized), never
// re-dispatched (NFR-P3-RP-001).
import { describe, it, expect, vi } from 'vitest'
import { agentChatHandler } from './../../../../supabase/functions/agent-chat/handler'
import type { HandlerDeps } from './../../../../supabase/functions/agent-chat/handler'
import type { AgentChatRequest } from './runtime/transport'
import type { ModelResponse } from './../../../../supabase/functions/_shared/modelClient'

function textResponse(text: string): ModelResponse {
  return {
    finish_reason: 'stop', model: 'test-model',
    message: { role: 'assistant', content: text },
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

/** The persisted prior history of run-1 (what replayRunHistory loads from mos.agent_events). */
const REPLAY_FIXTURE = [
  { type: 'user', text: 'how many objectives?', payload: {} },
  { type: 'assistant', text: '', payload: { tool_calls: [{ id: 'tc-1', type: 'function' as const, function: { name: 'query_entity', arguments: '{"entity":"objectives"}' } }] } },
  { type: 'tool', payload: { tool_call_id: 'tc-1', name: 'query_entity', input: { entity: 'objectives' }, result: { rowCount: 3 } } },
  { type: 'assistant', text: 'You have 3 objectives.', payload: {} },
  { type: 'status', payload: { status: 'completed' } },
]

/** Mock supabase: mos.agent_events select returns the fixture; everything else is a no-op. */
function makeReplayMockSupabase() {
  const fromCalls: string[] = []
  const client = {
    schema: () => ({
      from: (table: string) => {
        fromCalls.push(table)
        return {
          select: () => ({
            eq: () => ({
              // replay read: mos.agent_events ordered by seq
              order: () => ({ limit: async () => ({ data: REPLAY_FIXTURE, error: null }) }),
              limit: async () => ({ data: [], error: null }),
              maybeSingle: async () => ({ data: null, error: null }),
              single: async () => ({ data: null, error: null }),
            }),
            in: () => ({ limit: async () => ({ data: [], error: null }) }),
            limit: async () => ({ data: [], error: null }),
          }),
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        }
      },
    }),
  }
  return { client, fromCalls }
}

async function collect(req: AgentChatRequest, deps: HandlerDeps) {
  const events = []
  for await (const ev of agentChatHandler(req, deps)) events.push(ev)
  return events
}

describe('agentChatHandler — replay branch (AC-P3-RP-002)', () => {
  it('req.replay=true reconstructs history from agent_events and appends the new user turn to the model call', async () => {
    const mock = makeReplayMockSupabase()
    const create = vi.fn(async () => textResponse('Let me check tasks too.'))
    const deps: HandlerDeps = {
      modelClient: { create },
      model: 'test-model',
      supabase: mock.client as never,
      userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
      persistence: {
        supabase: mock.client as never,
        ownerId: 'person-1', orgId: 'org-1', now: () => new Date('2026-07-06T00:00:00.000Z'),
      },
    }
    const req: AgentChatRequest = {
      runId: 'run-1',
      replay: true,
      messages: [{ role: 'user', content: 'and tasks?' }],
    }
    const events = await collect(req, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content?: string | null; tool_call_id?: string; tool_calls?: unknown[] }> }])[0]

    // The model received the reconstructed history: the prior user question, the replayed tool
    // result (as a `tool` message — rebuilt, NOT re-executed), the prior assistant answer...
    const roles = modelArg.messages.map((m) => m.role)
    expect(roles[0]).toBe('system')
    expect(modelArg.messages.some((m) => m.role === 'user' && m.content === 'how many objectives?')).toBe(true)
    expect(modelArg.messages.some((m) => m.role === 'assistant' && m.content === 'You have 3 objectives.')).toBe(true)
    const replayedTool = modelArg.messages.find((m) => m.role === 'tool')
    expect(replayedTool, 'the prior tool result is rebuilt into a tool message (not re-executed)').toBeDefined()
    expect(replayedTool!.tool_call_id).toBe('tc-1')
    expect(replayedTool!.content).toBe(JSON.stringify({ rowCount: 3 }))

    // ...and the NEW user turn is appended LAST (after the replayed history).
    const lastUser = [...modelArg.messages].reverse().find((m) => m.role === 'user')
    expect(lastUser!.content).toBe('and tasks?')

    // No tool EVENT is emitted this turn — the prior tool was replayed (rebuilt into a message),
    // never re-dispatched. The model returned text, so no new dispatch either.
    expect(events.some((e) => e.type === 'tool')).toBe(false)
  })

  it('replay reads only mos.agent_events (no business-data read; deputy invariant intact)', async () => {
    const mock = makeReplayMockSupabase()
    const create = vi.fn(async () => textResponse('ok'))
    const deps: HandlerDeps = {
      modelClient: { create },
      model: 'test-model',
      supabase: mock.client as never,
      userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
      persistence: {
        supabase: mock.client as never,
        ownerId: 'person-1', orgId: 'org-1', now: () => new Date('2026-07-06T00:00:00.000Z'),
      },
    }
    await collect({ runId: 'run-1', replay: true, messages: [{ role: 'user', content: 'again?' }] }, deps)

    // The only `.from()` read is mos.agent_events (the replay reconstruction). No entity table is
    // touched — replay rebuilds messages, it does not re-dispatch tools.
    expect(mock.fromCalls.every((t) => t === 'agent_events' || t === 'agent_runs')).toBe(true)
    expect(mock.fromCalls).toContain('agent_events')
  })

  it('without req.replay the handler does NOT call replay (regression: existing followUp path untouched)', async () => {
    const mock = makeReplayMockSupabase()
    const create = vi.fn(async () => textResponse('done'))
    const deps: HandlerDeps = {
      modelClient: { create },
      model: 'test-model',
      supabase: mock.client as never,
      userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
      persistence: {
        supabase: mock.client as never,
        ownerId: 'person-1', orgId: 'org-1', now: () => new Date('2026-07-06T00:00:00.000Z'),
      },
    }
    // runId present but replay omitted -> the normal stateless followUp path (req.messages as-is).
    await collect({ runId: 'run-1', messages: [{ role: 'user', content: 'follow up' }] }, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content?: string | null }> }])[0]
    // No reconstructed history: the model sees only system + the one client-sent user message.
    expect(modelArg.messages.map((m) => m.role)).toEqual(['system', 'user'])
    expect(modelArg.messages.some((m) => m.role === 'tool')).toBe(false)
    // No replayed assistant answer leaked into the model input.
    expect(modelArg.messages.some((m) => m.content === 'You have 3 objectives.')).toBe(false)
  })
})
