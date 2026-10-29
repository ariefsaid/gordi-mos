/**
 * agentChatHandler — pure async generator for the agent-chat edge function (T17, D7).
 *
 * Pure: all I/O injected via HandlerDeps. No Deno globals, no process.env.
 * Importable in Vitest (Node) with the ModelClient + Supabase mocked.
 *
 * D7: handler is CI-testable; index.ts (Deno.serve) is not.
 * MAX_TOOL_ROUNDS=8 -> terminal completed (not errored) with "reached step limit".
 *
 * Approve/deny (FR-P2-WT-001..004):
 *   - confirm:true action -> persist its validated args and emit needs-approval + END stream.
 *   - On next POST, consume the owner's unexpired pending id and execute only its stored args.
 *     read dispatch uses action.run; approved writes use the caller transaction RPC.
 *
 * D1 delta vs the sibling reference: there is no `profiles` lookup gate (2) — orgId/personId/
 * accessRoles arrive on HandlerDeps, already decoded from the caller's JWT by index.ts.
 *
 * P2 scope (§0): DROPS vs the sibling reference — ask_user/
 * handleAnswer (P3), buildDataTableWidgetFromQueryResult (P3, ADR-0045 widget), buildGroundingHint/
 * narrowEntityScope (P3 live-context — RunContext carries only `route` in P2, no entity prompt
 * injection).
 */

import {
  BASE_ACTIONS, composeViewAction, runComposeView, AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP,
} from './actions.ts'
import { buildAgentSystemPrompt } from './prompt.ts'
import {
  hashToolArgs, createThreadAndRun, insertEvent, heartbeat, setRunStatus, loadMaxSeq, loadJournaledWrites, completeApprovedWrite,
} from './persistence.ts'
import type { PersistenceDeps, ToolJournal, HandlerSupabaseLike } from './persistence.ts'
import { replayRunHistory } from './replay.ts'
import { AGENT_PENDING_ACTION_TTL_MS } from './pendingActions.ts'
import type { PendingActionStore } from './pendingActions.ts'
import type { ModelClient, ModelMessage, ModelTool } from '../_shared/modelClient.ts'
import type { AgentEvent, AgentRunStatus, AgentAction, DeputyContext, SupabaseLike } from '../../../mos-app/src/lib/agent/runtime/port.ts'
import type { AgentChatRequest, ConversationMessage } from '../../../mos-app/src/lib/agent/runtime/transport.ts'
import {
  buildDataTableWidgetFromQueryResult,
  buildInsightWidgetFromQueryResult,
  buildChartWidgetFromQueryResult,
} from '../../../mos-app/src/lib/agent/widgets.ts'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Hard cap on tool-use rounds per run. */
export const MAX_TOOL_ROUNDS = 8

/**
 * SEC-Medium (DoS): a client-supplied transcript is trusted as the full conversation history
 * (the server is stateless — D8-analog, see file header). Without a cap, an unbounded
 * `req.messages` array reaches the model call directly (cost + latency abuse). Mirrors
 * compose-view's prompt-length gate (400 BEFORE any model call).
 */
export const MAX_TRANSCRIPT_MESSAGES = 40
export const MAX_TRANSCRIPT_BYTES = 32 * 1024

const BASE_ACTION_BY_NAME = new Map<string, AgentAction>(BASE_ACTIONS.map((a) => [a.name, a]))

/** True when req.messages exceeds either the message-count or total-byte cap. */
function transcriptExceedsCap(messages: ConversationMessage[]): boolean {
  if (messages.length > MAX_TRANSCRIPT_MESSAGES) return true
  const bytes = new TextEncoder().encode(JSON.stringify(messages)).length
  return bytes > MAX_TRANSCRIPT_BYTES
}

// ── Injected interfaces ────────────────────────────────────────────────────────

export type { HandlerSupabaseLike }

export interface HandlerDeps {
  /** Vendor-neutral model client. */
  modelClient: ModelClient
  /** Resolved model id for this call. */
  model: string
  supabase: HandlerSupabaseLike
  userId: string
  /** Caller person_id, decoded from the JWT by index.ts (D1 — no profiles lookup). */
  personId: string
  /** Caller org_id, decoded from the JWT by index.ts (D1). */
  orgId: string
  /** Caller access_roles, decoded from the JWT by index.ts (D1). */
  accessRoles: string[]
  now?: () => Date
  /** Flag-gated compose_view tool registration. */
  composeEnabled?: boolean
  /** Durable, owner-bound approval storage. Missing storage fails closed for write actions. */
  pendingActions?: PendingActionStore
  /**
   * Optional conversation persistence. Approved business writes require it; reads can run
   * with persistence disabled. Existing run sequence and journal reads use the caller JWT.
   */
  persistence?: PersistenceDeps
}

