import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  listNotifications,
  markNotificationRead,
  markNotificationHandled,
  type NotificationRow,
} from '@/lib/db/notifications'
import { applyMarkHandled } from '@/components/inbox/read-handled-semantics'
import { compareTriage } from '@/components/inbox/nudge-semantics'
import { announceUnreadCountChanged } from './unread-count-bus'

export interface UseNotifications {
  notifications: NotificationRow[]
  unreadCount: number
  loading: boolean
  error: string | null
  markRead: (id: string) => Promise<void>
  /** Explicit "Mark handled" (OD-WAY-88): optimistic, reverts on failure; co-stamps read on an unread row. */
  markHandled: (id: string) => Promise<void>
  refresh: () => Promise<void>
}

/**
 * useNotifications — the Inbox data hook (ADR-0019 D9). Loads the viewer's notifications (RLS-scoped,
 * newest first), derives the unread badge count, and marks rows read optimistically (revert on error).
 * Unread rows sort first so the triage list surfaces what needs attention. Aged untriaged rows
 * (OD-WAY-86) re-surface above younger unread rows via `compareTriage` — pure day-bucketed
 * presentation, no stored nudge state.
 */
export function useNotifications(): UseNotifications {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const rows = await listNotifications()
      // Raw newest-first load; ORDERING is derived below (compareTriage on every render) so an
      // optimistic markRead/markHandled reshuffles the queue for the current row state, not once here.
      setNotifications(rows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const markRead = useCallback(
    async (id: string) => {
      const target = notifications.find((n) => n.id === id)
      if (!target || target.read_at != null) return
      const readAt = new Date().toISOString()
      // Optimistic: flip read_at locally so the badge + row update immediately.
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: readAt } : n)))
      announceUnreadCountChanged() // #582: tell the bell/rail/tab badges to re-fetch, not just this row list
      try {
        await markNotificationRead(id, readAt)
      } catch {
        // Revert on failure — the badge must not lie about unread state.
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: null } : n)))
        announceUnreadCountChanged()
      }
    },
    [notifications],
  )

  const markHandled = useCallback(
    async (id: string) => {
      const target = notifications.find((n) => n.id === id)
      if (!target || target.handled_at != null) return
      const now = new Date().toISOString()
      const before = target
      // Optimistic: applyMarkHandled is the ratified semantics (read co-stamp for unread rows).
      setNotifications((prev) => prev.map((n) => (n.id === id ? applyMarkHandled(n, now) : n)))
      // #582: handled co-stamps read on an unread row, so this can change the unread total too.
      announceUnreadCountChanged()
      try {
        await markNotificationHandled(id, now, before.read_at == null ? now : null)
      } catch {
        // Revert on failure — the queue must not lie about handled state.
        setNotifications((prev) => prev.map((n) => (n.id === id ? before : n)))
        announceUnreadCountChanged()
      }
    },
    [notifications],
  )

  const unreadCount = notifications.reduce((n, row) => n + (row.read_at == null ? 1 : 0), 0)

  // Project the triage order HERE, from the CURRENT row state, each render — never at fetch. After
  // markRead/markHandled flips a row's read/handled stamps, the next render re-sorts so a
  // just-read/handled row never lingers above unread rows until a refetch (OD-WAY-86 #141).
  const ordered = useMemo(
    () => [...notifications].sort((a, b) => compareTriage(a, b, new Date())),
    [notifications],
  )

  return { notifications: ordered, unreadCount, loading, error, markRead, markHandled, refresh }
}
