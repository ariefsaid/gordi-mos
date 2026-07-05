// T21 — the agent runtime port (pure type seam). Front-loaded ahead of Phase E because Phase C
// (T16/T17, the edge-function tool catalog + deputy loop) structurally depends on AgentAction/
// DeputyContext/AgentEvent — the SAME port PMO's agent-chat imports. A type/shape compile test:
// TypeScript itself is the assertion (a shape mismatch fails typecheck, not this test file) —
// these runtime checks pin the closed unions + required fields so a future edit can't silently
// narrow/widen them without a red test.
import { describe, it, expect } from 'vitest'
import type {
  AgentRunStatus, AgentRun, AgentEventType, AgentEvent, RunContext, SupabaseLike, DeputyContext,
  AgentAction, AgentRuntime, RunStatusPayload, NeedsApprovalPayload, WriteResolvedPayload,
  AgentAnswer, SupabaseLikeWithWrites, QuestionPayload,
} from './port'

/** A minimal FilterBuilder-shaped test double satisfying every chain/terminal in the port. */
function makeFilterBuilder(): {
  eq: () => ReturnType<typeof makeFilterBuilder>
  in: () => { limit: () => Promise<{ data: unknown[]; error: null }> }
  limit: () => Promise<{ data: unknown[]; error: null }>
  single: () => Promise<{ data: null; error: null }>
  maybeSingle: () => Promise<{ data: null; error: null }>
} {
  const fb = {
    eq: () => fb,
    in: () => ({ limit: async () => ({ data: [], error: null }) }),
    limit: async () => ({ data: [], error: null }),
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
  }
  return fb
}

describe('agent runtime port — pure type seam (T21)', () => {
  it('AgentRunStatus is the P2 closed union, matching mos.agent_runs.status verbatim (error, not errored)', () => {
    const statuses: AgentRunStatus[] = ['running', 'needs-approval', 'completed', 'error', 'cancelled']
    expect(statuses).toHaveLength(5)
  })

  it('AgentEventType covers user/assistant/tool/artifact/status/system', () => {
    const types: AgentEventType[] = ['user', 'assistant', 'tool', 'artifact', 'status', 'system']
    expect(types).toHaveLength(6)
  })

  it('AgentEvent requires id/runId/type/createdAt; payload/text optional', () => {
    const ev: AgentEvent = { id: 'e1', runId: 'r1', type: 'assistant', createdAt: '2026-01-01T00:00:00.000Z' }
    expect(ev.type).toBe('assistant')
  })

  it('RunContext (P2-slimmed) carries only route — no entity/selection (P3)', () => {
    const ctx: RunContext = { route: '/tasks' }
    expect(ctx.route).toBe('/tasks')
  })

  it('DeputyContext (P2) carries personId + accessRoles alongside userId/orgId/supabase', () => {
    const sb: SupabaseLike = {
      from: () => ({ select: () => makeFilterBuilder() }),
      schema: () => ({ from: () => ({ select: () => makeFilterBuilder() }) }),
    }
    const ctx: DeputyContext = { jwt: '', userId: 'u1', personId: 'p1', orgId: 'o1', accessRoles: ['member'], supabase: sb }
    expect(ctx.personId).toBe('p1')
    expect(ctx.accessRoles).toEqual(['member'])
  })

  it('AgentAction shape: name/description/inputSchema/run; confirm optional', () => {
    const action: AgentAction = {
      name: 'query_entity',
      description: 'read',
      inputSchema: {},
      surfaces: ['agent'],
      confirm: false,
      run: async () => ({ ok: true }),
    }
    expect(action.confirm).toBe(false)
  })

  it('AgentRuntime shape: createRun/followUp/openThread/control/subscribe', () => {
    const runtime: AgentRuntime = {
      createRun: async () => ({ id: 'r1', title: 't', status: 'running' }) as AgentRun,
      followUp: async () => {},
      openThread: () => {},
      control: async () => {},
      subscribe: () => (async function* (): AsyncIterable<AgentEvent> {})(),
    }
    expect(typeof runtime.createRun).toBe('function')
    expect(typeof runtime.openThread).toBe('function')
  })

  it('RunStatusPayload/NeedsApprovalPayload/WriteResolvedPayload/AgentAnswer shapes compile', () => {
    const status: RunStatusPayload = { status: 'completed' }
    const needsApproval: NeedsApprovalPayload = {
      status: 'needs-approval', pendingId: 'p1', actionName: 'create_task',
      humanSummary: 'Create task "x"', structuredArgs: {},
    }
    const resolved: WriteResolvedPayload = {
      event: 'write_resolved', decision: 'approved', actionName: 'create_task', pendingId: 'p1',
    }
    const answer: AgentAnswer = { questionId: 'q1', optionId: 'o1' }
    expect(status.status).toBe('completed')
    expect(needsApproval.pendingId).toBe('p1')
    expect(resolved.decision).toBe('approved')
    expect(answer.questionId).toBe('q1')
  })

  it("T20 (AC-P3-AU-005): AgentRuntime.control's command set gains 'answer' — a superset, no existing member changed", () => {
    const runtime: AgentRuntime = {
      createRun: async () => ({ id: 'r1', title: 't', status: 'running' }) as AgentRun,
      followUp: async () => {},
      openThread: () => {},
      // Every P2 cmd still compiles unchanged...
      control: async () => {},
      subscribe: () => (async function* (): AsyncIterable<AgentEvent> {})(),
    }
    // ...and 'answer' is now also a valid cmd, carrying the AgentAnswer payload.
    void runtime.control('r1', 'answer', { answer: { questionId: 'q1', optionId: 'o1' } })
    expect(typeof runtime.control).toBe('function')
  })

  it('QuestionPayload (ask_user) shape: status{type:status, payload:{kind:"question",...}}', () => {
    const q: QuestionPayload = {
      kind: 'question',
      questionId: 'q1',
      prompt: 'Which business unit?',
      options: [{ id: 'bu-1', label: 'Kitchen' }],
      allowFreeText: true,
    }
    expect(q.kind).toBe('question')
    expect(q.options[0].label).toBe('Kitchen')
  })

  it('SupabaseLikeWithWrites extends SupabaseLike with insert/update', () => {
    const sb: SupabaseLikeWithWrites = {
      from: () => ({
        select: () => makeFilterBuilder(),
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
      }),
      schema: () => ({
        from: () => ({
          select: () => makeFilterBuilder(),
          insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        }),
      }),
    }
    expect(typeof sb.from).toBe('function')
  })
})
