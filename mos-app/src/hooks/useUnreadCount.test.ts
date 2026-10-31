// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
vi.mock('@/auth/use-auth')
import { useAuth } from '@/auth/use-auth'
import { publishReadScope } from '@/lib/scoped-reads'
import { useUnreadCount } from './useUnreadCount'
import { refreshUnreadCount } from './unread-count-store'

const mockCount = vi.fn()
const mockUseAuth = vi.mocked(useAuth)
vi.mock('@/lib/db/notifications', () => ({
  countUnread: () => mockCount(),
}))

let scopeGeneration = 0
let completeReadScope = {
  generation: 0,
  authUserId: 'auth-user',
  viewerId: 'viewer',
  orgId: 'org',
  authorityKey: 'member',
}

beforeEach(() => {
  completeReadScope = {
    ...completeReadScope,
    generation: ++scopeGeneration,
  }
  publishReadScope(completeReadScope)
  mockCount.mockReset()
  mockUseAuth.mockReset()
  mockUseAuth.mockReturnValue({
    status: 'authenticated',
    readScope: completeReadScope,
    viewer: { person: { id: 'viewer' } },
  } as never)
})

afterEach(() => {
  publishReadScope(null)
})

describe('useUnreadCount (CQ#2 — Inbox badge path)', () => {
  it('loads the unread count via the dedicated unread-only read', async () => {
    mockCount.mockResolvedValue(5)
    const { result } = renderHook(() => useUnreadCount())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unreadCount).toBe(5)
  })

  it('refreshes an unscoped count when a previously mounted badge remounts', async () => {
    publishReadScope(null)
    mockUseAuth.mockReturnValue({ status: 'loading' } as never)
    mockCount.mockResolvedValueOnce(4).mockResolvedValueOnce(2)

    const first = renderHook(() => useUnreadCount())
    await waitFor(() => expect(first.result.current.unreadCount).toBe(4))
    first.unmount()

    const second = renderHook(() => useUnreadCount())
    await waitFor(() => expect(second.result.current.unreadCount).toBe(2))
    expect(mockCount).toHaveBeenCalledTimes(2)
    second.unmount()
  })

  it('shares one deferred cold count read across two mounted Inbox badges', async () => {
    let resolveRead!: (count: number) => void
    const coldRead = new Promise<number>((resolve) => {
      resolveRead = resolve
    })
    mockCount.mockReturnValue(coldRead)

    const firstBadge = renderHook(() => useUnreadCount())
    const secondBadge = renderHook(() => useUnreadCount())

    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(1), { timeout: 500 })

    await act(async () => {
      resolveRead(6)
      await coldRead
    })

    await waitFor(() => {
      expect(firstBadge.result.current.unreadCount).toBe(6)
      expect(secondBadge.result.current.unreadCount).toBe(6)
    })

    firstBadge.unmount()
    secondBadge.unmount()
  })

  it('retires an old count read when the authenticated read scope changes', async () => {
    let resolveOldRead!: (count: number) => void
    let resolveCurrentRead!: (count: number) => void
    const oldRead = new Promise<number>((resolve) => {
      resolveOldRead = resolve
    })
    const currentRead = new Promise<number>((resolve) => {
      resolveCurrentRead = resolve
    })
    const oldReadDrained = oldRead.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
    mockCount.mockReturnValueOnce(oldRead).mockReturnValueOnce(currentRead)

    const hook = renderHook(() => useUnreadCount())
    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(1))

    const nextScope = { ...completeReadScope, generation: ++scopeGeneration }
    publishReadScope(nextScope)
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      readScope: nextScope,
      viewer: { person: { id: 'viewer' } },
    } as never)
    hook.rerender()
    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(2))

    await act(async () => {
      resolveCurrentRead(8)
      await currentRead
    })
    await waitFor(() => expect(hook.result.current.unreadCount).toBe(8))

    await act(async () => {
      resolveOldRead(2)
      await oldReadDrained
    })
    expect(hook.result.current.unreadCount).toBe(8)
    hook.unmount()
  })

  it('runs one refresh per unread change and keeps the newest pending result', async () => {
    let resolveFirstRefresh!: (count: number) => void
    let resolveSecondRefresh!: (count: number) => void
    const firstRefresh = new Promise<number>((resolve) => {
      resolveFirstRefresh = resolve
    })
    const secondRefresh = new Promise<number>((resolve) => {
      resolveSecondRefresh = resolve
    })
    mockCount
      .mockResolvedValueOnce(5)
      .mockReturnValueOnce(firstRefresh)
      .mockReturnValueOnce(secondRefresh)

    const firstBadge = renderHook(() => useUnreadCount())
    const secondBadge = renderHook(() => useUnreadCount())
    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(1), { timeout: 500 })
    await waitFor(() => {
      expect(firstBadge.result.current.unreadCount).toBe(5)
      expect(secondBadge.result.current.unreadCount).toBe(5)
    })

    act(() => { void refreshUnreadCount() })
    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(2), { timeout: 500 })
    act(() => { void refreshUnreadCount() })
    await waitFor(() => expect(mockCount).toHaveBeenCalledTimes(3), { timeout: 500 })

    await act(async () => {
      resolveSecondRefresh(7)
      await secondRefresh
    })
    await waitFor(() => {
      expect(firstBadge.result.current.unreadCount).toBe(7)
      expect(secondBadge.result.current.unreadCount).toBe(7)
    })

    await act(async () => {
      resolveFirstRefresh(6)
      await firstRefresh
    })
    expect(firstBadge.result.current.unreadCount).toBe(7)
    expect(secondBadge.result.current.unreadCount).toBe(7)
    firstBadge.unmount()
    secondBadge.unmount()
  })

  it('keeps the last known count when the read fails (the bell is decorative)', async () => {
    mockCount.mockResolvedValueOnce(2)
    mockCount.mockRejectedValueOnce(new Error('rls'))
    const { result } = renderHook(() => useUnreadCount())
    await waitFor(() => expect(result.current.unreadCount).toBe(2))

    await act(async () => result.current.refresh())

    // Transient failure leaves the last good value in place; no throw to the UI.
    expect(result.current.unreadCount).toBe(2)
  })

  it('refresh() re-reads and updates the count', async () => {
    mockCount.mockResolvedValue(3)
    const { result } = renderHook(() => useUnreadCount())
    await waitFor(() => expect(result.current.unreadCount).toBe(3))

    mockCount.mockResolvedValue(7)
    await act(async () => result.current.refresh())
    await waitFor(() => expect(result.current.unreadCount).toBe(7))
  })

  it('re-fetches when another mounted consumer changes unread state, without a reload', async () => {
    mockCount.mockResolvedValue(4)
    const { result } = renderHook(() => useUnreadCount())
    await waitFor(() => expect(result.current.unreadCount).toBe(4))

    // Simulate another mounted consumer updating a notification and refreshing the shared count.
    mockCount.mockResolvedValue(3)
    act(() => {
      void refreshUnreadCount()
    })

    await waitFor(() => expect(result.current.unreadCount).toBe(3))
  })
})
