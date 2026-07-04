// T17 — agentChatHandler, the pure async-generator deputy loop (main flow).
// AC-WT-001/002, AC-GR-002 (grounding empty-read carry), AC-DI-002 (grep guard is a separate
// test file, handlerDeputyInvariant.test.ts).
import { describe, it, expect, vi } from 'vitest'
import { agentChatHandler, MAX_TOOL_ROUNDS } from './../../../../supabase/functions/agent-chat/handler'
import type { HandlerDeps } from './../../../../supabase/functions/agent-chat/handler'
import type { AgentChatRequest } from './runtime/transport'
import type { AgentEvent } from './runtime/port'
import type { ModelResponse } from './../../../../supabase/functions/_shared/modelClient'

// ── Test doubles ───────────────────────────────────────────────────────────────

function makeSupabaseMock(overrides: {
  selectResult?: { data: unknown[] | null; error: unknown }
} = {}): { supabase: HandlerDeps['supabase']; selectSpy: ReturnType<typeof vi.fn> } {
  const selectResult = overrides.selectResult ?? { data: [{ id: '1', title: 'Task A' }], error: null }
  const selectSpy = vi.fn(async () => selectResult)
  const tableOps = () => ({
    select: () => ({
      eq: () => ({ limit: selectSpy, maybeSingle: async () => ({ data: null, error: null }), eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      in: () => ({ limit: selectSpy }),
      limit: selectSpy,
    }),
    insert: (row: Record<string, unknown>) => ({
      select: () => ({ single: async () => ({ data: { id: 'new-id', ...row }, error: null }) }),
    }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })
  const supabase: HandlerDeps['supabase'] = {
    from: tableOps,
    schema: () => ({ from: tableOps }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
  return { supabase, selectSpy }
}

function textResponse(text: string): ModelResponse {
  return {
    finish_reason: 'stop',
    model: 'test-model',
    message: { role: 'assistant', content: text },
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

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

function makeDeps(overrides: Partial<HandlerDeps> & { modelResponses?: ModelResponse[] } = {}): HandlerDeps {
  const { supabase } = makeSupabaseMock()
  const responses = overrides.modelResponses ?? [textResponse('Hello!')]
  let call = 0
  const modelClient = {
    create: vi.fn(async () => {
      const r = responses[Math.min(call, responses.length - 1)]
      call++
      return r
    }),
  }
  return {
    modelClient,
    model: 'test-model',
    supabase: overrides.supabase ?? supabase,
    userId: 'user-1',
    personId: 'person-1',
    orgId: 'org-1',
    accessRoles: ['member'],
    ...overrides,
  }
}

async function collect(req: AgentChatRequest, deps: HandlerDeps): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const ev of agentChatHandler(req, deps)) events.push(ev)
  return events
}

// ── Gate (1): 401 ──────────────────────────────────────────────────────────────

describe('agentChatHandler — gate (1) UNAUTHORIZED', () => {
  it('empty userId -> terminal errored/UNAUTHORIZED status, no model call', async () => {
    const deps = makeDeps({ userId: '' })
    const events = await collect({ messages: [{ role: 'user', content: 'hi' }] }, deps)
    const last = events.at(-1)
    expect(last?.type).toBe('status')
    expect((last?.payload as { status?: string; error?: string })?.status).toBe('error')
    expect((last?.payload as { status?: string; error?: string })?.error).toBe('UNAUTHORIZED')
    expect(deps.modelClient.create).not.toHaveBeenCalled()
  })
})

// ── SEC-Medium: transcript size cap (DoS) ─────────────────────────────────────

describe('agentChatHandler — transcript size cap (SEC-Medium)', () => {
  it('rejects a body with more than 40 messages with a 400-equivalent BAD_REQUEST, BEFORE any model call', async () => {
    const deps = makeDeps()
    const messages = Array.from({ length: 41 }, (_, i) => ({ role: 'user' as const, content: `msg ${i}` }))
    const events = await collect({ messages }, deps)
    const last = events.at(-1)
    expect(last?.type).toBe('status')
    expect((last?.payload as { status?: string; error?: string })?.status).toBe('error')
    expect((last?.payload as { status?: string; error?: string })?.error).toBe('BAD_REQUEST')
    expect(deps.modelClient.create).not.toHaveBeenCalled()
  })

  it('rejects a body whose total JSON size exceeds 32KB, BEFORE any model call', async () => {
    const deps = makeDeps()
    const messages = [{ role: 'user' as const, content: 'x'.repeat(33 * 1024) }]
    const events = await collect({ messages }, deps)
    const last = events.at(-1)
    expect((last?.payload as { status?: string; error?: string })?.status).toBe('error')
    expect((last?.payload as { status?: string; error?: string })?.error).toBe('BAD_REQUEST')
    expect(deps.modelClient.create).not.toHaveBeenCalled()
  })

  it('accepts a body within both caps (40 messages, under 32KB) — no rejection', async () => {
    const deps = makeDeps({ modelResponses: [textResponse('ok')] })
    const messages = Array.from({ length: 40 }, (_, i) => ({ role: 'user' as const, content: `msg ${i}` }))
    const events = await collect({ messages }, deps)
    const last = events.at(-1)
    expect((last?.payload as { status?: string; error?: string })?.error).not.toBe('BAD_REQUEST')
    expect(deps.modelClient.create).toHaveBeenCalled()
  })
})

// ── ADR-0043 §4-analog: cancel branch ──────────────────────────────────────────

describe('agentChatHandler — cancel branch', () => {
  it('req.cancel present -> terminal errored/CANCELLED, no model call', async () => {
    const deps = makeDeps()
    const events = await collect({ messages: [], cancel: { runId: 'run-1' } }, deps)
    const last = events.at(-1)
    expect((last?.payload as { error?: string })?.error).toBe('CANCELLED')
    expect(deps.modelClient.create).not.toHaveBeenCalled()
  })
})

// ── Tool-use loop: text completion ────────────────────────────────────────────

describe('agentChatHandler — plain text completion', () => {
  it('a non-tool-call response emits an assistant event then a completed status', async () => {
    const deps = makeDeps({ modelResponses: [textResponse('The answer is 42.')] })
    const events = await collect({ messages: [{ role: 'user', content: 'what is the answer?' }] }, deps)
    expect(events.some((e) => e.type === 'assistant' && e.text === 'The answer is 42.')).toBe(true)
    const last = events.at(-1)
    expect((last?.payload as { status?: string })?.status).toBe('completed')
  })
})

// ── AC-RT-001: read tool dispatch ─────────────────────────────────────────────

describe('agentChatHandler — query_entity read dispatch', () => {
  it('dispatches query_entity immediately (confirm:false) and continues the loop', async () => {
    const { supabase } = makeSupabaseMock({ selectResult: { data: [{ id: '1' }, { id: '2' }], error: null } })
    const deps = makeDeps({
      supabase,
      modelResponses: [
        toolCallResponse('query_entity', { entity: 'objectives' }),
        textResponse('You have 2 objectives.'),
      ],
    })
    const events = await collect({ messages: [{ role: 'user', content: 'how many objectives?' }] }, deps)
    const toolEvent = events.find((e) => e.type === 'tool')
    expect(toolEvent).toBeDefined()
    expect((toolEvent?.payload as { name?: string })?.name).toBe('query_entity')
    expect((toolEvent?.payload as { result?: { rowCount?: number } })?.result?.rowCount).toBe(2)
    expect(events.some((e) => e.type === 'assistant' && e.text === 'You have 2 objectives.')).toBe(true)
  })
})

// ── AC-GR-002: empty read carries a tool_result the model must ground on ─────

describe('agentChatHandler — grounding empty-read carry (AC-GR-002)', () => {
  it('an empty query_entity result is fed back as a tool_result AND a second model call is made', async () => {
    const { supabase } = makeSupabaseMock({ selectResult: { data: [], error: null } })
    const deps = makeDeps({
      supabase,
      modelResponses: [
        toolCallResponse('query_entity', { entity: 'objectives' }),
        textResponse('I have no data for that.'),
      ],
    })
    await collect({ messages: [{ role: 'user', content: 'how many objectives?' }] }, deps)
    expect(deps.modelClient.create).toHaveBeenCalledTimes(2)
    const secondCallArgs = (deps.modelClient.create as ReturnType<typeof vi.fn>).mock.calls[1][0] as { messages: Array<{ role: string; content: string | null }> }
    const toolMsg = secondCallArgs.messages.find((m) => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(JSON.parse(toolMsg!.content as string)).toEqual({ rowCount: 0, rows: [] })
  })
})

// ── AC-WT-001/002: propose branch (needs-approval, ends stream, no insert) ───

describe('agentChatHandler — propose branch (confirm:true action)', () => {
  it('AC-WT-001: a valid create_task tool-call emits needs-approval and ENDS the stream (no insert)', async () => {
    const insertSpy = vi.fn((row: Record<string, unknown>) => ({ data: { id: 'new-id', ...row }, error: null }))
    const tableOps = (table: string) => ({
      select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }),
      insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => insertSpy({ __table: table, ...row }) }) }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    })
    const deps = makeDeps({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: { from: tableOps, schema: () => ({ from: tableOps }) } as any,
      modelResponses: [
        toolCallResponse('create_task', {
          title: 'Ship it', businessUnitId: 'bu-1', responsiblePersonId: 'p-r', accountablePersonId: 'p-a',
        }),
      ],
    })
    const events = await collect({ messages: [{ role: 'user', content: 'create a task to ship it' }] }, deps)
    const last = events.at(-1)
    expect(last?.type).toBe('status')
    expect((last?.payload as { status?: string })?.status).toBe('needs-approval')
    expect((last?.payload as { humanSummary?: string })?.humanSummary).toContain('Ship it')
    expect((last?.payload as { pendingId?: string })?.pendingId).toBeTruthy()
    expect((last?.payload as { structuredArgs?: object })?.structuredArgs).toMatchObject({ title: 'Ship it' })
    expect(insertSpy).not.toHaveBeenCalled()
  })
})

// ── Step-cap ───────────────────────────────────────────────────────────────────

describe('agentChatHandler — step cap (D7/R4)', () => {
  it(`reaches MAX_TOOL_ROUNDS (${MAX_TOOL_ROUNDS}) -> graceful completed, not errored`, async () => {
    const { supabase } = makeSupabaseMock()
    const responses = Array.from({ length: MAX_TOOL_ROUNDS + 2 }, () => toolCallResponse('query_entity', { entity: 'objectives' }))
    const deps = makeDeps({ supabase, modelResponses: responses })
    const events = await collect({ messages: [{ role: 'user', content: 'loop forever' }] }, deps)
    const last = events.at(-1)
    expect((last?.payload as { status?: string })?.status).toBe('completed')
    expect(last?.text).toBe('reached step limit')
  })
})
