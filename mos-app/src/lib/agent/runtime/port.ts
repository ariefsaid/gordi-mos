/**
 * agent runtime port — the MOS-owned seam (T21, P2-slimmed port of the sibling reference's
 * runtime/port.ts). Pure type/interface exports only (no runtime values, no concrete adapter).
 *
 * P2 deltas vs the sibling reference:
 *   - AgentRunStatus drops 'queued'/'paused' (unused by the P2 substrate) and adds 'cancelled'
 *     (matches the landed mos.agent_runs.status check constraint).
 *   - RunContext keeps ONLY `route` — `entity`/`selection` are P3 (no live-context grounding hint
 *     in P2, plan §Phase E T21).
 *   - SupabaseLike/SupabaseLikeWithWrites gain `.schema(schemaName)` — the MOS delta (multi-schema
 *     read/write dispatch, D2) vs the reference's single-schema `public` interface. The filter
 *     builder supports chained `.eq().eq()` + `.maybeSingle()` (post_update's two-column lookup,
 *     T16) alongside `.in()`/`.limit()` (query_entity's read shape).
 *   - DeputyContext gains `personId` (D1 — resolved by decoding the caller JWT, not a profiles
 *     lookup) and `accessRoles`.
 *   - QuestionPayload (ask_user) is DROPPED — P3.
 */

// 'error' (not 'errored') — matches the landed mos.agent_runs.status check constraint verbatim
// (migration 20260705000003) so setRunStatus is a straight pass-through, never a renaming layer.
export type AgentRunStatus = 'running' | 'needs-approval' | 'completed' | 'error' | 'cancelled'

export interface AgentRun {
  id: string
  title: string
  status: AgentRunStatus
  progress?: number
}

export type AgentEventType = 'user' | 'assistant' | 'tool' | 'artifact' | 'status' | 'system'

export interface AgentEvent {
  id: string
  runId: string
  type: AgentEventType
  text?: string
  /** tool input/result, terminal { status: AgentRunStatus } — narrowed by type. */
  payload?: unknown
  /** ISO-8601. */
  createdAt: string
}

/** P2-slimmed — route only (entity/selection are P3, plan §Phase E). */
export interface RunContext {
  route?: string
}

/**
 * A chainable filter builder — supports `.eq()` chained onto itself (post_update's two-column
 * lookup, `.eq('person_id',...).eq('week_start',...)`), `.in()`, `.limit()` (query_entity's read
 * shape), and terminal `.single()`/`.maybeSingle()` reads.
 */
interface FilterBuilder {
  eq(column: string, value: string): FilterBuilder
  in(column: string, values: string[]): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }> }
  limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }>
  single(): PromiseLike<{ data: unknown; error: unknown }>
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>
}

interface ReadTableOps {
  select(columns: string): FilterBuilder
}

interface WriteTableOps extends ReadTableOps {
  insert(row: object): {
    select(columns?: string): { single(): PromiseLike<{ data: unknown; error: unknown }> }
  }
  update(patch: object): {
    eq(column: string, value: string): PromiseLike<{ data: unknown; error: unknown }>
  }
}

/**
 * Minimal Supabase-like interface for the deputy's query_entity action.
 * ALWAYS the verified caller-JWT-scoped client (deputy auth). NEVER service_role.
 *
 * `.schema(schemaName)` is the MOS delta (D2, multi-schema): `query_entity` dispatches via
 * `ctx.supabase.schema(entry.schema).from(entry.table)` — the same schema-scoped dispatch the
 * P1 viewspec executor uses.
 */
export interface SupabaseLike {
  from(table: string): ReadTableOps
  schema(schemaName: string): { from(table: string): ReadTableOps }
}

/**
 * Deputy context — always carries the caller-JWT supabase client. NEVER service_role
 * (AC-P2-DI-002 — a grep-typed test asserts no service_role/verifierClient field exists here).
 * `personId`/`accessRoles` are decoded from the caller's JWT claims (D1), not a profiles lookup.
 */
export interface DeputyContext {
  jwt: string
  userId: string
  personId: string
  orgId: string
  accessRoles: string[]
  supabase: SupabaseLike
}

export interface AgentAction {
  name: string
  description: string
  /** JSON Schema -> model tool parameters (not ZodType). */
  inputSchema: object
  /** P2 ships ['agent']. */
  surfaces?: ('ui' | 'agent' | 'mcp' | 'cli')[]
  /** Read-only actions (query_entity, compose_view) => false/omitted. */
  confirm?: boolean
  run: (input: unknown, ctx: DeputyContext) => Promise<unknown>
}

export interface AgentRuntime {
  createRun(input: { goal: string; context?: RunContext }): Promise<AgentRun>
  followUp(runId: string, message: string): Promise<void>
  /**
   * Bind a persisted thread's most-recent run as the active runId (P3a, T6) — a subsequent
   * followUp + subscribe reconstructs the model's context server-side via replay (FR-P3-RP-001)
   * rather than requiring the client to hold the full transcript in memory.
   */
  openThread(runId: string): void
  control(
    runId: string,
    cmd: 'approve' | 'reject' | 'cancel',
    /** P2 carries { pendingId } for approve/reject of a needs-approval write. P3 will also carry
     *  the ask_user `answer` (AgentAnswer) — the optional object leaves room without a rewrite. */
    payload?: { pendingId?: string; answer?: AgentAnswer },
  ): Promise<void>
  subscribe(runId: string): AsyncIterable<AgentEvent>
}

/** Payload shape for AgentEvent{type:'status'} — the general run-lifecycle status frame. */
export interface RunStatusPayload {
  status: AgentRunStatus
  error?: string
}

// ── Approve/deny (write actions) — needs-approval / write_resolved payloads ──

/** Payload shape for AgentEvent{type:'status', payload:NeedsApprovalPayload}. */
export interface NeedsApprovalPayload {
  status: 'needs-approval'
  pendingId: string
  actionName: string
  /** Server-composed human-readable summary — NEVER model-generated (FR-P2-WT-002). */
  humanSummary: string
  /** Validated tool input (the args the model supplied, post-schema check). */
  structuredArgs: object
}

/** Payload shape for AgentEvent{type:'system', payload:WriteResolvedPayload}. */
export interface WriteResolvedPayload {
  event: 'write_resolved'
  decision: 'approved' | 'rejected'
  actionName: string
  /** Echo of the pendingId from the chip for UI correlation. */
  pendingId: string
}

/** The answer wire shape carried on a re-POST resolving a pending question. DROPPED from the
 * P2 request flow's ask_user branch (P3) but the type stays for AgentRuntime.control's shape. */
export interface AgentAnswer {
  questionId: string
  optionId?: string
  freeText?: string
}

/** Extended SupabaseLike that also supports write operations (create_task/post_update). */
export interface SupabaseLikeWithWrites extends SupabaseLike {
  from(table: string): WriteTableOps
  schema(schemaName: string): { from(table: string): WriteTableOps }
}
