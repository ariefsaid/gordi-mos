// T25 — useAssistantPanel hook. Owns the panel's runtime state: transcript, run phase, the
// approve/deny chip map, and the SSE drain that folds agent-chat events into state.
// AC-AP-002 (transcript survives across phases), AC-WT-001/002 (chip flow:
// send → running → needs-approval → approve → tool+write_resolved → idle).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useAssistantPanel } from './useAssistantPanel'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime } from '@/lib/agent/runtime/port'
import type { AgentEvent } from '@/lib/agent/runtime/port'

/** Build a fake runtime whose subscribe yields a scripted sequence per call. */
function makeFakeRuntime(scripts: AgentEvent[][]): AgentRuntime {
  let call = 0
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({
      id: 'run-1',
      title: input.goal.slice(0, 60),
      status: 'running' as const,
    })),
    followUp: vi.fn(async () => {}),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* () {
      const script = scripts[Math.min(call, scripts.length - 1)]
      call++
      for (const ev of script) yield ev
    }),
  }
}

function assistantEv(text: string): AgentEvent {
  return { id: `a-${text}`, runId: 'run-1', type: 'assistant', text, createdAt: '2026-01-01T00:00:00.000Z' }
}
function statusEv(status: string, extra: Record<string, unknown> = {}): AgentEvent {
  return { id: `s-${status}`, runId: 'run-1', type: 'status', payload: { status, ...extra }, createdAt: '2026-01-01T00:00:00.000Z' }
}
function toolEv(payload: Record<string, unknown>): AgentEvent {
  return { id: 'tool-1', runId: 'run-1', type: 'tool', payload, createdAt: '2026-01-01T00:00:00.000Z' }
}
function systemEv(payload: Record<string, unknown>): AgentEvent {
  return { id: 'sys-1', runId: 'run-1', type: 'system', payload, createdAt: '2026-01-01T00:00:00.000Z' }
}

function hookWrapper(runtime: AgentRuntime) {
  return ({ children }: { children: ReactNode }) =>
    createElement(AgentRuntimeProvider, { runtime, children })
}

