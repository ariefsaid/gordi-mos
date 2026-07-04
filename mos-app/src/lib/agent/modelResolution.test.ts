// AC-P2-CF-001 (T3) — resolveDefaultModel/resolveComposeModel read a PLAIN object (never
// Deno.env directly — importable in Vitest), and MUST NOT hardcode any default model id (D4).
import { describe, it, expect } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- edge-function shared module lives outside src/ (D7)
import { resolveDefaultModel, resolveComposeModel } from '../../../../supabase/functions/_shared/modelResolution'

describe('_shared/modelResolution — no hardcoded default model (T3, D4)', () => {
  it('resolveDefaultModel returns "" when AGENT_MODEL_DEFAULT is unset', () => {
    expect(resolveDefaultModel({})).toBe('')
  })

  it('resolveDefaultModel echoes AGENT_MODEL_DEFAULT when set', () => {
    expect(resolveDefaultModel({ AGENT_MODEL_DEFAULT: 'some-model-id' })).toBe('some-model-id')
  })

  it('resolveComposeModel falls back to resolveDefaultModel when AGENT_MODEL_COMPOSE is unset', () => {
    expect(resolveComposeModel({ AGENT_MODEL_DEFAULT: 'default-id' })).toBe('default-id')
  })

  it('resolveComposeModel prefers AGENT_MODEL_COMPOSE when set', () => {
    expect(resolveComposeModel({ AGENT_MODEL_DEFAULT: 'default-id', AGENT_MODEL_COMPOSE: 'compose-id' })).toBe('compose-id')
  })

  it('resolveComposeModel returns "" when neither is set', () => {
    expect(resolveComposeModel({})).toBe('')
  })
})
