/**
 * agent-chat actions — the tool catalog v1 (T16): query_entity (read), create_task + post_update
 * (writes, confirm:true), compose_view (delegates to compose-view's composeSpec).
 *
 * Pure: all I/O is injected via DeputyContext (the caller-JWT supabase client). No Deno
 * globals; importable in Vitest (Node) with Supabase mocked.
 *
 * D2: query_entity reuses the P1 viewspec ENTITY_WHITELIST — the SAME trust boundary the
 * renderer compiles against; dispatch is schema-scoped (`ctx.supabase.schema(entry.schema)`,
 * the MOS delta vs the sibling reference's single-schema dispatch).
 * D6: AGENT_READ_ROW_CAP=50, READ_TIMEOUT_MS=5000.
 * FR-P2-WT-004: createdBy/author are NEVER model inputs — every write attributes to
 * ctx.personId (decoded from the caller's JWT by index.ts, D1), never a model-supplied value.
 */

import { ENTITY_WHITELIST } from '../../../mos-app/src/lib/viewspec/types.ts'
import type { AgentAction, DeputyContext, SupabaseLikeWithWrites } from '../../../mos-app/src/lib/agent/runtime/port.ts'
import {
  QUERY_ENTITY_SCHEMA, CREATE_TASK_SCHEMA, POST_UPDATE_SCHEMA, COMPOSE_VIEW_INPUT_SCHEMA, NOTIFY_SCHEMA,
  ASK_USER_SCHEMA,
} from './schema.ts'
import { composeSpec, ComposeSpecError } from '../compose-view/composeSpec.ts'
import type { ModelClient } from '../_shared/modelClient.ts'
import type { CompositionSpec } from '../../../mos-app/src/lib/viewspec/types.ts'
import { AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP } from './readEntities.ts'
import type { AgentReadEntity } from './readEntities.ts'

export { AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP }
export type { AgentReadEntity }

/** Wall-clock timeout for each DB read. D6. */
export const READ_TIMEOUT_MS = 5000

// ── query_entity — validated input shape (runtime) ───────────────────────────

interface QueryEntityFilter {
  column: string
  op: 'eq' | 'in'
  value: unknown
}

interface QueryEntityInput {
  entity: string
  columns?: string[]
  filter?: QueryEntityFilter
  limit?: number
  as?: 'table'
}

function timeoutPromise<T>(ms: number): Promise<T> {
  return new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error('query_entity read timeout')), ms),
  )
}

/**
 * Execute a whitelisted, row-capped read through the caller-JWT supabase client, schema-scoped
 * to the entity's own schema (D2). Returns a structured result (never throws to the handler).
 *
 * Validation order (AC-RT-001..004):
 *   1. entity in ENTITY_WHITELIST -> structured error if not.
 *   2. columns subset of entry.allowedColumns -> structured error if any unknown.
 *   3. filter column in entry.allowedColumns -> structured error if not (prevents a probe on a
 *      column excluded from the projection).
 *   4. apply row cap, filter, call ctx.supabase.schema(entry.schema).from(entry.table).
 */
