import { describe, it, expect } from 'vitest'
import { filterTasksByTeam, groupTaskIdsByTeam, type TeamScopedTask } from './task-team-filter'

// AC-813 slice (FR-V3-007/013/014): Work Task filtering/grouping keys on the executing Team, not on
// an independent BU-owner value. These are the pure projections Issue 6's RecordCollection Task
// adapter consumes once the mos.tasks.team_id contract lands — the descriptor gains a Team filter
// and Team grouping keyed by canonical mos.tasks.id (Issue 6 plan §8 defers exactly this to Issue 8).

const t = (id: string, teamId: string | null): TeamScopedTask => ({ id, teamId })

describe('filterTasksByTeam', () => {
  it('returns every Task when no Team filter is applied (undefined)', () => {
    const rows = [t('a', 't1'), t('b', 't2')]
    expect(filterTasksByTeam(rows, undefined).map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('narrows to the selected Team by canonical Task identity', () => {
    const rows = [t('a', 't1'), t('b', 't2'), t('c', 't1')]
    expect(filterTasksByTeam(rows, 't1').map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('excludes transitional unresolved (no-Team) rows from a Team-scoped filter', () => {
    const rows = [t('a', 't1'), t('b', null)]
    expect(filterTasksByTeam(rows, 't1').map((r) => r.id)).toEqual(['a'])
  })
})

describe('groupTaskIdsByTeam', () => {
  it('groups canonical Task ids by executing Team and buckets unresolved rows separately', () => {
    const rows = [t('a', 't1'), t('b', 't2'), t('c', 't1'), t('d', null)]
    const groups = groupTaskIdsByTeam(rows)
    expect(groups.get('t1')).toEqual(['a', 'c'])
    expect(groups.get('t2')).toEqual(['b'])
    // Unresolved rows are an honest "Team required" repair bucket, keyed by null.
    expect(groups.get(null)).toEqual(['d'])
  })
})
