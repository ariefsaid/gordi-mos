import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SignalRow } from './signals.types'

// Mock the supabase module: the signals data layer reaches mos/shared via
// supabase.schema('mos'|'shared').from(...) and supabase.schema('mos').rpc(...) — mirrors tasks.ts.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

// createFollowUpTask reuses the canonical createTask (Rule 11) — mocked here, exercised for real
// in tasks.test.ts.
vi.mock('./tasks', () => ({ createTask: vi.fn() }))

import {
  listReadableSignals, getSignal, createSignal, correctSignal, retractSignal,
  acknowledgeSignal, linkSignalTask, createFollowUpTask,
  listAuthorTeams, listAllTeams, getTeamSite, dedupeRecipients, orderSignalsForFeed,
} from './signals'
import * as tasksDal from './tasks'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness ──────────────────────────────────────────────────────────────
// A chainable query-builder recorder keyed by `${schema}.${table}` (and `rpc.${name}`
// for RPC calls) so a single test can queue distinct responses per schema+table.
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  inserts: unknown[]
  updates: unknown[]
  orders: Array<[string, unknown]>
  rpcs: Array<[string, unknown]>
}

type Result = { data: unknown; error: unknown }

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], inserts: [], updates: [], orders: [], rpcs: [] }
}

function makeClient(responses: Record<string, Result[]>, rec: Recorder) {
  const counters: Record<string, number> = {}
  function nextResult(key: string): Result {
    const i = counters[key] ?? 0
    counters[key] = i + 1
    const queue = responses[key] ?? []
    return queue[Math.min(i, queue.length - 1)] ?? { data: null, error: null }
  }
  function fromImpl(schemaName: string, table: string) {
    const key = `${schemaName}.${table}`
    rec.fromTables.push(key)
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
    builder.insert = vi.fn((rows: unknown) => { rec.inserts.push(rows); return builder })
    builder.update = vi.fn((patch: unknown) => { rec.updates.push(patch); return builder })
    builder.eq = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.is = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.in = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.single = vi.fn(() => Promise.resolve(nextResult(key)))
    builder.maybeSingle = vi.fn(() => Promise.resolve(nextResult(key)))
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(nextResult(key)).then(resolve)
    return builder
  }
  return {
    schema: vi.fn((schemaName: string) => ({
      from: vi.fn((table: string) => fromImpl(schemaName, table)),
      rpc: vi.fn((name: string, args: unknown) => {
        rec.rpcs.push([name, args])
        return Promise.resolve(nextResult(`rpc.${name}`))
      }),
    })),
  }
}

function mockSupabase(responses: Record<string, Result[]>, rec: Recorder) {
  const client = makeClient(responses, rec)
  schemaMock.mockImplementation((name: string) => client.schema(name) as never)
}

beforeEach(() => vi.clearAllMocks())

const SIGNAL_ID = '00000000-0000-0000-0000-00000000f001'
const AUTHOR_ID = '00000000-0000-0000-0000-00000000d001'
const TEAM_ID = '00000000-0000-0000-0000-00000000t001'

const sampleSignal: SignalRow = {
  id: SIGNAL_ID, author_id: AUTHOR_ID, owning_team_id: TEAM_ID,
  occurred_at: '2026-07-16T02:00:00Z', body: 'Freezer alarm went off',
  attention: 'Needs attention', category: null, source: 'human',
  retracted_at: null, retract_reason: null, edited_at: null,
  created_at: '2026-07-16T02:00:00Z',
}

// ── listReadableSignals ─────────────────────────────────────────────────────
describe('listReadableSignals', () => {
  it('selects mos.signals, excludes retracted by default, orders occurred_at desc, never sends org_id', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: [sampleSignal], error: null }] }, rec)

    const rows = await listReadableSignals()
    expect(rows).toEqual([sampleSignal])
    expect(rec.fromTables).toContain('mos.signals')
    expect(rec.eqs).toContainEqual(['retracted_at', null])
    expect(rec.orders[0]).toEqual(['occurred_at', { ascending: false }])
    expect(rec.eqs.filter(([c]) => c === 'org_id')).toHaveLength(0)
  })

  it('includes retracted rows when includeRetracted is true', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: [], error: null }] }, rec)

    await listReadableSignals({ includeRetracted: true })
    expect(rec.eqs.find(([c]) => c === 'retracted_at')).toBeUndefined()
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: null, error: { message: 'boom' } }] }, rec)
    await expect(listReadableSignals()).rejects.toThrow(/boom/)
  })
})

