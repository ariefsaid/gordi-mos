import { supabase } from '@/lib/supabase'

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

/**
 * The actor whose action produced this delivery — stamped at delivery time (#771 AC-013), so a
 * later rename of a Person does not rewrite the Inbox rows they authored. Every non-legacy
 * notification carries one; legacy rows may not, so consumers treat it as optional.
 */
export interface NotificationActor {
  id: string
  name: string
}

/**
 * The five sources that drive the Inbox today (#771). Enumerated as a union so components can
 * exhaustively steer copy (icon, verb, pill) off `metadata.source` without a string switch that
 * silently misses a case when a sixth is added.
 */
export type NotificationSource =
  | 'signal_mention'
  | 'signal_urgent'
  | 'signal_retracted'
  | 'task_named'
  | 'task_comment'

/**
 * Signals carry attention on every delivery so the Inbox can render the pill without a
 * roundtrip to the Signal record; other sources do not populate it.
 */
export type NotificationAttention = 'FYI' | 'Needs attention' | 'Urgent'

export interface NotificationMetadata {
  source?: NotificationSource | string
  actor?: NotificationActor
  entity?: NotificationEntity
  attention?: NotificationAttention
  /** task_named carries which naming role the recipient landed on, so copy can distinguish. */
  role?: 'PIC' | 'Supervisor'
  [key: string]: unknown
}

export interface NotificationRow {
  id: string
  severity: NotificationSeverity
  title: string
  body: string | null
  /**
   * The DB stores metadata as an open jsonb (the retract path from #767, the mention fan-out,
   * and the three #771 sources all write into it). Consumers narrow to `NotificationMetadata`
   * via type guards when they need typed fields; the row's declared shape stays open so a
   * legacy row without every field is representable.
   */
  metadata: NotificationMetadata | Record<string, unknown>
  read_at: string | null
  /** Set when this viewer explicitly triaged the row out of their queue (OD-WAY-88); null = active. */
  handled_at?: string | null
  created_at: string
}

const COLUMNS = 'id, severity, title, body, metadata, read_at, handled_at, created_at'

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
