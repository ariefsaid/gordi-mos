import { supabase } from '@/lib/supabase'

// Data layer for mos.notifications (Inbox destination — ADR-0044 §5 / ADR-0019 D9). Reads/writes via
// supabase.schema('mos') on the existing caller-JWT client; RLS is the authority (owner-private,
// org-scoped) — this layer NEVER sends org_id/owner_id. The only permitted write is marking read
// (the mark-read-only column-pin trigger enforces content immutability server-side).

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
  created_at: string
}

const COLUMNS = 'id, severity, title, body, metadata, read_at, created_at'

// CQ#2: Inbox rows accumulate forever (every @mention + self-notify is a row). The Inbox page is
// owner-scoped via RLS but must not pull the full history on every render. The unread fast-path
// index (mos_notifications_owner_unread_idx) backs the badge read below.
const INBOX_PAGE_LIMIT = 200

/** The viewer's notifications, newest first (RLS scopes to the owner); bounded to INBOX_PAGE_LIMIT. */
export async function listNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await mos()
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(INBOX_PAGE_LIMIT)
  if (error) throw new Error(`listNotifications failed: ${error.message}`)
  return (data ?? []) as NotificationRow[]
}

/**
 * The viewer's unread count for the Inbox badge. A dedicated read (rather than counting client-side
 * over listNotifications) so the badge cost is O(unread) backed by mos_notifications_owner_unread_idx,
 * not O(all-time inbox size) — and so it stays correct when the Inbox page caps/truncates. Returns
 * the unread id rows (small) and counts them; avoids the head/count response shape that isn't used
 * anywhere else in the codebase.
 */
export async function countUnread(): Promise<number> {
  const { data, error } = await mos()
    .from('notifications')
    .select('id')
    .is('read_at', null)
  if (error) throw new Error(`countUnread failed: ${error.message}`)
  return (data ?? []).length
}

/** Mark one notification read. Only `read_at` may change (server trigger enforces it). */
export async function markNotificationRead(id: string, readAtIso: string): Promise<void> {
  const { error } = await mos().from('notifications').update({ read_at: readAtIso }).eq('id', id)
  if (error) throw new Error(`markNotificationRead failed: ${error.message}`)
}

/**
 * The deep-link route for a notification, if it carries a SAFE app-relative one. Defense-in-depth
 * (security review 2026-07-05, Low-2): metadata is producer-supplied; only an app-internal path
 * (single leading slash) is honoured — protocol (`javascript:`, `http:`) and protocol-relative
 * (`//host`) routes are rejected so a crafted notification can never navigate off-app or execute.
 */
export function notificationRoute(row: NotificationRow): string | null {
  const entity = (row.metadata as { entity?: NotificationEntity })?.entity
  const route = entity?.route
  if (typeof route !== 'string') return null
  if (!route.startsWith('/') || route.startsWith('//')) return null
  return route
}
