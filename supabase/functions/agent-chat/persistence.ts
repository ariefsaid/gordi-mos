/**
 * agent-chat persistence — pure caller-JWT persistence helpers (T15, FR-P2-PS-*, FR-P2-OB-001).
 *
 * Deputy invariant by construction (AC-P2-DI-002): every function here takes the ALREADY-
 * INJECTED HandlerSupabaseLike (the same caller-JWT client index.ts binds as `callerClient`) —
 * this module never constructs a Supabase client and never references `service_role`. Owner RLS
 * (migration 20260705000003_mos_agent_persistence.sql) is the enforcement authority; these
 * functions never send `org_id`/`owner_id` explicitly (column defaults + WITH CHECK pin them).
 *
 * MOS delta vs the sibling reference (T15): the reference is single-schema (`public`); MOS
 * persistence writes go to the `mos` schema via `.schema('mos').from(table)` — the caller-JWT
 * deputy client is pinned to `shared` by default (mirrors the P1 executor's schema-scoped
 * dispatch), so every persistence call here explicitly selects `mos`.
 *
 * Security forward-flags (binding for this module):
 *   - hashToolArgs canonicalizes a VALIDATED args object (post-schema, sorted keys) — never raw/
 *     untrusted model output. Canonicalization never spreads/merges the caller-supplied object;
 *     it walks it read-only and rebuilds a fresh plain object, so a prototype-pollution key
 *     (`__proto__`/`constructor`/`prototype`) in the model-supplied args can never taint
 *     Object.prototype.
 */

import { createHash } from 'node:crypto'
import { MAX_RUN_EVENTS_READ, readEventPages } from './replay.ts'
export { MAX_RUN_EVENTS_READ } from './replay.ts'

// ── HandlerSupabaseLike — the schema-scoped, caller-JWT interface (T15/T16/T17 share this) ──

/**
 * Minimal Supabase-like interface for the deputy's persistence writes (mos-schema) AND its
 * read-tool dispatch (shared/mos/reporting-schema reads, T16). `.schema(s)` is the MOS delta —
 * the real `@supabase/supabase-js` client satisfies this natively (`.schema()` is a real method).
 *
 * `PromiseLike` (not `Promise`): the real query builder is a thenable but its declared TS type
 * is not nominally a `Promise` under Deno's stricter structural check — `PromiseLike<T>` needs
 * only `.then()`, which both the real client and every test's plain-object mock provide.
 */
export interface HandlerSupabaseLike {
  from(table: string): SchemaTableOps
  schema(schemaName: string): {
    from(table: string): SchemaTableOps
    rpc?(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
  }
}

interface SchemaTableOps {
  select(columns: string): {
    eq(column: string, value: string): {
      single(): PromiseLike<{ data: unknown; error: unknown }>
      maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>
      limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }>
      in(column: string, values: string[]): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }> }
      eq(column2: string, value2: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> }
      order(column: string, opts?: { ascending?: boolean }): {
        limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }>
        range(start: number, end: number): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }> }
      }
    }
    in(column: string, values: string[]): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }> }
    limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }>
  }
  insert(row: object): {
    select(columns?: string): {
      single(): PromiseLike<{ data: unknown; error: unknown }>
    }
  }
  update(patch: object): {
    eq(column: string, value: string): PromiseLike<{ data: unknown; error: unknown }>
  }
}

// ── hashToolArgs — sha-256 hex of canonicalized (sorted-key) JSON ────────────

/**
 * Recursively rebuild `value` with object keys sorted (stable order), WITHOUT ever spreading or
 * merging the input — each output object is a fresh `{}` populated key-by-key from the sorted
 * key list, so a `__proto__`/`constructor`/`prototype` key present on the (untrusted, already
 * schema-validated) input can never reach the new object's prototype chain.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
      out[key] = canonicalize((value as Record<string, unknown>)[key])
    }
    return out
  }
  return value
}

/**
 * sha-256 hex digest of the canonicalized (sorted-key) JSON of validatedArgs.
 * Callers must pass the post-schema-validation value, never raw model output (FR-P2-OB-001).
 */
