import { supabase } from '@/lib/supabase'
import { createTask, type CreateTaskInput } from './tasks'
import type { SignalRow, MentionKind, CreateSignalInput } from './signals.types'

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

// ── createSignal (B3, AC-430 backing / FR-406) ───────────────────────────────

/** Insert a Signal (org_id/author_id stamped by DB defaults), bulk-insert its staged mentions,
 * then fan out notifications via the SECURITY DEFINER RPC. A fan-out error (e.g. above the
 * recipient cap) is re-thrown — the composer surfaces it as a confirm-above-cap message rather
 * than silently posting an unnotified Signal. Returns the new Signal id. */
export async function createSignal(input: CreateSignalInput): Promise<string> {
  const { data, error } = await mos().from('signals').insert({
    body: input.body,
    owning_team_id: input.owningTeamId,
    occurred_at: input.occurredAt,
  }).select('id').single()
  if (error) throw new Error(`createSignal failed — ${error.message}`)
  const id = (data as { id: string }).id

  if (input.mentions.length === 0) return id

  const { error: mErr } = await mos().from('signal_mentions').insert(
    input.mentions.map((m) => ({
      signal_id: id,
      mention_kind: m.kind,
      target_person_id: m.kind === 'person' ? m.targetId : null,
      target_team_id: m.kind === 'team' ? m.targetId : null,
      target_bu_id: m.kind === 'bu' ? m.targetId : null,
    })),
  )
  if (mErr) throw new Error(`createSignal mentions failed — ${mErr.message}`)

  const { error: fanErr } = await mos().rpc('fan_out_signal_mention', { p_signal_id: id })
  if (fanErr) throw new Error(`createSignal fan-out failed — ${fanErr.message}`)

  return id
}

// ── correctSignal / retractSignal (B4, FR-410/411) ───────────────────────────

export type SignalCorrection = Partial<Pick<SignalRow, 'body' | 'occurred_at' | 'category' | 'attention'>>

/** Correct body/occurred_at/category/attention. owning_team_id/author_id/source stay immutable —
 * the DB guard trigger (mos._signal_guard_update) rejects any attempt to change them and appends
 * the signal_revisions audit row + sets edited_at server-side. */
export async function correctSignal(id: string, patch: SignalCorrection): Promise<void> {
  const { error } = await mos().from('signals').update(patch).eq('id', id)
  if (error) throw new Error(`correctSignal failed — ${error.message}`)
}

/** Retract (soft-tombstone) a Signal with a required reason. The DB guard trigger gates retraction
 * to the author or a signal.retract holder and rejects an empty reason. */
export async function retractSignal(id: string, reason: string): Promise<void> {
  const { error } = await mos().from('signals')
    .update({ retracted_at: new Date().toISOString(), retract_reason: reason })
    .eq('id', id)
  if (error) throw new Error(`retractSignal failed — ${error.message}`)
}

// ── acknowledgeSignal / linkSignalTask / createFollowUpTask (B5, FR-412/413) ─

/** Any reader may acknowledge a Signal at most once (the unique(signal_id,person_id) constraint
 * rejects a repeat). person_id is never sent — the DB default stamps the caller. */
export async function acknowledgeSignal(signalId: string): Promise<void> {
  const { error } = await mos().from('signal_acknowledgements').insert({ signal_id: signalId })
  if (error) throw new Error(`acknowledgeSignal failed — ${error.message}`)
}

/** Link a Signal to an existing Task (the many-to-many signal_tasks bridge, D25/OD-39). */
export async function linkSignalTask(signalId: string, taskId: string): Promise<void> {
  const { error } = await mos().from('signal_tasks').insert({ signal_id: signalId, task_id: taskId })
  if (error) throw new Error(`linkSignalTask failed — ${error.message}`)
}

/** Create a follow-up Task via the canonical task DAL (Rule 11 — reuse, never re-implement task
 * creation) and link it to the Signal. Returns the new Task id. */
export async function createFollowUpTask(signalId: string, input: CreateTaskInput): Promise<string> {
  const taskId = await createTask(input)
  await linkSignalTask(signalId, taskId)
  return taskId
}