// ── Event builders ─────────────────────────────────────────────────────────────

function mkEvent(
  runId: string,
  type: AgentEvent['type'],
  fields: Partial<Omit<AgentEvent, 'id' | 'runId' | 'type' | 'createdAt'>>,
  now: () => Date,
): AgentEvent {
  return { id: crypto.randomUUID(), runId, type, createdAt: now().toISOString(), ...fields }
}

// ── Persistence runtime ────────────────────────────────────────────────────────

interface PersistenceRuntime {
  deps: PersistenceDeps
  nextSeq(): number
  committedEvents: WeakSet<AgentEvent>
}

function makePersistenceRuntime(deps: PersistenceDeps | undefined, startSeq: number): PersistenceRuntime | undefined {
  if (!deps) return undefined
  let seq = startSeq
  return { deps, nextSeq: () => seq++, committedEvents: new WeakSet() }
}

/**
 * agent_events.type is DB-constrained to ('user','assistant','tool','artifact','status','system')
 * (migration 20260706000001 widened the P2 4-value check for P3a replay, §3.1 #1). All six types are
 * mirrored as a row — the echoed `user` turn and `artifact` (compose_view) are journaled too, so
 * deep thread-history replay can rebuild the full ModelMessage[] the model expects (AC-P3-RP-002).
 * A `user`/`artifact` row is fully immutable exactly like tool/status/system (the feedback-only
 * trigger rejects any non-rating drift on non-assistant rows).
 */
function isPersistableEvent(
  ev: AgentEvent,
): ev is AgentEvent & { type: 'user' | 'assistant' | 'tool' | 'artifact' | 'status' | 'system' } {
  return ev.type === 'user' || ev.type === 'assistant' || ev.type === 'tool' || ev.type === 'artifact' || ev.type === 'status' || ev.type === 'system'
}

/**
 * Wrap an inner AgentEvent generator so every PERSISTABLE event (see isPersistableEvent) is
 * ALSO persisted as an agent_events row (FR-P2-PS-003), with journal columns populated on
 * `type==='tool'` (FR-P2-OB-001 — same insert, never a follow-up UPDATE) and the terminal status
 * persisted onto agent_runs.status when a `status` event carries a terminal value. A no-op
 * passthrough when `persist` is undefined.
 */
async function* withPersistence(
  inner: AsyncGenerator<AgentEvent>,
  persist: PersistenceRuntime | undefined,
  runId: string,
): AsyncGenerator<AgentEvent> {
  for await (const ev of inner) {
    if (persist && isPersistableEvent(ev) && !persist.committedEvents.has(ev)) {
      let journal: ToolJournal | undefined
      if (ev.type === 'tool') {
        const payload = ev.payload as { name?: string; input?: unknown; result?: unknown } | undefined
        if (payload?.name) {
          const argsHash = hashToolArgs(payload.input ?? {})
          const status = payload.result && typeof payload.result === 'object' && 'error' in (payload.result as object)
            ? ('errored' as const)
            : ('completed' as const)
          journal = { toolName: payload.name, argsHash, status }
        }
      }
      await insertEvent(persist.deps, runId, persist.nextSeq(), ev, journal)
      if (ev.type === 'status') {
        const statusPayload = ev.payload as { status?: AgentRunStatus } | undefined
        if (statusPayload?.status === 'completed' || statusPayload?.status === 'error' || statusPayload?.status === 'cancelled') {
          await setRunStatus(persist.deps, runId, statusPayload.status)
        }
      }
    }
    yield ev
  }
}

// ── Dispatch helpers ───────────────────────────────────────────────────────────

/** The ONLY site that may call action.run on a confirm:false action. */
async function dispatchAction(action: AgentAction, toolInput: unknown, ctx: DeputyContext): Promise<unknown> {
  if (action.confirm) {
    throw new Error(`dispatchAction: confirm:true action '${action.name}' must route through the approval branch`)
  }
  return action.run(toolInput, ctx)
}

// ── Tool catalog builder ───────────────────────────────────────────────────────

function buildTools(composeEnabled: boolean | undefined): ModelTool[] {
  const tools: ModelTool[] = BASE_ACTIONS.map((a) => ({
    type: 'function',
    function: { name: a.name, description: a.description, parameters: a.inputSchema },
  }))
  if (composeEnabled) {
    tools.push({
      type: 'function',
      function: { name: composeViewAction.name, description: composeViewAction.description, parameters: composeViewAction.inputSchema },
    })
  }
  return tools
}

