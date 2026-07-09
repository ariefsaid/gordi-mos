// AC-P2-CV-001/002/003 (T8) — the compose+repair loop + SERVER-SIDE re-validation via
// compileCompositionSpec (P1 Sec-M1 carry-in). ModelClient mocked; compileCompositionSpec
// spied to prove it's actually invoked server-side (never trusting a client compile).
import { describe, it, expect, vi } from 'vitest'
import * as compilerModule from './../viewspec/compiler'
// eslint-disable-next-line no-restricted-imports -- edge-function module lives outside src/ (D7)
import { composeSpec, ComposeSpecError, MAX_REPAIR_ATTEMPTS } from '../../../../supabase/functions/compose-view/composeSpec'
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
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    model: 'test-model',
  }
}

const VALID_SPEC = {
  version: 1,
  panels: [
    // `objectives` has requiresTimeRange:false in ENTITY_WHITELIST — a minimal valid spec.
    { id: 'p1', primitive: 'KPITile', querySpec: { entity: 'objectives', select: ['id', 'name'] } },
  ],
}

describe('compose-view/composeSpec — compose+repair loop (T8)', () => {
  it('AC-P2-CV-001: valid-first-try → repairAttempts 0, and compileCompositionSpec was called server-side', async () => {
    const spy = vi.spyOn(compilerModule, 'compileCompositionSpec')
    const modelClient: ModelClient = { create: vi.fn(async () => toolCallResponse(VALID_SPEC)) }

    const result = await composeSpec('build a task view', 'org-1', { modelClient, personId: 'person-1', model: 'm' })

    expect(result.repairAttempts).toBe(0)
    expect(result.spec).toEqual(VALID_SPEC)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('AC-P2-CV-002: invalid-then-valid → repairAttempts 1', async () => {
    const invalidSpec = { version: 1, panels: [{ id: 'p1', primitive: 'KPITile', querySpec: { entity: 'not_real', select: ['id'] } }] }
    let call = 0
    const modelClient: ModelClient = {
      create: vi.fn(async () => {
        call += 1
        return call === 1 ? toolCallResponse(invalidSpec) : toolCallResponse(VALID_SPEC)
      }),
    }

    const result = await composeSpec('build a task view', 'org-1', { modelClient, personId: 'person-1', model: 'm' })

    expect(result.repairAttempts).toBe(1)
    expect(result.spec).toEqual(VALID_SPEC)
  })

  it('AC-P2-CV-003: always-invalid → throws ComposeSpecError REPAIR_EXHAUSTED with code', async () => {
    const invalidSpec = { version: 1, panels: [{ id: 'p1', primitive: 'KPITile', querySpec: { entity: 'not_real', select: ['id'] } }] }
    const modelClient: ModelClient = { create: vi.fn(async () => toolCallResponse(invalidSpec)) }

    await expect(
      composeSpec('build a task view', 'org-1', { modelClient, personId: 'person-1', model: 'm' }),
    ).rejects.toMatchObject({ code: 'REPAIR_EXHAUSTED' })

    // exactly MAX_REPAIR_ATTEMPTS+1 calls (initial + repairs)
    expect(modelClient.create).toHaveBeenCalledTimes(MAX_REPAIR_ATTEMPTS + 1)
  })

  it('throws ComposeSpecError UPSTREAM_ERROR when the model does not return a tool call', async () => {
    const modelClient: ModelClient = {
      create: vi.fn(async (): Promise<ModelResponse> => ({
        finish_reason: 'stop',
        message: { role: 'assistant', content: 'no tool call' },
        model: 'm',
      })),
    }

    await expect(
      composeSpec('build a task view', 'org-1', { modelClient, personId: 'person-1', model: 'm' }),
    ).rejects.toBeInstanceOf(ComposeSpecError)
  })
})
