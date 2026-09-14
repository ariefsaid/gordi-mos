import { useEffect, useRef, useState } from 'react'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { useAuth } from '@/auth/use-auth'
import { supabase } from '@/lib/supabase'
import { useNotifications } from '@/hooks/useNotifications'
import { useOptionalOverlayHost } from '@/shell/overlay-host'
import type { OverlayOwner } from '@/shell/overlay-navigation'
import type { OverlayEntry } from '@/shell/overlay-host'
import { InboxTriage, type InboxPendingAction, type InboxTriageState } from './inbox-triage'
import { matchesFilter, isHandled, type InboxFilter, type TriageNotificationRow } from './read-handled-semantics'
import { resolveNotificationTarget } from './inbox-target'
import { buildInboxTargetDeps } from './inbox-record-door'
import { isSessionExpiredMessage } from './session-expired'

/**
 * InboxTriageConnected — the ONE wiring that turns the chrome-free InboxTriage surface into a live
 * triage queue. It is used by BOTH doors so page and bell open records identically (Issue 7):
 *   - `/inbox` full page (`mode="page"`), and
 *   - the bell's ephemeral quick-triage root inside the shared overlay host (`mode="quick"`).
 *
 * It owns: the notification data (via useNotifications), the All/Unread filter, and the open
 * grammar. Opening a row resolves a SAFE typed target (inbox-target.ts) and, when available, marks
 * it read (only) and opens the canonical record IN CONTEXT through the shared host:
 *   - from the page (no active session) it opens a record root in the Inbox collection split;
 *   - from quick triage (an active session) it PUSHES the record so internal Back returns to the
 *     exact triage queue.
 * An unavailable/denied/malformed target never opens a record; it surfaces honest, localized copy.
 *
 * Handled is live (OD-WAY-88 / #549): an explicit 'Mark handled' stamps the viewer's private
 * `handled_at` — opening still marks read only.
 */