// ── Shared tool-use loop ───────────────────────────────────────────────────────

interface RunToolLoopOptions {
  deps: HandlerDeps
  emit: (type: AgentEvent['type'], fields?: Partial<Omit<AgentEvent, 'id' | 'runId' | 'type' | 'createdAt'>>) => AgentEvent
  statusEvent: (status: AgentRunStatus, extra?: Record<string, unknown>, text?: string) => AgentEvent
  deputyCtx: DeputyContext
  messages: ModelMessage[]
  persist: PersistenceRuntime | undefined
  runId: string
  /** Whether compose_view is in the tool catalog + has a dispatch branch. */
  allowCompose: boolean
  /** Whether a confirm:true action may be proposed (needs-approval) from this loop. */
  allowProposeConfirm: boolean
  /** Behavior when finish_reason==='tool_calls' but tool_calls[0] is absent. */
  onMissingToolCall: 'continue-as-unknown' | 'complete'
}

async function* runToolLoop(opts: RunToolLoopOptions): AsyncGenerator<AgentEvent> {
  const { deps, emit, statusEvent, deputyCtx, messages, persist, runId, allowCompose, allowProposeConfirm, onMissingToolCall } = opts

  const tools = buildTools(allowCompose ? deps.composeEnabled : false)
  const actionByName = new Map<string, AgentAction>(BASE_ACTIONS.map((a) => [a.name, a]))

  let lastRoundMalformed = false

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (persist) await heartbeat(persist.deps, runId, `round-${round}`)

      const resp = await deps.modelClient.create({ model: deps.model, max_tokens: 2048, messages, tools })

      // P3a replay enrichment (AC-P3-RP-002, §3.1 #2): emit the assistant turn even when content is
      // empty but tool_calls is present (a pure tool-call turn), and carry the raw tool_calls in the
      // payload so replay can rebuild the assistant tool_use. P2 gated this on `content` only, so a
      // content=null tool-call turn emitted NO assistant event — replay then could not reconstruct
      // the model's turn. Guard: emit only when there is text OR tool_calls (never an empty no-op).
      const assistantText = resp.message.content ?? ''
      const assistantToolCalls = resp.message.tool_calls
      if (assistantText || (assistantToolCalls && assistantToolCalls.length > 0)) {
        yield emit('assistant', {
          text: assistantText,
          ...(assistantToolCalls && assistantToolCalls.length > 0
            ? { payload: { tool_calls: assistantToolCalls } }
            : {}),
        })
      }

      if (resp.finish_reason === 'length') {
        yield statusEvent(
          'completed',
          { model: resp.model, prompt_tokens: resp.usage?.prompt_tokens, completion_tokens: resp.usage?.completion_tokens, ...(resp.usage?.total_cost !== undefined ? { total_cost: resp.usage.total_cost } : {}) },
          'response truncated',
        )
        return
      }

      if (resp.finish_reason !== 'tool_calls') {
        yield statusEvent('completed', {
          model: resp.model,
          prompt_tokens: resp.usage?.prompt_tokens,
          completion_tokens: resp.usage?.completion_tokens,
          ...(resp.usage?.total_cost !== undefined ? { total_cost: resp.usage.total_cost } : {}),
        })
        return
      }

      const toolCall = resp.message.tool_calls?.[0]

      if (!toolCall && onMissingToolCall === 'complete') {
        yield statusEvent('completed', {
          model: resp.model,
          prompt_tokens: resp.usage?.prompt_tokens,
          completion_tokens: resp.usage?.completion_tokens,
          ...(resp.usage?.total_cost !== undefined ? { total_cost: resp.usage.total_cost } : {}),
        })
        return
      }

      let toolInput: unknown
      const toolId = toolCall?.id ?? 'tool-use-id'
      const toolName = toolCall?.function.name ?? ''

      messages.push({ role: 'assistant', content: resp.message.content, tool_calls: resp.message.tool_calls })

      if (toolCall) {
        try {
          toolInput = JSON.parse(toolCall.function.arguments)
          lastRoundMalformed = false
        } catch (e) {
          if (e instanceof SyntaxError) {
            lastRoundMalformed = true
            messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify({ error: 'malformed tool arguments' }) })
            continue
          }
          throw e
        }
      } else {
        toolInput = {}
        lastRoundMalformed = false
      }

      // ── compose_view dispatch (model-calling-action seam) ───────────────────
      if (allowCompose && toolName === 'compose_view' && deps.composeEnabled) {
        const out = await runComposeView(
          toolInput as { prompt: string },
          deputyCtx,
          { modelClient: deps.modelClient, model: deps.model },
        )

        if ('error' in out) {
          yield emit('assistant', { text: "I wasn't able to compose a valid view — try rephrasing your request." })
          messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify({ error: out.error, code: out.code }) })
        } else {
          yield emit('artifact', {
            payload: { kind: 'compose_view', spec: out.spec, repairAttempts: out.repairAttempts, title: out.title, tokensUsed: out.tokensUsed },
          })
          yield emit('tool', { payload: { name: toolName, input: toolInput, result: { ok: true, panels: out.spec.panels.length }, tool_call_id: toolId } })
          messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify({ ok: true, panels: out.spec.panels.length }) })
        }
        continue
      }

      // ── ask_user dispatch branch (P3a, FR-P3-AU-001) ────────────────────────
      // Same interaction family as the propose branch below (needs-approval): a structured
      // question pauses the run; the client resolves it via control('answer', ...), which
      // continues the SAME run (handleAnswer, below). Gated on allowProposeConfirm so the
      // decision-continuation pass cannot pose a SECOND pending question before the first
      // resolves (mirrors the confirm-action guard). NOT a write tool — no approval chip; this
      // rides the `status` channel but WITHOUT an AgentRunStatus `status` field of its own
      // (payload.kind distinguishes it, not payload.status).
      if (toolName === 'ask_user' && allowProposeConfirm) {
        const input = toolInput as { prompt?: string; options?: { id: string; label: string }[]; allowFreeText?: boolean }
        yield emit('status', {
          payload: {
            kind: 'question',
            questionId: crypto.randomUUID(),
            prompt: input.prompt ?? '',
            options: input.options ?? [],
            ...(input.allowFreeText !== undefined ? { allowFreeText: input.allowFreeText } : {}),
          },
        })
        // End the stream — the client re-POSTs with req.answer on the next turn (mirrors the
        // needs-approval propose branch ending the stream).
        return
      }

      const action = actionByName.get(toolName)

      if (!action || (action.confirm && !allowProposeConfirm)) {
        const errorMessage = !action ? `unknown action: ${toolName}` : `action '${toolName}' not available in this context`
        messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify({ error: errorMessage }) })
        continue
      }

      // ── Propose branch (confirm:true action in the normal loop) ─────────────
      if (action.confirm) {
        const writeAction = action as AgentAction & {
          validate: (i: unknown) => { ok: boolean; error?: string; value?: unknown }
          summarize: (i: unknown) => string
        }

        const validation = writeAction.validate(toolInput)
        if (!validation.ok) {
          messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify({ error: validation.error }) })
          continue
        }

        const pendingId = crypto.randomUUID()
        const humanSummary = writeAction.summarize(validation.value)
        const pendingActions = deps.pendingActions
        const stored = pendingActions
          ? await pendingActions.create({
            id: pendingId,
            actionName: action.name,
            args: validation.value,
            toolCallId: toolId,
            personId: deps.personId,
            orgId: deps.orgId,
            expiresAt: new Date((deps.now ?? (() => new Date()))().getTime() + AGENT_PENDING_ACTION_TTL_MS).toISOString(),
          })
          : false
        if (!stored) {
          yield statusEvent('error', { error: 'APPROVAL_STORAGE_UNAVAILABLE' })
          return
        }

        yield statusEvent('needs-approval', {
          pendingId, actionName: action.name, humanSummary, structuredArgs: validation.value as object,
        })
        return
      }

      // ── Read action (confirm:false) — dispatch immediately ──────────────────
      const toolResult = await dispatchAction(action, toolInput, deputyCtx)
      if (toolName === 'query_entity') {
        const widgetInput = toolInput as { entity?: unknown; columns?: unknown; as?: unknown }
        const widgetResult = toolResult as { rowCount?: unknown; rows?: unknown; error?: unknown }
        // Default to table when `as` is absent; unknown values also fall back to table (least lossy).
        const requestedAs = widgetInput.as === 'insight' || widgetInput.as === 'chart' ? widgetInput.as : 'table'
        const normalizedInput = { ...widgetInput, as: requestedAs }
        const widget =
          requestedAs === 'insight' ? buildInsightWidgetFromQueryResult(normalizedInput, widgetResult)
          : requestedAs === 'chart' ? buildChartWidgetFromQueryResult(normalizedInput, widgetResult)
          : buildDataTableWidgetFromQueryResult(normalizedInput, widgetResult)
        if (widget) {
          yield emit('artifact', { payload: widget })
        }
      }

      // tool_call_id (§3.1 #3): pairs this tool_result to the assistant tool_use on replay.
      yield emit('tool', { payload: { name: toolName, input: toolInput, result: toolResult, tool_call_id: toolId } })

      messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify(toolResult) })
    }

    if (lastRoundMalformed) {
      yield statusEvent('error', { error: 'MALFORMED_TOOL_CALL' })
      return
    }
    yield statusEvent('completed', {}, 'reached step limit')
  } catch {
    console.error('[agent-chat] UPSTREAM_ERROR', { errorCode: 'UPSTREAM_ERROR' })
    yield statusEvent('error', { error: 'UPSTREAM_ERROR' })
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

/**
 * agentChatHandler — the pure business-logic generator.
 *
 * Gate order (each gate yields terminal status and returns):
 *   (1) 401-equivalent UNAUTHORIZED — userId empty.
 *   (cancel) req.cancel present — server-side abort, no model call.
 *   (decision) req.decision present — approve/reject a pending write, no model call for the
 *       resolution itself (the continuation IS a genuine model call).
 *   (2) tool-use loop — up to MAX_TOOL_ROUNDS.
 *   (3) UPSTREAM_ERROR — model call throws; error scrubbed.
 */
export async function* agentChatHandler(
  req: AgentChatRequest,
  deps: HandlerDeps,
): AsyncIterable<AgentEvent> {
  const runId = req.runId ?? crypto.randomUUID()
  if (!deps.userId || transcriptExceedsCap(req.messages)) {
    yield* agentChatHandlerInner(req, deps, runId, undefined)
    return
  }

  try {
    const persistence = deps.persistence
    let startSeq = 0
    if (persistence) {
      const { data: existing, error } = req.runId
        ? await persistence.supabase.schema('mos').from('agent_runs').select('id').eq('id', runId).maybeSingle()
        : { data: null, error: null }
      if (error) throw new Error('PERSISTENCE_UNAVAILABLE')
      if (!existing) {
        if (req.replay || req.decision || req.answer || req.cancel) throw new Error('PERSISTENCE_UNAVAILABLE')
        const lastUser = req.messages.filter(message => message.role === 'user').at(-1)
        const title = typeof lastUser?.content === 'string' ? lastUser.content.slice(0, 60) : 'New conversation'
        await createThreadAndRun(persistence, { runId, title })
      }
      if (existing) {
        startSeq = (await loadMaxSeq(persistence, runId)) + 1
        await loadJournaledWrites(persistence, runId)
      }
    }
    const persist = makePersistenceRuntime(persistence, startSeq)
    yield* withPersistence(agentChatHandlerInner(req, deps, runId, persist), persist, runId)
  } catch {
    yield mkEvent(runId, 'status', { payload: { status: 'error', error: 'PERSISTENCE_UNAVAILABLE' } }, deps.now ?? (() => new Date()))
  }
}

async function* agentChatHandlerInner(
  req: AgentChatRequest,
  deps: HandlerDeps,
  runId: string,
  persist: PersistenceRuntime | undefined,
): AsyncGenerator<AgentEvent> {
  const now = deps.now ?? (() => new Date())

  const emit = (
    type: AgentEvent['type'],
    fields: Partial<Omit<AgentEvent, 'id' | 'runId' | 'type' | 'createdAt'>> = {},
  ): AgentEvent => mkEvent(runId, type, fields, now)

  const statusEvent = (
    status: AgentRunStatus,
    extra: Record<string, unknown> = {},
    text?: string,
  ): AgentEvent => emit('status', { payload: { status, ...extra }, text })

  // ── Gate (1): userId present ───────────────────────────────────────────────
  if (!deps.userId) {
    yield statusEvent('error', { error: 'UNAUTHORIZED' })
    return
  }

  // ── Gate (1b): transcript size cap (SEC-Medium, DoS) — BEFORE any model call ─
  if (transcriptExceedsCap(req.messages)) {
    yield statusEvent('error', { error: 'BAD_REQUEST' })
    return
  }

  // ── Deputy context (D1 — JWT-decoded claims, no profiles lookup) ────────────
  const deputyCtx: DeputyContext = {
    jwt: '',
    userId: deps.userId,
    personId: deps.personId,
    orgId: deps.orgId,
    accessRoles: deps.accessRoles,
    supabase: deps.supabase as unknown as SupabaseLike,
  }

  // ── Cancel branch (req.cancel present -> server-side abort) ────────────────
  // No model call — a cancel is a pure status write. withPersistence (the SAME wrapper every
  // other terminal status flows through) persists it via setRunStatus.
  if (req.cancel) {
    yield statusEvent('error', { error: 'CANCELLED' })
    return
  }

  // ── Decision branch (req.decision present -> approve/reject a pending write) ─
  if (req.decision) {
    yield* handleDecision(req, deps, emit, statusEvent, deputyCtx, persist)
    return
  }

  // ── Answer branch (req.answer present -> resolve a pending ask_user question, FR-P3-AU-002) ──
  // Routed BEFORE the model call for the same reason as the decision branch: resolving a pending
  // question (finding the trailing tool_use + injecting the answer as its tool_result) never
  // itself costs a model call. The continuation IS a genuine new model call (handleAnswer's own
  // runLoopAfterAnswer).
  if (req.answer) {
    yield* handleAnswer(req, deps, emit, statusEvent, deputyCtx, persist)
    return
  }

  const lastUserMsg = req.messages.filter((m) => m.role === 'user').at(-1)

  // ── Build system prompt (GROUNDING, FR-P2-GR-001) ───────────────────────────
  const system = buildAgentSystemPrompt(AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP)

  // ── Replay branch (P3a, FR-P3-RP-001/AC-P3-RP-002): reopen a persisted run from the DB ───────
  // When req.runId && req.replay, reconstruct ModelMessage[] from mos.agent_events (seq-ordered,
  // tool_use<->tool_result paired) under the caller JWT (owner RLS), prepend the system prompt,
  // and append only the new user turn. No tool re-executes — replay rebuilds messages, the loop's
  // existing journal de-dupe gate still guards any write. Falls back to the stateless path when
  // persistence is off (no deps.supabase to read from) — a degraded but functional fresh turn.
  let messages: ModelMessage[]
  if (req.runId && req.replay && persist) {
    const replayed = await replayRunHistory(persist.deps, req.runId)
    messages = [
      { role: 'system', content: system },
      ...replayed,
      ...(lastUserMsg
        ? [{ role: 'user' as const, content: typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '' }]
        : []),
    ]
  } else {
    messages = [
      { role: 'system', content: system },
      ...req.messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : null })),
    ]
  }

  // Read prior history before the submitted turn becomes part of that history.
  if (lastUserMsg) {
    yield emit('user', { text: typeof lastUserMsg.content === 'string' ? lastUserMsg.content : undefined })
  }

  // ── Tool-use loop ────────────────────────────────────────────────────────────
  yield* runToolLoop({
    deps, emit, statusEvent, deputyCtx, messages, persist, runId,
    allowCompose: true, allowProposeConfirm: true, onMissingToolCall: 'continue-as-unknown',
  })
}

