// T19 (P3a Phase D) — ask_user dispatch branch + handleAnswer (ADR-0045 §2 port).
// AC-P3-AU-001: the model calls ask_user -> the handler emits status{kind:'question'} + ends the
// stream (no model re-entry); the trailing tool_use is unresolved.
// AC-P3-AU-002: a re-POST with req.answer resolving the trailing ask_user appends the chosen
// option's label (or freeText) as the tool_result and continues the SAME run.
// AC-P3-AU-003: a stale/duplicate answer (no trailing unresolved ask_user) is a no-op continuation.
import { describe, it, expect, vi } from 'vitest'
import { agentChatHandler } from './../../../../supabase/functions/agent-chat/handler'
import type { HandlerDeps } from './../../../../supabase/functions/agent-chat/handler'
import type { AgentChatRequest, ConversationMessage } from './runtime/transport'
import type { AgentEvent } from './runtime/port'
import type { ModelResponse } from './../../../../supabase/functions/_shared/modelClient'

function textResponse(text: string): ModelResponse {
  return {
    finish_reason: 'stop',
    model: 'test-model',
    message: { role: 'assistant', content: text },
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

function askUserToolCallResponse(): ModelResponse {
  return {
    finish_reason: 'tool_calls',
    model: 'test-model',
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-ask-1',
          type: 'function',
          function: {
            name: 'ask_user',
            arguments: JSON.stringify({
              prompt: 'Which business unit?',
              options: [{ id: 'bu-1', label: 'Kitchen' }, { id: 'bu-2', label: 'Sales' }],
              allowFreeText: true,
            }),
          },
        },
      ],
    },
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

function makeDeps(create: ReturnType<typeof vi.fn>): HandlerDeps {
  const tableOps = () => ({
    select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }),
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })
  return {
    modelClient: { create },
    model: 'test-model',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: tableOps, schema: () => ({ from: tableOps }) } as any,
    userId: 'user-1',
    personId: 'person-1',
    orgId: 'org-1',
    accessRoles: ['member'],
  }
}

async function collect(req: AgentChatRequest, deps: HandlerDeps): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const ev of agentChatHandler(req, deps)) events.push(ev)
  return events
}

/** The replayed transcript carrying an unresolved ask_user tool_use, mirroring what the SPA
 *  replays on an answer re-POST (Anthropic content-block shape, matches handlerDecision.test.ts). */
function replayedMessagesWithPendingAskUser(): ConversationMessage[] {
  return [
    { role: 'user', content: 'create a task' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: 'call-ask-1',
          name: 'ask_user',
          input: {
            prompt: 'Which business unit?',
            options: [{ id: 'bu-1', label: 'Kitchen' }, { id: 'bu-2', label: 'Sales' }],
            allowFreeText: true,
          },
        },
      ],
    },
  ]
}

describe('agentChatHandler — ask_user branch (T19, AC-P3-AU-001/002/003)', () => {
  it('AC-P3-AU-001: ask_user tool call emits status{kind:question} + ends the stream (no second model call)', async () => {
    const create = vi.fn(async () => askUserToolCallResponse())
    const deps = makeDeps(create)
    const req: AgentChatRequest = { messages: [{ role: 'user', content: 'create a task' }] }

    const events = await collect(req, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const questionEvent = events.find(
      (e) => e.type === 'status' && (e.payload as { kind?: string })?.kind === 'question',
    )
    expect(questionEvent).toBeDefined()
    const payload = questionEvent!.payload as {
      kind: string; questionId: string; prompt: string
      options: { id: string; label: string }[]; allowFreeText?: boolean
    }
    expect(payload.prompt).toBe('Which business unit?')
    expect(payload.options).toEqual([{ id: 'bu-1', label: 'Kitchen' }, { id: 'bu-2', label: 'Sales' }])
    expect(payload.allowFreeText).toBe(true)
    expect(typeof payload.questionId).toBe('string')
    // No completed/error terminal status — the stream just ends awaiting the answer.
    expect(events.some((e) => e.type === 'status' && (e.payload as { status?: string })?.status === 'completed')).toBe(false)
  })

  it('AC-P3-AU-002: an answer choosing an option resolves the SAME run — the model sees the label as the tool_result', async () => {
    const create = vi.fn(async () => textResponse('Got it — using Kitchen.'))
    const deps = makeDeps(create)
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: replayedMessagesWithPendingAskUser(),
      answer: { questionId: 'q1', optionId: 'bu-1' },
    }

    const events = await collect(req, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; tool_call_id?: string; content?: string | null }> }])[0]
    const toolResultMsg = modelArg.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call-ask-1')
    expect(toolResultMsg).toBeDefined()
    expect(toolResultMsg!.content).toBe(JSON.stringify({ answer: 'Kitchen' }))

    // The continuation allows compose/propose (an answer is non-terminal, unlike a decision).
    expect(events.some((e) => e.type === 'assistant' && e.text === 'Got it — using Kitchen.')).toBe(true)
  })

  it('AC-P3-AU-002: a free-text answer is carried verbatim as the tool_result', async () => {
    const create = vi.fn(async () => textResponse('Noted.'))
    const deps = makeDeps(create)
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: replayedMessagesWithPendingAskUser(),
      answer: { questionId: 'q1', freeText: 'Actually, Marketing' },
    }

    await collect(req, deps)

    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string; tool_call_id?: string; content?: string | null }> }])[0]
    const toolResultMsg = modelArg.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'call-ask-1')
    expect(toolResultMsg!.content).toBe(JSON.stringify({ answer: 'Actually, Marketing' }))
  })

  it('AC-P3-AU-003: a stale/duplicate answer (no trailing unresolved ask_user) is a no-op — the model just continues', async () => {
    const create = vi.fn(async () => textResponse('Sure, continuing.'))
    const deps = makeDeps(create)
    const messages: ConversationMessage[] = [{ role: 'user', content: 'hello' }]
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages,
      answer: { questionId: 'stale-q', optionId: 'bu-1' },
    }

    const events = await collect(req, deps)

    expect(create).toHaveBeenCalledTimes(1)
    const modelArg = (create.mock.calls[0] as unknown as [{ messages: Array<{ role: string }> }])[0]
    expect(modelArg.messages.some((m) => m.role === 'tool')).toBe(false)
    expect(events.some((e) => e.type === 'assistant')).toBe(true)
  })

  it('AC-P3-AU-005 analog: ask_user is dispatched BEFORE any needs-approval/actionByName lookup — no approval chip', async () => {
    const create = vi.fn(async () => askUserToolCallResponse())
    const deps = makeDeps(create)
    const req: AgentChatRequest = { messages: [{ role: 'user', content: 'create a task' }] }

    const events = await collect(req, deps)

    expect(events.some((e) => e.type === 'status' && (e.payload as { status?: string })?.status === 'needs-approval')).toBe(false)
  })
})
