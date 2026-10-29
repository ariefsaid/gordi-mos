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
function makeReplayMockSupabase(options: {
  fixture?: Array<{ type: string; text?: string | null; payload?: Record<string, unknown> | null }>
  existingRunId?: string | null
  failOnOffset?: number
} = {}) {
  const {
    fixture = REPLAY_FIXTURE,
    existingRunId = 'run-1',
    failOnOffset,
  } = options
  const fromCalls: string[] = []
  const inserts: Array<{ table: string; value: unknown }> = []
  const client = {
    schema: () => ({
      from: (table: string) => {
        fromCalls.push(table)
        return {
          select: () => ({
            eq: (_col: string, val: string) => ({
              // replay read: mos.agent_events ordered by seq
              order: () => ({
                limit: async () => {
                  if (failOnOffset !== undefined && failOnOffset <= 0) {
                    return { data: null, error: { message: 'DB_ERROR' } }
                  }
                  return { data: fixture, error: null }
                },
                range: (start: number, end: number) => ({
                  limit: async () => {
                    if (failOnOffset !== undefined && start >= failOnOffset) {
                      return { data: null, error: { message: 'PAGE_FETCH_ERROR' } }
                    }
                    return { data: fixture.slice(start, end + 1), error: null }
                  },
                }),
              }),
              limit: async () => ({ data: [], error: null }),
              maybeSingle: async () => ({
                data: table === 'agent_runs' && existingRunId && val === existingRunId ? { id: existingRunId } : null,
                error: null,
              }),
              single: async () => ({ data: null, error: null }),
            }),
            in: () => ({ limit: async () => ({ data: [], error: null }) }),
            limit: async () => ({ data: [], error: null }),
          }),
          insert: (value: unknown) => {
            inserts.push({ table, value })
            return { select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }
          },
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        }
      },
    }),
  }
  return { client, fromCalls, inserts }
}

async function collect(req: AgentChatRequest, deps: HandlerDeps) {
  const events = []
  for await (const ev of agentChatHandler(req, deps)) events.push(ev)
  return events
}

describe('agentChatHandler — replay branch (AC-P3-RP-002, A2a)', () => {
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

  it('ordinary follow-up on an existing persisted run without replay flag retains prior assistant and complete paired tool context plus new turn once', async () => {
    const mock = makeReplayMockSupabase()
    const create = vi.fn(async () => textResponse('Tasks checked.'))
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
    // Note: replay flag is NOT set; runId belongs to an existing persisted run.
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: [
        { role: 'user', content: 'how many objectives?' },
        { role: 'user', content: 'and tasks?' },
      ],
    }
    const events = await collect(req, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content?: string | null; tool_call_id?: string }> }])[0]

    // Model receives reconstructed history from agent_events:
    expect(modelArg.messages[0].role).toBe('system')
    expect(modelArg.messages.some((m) => m.role === 'user' && m.content === 'how many objectives?')).toBe(true)
    expect(modelArg.messages.some((m) => m.role === 'assistant' && m.content === 'You have 3 objectives.')).toBe(true)
    const toolMsg = modelArg.messages.find((m) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg!.tool_call_id).toBe('tc-1')

    // The new turn is appended once at the end
    const lastMsg = modelArg.messages.at(-1)
    expect(lastMsg).toEqual({ role: 'user', content: 'and tasks?' })

    // User occurrences of the new turn appear exactly once in the model call
    const andTasksOccurrences = modelArg.messages.filter((m) => m.role === 'user' && m.content === 'and tasks?')
    expect(andTasksOccurrences).toHaveLength(1)

    // The new turn is emitted as an event once
    const userEvents = events.filter((e) => e.type === 'user')
    expect(userEvents).toHaveLength(1)
    expect(userEvents[0].text).toBe('and tasks?')
  })

  it('repeated identical user text in a follow-up turn is preserved as a distinct single user occurrence', async () => {
    const mock = makeReplayMockSupabase()
    const create = vi.fn(async () => textResponse('Still 3 objectives.'))
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
    // User repeats the exact same text: 'how many objectives?'
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: [
        { role: 'user', content: 'how many objectives?' },
        { role: 'user', content: 'how many objectives?' },
      ],
    }
    const events = await collect(req, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content?: string | null }> }])[0]

    // Model receives: system, prior user, prior tool, prior assistant, and new identical user turn
    const userMessages = modelArg.messages.filter((m) => m.role === 'user' && m.content === 'how many objectives?')
    expect(userMessages).toHaveLength(2)

    // The last message is the newly submitted user turn
    expect(modelArg.messages.at(-1)).toEqual({ role: 'user', content: 'how many objectives?' })

    // Only the new turn is emitted
    const userEvents = events.filter((e) => e.type === 'user')
    expect(userEvents).toHaveLength(1)
    expect(userEvents[0].text).toBe('how many objectives?')
  })

  it('a later history-page error surfaces a visible failure with zero model or business-action calls', async () => {
    // Page fetch fails when reading subsequent event pages
    const mock = makeReplayMockSupabase({ failOnOffset: 1 })
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
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: [{ role: 'user', content: 'next question' }],
    }
    const events = await collect(req, deps)

    // Visible failure surfaced:
    const errorEvent = events.find((e) => e.type === 'status' && (e.payload as { error?: string })?.error === 'PERSISTENCE_UNAVAILABLE')
    expect(errorEvent).toBeDefined()

    // Zero model calls:
    expect(create).toHaveBeenCalledTimes(0)

    // Zero user events emitted/persisted:
    expect(events.filter((e) => e.type === 'user')).toHaveLength(0)
  })

  it('fresh client-created run persists its original goal without calling replay', async () => {
    // existingRunId is null -> run does not exist yet in agent_runs
    const mock = makeReplayMockSupabase({ existingRunId: null })
    const create = vi.fn(async () => textResponse('Initial response'))
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
      runId: 'fresh-run-1',
      messages: [{ role: 'user', content: 'new goal' }],
    }
    const events = await collect(req, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content?: string | null }> }])[0]

    // Fresh run: system + initial user turn
    expect(modelArg.messages.map((m) => m.role)).toEqual(['system', 'user'])
    expect(modelArg.messages[1].content).toBe('new goal')

    // agent_threads and agent_runs created
    expect(mock.inserts.some((i) => i.table === 'agent_threads')).toBe(true)
    expect(mock.inserts.some((i) => i.table === 'agent_runs')).toBe(true)

    // User event emitted
    expect(events.filter((e) => e.type === 'user')).toHaveLength(1)
  })

  it('stateless/degraded run without persistence does not call replay and passes messages as-is', async () => {
    const mock = makeReplayMockSupabase()
    const create = vi.fn(async () => textResponse('stateless answer'))
    const deps: HandlerDeps = {
      modelClient: { create },
      model: 'test-model',
      supabase: mock.client as never,
      userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
      persistence: undefined,
    }
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: [{ role: 'user', content: 'stateless message' }],
    }
    const events = await collect(req, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content?: string | null }> }])[0]
    expect(modelArg.messages.map((m) => m.role)).toEqual(['system', 'user'])
    expect(modelArg.messages[1].content).toBe('stateless message')
    expect(events.filter((e) => e.type === 'user')).toHaveLength(1)
  })
})
