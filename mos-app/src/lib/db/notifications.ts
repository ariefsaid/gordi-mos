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

/** The viewer's notifications, newest first (RLS scopes to the owner). */
export async function listNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await mos()
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listNotifications failed: ${error.message}`)
  return (data ?? []) as NotificationRow[]
}

/** Mark one notification read. Only `read_at` may change (server trigger enforces it). */
export async function markNotificationRead(id: string, readAtIso: string): Promise<void> {
  const { error } = await mos().from('notifications').update({ read_at: readAtIso }).eq('id', id)
  if (error) throw new Error(`markNotificationRead failed: ${error.message}`)
}

/** The deep-link route for a notification, if it carries one. */
export function notificationRoute(row: NotificationRow): string | null {
  const entity = (row.metadata as { entity?: NotificationEntity })?.entity
  return entity?.route ?? null
}