// ── Decision handler (single-use pending-action resolution) ────────────────────

/**
 * Handle a re-POST with req.decision (approve or reject a pending write).
 *
 * Consume by pending id under the caller identity, validate the stored action again, and execute
 * its stored args under the caller JWT. A reject consumes the same one-use record without dispatch.
 */
async function* handleDecision(
  req: AgentChatRequest,
  deps: HandlerDeps,
  emit: (type: AgentEvent['type'], fields?: Partial<Omit<AgentEvent, 'id' | 'runId' | 'type' | 'createdAt'>>) => AgentEvent,
  statusEvent: (status: AgentRunStatus, extra?: Record<string, unknown>, text?: string) => AgentEvent,
  deputyCtx: DeputyContext,
  persist?: PersistenceRuntime,
): AsyncGenerator<AgentEvent> {
  const decision = req.decision!
  const { pendingId, verdict } = decision
  if (typeof pendingId !== 'string' || (verdict !== 'approve' && verdict !== 'reject')) {
    yield statusEvent('error', { error: 'BAD_REQUEST' })
    return
  }

  const lastUserMsg = req.messages.filter((m) => m.role === 'user').at(-1)
  if (lastUserMsg && typeof lastUserMsg.content === 'string') {
    yield emit('user', { text: lastUserMsg.content })
  }

  const system = buildAgentSystemPrompt(AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP)

  const messages: ModelMessage[] = [
    { role: 'system', content: system },
    ...req.messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : null })),
  ]

  const pending = await deps.pendingActions?.consume(pendingId)
  if (!pending) {
    yield statusEvent('error', { error: 'PENDING_ACTION_UNAVAILABLE' })
    return
  }

  const { actionName: toolName, args: storedArgs, toolCallId: toolId } = pending
  const action = BASE_ACTION_BY_NAME.get(toolName)
  if (!action?.confirm) {
    yield statusEvent('error', { error: 'PENDING_ACTION_UNAVAILABLE' })
    return
  }

  const writeAction = action as AgentAction & {
    validate: (i: unknown) => { ok: boolean; error?: string; value?: unknown }
    summarize: (i: unknown) => string
  }
  const validation = writeAction.validate(storedArgs)
  if (!validation.ok) {
    yield statusEvent('error', { error: 'PENDING_ACTION_UNAVAILABLE' })
    return
  }

  if (verdict === 'reject') {
    yield emit('system', {
      text: 'rejected',
      payload: { event: 'write_resolved', decision: 'rejected', actionName: toolName, pendingId },
    })
    messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify({ result: 'Write action declined by user.' }) })
    yield* runLoop(req, deps, emit, statusEvent, deputyCtx, messages, persist)
    return
  }

  if (!persist) {
    yield statusEvent('error', { error: 'PERSISTENCE_UNAVAILABLE' })
    return
  }

  // The caller transaction serializes on the owned run and atomically writes both the
  // business result and this exact event. A stale journal snapshot never authorizes a write.
  const event = emit('tool', { payload: { name: toolName, pendingId, input: storedArgs, tool_call_id: toolId } })
  const writeResult = await completeApprovedWrite(persist.deps, event, persist.nextSeq(), {
    toolName, pendingId, toolCallId: toolId, args: storedArgs,
  })
  event.payload = { name: toolName, pendingId, input: storedArgs, result: writeResult, tool_call_id: toolId }
  persist.committedEvents.add(event)
  yield event

  yield emit('system', { text: 'approved', payload: { event: 'write_resolved', decision: 'approved', actionName: toolName, pendingId } })

  messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify(writeResult) })

  yield* runLoop(req, deps, emit, statusEvent, deputyCtx, messages, persist)
}

