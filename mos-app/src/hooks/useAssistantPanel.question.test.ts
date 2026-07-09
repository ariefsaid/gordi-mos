// T21 (P3a Phase D) — useAssistantPanel tracks a pending ask_user question from
// status{kind:'question',...} and exposes answer(questionId, optionId?, freeText?), which calls
// runtime.control(runId, 'answer', {answer}) and drains the continuation. AC-P3-AU-004.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useAssistantPanel } from './useAssistantPanel'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime, AgentEvent } from '@/lib/agent/runtime/port'

function makeFakeRuntime(scripts: AgentEvent[][]): AgentRuntime {
  let call = 0
  return {
    createRun: vi.fn(async (input: { goal: string }) => ({ id: 'run-1', title: input.goal.slice(0, 60), status: 'running' as const })),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* () {
      const script = scripts[Math.min(call, scripts.length - 1)]
      call++
      for (const ev of script) yield ev
    }),
  }
}

function questionEv(): AgentEvent {
  return {
    id: 'q-ev-1',
    runId: 'run-1',
    type: 'status',
    payload: {
      kind: 'question',
      questionId: 'q1',
      prompt: 'Which business unit?',
      options: [{ id: 'bu-1', label: 'Kitchen' }, { id: 'bu-2', label: 'Sales' }],
      allowFreeText: true,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function assistantEv(text: string): AgentEvent {
  return { id: `a-${text}`, runId: 'run-1', type: 'assistant', text, createdAt: '2026-01-01T00:00:00.000Z' }
}
function statusEv(status: string): AgentEvent {
  return { id: `s-${status}`, runId: 'run-1', type: 'status', payload: { status }, createdAt: '2026-01-01T00:00:00.000Z' }
}

function hookWrapper(runtime: AgentRuntime) {
  return ({ children }: { children: ReactNode }) => createElement(AgentRuntimeProvider, { runtime, children })
}

describe('useAssistantPanel — pendingQuestion + answer (T21, AC-P3-AU-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('a status{kind:question} event sets pendingQuestion; answer() resolves it via control + drains the continuation', async () => {
    const runtime = makeFakeRuntime([
      [questionEv()],
      [assistantEv('Using Kitchen.'), statusEv('completed')],
    ])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => { await result.current.send('create a task') })
    await waitFor(() => {
      expect(result.current.pendingQuestion).toMatchObject({
        questionId: 'q1',
        prompt: 'Which business unit?',
        allowFreeText: true,
      })
    })

    await act(async () => { await result.current.answer('q1', 'bu-1') })

    expect(runtime.control).toHaveBeenCalledWith('run-1', 'answer', { answer: { questionId: 'q1', optionId: 'bu-1' } })
    await waitFor(() => expect(result.current.phase).toBe('idle'))
    // The question is cleared once resolved.
    expect(result.current.pendingQuestion).toBeNull()
    expect(result.current.transcript.map((t) => `${t.role}:${t.text}`)).toContain('assistant:Using Kitchen.')
  })

  it('answer() with freeText sends {questionId, freeText} (no optionId)', async () => {
    const runtime = makeFakeRuntime([
      [questionEv()],
      [statusEv('completed')],
    ])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })
    await act(async () => { await result.current.send('x') })
    await waitFor(() => expect(result.current.pendingQuestion).not.toBeNull())

    await act(async () => { await result.current.answer('q1', undefined, 'Marketing') })
    expect(runtime.control).toHaveBeenCalledWith('run-1', 'answer', { answer: { questionId: 'q1', freeText: 'Marketing' } })
  })

  it('no active run — answer() is a safe no-op', async () => {
    const runtime = makeFakeRuntime([[statusEv('completed')]])
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })
    await act(async () => { await result.current.answer('q1', 'bu-1') })
    expect(runtime.control).not.toHaveBeenCalled()
  })
})
