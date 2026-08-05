import { useEffect, useState } from 'react'
import { useSearchParamState } from '@/lib/use-search-param-state'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { useAuth } from '@/auth/use-auth'
import { supabase } from '@/lib/supabase'
import { useNotifications } from '@/hooks/useNotifications'
import { useOptionalOverlayHost } from '@/shell/overlay-host'
import type { OverlayOwner } from '@/shell/overlay-navigation'
import type { OverlayEntry } from '@/shell/overlay-host'
import { InboxTriage, type InboxTriageState } from './inbox-triage'
import { matchesFilter, type InboxFilter, type TriageNotificationRow } from './read-handled-semantics'
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
 * Handled stays withheld (`handledFilterAvailable={false}`) until the owner-gated migration/RLS/
 * pgTAP prerequisite lands — opening marks read, never handled (read-handled-semantics.ts).
 */
export function InboxTriageConnected({ mode, owner = mode === 'page' ? 'inbox' : 'shell' }: {
  mode: 'page' | 'quick'
  owner?: OverlayOwner
}) {
  const t = useT()
  const { notifications, loading, error, refresh, markRead } = useNotifications()
  const host = useOptionalOverlayHost()
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []
  // The All/Unread filter is URL-synced on the /inbox PAGE (I7 / D-E1) so a refreshed/shared link
  // reproduces the same view. The bell's ephemeral quick-triage keeps a LOCAL filter — it must not
  // stamp ?filter= onto whatever host page the bell was opened over. (Handled stays withheld.)
  const [filterParam, setFilterParam] = useSearchParamState('filter', 'all')
  const [localFilter, setLocalFilter] = useState<InboxFilter>('all')
  const filter: InboxFilter = mode === 'page' ? (filterParam === 'unread' ? 'unread' : 'all') : localFilter
  const setFilter = (next: InboxFilter) => {
    if (mode === 'page') setFilterParam(next)
    else setLocalFilter(next)
  }
  const [unavailableKey, setUnavailableKey] = useState<string | null>(null)

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
    setUnavailableKey(null)
    const resolution = resolveNotificationTarget(row, buildInboxTargetDeps(row, accessRoles, owner))
    // Opening marks READ only (never handled) — the queue truth updates even when the target
    // cannot be shown, because the person has now seen the notification.
    void markRead(row.id)
    if (resolution.status !== 'available') {
      setUnavailableKey(resolution.messageKey)
      return
    }
    if (!host) return
    const entry: OverlayEntry = resolution.entry
    // Active session (quick triage) → push so Back returns to the queue; otherwise open a root
    // over the underlying page in ROUTE mode (D-A3, fix work-order item 5): route mode pushes a real
    // `__mosOverlay` history marker, so browser Back closes the panel and returns to Inbox. An
    // ephemeral root pushed no history entry, so Back ejected the user OUT of Inbox — the dead-end
    // I2 + OD-REDESIGN-20 ("Back returns to Inbox") forbid.
    if (host.session) void host.push(entry)
    else void host.openRoot(entry, 'route')
  }

  return (
    <>
      <InboxTriage
        mode={mode}
        state={state}
        rows={rows}
        filter={filter}
        hiddenCount={hiddenCount}
        handledFilterAvailable={false}
        onFilterChange={setFilter}
        onOpen={onOpen}
        onQuickMarkRead={(row) => void markRead(row.id)}
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
