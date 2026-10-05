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
})