// ── Inner tool-use loop for the decision continuation ─────────────────────────

async function* runLoop(
  req: AgentChatRequest,
  deps: HandlerDeps,
  emit: (type: AgentEvent['type'], fields?: Partial<Omit<AgentEvent, 'id' | 'runId' | 'type' | 'createdAt'>>) => AgentEvent,
  statusEvent: (status: AgentRunStatus, extra?: Record<string, unknown>, text?: string) => AgentEvent,
  deputyCtx: DeputyContext,
  messages: ModelMessage[],
  persist?: PersistenceRuntime,
): AsyncGenerator<AgentEvent> {
  const runId = req.runId ?? ''

  // TERMINAL by design: a decision resolves a write (approved/rejected) — the continuation
  // must not immediately propose a SECOND pending write, nor emit a compose_view artifact,
  // before the model has acknowledged the first resolution.
  yield* runToolLoop({
    deps, emit, statusEvent, deputyCtx, messages, persist, runId,
    allowCompose: false, allowProposeConfirm: false, onMissingToolCall: 'complete',
  })
}

// ── Answer handler (P3a, FR-P3-AU-002) — resolve a pending ask_user question ──────────────────

/**
 * Handle a re-POST with req.answer (resolve a pending ask_user question).
 *
 * Protocol (mirrors handleDecision — the "question" and "needs-approval" interactions share one
 * resolution family):
 * 1. Find the trailing unresolved ask_user tool_use in the replayed transcript
 *    (findTrailingUnresolvedToolUse + isAskUserToolUse). If none (stale/duplicate re-POST,
 *    AC-P3-AU-003), it is a no-op: continue the model with the messages as replayed, no re-injection.
 * 2. Otherwise, append the answer as the tool_result resolving that tool_use (the chosen option's
 *    label, or the free text) and continue the SAME run via runLoopAfterAnswer — never a new
 *    createRun.
 *
 * Answering a clarifying question is NOT itself a resolution of anything write-shaped (unlike a
 * decision, which is terminal): the model may need to immediately propose a confirm action or
 * compose a view to actually satisfy the request the question was blocking. So the continuation
 * runs with allowCompose:true, allowProposeConfirm:true (runLoopAfterAnswer) — the SAME
 * capabilities as the main pass, NOT runLoop's terminal-by-design restriction.
 */
