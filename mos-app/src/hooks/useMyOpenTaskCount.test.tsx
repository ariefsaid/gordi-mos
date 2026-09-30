import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/open-task-count', () => ({ getMyOpenTaskCount: vi.fn() }))

import { useAuth } from '@/auth/use-auth'
import { getMyOpenTaskCount } from '@/lib/db/open-task-count'
import { useMyOpenTaskCount } from './useMyOpenTaskCount'

const mockUseAuth = vi.mocked(useAuth)
const mockCount = vi.mocked(getMyOpenTaskCount)

beforeEach(() => vi.clearAllMocks())

describe('useMyOpenTaskCount — the one open-task count the rail badge and Home share (#1129)', () => {
  it.each([
    { roles: ['member'], isManager: false },
    { roles: ['member'], isManager: true },
    { roles: ['ops_lead'], isManager: false },
    { roles: ['supervisor'], isManager: false },
    { roles: ['admin'], isManager: true },
  ])('asks for the viewer own count only, whatever the role ($roles, reporting=$isManager)', async ({ roles, isManager }) => {
    mockUseAuth.mockReturnValue({ status: 'authenticated', viewer: {
      person: { id: 'viewer' }, accessRoles: roles, isManager,
    } } as never)
    mockCount.mockResolvedValue(4)
    const { result } = renderHook(() => useMyOpenTaskCount())
    await waitFor(() => expect(result.current).toBe(4))
    expect(mockCount).toHaveBeenCalledTimes(1)
    expect(mockCount).toHaveBeenCalledWith('viewer')
  })

  it('is null until it resolves and stays null when the read fails', async () => {
    mockUseAuth.mockReturnValue({ status: 'authenticated', viewer: { person: { id: 'viewer' } } } as never)
    mockCount.mockRejectedValue(new Error('rls denied'))
    const { result } = renderHook(() => useMyOpenTaskCount())
    expect(result.current).toBeNull()
    await waitFor(() => expect(mockCount).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('does not fetch when the viewer is not authenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    const { result } = renderHook(() => useMyOpenTaskCount())
    expect(result.current).toBeNull()
    expect(mockCount).not.toHaveBeenCalled()
  })
})
