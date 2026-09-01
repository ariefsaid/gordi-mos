import type { NotificationRow } from '@/lib/db/notifications'

/**
 * read-handled-semantics — the RATIFIED read/handled model for Inbox triage (OD-WAY-88; issue 549).
 *
 * The rules encoded here:
 *  - `read_at`  = this person has seen/opened the notification.
 *  - `handled_at` = this person explicitly triaged it out of their active Inbox queue.
 *  - Opening marks READ only (never handled). Explicit "Mark handled" may ALSO mark read.
 *  - read-but-unhandled is a valid, representable state.
 *  - Handled is private notification state only; it is NEVER Task completion, Signal
 *    acknowledgement, approval, or ownership.
 *
 * `mos.notifications.handled_at` exists in the baseline chain (20260805000005: nullable column,
 * unhandled partial index, column-pin trigger; owner-scoped UPDATE policy in 20260805000006) —
 * the Handled view is live.
 */

/** A notification row with the private `handled_at` field (OD-WAY-88). */
export type TriageNotificationRow = NotificationRow & {
  /** Set when the person explicitly triaged this out of their queue. */
  handled_at?: string | null
}

export type InboxFilter = 'all' | 'unread' | 'handled'

/** The exactly-three Inbox triage filters. */
export const INBOX_FILTERS = ['all', 'unread', 'handled'] as const

export function isUnread(row: TriageNotificationRow): boolean {
  return row.read_at == null
}

export function isHandled(row: TriageNotificationRow): boolean {
  return row.handled_at != null
}

/** The distinct read-but-unhandled state: seen, but still in the active queue. */
export function isReadButUnhandled(row: TriageNotificationRow): boolean {
  return row.read_at != null && row.handled_at == null
}

/** Whether a row belongs in a given filter view. Mirrors the persisted Issue 6 view semantics. */
export function matchesFilter(row: TriageNotificationRow, filter: InboxFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'unread':
      return row.read_at == null
    case 'handled':
      return row.handled_at != null
  }
}

/**
 * Opening a notification marks it READ only — never handled, and never re-stamped once read.
 * Returns a new row; opening an already-read row is a no-op on both timestamps.
 */
export function applyOpen(row: TriageNotificationRow, nowIso: string): TriageNotificationRow {
  if (row.read_at != null) return row
  return { ...row, read_at: nowIso }
}

/**
 * Explicit "Mark handled": sets `handled_at`, and may also mark read (if not already). It NEVER
 * touches Task/Signal domain state — this is private notification triage only.
 */
export function applyMarkHandled(row: TriageNotificationRow, nowIso: string): TriageNotificationRow {
  return {
    ...row,
    read_at: row.read_at ?? nowIso,
    handled_at: nowIso,
  }
}
