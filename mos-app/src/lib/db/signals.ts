import { supabase } from '@/lib/supabase'
import type { SignalRow, MentionKind } from './signals.types'

// Data layer for mos.signals + the Signal child tables (Step 4 / ADR-0050). Reads/writes mos via
// supabase.schema('mos') and shared substrate (teams/sites/team_memberships) via
// supabase.schema('shared') — same client, RLS is the authority (mirrors tasks.ts §8): this layer
// NEVER sends org_id/author_id (the DB default stamps them) and throws on any non-null PostgREST
// error so the UI can surface failures.

const mos = () => supabase.schema('mos')

// ── reads (B2) ───────────────────────────────────────────────────────────────

export interface ListSignalsFilters {
  includeRetracted?: boolean
}

/** List Signals the caller's RLS grants read on (mos.can_read_signal). Excludes retracted rows by
 * default (D31 — the query layer, not RLS, hides tombstones from default feeds/archive). */
export async function listReadableSignals(f: ListSignalsFilters = {}): Promise<SignalRow[]> {
  let q = mos().from('signals').select('*')
  if (!f.includeRetracted) q = q.is('retracted_at', null)
  q = q.order('occurred_at', { ascending: false })
  const { data, error } = await q
  if (error) throw new Error(`listReadableSignals failed — ${error.message}`)
  return (data ?? []) as unknown as SignalRow[]
}

export interface SignalMentionRow {
  id: string
  signal_id: string
  mention_kind: MentionKind
  target_person_id: string | null
  target_team_id: string | null
  target_bu_id: string | null
  revoked_at: string | null
}
export interface SignalAckRow { id: string; signal_id: string; person_id: string; created_at: string }
export interface SignalTaskLinkRow { id: string; signal_id: string; task_id: string; created_by: string }

export interface SignalDetail {
  signal: SignalRow
  mentions: SignalMentionRow[]
  acknowledgements: SignalAckRow[]
  tasks: SignalTaskLinkRow[]
}

/** Read one Signal plus its mentions, acknowledgements, and linked-task rows (record surface, B15). */
export async function getSignal(id: string): Promise<SignalDetail> {
  const { data: signal, error: sErr } = await mos().from('signals').select('*').eq('id', id).single()
  if (sErr) throw new Error(`getSignal failed — ${sErr.message}`)

  const { data: mentions, error: mErr } = await mos()
    .from('signal_mentions').select('*').eq('signal_id', id)
  if (mErr) throw new Error(`getSignal mentions failed — ${mErr.message}`)

  const { data: acks, error: aErr } = await mos()
    .from('signal_acknowledgements').select('*').eq('signal_id', id)
  if (aErr) throw new Error(`getSignal acknowledgements failed — ${aErr.message}`)

  const { data: tasks, error: tErr } = await mos()
    .from('signal_tasks').select('*').eq('signal_id', id)
  if (tErr) throw new Error(`getSignal tasks failed — ${tErr.message}`)

  return {
    signal: signal as unknown as SignalRow,
    mentions: (mentions ?? []) as unknown as SignalMentionRow[],
    acknowledgements: (acks ?? []) as unknown as SignalAckRow[],
    tasks: (tasks ?? []) as unknown as SignalTaskLinkRow[],
  }
}
