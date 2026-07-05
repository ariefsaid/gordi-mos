/**
 * replayRunHistory — reconstruct the model's ModelMessage[] from a persisted run's agent_events
 * (P3a §3.1, T4, AC-P3-RP-001).
 *
 * WHY: P2's handler is stateless across requests — `followUp` re-sends the full transcript. That
 * works for a live session (the client holds the transcript in memory) but a REOPENED thread (a
 * page reload, a resumed run) has no in-memory transcript: the client must rebuild it from the DB.
 * This module walks a run's agent_events seq-ordered and rebuilds the exact ModelMessage[] the
 * model API expects, including the `tool_use`↔`tool_result` pairing (an assistant tool_use with
 * id X is followed by a tool result with tool_call_id=X). The P3a handler enrichment (T3) now
 * persists the user turn, the assistant tool_calls, and each tool event's tool_call_id — without
 * those three, this reconstruction was impossible (the P2 review escalation).
 *
 * Pure: `deps` is injected (the caller-JWT, owner-RLS-scoped Supabase client — the same client
 * index.ts binds for every other persistence read). No Deno globals, no service_role. Importable
 * in Vitest (Node) with `deps.supabase` mocked. Deputy invariant by construction (AC-P2-DI-002).
 *
 * NFR-P3-RP-001: replay NEVER re-executes a tool. It rebuilds the MESSAGE stream (the prior
 * tool_result is serialized into the `tool` message's content); the model sees the full history
 * but no action dispatches from here. Reads are seq-ordered + row-capped (MAX_RUN_EVENTS_READ).
 *
 * Defensive pairing: a `tool` event whose tool_call_id has no matching prior assistant tool_use is
 * SKIPPED — never handed to the model as an unpaired tool_result (the model API would reject it).
 */

import type { PersistenceDeps } from './persistence.ts'
import { MAX_RUN_EVENTS_READ } from './persistence.ts'
import type { ModelMessage, ModelToolCall } from '../_shared/modelClient.ts'

/** One row of the seq-ordered agent_events read (the structural subset replay consumes). */
interface ReplayEventRow {
  type: string
  text?: string | null
  payload?: Record<string, unknown> | null
}

/**
 * Load a run's agent_events seq-ordered and reconstruct the ModelMessage[] the model expects.
 * Returns [] on any read error or empty result (fail open — the caller still appends the new user
 * turn, so a replay miss degrades to a fresh-context turn rather than breaking the run).
 */
export async function replayRunHistory(
  deps: PersistenceDeps,
  runId: string,
): Promise<ModelMessage[]> {
  const { data, error } = await deps.supabase
    .schema('mos')
    .from('agent_events')
    .select('type,text,payload')
    .eq('run_id', runId)
    .order('seq', { ascending: true })
    .limit(MAX_RUN_EVENTS_READ)

  if (error || !data) return []
  const rows = (data as ReplayEventRow[])

  const messages: ModelMessage[] = []
  // tool_call_ids emitted on prior assistant tool_use blocks — used to pair (and defensively
  // validate) the following tool results. A tool result without a matching prior tool_use is
  // skipped (never a malformed transcript handed to the model).
  const seenToolCallIds = new Set<string>()

  for (const ev of rows) {
    const payload = (ev.payload ?? {}) as Record<string, unknown>

    if (ev.type === 'user') {
      messages.push({ role: 'user', content: ev.text ?? '' })
      continue
    }

    if (ev.type === 'assistant') {
      const toolCalls = Array.isArray(payload.tool_calls) ? (payload.tool_calls as ModelToolCall[]) : undefined
      const msg: ModelMessage = { role: 'assistant', content: ev.text ?? '' }
      if (toolCalls && toolCalls.length > 0) {
        msg.tool_calls = toolCalls
        for (const tc of toolCalls) {
          if (tc && typeof tc.id === 'string') seenToolCallIds.add(tc.id)
        }
      }
      messages.push(msg)
      continue
    }

    if (ev.type === 'tool') {
      const toolCallId = typeof payload.tool_call_id === 'string' ? payload.tool_call_id : undefined
      // Defensive (NFR-P3-RP-001): skip an unpaired tool result rather than hand the model a
      // malformed transcript. Also guards against a tool event missing tool_call_id entirely.
      if (!toolCallId || !seenToolCallIds.has(toolCallId)) continue
      const name = typeof payload.name === 'string' ? payload.name : undefined
      const result = 'result' in payload ? payload.result : null
      messages.push({
        role: 'tool',
        tool_call_id: toolCallId,
        ...(name ? { name } : {}),
        content: JSON.stringify(result ?? null),
      })
      continue
    }

    // status / system / artifact are lifecycle + journal events, not model turns — skipped.
  }

  return messages
}