export function hashToolArgs(validatedArgs: unknown): string {
  const canonical = canonicalize(validatedArgs)
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

// ── PersistenceDeps ───────────────────────────────────────────────────────────

/**
 * The single persistence-dep shape passed from index.ts (bound to callerClient) and consumed by
 * handler.ts. Constructs no client, takes no service_role parameter, by construction.
 */
export interface PersistenceDeps {
  supabase: HandlerSupabaseLike
  ownerId: string
  orgId: string
  now: () => Date
}

export interface JournaledWrite {
  toolName: string
  argsHash: string
  payload: unknown
}

/**
 * Minimal shape of a streamed AgentEvent this module persists a mirror row for — a structural
 * subset of the runtime port's `AgentEvent` (T21); `createdAt` is accepted (the real event
 * carries it) but not read here (the DB stamps its own `created_at`). P3a (migration
 * 20260706000001) widened agent_events.type to also admit 'user' (the echoed user turn) and
 * 'artifact' (compose_view journal) so deep replay can rebuild ModelMessage[] (AC-P3-RP-002).
 */
export interface PersistableEvent {
  id: string
  runId: string
  type: 'user' | 'assistant' | 'tool' | 'artifact' | 'status' | 'system'
  text?: string
  payload?: unknown
  createdAt?: string
}

export type AgentRunStatusLike = 'running' | 'needs-approval' | 'completed' | 'error' | 'cancelled'

// ── createThreadAndRun — FR-P2-PS-001 ───────────────────────────────────────

/**
 * Create a new mos.agent_threads row (if the run is genuinely new) and a mos.agent_runs row
 * under it, both under the caller's JWT (owner RLS stamps owner_id/org_id via column default +
 * WITH CHECK — never sent explicitly here). Rejects failures before the model turn; the handler emits a safe terminal error.
 */
export async function createThreadAndRun(
  deps: PersistenceDeps,
  input: { runId: string; title: string },
): Promise<void> {
  try {
    const { data: thread, error: threadError } = await deps.supabase
      .schema('mos').from('agent_threads').insert({ title: input.title }).select().single()
    const threadId = (thread as { id?: string } | null)?.id
    if (threadError || !threadId) throw new Error('PERSISTENCE_UNAVAILABLE')
    const { data: run, error: runError } = await deps.supabase
      .schema('mos').from('agent_runs')
      .insert({ id: input.runId, thread_id: threadId, status: 'running', route: {} })
      .select().single()
    if (runError || !run) throw new Error('PERSISTENCE_UNAVAILABLE')
  } catch {
    throw new Error('PERSISTENCE_UNAVAILABLE')
  }
}

// ── insertEvent — FR-P2-PS-003, FR-P2-OB-001 ──────────────────────────────────

/** Tool-call journal fields — populated in the SAME insert as the event row (FR-P2-OB-001). */
export interface ToolJournal {
  toolName: string
  argsHash: string
  status: 'completed' | 'errored'
}

/** Insert the event and its optional tool journal together; reject failures before continuing. */
export async function insertEvent(
  deps: PersistenceDeps,
  runId: string,
  seq: number,
  ev: PersistableEvent,
  journal?: ToolJournal,
): Promise<void> {
  try {
    const { error } = await deps.supabase
      .schema('mos')
      .from('agent_events')
      .insert({
        id: ev.id,
        run_id: runId,
        seq,
        type: ev.type,
        text: ev.text ?? null,
        payload: ev.payload ?? {},
        ...(journal
          ? { tool_name: journal.toolName, tool_args_hash: journal.argsHash, tool_status: journal.status }
          : {}),
      })
      .select()
      .single()
    if (error) throw new Error('PERSISTENCE_UNAVAILABLE')
  } catch {
    throw new Error('PERSISTENCE_UNAVAILABLE')
  }
}

/** Commit an approved business write and its completed event under the same caller JWT. */
export async function completeApprovedWrite(
  deps: PersistenceDeps,
  event: PersistableEvent,
  seq: number,
  input: { toolName: string; pendingId: string; toolCallId: string; args: unknown },
): Promise<{ id: string }> {
  if (input.toolName !== 'create_task' && input.toolName !== 'post_update') {
    throw new Error('PERSISTENCE_UNAVAILABLE')
  }
  const schema = deps.supabase.schema('mos')
  if (!schema.rpc) throw new Error('PERSISTENCE_UNAVAILABLE')
  const { data, error } = await schema.rpc('execute_agent_approved_write', {
    p_run_id: event.runId,
    p_event_id: event.id,
    p_seq: seq,
    p_pending_id: input.pendingId,
    p_tool_call_id: input.toolCallId,
    p_name: input.toolName,
    p_args: input.args,
    p_args_hash: hashToolArgs(input.args),
  })
  const completion = data as { result?: { id?: unknown }; replayed?: unknown } | null
  if (error || typeof completion?.result?.id !== 'string' || typeof completion.replayed !== 'boolean') {
    throw new Error('PERSISTENCE_UNAVAILABLE')
  }
  return completion.result as { id: string }
}

// ── heartbeat — keeps a run's updated_at fresh each tool round ───────────────

/**
 * UPDATE mos.agent_runs (a cheap PK-scoped write) once per tool round / model turn. Swallowed
 * on error: a transient heartbeat failure does not affect this round's behavior; the next round
 * simply retries.
 */
export async function heartbeat(
  deps: PersistenceDeps,
  runId: string,
  _step?: string,
): Promise<void> {
  try {
    const { error } = await deps.supabase
      .schema('mos')
      .from('agent_runs')
      .update({ updated_at: deps.now().toISOString() })
      .eq('id', runId)
    if (error) {
      console.error('[agent-chat] persistence heartbeat failed', {
        code: (error as { code?: string }).code,
      })
    }
  } catch (err) {
    console.error('[agent-chat] persistence heartbeat threw', {
      code: err instanceof Error ? err.name : 'unknown',
    })
  }
}

// ── setRunStatus — FR-P2-PS status transitions ────────────────────────────────

/** Persist a (terminal or any) status onto mos.agent_runs.status. Swallows errors. */
export async function setRunStatus(
  deps: PersistenceDeps,
  runId: string,
  status: AgentRunStatusLike,
): Promise<void> {
  try {
    const { error } = await deps.supabase.schema('mos').from('agent_runs').update({ status }).eq('id', runId)
    if (error) {
      console.error('[agent-chat] persistence setRunStatus failed', {
        code: (error as { code?: string }).code,
      })
    }
  } catch (err) {
    console.error('[agent-chat] persistence setRunStatus threw', {
      code: err instanceof Error ? err.name : 'unknown',
    })
  }
}

// ── loadMaxSeq — seq continuity across requests ───────────────────────────────

/**
 * Load the highest `seq` already persisted for `runId` (or -1 when the run has no persisted
 * events yet). A resumed request (a decision re-POST) MUST seed its in-request seq counter from
 * `maxSeq + 1` — otherwise the new turn's events collide with the prior turn's already-persisted
 * seq values (`agent_events (run_id, seq)` is unique). Read failures reject instead of resetting
 * sequence continuity.
 *
 * CQ#5: orders by seq descending + limit(1) — the top row IS the max — rather than reading up to
 * MAX_RUN_EVENTS_READ rows and Math.max-ing client-side. Uses the `(run_id, seq)` index for an
 * O(1) lookup instead of an O(n) table scan.
 */
export async function loadMaxSeq(deps: PersistenceDeps, runId: string): Promise<number> {
  try {
    const { data, error } = await deps.supabase
      .schema('mos')
      .from('agent_events')
      .select('seq')
      .eq('run_id', runId)
      .order('seq', { ascending: false })
      .limit(1)
    if (error || !data) throw new Error('PERSISTENCE_UNAVAILABLE')
    const seqs = (data as Array<{ seq?: number }>).map((row) => row.seq ?? -1)
    return seqs.length > 0 ? seqs[0] : -1
  } catch {
    throw new Error('PERSISTENCE_UNAVAILABLE')
  }
}

// ── loadJournaledWrites — resume de-dupe gate ─────────────────────────────────

/**
 * Load a run's completed tool-call journal entries (type='tool', tool_status='completed') for
 * the resume de-dupe gate and resume context injection. Read failures reject before any action.
 */
export async function loadJournaledWrites(
  deps: PersistenceDeps,
  runId: string,
): Promise<JournaledWrite[]> {
  const rows = await readEventPages(offset => deps.supabase
    .schema('mos')
    .from('agent_events')
    .select('tool_name, tool_args_hash, tool_status, payload')
    .eq('run_id', runId)
    .order('seq', { ascending: true })
    .range(offset, offset + MAX_RUN_EVENTS_READ - 1)
    .limit(MAX_RUN_EVENTS_READ))
  return (rows as Array<Record<string, unknown>>)
    .filter(row => row.tool_status === 'completed' && row.tool_name && row.tool_args_hash)
    .map(row => ({ toolName: row.tool_name as string, argsHash: row.tool_args_hash as string, payload: row.payload }))
}
