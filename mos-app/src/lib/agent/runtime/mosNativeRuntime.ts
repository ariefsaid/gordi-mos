/**
 * MosNativeRuntime — the ONLY AgentRuntime implementation (T23, P2 port of the sibling
 * reference's pmoNativeRuntime, adapted to the MOS agent-chat edge function).
 *
 * Wire: POST `${endpoint}` (the agent-chat edge function) with the caller's bearer JWT; consume
 * the `text/event-stream` response via `decodeSseStream` (NOT EventSource — POST + auth, D1).
 *
 * Coherence note (why createRun does NOT fetch): agent-chat is a SINGLE streaming endpoint and
 * `AgentRuntime.createRun` returns `Promise<AgentRun>` (not an async iterable). So createRun mints
 * the runId client-side + stores the initial messages/context; `subscribe` is the one streaming
 * POST. The server is stateless (D8-analog — AgentChatRequest carries the full message history),
 * so followUp/control mutate the stored per-run request state and the next subscribe carries it.
 *
 * Abort: each subscribe owns an AbortController stored on the run; `control('cancel')` aborts an
 * in-flight subscribe so the hook's drain promise resolves (no hang).
 */

// Explicit `.ts` extension — Deno-strict compat (this module's types are co-imported by the edge
// function); Vite/Vitest resolve the extension-ful form identically.
import type {
  AgentEvent, AgentRun, AgentRuntime, RunContext,
} from './port.ts'
import type { AgentChatRequest, ConversationMessage, AgentDecision, AgentCancel } from './transport.ts'
import type { AgentAnswer } from './port.ts'
import { decodeSseStream } from './transport.ts'
import { makeId } from './makeId.ts'

export interface MosNativeRuntimeOptions {
  /** Full URL of the agent-chat edge function (e.g. `${supABaseUrl}/functions/v1/agent-chat`). */
  endpoint: string
  /** Resolves the caller's access token (the deputy auth — never service_role). */
  getAccessToken: () => Promise<string | null>
}

interface RunState {
  messages: ConversationMessage[]
  context?: RunContext
  /** Stamped by control('approve'/'reject'); consumed + cleared on the next subscribe. */
  decision?: AgentDecision
  /** Stamped by control('cancel'); consumed + cleared on the next subscribe. */
  cancel?: AgentCancel
  /**
   * Stamped by openThread (P3a, FR-P3-RP-001/AC-P3-RP-003): the NEXT subscribe carries
   * `replay:true` so the server reconstructs the model's context from mos.agent_events instead of
   * the (empty, for a reopened thread) in-memory `messages`. Consumed + cleared on that subscribe —
   * a subsequent turn in the same session is a normal (non-replay) followUp.
   */
  replay?: boolean
  /** Stamped by control('answer', {answer}); consumed + cleared on the next subscribe (P3a, T20,
   *  FR-P3-AU-002/AC-P3-AU-005) — resolves a pending ask_user question on the SAME run. */
  answer?: AgentAnswer
  /** The in-flight subscribe's controller (aborted by control('cancel')). */
  abort?: AbortController
}

export class MosNativeRuntime implements AgentRuntime {
  private readonly runs = new Map<string, RunState>()
  private readonly opts: MosNativeRuntimeOptions

  constructor(opts: MosNativeRuntimeOptions) {
    this.opts = opts
  }

  async createRun(input: { goal: string; context?: RunContext }): Promise<AgentRun> {
    const id = makeId()
    this.runs.set(id, {
      messages: [{ role: 'user', content: input.goal }],
      context: input.context,
    })
    return { id, title: input.goal.slice(0, 60), status: 'running' }
  }

  async followUp(runId: string, message: string): Promise<void> {
    const state = this.runs.get(runId)
    if (!state) return
    state.messages.push({ role: 'user', content: message })
  }

  /**
   * openThread — bind a persisted thread's most-recent run as the active runId (P3a, T6). No
   * in-memory `messages` exist for a reopened thread (a page reload / a different session), so
   * `messages` seeds empty; the `replay:true` flag stamped here tells the NEXT subscribe to ask
   * the server to reconstruct history from `mos.agent_events` (the caller-JWT, owner-RLS-scoped
   * replay path) rather than send an (empty) client transcript. A subsequent `followUp(runId, …)`
   * appends the new turn exactly like any other run; `subscribe` then POSTs
   * `{runId, replay:true, messages:[newMsg]}` and clears the flag.
   */
  openThread(runId: string): void {
    this.runs.set(runId, { messages: [], replay: true })
  }

  async control(
    runId: string,
    cmd: 'approve' | 'reject' | 'cancel' | 'answer',
    payload?: { pendingId?: string; answer?: AgentAnswer },
  ): Promise<void> {
    const state = this.runs.get(runId)
    if (cmd === 'cancel') {
      // Abort an in-flight subscribe first (the drain promise resolves on abort), then stamp the
      // cancel so a subsequent subscribe (if any) carries it.
      state?.abort?.abort()
      if (state) state.cancel = { runId }
      return
    }
    // T20 (AC-P3-AU-005): control('answer', {answer}) resolves a pending ask_user question on
    // the SAME run — stamp it for the next subscribe (mirrors decision/cancel one-shot stamping).
    if (cmd === 'answer') {
      if (!state || !payload?.answer) return
      state.answer = payload.answer
      return
    }
    if (!state || !payload?.pendingId) return
    state.decision = { pendingId: payload.pendingId, verdict: cmd }
  }

  async *subscribe(runId: string): AsyncIterable<AgentEvent> {
    const state = this.runs.get(runId)
    if (!state) return // unknown run — nothing to stream (the hook treats this as no events)

    const body: AgentChatRequest = {
      runId,
      messages: state.messages,
      ...(state.context ? { context: state.context } : {}),
      ...(state.decision ? { decision: state.decision } : {}),
      ...(state.cancel ? { cancel: state.cancel } : {}),
      ...(state.replay ? { replay: true } : {}),
      ...(state.answer ? { answer: state.answer } : {}),
    }
    // Decisions/cancels/replay/answers are one-shot — clear after building the request so a
    // followUp doesn't re-send them (a subsequent turn is a normal followUp, not a replay re-ask
    // or a stale answer re-post).
    state.decision = undefined
    state.cancel = undefined
    state.replay = undefined
    state.answer = undefined

    const controller = new AbortController()
    state.abort = controller

    let response: Response
    try {
      const token = await this.opts.getAccessToken()
      response = await fetch(this.opts.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (e) {
      // AbortError (control('cancel')) or a network failure — end the stream cleanly; the hook
      // surfaces the run state (idle on cancel, error on network failure).
      if (isAbortError(e)) return
      throw e
    }

    state.abort = undefined
    if (!response.ok || !response.body) return

    yield* decodeSseStream(response.body.getReader())
  }
}

function isAbortError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'AbortError' || /aborted/i.test(e.message))
}