// ── getSignal ────────────────────────────────────────────────────────────────
describe('getSignal', () => {
  it('reads the signal row + mentions + acknowledgements + signal_tasks', async () => {
    const rec = freshRec()
    mockSupabase({
      'mos.signals': [{ data: sampleSignal, error: null }],
      'mos.signal_mentions': [{ data: [{ id: 'm1' }], error: null }],
      'mos.signal_acknowledgements': [{ data: [{ id: 'a1' }], error: null }],
      'mos.signal_tasks': [{ data: [{ id: 'st1' }], error: null }],
    }, rec)

    const out = await getSignal(SIGNAL_ID)
    expect(out.signal).toEqual(sampleSignal)
    expect(out.mentions).toEqual([{ id: 'm1' }])
    expect(out.acknowledgements).toEqual([{ id: 'a1' }])
    expect(out.tasks).toEqual([{ id: 'st1' }])
    expect(rec.fromTables).toEqual([
      'mos.signals', 'mos.signal_mentions', 'mos.signal_acknowledgements', 'mos.signal_tasks',
    ])
  })

  it('throws when the signal read errors', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: null, error: { message: 'nope' } }] }, rec)
    await expect(getSignal(SIGNAL_ID)).rejects.toThrow(/nope/)
  })
})

// ── createSignal (B3, AC-430 backing / FR-406) ───────────────────────────────
describe('createSignal', () => {
  it('inserts the signal (no org_id/author_id sent), bulk-inserts staged mentions, fans out, returns the id', async () => {
    const rec = freshRec()
    mockSupabase({
      'mos.signals': [{ data: { id: SIGNAL_ID }, error: null }],
      'mos.signal_mentions': [{ data: null, error: null }],
      'rpc.fan_out_signal_mention': [{ data: 1, error: null }],
    }, rec)

    const id = await createSignal({
      body: 'Freezer alarm went off @Peer',
      owningTeamId: TEAM_ID,
      occurredAt: '2026-07-16T02:00:00Z',
      mentions: [{ kind: 'person', targetId: 'person-peer', label: 'Peer' }],
    })

    expect(id).toBe(SIGNAL_ID)
    const signalInsert = rec.inserts[0] as Record<string, unknown>
    expect(signalInsert.body).toBe('Freezer alarm went off @Peer')
    expect(signalInsert.owning_team_id).toBe(TEAM_ID)
    expect(signalInsert.occurred_at).toBe('2026-07-16T02:00:00Z')
    expect(Object.keys(signalInsert)).not.toContain('org_id')
    expect(Object.keys(signalInsert)).not.toContain('author_id')

    const mentionInsert = rec.inserts[1] as Array<Record<string, unknown>>
    expect(mentionInsert).toEqual([
      { signal_id: SIGNAL_ID, mention_kind: 'person', target_person_id: 'person-peer', target_team_id: null, target_bu_id: null },
    ])

    expect(rec.rpcs).toEqual([['fan_out_signal_mention', { p_signal_id: SIGNAL_ID }]])
  })

  it('skips the fan-out RPC when no mentions are staged', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: { id: SIGNAL_ID }, error: null }] }, rec)

    await createSignal({ body: 'No mentions here', owningTeamId: TEAM_ID, occurredAt: '2026-07-16T02:00:00Z', mentions: [] })
    expect(rec.rpcs).toEqual([])
  })

  it('throws on a signal insert error', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: null, error: { message: 'insert failed' } }] }, rec)
    await expect(createSignal({ body: 'X', owningTeamId: TEAM_ID, occurredAt: '2026-07-16T02:00:00Z', mentions: [] }))
      .rejects.toThrow(/insert failed/)
  })

  it('surfaces a fan-out RPC error (so the composer can show the confirm-above-cap message)', async () => {
    const rec = freshRec()
    mockSupabase({
      'mos.signals': [{ data: { id: SIGNAL_ID }, error: null }],
      'mos.signal_mentions': [{ data: null, error: null }],
      'rpc.fan_out_signal_mention': [{ data: null, error: { message: 'fan-out exceeds cap of 50 recipients' } }],
    }, rec)

    await expect(createSignal({
      body: 'X', owningTeamId: TEAM_ID, occurredAt: '2026-07-16T02:00:00Z',
      mentions: [{ kind: 'team', targetId: 'team-x', label: 'Team X' }],
    })).rejects.toThrow(/fan-out exceeds cap/)
  })
})

