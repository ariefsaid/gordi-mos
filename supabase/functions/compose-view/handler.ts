/**
 * composeViewHandler — pure business-logic handler for the compose-view edge function.
 *
 * Pure: all I/O is injected via HandlerDeps. No Deno globals, no process.env reads.
 * Importable in Vitest (Node) with the ModelClient mocked (D7).
 *
 * The compose+repair loop is delegated to composeSpec.ts. This handler is a thin wrapper
 * that owns the HTTP gates (401/400/422/502) and maps ComposeSpecError → 422/502.
 *
 * D1 delta vs the sibling reference: the org-match gate is a JWT-DECODED org comparison
 * (index.ts decodes org_id from the JWT and passes it as `deps.callerOrgId`) — NOT a
 * `profiles` table lookup (MOS has no profiles table).
 *
 * P2 scope (§0): `rateGuard` + `usage` deps are DROPPED for P2 (P3 threads them; see the
 * `// P3:` comment below) — no handler rewrite needed when P3 adds them back.
 */

// Relative imports so this module resolves under both Deno and Node/Vitest.
import { composeSpec, ComposeSpecError } from './composeSpec.ts'
import type { ComposeViewRequest, ComposeViewResponse, ComposeViewError } from './types.ts'
import type { ModelClient } from '../_shared/modelClient.ts'

// Re-export MAX_REPAIR_ATTEMPTS so any external importer doesn't need to change.
export { MAX_REPAIR_ATTEMPTS } from './composeSpec.ts'

// Re-export the vendor-neutral port so tests/callers can import it from this module too.
export type { ModelClient } from '../_shared/modelClient.ts'

// ── Injected interfaces ────────────────────────────────────────────────────────

export interface HandlerDeps {
  /** Injected vendor-neutral model client — mocked in tests; ChatCompletionsClient in index.ts. */
  modelClient: ModelClient
  /** Resolved model id for this call. */
  model: string
  /** Verified caller user ID (auth.uid()); extracted by index.ts. Empty string = unauthorized. */
  userId: string
  /** Caller person_id, decoded from the JWT by index.ts (D1 — no profiles lookup). */
  personId: string
  /** Caller org_id, decoded from the JWT by index.ts (D1). Compared against req.orgId (FR-P2-CV-004). */
  callerOrgId: string
  // P3: rateGuard?: RateGuard; usage?: { supabase: SupabaseLike } — threaded when P3 lands
  // the credits ledger; the handler is authored to accept them without a rewrite.
}

// ── Handler result type ────────────────────────────────────────────────────────

type HandlerResult =
  | { status: 200; body: ComposeViewResponse }
  | { status: 400; body: ComposeViewError }
  | { status: 401; body: ComposeViewError }
  | { status: 422; body: ComposeViewError }
  | { status: 502; body: ComposeViewError }

// ── Main handler ───────────────────────────────────────────────────────────────

/**
 * composeViewHandler — the pure business-logic handler.
 *
 * Gate order (each gate returns before reaching the model call):
 *   (1) 401 — userId empty
 *   (2) 400 — prompt empty or > 2000 chars
 *   (3) 400 — org mismatch: req.orgId !== deps.callerOrgId (JWT-decoded, D1)
 *   (4) composeSpec() → 200 / 422 (REPAIR_EXHAUSTED)
 *   (5) 502 — upstream error, raw SDK error scrubbed
 *
 * Logging discipline: log only { error code, repairAttempts, tokensUsed }. NEVER log
 * req.prompt or spec contents.
 */
export async function composeViewHandler(
  req: ComposeViewRequest,
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const { modelClient, model, userId, personId } = deps

  // ── Gate (1): userId present ──────────────────────────────────────────────
  if (!userId) {
    return {
      status: 401,
      body: { status: 401, error: 'UNAUTHORIZED', detail: 'missing userId' },
    }
  }

  // ── Gate (2): input validation — prompt ────────────────────────────────────
  if (!req.prompt || req.prompt.length === 0) {
    return {
      status: 400,
      body: { status: 400, error: 'BAD_REQUEST', detail: 'prompt' },
    }
  }
  if (req.prompt.length > 2000) {
    return {
      status: 400,
      body: { status: 400, error: 'BAD_REQUEST', detail: 'prompt' },
    }
  }

  // ── Gate (3): org match — caller org from the JWT (decoded by index.ts), NOT a
  // profiles lookup (D1) ──────────────────────────────────────────────────────
  if (req.orgId !== deps.callerOrgId) {
    return {
      status: 400,
      body: { status: 400, error: 'BAD_REQUEST', detail: 'orgId' },
    }
  }

  // ── Gate (4): compose+repair via composeSpec() ──────────────────────────────
  // composeSpec throws ComposeSpecError on exhaustion or upstream error.
  try {
    const { spec, repairAttempts, tokensUsed } = await composeSpec(
      req.prompt,
      req.orgId,
      { modelClient, personId, model },
    )

    return {
      status: 200,
      body: { spec, repairAttempts, tokensUsed },
    }
  } catch (err) {
    if (err instanceof ComposeSpecError) {
      if (err.code === 'REPAIR_EXHAUSTED') {
        return {
          status: 422,
          body: {
            status: 422,
            error: 'REPAIR_EXHAUSTED',
            validationError: err.validationError,
            repairAttempts: err.repairAttempts,
          },
        }
      }
    }

    // ── Gate (5): upstream error → 502 ───────────────────────────────────────
    // Log only error code, never req.prompt or spec contents. The raw SDK error is
    // NEVER echoed to the client.
    console.error('[compose-view] UPSTREAM_ERROR', {
      errorCode: 'UPSTREAM_ERROR',
      repairAttempts: err instanceof ComposeSpecError ? err.repairAttempts : 0,
      tokensUsed: err instanceof ComposeSpecError ? err.tokensUsed : 0,
    })

    return {
      status: 502,
      body: {
        status: 502,
        error: 'UPSTREAM_ERROR',
        detail: 'model call failed',
      },
    }
  }
}
