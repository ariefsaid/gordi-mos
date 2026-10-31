// T22 (P3a Phase E) — useAssistantPanel.rate(eventId, rating, reason?): a caller-JWT UPDATE on
// mos.agent_events.{rating, downvote_reason} — the P2-added columns + the feedback-only guard
// trigger already exist; this hook just wires the client call. AC-P3-FB-001/002.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { useAssistantPanel } from './useAssistantPanel'
import { AgentRuntimeProvider } from '@/lib/agent/runtime/AgentRuntimeContext'
import type { AgentRuntime } from '@/lib/agent/runtime/port'

vi.mock('../lib/supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

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

/** A chainable update-builder recorder: from('agent_events').update(patch).eq('id', id). */
function makeSchema(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const eqCalls: Array<[string, unknown]> = []
  const updateCalls: unknown[] = []
  const fromImpl = () => ({
    update: (patch: unknown) => {
      updateCalls.push(patch)
      return {
        eq: (col: string, val: unknown) => {
          eqCalls.push([col, val])
          return Promise.resolve(result)
        },
      }
    },
  })
  return { from: vi.fn(fromImpl), eqCalls, updateCalls }
}

beforeEach(() => vi.clearAllMocks())

describe('useAssistantPanel.rate (T22, AC-P3-FB-001/002)', () => {
  it("rate(eventId, 'up') updates mos.agent_events {rating:'up', downvote_reason:null}", async () => {
    const sch = makeSchema()
    schemaMock.mockReturnValue(sch as never)
    const runtime = makeFakeRuntime()
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => { await result.current.rate('event-1', 'up') })

    expect(schemaMock).toHaveBeenCalledWith('mos')
    expect(sch.updateCalls).toEqual([{ rating: 'up', downvote_reason: null }])
    expect(sch.eqCalls).toEqual([['id', 'event-1']])
  })

  it("rate(eventId, 'down', reason) carries the downvote reason", async () => {
    const sch = makeSchema()
    schemaMock.mockReturnValue(sch as never)
    const runtime = makeFakeRuntime()
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => { await result.current.rate('event-2', 'down', 'inaccurate') })

    expect(sch.updateCalls).toEqual([{ rating: 'down', downvote_reason: 'inaccurate' }])
  })

  it('tracks the resolved rating per event so the UI can show it as already-rated', async () => {
    const sch = makeSchema()
    schemaMock.mockReturnValue(sch as never)
    const runtime = makeFakeRuntime()
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => { await result.current.rate('event-1', 'up') })
    await waitFor(() => expect(result.current.ratings['event-1']).toBe('up'))
  })

  it('a failed update does not record an optimistic rating (fails closed)', async () => {
    const sch = makeSchema({ data: null, error: { message: 'boom' } })
    schemaMock.mockReturnValue(sch as never)
    const runtime = makeFakeRuntime()
    const { result } = renderHook(() => useAssistantPanel(), { wrapper: hookWrapper(runtime) })

    await act(async () => { await result.current.rate('event-1', 'up') })
    expect(result.current.ratings['event-1']).toBeUndefined()
  })
})
