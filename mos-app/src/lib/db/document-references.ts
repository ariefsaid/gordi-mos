import { supabase } from '@/lib/supabase'
import { getPeople, type PersonOption } from './directory'
import { listAllTeams } from './signals'
import { containsPattern } from './like-pattern'
import { getMeetingTitlesByIds, searchMeetingsByTitle } from './meetings'
import type { RecordLinkKind } from './block-document'
import type { MentionCandidate } from '@/lib/comments/mentions'

// What a block document points at: the people and Teams a `@` mention offers and names, and the
// records a `[[` link offers and titles. Reads go through RLS, so a record the viewer cannot open
// is simply absent from every result — that absence is what the chip shows as "Restricted record".
// Documents store kind + id only; every name and title here is looked up at read time.

const mos = () => supabase.schema('mos')
const shared = () => supabase.schema('shared')

const PER_KIND_LIMIT = 5

// ── mentions ────────────────────────────────────────────────────────────────

export interface MentionRoster {
  people: MentionCandidate[]
  teams: MentionCandidate[]
}

/** The people (never the viewer) and Teams a `@` mention can name; Business Units are not offered. */
export async function loadMentionRoster(viewerId: string | null): Promise<MentionRoster> {
  const [people, teams] = await Promise.all([getPeople(), listAllTeams()])
  return {
    people: people.filter((p: PersonOption) => p.id !== viewerId).map((p) => ({ id: p.id, label: p.full_name })),
    teams: teams.map((team) => ({ id: team.id, label: team.name })),
  }
}

/** Current names for mention ids, archived people included. Ids the viewer cannot read are absent. */
export async function resolveMentionNames(
  personIds: readonly string[], teamIds: readonly string[],
): Promise<{ people: Map<string, string>; teams: Map<string, string> }> {
  const [people, teams] = await Promise.all([
    personIds.length === 0 ? [] : shared().from('people').select('id,full_name').in('id', [...personIds]).then(({ data, error }) => {
      if (error) throw new Error(`resolveMentionNames failed — ${error.message}`)
      return (data ?? []) as Array<{ id: string; full_name: string }>
    }),
    teamIds.length === 0 ? [] : shared().from('teams').select('id,name').in('id', [...teamIds]).then(({ data, error }) => {
      if (error) throw new Error(`resolveMentionNames failed — ${error.message}`)
      return (data ?? []) as Array<{ id: string; name: string }>
    }),
  ])
  return {
    people: new Map(people.map((p) => [p.id, p.full_name])),
    teams: new Map(teams.map((tm) => [tm.id, tm.name])),
  }
}

// ── record links ────────────────────────────────────────────────────────────

export interface LinkableRecord {
  kind: RecordLinkKind
  id: string
  title: string
  /** Muted second line in the picker (status, type, period). */
  detail: string | null
}

export interface RecordRef { kind: RecordLinkKind; id: string }

export const recordKey = (kind: RecordLinkKind, id: string) => `${kind}:${id}`

/** A Signal has no title: its first non-empty line is its identity. */
function signalLine(body: string): string {
  return body.split('\n').map((s) => s.trim()).find((s) => s.length > 0) ?? ''
}

/**
 * Search Tasks, Objectives, Projects/Processes, Signals and Meetings the viewer can open, a few per kind.
 * An empty query lists the most recent. Archived Tasks, Objectives and Projects and retracted
 * Signals are left out.
 */
export async function searchLinkableRecords(query: string): Promise<LinkableRecord[]> {
  const term = query.trim()
  const like = term ? containsPattern(term) : null

  let tasks = mos().from('tasks').select('id,title,status').is('archived_at', null)
  if (like) tasks = tasks.ilike('title', like)
  let objectives = mos().from('objectives').select('id,name,period_year,period_quarter').is('archived_at', null)
  if (like) objectives = objectives.ilike('name', like)
  let workLines = mos().from('work_lines').select('id,name,type').is('archived_at', null)
  if (like) workLines = workLines.ilike('name', like)
  let signals = mos().from('signals').select('id,body').is('retracted_at', null)
  if (like) signals = signals.ilike('body', like)

  const [taskRes, objectiveRes, workLineRes, signalRes, meetings] = await Promise.all([
    tasks.order('last_activity_at', { ascending: false }).limit(PER_KIND_LIMIT),
    objectives.order('name').limit(PER_KIND_LIMIT),
    workLines.order('name').limit(PER_KIND_LIMIT),
    signals.order('created_at', { ascending: false }).limit(PER_KIND_LIMIT),
    searchMeetingsByTitle(term, PER_KIND_LIMIT),
  ])
  for (const res of [taskRes, objectiveRes, workLineRes, signalRes]) {
    if (res.error) throw new Error(`searchLinkableRecords failed — ${res.error.message}`)
  }
  return [
    ...((signalRes.data ?? []) as Array<{ id: string; body: string }>).map((r) => (
      { kind: 'signal' as const, id: r.id, title: signalLine(r.body), detail: null })),
    ...((objectiveRes.data ?? []) as Array<{ id: string; name: string; period_year: number | null; period_quarter: number | null }>).map((r) => (
      { kind: 'objective' as const, id: r.id, title: r.name, detail: r.period_year ? (r.period_quarter ? `Q${r.period_quarter} ${r.period_year}` : String(r.period_year)) : null })),
    ...((taskRes.data ?? []) as Array<{ id: string; title: string; status: string }>).map((r) => (
      { kind: 'task' as const, id: r.id, title: r.title, detail: r.status })),
    ...((workLineRes.data ?? []) as Array<{ id: string; name: string; type: string }>).map((r) => (
      { kind: 'project' as const, id: r.id, title: r.name, detail: r.type })),
    ...meetings.map((r) => ({ kind: 'meeting' as const, id: r.id, title: r.title, detail: r.startsAt?.slice(0, 10) ?? null })),
  ]
}

/**
 * Current title of each linked record, keyed by `kind:id`. A record the viewer cannot read (or that
 * no longer exists) is absent from the map.
 */
export async function resolveRecordTitles(refs: readonly RecordRef[]): Promise<Map<string, string>> {
  const ids = (kind: RecordLinkKind) => [...new Set(refs.filter((r) => r.kind === kind).map((r) => r.id))]
  const out = new Map<string, string>()
  const read = async (kind: RecordLinkKind, table: string, column: string, pick: (row: Record<string, string>) => string) => {
    const wanted = ids(kind)
    if (wanted.length === 0) return
    const { data, error } = await mos().from(table).select(`id,${column}`).in('id', wanted)
    if (error) throw new Error(`resolveRecordTitles failed — ${error.message}`)
    for (const row of (data ?? []) as unknown as Array<Record<string, string>>) out.set(recordKey(kind, row.id), pick(row))
  }
  const meetingIds = ids('meeting')
  await Promise.all([
    getMeetingTitlesByIds(meetingIds).then((rows) => { for (const row of rows) out.set(recordKey('meeting', row.id), row.title) }),
    read('task', 'tasks', 'title', (r) => r.title),
    read('objective', 'objectives', 'name', (r) => r.name),
    read('project', 'work_lines', 'name', (r) => r.name),
    read('signal', 'signals', 'body', (r) => signalLine(r.body)),
  ])
  return out
}
