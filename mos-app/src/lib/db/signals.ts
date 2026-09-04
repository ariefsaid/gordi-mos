import { supabase } from '@/lib/supabase'
import type {
  Attention, SignalRow, MentionKind, CreateSignalInput, TeamOption, SiteOption, StagedMention,
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

/** A lightweight Signal reference for the ⌘K command palette (OD-REDESIGN-91 #4/B2). */
export interface SignalTitleRef { id: string; body: string }

/**
 * Search Signals by body for the command palette (OD-REDESIGN-91 #4/B2 — the palette now
 * spans all record kinds, so "Records" is finally true). RLS-governed read (mos.can_read_signal
 * — org_id/author_id never sent). Excludes retracted tombstones, newest first.
 */
export async function searchSignalsByBody(q: string, limit = 20): Promise<SignalTitleRef[]> {
  const term = q.trim()
  if (!term) return []
  const { data, error } = await mos()
    .from('signals')
    .select('id,body')
    .ilike('body', `%${term}%`)
    .is('retracted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`searchSignalsByBody failed — ${error.message}`)
  return (data ?? []) as unknown as SignalTitleRef[]
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

  // The three child reads are independent — fetch them in parallel (the parent row must resolve
  // first only because a missing Signal should surface as `getSignal failed`, not a child error).
  const [
    { data: mentions, error: mErr },
    { data: acks, error: aErr },
    { data: tasks, error: tErr },
  ] = await Promise.all([
    mos().from('signal_mentions').select('*').eq('signal_id', id),
    mos().from('signal_acknowledgements').select('*').eq('signal_id', id),
    mos().from('signal_tasks').select('*').eq('signal_id', id),
  ])
  if (mErr) throw new Error(`getSignal mentions failed — ${mErr.message}`)
  if (aErr) throw new Error(`getSignal acknowledgements failed — ${aErr.message}`)
  if (tErr) throw new Error(`getSignal tasks failed — ${tErr.message}`)

  return {
    signal: signal as unknown as SignalRow,
    mentions: (mentions ?? []) as unknown as SignalMentionRow[],
    acknowledgements: (acks ?? []) as unknown as SignalAckRow[],
    tasks: (tasks ?? []) as unknown as SignalTaskLinkRow[],
  }
}

// ── createSignal (B3, AC-430 backing / FR-406) ───────────────────────────────

/** Post a Signal + its staged mentions + notification fan-out in ONE transactional RPC
 * (mos.create_signal_with_mentions). Atomic: a failure anywhere (bad mention target, above the
 * recipient cap) rolls the whole post back — nothing is committed, so the composer may safely retry
 * without double-posting. org_id/author_id are stamped by DB defaults (never sent). Returns the new
 * Signal id. */
export async function createSignal(input: CreateSignalInput): Promise<string> {
  const { data, error } = await mos().rpc('create_signal_with_mentions', {
    p_body: input.body,
    p_owning_team_id: input.owningTeamId,
    p_occurred_at: input.occurredAt,
    p_attention: input.attention ?? 'FYI',
    p_mentions: input.mentions.map((m) => ({ kind: m.kind, targetId: m.targetId })),
  })
  if (error) throw new Error(`createSignal failed — ${error.message}`)
  return data as string
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

// ── acknowledgeSignal / linkSignalTask (B5, FR-412/413) ─────────────────────

/** Any reader may acknowledge a Signal at most once (the unique(signal_id,person_id) constraint
 * rejects a repeat). person_id is never sent — the DB default stamps the caller. */
export async function acknowledgeSignal(signalId: string): Promise<void> {
  const { error } = await mos().from('signal_acknowledgements').insert({ signal_id: signalId })
  if (error) throw new Error(`acknowledgeSignal failed — ${error.message}`)
}

/** Link a Signal to an existing Task (the many-to-many signal_tasks bridge, D25/OD-39). */
export async function linkSignalTask(signalId: string, taskId: string): Promise<void> {
  const { error } = await mos().from('signal_tasks').insert({ signal_id: signalId, task_id: taskId })
  // Retrying an interrupted create can race with the original insert. The bridge's unique key
  // makes that retry idempotent: the desired state already exists.
  if (error && error.code !== '23505') throw new Error(`linkSignalTask failed — ${error.message}`)
}

// ── composer option loaders (B6) — shared.teams/sites/team_memberships ───────

type TeamJoinRow = { id: string; name: string; business_unit_id: string; site_id: string | null }

/** Teams where a Signal posted by the current author would remain readable. The database owns
 * the complete can_read_signal policy; this RPC returns ready-to-render options in one call. */
export async function listReadableAuthorTeams(authorId: string): Promise<TeamOption[]> {
  const { data, error } = await mos().rpc('teams_author_can_read_back', { p_author_id: authorId })
  if (error) throw new Error(`listReadableAuthorTeams failed — ${error.message}`)
  return (data ?? []) as TeamOption[]
}

/** The author's active membership Teams (owning-Team select options), primary first. */
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

// ── listSignalRevisions (C3 — the record host's revision history, FR-410) ────

export interface SignalRevisionRow {
  id: string
  signal_id: string
  actor_id: string
  field: 'body' | 'occurred_at' | 'category' | 'attention'
  old_value: string | null
  new_value: string | null
  created_at: string
}

/** Read a Signal's revision audit trail, oldest-first (matches the signal_revisions_signal_idx
 * (signal_id, created_at) index). Trigger-written only — this is a read-only reader. */
export async function listSignalRevisions(signalId: string): Promise<SignalRevisionRow[]> {
  const { data, error } = await mos()
    .from('signal_revisions').select('*').eq('signal_id', signalId).order('created_at', { ascending: true })
  if (error) throw new Error(`listSignalRevisions failed — ${error.message}`)
  return (data ?? []) as unknown as SignalRevisionRow[]
}

// ── loadMentionRosters (C1 — the composer's fan-out preview needs real rosters) ──

export interface MentionRosters { teamMembers: MemberLookup; buMembers: MemberLookup }

/** Build the composer's fan-out-preview rosters. teamMembers: Team id → active member person ids.
 * buMembers: BU id → the active members of that BU's Teams UNION the holders of a Role scoped to
 * that BU (mirrors the fan_out_signal_mention RPC's @BU recipient union, client-side, for the
 * preview count only — the RPC itself is the authoritative count at post time, D24/AC-422). Loads
 * the whole org's substrate once (small at Gordi's ~30-person scale, same pattern as getPeople()). */
export async function loadMentionRosters(): Promise<MentionRosters> {
  const [teamsRes, membershipsRes, rolesRes, personRolesRes] = await Promise.all([
    shared().from('teams').select('id,business_unit_id').is('archived_at', null),
    shared().from('team_memberships').select('team_id,person_id').is('effective_to', null),
    shared().from('roles').select('id,business_unit_id'),
    shared().from('person_roles').select('person_id,role_id'),
  ])
  if (teamsRes.error) throw new Error(`loadMentionRosters teams failed — ${teamsRes.error.message}`)
  if (membershipsRes.error) throw new Error(`loadMentionRosters memberships failed — ${membershipsRes.error.message}`)
  if (rolesRes.error) throw new Error(`loadMentionRosters roles failed — ${rolesRes.error.message}`)
  if (personRolesRes.error) throw new Error(`loadMentionRosters person_roles failed — ${personRolesRes.error.message}`)

  const teamMembers: MemberLookup = {}
  for (const m of (membershipsRes.data ?? []) as { team_id: string; person_id: string }[]) {
    (teamMembers[m.team_id] ??= []).push(m.person_id)
  }

  const buOfTeam = new Map(
    ((teamsRes.data ?? []) as { id: string; business_unit_id: string }[]).map((t) => [t.id, t.business_unit_id]),
  )
  const buOfRole = new Map(
    ((rolesRes.data ?? []) as { id: string; business_unit_id: string }[]).map((r) => [r.id, r.business_unit_id]),
  )

  const buMembers: MemberLookup = {}
  for (const [teamId, personIds] of Object.entries(teamMembers)) {
    const buId = buOfTeam.get(teamId)
    if (!buId) continue
    (buMembers[buId] ??= []).push(...personIds)
  }
  for (const pr of (personRolesRes.data ?? []) as { person_id: string; role_id: string }[]) {
    const buId = buOfRole.get(pr.role_id)
    if (!buId) continue
    (buMembers[buId] ??= []).push(pr.person_id)
  }

  return { teamMembers, buMembers }
}

// ── summarizeLinkedTasks (C3 — the "N Tasks · M open" linked-work summary, FR-413) ──

export interface LinkedTasksSummaryCount { total: number; open: number }

/** Pure: count total signal_tasks links and how many resolve to a non-Done Task status. An
 * unresolved task id (not present in statusById — e.g. archived or not yet loaded) counts toward
 * the total but never toward "open" (fail-quiet, never a misleading open count). */
export function summarizeLinkedTasks(
  links: SignalTaskLinkRow[], statusById: Record<string, string>,
): LinkedTasksSummaryCount {
  const open = links.filter((link) => {
    const status = statusById[link.task_id]
    return status !== undefined && status !== 'Done'
  }).length
  return { total: links.length, open }
}

// ── orderSignalsForFeed (B13, AC-426) ─────────────────────────────────────────

const ATTENTION_WEIGHT: Record<Attention, number> = { Urgent: 2, 'Needs attention': 1, FYI: 0 }

/** Home ambient feed order (FR-414): Urgent/Needs-attention float above FYI (attention tier takes
 * precedence); newest-first within the same tier. Pure — returns a new array, never mutates. */
export function orderSignalsForFeed(rows: SignalRow[]): SignalRow[] {
  return [...rows].sort((a, b) => {
    const tierDelta = ATTENTION_WEIGHT[b.attention] - ATTENTION_WEIGHT[a.attention]
    if (tierDelta !== 0) return tierDelta
    return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
  })
}