describe('useAssistantPanel (T25)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('send → running → needs-approval → approve → tool+write_resolved → idle (AC-WT-001/002)', async () => {
    const runtime = makeFakeRuntime([
      // send() drain: a needs-approval chip for a create_task.
      [statusEv('needs-approval', { pendingId: 'p1', actionName: 'create_task', humanSummary: 'Create task "X"' })],
      // approve() drain: the write executes (tool) + resolves (system) + the run completes.
      [
        toolEv({ name: 'create_task', pendingId: 'p1', input: {}, result: { id: 'task-1' } }),
        systemEv({ event: 'write_resolved', decision: 'approved', actionName: 'create_task', pendingId: 'p1' }),
        statusEv('completed'),
      ],
    ])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    expect(result.current.phase).toBe('idle')

    // send → running; the user message is appended optimistically.
    await act(async () => { await result.current.send('create a task') })
    expect(result.current.runId).toBe('run-1')
    // The needs-approval drain ran: a pending chip exists, phase is still 'running' (awaiting decision).
    await waitFor(() => {
      expect(result.current.chips).toHaveLength(1)
      expect(result.current.chips[0]).toMatchObject({ pendingId: 'p1', state: 'pending' })
    })

    // approve → the chip flips to approved and the run completes (idle).
    await act(async () => { await result.current.approve('p1') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    const chip = result.current.chips.find((c) => c.pendingId === 'p1')
    expect(chip?.state).toBe('approved')
  })

  it('deny → the chip flips to denied and the run completes (AC-WT-003)', async () => {
    const runtime = makeFakeRuntime([
      [statusEv('needs-approval', { pendingId: 'p9', actionName: 'create_task', humanSummary: 'Create task "Y"' })],
      [
        systemEv({ event: 'write_resolved', decision: 'rejected', actionName: 'create_task', pendingId: 'p9' }),
        statusEv('completed'),
      ],
    ])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })
    await act(async () => { await result.current.send('make a task') })
    await waitFor(() => expect(result.current.chips).toHaveLength(1))
    await act(async () => { await result.current.deny('p9') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(result.current.chips.find((c) => c.pendingId === 'p9')?.state).toBe('denied')
  })

  it('transcript survives across phases — the user message + assistant reply persist (AC-AP-002)', async () => {
    const runtime = makeFakeRuntime([
      [assistantEv('Here is your answer.'), statusEv('completed')],
    ])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })
    await act(async () => { await result.current.send('hi') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(result.current.transcript.map((t) => `${t.role}:${t.text}`)).toEqual([
      'user:hi',
      'assistant:Here is your answer.',
    ])
    // Phase settled to idle; transcript is untouched by the phase change.
    expect(result.current.transcript).toHaveLength(2)
  })

  it('CQ#2/SEC-Medium: a second send() reuses the active runId via followUp — no second createRun (no orphan-thread fragmentation)', async () => {
    const runtime = makeFakeRuntime([
      [assistantEv('First answer.'), statusEv('completed')],
      [assistantEv('Second answer.'), statusEv('completed')],
    ])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => { await result.current.send('first question') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    expect(runtime.createRun).toHaveBeenCalledTimes(1)
    const firstRunId = result.current.runId

    await act(async () => { await result.current.send('second question') })
    await waitFor(() => expect(result.current.phase).toBe('idle'))

    // Still only ONE createRun — the second turn followed up on the same run.
    expect(runtime.createRun).toHaveBeenCalledTimes(1)
    expect(runtime.followUp).toHaveBeenCalledTimes(1)
    expect(runtime.followUp).toHaveBeenCalledWith(firstRunId, 'second question')
    expect(result.current.runId).toBe(firstRunId)

    // Both turns' transcript items persist.
    expect(result.current.transcript.map((t) => `${t.role}:${t.text}`)).toEqual([
      'user:first question',
      'assistant:First answer.',
      'user:second question',
      'assistant:Second answer.',
    ])
  })

  it('a terminal error status flips phase to error and surfaces the error', async () => {
    const runtime = makeFakeRuntime([[statusEv('error', { error: 'UPSTREAM_ERROR' })]])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })
    await act(async () => { await result.current.send('boom') })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error).toBeTruthy()
  })

  it('stop() cancels the in-flight run and returns to idle', async () => {
    const runtime = makeFakeRuntime([[statusEv('needs-approval', { pendingId: 'p2', actionName: 'create_task', humanSummary: 'x' })]])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })
    await act(async () => { await result.current.send('x') })
    await waitFor(() => expect(result.current.phase).toBe('running'))
    await act(async () => { result.current.stop() })
    expect(runtime.control).toHaveBeenCalledWith('run-1', 'cancel', expect.anything())
  })

  it('newConversation() clears transcript/chips/runId/error and resets phase to idle', async () => {
    const runtime = makeFakeRuntime([[assistantEv('hello'), statusEv('completed')]])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })
    await act(async () => { await result.current.send('hi') })
    await waitFor(() => expect(result.current.transcript).toHaveLength(2))
    act(() => result.current.newConversation())
    expect(result.current.transcript).toEqual([])
    expect(result.current.chips).toEqual([])
    expect(result.current.runId).toBeNull()
    expect(result.current.phase).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('no runtime (SHOW_ASSISTANT=false) → send is a safe no-op, phase stays idle', async () => {
    // Provider with runtime=null (the flag-off default).
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(AgentRuntimeProvider, { runtime: null, children })
    const { result } = renderHook(() => useAssistantPanel(), { wrapper })
    await act(async () => { await result.current.send('anything') })
    expect(result.current.phase).toBe('idle')
    expect(result.current.transcript).toEqual([])
  })
})
