import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotifications } from './useNotifications'
import { announceUnreadCountChanged } from './unread-count-bus'
import type { NotificationRow } from '@/lib/db/notifications'

const mockList = vi.fn()
const mockMark = vi.fn()
const mockHandle = vi.fn()
vi.mock('@/lib/db/notifications', () => ({
  listNotifications: () => mockList(),
  markNotificationRead: (id: string, at: string) => mockMark(id, at),
  markNotificationHandled: (id: string, at: string, readAt: string | null) => mockHandle(id, at, readAt),
}))

vi.mock('./unread-count-bus', () => ({
  announceUnreadCountChanged: vi.fn(),
}))

function row(id: string, read: boolean, created: string): NotificationRow {
  return {
    id,
    severity: 'info',
    title: `n-${id}`,
    body: null,
    metadata: {},
    read_at: read ? '2026-07-05T00:00:00Z' : null,
    handled_at: null,
    created_at: created,
  }
}

beforeEach(() => {
  mockList.mockReset()
  mockMark.mockReset()
  mockHandle.mockReset()
  vi.mocked(announceUnreadCountChanged).mockReset()
})

describe('useNotifications (AC-P3-IB-002/003)', () => {
  it('AC-P3-IB-002: loads notifications, unread-first then newest, and derives the unread count', async () => {
    const now = Date.now()
    const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString()
    mockList.mockResolvedValue([
      row('a', true, iso(3)), // read, oldest
      row('b', false, iso(2)), // unread
      row('c', false, iso(1)), // unread, newest
    ])
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Unread first (c newest, then b), read last (a).
    expect(result.current.notifications.map((n) => n.id)).toEqual(['c', 'b', 'a'])
    expect(result.current.unreadCount).toBe(2)
  })

  it('AC-P3-IB-003: markRead optimistically clears unread + persists', async () => {
    mockList.mockResolvedValue([row('b', false, '2026-07-02T00:00:00Z')])
    mockMark.mockResolvedValue(undefined)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.unreadCount).toBe(1))

    await act(async () => {
      await result.current.markRead('b')
    })

    expect(result.current.unreadCount).toBe(0)
    expect(result.current.notifications[0].read_at).not.toBeNull()
    expect(mockMark).toHaveBeenCalledWith('b', expect.any(String))
  })

  it('AC-P3-IB-003: a failed markRead reverts the optimistic flip (badge must not lie)', async () => {
    mockList.mockResolvedValue([row('b', false, '2026-07-02T00:00:00Z')])
    mockMark.mockRejectedValue(new Error('rls'))
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.unreadCount).toBe(1))

    await act(async () => {
      await result.current.markRead('b')
    })

    expect(result.current.unreadCount).toBe(1) // reverted
    expect(result.current.notifications[0].read_at).toBeNull()
  })

  it('surfaces a load error without throwing', async () => {
    mockList.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.notifications).toEqual([])
  })

  it('issue #582 fix: markRead announces the unread-count refresh only after the write resolves', async () => {
    mockList.mockResolvedValue([row('b', false, '2026-07-02T00:00:00Z')])
    const order: string[] = []
    let resolveWrite!: () => void
    mockMark.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = () => {
            order.push('write resolved')
            resolve()
          }
        }),
    )
    vi.mocked(announceUnreadCountChanged).mockImplementation(() => order.push('announced'))

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let markReadPromise!: Promise<void>
    act(() => {
      markReadPromise = result.current.markRead('b')
    })

    // The write is still in flight — no announce yet. An announce here is exactly the bug: a
    // subscriber (useUnreadCount) would re-fetch and read the pre-write count (stale-high badge).
    expect(order).toEqual([])

    await act(async () => {
      resolveWrite()
      await markReadPromise
    })

    expect(order).toEqual(['write resolved', 'announced'])
  })

  it('issue #582 fix: markHandled announces the unread-count refresh only after the write resolves', async () => {
    mockList.mockResolvedValue([row('b', false, '2026-07-02T00:00:00Z')])
    const order: string[] = []
    let resolveWrite!: () => void
    mockHandle.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = () => {
            order.push('write resolved')
            resolve()
          }
        }),
    )
    vi.mocked(announceUnreadCountChanged).mockImplementation(() => order.push('announced'))

    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let markHandledPromise!: Promise<void>
    act(() => {
      markHandledPromise = result.current.markHandled('b')
    })

    expect(order).toEqual([])

    await act(async () => {
      resolveWrite()
      await markHandledPromise
    })

    expect(order).toEqual(['write resolved', 'announced'])
  })

  it('OD-WAY-88 (#549): markHandled optimistically stamps handled (+read for an unread row) and persists', async () => {
    mockList.mockResolvedValue([row('b', false, '2026-07-02T00:00:00Z')])
    mockHandle.mockResolvedValue(undefined)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.markHandled('b')
    })

    expect(result.current.notifications[0].handled_at).not.toBeNull()
    expect(result.current.notifications[0].read_at).not.toBeNull() // unread row co-stamped read
    expect(mockHandle).toHaveBeenCalledWith('b', expect.any(String), expect.any(String))
  })

  it('OD-WAY-88 (#549): a failed markHandled reverts (the queue must not lie about handled state)', async () => {
    mockList.mockResolvedValue([row('b', false, '2026-07-02T00:00:00Z')])
    mockHandle.mockRejectedValue(new Error('rls'))
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.markHandled('b')
    })

    expect(result.current.notifications[0].handled_at).toBeNull()
    expect(result.current.notifications[0].read_at).toBeNull()
  })

  it('OD-WAY-86 (#141) AC-141-1: an untriaged item older than 48h sorts above younger unread items', async () => {
    const now = Date.now()
    const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString()
    mockList.mockResolvedValue([
      row('young', false, iso(1)), // unread, 1h old
      row('aged', false, iso(75)), // untriaged, >48h — nudges
      row('oldread', true, iso(100)), // read — sinks below unread
    ])
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notifications.map((n) => n.id)).toEqual(['aged', 'young', 'oldread'])
  })

  it('OD-WAY-86 (#141) AC-141-3: a same-day re-render (optimistic markRead) does not reshuffle the nudged row', async () => {
    const now = Date.now()
    const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString()
    mockList.mockResolvedValue([row('young', false, iso(1)), row('aged', false, iso(75))])
    mockMark.mockResolvedValue(undefined)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.markRead('young')
    })
    // The optimistic flip updates the row in place; the nudged row keeps its position.
    expect(result.current.notifications.map((n) => n.id)).toEqual(['aged', 'young'])
    expect(result.current.notifications[1].read_at).not.toBeNull()
  })

  it('OD-WAY-86 (#141): a just-read row re-sorts below unread rows on the SAME render (no refetch)', async () => {
    const now = Date.now()
    const iso = (hoursAgo: number) => new Date(now - hoursAgo * 3_600_000).toISOString()
    mockList.mockResolvedValue([
      row('young', false, iso(1)), // unread, newest
      row('older', false, iso(2)), // unread
    ])
    mockMark.mockResolvedValue(undefined)
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    // Both unread → newest first.
    expect(result.current.notifications.map((n) => n.id)).toEqual(['young', 'older'])
    await act(async () => {
      await result.current.markRead('young')
    })
    // young is now read → it sinks below the still-unread older row immediately (ordering derives
    // from current row state, so no refetch is needed to fix the queue).
    expect(result.current.notifications.map((n) => n.id)).toEqual(['older', 'young'])
    expect(result.current.notifications[0].read_at).toBeNull()
    expect(result.current.notifications[1].read_at).not.toBeNull()
  })

  it('OD-WAY-88 (#549): markHandled on an already-handled row is a no-op', async () => {
    mockList.mockResolvedValue([{ ...row('b', true, '2026-07-02T00:00:00Z'), handled_at: '2026-07-20T03:00:00Z' }])
    const { result } = renderHook(() => useNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.markHandled('b')
    })

    expect(mockHandle).not.toHaveBeenCalled()
  })
})
