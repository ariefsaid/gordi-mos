/**
 * ChatCompletionsClient — generic ModelClient implementation calling a configured
 * chat-completions endpoint (POST {baseUrl}/chat/completions). D4: provider-agnostic —
 * the base URL is injected (no hardcoded vendor URL); no provider-routing body field.
 *
 * Pure: no Deno globals (fetch/AbortController/setTimeout are Web-standard) — importable
 * in Vitest with fetch mocked (D7).
 */
import type { ModelClient, ModelClientParams, ModelResponse } from './modelClient.ts'

const REQUEST_TIMEOUT_MS = 30_000

export interface ChatCompletionsClientOptions {
  apiKey: string
  baseUrl: string
}

interface ChatCompletionsChoice {
  finish_reason: string
  message: {
    role: 'assistant'
    content: string | null
    tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  }
}

interface ChatCompletionsResponseBody {
  model: string
  choices: ChatCompletionsChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    cost?: number
  }
}

/**
 * Minimal shape validation for a parsed response's choices[0], run before any field is
 * read — a malformed/truncated upstream body must never propagate a raw parse error or
 * partial body into a thrown Error.
 */
function isValidChoice(choice: unknown): choice is ChatCompletionsChoice {
  if (typeof choice !== 'object' || choice === null) return false
  const c = choice as Partial<ChatCompletionsChoice>
  if (typeof c.finish_reason !== 'string') return false
  if (typeof c.message !== 'object' || c.message === null) return false
  if (c.message.tool_calls !== undefined && !Array.isArray(c.message.tool_calls)) return false
  return true
}

export class ChatCompletionsClient implements ModelClient {
  private readonly opts: ChatCompletionsClientOptions

  constructor(opts: ChatCompletionsClientOptions) {
    this.opts = opts
  }

  async create(params: ModelClientParams): Promise<ModelResponse> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(`${this.opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: params.model,
          max_tokens: params.max_tokens,
          messages: params.messages,
          ...(params.tools ? { tools: params.tools } : {}),
          ...(params.tool_choice ? { tool_choice: params.tool_choice } : {}),
        }),
        signal: controller.signal,
      })
    } catch (err) {
      throw new Error(
        err instanceof Error && err.name === 'AbortError'
          ? 'chat-completions request timed out'
          : 'chat-completions request failed',
      )
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new Error(`chat-completions request failed: ${response.status}`)
    }

    let body: ChatCompletionsResponseBody
    try {
      body = (await response.json()) as ChatCompletionsResponseBody
    } catch {
      // Never surface the raw parse error/body — it may echo back secret-looking upstream content.
      throw new Error('chat-completions response malformed')
    }

    const choice = body.choices?.[0]
    if (!isValidChoice(choice)) {
      throw new Error('chat-completions response malformed')
    }

    return {
      finish_reason: choice.finish_reason,
      message: {
        role: 'assistant',
        content: choice.message.content,
        tool_calls: choice.message.tool_calls,
      },
      usage: body.usage
        ? {
            prompt_tokens: body.usage.prompt_tokens ?? 0,
            completion_tokens: body.usage.completion_tokens ?? 0,
            total_tokens: body.usage.total_tokens ?? 0,
            ...(body.usage.cost !== undefined ? { total_cost: body.usage.cost } : {}),
          }
        : undefined,
      model: body.model,
    }
  }
}