// ── correctSignal / retractSignal (B4, FR-410/411) ───────────────────────────
describe('correctSignal', () => {
  it('updates only body|occurred_at|category|attention, scoped to the id', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: null, error: null }] }, rec)

    await correctSignal(SIGNAL_ID, { body: 'Corrected body', category: 'Quality', attention: 'Urgent' })
    expect(rec.updates).toEqual([{ body: 'Corrected body', category: 'Quality', attention: 'Urgent' }])
    expect(rec.eqs).toContainEqual(['id', SIGNAL_ID])
    expect(Object.keys(rec.updates[0] as object)).not.toContain('owning_team_id')
    expect(Object.keys(rec.updates[0] as object)).not.toContain('author_id')
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: null, error: { message: 'immutable' } }] }, rec)
    await expect(correctSignal(SIGNAL_ID, { body: 'x' })).rejects.toThrow(/immutable/)
  })
})

describe('retractSignal', () => {
  it('sets retracted_at + retract_reason, scoped to the id', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: null, error: null }] }, rec)

    await retractSignal(SIGNAL_ID, 'Duplicate report')
    const patch = rec.updates[0] as Record<string, unknown>
    expect(patch.retract_reason).toBe('Duplicate report')
    expect(typeof patch.retracted_at).toBe('string')
    expect(rec.eqs).toContainEqual(['id', SIGNAL_ID])
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signals': [{ data: null, error: { message: 'requires author or signal.retract' } }] }, rec)
    await expect(retractSignal(SIGNAL_ID, 'reason')).rejects.toThrow(/signal\.retract/)
  })
})

// ── acknowledgeSignal / linkSignalTask / createFollowUpTask (B5, FR-412/413) ─
describe('acknowledgeSignal', () => {
  it('inserts an acknowledgement without sending person_id (DB default stamps the caller)', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signal_acknowledgements': [{ data: null, error: null }] }, rec)

    await acknowledgeSignal(SIGNAL_ID)
    expect(rec.inserts).toEqual([{ signal_id: SIGNAL_ID }])
  })

  it('throws on a duplicate-ack unique-constraint error', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signal_acknowledgements': [{ data: null, error: { message: 'duplicate key value' } }] }, rec)
    await expect(acknowledgeSignal(SIGNAL_ID)).rejects.toThrow(/duplicate key/)
  })
})

const TASK_ID = '00000000-0000-0000-0000-00000000c001'

describe('linkSignalTask', () => {
  it('inserts a signal_tasks row', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signal_tasks': [{ data: null, error: null }] }, rec)

    await linkSignalTask(SIGNAL_ID, TASK_ID)
    expect(rec.inserts).toEqual([{ signal_id: SIGNAL_ID, task_id: TASK_ID }])
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signal_tasks': [{ data: null, error: { message: 'nope' } }] }, rec)
    await expect(linkSignalTask(SIGNAL_ID, TASK_ID)).rejects.toThrow(/nope/)
  })
})

