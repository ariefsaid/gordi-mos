/**
 * compose-view request/response/error types — the HTTP contract for the compose-view
 * edge function. Pure types; no Deno globals. Importable in both Deno and Node/Vitest (D7).
 */
import type { CompositionSpec } from '../../../mos-app/src/lib/viewspec/types.ts'

// ── Request ──────────────────────────────────────────────────────────────────

export interface ComposeViewRequest {
  /** User's natural-language description; max 2000 chars. */
  prompt: string
  /** UUID — must match the org_id decoded from the caller's JWT (D1; FR-P2-CV-004). */
  orgId: string
}

// ── Response ─────────────────────────────────────────────────────────────────

export interface ComposeViewResponse {
  /** Validated CompositionSpec v1. */
  spec: CompositionSpec
  /** 0 if first attempt succeeded; ≥1 if repair rounds were needed. */
  repairAttempts: number
  /** Total input+output tokens consumed (informational). */
  tokensUsed?: number
}

// ── Error (discriminated union by status) ───────────────────────────────────

/**
 * Structured error body returned by the edge function on non-200 responses.
 * Singular validationError — the compiler is fail-fast (throws one error per round).
 */
export interface ComposeViewError {
  status: 400 | 401 | 422 | 502
  error: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'REPAIR_EXHAUSTED' | 'UPSTREAM_ERROR' | 'MODEL_NOT_CONFIGURED'
  detail?: string
  /** Present on 422 REPAIR_EXHAUSTED: the last ValidationError thrown by compileCompositionSpec. */
  validationError?: {
    code: string
    detail?: string
  }
  /** Repair attempts made before exhaustion (present on 422). */
  repairAttempts?: number
}
