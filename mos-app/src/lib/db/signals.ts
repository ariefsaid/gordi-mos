import { supabase } from '@/lib/supabase'
import { createTask, type CreateTaskInput } from './tasks'
import type {
  SignalRow, MentionKind, CreateSignalInput, TeamOption, SiteOption, StagedMention,
} from './signals.types'

// Data layer for mos.signals + the Signal child tables (Step 4 / ADR-0050). Reads/writes mos via
// supabase.schema('mos') and shared substrate (teams/sites/team_memberships) via
// supabase.schema('shared') — same client, RLS is the authority (mirrors tasks.ts §8): this layer
// NEVER sends org_id/author_id (the DB default stamps them) and throws on any non-null PostgREST
// error so the UI can surface failures.

const mos = () => supabase.schema('mos')
const shared = () => supabase.schema('shared')

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

// ── composer option loaders (B6) — shared.teams/sites/team_memberships ───────

type TeamJoinRow = { id: string; name: string; business_unit_id: string; site_id: string | null }

/** The author's active membership Teams (owning-Team select options), primary first. Not a full
 * effective-dated evaluation — approximates "active" as `effective_to is null` for the picker's
 * convenience; RLS (`mos.can_post_signal_for_team`) is the write-time authority. */
export async function listAuthorTeams(personId: string): Promise<TeamOption[]> {
  const { data: memberships, error: mErr } = await shared()
    .from('team_memberships')
    .select('team_id,is_primary')
    .eq('person_id', personId)
    .is('effective_to', null)
  if (mErr) throw new Error(`listAuthorTeams failed — ${mErr.message}`)

  const rows = (memberships ?? []) as { team_id: string; is_primary: boolean }[]
  if (rows.length === 0) return []

  const { data: teams, error: tErr } = await shared()
    .from('teams')
    .select('id,name,business_unit_id,site_id')
    .in('id', rows.map((r) => r.team_id))
  if (tErr) throw new Error(`listAuthorTeams teams failed — ${tErr.message}`)

  const primaryById = new Map(rows.map((r) => [r.team_id, r.is_primary]))
  return ((teams ?? []) as TeamJoinRow[])
    .map((team) => ({ ...team, is_primary: primaryById.get(team.id) ?? false }))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
}

/** All active (non-archived) Teams — backs the `@Team` mention-picker group. */
export async function listAllTeams(): Promise<TeamOption[]> {
  const { data, error } = await shared()
    .from('teams')
    .select('id,name,business_unit_id,site_id')
    .is('archived_at', null)
    .order('name', { ascending: true })
  if (error) throw new Error(`listAllTeams failed — ${error.message}`)
  return ((data ?? []) as TeamJoinRow[]).map((team) => ({ ...team, is_primary: false }))
}

/** Resolve a Team's derived Site (the composer's read-only location pill, D37). Central/site-less
 * Teams resolve to null — no second query is issued. */
export async function getTeamSite(teamId: string): Promise<SiteOption | null> {
  const { data: team, error: tErr } = await shared()
    .from('teams').select('site_id').eq('id', teamId).maybeSingle()
  if (tErr) throw new Error(`getTeamSite failed — ${tErr.message}`)

  const siteId = (team as { site_id: string | null } | null)?.site_id ?? null
  if (!siteId) return null

  const { data: site, error: sErr } = await shared()
    .from('sites').select('id,name').eq('id', siteId).maybeSingle()
  if (sErr) throw new Error(`getTeamSite site failed — ${sErr.message}`)
  return (site as SiteOption | null) ?? null
}

// ── dedupeRecipients (B10, AC-422 / FR-408) ───────────────────────────────────

/** Team/BU id → the person ids in its roster (the composer/page supplies these from a directory
 * cache; a Signal never queries a full org roster of its own accord). */
export type MemberLookup = Record<string, string[]>

/** Deduplicated recipient count across staged mentions (the composer's fan-out preview, before
 * post — D24). @Person contributes one id; @Team/@BU expand via the supplied roster lookups. A
 * pure function — no supabase involved — so it is unit-testable in isolation. */
export function dedupeRecipients(
  mentions: StagedMention[], teamMembers: MemberLookup, buMembers: MemberLookup,
): number {
  const ids = new Set<string>()
  for (const mention of mentions) {
    if (mention.kind === 'person') ids.add(mention.targetId)
    else if (mention.kind === 'team') for (const id of teamMembers[mention.targetId] ?? []) ids.add(id)
    else if (mention.kind === 'bu') for (const id of buMembers[mention.targetId] ?? []) ids.add(id)
  }
  return ids.size
}
