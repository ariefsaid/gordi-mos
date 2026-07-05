// T20 (P3a Phase D) — MosNativeRuntime.control('answer', {answer}) stamps an answer onto the
// RunState; the next subscribe POSTs {runId, answer} and clears it (one-shot, mirroring
// decision/cancel). AC-P3-AU-005.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MosNativeRuntime } from './mosNativeRuntime'
import type { AgentEvent } from './port'

function sseResponse(text: string): Response {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(enc.encode(text))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function frame(ev: AgentEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`
}

const ev1: AgentEvent = { id: 'e1', runId: 'r1', type: 'assistant', text: 'ok', createdAt: '2026-01-01T00:00:00.000Z' }

describe("MosNativeRuntime.control('answer') (T20, AC-P3-AU-005)", () => {
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

  it("control('answer', {answer}) stamps the answer onto the next subscribe POST", async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1)))
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'create a task' })
    await rt.control(run.id, 'answer', { answer: { questionId: 'q1', optionId: 'bu-1' } })
    for await (const _ev of rt.subscribe(run.id)) void _ev
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.answer).toEqual({ questionId: 'q1', optionId: 'bu-1' })
  })

  it('the answer is one-shot — cleared after the subscribe that sends it (a later followUp is a normal turn)', async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1)))
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1)))
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'create a task' })
    await rt.control(run.id, 'answer', { answer: { questionId: 'q1', freeText: 'Marketing' } })
    for await (const _ev of rt.subscribe(run.id)) void _ev

    await rt.followUp(run.id, 'thanks')
    for await (const _ev of rt.subscribe(run.id)) void _ev

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(secondBody.answer).toBeUndefined()
  })

  it("control('answer') with no answer payload is a safe no-op (does not stamp undefined)", async () => {
    fetchMock.mockResolvedValueOnce(sseResponse(frame(ev1)))
    const rt = makeRuntime()
    const run = await rt.createRun({ goal: 'x' })
    await rt.control(run.id, 'answer', {})
    for await (const _ev of rt.subscribe(run.id)) void _ev
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.answer).toBeUndefined()
  })
})
