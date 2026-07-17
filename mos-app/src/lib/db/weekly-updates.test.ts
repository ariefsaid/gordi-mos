import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WeeklyUpdateRow, WeeklyUpdateItemRow } from './weekly-updates.types'

// Mock the supabase module: the data layer reaches mos via supabase.schema('mos').from(...).
vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { getMyUpdate, listTeamUpdates } from './weekly-updates'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)

// ── Mock harness (mirrors tasks.test.ts) ────────────────────────────────────────
interface Recorder {
  fromTables: string[]
  selects: string[]
  eqs: Array<[string, unknown]>
  inserts: unknown[]
  updates: unknown[]
  deletes: string[]
  orders: Array<[string, unknown]>
}

function makeSchema(responses: Record<string, { data: unknown; error: unknown }[]>, rec: Recorder) {
  const counters: Record<string, number> = {}
  const fromImpl = (table: string) => {
    rec.fromTables.push(table)
    const result = () => {
      const i = counters[table] ?? 0
      counters[table] = i + 1
      const queue = responses[table] ?? []
      return queue[Math.min(i, queue.length - 1)] ?? { data: null, error: null }
    }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn((s?: string) => { if (s) rec.selects.push(s); return builder })
    builder.insert = vi.fn((rows: unknown) => { rec.inserts.push(rows); return builder })
    builder.update = vi.fn((patch: unknown) => { rec.updates.push(patch); return builder })
    builder.delete = vi.fn(() => { rec.deletes.push(table); return builder })
    builder.eq = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.in = vi.fn(() => builder)
    builder.is = vi.fn((c: string, v: unknown) => { rec.eqs.push([c, v]); return builder })
    builder.order = vi.fn((c: string, o: unknown) => { rec.orders.push([c, o]); return builder })
    builder.single = vi.fn(() => Promise.resolve(result()))
    builder.maybeSingle = vi.fn(() => Promise.resolve(result()))
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

function freshRec(): Recorder {
  return { fromTables: [], selects: [], eqs: [], inserts: [], updates: [], deletes: [], orders: [] }
}

const UPDATE_ID = '00000000-0000-0000-0000-00000000c001'
const PERSON = '00000000-0000-0000-0000-0000000000d1'
const WEEK = '2026-06-08'

const sampleUpdate: WeeklyUpdateRow = {
  id: UPDATE_ID, org_id: 'org', person_id: PERSON, week_start: WEEK,
  summary: 'my week', status: 'draft', submitted_at: null,
  created_by: PERSON, created_at: '2026-06-10T00:00:00Z', updated_at: '2026-06-10T00:00:00Z',
}

beforeEach(() => vi.clearAllMocks())

function noOrgId(rec: Recorder) {
  expect(rec.eqs.filter(([c]) => c === 'org_id')).toHaveLength(0)
  const payloads = [...rec.inserts, ...rec.updates].flat()
  for (const p of payloads) {
    if (p && typeof p === 'object') expect(Object.keys(p as object)).not.toContain('org_id')
  }
}

// ── getMyUpdate ─────────────────────────────────────────────────────────────────
describe('getMyUpdate (FR-010)', () => {
  it('returns null when no update row exists for (person, week)', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      weekly_updates: [{ data: null, error: null }],
    }, rec) as never)
    const out = await getMyUpdate(PERSON, WEEK)
    expect(out).toBeNull()
    expect(rec.fromTables).toContain('weekly_updates')
    noOrgId(rec)
  })

  it('returns the update + its items (position asc) when a row exists', async () => {
    const rec = freshRec()
    const items: WeeklyUpdateItemRow[] = []
    schemaMock.mockReturnValue(makeSchema({
      weekly_updates: [{ data: sampleUpdate, error: null }],
      weekly_update_items: [{ data: items, error: null }],
    }, rec) as never)
    const out = await getMyUpdate(PERSON, WEEK)
    expect(out).not.toBeNull()
    expect(out!.update).toEqual(sampleUpdate)
    expect(out!.items).toEqual(items)
    expect(rec.orders).toContainEqual(['position', { ascending: true }])
    noOrgId(rec)
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({
      weekly_updates: [{ data: null, error: { message: 'boom' } }],
    }, rec) as never)
    await expect(getMyUpdate(PERSON, WEEK)).rejects.toThrow(/boom/)
  })
})

// ── listTeamUpdates ─────────────────────────────────────────────────────────────
describe('listTeamUpdates (FR-030/031/036) — names resolved client-side, no embed', () => {
  const team = [
    { person_id: 'p1', full_name: 'Alice', role_label: 'Lead' },
    { person_id: 'p2', full_name: 'Bob', role_label: 'Staff' },
    { person_id: 'p3', full_name: 'Carol', role_label: null },
  ]

  it('maps submitted→filed, draft→draft, missing→not_started; resolves names from the roster', async () => {
    const rec = freshRec()
    const rows: WeeklyUpdateRow[] = [
      { ...sampleUpdate, id: 'u1', person_id: 'p1', status: 'submitted', submitted_at: '2026-06-12T09:00:00Z', summary: 'shipped the release this week' },
      { ...sampleUpdate, id: 'u2', person_id: 'p2', status: 'draft', submitted_at: null, summary: 'wip' },
    ]
    schemaMock.mockReturnValue(makeSchema({ weekly_updates: [{ data: rows, error: null }] }, rec) as never)

    const out = await listTeamUpdates(WEEK, team)
    expect(out).toHaveLength(3)
    const byId = Object.fromEntries(out.map(r => [r.person_id, r]))
    expect(byId.p1.state).toBe('filed')
    expect(byId.p1.full_name).toBe('Alice')
    expect(byId.p1.summary_excerpt).toBe('shipped the release this week')
    expect(byId.p1.submitted_at).toBe('2026-06-12T09:00:00Z')
    expect(byId.p2.state).toBe('draft')
    expect(byId.p2.full_name).toBe('Bob')
    expect(byId.p3.state).toBe('not_started')
    expect(byId.p3.summary_excerpt).toBeNull()
    // never an embed: select must not join people across schemas
    expect(rec.selects.join(' ')).not.toContain(':people')
    noOrgId(rec)
  })

  it('all not_started when the team has no updates for the week; counts hold', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ weekly_updates: [{ data: [], error: null }] }, rec) as never)
    const out = await listTeamUpdates(WEEK, team)
    expect(out.every(r => r.state === 'not_started')).toBe(true)
  })

  it('throws on a non-null PostgREST error', async () => {
    const rec = freshRec()
    schemaMock.mockReturnValue(makeSchema({ weekly_updates: [{ data: null, error: { message: 'team boom' } }] }, rec) as never)
    await expect(listTeamUpdates(WEEK, team)).rejects.toThrow(/team boom/)
  })
})
