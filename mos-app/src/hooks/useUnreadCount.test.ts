import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useUnreadCount } from './useUnreadCount'

const mockCount = vi.fn()
vi.mock('@/lib/db/notifications', () => ({
  countUnread: () => mockCount(),
}))

beforeEach(() => {
  mockCount.mockReset()
})

describe('useUnreadCount (CQ#2 — Inbox badge path)', () => {
  it('loads the unread count via the dedicated unread-only read', async () => {
    mockCount.mockResolvedValue(5)
    const { result } = renderHook(() => useUnreadCount())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unreadCount).toBe(5)
  })

  it('keeps the last known count when the read fails (the bell is decorative)', async () => {
    mockCount.mockResolvedValueOnce(2)
    mockCount.mockRejectedValueOnce(new Error('rls'))
    const { result } = renderHook(() => useUnreadCount())
    await waitFor(() => expect(result.current.unreadCount).toBe(2))

    await result.current.refresh()

    // Transient failure leaves the last good value in place; no throw to the UI.
    expect(result.current.unreadCount).toBe(2)
  })

  it('refresh() re-reads and updates the count', async () => {
    mockCount.mockResolvedValue(3)
    const { result } = renderHook(() => useUnreadCount())
    await waitFor(() => expect(result.current.unreadCount).toBe(3))

    mockCount.mockResolvedValue(7)
    await result.current.refresh()
    await waitFor(() => expect(result.current.unreadCount).toBe(7))
  })
})