describe('createFollowUpTask', () => {
  it('creates the Task via the canonical createTask, then links it to the Signal (Rule 11 — reuse)', async () => {
    const rec = freshRec()
    mockSupabase({ 'mos.signal_tasks': [{ data: null, error: null }] }, rec)
    vi.mocked(tasksDal.createTask).mockResolvedValue(TASK_ID)

    const taskInput = {
      title: 'Repair freezer', businessUnitId: 'bu-1',
      responsiblePersonId: AUTHOR_ID, accountablePersonId: AUTHOR_ID, createdBy: AUTHOR_ID,
    }
    const id = await createFollowUpTask(SIGNAL_ID, taskInput)

    expect(tasksDal.createTask).toHaveBeenCalledWith(taskInput)
    expect(id).toBe(TASK_ID)
    expect(rec.inserts).toEqual([{ signal_id: SIGNAL_ID, task_id: TASK_ID }])
  })
})

// ── composer option loaders (B6) ──────────────────────────────────────────────
describe('listAuthorTeams', () => {
  it('reads active team_memberships for the person, joins client-side to teams, primary first', async () => {
    const rec = freshRec()
    mockSupabase({
      'shared.team_memberships': [{
        data: [
          { team_id: 'team-b', is_primary: false },
          { team_id: 'team-a', is_primary: true },
        ], error: null,
      }],
      'shared.teams': [{
        data: [
          { id: 'team-a', name: 'OwnTeam', business_unit_id: 'bu-1', site_id: 'site-1' },
          { id: 'team-b', name: 'SiblingTeam', business_unit_id: 'bu-1', site_id: null },
        ], error: null,
      }],
    }, rec)

    const teams = await listAuthorTeams(AUTHOR_ID)
    expect(teams).toEqual([
      { id: 'team-a', name: 'OwnTeam', business_unit_id: 'bu-1', site_id: 'site-1', is_primary: true },
      { id: 'team-b', name: 'SiblingTeam', business_unit_id: 'bu-1', site_id: null, is_primary: false },
    ])
    expect(rec.eqs).toContainEqual(['person_id', AUTHOR_ID])
    expect(rec.eqs).toContainEqual(['effective_to', null])
    expect(rec.eqs.filter(([c]) => c === 'org_id')).toHaveLength(0)
  })

  it('returns [] without querying teams when the person has no active memberships', async () => {
    const rec = freshRec()
    mockSupabase({ 'shared.team_memberships': [{ data: [], error: null }] }, rec)
    const teams = await listAuthorTeams(AUTHOR_ID)
    expect(teams).toEqual([])
    expect(rec.fromTables).not.toContain('shared.teams')
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    mockSupabase({ 'shared.team_memberships': [{ data: null, error: { message: 'boom' } }] }, rec)
    await expect(listAuthorTeams(AUTHOR_ID)).rejects.toThrow(/boom/)
  })
})

describe('listAllTeams', () => {
  it('reads active shared.teams ordered by name (backs the @Team mention group)', async () => {
    const rec = freshRec()
    mockSupabase({
      'shared.teams': [{
        data: [{ id: 'team-a', name: 'OwnTeam', business_unit_id: 'bu-1', site_id: 'site-1' }],
        error: null,
      }],
    }, rec)

    const teams = await listAllTeams()
    expect(teams).toEqual([
      { id: 'team-a', name: 'OwnTeam', business_unit_id: 'bu-1', site_id: 'site-1', is_primary: false },
    ])
    expect(rec.eqs).toContainEqual(['archived_at', null])
    expect(rec.orders[0]).toEqual(['name', { ascending: true }])
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    mockSupabase({ 'shared.teams': [{ data: null, error: { message: 'boom' } }] }, rec)
    await expect(listAllTeams()).rejects.toThrow(/boom/)
  })
})

