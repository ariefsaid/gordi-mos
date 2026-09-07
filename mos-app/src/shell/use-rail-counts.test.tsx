import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/rail-counts', () => ({ getRailCounts: vi.fn() }))
vi.mock('@/lib/db/directory', () => ({ getPersonTeams: vi.fn() }))

import { useAuth } from '@/auth/use-auth'
import { getRailCounts } from '@/lib/db/rail-counts'
import { getPersonTeams } from '@/lib/db/directory'
import { useRailCounts } from './use-rail-counts'

const mockUseAuth = vi.mocked(useAuth)
const mockGetRailCounts = vi.mocked(getRailCounts)
const mockGetPersonTeams = vi.mocked(getPersonTeams)

function authed() {
  mockUseAuth.mockReturnValue({ status: 'authenticated' } as never)
}

const VIEWER = '11111111-1111-4111-8111-111111111111'
const TEAM = '22222222-2222-4222-8222-222222222222'
const BU = '33333333-3333-4333-8333-333333333333'

function authedAs(accessRoles: string[], isManager: boolean) {
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    viewer: { person: { id: VIEWER }, accessRoles, isManager },
  } as never)
}

beforeEach(() => vi.clearAllMocks())

describe('useRailCounts — the single rail count-fetch seam', () => {
  it('fetches once when authenticated and returns the resolved counts', async () => {
    authed()
    mockGetRailCounts.mockResolvedValue({ openTasks: 9 })
    const { result } = renderHook(() => useRailCounts())
    expect(result.current).toBeNull() // null until it resolves
    await waitFor(() => expect(result.current).toEqual({ openTasks: 9 }))
    expect(mockGetRailCounts).toHaveBeenCalledTimes(1)
  })

  it('stays null (no badges) when the fetch fails', async () => {
    authed()
    mockGetRailCounts.mockRejectedValue(new Error('rls denied'))
    const { result } = renderHook(() => useRailCounts())
    await waitFor(() => expect(mockGetRailCounts).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  // AC-014 (#749): the badge the rail paints is `openTasks`, straight through — so pinning the
  // number this seam returns pins the badge. The stub counts a fixture the way the DB would,
  // which is what makes a wrong default view show up as a wrong number rather than a wrong call.
  it("the badge is the default view's non-Done count, not the org-wide one", async () => {
    const tasks = [
      { status: 'Open', teamId: TEAM }, { status: 'Blocked', teamId: TEAM },
      { status: 'Done', teamId: TEAM },
      { status: 'Open', teamId: null, businessUnitId: BU },
      { status: 'Open', teamId: 'other-team', businessUnitId: 'other-bu' },
      { status: 'In Progress', teamId: 'other-team', businessUnitId: 'other-bu' },
    ]
    authedAs(['ops_lead'], false)
    mockGetPersonTeams.mockResolvedValue([{ id: TEAM, name: 'Retail Ops', business_unit_id: BU }])
    mockGetRailCounts.mockImplementation(async (_personId, defaultView, teamIds = [], buIds = []) => {
      const inScope = tasks.filter((task) => {
        if (defaultView !== 'team-work') return true
        return task.teamId !== null && task.teamId !== undefined
          ? teamIds.includes(task.teamId)
          : buIds.includes(task.businessUnitId as string)
      })
      return { openTasks: inScope.filter((task) => task.status !== 'Done').length }
    })

    const { result } = renderHook(() => useRailCounts())

    // Team work: two open team rows + the legacy null-team row in the team's BU. All would be 5.
    await waitFor(() => expect(result.current).toEqual({ openTasks: 3 }))
  })

  it('does not fetch when the viewer is not authenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    const { result } = renderHook(() => useRailCounts())
    expect(result.current).toBeNull()
    expect(mockGetRailCounts).not.toHaveBeenCalled()
  })
})
