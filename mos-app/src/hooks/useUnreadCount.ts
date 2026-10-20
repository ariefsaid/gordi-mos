import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '@/auth/use-auth'
import {
  getUnreadCountSnapshot,
  refreshUnreadCount,
  subscribeUnreadCount,
  watchUnreadCount,
} from './unread-count-store'

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
  const auth = useAuth()
  const readScope = auth.status === 'authenticated' ? auth.readScope ?? null : null
  const subscribe = useCallback(
    (listener: () => void) => subscribeUnreadCount(readScope, listener),
    [readScope],
  )
  const getSnapshot = useCallback(() => getUnreadCountSnapshot(readScope), [readScope])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const refresh = useCallback(() => refreshUnreadCount(readScope), [readScope])

  useEffect(() => {
    void watchUnreadCount(readScope)
  }, [readScope])

  return { ...snapshot, refresh }
}