async function* handleAnswer(
  req: AgentChatRequest,
  deps: HandlerDeps,
  emit: (type: AgentEvent['type'], fields?: Partial<Omit<AgentEvent, 'id' | 'runId' | 'type' | 'createdAt'>>) => AgentEvent,
  statusEvent: (status: AgentRunStatus, extra?: Record<string, unknown>, text?: string) => AgentEvent,
  deputyCtx: DeputyContext,
  persist?: PersistenceRuntime,
): AsyncGenerator<AgentEvent> {
  const answer = req.answer!

  const system = buildAgentSystemPrompt(AGENT_READ_ENTITIES, AGENT_READ_ROW_CAP)

  const messages: ModelMessage[] = [
    { role: 'system', content: system },
    ...req.messages.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : null })),
  ]

  const trailingQuestion = findTrailingUnresolvedToolUse(req.messages, isAskUserToolUse)

  if (trailingQuestion) {
    const { toolId, toolName, toolInput } = trailingQuestion
    // Prefer the option's human-readable label (the model asked with labels, not ids) — fall
    // back to the raw optionId if the option isn't found, then freeText.
    const questionInput = toolInput as { options?: { id: string; label: string }[] } | undefined
    const matchedOption = questionInput?.options?.find((o) => o.id === answer.optionId)
    const answerText = answer.freeText ?? matchedOption?.label ?? answer.optionId ?? ''
    messages.push({ role: 'tool', tool_call_id: toolId, name: toolName, content: JSON.stringify({ answer: answerText }) })
  }
  // No trailingQuestion found -> stale/duplicate answer (AC-P3-AU-003): fall through and simply
  // continue the model with the messages as replayed (no re-injection).

  yield* runLoopAfterAnswer(req, deps, emit, statusEvent, deputyCtx, messages, persist)
}

