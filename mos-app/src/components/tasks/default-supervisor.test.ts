import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/admin-access', () => ({ listTeamLeadAssignments: vi.fn() }))

import { listTeamLeadAssignments } from '@/lib/db/admin-access'
import { defaultSupervisorId, homeTeamId, loadHomeLeadId } from './default-supervisor'
import type { TeamOption } from '@/lib/db/directory'

const team = (id: string, isPrimary?: boolean): TeamOption =>
  ({ id, name: id, businessUnitId: 'bu', siteId: null, orgId: 'o', ...(isPrimary === undefined ? {} : { isPrimary }) })
const LEADS = [
  { team_id: 'hq', lead_person_id: 'lead-hq' },
  { team_id: 'bar', lead_person_id: 'lead-bar' },
  { team_id: 'nolead', lead_person_id: null },
]

describe('home Team supervisor default', () => {
  it('home Team is the primary one, else the only one, else none', () => {
    expect(homeTeamId([team('bar', false), team('hq', true)])).toBe('hq')
    expect(homeTeamId([team('bar')])).toBe('bar')
    expect(homeTeamId([team('bar', false), team('hq', false)])).toBeNull()
  })

  it('returns the home Team lead, never another Team lead', () => {
    expect(defaultSupervisorId(LEADS, 'hq', 'viewer')).toBe('lead-hq')
  })

  it('stays blank when the Team has no lead, no row, or the creator is the lead', () => {
    expect(defaultSupervisorId(LEADS, 'nolead', 'viewer')).toBeNull()
    expect(defaultSupervisorId(LEADS, 'other', 'viewer')).toBeNull()
    expect(defaultSupervisorId(LEADS, 'hq', 'lead-hq')).toBeNull()
    expect(defaultSupervisorId(LEADS, null, 'viewer')).toBeNull()
  })

  it('loads only for a viewer allowed to read leads, and swallows a failed read', async () => {
    vi.mocked(listTeamLeadAssignments).mockReset().mockResolvedValue(LEADS as never)
    expect(await loadHomeLeadId([team('hq', true)], 'viewer', true)).toBe('lead-hq')
    expect(await loadHomeLeadId([team('hq', true)], 'viewer', false)).toBeNull()
    expect(listTeamLeadAssignments).toHaveBeenCalledTimes(1)
    vi.mocked(listTeamLeadAssignments).mockRejectedValue(new Error('denied'))
    expect(await loadHomeLeadId([team('hq', true)], 'viewer', true)).toBeNull()
  })
})
