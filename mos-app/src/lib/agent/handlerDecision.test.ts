// T17 — agentChatHandler decision branch (stateless approve/deny re-POST).
// AC-WT-002/003/004: approve inserts + attributes to ctx.personId; reject inserts nothing.
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

function makeDepsWithInsertSpy(): { deps: HandlerDeps; insertSpy: ReturnType<typeof vi.fn> } {
  const insertSpy = vi.fn((table: string, row: Record<string, unknown>) => ({ data: { id: 'task-1', ...row, __table: table }, error: null }))
  const tableOps = (table: string) => ({
    select: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }), limit: async () => ({ data: [], error: null }) }),
    insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => insertSpy(table, row) }) }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })
  const modelClient = { create: vi.fn(async () => textResponse('Done — task created.')) }
  const deps: HandlerDeps = {
    modelClient,
    model: 'test-model',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: { from: tableOps, schema: () => ({ from: tableOps }) } as any,
    userId: 'user-1',
    personId: 'real-person-1',
    orgId: 'org-1',
    accessRoles: ['member'],
  }
  return { deps, insertSpy }
}

/** Builds the replayed conversation transcript carrying an unresolved create_task tool_use,
 * mirroring what the SPA replays on an approve/deny re-POST (Anthropic content-block shape). */
function replayedMessagesWithPendingCreateTask(): ConversationMessage[] {
  return [
    { role: 'user', content: 'create a task to ship it' },
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use', id: 'call-1', name: 'create_task',
          input: { title: 'Ship it', businessUnitId: 'bu-1', responsiblePersonId: 'p-r', accountablePersonId: 'p-a' },
        },
      ],
    },
  ]
}

async function collect(req: AgentChatRequest, deps: HandlerDeps): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  for await (const ev of agentChatHandler(req, deps)) events.push(ev)
  return events
}

describe('agentChatHandler — decision branch (AC-WT-002/003/004)', () => {
  it('AC-WT-002: approve inserts mos.tasks + task_events, created_by = ctx.personId, emits tool + write_resolved', async () => {
    const { deps, insertSpy } = makeDepsWithInsertSpy()
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: replayedMessagesWithPendingCreateTask(),
      decision: { pendingId: 'pending-1', verdict: 'approve' },
    }
    const events = await collect(req, deps)

    const tables = insertSpy.mock.calls.map((c) => c[0])
    expect(tables).toContain('tasks')
    const taskRow = insertSpy.mock.calls.find((c) => c[0] === 'tasks')?.[1] as Record<string, unknown>
    expect(taskRow.created_by).toBe('real-person-1')

    const toolEvent = events.find((e) => e.type === 'tool')
    expect(toolEvent).toBeDefined()
    expect((toolEvent?.payload as { pendingId?: string })?.pendingId).toBe('pending-1')

    const resolvedEvent = events.find((e) => e.type === 'system')
    expect(resolvedEvent?.text).toBe('approved')
    expect((resolvedEvent?.payload as { decision?: string })?.decision).toBe('approved')
  })

  it('AC-WT-003: reject inserts nothing, emits write_resolved/rejected + a rejection tool_result carried into the continuation', async () => {
    const { deps, insertSpy } = makeDepsWithInsertSpy()
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: replayedMessagesWithPendingCreateTask(),
      decision: { pendingId: 'pending-1', verdict: 'reject' },
    }
    const events = await collect(req, deps)

    expect(insertSpy).not.toHaveBeenCalled()
    const resolvedEvent = events.find((e) => e.type === 'system')
    expect(resolvedEvent?.text).toBe('rejected')
    expect((resolvedEvent?.payload as { decision?: string })?.decision).toBe('rejected')
  })

  it('AC-WT-004: a forged input.createdBy in the replayed tool_use is ignored — created_by is always ctx.personId', async () => {
    const { deps, insertSpy } = makeDepsWithInsertSpy()
    const messages: ConversationMessage[] = [
      { role: 'user', content: 'create a task' },
      {
        role: 'assistant',
        content: [{
          type: 'tool_use', id: 'call-1', name: 'create_task',
          input: {
            title: 'Ship it', businessUnitId: 'bu-1', responsiblePersonId: 'p-r',
            accountablePersonId: 'p-a', createdBy: 'forged-person-999',
          },
        }],
      },
    ]
    await collect({ runId: 'run-1', messages, decision: { pendingId: 'pending-1', verdict: 'approve' } }, deps)
    const taskRow = insertSpy.mock.calls.find((c) => c[0] === 'tasks')?.[1] as Record<string, unknown>
    expect(taskRow.created_by).toBe('real-person-1')
    expect(taskRow.created_by).not.toBe('forged-person-999')
  })

  it('a stale/duplicate decision (no matching pending tool_use) is a no-op — the model just continues', async () => {
    const { deps, insertSpy } = makeDepsWithInsertSpy()
    const messages: ConversationMessage[] = [{ role: 'user', content: 'hello' }]
    const events = await collect({ runId: 'run-1', messages, decision: { pendingId: 'stale', verdict: 'approve' } }, deps)
    expect(insertSpy).not.toHaveBeenCalled()
    expect(events.some((e) => e.type === 'assistant')).toBe(true)
  })
})
