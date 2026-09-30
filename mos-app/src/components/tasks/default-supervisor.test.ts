import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/db/directory', () => ({ getMyTeamLeads: vi.fn() }))

import { getMyTeamLeads, type TeamOption } from '@/lib/db/directory'
import { defaultSupervisorId, homeTeamId, loadHomeLeadId } from './default-supervisor'

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

  it('loads the home Team lead for any viewer, and swallows a failed read', async () => {
    vi.mocked(getMyTeamLeads).mockReset().mockResolvedValue(LEADS)
    expect(await loadHomeLeadId([team('hq', true)], 'viewer')).toBe('lead-hq')
    vi.mocked(getMyTeamLeads).mockRejectedValue(new Error('denied'))
    expect(await loadHomeLeadId([team('hq', true)], 'viewer')).toBeNull()
  })

  it('reads nothing when the viewer has no home Team', async () => {
    vi.mocked(getMyTeamLeads).mockReset().mockResolvedValue(LEADS)
    expect(await loadHomeLeadId([team('hq', false), team('bar', false)], 'viewer')).toBeNull()
    expect(getMyTeamLeads).not.toHaveBeenCalled()
  })
})
