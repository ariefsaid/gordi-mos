/**
 * SSE transport codec — the ONLY site in the SPA that knows the agent-chat wire format (T22,
 * P2-slimmed port of the sibling reference's runtime/transport.ts).
 *
 * D1/ADR-0042-analog: transport = SSE (text/event-stream). Each AgentEvent is one
 * `data: <json>\n\n` frame. Browser consumes via fetch + response.body.getReader() (NOT
 * EventSource — EventSource cannot POST/auth).
 *
 * D8-analog: AgentChatRequest carries the full messages array (stateless followUp).
 *
 * P2 delta vs the sibling reference: DROPS `answer`/AgentAnswer-carry (ask_user is P3 — plan
 * §0 out-of-scope list). Keeps `decision` (approve/deny) and `cancel` (server-side abort).
 */

// Explicit `.ts` extension (Deno-strict compat — this module is imported by the agent-chat edge
// function's handler.ts); Vite/Vitest resolve the extension-ful form identically.
import type { AgentEvent, RunContext } from './port.ts'

export type { AgentEvent }

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface ContentBlock {
  type: string
  [key: string]: unknown
}

/** Approve/reject decision carried on re-POST (D-A3-1 analog). */
export interface AgentDecision {
  /** The pendingId from the needs-approval event; used for audit/chip bookkeeping. */
  pendingId: string
  /** 'approve' -> execute the write; 'reject' -> decline + model acknowledges. */
  verdict: 'approve' | 'reject'
}

/** Present on a re-POST driving a server-side abort. */
export interface AgentCancel {
  runId: string
}

/** The JSON body POSTed to agent-chat for both createRun and followUp (D8-analog). */
export interface AgentChatRequest {
  /** Present on followUp; omitted on createRun (adapter mints it client-side). */
  runId?: string
  /** Full conversation history — the handler is stateless. */
  messages: ConversationMessage[]
  /** Optional UI context hints. */
  context?: RunContext
  /** Present on an approve/deny re-POST. */
  decision?: AgentDecision
  /** Present on a re-POST driving a server-side abort. */
  cancel?: AgentCancel
}

/** Typed error shape for non-2xx responses from agent-chat. */
export interface AgentChatError {
  status: 400 | 401 | 429 | 502
  error: 'BAD_REQUEST' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'UPSTREAM_ERROR'
  detail?: string
  retryAfterSeconds?: number
}

// ── SSE codec ─────────────────────────────────────────────────────────────────

/** Encode one AgentEvent as a single SSE frame: `data: <json>\n\n`. One frame per event. */
export function encodeSse(ev: AgentEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`
}

/**
 * Decode an SSE stream from a ReadableStreamDefaultReader.
 * Buffers UTF-8 across chunk boundaries; yields one AgentEvent per `data:` frame.
 */
export async function* decodeSseStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncIterable<AgentEvent> {
  const dec = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += dec.decode(value, { stream: true })

    // A complete SSE frame ends with \n\n; split on that boundary.
    let boundary = buffer.indexOf('\n\n')
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      boundary = buffer.indexOf('\n\n')

      const line = frame.startsWith('data: ') ? frame.slice(6) : frame
      if (line.trim()) {
        try {
          yield JSON.parse(line) as AgentEvent
        } catch {
          // Malformed frame — skip (don't crash the stream).
        }
      }
    }
  }

  // Flush any remaining buffered complete frame (no trailing \n\n).
  const remaining = buffer.trim()
  if (remaining) {
    const line = remaining.startsWith('data: ') ? remaining.slice(6) : remaining
    if (line.trim()) {
      try {
        yield JSON.parse(line) as AgentEvent
      } catch {
        // Skip malformed.
      }
    }
  }
}
