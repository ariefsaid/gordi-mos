// AC-P2-CF-002 (T4) — ChatCompletionsClient: generic OpenAI-chat-completions transport hitting
// a configured baseUrl (D4 — no hardcoded vendor URL/provider-routing body). fetch is mocked.
import { describe, it, expect, vi, afterEach } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- edge-function shared module lives outside src/ (D7)
import { ChatCompletionsClient } from '../../../../supabase/functions/_shared/chatCompletionsClient'

const ORIGINAL_FETCH = global.fetch

afterEach(() => {
  global.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('_shared/chatCompletionsClient — ChatCompletionsClient (T4)', () => {
  it('POSTs {baseUrl}/chat/completions with Authorization: Bearer <key> and no provider-routing body', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(url)
      capturedInit = init
      return new Response(
        JSON.stringify({
          model: 'test-model',
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'hi' } }],
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const client = new ChatCompletionsClient({ apiKey: 'secret-key', baseUrl: 'https://example.test/v1' })
    const res = await client.create({ model: 'test-model', max_tokens: 100, messages: [] })

    expect(capturedUrl).toBe('https://example.test/v1/chat/completions')
    const headers = capturedInit?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret-key')
    const body = JSON.parse(capturedInit?.body as string)
    expect(body.provider).toBeUndefined()
    expect(res.message.content).toBe('hi')
  })

  it('returns a ModelResponse on 200', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'test-model',
          choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'ok', tool_calls: [] } }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = new ChatCompletionsClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' })
    const res = await client.create({ model: 'm', max_tokens: 10, messages: [] })
    expect(res.finish_reason).toBe('stop')
    expect(res.usage?.total_tokens).toBe(3)
  })

  it('throws on non-2xx status', async () => {
    global.fetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch
    const client = new ChatCompletionsClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' })
    await expect(client.create({ model: 'm', max_tokens: 10, messages: [] })).rejects.toThrow(/500/)
  })

  it('throws "response malformed" on malformed body (never surfaces the raw parse error)', async () => {
    global.fetch = vi.fn(async () => new Response('not json', { status: 200 })) as unknown as typeof fetch
    const client = new ChatCompletionsClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' })
    await expect(client.create({ model: 'm', max_tokens: 10, messages: [] })).rejects.toThrow(/malformed/)
  })

  it('throws "response malformed" when choices[0] has an invalid shape', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ model: 'm', choices: [{ finish_reason: 123 }] }), { status: 200 }),
    ) as unknown as typeof fetch
    const client = new ChatCompletionsClient({ apiKey: 'k', baseUrl: 'https://example.test/v1' })
    await expect(client.create({ model: 'm', max_tokens: 10, messages: [] })).rejects.toThrow(/malformed/)
  })
})
