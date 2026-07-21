import { useState } from 'react'
import { useT } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'
import { useNotifications } from '@/hooks/useNotifications'
import { useOptionalOverlayHost } from '@/shell/overlay-host'
import type { OverlayEntry } from '@/shell/overlay-host'
import { InboxTriage, type InboxTriageState } from './inbox-triage'
import { matchesFilter, type InboxFilter, type TriageNotificationRow } from './read-handled-semantics'
import { resolveNotificationTarget } from './inbox-target'
import { buildInboxTargetDeps } from './inbox-record-door'

/**
 * InboxTriageConnected — the ONE wiring that turns the chrome-free InboxTriage surface into a live
 * triage queue. It is used by BOTH doors so page and bell open records identically (Issue 7):
 *   - `/inbox` full page (`mode="page"`), and
 *   - the bell's ephemeral quick-triage root inside the shared overlay host (`mode="quick"`).
 *
 * It owns: the notification data (via useNotifications), the All/Unread filter, and the open
 * grammar. Opening a row resolves a SAFE typed target (inbox-target.ts) and, when available, marks
 * it read (only) and opens the canonical record IN CONTEXT through the shared host:
 *   - from the page (no active session) it opens a record root over the page;
 *   - from quick triage (an active session) it PUSHES the record so internal Back returns to the
 *     exact triage queue.
 * An unavailable/denied/malformed target never opens a record; it surfaces honest, localized copy.
 *
 * Handled stays withheld (`handledFilterAvailable={false}`) until the owner-gated migration/RLS/
 * pgTAP prerequisite lands — opening marks read, never handled (read-handled-semantics.ts).
 */
export function InboxTriageConnected({ mode }: { mode: 'page' | 'quick' }) {
  const t = useT()
  const { notifications, loading, error, refresh, markRead } = useNotifications()
  const host = useOptionalOverlayHost()
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [unavailableKey, setUnavailableKey] = useState<string | null>(null)

  const rows = notifications.filter((n) => matchesFilter(n, filter))

  const state: InboxTriageState = loading
    ? 'loading'
    : error
      ? 'error'
      : rows.length === 0
        ? 'empty'
        : 'ready'

  const onOpen = (row: TriageNotificationRow) => {
    setUnavailableKey(null)
    const resolution = resolveNotificationTarget(row, buildInboxTargetDeps(row))
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
    // over the underlying page.
    if (host.session) void host.push(entry)
    else void host.openRoot(entry, 'ephemeral')
  }

  return (
    <>
      <InboxTriage
        mode={mode}
        state={state}
        rows={rows}
        filter={filter}
        handledFilterAvailable={false}
        onFilterChange={setFilter}
        onOpen={onOpen}
        onRetry={() => void refresh()}
      />
      {unavailableKey ? (
        <p className="inbox-triage__unavailable" role="status" aria-live="polite">
          {t(unavailableKey as MessageKey)}
        </p>
      ) : null}
    </>
  )
}
