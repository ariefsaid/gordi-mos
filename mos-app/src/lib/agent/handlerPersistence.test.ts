// T17 — agentChatHandler persistence wiring (withPersistence). AC-P2-OB-001: a tool event's
// journal fields (tool_name/tool_args_hash/tool_status) land in the SAME agent_events insert.
// AC-PS-001-adjacent (unit-level): a fresh run creates a thread+run row before any event persists.
import { describe, it, expect, vi } from 'vitest'
import { agentChatHandler } from './../../../../supabase/functions/agent-chat/handler'
import type { HandlerDeps } from './../../../../supabase/functions/agent-chat/handler'
import type { AgentChatRequest } from './runtime/transport'
import type { ModelResponse } from './../../../../supabase/functions/_shared/modelClient'

function toolCallResponse(name: string, args: unknown): ModelResponse {
  return {
    finish_reason: 'tool_calls',
    model: 'test-model',
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call-1', type: 'function', function: { name, arguments: JSON.stringify(args) } }],
    },
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

describe('agentChatHandler — persistence wiring (AC-P2-OB-001, withPersistence)', () => {
  it('creates mos.agent_threads + mos.agent_runs BEFORE any event insert (fresh run, no req.runId)', async () => {
    const calls: string[] = []
    const threadInsertSpy = vi.fn(() => ({ data: { id: 'thread-1' }, error: null }))
    const runInsertSpy = vi.fn(() => ({ data: { id: 'run-1' }, error: null }))
    const eventInsertSpy = vi.fn((row: Record<string, unknown>) => ({ data: { id: 'ev-1', __row: row }, error: null }))

    const mosTableOps = (table: string) => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            calls.push(table)
            if (table === 'agent_threads') return threadInsertSpy()
            if (table === 'agent_runs') return runInsertSpy()
            if (table === 'agent_events') return eventInsertSpy(row)
            return { data: null, error: null }
          },
        }),
      }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    })
    const readTableOps = () => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [{ id: '1' }], error: null }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    })

    const deps: HandlerDeps = {
      modelClient: { create: vi.fn(async () => toolCallResponse('query_entity', { entity: 'objectives' })) },
      model: 'test-model',
      supabase: {
        from: readTableOps,
        schema: (s: string) => ({ from: s === 'mos' ? mosTableOps : readTableOps }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
      persistence: {
        supabase: {
          from: readTableOps,
          schema: (s: string) => ({ from: s === 'mos' ? mosTableOps : readTableOps }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        ownerId: 'person-1', orgId: 'org-1', now: () => new Date('2026-07-05T00:00:00.000Z'),
      },
    }

    const req: AgentChatRequest = { messages: [{ role: 'user', content: 'how many objectives?' }] }
    const events = []
    for await (const ev of agentChatHandler(req, deps)) events.push(ev)

    expect(threadInsertSpy).toHaveBeenCalled()
    expect(runInsertSpy).toHaveBeenCalled()
    expect(calls[0]).toBe('agent_threads')
    expect(calls[1]).toBe('agent_runs')
    expect(calls.slice(2)).toContain('agent_events')
  })

  it('a type=tool event persists tool_name/tool_args_hash/tool_status in the SAME insert (AC-P2-OB-001)', async () => {
    const eventInsertSpy = vi.fn((row: Record<string, unknown>) => ({ data: { id: 'ev-1', __row: row }, error: null }))
    const mosTableOps = (table: string) => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }),
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: () => {
            if (table === 'agent_events') return eventInsertSpy(row)
            return { data: { id: 'x' }, error: null }
          },
        }),
      }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    })
    const readTableOps = () => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [{ id: '1' }], error: null }) }),
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    })
    const deps: HandlerDeps = {
      modelClient: { create: vi.fn(async () => toolCallResponse('query_entity', { entity: 'objectives' })).mockImplementationOnce(async () => toolCallResponse('query_entity', { entity: 'objectives' })).mockImplementation(async () => textResponse('done')) },
      model: 'test-model',
      supabase: {
        from: readTableOps,
        schema: (s: string) => ({ from: s === 'mos' ? mosTableOps : readTableOps }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
      persistence: {
        supabase: {
          from: readTableOps,
          schema: (s: string) => ({ from: s === 'mos' ? mosTableOps : readTableOps }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        ownerId: 'person-1', orgId: 'org-1', now: () => new Date('2026-07-05T00:00:00.000Z'),
      },
    }
    const req: AgentChatRequest = { messages: [{ role: 'user', content: 'how many objectives?' }] }
    const drained: unknown[] = []
    for await (const ev of agentChatHandler(req, deps)) drained.push(ev)
    expect(drained.length).toBeGreaterThan(0)

    const toolRowInsert = eventInsertSpy.mock.calls.find((c) => (c[0] as Record<string, unknown>).type === 'tool')
    expect(toolRowInsert).toBeDefined()
    const row = toolRowInsert![0] as Record<string, unknown>
    expect(row.tool_name).toBe('query_entity')
    expect(typeof row.tool_args_hash).toBe('string')
    expect(row.tool_status).toBe('completed')
  })
})
