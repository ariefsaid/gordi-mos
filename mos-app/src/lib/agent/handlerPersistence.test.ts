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

describe('A1 persisted run identity', () => {
  it('persists the client run id, reopens it, and submits a repeated user text exactly once', async () => {
    const rows: Record<string, unknown>[] = []
    const runs = new Map<string, object>()
    const create = vi.fn(async () => textResponse('saved reply'))
    const client = { schema: () => ({ from: (table: string) => ({
      select: () => ({ eq: (_column: string, id: string) => ({
        maybeSingle: async () => ({ data: runs.get(id) ?? null, error: null }),
        order: (_column: string, options: { ascending: boolean }) => ({
          limit: async (count: number) => ({ data: (options.ascending ? rows.slice() : rows.slice().reverse()).slice(0, count), error: null }),
          range: (start: number, end: number) => ({ limit: async () => ({ data: rows.slice(start, end + 1), error: null }) }),
        }),
      }) }),
      insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => {
        if (table === 'agent_runs') runs.set(row.id as string, row)
        if (table === 'agent_events') {
          if (rows.some(saved => saved.seq === row.seq)) return { data: null, error: { code: 'duplicate-seq' } }
          rows.push(row)
        }
        return { data: { id: row.id ?? 'thread-1' }, error: null }
      } }) }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }) }) }
    const deps: HandlerDeps = {
      modelClient: { create }, model: 'test-model', supabase: client as never,
      userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
      persistence: { supabase: client as never, ownerId: 'person-1', orgId: 'org-1', now: () => new Date() },
    }
    const drain = async (req: AgentChatRequest) => {
      for await (const event of agentChatHandler(req, deps)) expect(event.runId).toBe('client-run')
    }
    await drain({ runId: 'client-run', messages: [{ role: 'user', content: 'repeat this' }] })
    expect(runs.has('client-run')).toBe(true)
    expect(rows.filter(row => row.type === 'user')).toHaveLength(1)
    await drain({ runId: 'client-run', replay: true, messages: [{ role: 'user', content: 'repeat this' }] })
    const input = (create.mock.calls[1] as unknown as [{ messages: Array<{ role: string; content: string }> }])[0]
    expect(input.messages.filter(message => message.role === 'user').map(message => message.content)).toEqual(['repeat this', 'repeat this'])
    expect(rows.filter(row => row.type === 'user')).toHaveLength(2)
    expect(runs.size).toBe(1)
  })
})

it('does not create persistence before authenticating the caller', async () => {
  const schema = vi.fn(() => { throw new Error('unauthenticated persistence access') })
  const create = vi.fn(async () => textResponse('unexpected'))
  const events = []
  for await (const event of agentChatHandler({ messages: [{ role: 'user', content: 'hello' }] }, {
    modelClient: { create }, model: 'test-model', supabase: { schema } as never,
    userId: '', personId: '', orgId: '', accessRoles: [],
    persistence: { supabase: { schema } as never, ownerId: '', orgId: '', now: () => new Date() },
  })) events.push(event)
  expect(schema).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
  expect(events.at(-1)?.payload).toMatchObject({ status: 'error', error: 'UNAUTHORIZED' })
})

it.each([
  { label: 'missing continuation', data: null, error: null },
  { label: 'failed owner-scoped lookup', data: null, error: { code: 'read-failed' } },
])('fails closed before the model or writes for $label', async ({ data, error }) => {
  const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }))
  const client = { schema: () => ({ from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }), order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }), insert,
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  }) }) }
  const create = vi.fn(async () => textResponse('unexpected'))
  const events = []
  for await (const event of agentChatHandler({ runId: 'missing-run', replay: true, messages: [{ role: 'user', content: 'continue' }] }, {
    modelClient: { create }, model: 'test-model', supabase: client as never,
    userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
    persistence: { supabase: client as never, ownerId: 'person-1', orgId: 'org-1', now: () => new Date() },
  })) events.push(event)
  expect(create).not.toHaveBeenCalled()
  expect(insert).not.toHaveBeenCalled()
  expect(events.at(-1)?.payload).toMatchObject({ status: 'error', error: 'PERSISTENCE_UNAVAILABLE' })
})