export async function runQueryEntity(
  input: unknown,
  ctx: DeputyContext,
): Promise<{ rowCount: number; rows: unknown[] } | { error: string }> {
  const inp = input as QueryEntityInput

  // ── Step 1: entity whitelist check ────────────────────────────────────────
  const entityKey = inp.entity as AgentReadEntity
  if (!(AGENT_READ_ENTITIES as readonly string[]).includes(entityKey)) {
    return { error: `unknown entity: ${inp.entity}` }
  }

  const entry = ENTITY_WHITELIST[entityKey as keyof typeof ENTITY_WHITELIST]

  // ── Step 2: column whitelist check ────────────────────────────────────────
  const requestedCols = inp.columns ?? [...entry.allowedColumns]
  for (const col of requestedCols) {
    if (!entry.allowedColumns.has(col)) {
      return { error: `unknown column: ${col} on entity ${entityKey}` }
    }
  }

  // ── Step 3: filter column whitelist check ─────────────────────────────────
  // The SELECT projection is whitelisted in step 2. The FILTER column must also be in
  // allowedColumns — otherwise a prompt-injected tool call could filter on any real column
  // (including intentionally excluded ones) and use rowCount as a boolean oracle.
  if (inp.filter && !entry.allowedColumns.has(inp.filter.column)) {
    return { error: `unknown filter column: ${inp.filter.column} on entity ${entityKey}` }
  }

  // ── Step 4: build the schema-scoped query (D2 MOS delta) ──────────────────
  const effLimit = Math.min(inp.limit ?? AGENT_READ_ROW_CAP, AGENT_READ_ROW_CAP)
  const colsStr = requestedCols.join(',')
  const builder = ctx.supabase.schema(entry.schema).from(entry.table).select(colsStr)

  let query: PromiseLike<{ data: unknown[] | null; error: unknown }>

  if (inp.filter) {
    const { column, op, value } = inp.filter
    if (op === 'eq') {
      query = builder.eq(column, String(value)).limit(effLimit)
    } else if (op === 'in') {
      const vals = Array.isArray(value) ? value.map(String) : [String(value)]
      query = builder.in(column, vals).limit(effLimit)
    } else {
      return { error: `unsupported filter op: ${op}` }
    }
  } else {
    query = builder.limit(effLimit)
  }

  // ── Step 5: race against timeout (D6) ─────────────────────────────────────
  let result: { data: unknown[] | null; error: unknown }
  try {
    result = await Promise.race([
      Promise.resolve(query),
      timeoutPromise<{ data: unknown[] | null; error: unknown }>(READ_TIMEOUT_MS),
    ])
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'query_entity read failed' }
  }

  if (result.error) {
    return { error: 'query_entity db error' }
  }

  const rows = result.data ?? []
  return { rowCount: rows.length, rows }
}

export const queryEntityAction: AgentAction = {
  name: 'query_entity',
  description: "Read the caller's own rows from a whitelisted entity. RLS-scoped; row-capped; read-only.",
  inputSchema: QUERY_ENTITY_SCHEMA,
  surfaces: ['agent'],
  confirm: false,
  run: (input: unknown, ctx: DeputyContext) => runQueryEntity(input, ctx),
}

// ── create_task (write, confirm:true) — FR-P2-WT-001/002/004 ─────────────────

export interface CreateTaskInput {
  title: string
  businessUnitId: string
  responsiblePersonId: string
  accountablePersonId: string
  dueDate?: string
  objectiveId?: string
  workLineId?: string
  description?: string
}

function validateCreateTask(
  input: unknown,
): { ok: true; value: CreateTaskInput } | { ok: false; error: string } {
  const i = input as Partial<CreateTaskInput>
  if (typeof i?.title !== 'string' || !i.title.trim() || i.title.length > 300) {
    return { ok: false, error: 'title is required (max 300 chars)' }
  }
  if (typeof i?.businessUnitId !== 'string' || !i.businessUnitId) {
    return { ok: false, error: 'businessUnitId is required' }
  }
  if (typeof i?.responsiblePersonId !== 'string' || !i.responsiblePersonId) {
    return { ok: false, error: 'responsiblePersonId is required' }
  }
  if (typeof i?.accountablePersonId !== 'string' || !i.accountablePersonId) {
    return { ok: false, error: 'accountablePersonId is required' }
  }
  if (i.description !== undefined && (typeof i.description !== 'string' || i.description.length > 2000)) {
    return { ok: false, error: 'description must be a string (max 2000 chars)' }
  }
  return {
    ok: true,
    value: {
      title: i.title,
      businessUnitId: i.businessUnitId,
      responsiblePersonId: i.responsiblePersonId,
      accountablePersonId: i.accountablePersonId,
      dueDate: i.dueDate,
      objectiveId: i.objectiveId,
      workLineId: i.workLineId,
      description: i.description,
    },
  }
}

