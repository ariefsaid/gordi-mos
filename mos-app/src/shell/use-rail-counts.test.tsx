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

beforeEach(() => vi.clearAllMocks())

describe('useRailCounts — the single rail count-fetch seam', () => {
  it.each([
    { roles: ['member'], isManager: false, view: 'my-work' },
    { roles: ['member'], isManager: true, view: 'team-work' },
    { roles: ['ops_lead'], isManager: false, view: 'team-work' },
    { roles: ['admin'], isManager: true, view: 'all' },
  ])('counts the $view default for $roles with reporting=$isManager', async ({ roles, isManager, view }) => {
    mockUseAuth.mockReturnValue({ status: 'authenticated', viewer: {
      person: { id: 'viewer' }, accessRoles: roles, isManager,
    } } as never)
    mockGetPersonTeams.mockResolvedValue([{ id: 'actual-team' }] as never)
    mockGetRailCounts.mockResolvedValue({ openTasks: 4 })
    const { result } = renderHook(() => useRailCounts())
    await waitFor(() => expect(result.current).toEqual({ openTasks: 4 }))
    expect(mockGetRailCounts).toHaveBeenCalledWith('viewer', view, view === 'team-work' ? ['actual-team'] : [])
    expect(mockGetPersonTeams).toHaveBeenCalledTimes(view === 'team-work' ? 1 : 0)
  })

  it('does not widen a failed Team membership read to an org count', async () => {
    mockUseAuth.mockReturnValue({ status: 'authenticated', viewer: {
      person: { id: 'viewer' }, accessRoles: ['manager'], isManager: true,
    } } as never)
    mockGetPersonTeams.mockRejectedValue(new Error('directory unavailable'))
    const { result } = renderHook(() => useRailCounts())
    await waitFor(() => expect(mockGetPersonTeams).toHaveBeenCalled())
    expect(result.current).toBeNull()
    expect(mockGetRailCounts).not.toHaveBeenCalled()
  })

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

  it('does not fetch when the viewer is not authenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    const { result } = renderHook(() => useRailCounts())
    expect(result.current).toBeNull()
    expect(mockGetRailCounts).not.toHaveBeenCalled()
  })
})
