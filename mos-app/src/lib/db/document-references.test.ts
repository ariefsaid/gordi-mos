import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => ({ supabase: { schema: vi.fn() } }))
vi.mock('./directory', () => ({ getPeople: vi.fn() }))
vi.mock('./signals', () => ({ listAllTeams: vi.fn() }))

import { supabase } from '@/lib/supabase'
import { getPeople } from './directory'
import { listAllTeams } from './signals'
import { loadMentionRoster, resolveMentionNames, resolveRecordTitles, searchLinkableRecords } from './document-references'

const schemaMock = vi.mocked(supabase.schema)

/** A query builder that answers per table (what RLS would let the viewer see) and records the filters. */
function tables(rows: Record<string, unknown[]>) {
  const calls: Array<{ table: string; ilike?: [string, string]; inIds?: string[]; limit?: number }> = []
  schemaMock.mockReturnValue({
    from: vi.fn((table: string) => {
      const call: (typeof calls)[number] = { table }
      calls.push(call)
      const builder: Record<string, unknown> = {}
      for (const name of ['select', 'is', 'order']) builder[name] = vi.fn(() => builder)
      builder.ilike = vi.fn((c: string, v: string) => { call.ilike = [c, v]; return builder })
      builder.in = vi.fn((_c: string, ids: string[]) => { call.inIds = ids; return builder })
      builder.limit = vi.fn((n: number) => { call.limit = n; return builder })
      builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null })
      return builder
    }),
  } as never)
  return calls
}

beforeEach(() => vi.clearAllMocks())

describe('mention roster', () => {
  it('offers people (never the viewer) and Teams, and no Business Units', async () => {
    vi.mocked(getPeople).mockResolvedValue([{ id: 'me', full_name: 'Me' }, { id: 'p2', full_name: 'Rama' }])
    vi.mocked(listAllTeams).mockResolvedValue([{ id: 't1', name: 'Roastery', business_unit_id: 'bu', site_id: null, is_primary: false }])
    expect(await loadMentionRoster('me')).toEqual({
      people: [{ id: 'p2', label: 'Rama' }],
      teams: [{ id: 't1', label: 'Roastery' }],
    })
  })

  it('names mentions by their current name and leaves out ids it cannot read', async () => {
    tables({ people: [{ id: 'p1', full_name: 'Rama Roastery' }], teams: [] })
    const names = await resolveMentionNames(['p1', 'gone'], ['t1'])
    expect(names.people.get('p1')).toBe('Rama Roastery')
    expect(names.people.has('gone')).toBe(false)
    expect(names.teams.size).toBe(0)
  })
})

describe('record links', () => {
  it('lists, per kind, only what the viewer can read, signals by their first line', async () => {
    tables({
      tasks: [{ id: 'k1', title: 'Approve Q4 budget', status: 'Open' }],
      objectives: [{ id: 'o1', name: 'Consistent espresso', period_year: 2026, period_quarter: 4 }],
      work_lines: [{ id: 'w1', name: 'Roastery move', type: 'project' }],
      signals: [{ id: 's1', body: '\nCafe 2 espresso running fast\nsecond line' }],
    })
    const found = await searchLinkableRecords('espresso')
    expect(found.map((r) => [r.kind, r.title, r.detail])).toEqual([
      ['signal', 'Cafe 2 espresso running fast', null],
      ['objective', 'Consistent espresso', 'Q4 2026'],
      ['task', 'Approve Q4 budget', 'Open'],
      ['project', 'Roastery move', 'project'],
    ])
  })

  it('filters by the typed text, and lists the most recent for an empty query', async () => {
    const withTerm = tables({})
    await searchLinkableRecords('50%')
    expect(withTerm.filter((c) => c.ilike).map((c) => c.ilike![1])).toEqual(['%50\\%%', '%50\\%%', '%50\\%%', '%50\\%%'])
    const empty = tables({})
    await searchLinkableRecords('  ')
    expect(empty.some((c) => c.ilike)).toBe(false)
    expect(empty.every((c) => c.limit === 5)).toBe(true)
  })

  it('titles every linked record it can read; an unreadable one is absent, so it shows as restricted', async () => {
    const calls = tables({ tasks: [{ id: 'k1', title: 'Approve Q4 budget' }], signals: [] })
    const titles = await resolveRecordTitles([
      { kind: 'task', id: 'k1' }, { kind: 'task', id: 'k1' }, { kind: 'signal', id: 'hidden' },
    ])
    expect(titles.get('task:k1')).toBe('Approve Q4 budget')
    expect(titles.has('signal:hidden')).toBe(false)
    expect(calls.find((c) => c.table === 'tasks')?.inIds).toEqual(['k1'])
    expect(calls.some((c) => c.table === 'objectives')).toBe(false)
  })
})
