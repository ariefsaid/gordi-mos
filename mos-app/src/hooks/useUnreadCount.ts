import { useCallback, useEffect, useRef, useState } from 'react'
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

  // The bell is mounted for the whole session in the app, but it is mounted and torn down
  // constantly in tests and in StrictMode's double-invoke — and `countUnread()` is a network read
  // that outlives a fast unmount. Without this guard the `finally` calls `setLoading` on a
  // component React has already discarded, which surfaces as an unhandled rejection AFTER the test
  // environment is gone ("window is not defined" from `resolveUpdatePriority`) and takes the whole
  // runner's exit code to 1 while every test still passes.
  //
  // Declared BEFORE the refresh effect on purpose: effects run in declaration order, so on a
  // StrictMode re-mount this flag is back to true before `refresh()` is fired again.
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!mounted.current) return
    setLoading(true)
    try {
      const count = await countUnread()
      if (mounted.current) setUnreadCount(count)
    } catch {
      // Swallow — the bell is decorative; a transient read failure just leaves the last known count.
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { unreadCount, loading, refresh }
}
