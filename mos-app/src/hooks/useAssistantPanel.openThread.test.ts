// T6 (P3a) — useAssistantPanel.openThread(threadId): loads the persisted thread's transcript via
// loadThreadForDisplay (history.ts), binds the thread's most-recent run as the active runId (so a
// subsequent send() follows up on it with replay:true — MosNativeRuntime.openThread), and
// populates the panel's transcript/chips state for render (not the P2 "reset to empty" stub).
// AC-P3-RP-003.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useAssistantPanel } from './useAssistantPanel'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime } from '@/lib/agent/runtime/port'

vi.mock('@/lib/agent/history', () => ({
  loadThreadForDisplay: vi.fn(),
}))

import { loadThreadForDisplay } from '@/lib/agent/history'

function makeFakeRuntime(): AgentRuntime {
  return {
    createRun: vi.fn(),
    followUp: vi.fn(async () => {}),
    openThread: vi.fn(),
    control: vi.fn(async () => {}),
    subscribe: vi.fn(async function* () {}),
  }
}

function hookWrapper(runtime: AgentRuntime) {
  return ({ children }: { children: ReactNode }) => createElement(AgentRuntimeProvider, { runtime, children })
}

describe('useAssistantPanel.openThread (T6, AC-P3-RP-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('populates the transcript from the persisted thread + binds runtime.openThread(activeRunId)', async () => {
    vi.mocked(loadThreadForDisplay).mockResolvedValue({
      activeRunId: 'run-9',
      transcript: [
        { id: 'e1', role: 'user', text: 'what is on my plate' },
        { id: 'e2', role: 'assistant', text: 'Here is your week.' },
      ],
    })
    const runtime = makeFakeRuntime()
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => {
      await result.current.openThread('thread-1')
    })

    expect(loadThreadForDisplay).toHaveBeenCalledWith('thread-1')
    expect(runtime.openThread).toHaveBeenCalledWith('run-9')
    await waitFor(() => {
      expect(result.current.transcript.map((t) => `${t.role}:${t.text}`)).toEqual([
        'user:what is on my plate',
        'assistant:Here is your week.',
      ])
    })
    expect(result.current.runId).toBe('run-9')
    expect(result.current.phase).toBe('idle')
    expect(result.current.chips).toEqual([])
  })

  it('an empty thread (no runs) resets the surface without binding a runtime run', async () => {
    vi.mocked(loadThreadForDisplay).mockResolvedValue({ activeRunId: null, transcript: [] })
    const runtime = makeFakeRuntime()
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => {
      await result.current.openThread('thread-empty')
    })

    expect(runtime.openThread).not.toHaveBeenCalled()
    expect(result.current.transcript).toEqual([])
    expect(result.current.runId).toBeNull()
  })

  it("a subsequent send() follows up on the reopened thread's run (no new createRun)", async () => {
    vi.mocked(loadThreadForDisplay).mockResolvedValue({
      activeRunId: 'run-9',
      transcript: [{ id: 'e1', role: 'assistant', text: 'hello again' }],
    })
    const runtime = makeFakeRuntime()
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => {
      await result.current.openThread('thread-1')
    })
    await act(async () => {
      await result.current.send('continue please')
    })

    expect(runtime.createRun).not.toHaveBeenCalled()
    expect(runtime.followUp).toHaveBeenCalledWith('run-9', 'continue please')
  })
})
