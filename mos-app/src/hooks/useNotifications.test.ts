import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotifications } from './useNotifications'
import type { NotificationRow } from '@/lib/db/notifications'

const mockList = vi.fn()
const mockMark = vi.fn()
const mockHandle = vi.fn()
vi.mock('@/lib/db/notifications', () => ({
  listNotifications: () => mockList(),
  markNotificationRead: (id: string, at: string) => mockMark(id, at),
  markNotificationHandled: (id: string, at: string, readAt: string | null) => mockHandle(id, at, readAt),
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
})

describe('useNotifications (AC-P3-IB-002/003)', () => {
  it('AC-P3-IB-002: loads notifications, unread-first then newest, and derives the unread count', async () => {
    mockList.mockResolvedValue([
      row('a', true, '2026-07-01T00:00:00Z'), // read, oldest
      row('b', false, '2026-07-02T00:00:00Z'), // unread
      row('c', false, '2026-07-03T00:00:00Z'), // unread, newest
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
