// T3 — agentChatHandler replay enrichment (P3a §3.1 #2/#3, AC-P3-RP-002).
// P2 DROPPED three fields replay needs: (a) the echoed `user` turn was streamed but NOT journaled
// (isPersistableEvent excluded 'user'); (b) an assistant turn with empty content but tool_calls
// present emitted NO assistant event at all (so replay could not rebuild the tool_use); (c) the
// tool event carried no tool_call_id (so replay could not pair tool_use↔tool_result). This file
// proves the three enrichments land in the persisted agent_events rows + the streamed payloads.
import { describe, it, expect, vi } from 'vitest'
import { agentChatHandler } from './../../../../supabase/functions/agent-chat/handler'
import type { HandlerDeps } from './../../../../supabase/functions/agent-chat/handler'
import type { AgentChatRequest } from './runtime/transport'
import type { ModelResponse, ModelToolCall } from './../../../../supabase/functions/_shared/modelClient'

function toolCallResponse(name: string, args: unknown, callId = 'call-xyz'): ModelResponse {
  const tool_calls: ModelToolCall[] = [{
    id: callId, type: 'function', function: { name, arguments: JSON.stringify(args) },
  }]
  return {
    finish_reason: 'tool_calls',
    model: 'test-model',
    message: { role: 'assistant', content: null, tool_calls },
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}
function textResponse(text: string): ModelResponse {
  return {
    finish_reason: 'stop', model: 'test-model',
    message: { role: 'assistant', content: text },
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

/** A supabase-like mock that records mos.agent_events inserts and answers reads generically. */
function makeMockSupabase(eventInserts: Record<string, unknown>[]) {
  const mosTableOps = (table: string) => ({
    select: () => ({
      eq: () => ({ limit: async () => ({ data: [], error: null }), order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      in: () => ({ limit: async () => ({ data: [], error: null }) }),
      limit: async () => ({ data: [{ id: '1' }], error: null }),
      order: () => ({ limit: async () => ({ data: [], error: null }) }),
    }),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: () => {
          if (table === 'agent_events') eventInserts.push(row)
          return Promise.resolve({ data: { id: 'x' }, error: null })
        },
      }),
    }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })
  // read dispatch (query_entity) hits non-mos schemas; answer any select with one row.
  const readTableOps = () => ({
    select: () => ({
      eq: () => ({ limit: async () => ({ data: [{ id: '1' }], error: null }) }),
      in: () => ({ limit: async () => ({ data: [{ id: '1' }], error: null }) }),
      limit: async () => ({ data: [{ id: '1' }], error: null }),
    }),
    insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })
  const client = {
    from: readTableOps,
    schema: (s: string) => ({ from: s === 'mos' ? mosTableOps : readTableOps }),
  }
  return { client, eventInserts }
}

function makeDeps(modelResponses: ModelResponse[]) {
  const eventInserts: Record<string, unknown>[] = []
  const mock = makeMockSupabase(eventInserts)
  // scripted rounds in order; fall back to a terminal text response for any extra rounds.
  let i = 0
  const createFn = vi.fn(async () => {
    const r = modelResponses[i] ?? textResponse('done')
    i++
    return r
  })
  const deps: HandlerDeps = {
    modelClient: { create: createFn },
    model: 'test-model',
    supabase: mock.client as never,
    userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
    persistence: {
      supabase: mock.client as never,
      ownerId: 'person-1', orgId: 'org-1', now: () => new Date('2026-07-06T00:00:00.000Z'),
    },
  }
  return { deps, mock, eventInserts }
}

async function collect(req: AgentChatRequest, deps: HandlerDeps) {
  const events = []
  for await (const ev of agentChatHandler(req, deps)) events.push(ev)
  return events
}

describe('agentChatHandler — replay enrichment (AC-P3-RP-002)', () => {
  it('persists the echoed user turn as a type="user" agent_events row', async () => {
    const { deps, eventInserts } = makeDeps([textResponse('hi there')])
    await collect({ messages: [{ role: 'user', content: 'how many objectives?' }] }, deps)

    const userRow = eventInserts.find((r) => r.type === 'user')
    expect(userRow, 'a type="user" row must be journaled (isPersistableEvent widened)').toBeDefined()
    expect(userRow!.text).toBe('how many objectives?')
  })

  it('emits + persists an assistant event carrying tool_calls even when content is empty', async () => {
    const { deps, eventInserts } = makeDeps(
      [toolCallResponse('query_entity', { entity: 'objectives' }, 'call-abc'), textResponse('done')],
    )
    const events = await collect({ messages: [{ role: 'user', content: 'how many objectives?' }] }, deps)

    // P2 dropped this entirely: a content=null tool-call turn emitted NO assistant event.
    const streamedAssistantWithTools = events.find(
      (e) => e.type === 'assistant' && (e.payload as { tool_calls?: unknown } | undefined)?.tool_calls,
    )
    expect(streamedAssistantWithTools, 'an assistant event with payload.tool_calls must stream for a pure tool-call turn').toBeDefined()
    expect((streamedAssistantWithTools!.payload as { tool_calls: ModelToolCall[] }).tool_calls[0].id).toBe('call-abc')

    const assistantRow = eventInserts.find(
      (r) => r.type === 'assistant' && (r.payload as { tool_calls?: unknown } | undefined)?.tool_calls,
    )
    expect(assistantRow, 'the assistant tool_calls must be journaled into agent_events.payload').toBeDefined()
  })

  it('persists the tool event with tool_call_id pairing it to the assistant tool_use', async () => {
    const { deps, eventInserts } = makeDeps(
      [toolCallResponse('query_entity', { entity: 'objectives' }, 'call-pair'), textResponse('done')],
    )
    const events = await collect({ messages: [{ role: 'user', content: 'how many objectives?' }] }, deps)

    const streamedTool = events.find((e) => e.type === 'tool')
    expect(streamedTool, 'a tool event must stream').toBeDefined()
    expect((streamedTool!.payload as { tool_call_id?: string }).tool_call_id).toBe('call-pair')

    const toolRow = eventInserts.find((r) => r.type === 'tool')
    expect(toolRow, 'the tool row must be journaled').toBeDefined()
    expect((toolRow!.payload as { tool_call_id?: string }).tool_call_id).toBe('call-pair')
  })

  it('does not regress a plain text assistant turn (text only, no tool_calls payload)', async () => {
    const { deps, eventInserts } = makeDeps([textResponse('The answer is 42.')])
    const events = await collect({ messages: [{ role: 'user', content: 'what is the answer?' }] }, deps)

    const textAssistant = events.find((e) => e.type === 'assistant' && e.text === 'The answer is 42.')
    expect(textAssistant).toBeDefined()
    // a text-only assistant turn carries no tool_calls payload (replay reads text for content).
    expect((textAssistant!.payload as { tool_calls?: unknown } | undefined)?.tool_calls).toBeUndefined()

    const assistantRow = eventInserts.find((r) => r.type === 'assistant')
    expect(assistantRow).toBeDefined()
    expect(assistantRow!.text).toBe('The answer is 42.')
  })
})