/** Inner tool-use loop for the answer continuation — allowCompose/allowProposeConfirm stay ON
 *  (an answer is non-terminal, unlike a decision's continuation via runLoop). */
async function* runLoopAfterAnswer(
  req: AgentChatRequest,
  deps: HandlerDeps,
  emit: (type: AgentEvent['type'], fields?: Partial<Omit<AgentEvent, 'id' | 'runId' | 'type' | 'createdAt'>>) => AgentEvent,
  statusEvent: (status: AgentRunStatus, extra?: Record<string, unknown>, text?: string) => AgentEvent,
  deputyCtx: DeputyContext,
  messages: ModelMessage[],
  persist?: PersistenceRuntime,
): AsyncGenerator<AgentEvent> {
  const runId = req.runId ?? ''
  yield* runToolLoop({
    deps, emit, statusEvent, deputyCtx, messages, persist, runId,
    allowCompose: true, allowProposeConfirm: true, onMissingToolCall: 'complete',
  })
}

/** matchToolUse for the ask_user question interaction family (FR-P3-AU-002). */
function isAskUserToolUse(b: { name?: string }): boolean {
  return b.name === 'ask_user'
}

// ── Trailing unresolved tool_use finder ────────────────────────────────────────

interface TrailingToolUse {
  toolId: string
  toolName: string
  toolInput: unknown
}

