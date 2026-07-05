import { useCallback, useEffect, useState } from 'react'
import { countUnread } from '@/lib/db/notifications'

export interface UseUnreadCount {
  unreadCount: number
  loading: boolean
  refresh: () => Promise<void>
}

/**
 * useUnreadCount — the Inbox badge hook (CQ#2). Backs the bell with a dedicated unread-only read
 * (countUnread → mos_notifications_owner_unread_idx) instead of pulling the whole Inbox list, so the
 * badge cost is O(unread) regardless of how many notifications accumulate over time. The Inbox page
 * uses useNotifications for the row list; this hook is the cheap path for the always-rendered bell.
 */
export function useUnreadCount(): UseUnreadCount {
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setUnreadCount(await countUnread())
    } catch {
      // Swallow — the bell is decorative; a transient read failure just leaves the last known count.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { unreadCount, loading, refresh }
}
