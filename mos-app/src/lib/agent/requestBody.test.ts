import { describe, expect, it } from 'vitest'
import { readCappedJson, MAX_AGENT_CHAT_BODY_BYTES } from './../../../../supabase/functions/agent-chat/requestBody'

describe('agent-chat request body cap', () => {
  it('rejects a declared oversized body without reading it', async () => {
    const request = new Request('https://mos.test', {
      method: 'POST',
      headers: { 'Content-Length': String(MAX_AGENT_CHAT_BODY_BYTES + 1) },
      body: '{}',
    })
    await expect(readCappedJson(request)).resolves.toEqual({ ok: false, reason: 'too_large' })
    expect(request.bodyUsed).toBe(false)
  })

  it('rejects a streamed oversized body before JSON parsing', async () => {
    const request = new Request('https://mos.test', {
      method: 'POST',
      body: JSON.stringify({ messages: 'x'.repeat(MAX_AGENT_CHAT_BODY_BYTES) }),
    })
    await expect(readCappedJson(request)).resolves.toEqual({ ok: false, reason: 'too_large' })
  })

  it('accepts a valid JSON body exactly at the byte cap', async () => {
    const request = new Request('https://mos.test', {
      method: 'POST',
      body: JSON.stringify('x'.repeat(MAX_AGENT_CHAT_BODY_BYTES - 2)),
    })
    await expect(readCappedJson(request)).resolves.toEqual({ ok: true, value: 'x'.repeat(MAX_AGENT_CHAT_BODY_BYTES - 2) })
  })

  it('parses a valid body within the cap', async () => {
    const request = new Request('https://mos.test', { method: 'POST', body: '{"messages":[]}' })
    await expect(readCappedJson(request)).resolves.toEqual({ ok: true, value: { messages: [] } })
  })

  it('cancels the stream when it exceeds the limit', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode('123456')) },
      cancel() { cancelled = true },
    })
    const request = new Request('https://mos.test', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    await expect(readCappedJson(request, 5)).resolves.toEqual({ ok: false, reason: 'too_large' })
    expect(cancelled).toBe(true)
  })

  it('propagates stream errors', async () => {
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('read failed')) } })
    const request = new Request('https://mos.test', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    await expect(readCappedJson(request)).rejects.toThrow('read failed')
  })

  it('supports a caller-defined byte limit', async () => {
    const request = new Request('https://mos.test', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    })
    await expect(readCappedJson(request, 5)).resolves.toEqual({ ok: false, reason: 'too_large' })
  })

  it('throws on malformed JSON within the cap', async () => {
    const request = new Request('https://mos.test', { method: 'POST', body: 'invalid-json' })
    await expect(readCappedJson(request)).rejects.toThrow()
  })

  it('handles an empty body and throws on JSON parsing', async () => {
    const request = new Request('https://mos.test', { method: 'POST' })
    await expect(readCappedJson(request)).rejects.toThrow()
  })
})
