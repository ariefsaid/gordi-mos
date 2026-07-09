/**
 * composeSpec — the compose+repair logic, shared by:
 *   - composeViewHandler (the HTTP edge fn path, T9)
 *   - composeViewAction / runComposeView (the agent-chat deputy tool path, Phase C, T16)
 *
 * Pure: all I/O is injected via ComposeSpecDeps. No Deno globals.
 * Importable in Vitest (Node) with the ModelClient mocked (D7).
 *
 * The compile call uses the MOS compiler + MOS context naming: `{ personId, orgId }`
 * (D6 — MOS's compileCompositionSpec takes personId, not PMO's userId).
 *
 * FR-P2-CV-002/Sec-M1 carry-in: compileCompositionSpec is re-run HERE, server-side, before
 * any spec is returned to a caller — never trusting a client-side compile.
 */

// Relative imports — no @-alias (Deno + Node/Vitest both resolve these); Deno needs the
// explicit `.ts` suffix.
import { compileCompositionSpec } from '../../../mos-app/src/lib/viewspec/compiler.ts'
import { ValidationError, MAX_PANELS_PER_VIEW, ENTITY_WHITELIST } from '../../../mos-app/src/lib/viewspec/types.ts'
import { registryManifest } from '../../../mos-app/src/lib/viewspec/registry-manifest.ts'
import { COMPOSITION_SPEC_SCHEMA } from './schema.ts'
import { buildSystemPrompt } from './prompt.ts'
import type { ModelClient, ModelMessage } from '../_shared/modelClient.ts'
import type { CompositionSpec } from '../../../mos-app/src/lib/viewspec/types.ts'

// ── Constants (shared with handler.ts) ───────────────────────────────────────

/**
 * Maximum number of repair attempts after initial compile failure.
 * Default 2 → up to 3 total model calls (initial + 2 repairs).
 */
export const MAX_REPAIR_ATTEMPTS = 2

// ── Injected interfaces ───────────────────────────────────────────────────────

export interface ComposeSpecDeps {
  /** Vendor-neutral model client — mocked in tests; ChatCompletionsClient in index.ts. */
  modelClient: ModelClient
  /** Caller person ID (MOS naming — D6) — needed for the CompilerContext ($current_person token). */
  personId: string
  /** Resolved model id for this call. */
  model: string
}

// ── ComposeSpecError ──────────────────────────────────────────────────────────

/**
 * Thrown by composeSpec when the repair loop is exhausted or an upstream model-call error occurs.
 * The handler maps this to 422 (REPAIR_EXHAUSTED) or 502 (UPSTREAM_ERROR).
 */
export class ComposeSpecError extends Error {
  code: 'REPAIR_EXHAUSTED' | 'UPSTREAM_ERROR'
  repairAttempts: number
  tokensUsed: number
  validationError?: { code: string; detail?: string }

  constructor(
    code: 'REPAIR_EXHAUSTED' | 'UPSTREAM_ERROR',
    repairAttempts: number,
    tokensUsed: number,
    validationError?: { code: string; detail?: string },
  ) {
    super(`composeSpec failed: ${code}`)
    this.code = code
    this.repairAttempts = repairAttempts
    this.tokensUsed = tokensUsed
    this.validationError = validationError
  }
}

// ── Model call helper ─────────────────────────────────────────────────────────

async function callModel(
  modelClient: ModelClient,
  model: string,
  system: string,
  messages: ModelMessage[],
): Promise<{ spec: CompositionSpec; tokensUsed: number }> {
  const response = await modelClient.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'system', content: system }, ...messages],
    tools: [
      {
        type: 'function',
        function: {
          name: 'compose_view',
          description: "Author a validated CompositionSpec v1 for the user's natural-language request.",
          parameters: COMPOSITION_SPEC_SCHEMA,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'compose_view' } },
  })

  const toolCall = response.message.tool_calls?.[0]
  if (!toolCall || toolCall.function.name !== 'compose_view') {
    throw new Error('Model did not return a compose_view tool call')
  }

  const tokensUsed = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0)

  return {
    spec: JSON.parse(toolCall.function.arguments) as CompositionSpec,
    tokensUsed,
  }
}

// ── composeSpec (the shared compose+repair loop) ──────────────────────────────

/**
 * Compose and validate a CompositionSpec from a natural-language prompt.
 *
 * Implements the tool-forcing + bounded repair loop; the SAME path is used by the HTTP
 * handler and the agent-chat compose_view tool (a single shared compose+repair path).
 *
 * Throws ComposeSpecError on exhaustion (REPAIR_EXHAUSTED) or upstream model-call error
 * (UPSTREAM_ERROR).
 *
 * Logging discipline: log only { errorCode, repairAttempts, tokensUsed } — NEVER the
 * prompt text or spec contents.
 */
export async function composeSpec(
  prompt: string,
  orgId: string,
  deps: ComposeSpecDeps,
): Promise<{ spec: CompositionSpec; repairAttempts: number; tokensUsed: number }> {
  const { modelClient, personId, model } = deps

  const system = buildSystemPrompt(
    ENTITY_WHITELIST,
    registryManifest.keys(),
    orgId,
    MAX_PANELS_PER_VIEW,
  )

  const ctx = { personId, orgId } // MOS naming (D6) — PMO used userId

  const conversationMessages: ModelMessage[] = [
    { role: 'user', content: prompt },
  ]

  let repairAttempts = 0
  let totalTokensUsed = 0

  try {
    while (true) {
      const { spec, tokensUsed } = await callModel(modelClient, model, system, conversationMessages)
      totalTokensUsed += tokensUsed

      try {
        compileCompositionSpec(spec, ctx) // THE server-side re-validation — Sec-M1 carry-in
        return { spec, repairAttempts, tokensUsed: totalTokensUsed }
      } catch (err) {
        if (!(err instanceof ValidationError)) {
          throw err
        }

        if (repairAttempts >= MAX_REPAIR_ATTEMPTS) {
          console.error('[compose-view] REPAIR_EXHAUSTED', {
            errorCode: err.code,
            repairAttempts: MAX_REPAIR_ATTEMPTS,
            tokensUsed: totalTokensUsed,
          })
          throw new ComposeSpecError(
            'REPAIR_EXHAUSTED',
            MAX_REPAIR_ATTEMPTS,
            totalTokensUsed,
            { code: err.code, detail: err.detail },
          )
        }

        const repairFeedback = err.detail
          ? `Validation failed: ${err.code} — ${err.detail}. Fix and re-emit a valid CompositionSpec.`
          : `Validation failed: ${err.code}. Fix and re-emit a valid CompositionSpec.`

        conversationMessages.push({ role: 'user', content: repairFeedback })

        repairAttempts++
      }
    }
  } catch (err) {
    if (err instanceof ComposeSpecError) {
      throw err
    }
    console.error('[compose-view] UPSTREAM_ERROR', {
      errorCode: 'UPSTREAM_ERROR',
      repairAttempts,
      tokensUsed: totalTokensUsed,
    })
    throw new ComposeSpecError('UPSTREAM_ERROR', repairAttempts, totalTokensUsed)
  }
}
