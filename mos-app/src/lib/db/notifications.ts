import { supabase } from '@/lib/supabase'
import { APP_RELEASE_PROFILE } from '@/config/app-build-settings'
import { notificationAvailableInProfile } from '@/config/notification-profile'

// Data layer for mos.notifications (Inbox destination — ADR-0044 §5 / ADR-0019 D9). Reads/writes via
// supabase.schema('mos') on the existing caller-JWT client; RLS is the authority (owner-private,
// org-scoped) — this layer NEVER sends org_id/owner_id. The only permitted writes are marking read
// and marking handled (OD-WAY-88, the viewer-personal triage stamp); the column-pin trigger keeps
// the delivered content itself immutable server-side.

const mos = () => supabase.schema('mos')

export type NotificationSeverity = 'info' | 'warning' | 'critical'

/** A deep-link into the owning surface, carried in metadata. */
export interface NotificationEntity {
  type: string
  id: string
  route: string
}

export interface NotificationRow {
  id: string
  severity: NotificationSeverity
  title: string
  body: string | null
  metadata: { entity?: NotificationEntity } | Record<string, unknown>
  read_at: string | null
  /** Set when this viewer explicitly triaged the row out of their queue (OD-WAY-88); null = active. */
  handled_at?: string | null
  created_at: string
}

const COLUMNS = 'id, severity, title, body, metadata, read_at, handled_at, created_at'

const INBOX_PAGE_LIMIT = 200

export type NotificationCursor = Pick<NotificationRow, 'created_at' | 'id'>
export interface NotificationPage {
  rows: NotificationRow[]
  hasMore: boolean
  nextCursor: NotificationCursor | null
}

/** The viewer's notifications, newest first (RLS scopes to the owner). */
export async function listNotifications(before?: NotificationCursor): Promise<NotificationPage> {
  let query = mos()
    .from('notifications')
    .select(COLUMNS)
  if (before) {
    query = query.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`)
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(INBOX_PAGE_LIMIT + 1)
  if (error) throw new Error(`listNotifications failed: ${error.message}`)
  const fetched = (data ?? []) as NotificationRow[]
  const rows = fetched.slice(0, INBOX_PAGE_LIMIT)
  const hasMore = fetched.length > INBOX_PAGE_LIMIT
  const last = rows.at(-1)
  return {
    rows,
    hasMore,
    nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null,
  }
}

/**
 * The viewer's unread count for the Inbox badge. A dedicated read (rather than counting client-side
 * over listNotifications) so the badge cost is O(unread) backed by mos_notifications_owner_unread_idx,
 * not O(all-time inbox size) — and so it stays correct when the Inbox page caps/truncates.
 */
export async function countUnread(): Promise<number> {
  const notifications = mos().from('notifications')
  if (APP_RELEASE_PROFILE === 'cafe') {
    // Cafe visibility (route/feature allowlists) is a client-side predicate over metadata with no
    // server-side equivalent, so this profile keeps the bounded row read.
    const { data, error } = await notifications.select('id, metadata').is('read_at', null)
    if (error) throw new Error(`countUnread failed: ${error.message}`)
    return (data ?? []).filter((row) => notificationAvailableInProfile(row, 'cafe')).length
  }
  // Full profile: the badge is a HEAD exact count — no rows over the wire (#1359), backed by
  // mos_notifications_owner_unread_idx, mirroring getMyOpenTaskCount.
  const { count, error } = await notifications.select('id', { count: 'exact', head: true }).is('read_at', null)
  if (error) throw new Error(`countUnread failed: ${error.message}`)
  return count ?? 0
}

/** Mark one notification read. Only `read_at` may change (server trigger enforces it). */
export async function markNotificationRead(id: string, readAtIso: string): Promise<void> {
  const { error } = await mos().from('notifications').update({ read_at: readAtIso }).eq('id', id)
  if (error) throw new Error(`markNotificationRead failed: ${error.message}`)
}

/**
 * Mark one notification handled — the viewer's PRIVATE triage stamp (OD-WAY-88): never Task/Signal
 * domain state. Mirrors applyMarkHandled: an unread row is marked read in the same write. Only
 * read_at/handled_at may change (server column-pin trigger enforces it). `readAtIso` is the read
 * stamp to co-write when the row was unread; null = already read, leave untouched.
 */
export async function markNotificationHandled(
  id: string,
  handledAtIso: string,
  readAtIso: string | null,
): Promise<void> {
  const patch: { handled_at: string; read_at?: string } = { handled_at: handledAtIso }
  if (readAtIso != null) patch.read_at = readAtIso
  const { error } = await mos().from('notifications').update(patch).eq('id', id)
  if (error) throw new Error(`markNotificationHandled failed: ${error.message}`)
}
