// T30 — grounding harness (D5, binding). AC-GR-001 (the system prompt carries each grounding rule)
// + AC-GR-002 (an empty query_entity read is fed back as a role:'tool' message the model MUST
// ground on). Behavioral compliance (claude-sonnet-5 actually obeying) is AC-GR-003 — a
// Director/live-verify gate on staging, NOT provable in CI with a mocked model.
import { describe, it, expect, vi } from 'vitest'
import { buildAgentSystemPrompt } from './../../../../supabase/functions/agent-chat/prompt'
import { AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP } from './../../../../supabase/functions/agent-chat/readEntities'
import { agentChatHandler } from './../../../../supabase/functions/agent-chat/handler'
import type { HandlerDeps } from './../../../../supabase/functions/agent-chat/handler'
import type { AgentChatRequest } from './runtime/transport'
import type { ModelResponse } from './../../../../supabase/functions/_shared/modelClient'

// ── AC-GR-001: the prompt contract ─────────────────────────────────────────────

describe('AC-GR-001: buildAgentSystemPrompt carries every grounding rule', () => {
  const prompt = buildAgentSystemPrompt(AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP)

  it('binds the deputy to query before answering (never recall from memory)', () => {
    expect(prompt).toContain('query_entity')
    expect(prompt).toContain('NEVER answer a data question from memory')
  })

  it('binds the empty/failed-read "say so and stop" rule', () => {
    expect(prompt).toContain('rowCount 0')
  })

  it('binds the as-of / snapshot rule for reporting entities', () => {
    expect(prompt).toContain('snapshot_as_of')
  })
})

// ── AC-GR-002: the empty-read flow ─────────────────────────────────────────────

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
    finish_reason: 'stop',
    model: 'test-model',
    message: { role: 'assistant', content: text },
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

describe('AC-GR-002: an empty query_entity read is fed back as a grounding tool_result', () => {
  it('appends a role:tool message carrying rowCount:0 and makes a second model call', async () => {
    // ModelClient script: round 1 → query_entity tool_call; round 2 → text reply (the deputy now
    // MUST ground on the empty result; the prompt already binds the "say no data + stop" reply).
    type HandlerMessage = { role: string; content?: string; tool_call_id?: string; name?: string }
    // Typed via the generic so mock.calls[i][0] carries the {messages} shape (impl takes no param).
    const createMock = vi.fn<(params: { messages: HandlerMessage[] }) => Promise<ModelResponse>>(async () => {
      const callCount = createMock.mock.calls.length
      if (callCount === 1) return toolCallResponse('query_entity', { entity: 'tasks', columns: ['title'] })
      return textResponse('I have no data on that right now.')
    })

    // supabase mock: the read returns zero rows (RLS-empty or genuinely none) → queryEntity yields
    // {rowCount:0, rows:[]}.
    const selectSpy = vi.fn(async () => ({ data: [] as unknown[], error: null }))
    const tableOps = () => ({
      select: () => ({
        eq: () => ({ limit: selectSpy, maybeSingle: async () => ({ data: null, error: null }), eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        in: () => ({ limit: selectSpy }),
        limit: selectSpy,
      }),
    })
    const supabase = { from: tableOps, schema: () => ({ from: tableOps }) }

    const deps: HandlerDeps = {
      modelClient: { create: createMock } as never,
      model: 'test-model',
      supabase: supabase as never,
      userId: 'user-1',
      personId: 'person-1',
      orgId: 'org-1',
      accessRoles: ['member'],
    }

    const req: AgentChatRequest = { messages: [{ role: 'user', content: 'list my tasks' }] }
    for await (const _ev of agentChatHandler(req, deps)) void _ev

    // The model was called a second time (the deputy continued to answer — grounding on the tool result).
    expect(createMock).toHaveBeenCalledTimes(2)

    // The SECOND call's messages array contains a role:'tool' message whose content JSON carries
    // rowCount:0 — the model's next turn MUST ground on it (FR-P2-GR-002 / FR-P2-RT-002).
    const secondCallMessages = createMock.mock.calls[1][0].messages
    const toolMessage = secondCallMessages.find((m) => m.role === 'tool' && m.name === 'query_entity')
    expect(toolMessage, 'a role:tool message for query_entity must be appended before the 2nd model call').toBeTruthy()
    const parsed = JSON.parse(toolMessage!.content!) as { rowCount?: number; rows?: unknown[] }
    expect(parsed.rowCount).toBe(0)
    expect(parsed.rows).toEqual([])
  })
})
