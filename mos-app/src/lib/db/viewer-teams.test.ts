// Viewer-scoped team read for /profile (#807).
// AC-031 owns primary-first order — asserted here at the data layer AND at the page (page-scope).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import { listViewerTeams } from './viewer-teams'

const schemaMock = vi.mocked(supabase.schema)

function makeSharedSchema(tableResponses: Record<string, { data: unknown; error: unknown }>) {
  const fromImpl = (table: string) => {
    const result = tableResponses[table] ?? { data: null, error: null }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
    builder.or = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.in = vi.fn(() => builder)
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return builder
  }
  return { from: vi.fn(fromImpl) }
}

beforeEach(() => vi.clearAllMocks())

describe('listViewerTeams (#807, AC-031)', () => {
  it('AC-031: primary Team first, then any other live Teams by name', async () => {
    const memberships = [
      { team_id: 't-hq', is_primary: false, effective_from: '2025-01-01', effective_to: null },
      { team_id: 't-fin', is_primary: true, effective_from: '2024-01-01', effective_to: null },
      { team_id: 't-swp', is_primary: false, effective_from: '2025-06-01', effective_to: null },
    ]
    const teams = [
      { id: 't-hq', name: 'HQ Team', archived_at: null },
      { id: 't-fin', name: 'Finance Team', archived_at: null },
      { id: 't-swp', name: 'SWP Team', archived_at: null },
    ]
    // @ts-expect-error test double
    schemaMock.mockReturnValue(makeSharedSchema({
      team_memberships: { data: memberships, error: null },
      teams: { data: teams, error: null },
    }))

    const rows = await listViewerTeams('p-fitri')
    expect(rows.map((r) => r.name)).toEqual(['Finance Team', 'HQ Team', 'SWP Team'])
    expect(rows[0].is_primary).toBe(true)
    expect(rows[1].is_primary).toBe(false)
  })

  it('returns [] when the viewer has no live memberships', async () => {
    // @ts-expect-error test double
    schemaMock.mockReturnValue(makeSharedSchema({
      team_memberships: { data: [], error: null },
      teams: { data: [], error: null },
    }))
    expect(await listViewerTeams('p-nobody')).toEqual([])
  })

  it('drops rows whose team is archived (join keeps only live teams)', async () => {
    const memberships = [
      { team_id: 't-live', is_primary: true, effective_from: '2024-01-01', effective_to: null },
      { team_id: 't-arch', is_primary: false, effective_from: '2024-01-01', effective_to: null },
    ]
    // teams.select filters archived_at is null, so an archived team just isn't returned
    const teams = [{ id: 't-live', name: 'Live Team', archived_at: null }]
    // @ts-expect-error test double
    schemaMock.mockReturnValue(makeSharedSchema({
      team_memberships: { data: memberships, error: null },
      teams: { data: teams, error: null },
    }))

    const rows = await listViewerTeams('p1')
    expect(rows).toEqual([{ team_id: 't-live', name: 'Live Team', is_primary: true }])
  })

  it('throws on membership read failure so callers can surface it', async () => {
    // @ts-expect-error test double
    schemaMock.mockReturnValue(makeSharedSchema({
      team_memberships: { data: null, error: { message: 'rls denied' } },
    }))
    await expect(listViewerTeams('p1')).rejects.toThrow(/rls denied/)
  })

  it('a strict-primary demotes when effective_to is set — matches default_stream() semantics', async () => {
    const memberships = [
      // is_primary true BUT with an end date → gates resolve NO home stream, so the row is not
      // primary here either. The list still includes it, just not marked primary.
      { team_id: 't-ending', is_primary: true, effective_from: '2024-01-01', effective_to: '2099-01-01' },
      { team_id: 't-plain', is_primary: false, effective_from: '2024-01-01', effective_to: null },
    ]
    const teams = [
      { id: 't-ending', name: 'Ending Team', archived_at: null },
      { id: 't-plain', name: 'Plain Team', archived_at: null },
    ]
    // @ts-expect-error test double
    schemaMock.mockReturnValue(makeSharedSchema({
      team_memberships: { data: memberships, error: null },
      teams: { data: teams, error: null },
    }))
    const rows = await listViewerTeams('p1')
    // Neither is strict-primary → sort falls to name order
    expect(rows.map((r) => [r.name, r.is_primary])).toEqual([
      ['Ending Team', false],
      ['Plain Team', false],
    ])
  })
})