describe('getTeamSite', () => {
  it("resolves the Team's derived Site via its site_id", async () => {
    const rec = freshRec()
    mockSupabase({
      'shared.teams': [{ data: { site_id: 'site-1' }, error: null }],
      'shared.sites': [{ data: { id: 'site-1', name: 'Gordi HQ' }, error: null }],
    }, rec)

    const site = await getTeamSite(TEAM_ID)
    expect(site).toEqual({ id: 'site-1', name: 'Gordi HQ' })
  })

  it('returns null for a site-less (central) Team, without querying sites', async () => {
    const rec = freshRec()
    mockSupabase({ 'shared.teams': [{ data: { site_id: null }, error: null }] }, rec)
    const site = await getTeamSite(TEAM_ID)
    expect(site).toBeNull()
    expect(rec.fromTables).not.toContain('shared.sites')
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    mockSupabase({ 'shared.teams': [{ data: null, error: { message: 'boom' } }] }, rec)
    await expect(getTeamSite(TEAM_ID)).rejects.toThrow(/boom/)
  })
})

// ── dedupeRecipients (B10, AC-422 / FR-408) — pure helper, no supabase involved ──
describe('dedupeRecipients', () => {
  it('counts a @Person mention as exactly one recipient', () => {
    const n = dedupeRecipients([{ kind: 'person', targetId: 'p1', label: 'P1' }], {}, {})
    expect(n).toBe(1)
  })

  it('expands a @Team mention to its active member roster', () => {
    const n = dedupeRecipients(
      [{ kind: 'team', targetId: 'team-a', label: 'Team A' }],
      { 'team-a': ['p1', 'p2', 'p3'] },
      {},
    )
    expect(n).toBe(3)
  })

  it('expands a @BU mention to its member roster', () => {
    const n = dedupeRecipients(
      [{ kind: 'bu', targetId: 'bu-1', label: 'BU 1' }],
      {},
      { 'bu-1': ['p1', 'p2'] },
    )
    expect(n).toBe(2)
  })

  it('deduplicates overlapping recipients across mentions (the anti-double-count invariant)', () => {
    const n = dedupeRecipients(
      [
        { kind: 'team', targetId: 'team-a', label: 'Team A' },
        { kind: 'person', targetId: 'p2', label: 'P2' }, // already a Team A member
      ],
      { 'team-a': ['p1', 'p2', 'p3'] },
      {},
    )
    expect(n).toBe(3)
  })

  it('returns 0 for no staged mentions', () => {
    expect(dedupeRecipients([], {}, {})).toBe(0)
  })
})

// ── orderSignalsForFeed (B13, AC-426) — pure sorter ───────────────────────────
describe('orderSignalsForFeed', () => {
  function row(id: string, attention: SignalRow['attention'], occurredAt: string): SignalRow {
    return { ...sampleSignal, id, attention, occurred_at: occurredAt }
  }

  it('floats Urgent/Needs-attention above FYI even when FYI is more recent', () => {
    const fyiNewer = row('fyi', 'FYI', '2026-07-16T10:00:00Z')
    const urgentOlder = row('urgent', 'Urgent', '2026-07-16T02:00:00Z')
    const out = orderSignalsForFeed([fyiNewer, urgentOlder])
    expect(out.map((r) => r.id)).toEqual(['urgent', 'fyi'])
  })

  it('orders newest-first within the same attention tier', () => {
    const older = row('older', 'Needs attention', '2026-07-16T02:00:00Z')
    const newer = row('newer', 'Needs attention', '2026-07-16T09:00:00Z')
    const out = orderSignalsForFeed([older, newer])
    expect(out.map((r) => r.id)).toEqual(['newer', 'older'])
  })

  it('orders Urgent > Needs attention > FYI as the tier precedence', () => {
    const fyi = row('fyi', 'FYI', '2026-07-16T09:00:00Z')
    const needs = row('needs', 'Needs attention', '2026-07-16T08:00:00Z')
    const urgent = row('urgent', 'Urgent', '2026-07-16T07:00:00Z')
    const out = orderSignalsForFeed([fyi, needs, urgent])
    expect(out.map((r) => r.id)).toEqual(['urgent', 'needs', 'fyi'])
  })

  it('does not mutate the input array', () => {
    const rows = [row('a', 'FYI', '2026-07-16T01:00:00Z'), row('b', 'Urgent', '2026-07-16T02:00:00Z')]
    const copy = [...rows]
    orderSignalsForFeed(rows)
    expect(rows).toEqual(copy)
  })
})
