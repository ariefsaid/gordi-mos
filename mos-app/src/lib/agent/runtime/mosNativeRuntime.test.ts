// T23 — MosNativeRuntime adapter (the only AgentRuntime implementation). Posts to the agent-chat
// edge function, streams back via decodeSseStream, aborts via AbortController.
//
// Design (coherent against the single streaming agent-chat endpoint + the AgentRuntime interface):
//   - createRun mints the runId client-side + stores the initial messages/context in memory
//     (the server is stateless — AgentChatRequest carries the full history, D8-analog). It does NOT
//     fetch: createRun returns Promise<AgentRun> (not a stream), and agent-chat has no separate
//     "create" endpoint — subscribe IS the streaming POST.
//   - followUp/control mutate the stored per-run request state (messages / decision / cancel).
//   - subscribe builds the AgentChatRequest from the stored state, POSTs agent-chat with the
//     caller's bearer token, and yields decodeSseStream events.
//   - control('cancel') aborts any in-flight subscribe via the run's AbortController.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MosNativeRuntime } from './mosNativeRuntime'
import type { AgentEvent } from './port'

/** Build a fetch Response whose body is the given SSE text. */
function sseResponse(text: string, ok = true): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(text))
      controller.close()
    },
  })
  return new Response(stream, {
    status: ok ? 200 : 502,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

function frame(ev: AgentEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`
}

const ev1: AgentEvent = { id: 'e1', runId: 'r1', type: 'assistant', text: 'hi', createdAt: '2026-01-01T00:00:00.000Z' }
const ev2: AgentEvent = { id: 'e2', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: '2026-01-01T00:00:01.000Z' }

describe('MosNativeRuntime (T23)', () => {
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

  it('createRun mints a runId + returns a running AgentRun titled from the goal', async () => {
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'What is on my plate this week?' })
    expect(run.id).toBeTruthy()
    expect(run.status).toBe('running')
    expect(run.title).toBe('What is on my plate this week?')
    // createRun does NOT fetch (the streaming POST is subscribe's job — see file header).
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('createRun + subscribe POSTs the right body to agent-chat with the caller bearer token', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1) + frame(ev2)))
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'show my tasks', context: { route: '/tasks' } })
    const events: AgentEvent[] = []
    for await (const ev of rt.subscribe(run.id)) events.push(ev)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://example.supabase.co/functions/v1/agent-chat')
    expect(init.method).toBe('POST')
    expect(init.headers['Authorization']).toBe('Bearer caller-jwt-token')
    expect(init.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body.runId).toBe(run.id)
    expect(body.messages).toEqual([{ role: 'user', content: 'show my tasks' }])
    expect(body.context).toEqual({ route: '/tasks' })
    expect(events).toEqual([ev1, ev2])
  })

  it('subscribe decodes a multi-event SSE stream across chunk boundaries into an ordered array', async () => {
    // Split the combined stream mid-frame to exercise the codec's buffering.
    const combined = frame(ev1) + frame(ev2)
    const mid = Math.floor(combined.length / 2)
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(combined.slice(0, mid)))
        controller.enqueue(enc.encode(combined.slice(mid)))
        controller.close()
      },
    })
    fetchMock.mockResolvedValueOnce(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))

    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'hi' })
    const events: AgentEvent[] = []
    for await (const ev of rt.subscribe(run.id)) events.push(ev)
    expect(events).toEqual([ev1, ev2])
  })

  it('followUp appends the user message so the next subscribe carries the full history (stateless server, D8)', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev2)))
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'first' })
    await rt.followUp(run.id, 'second question')
    for await (const _ev of rt.subscribe(run.id)) void _ev
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.messages).toEqual([
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second question' },
    ])
  })

  it('control(approve, {pendingId}) stamps a decision onto the next subscribe POST', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev2)))
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'create a task' })
    await rt.control(run.id, 'approve', { pendingId: 'pending-1' })
    for await (const _ev of rt.subscribe(run.id)) void _ev
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.decision).toEqual({ pendingId: 'pending-1', verdict: 'approve' })
  })

  it('control(reject, {pendingId}) stamps a reject decision', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev2)))
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'create a task' })
    await rt.control(run.id, 'reject', { pendingId: 'pending-9' })
    for await (const _ev of rt.subscribe(run.id)) void _ev
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.decision).toEqual({ pendingId: 'pending-9', verdict: 'reject' })
  })

  it('control(cancel) stamps cancel + aborts an in-flight subscribe (AbortController)', async () => {
    // A stream that never resolves on its own; abort must cut it short.
    let abortSignal: AbortSignal | null | undefined
    fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
      abortSignal = init.signal
      // Simulate the browser's abort: reject with an AbortError when the signal aborts.
      return new Promise<Response>((_resolve, reject) => {
        abortSignal!.addEventListener('abort', () => {
          const e = new Error('The operation was aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })
    })
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'long running' })
    const drainPromise = (async () => {
      const events: AgentEvent[] = []
      for await (const ev of rt.subscribe(run.id)) events.push(ev)
      return events
    })()
    // Give the subscribe fetch a tick to register its controller, then cancel.
    await new Promise((r) => setTimeout(r, 0))
    await rt.control(run.id, 'cancel')
    // The drain resolves (no hang) — abort ends the iteration.
    const events = await drainPromise
    expect(events).toEqual([])
    expect(abortSignal?.aborted).toBe(true)
  })

  it('subscribe on an unknown runId (no createRun) yields nothing and does not fetch', async () => {
    const rt = makeRuntime()
    const events: AgentEvent[] = []
    for await (const ev of rt.subscribe('never-created')) events.push(ev)
    expect(events).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a non-OK response yields no events and does not throw (the hook surfaces error state)', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse('data: {bad\n\n', false))
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'x' })
    const events: AgentEvent[] = []
    for await (const ev of rt.subscribe(run.id)) events.push(ev)
    expect(events).toEqual([])
  })
})