export function InboxTriageConnected({ mode, owner = mode === 'page' ? 'inbox' : 'shell' }: {
  mode: 'page' | 'quick'
  owner?: OverlayOwner
}) {
  const t = useT()
  const { notifications, loading, error, refresh, markRead, markHandled } = useNotifications()
  const host = useOptionalOverlayHost()
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  // The All/Unread/Handled filter is URL-synced on the /inbox PAGE (I7 / D-E1) so a refreshed/shared link
  // reproduces the same view. The bell's ephemeral quick-triage keeps a LOCAL filter — it must not
  // stamp ?filter= onto whatever host page the bell was opened over.
  const [filterParam, setFilterParam] = useSearchParamState('filter', 'all')
  const [localFilter, setLocalFilter] = useState<InboxFilter>('all')
  // ?filter= round-trips all three ratified views (OD-WAY-88); anything else falls back to All.
  const pageFilter: InboxFilter = filterParam === 'unread' ? 'unread' : filterParam === 'handled' ? 'handled' : 'all'
  const filter: InboxFilter = mode === 'page' ? pageFilter : localFilter
  const setFilter = (next: InboxFilter) => {
    if (mode === 'page') setFilterParam(next)
    else setLocalFilter(next)
  }
  const [unavailableKey, setUnavailableKey] = useState<string | null>(null)
  // One row can be acted on through several affordances (open, keyboard-read, Mark handled).
  // Keep the guard here, at the connected boundary, so every door shares the same in-flight
  // semantics and a slow write cannot be double-submitted by a fast double-click. The action kind
  // also keeps the live status honest: a handled/read write is "Updating", not "Opening".
  const [pendingActions, setPendingActions] = useState<Record<string, InboxPendingAction>>({})
  const pendingRef = useRef<Record<string, InboxPendingAction>>({})

  const beginPending = (id: string, action: InboxPendingAction): boolean => {
    if (pendingRef.current[id] !== undefined) return false
    const next = { ...pendingRef.current, [id]: action }
    pendingRef.current = next
    setPendingActions(next)
    return true
  }

  const endPending = (id: string) => {
    const next = { ...pendingRef.current }
    delete next[id]
    pendingRef.current = next
    setPendingActions(next)
  }

  const runPending = async (id: string, kind: InboxPendingAction, action: () => Promise<void> | void) => {
    if (!beginPending(id, kind)) return
    try {
      await action()
    } finally {
      endPending(id)
    }
  }

  // H9 fix (design audit, 2026-07-27): the 401 dead-loop. An expired/invalid token surfaced the
  // SAME generic error as any other failure, with a "Try again" that re-fires the identical call
  // forever — it can never succeed once the token itself is dead. Detect the auth-shaped failure
  // and try ONE silent session refresh before ever showing the user anything; `authRetried` bounds
  // it to exactly one attempt (never re-armed), so this can't loop even if the refreshed session
  // still fails the same way.
  const isAuthError = isSessionExpiredMessage(error)
  const [authRetried, setAuthRetried] = useState(false)
  useEffect(() => {
    if (!isAuthError || authRetried) return
    let live = true
    setAuthRetried(true)
    void supabase.auth.refreshSession().then(({ data, error: refreshError }) => {
      if (live && !refreshError && data.session) void refresh()
    })
    return () => {
      live = false
    }
  }, [isAuthError, authRetried, refresh])

  const rows = notifications.filter((n) => matchesFilter(n, filter))
  // F13 (OD-91 #26): notifications the active (non-All) filter is hiding — the count behind the
  // filter-aware empty copy. On the All view this is 0 (nothing is hidden by a filter).
  const hiddenCount = filter === 'all' ? 0 : notifications.length - rows.length

  // AC-003 (#549): per-tab counts over the whole (loaded) queue, independent of the active filter.
  // Derived from the loaded rows (same array the hook's unreadCount is computed from) so the tabs
  // stay self-consistent and never range above what the filter can show.
  const counts = {
    all: notifications.length,
    unread: notifications.filter((n) => n.read_at == null).length,
    handled: notifications.filter(isHandled).length,
  }

  const state: InboxTriageState = loading || (isAuthError && !authRetried)
    ? 'loading' // masks the single silent refresh attempt above — never flashes the dead-retry error
    : isAuthError
      ? 'unauthorized'
      : error
        ? 'error'
        : rows.length === 0
          ? 'empty'
          : 'ready'

  const canSignOut = auth.status === 'authenticated' || auth.status === 'orphan'
  const onSignInAgain = canSignOut ? () => void auth.signOut() : undefined

  const onOpen = (row: TriageNotificationRow) => {
    void runPending(row.id, 'open', async () => {
      setUnavailableKey(null)
      const resolution = resolveNotificationTarget(row, buildInboxTargetDeps(row, accessRoles, owner))
      // Opening marks READ only (never handled) — the queue truth updates even when the target
      // cannot be shown, because the person has now seen the notification. Keep the promise in
      // the pending boundary so a slow read write cannot permit a duplicate action.
      const readPromise = Promise.resolve(markRead(row.id))
      if (resolution.status !== 'available') {
        setUnavailableKey(resolution.messageKey)
        await readPromise
        return
      }
      if (!host) {
        await readPromise
        return
      }
      const entry: OverlayEntry = resolution.entry
      // Active session (quick triage) → push so Back returns to the queue; otherwise open a root
      // over the underlying page in ROUTE mode (D-A3, fix work-order item 5): route mode pushes a real
      // `__mosOverlay` history marker, so browser Back closes the panel and returns to Inbox. An
      // ephemeral root pushed no history entry, so Back ejected the user OUT of Inbox — the dead-end
      // I2 + OD-REDESIGN-20 ("Back returns to Inbox") forbid.
      const openPromise = host.session ? host.push(entry) : host.openRoot(entry, 'route')
      await Promise.all([readPromise, Promise.resolve(openPromise)])
    }).catch(() => {
      // The data hook owns visible write errors; a host transition failure only needs to release
      // the row guard so the user can retry through the same action.
    })
  }

  return (
    <>
      <InboxTriage
        mode={mode}
        state={state}
        rows={rows}
        filter={filter}
        hiddenCount={hiddenCount}
        handledFilterAvailable
        counts={counts}
        onFilterChange={setFilter}
        onOpen={onOpen}
        onQuickMarkRead={(row) => {
          void runPending(row.id, 'read', () => markRead(row.id)).catch(() => {})
        }}
        onMarkHandled={(row) => {
          void runPending(row.id, 'handled', () => markHandled(row.id)).catch(() => {})
        }}
        pendingActions={pendingActions}
        onRetry={() => void refresh()}
        onSignInAgain={onSignInAgain}
      />
      {unavailableKey ? (
        <p className="inbox-triage__unavailable" role="status" aria-live="polite">
          {t(unavailableKey as MessageKey)}
        </p>
      ) : null}
    </>
  )
}
