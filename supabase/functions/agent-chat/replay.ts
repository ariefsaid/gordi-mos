/** Caller-JWT event paging and reconstruction of complete model tool-call/result batches. */
import type { PersistenceDeps } from './persistence.ts'
import type { ModelMessage, ModelToolCall } from '../_shared/modelClient.ts'

import { MAX_RUN_EVENTS_READ, readEventPages } from '../../../mos-app/src/lib/agent/runtime/mosNativeRuntime.ts'
export { MAX_RUN_EVENTS_READ, readEventPages } from '../../../mos-app/src/lib/agent/runtime/mosNativeRuntime.ts'

interface ReplayEventRow {
  type: string
  text?: string | null
  payload?: Record<string, unknown> | null
}

/** Replay rebuilds messages only. Incomplete or malformed tool batches reject before model use. */
export async function replayRunHistory(
  deps: PersistenceDeps,
  runId: string,
): Promise<ModelMessage[]> {
  const rows = await readEventPages(offset => deps.supabase
    .schema('mos')
    .from('agent_events')
    .select('type,text,payload')
    .eq('run_id', runId)
    .order('seq', { ascending: true })
    .range(offset, offset + MAX_RUN_EVENTS_READ - 1)
    .limit(MAX_RUN_EVENTS_READ)) as ReplayEventRow[]

  const messages: ModelMessage[] = []
  const seenToolCallIds = new Set<string>()
  let pending: { message: ModelMessage; ids: Set<string>; results: ModelMessage[] } | undefined

  for (const ev of rows) {
    const payload = ev.payload ?? {}
    if (ev.type === 'user' || ev.type === 'assistant') {
      if (pending) throw new Error('PERSISTENCE_UNAVAILABLE')
      const message: ModelMessage = { role: ev.type, content: ev.text ?? '' }
      const toolCalls = ev.type === 'assistant' && Array.isArray(payload.tool_calls)
        ? payload.tool_calls as ModelToolCall[] : []
      if (toolCalls.length > 0) {
        const ids = new Set<string>()
        for (const call of toolCalls) {
          if (!call?.id || seenToolCallIds.has(call.id) || ids.has(call.id)
            || call.type !== 'function' || typeof call.function?.name !== 'string'
            || typeof call.function.arguments !== 'string') throw new Error('PERSISTENCE_UNAVAILABLE')
          ids.add(call.id)
          seenToolCallIds.add(call.id)
        }
        message.tool_calls = toolCalls
        pending = { message, ids, results: [] }
      } else {
        messages.push(message)
      }
    } else if (ev.type === 'tool') {
      const id = typeof payload.tool_call_id === 'string' ? payload.tool_call_id : ''
      if (!pending) {
        if (seenToolCallIds.has(id)) throw new Error('PERSISTENCE_UNAVAILABLE')
        continue // Historical orphan results cannot be passed to the model.
      }
      if (!pending.ids.delete(id)) throw new Error('PERSISTENCE_UNAVAILABLE')
      pending.results.push({
        role: 'tool', tool_call_id: id,
        ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
        content: JSON.stringify(payload.result ?? null),
      })
      if (pending.ids.size === 0) {
        messages.push(pending.message, ...pending.results)
        pending = undefined
      }
    }
    // status / system / artifact events do not interrupt a model tool batch.
  }
  if (pending) throw new Error('PERSISTENCE_UNAVAILABLE')
  return messages
}
