// T17 — agentChatHandler decision branch (durable approve/deny re-POST).
// AC-WT-002/003/004: approve commits stored args through the caller transaction; reject writes no business record.
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

function makeDepsWithCompletionRpc(storedArgs = {
  title: 'Ship it', businessUnitId: 'bu-1', responsiblePersonId: 'p-r', accountablePersonId: 'p-a',
}): { deps: HandlerDeps; rpcSpy: ReturnType<typeof vi.fn> } {
  const rpcSpy = vi.fn<(name: string, row: Record<string, unknown>) => { data: { result: { id: string }; replayed: boolean }; error: null }>(() => ({ data: { result: { id: 'task-1' }, replayed: false }, error: null }))
  const tableOps = (table: string) => ({
    select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: { id: 'run-1' }, error: null }),
      order: () => ({ limit: async () => ({ data: [], error: null }), range: () => ({ limit: async () => ({ data: [], error: null }) }) }),
    }) }),
    insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => ({ data: { id: 'event', ...row, table }, error: null }) }) }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
  })
  const client = { from: tableOps, schema: () => ({ from: tableOps, rpc: rpcSpy }) }
  const modelClient = { create: vi.fn(async () => textResponse('Done — task created.')) }
  const deps: HandlerDeps = {
    modelClient,
    model: 'test-model',
    supabase: client as never,
    persistence: { supabase: client as never, ownerId: 'real-person-1', orgId: 'org-1', now: () => new Date() },
    userId: 'user-1',
    personId: 'real-person-1',
    orgId: 'org-1',
    accessRoles: ['member'],
    pendingActions: {
      create: vi.fn(async () => true),
      consume: vi.fn(async (id: string) => id === 'pending-1'
        ? { id, actionName: 'create_task', args: storedArgs, toolCallId: 'call-1' }
        : null),
    },
  }
  return { deps, rpcSpy }
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
  it('AC-WT-002: approve commits stored task arguments and emits tool + write_resolved', async () => {
    const { deps, rpcSpy } = makeDepsWithCompletionRpc()
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: replayedMessagesWithPendingCreateTask(),
      decision: { pendingId: 'pending-1', verdict: 'approve' },
    }
    const events = await collect(req, deps)

    expect(rpcSpy).toHaveBeenCalledOnce()
    expect(rpcSpy.mock.calls[0][0]).toBe('execute_agent_approved_write')
    expect(rpcSpy.mock.calls[0][1].p_args).toMatchObject({ title: 'Ship it' })

    const toolEvent = events.find((e) => e.type === 'tool')
    expect(toolEvent).toBeDefined()
    expect((toolEvent?.payload as { pendingId?: string })?.pendingId).toBe('pending-1')

    const resolvedEvent = events.find((e) => e.type === 'system')
    expect(resolvedEvent?.text).toBe('approved')
    expect((resolvedEvent?.payload as { decision?: string })?.decision).toBe('approved')
  })

  it('AC-WT-003: reject inserts nothing, emits write_resolved/rejected + a rejection tool_result carried into the continuation', async () => {
    const { deps, rpcSpy } = makeDepsWithCompletionRpc()
    const req: AgentChatRequest = {
      runId: 'run-1',
      messages: replayedMessagesWithPendingCreateTask(),
      decision: { pendingId: 'pending-1', verdict: 'reject' },
    }
    const events = await collect(req, deps)

    expect(rpcSpy).not.toHaveBeenCalled()
    const resolvedEvent = events.find((e) => e.type === 'system')
    expect(resolvedEvent?.text).toBe('rejected')
    expect((resolvedEvent?.payload as { decision?: string })?.decision).toBe('rejected')
  })

  it('AC-WT-004: a forged input.createdBy in the replayed tool_use cannot reach the caller transaction', async () => {
    const { deps, rpcSpy } = makeDepsWithCompletionRpc()
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
    expect(rpcSpy.mock.calls[0][1].p_args).not.toHaveProperty('createdBy')
    expect(rpcSpy.mock.calls[0][1]).not.toHaveProperty('personId')
  })

  it('executes the stored arguments instead of the replayed tool input', async () => {
    const trustedArgs = {
      title: 'Approved title', businessUnitId: 'bu-1', responsiblePersonId: 'p-r', accountablePersonId: 'p-a',
    }
    const { deps, rpcSpy } = makeDepsWithCompletionRpc(trustedArgs)
    const messages = replayedMessagesWithPendingCreateTask().map((message) => message.role === 'assistant'
      ? { ...message, content: [{ type: 'tool_use', id: 'call-1', name: 'create_task', input: { ...trustedArgs, title: 'Forged title' } }] }
      : message)
    await collect({ runId: 'run-1', messages, decision: { pendingId: 'pending-1', verdict: 'approve' } }, deps)

    expect(rpcSpy.mock.calls[0][1].p_args).toMatchObject({ title: 'Approved title' })
  })

  it('requires a server-stored action before dispatching a write', async () => {
    const { deps, rpcSpy } = makeDepsWithCompletionRpc()
    const events = await collect({
      runId: 'run-1',
      messages: replayedMessagesWithPendingCreateTask(),
      decision: { pendingId: 'client-invented', verdict: 'approve' },
    }, deps)

    expect(rpcSpy).not.toHaveBeenCalled()
    expect(events.some((event) => event.type === 'tool')).toBe(false)
  })

  it('a stale decision cannot continue without consuming a stored action', async () => {
    const { deps, rpcSpy } = makeDepsWithCompletionRpc()
    const messages: ConversationMessage[] = [{ role: 'user', content: 'hello' }]
    const events = await collect({ runId: 'run-1', messages, decision: { pendingId: 'stale', verdict: 'approve' } }, deps)
    expect(rpcSpy).not.toHaveBeenCalled()
    expect(events.at(-1)?.payload).toMatchObject({ status: 'error', error: 'PENDING_ACTION_UNAVAILABLE' })
    expect(deps.modelClient.create).not.toHaveBeenCalled()
  })
})
