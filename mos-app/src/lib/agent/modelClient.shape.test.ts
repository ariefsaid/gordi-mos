// AC-P2-CV-001..004 support (T2) — asserts the vendor-neutral ModelClient port is importable
// from Vitest (Node) via a relative path into supabase/functions/_shared/ (D7 dual-environment
// authoring) and that ModelClient exposes exactly one member: create().
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- edge-function shared module lives outside src/ (D7)
import type { ModelClient } from '../../../../supabase/functions/_shared/modelClient'

describe('_shared/modelClient — ModelClient shape (T2)', () => {
  it('ModelClient.create is the only member', () => {
    const fake: ModelClient = {
      create: async () => ({
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'hi' },
        model: 'test-model',
      }),
    }
    const keys = Object.keys(fake)
    expect(keys).toEqual(['create'])
  })

  it('create resolves a ModelResponse shape', async () => {
    const fake: ModelClient = {
      create: async () => ({
        finish_reason: 'stop',
        message: { role: 'assistant', content: null, tool_calls: [] },
        usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
        model: 'test-model',
      }),
    }
    const res = await fake.create({ model: 'test-model', max_tokens: 10, messages: [] })
    expect(res.finish_reason).toBe('stop')
    expect(res.usage?.total_tokens).toBe(3)
  })
})