export const createTaskAction: AgentAction & {
  validate: (input: unknown) => { ok: true; value: CreateTaskInput } | { ok: false; error: string }
  summarize: (input: CreateTaskInput) => string
} = {
  name: 'create_task',
  description: 'Create a new task (title, business unit, R/A people). Requires user approval.',
  inputSchema: CREATE_TASK_SCHEMA,
  surfaces: ['agent'],
  confirm: true,
  validate: validateCreateTask,
  summarize: (i) => `Create task "${i.title}" (R: ${i.responsiblePersonId}, A: ${i.accountablePersonId}, BU: ${i.businessUnitId})`,
  run: async (input: unknown, ctx: DeputyContext) => {
    const v = validateCreateTask(input)
    if (v.ok === false) return { error: v.error }
    // Cast: DeputyContext.supabase is typed SupabaseLike (read-only); write actions need the
    // extended SupabaseLikeWithWrites shape (insert/update), which the real caller-JWT client
    // always supports at runtime.
    const sb = ctx.supabase as unknown as SupabaseLikeWithWrites
    const { title, businessUnitId, responsiblePersonId, accountablePersonId, dueDate, objectiveId, workLineId, description } = v.value
    // createdBy = caller person_id (FR-P2-WT-004) — NEVER the model's (ignores any
    // input.createdBy the model may have forged into the tool call).
    const { data, error } = await sb
      .schema('mos')
      .from('tasks')
      .insert({
        title,
        business_unit_id: businessUnitId,
        responsible_person_id: responsiblePersonId,
        accountable_person_id: accountablePersonId,
        created_by: ctx.personId,
        due_date: dueDate ?? null,
        objective_id: objectiveId ?? null,
        work_line_id: workLineId ?? null,
        description: description ?? null,
        consulted_person_ids: [],
        informed_person_ids: [],
      })
      .select('id')
      .single()
    if (error) return { error: 'write_failed' }
    const id = (data as { id?: string }).id
    // Mirror createTask's DAL (tasks.ts) — logs a `created` task_event under the same caller JWT.
    await sb.schema('mos').from('task_events').insert({
      task_id: id,
      actor_person_id: ctx.personId,
      event_type: 'created',
    }).select().single()
    return { id }
  },
}

// ── post_update (write, confirm:true) — add-line only, Director decision 2 ───

export interface PostUpdateInput {
  label: string
  progress: 'done' | 'in_progress' | 'blocked'
  weekStart?: string
}

function validatePostUpdate(
  input: unknown,
): { ok: true; value: PostUpdateInput } | { ok: false; error: string } {
  const i = input as Partial<PostUpdateInput>
  if (typeof i?.label !== 'string' || !i.label.trim() || i.label.length > 300) {
    return { ok: false, error: 'label is required (max 300 chars)' }
  }
  if (typeof i?.progress !== 'string' || !['done', 'in_progress', 'blocked'].includes(i.progress)) {
    return { ok: false, error: 'progress must be done|in_progress|blocked' }
  }
  return { ok: true, value: { label: i.label, progress: i.progress, weekStart: i.weekStart } }
}

