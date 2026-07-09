// T6 (P3a) — MosNativeRuntime.openThread: binds a reopened thread's most-recent run as the
// active runId and stamps `replay:true` so the NEXT subscribe POSTs {runId, replay:true} — the
// server reconstructs model context from mos.agent_events (the Phase A replay path landed in
// handler.ts/replay.ts). The replay flag is consumed (cleared) on that subscribe so a THIRD turn
// in the same session is a normal (non-replay) followUp. AC-P3-RP-003.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MosNativeRuntime } from './mosNativeRuntime'
import type { AgentEvent } from './port'

function sseResponse(text: string, ok = true): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(text))
      controller.close()
    },
  })
  return new Response(stream, { status: ok ? 200 : 502, headers: { 'Content-Type': 'text/event-stream' } })
}

function frame(ev: AgentEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`
}

const ev1: AgentEvent = { id: 'e1', runId: 'run-1', type: 'assistant', text: 'hi', createdAt: '2026-01-01T00:00:00.000Z' }

describe('MosNativeRuntime.openThread (T6, AC-P3-RP-003)', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function makeRuntime() {
    return new MosNativeRuntime({
      endpoint: 'https://example.supabase.co/functions/v1/agent-chat',
      getAccessToken: async () => 'caller-jwt-token',
    })
  }

  it('openThread binds the runId; the next subscribe POSTs {runId, replay:true} with the followUp message', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1)))
    const rt = makeRuntime()

    rt.openThread('run-1')
    await rt.followUp('run-1', 'continue where we left off')
    const events: AgentEvent[] = []
    for await (const ev of rt.subscribe('run-1')) events.push(ev)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.runId).toBe('run-1')
    expect(body.replay).toBe(true)
    expect(body.messages).toEqual([{ role: 'user', content: 'continue where we left off' }])
    expect(events).toEqual([ev1])
  })

  it('replay is consumed (cleared) after the first post-open subscribe — a later followUp is a normal turn', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1)))
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1)))
    const rt = makeRuntime()

    rt.openThread('run-1')
    await rt.followUp('run-1', 'first turn after reopen')
    for await (const _ev of rt.subscribe('run-1')) void _ev

    await rt.followUp('run-1', 'second turn')
    for await (const _ev of rt.subscribe('run-1')) void _ev

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondBody.replay).toBeUndefined()
  })

  it('openThread on a run with no prior in-memory messages seeds an empty messages array (server replay supplies history)', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1)))
    const rt = makeRuntime()

    rt.openThread('run-1')
    const events: AgentEvent[] = []
    for await (const ev of rt.subscribe('run-1')) events.push(ev)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.runId).toBe('run-1')
    expect(body.replay).toBe(true)
    expect(body.messages).toEqual([])
  })
})
