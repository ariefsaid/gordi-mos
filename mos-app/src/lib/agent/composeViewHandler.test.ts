// AC-P2-CV-001..004 (T9) — composeViewHandler: pure HTTP-gate handler. Gate order:
// 401 (empty userId) → 400 (empty prompt) → 400 (org mismatch via JWT-decoded callerOrgId,
// D1 — NOT a profiles lookup) → composeSpec() → 200 / 422 REPAIR_EXHAUSTED / 502 UPSTREAM_ERROR.
import { describe, it, expect, vi } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- edge-function module lives outside src/ (D7)
import { composeViewHandler } from '../../../../supabase/functions/compose-view/handler'
// eslint-disable-next-line no-restricted-imports -- edge-function module lives outside src/ (D7)
import type { HandlerDeps } from '../../../../supabase/functions/compose-view/handler'
// eslint-disable-next-line no-restricted-imports -- edge-function module lives outside src/ (D7)
import type { ModelClient, ModelResponse } from '../../../../supabase/functions/_shared/modelClient'

function toolCallResponse(spec: unknown): ModelResponse {
  return {
    finish_reason: 'tool_calls',
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'compose_view', arguments: JSON.stringify(spec) } }],
    },
    usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
    model: 'test-model',
  }
}

const VALID_SPEC = {
  version: 1,
  panels: [{ id: 'p1', primitive: 'KPITile', querySpec: { entity: 'objectives', select: ['id', 'name'] } }],
}

function baseDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    modelClient: { create: vi.fn(async () => toolCallResponse(VALID_SPEC)) } as ModelClient,
    model: 'test-model',
    userId: 'user-1',
    personId: 'person-1',
    callerOrgId: 'org-1',
    ...overrides,
  }
}

describe('compose-view/handler — composeViewHandler (T9)', () => {
  it('401 when userId is empty', async () => {
    const res = await composeViewHandler({ prompt: 'x', orgId: 'org-1' }, baseDeps({ userId: '' }))
    expect(res.status).toBe(401)
  })

  it('400 when prompt is empty', async () => {
    const res = await composeViewHandler({ prompt: '', orgId: 'org-1' }, baseDeps())
    expect(res.status).toBe(400)
  })

  it('400 when prompt exceeds 2000 chars', async () => {
    const res = await composeViewHandler({ prompt: 'a'.repeat(2001), orgId: 'org-1' }, baseDeps())
    expect(res.status).toBe(400)
  })

  it('400 when body.orgId does not match the JWT-decoded callerOrgId, BEFORE any model call', async () => {
    const modelClient: ModelClient = { create: vi.fn(async () => toolCallResponse(VALID_SPEC)) }
    const res = await composeViewHandler({ prompt: 'x', orgId: 'org-MISMATCH' }, baseDeps({ modelClient, callerOrgId: 'org-1' }))
    expect(res.status).toBe(400)
    expect(modelClient.create).not.toHaveBeenCalled()
  })

  it('200 with {spec, repairAttempts, tokensUsed} on a valid compose', async () => {
    const res = await composeViewHandler({ prompt: 'build a view', orgId: 'org-1' }, baseDeps())
    expect(res.status).toBe(200)
    if (res.status === 200) {
      expect(res.body.spec).toEqual(VALID_SPEC)
      expect(res.body.repairAttempts).toBe(0)
    }
  })

  it('422 REPAIR_EXHAUSTED when the model never emits a valid spec', async () => {
    const invalidSpec = { version: 1, panels: [{ id: 'p1', primitive: 'KPITile', querySpec: { entity: 'not_real', select: ['id'] } }] }
    const modelClient: ModelClient = { create: vi.fn(async () => toolCallResponse(invalidSpec)) }
    const res = await composeViewHandler({ prompt: 'x', orgId: 'org-1' }, baseDeps({ modelClient }))
    expect(res.status).toBe(422)
    if (res.status === 422) {
      expect(res.body.error).toBe('REPAIR_EXHAUSTED')
    }
  })

  it('502 UPSTREAM_ERROR when the model call throws', async () => {
    const modelClient: ModelClient = { create: vi.fn(async () => { throw new Error('network down') }) }
    const res = await composeViewHandler({ prompt: 'x', orgId: 'org-1' }, baseDeps({ modelClient }))
    expect(res.status).toBe(502)
  })
})