/** ISO Monday date for "now" in Asia/Jakarta (UTC+7, no DST) — matches the SPA's week convention. */
function currentMondayJakarta(now: Date = new Date()): string {
  const jakartaMs = now.getTime() + 7 * 60 * 60 * 1000
  const jakarta = new Date(jakartaMs)
  const day = jakarta.getUTCDay() // 0=Sun..6=Sat, in the shifted "Jakarta" clock
  const diffToMonday = day === 0 ? 6 : day - 1
  const monday = new Date(jakarta)
  monday.setUTCDate(jakarta.getUTCDate() - diffToMonday)
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`
}

export const postUpdateAction: AgentAction & {
  validate: (input: unknown) => { ok: true; value: PostUpdateInput } | { ok: false; error: string }
  summarize: (input: PostUpdateInput) => string
} = {
  name: 'post_update',
  description: "Add one line to the caller's current weekly update draft. Requires user approval.",
  inputSchema: POST_UPDATE_SCHEMA,
  surfaces: ['agent'],
  confirm: true,
  validate: validatePostUpdate,
  summarize: (i) => `Add update line "${i.label}" (${i.progress}) to your week of ${i.weekStart ?? currentMondayJakarta()}`,
  run: async (input: unknown, ctx: DeputyContext) => {
    const v = validatePostUpdate(input)
    if (v.ok === false) return { error: v.error }
    const sb = ctx.supabase as unknown as SupabaseLikeWithWrites
    const weekStart = v.value.weekStart ?? currentMondayJakarta()

    // Ensure a draft weekly_update exists for (personId, weekStart) — mirrors weekly-updates.ts
    // upsertDraft. RLS requires it be the caller's own; the DB stamps org_id.
    const existing = await sb
      .schema('mos')
      .from('weekly_updates')
      .select('id,status')
      .eq('person_id', ctx.personId)
      .eq('week_start', weekStart)
      .maybeSingle()

    let updateId: string
    if (existing.error) return { error: 'write_failed' }
    if (existing.data) {
      updateId = (existing.data as { id: string }).id
    } else {
      const ins = await sb
        .schema('mos')
        .from('weekly_updates')
        .insert({ person_id: ctx.personId, week_start: weekStart, summary: '', status: 'draft', created_by: ctx.personId })
        .select('id')
        .single()
      if (ins.error) return { error: 'write_failed' }
      updateId = (ins.data as { id: string }).id
    }

    const { data, error } = await sb
      .schema('mos')
      .from('weekly_update_items')
      .insert({ weekly_update_id: updateId, label: v.value.label, progress: v.value.progress, position: 0 })
      .select('id')
      .single()
    if (error) return { error: 'write_failed' }
    return { id: (data as { id?: string }).id }
  },
}

// ── compose_view (delegates to compose-view's composeSpec, ADR-0041-analog seam) ─

/** Extra deps for the model-calling compose action. */
export interface ComposeActionDeps {
  /** The vendor-neutral model client, curried in by the handler at dispatch. */
  modelClient: ModelClient
  /** The resolved model id for this call. */
  model: string
}

export type ComposeResult =
  | { spec: CompositionSpec; repairAttempts: number; tokensUsed: number; title: string }
  | { error: string; code: 'REPAIR_EXHAUSTED' | 'UPSTREAM_ERROR' }

/**
 * Derive a short, human-readable view title from the user's prompt.
 * Trims, capitalizes the first character, and truncates to <=60 chars. No model round-trip.
 */
export function deriveTitle(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return ''
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  return capitalized.slice(0, 60)
}

/**
 * Run the compose_view action with injected model-client deps. Called by the handler's dispatch
 * branch with { modelClient: deps.modelClient, model: deps.model }. Returns a structured result
 * (never throws to the handler).
 */
export async function runComposeView(
  input: { prompt: string },
  ctx: DeputyContext,
  deps: ComposeActionDeps,
): Promise<ComposeResult> {
  try {
    const { spec, repairAttempts, tokensUsed } = await composeSpec(
      input.prompt,
      ctx.orgId,
      { modelClient: deps.modelClient, personId: ctx.personId, model: deps.model },
    )
    return { spec, repairAttempts, tokensUsed, title: deriveTitle(input.prompt) }
  } catch (e) {
    const code = e instanceof ComposeSpecError ? e.code : 'UPSTREAM_ERROR'
    return { error: 'compose failed', code }
  }
}

/**
 * composeViewAction — the catalog entry for the compose_view tool.
 * run is a guard stub — the handler NEVER calls this via dispatchAction; it calls
 * runComposeView(input, ctx, {modelClient, model}) directly (model-calling-action seam).
 */
export const composeViewAction: AgentAction = {
  name: 'compose_view',
  description: "Compose a validated dashboard view from the user's natural-language request.",
  inputSchema: COMPOSE_VIEW_INPUT_SCHEMA,
  surfaces: ['agent'],
  confirm: false,
  run: () => {
    throw new Error(
      'compose_view is dispatched by the handler with injected modelClient deps; never call run() directly',
    )
  },
}

// ── notify (P3a; self-notification, confirm:false) — FR-P3-NT-001/002 ────────

export interface NotifyInput {
  title: string
  body?: string
  severity?: 'info' | 'warning' | 'critical'
}

function validateNotify(
  input: unknown,
): { ok: true; value: NotifyInput } | { ok: false; error: string } {
  const i = input as Partial<NotifyInput>
  if (typeof i?.title !== 'string' || !i.title.trim() || i.title.length > 200) {
    return { ok: false, error: 'title is required (max 200 chars)' }
  }
  if (i?.body !== undefined && (typeof i.body !== 'string' || i.body.length > 2000)) {
    return { ok: false, error: 'body must be a string (max 2000 chars)' }
  }
  if (i?.severity !== undefined && !['info', 'warning', 'critical'].includes(i.severity)) {
    return { ok: false, error: 'severity must be info|warning|critical' }
  }
  return { ok: true, value: { title: i.title, body: i.body, severity: i.severity } }
}

export const notifyAction: AgentAction & {
  validate: (input: unknown) => { ok: true; value: NotifyInput } | { ok: false; error: string }
} = {
  name: 'notify',
  description: 'Drop a note into your OWN inbox (e.g. a reminder). Only notifies you, no one else.',
  inputSchema: NOTIFY_SCHEMA,
  surfaces: ['agent'],
  confirm: false, // self-only inbox write — not a consequential external action
  validate: validateNotify,
  run: async (input: unknown, ctx: DeputyContext) => {
    const v = validateNotify(input)
    if (v.ok === false) return { error: v.error }
    const sb = ctx.supabase as unknown as SupabaseLikeWithWrites
    // owner_id/org_id are OMITTED — the DB defaults (current_person_id / current_org_id) + RLS
    // WITH CHECK pin the row to the caller. The model can never address another person here.
    const { data, error } = await sb
      .schema('mos')
      .from('notifications')
      .insert({
        severity: v.value.severity ?? 'info',
        title: v.value.title,
        body: v.value.body ?? null,
      })
      .select('id')
      .single()
    if (error) return { error: 'write_failed' }
    return { id: (data as { id?: string }).id }
  },
}

// ── ask_user (P3a; clarifying-question contract, ADR-0045 §2 port) — FR-P3-AU-001 ────────────
//
// askUserAction is a GUARD STUB — the handler NEVER calls this via dispatchAction/
// dispatchActionForced. The runToolLoop dispatch branch (T19) intercepts `toolName==='ask_user'`
// BEFORE the actionByName lookup and emits a status{kind:'question'} event + ends the stream
// directly. This catalog entry exists only so ask_user appears in the model's tool list (buildTools
// iterates BASE_ACTIONS to build the JSON-schema tool catalog) — its `run` is never invoked.
// confirm is OMITTED (falsy): ask_user is NOT a write tool, so it must never be routed through the
// A3 propose/approval-chip branch — it is a question/answer turn, resolved by control('answer').
export const askUserAction: AgentAction = {
  name: 'ask_user',
  description: 'Ask the user a clarifying question with tappable option chips (and optionally free text) before proceeding.',
  inputSchema: ASK_USER_SCHEMA,
  surfaces: ['agent'],
  run: () => {
    throw new Error(
      'ask_user is dispatched specially by runToolLoop (a status{kind:"question"} emit); never call run() directly',
    )
  },
}

// ── BASE_ACTIONS — the catalog. P2: query/create_task/post_update. P3a adds notify (self-only,
// caller-JWT, gated by the SHOW_ASSISTANT panel flag like the rest) + ask_user (clarifying
// question; guard-stub run, dispatched specially by the handler). Still NO provisioning tool
// (FR-P2-WT-005).
export const BASE_ACTIONS: AgentAction[] = [
  queryEntityAction,
  createTaskAction,
  postUpdateAction,
  notifyAction,
  askUserAction,
]
