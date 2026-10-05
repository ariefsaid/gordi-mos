import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

vi.mock('@/auth/use-auth')
vi.mock('@/lib/db/open-task-count', () => ({ getMyOpenTaskCount: vi.fn() }))

import { useAuth } from '@/auth/use-auth'
import { getMyOpenTaskCount } from '@/lib/db/open-task-count'
import { useMyOpenTaskCount } from './useMyOpenTaskCount'
import { __resetOpenTaskCountForTests } from '@/lib/open-task-count-store'
import { publishReadScope } from '@/lib/scoped-reads'

const mockUseAuth = vi.mocked(useAuth)
const mockCount = vi.mocked(getMyOpenTaskCount)

beforeEach(() => {
  vi.clearAllMocks()
  __resetOpenTaskCountForTests()
})

afterEach(() => {
  publishReadScope(null)
})

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

  it('shares one deferred cold read across two mounted open-task badges for the same viewer', async () => {
    const readScope = {
      generation: 1,
      authUserId: 'auth-user',
      viewerId: 'viewer',
      orgId: 'org',
      authorityKey: 'member',
    }
    publishReadScope(readScope)
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      readScope,
      viewer: { person: { id: 'viewer' } },
    } as never)

    let resolveRead!: (count: number) => void
    const coldRead = new Promise<number>((resolve) => {
      resolveRead = resolve
    })
    mockCount.mockReturnValue(coldRead)

    const firstBadge = renderHook(() => useMyOpenTaskCount())
    const secondBadge = renderHook(() => useMyOpenTaskCount())

    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(1), { timeout: 500 })

    await act(async () => {
      resolveRead(4)
      await coldRead
    })

    await waitFor(() => {
      expect(firstBadge.result.current).toBe(4)
      expect(secondBadge.result.current).toBe(4)
    })

    firstBadge.unmount()
    secondBadge.unmount()
  })

  it('does not show an old pending count after the viewer scope changes', async () => {
    const previousScope = {
      generation: 11,
      authUserId: 'auth-user',
      viewerId: 'viewer',
      orgId: 'org',
      authorityKey: 'member',
    }
    const currentScope = { ...previousScope, generation: 12 }
    publishReadScope(previousScope)
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      readScope: previousScope,
      viewer: { person: { id: 'viewer' } },
    } as never)

    let resolveOldRead!: (count: number) => void
    let resolveCurrentRead!: (count: number) => void
    const oldRead = new Promise<number>((resolve) => {
      resolveOldRead = resolve
    })
    const currentRead = new Promise<number>((resolve) => {
      resolveCurrentRead = resolve
    })
    mockCount.mockReturnValueOnce(oldRead).mockReturnValueOnce(currentRead)

    const hook = renderHook(() => useMyOpenTaskCount())
    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(1))

    publishReadScope(currentScope)
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      readScope: currentScope,
      viewer: { person: { id: 'viewer' } },
    } as never)
    hook.rerender()
    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveCurrentRead(5)
      await currentRead
    })
    await waitFor(() => expect(hook.result.current).toBe(5))

    await act(async () => {
      resolveOldRead(3)
      await oldRead
    })
    expect(hook.result.current).toBe(5)
    hook.unmount()
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