it.each([false, true])('does not repeat a completed action after a capped journal read (later page failure: %s)', async failedPage => {
  const args = { title: 'Saved task', businessUnitId: 'bu-1', responsiblePersonId: 'person-r', accountablePersonId: 'person-a' }
  const { hashToolArgs } = await import('./../../../../supabase/functions/agent-chat/persistence')
  const rows: Record<string, unknown>[] = Array.from({ length: 1001 }, (_, seq) => ({ seq, type: 'status' }))
  rows.push({ seq: 1001, tool_name: 'create_task', tool_args_hash: hashToolArgs(args), tool_status: 'completed', payload: { id: 'already-saved' } })
  const businessInsert = vi.fn()
  const page = (start: number) => failedPage && start > 0
    ? { data: null, error: { code: 'unavailable' } }
    : { data: rows.slice(start, start + 17), error: null }
  const client = { schema: () => ({ from: (table: string) => ({
    select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: { id: 'saved-run' }, error: null }),
      limit: async () => page(0),
      order: () => ({
        limit: async () => ({ data: [{ seq: 1001 }], error: null }),
        range: (start: number) => ({ limit: async () => page(start) }),
      }),
    }) }),
    insert: () => ({ select: () => ({ single: async () => {
      if (table === 'tasks' || table === 'task_events') businessInsert(table)
      return { data: { id: 'unexpected-new-task' }, error: null }
    } }) }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  }) }) }
  const consume = vi.fn(async () => ({ id: 'approval-1', actionName: 'create_task', args, toolCallId: 'call-1' }))
  const create = vi.fn(async () => textResponse('continued'))
  const events = []
  for await (const event of agentChatHandler({
    runId: 'saved-run', messages: [], decision: { pendingId: 'approval-1', verdict: 'approve' },
  }, {
    modelClient: { create }, model: 'test-model', supabase: client as never,
    userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
    persistence: { supabase: client as never, ownerId: 'person-1', orgId: 'org-1', now: () => new Date() },
    pendingActions: { create: async () => true, consume },
  })) events.push(event)
  expect(businessInsert).not.toHaveBeenCalled()
  if (failedPage) {
    expect(consume).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(events.at(-1)?.payload).toMatchObject({ status: 'error', error: 'PERSISTENCE_UNAVAILABLE' })
  } else {
    expect(consume).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    expect(events.at(-1)?.payload).toMatchObject({ status: 'completed' })
  }
})

it.each(['agent_runs', 'agent_events'])('stops before the model when %s cannot be inserted under the caller identity', async failedTable => {
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = []
  const client = { schema: () => ({ from: (table: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => {
      inserted.push({ table, row })
      return table === failedTable
        ? { data: null, error: { code: failedTable === 'agent_runs' ? '23505' : '42501' } }
        : { data: { id: 'new-thread' }, error: null }
    } }) }),
  }) }) }
  const create = vi.fn(async () => textResponse('unexpected'))
  const events = []
  for await (const event of agentChatHandler({ runId: 'client-run', messages: [{ role: 'user', content: 'hello' }] }, {
    modelClient: { create }, model: 'test-model', supabase: client as never,
    userId: 'user-1', personId: 'person-1', orgId: 'org-1', accessRoles: ['member'],
    persistence: { supabase: client as never, ownerId: 'person-1', orgId: 'org-1', now: () => new Date() },
  })) events.push(event)
  expect(create).not.toHaveBeenCalled()
  expect(events.at(-1)?.payload).toMatchObject({ status: 'error', error: 'PERSISTENCE_UNAVAILABLE' })
  for (const { row } of inserted) {
    expect(row).not.toHaveProperty('org_id')
    expect(row).not.toHaveProperty('owner_id')
  }
})
