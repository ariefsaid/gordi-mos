import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SignalRow } from './signals.types'

// Mock the supabase module: the signals data layer reaches mos/shared via
// supabase.schema('mos'|'shared').from(...) and supabase.schema('mos').rpc(...) — mirrors tasks.ts.
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { listReadableSignals, getSignal } from './signals'
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