/**
 * Find the trailing unresolved tool_use in the replayed messages whose block matches
 * `matchToolUse`. "Unresolved" means: the last assistant message contains a matching tool_use
 * block, AND the subsequent messages do NOT already contain a matching tool_result for it. If
 * already resolved, the request is stale/duplicate -> return null.
 */
export function findTrailingUnresolvedToolUse(
  messages: ConversationMessage[],
  matchToolUse: (block: { type?: string; name?: string }) => boolean,
): TrailingToolUse | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue

    const content = msg.content
    if (!Array.isArray(content)) continue

    const toolUseBlock = [...content].reverse().find(
      (b: { type?: string; name?: string }) => b.type === 'tool_use' && matchToolUse(b),
    ) as { type: string; id?: string; name: string; input?: unknown } | undefined

    if (!toolUseBlock) continue

    const toolId = toolUseBlock.id ?? 'tool-use-id'
    const toolName = toolUseBlock.name

    const isAlreadyResolved = messages.slice(i + 1).some((laterMsg) => {
      if (laterMsg.role !== 'user') return false
      const lContent = laterMsg.content
      if (!Array.isArray(lContent)) return false
      return (lContent as Array<{ type?: string; tool_use_id?: string }>).some(
        (b) => b.type === 'tool_result' && b.tool_use_id === toolId,
      )
    })

    if (isAlreadyResolved) return null

    return { toolId, toolName, toolInput: toolUseBlock.input ?? {} }
  }

  return null
}
