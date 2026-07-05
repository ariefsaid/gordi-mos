/**
 * history — client-side reconstruction of a persisted deputy thread for display (T6, P3a).
 *
 * `loadThreadForDisplay(threadId)` queries the thread's runs + the most recent run's events
 * (RLS-scoped to the owner — `mos.agent_threads`/`agent_runs`/`agent_events`, migration
 * 20260705000003) and folds them into `TranscriptItem[]` for render, mirroring
 * useAssistantPanel's `mergeEvent` mapping (assistant text -> a transcript row; `user` events are
 * NOT dropped here — unlike the live-SSE drain, which ignores the server's `user` echo because the
 * hook already appended it optimistically, a reopened thread has no optimistic echo to de-dupe
 * against, so the persisted `user` row IS the only source of that turn).
 *
 * `listThreads()` (T7) lists the owner's `mos.agent_threads` rows, updated_at desc, for the
 * ThreadList panel.
 *
 * Fails open (never throws) — a read error degrades to an empty transcript / empty list rather
 * than breaking the panel (mirrors persistence.ts's fail-open posture on the edge-function side).
 */

import { supabase } from '@/lib/supabase'
import type { TranscriptItem } from '@/hooks/useAssistantPanel'

const mos = () => supabase.schema('mos')

/** Row cap mirroring the server's MAX_RUN_EVENTS_READ — a pathological thread degrades, never hangs. */
const MAX_EVENTS_READ = 1000

export interface ThreadSummary {
  id: string
  title: string | null
  updated_at: string
}

export interface ThreadForDisplay {
  /** The thread's most-recent run id, bound as the active run so a subsequent send follows up on
   *  it with replay:true. null when the thread has no runs (or the read failed). */
  activeRunId: string | null
  transcript: TranscriptItem[]
}

interface AgentEventRow {
  id: string
  type: string
  text: string | null
  payload: Record<string, unknown> | null
}

/**
 * Fold a run's agent_events rows into TranscriptItem[] for render — only `user`/`assistant` rows
 * with non-empty text become a visible transcript entry (tool/status/system/artifact are
 * lifecycle/journal rows, not chat turns; an assistant row with tool_calls but no text is a
 * silent tool-call turn, not a message to show).
 */
function foldEventsToTranscript(rows: AgentEventRow[]): TranscriptItem[] {
  const items: TranscriptItem[] = []
  for (const row of rows) {
    if (row.type === 'user' && row.text) {
      items.push({ id: row.id, role: 'user', text: row.text })
    } else if (row.type === 'assistant' && row.text) {
      items.push({ id: row.id, role: 'assistant', text: row.text })
    }
  }
  return items
}

/**
 * Load a thread's most-recent run + its events, folded into a TranscriptItem[] for display.
 * openThread(threadId) uses this to populate the panel's transcript state (T6, AC-P3-RP-003).
 */
export async function loadThreadForDisplay(threadId: string): Promise<ThreadForDisplay> {
  try {
    const { data: runs, error: runsError } = await mos()
      .from('agent_runs')
      .select('id, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (runsError || !runs || runs.length === 0) {
      return { activeRunId: null, transcript: [] }
    }

    const activeRunId = (runs[0] as { id: string }).id

    const { data: events, error: eventsError } = await mos()
      .from('agent_events')
      .select('id, type, text, payload')
      .eq('run_id', activeRunId)
      .order('seq', { ascending: true })
      .limit(MAX_EVENTS_READ)

    if (eventsError || !events) {
      return { activeRunId, transcript: [] }
    }

    return { activeRunId, transcript: foldEventsToTranscript(events as AgentEventRow[]) }
  } catch {
    return { activeRunId: null, transcript: [] }
  }
}

/** List the owner's threads (RLS-scoped), updated_at desc — for the ThreadList panel (T7). */
export async function listThreads(): Promise<ThreadSummary[]> {
  try {
    const { data, error } = await mos()
      .from('agent_threads')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
    if (error || !data) return []
    return data as ThreadSummary[]
  } catch {
    return []
  }
}
