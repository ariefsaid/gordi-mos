// T22 (front-loaded) — SSE transport codec + request shapes. Phase C's handler.ts (T17)
// structurally depends on AgentChatRequest/ConversationMessage/encodeSse — front-loading this
// pure module (same rationale as T21) unblocks it without rework.
import { describe, it, expect } from 'vitest'
import { encodeSse, decodeSseStream } from './transport'
import type { AgentEvent } from './port'
import type { AgentChatRequest, ConversationMessage, AgentDecision, AgentCancel } from './transport'

function readableFromChunks(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c))
      controller.close()
    },
  })
  return stream.getReader()
}

describe('encodeSse / decodeSseStream (T22)', () => {
  it('encodeSse produces a single data: frame terminated by \\n\\n', () => {
    const ev: AgentEvent = { id: 'e1', runId: 'r1', type: 'assistant', text: 'hi', createdAt: '2026-01-01T00:00:00.000Z' }
    const frame = encodeSse(ev)
    expect(frame).toBe(`data: ${JSON.stringify(ev)}\n\n`)
  })

  it('decodeSseStream round-trips a single event', async () => {
    const ev: AgentEvent = { id: 'e1', runId: 'r1', type: 'assistant', text: 'hi', createdAt: '2026-01-01T00:00:00.000Z' }
    const reader = readableFromChunks([encodeSse(ev)])
    const events: AgentEvent[] = []
    for await (const e of decodeSseStream(reader)) events.push(e)
    expect(events).toEqual([ev])
  })

  it('decodeSseStream splits multiple frames across chunk boundaries', async () => {
    const ev1: AgentEvent = { id: 'e1', runId: 'r1', type: 'assistant', text: 'a', createdAt: 't1' }
    const ev2: AgentEvent = { id: 'e2', runId: 'r1', type: 'status', payload: { status: 'completed' }, createdAt: 't2' }
    const combined = encodeSse(ev1) + encodeSse(ev2)
    // Split mid-frame to exercise the buffering logic.
    const mid = Math.floor(combined.length / 2)
    const reader = readableFromChunks([combined.slice(0, mid), combined.slice(mid)])
    const events: AgentEvent[] = []
    for await (const e of decodeSseStream(reader)) events.push(e)
    expect(events).toEqual([ev1, ev2])
  })

  it('decodeSseStream skips a malformed frame without crashing', async () => {
    const ev: AgentEvent = { id: 'e1', runId: 'r1', type: 'assistant', text: 'ok', createdAt: 't1' }
    const reader = readableFromChunks(['data: {not valid json\n\n', encodeSse(ev)])
    const events: AgentEvent[] = []
    for await (const e of decodeSseStream(reader)) events.push(e)
    expect(events).toEqual([ev])
  })

  it('decodeSseStream flushes a trailing frame with no closing \\n\\n', async () => {
    const ev: AgentEvent = { id: 'e1', runId: 'r1', type: 'assistant', text: 'ok', createdAt: 't1' }
    const reader = readableFromChunks([`data: ${JSON.stringify(ev)}`])
    const events: AgentEvent[] = []
    for await (const e of decodeSseStream(reader)) events.push(e)
    expect(events).toEqual([ev])
  })
})

describe('AgentChatRequest / ConversationMessage / AgentDecision / AgentCancel shapes (T22)', () => {
  it('AgentChatRequest carries runId?/messages/context?/decision?/cancel? (no answer — P3 dropped)', () => {
    const req: AgentChatRequest = {
      messages: [{ role: 'user', content: 'hi' }],
      context: { route: '/tasks' },
    }
    expect(req.messages).toHaveLength(1)
  })

  it('ConversationMessage content may be a string or ContentBlock[]', () => {
    const m1: ConversationMessage = { role: 'user', content: 'hi' }
    const m2: ConversationMessage = { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'query_entity' }] }
    expect(typeof m1.content).toBe('string')
    expect(Array.isArray(m2.content)).toBe(true)
  })

  it('AgentDecision is {pendingId, verdict}', () => {
    const d: AgentDecision = { pendingId: 'p1', verdict: 'approve' }
    expect(d.verdict).toBe('approve')
  })

  it('AgentCancel is {runId}', () => {
    const c: AgentCancel = { runId: 'r1' }
    expect(c.runId).toBe('r1')
  })
})
