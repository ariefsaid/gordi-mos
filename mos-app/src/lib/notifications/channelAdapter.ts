/**
 * channelAdapter — the notification fan-out seam (ADR-0019 D9). A notification row is written to
 * the in-app inbox (always) and then optionally fanned out to a push channel. The push channel is
 * INJECTED (never imported here) so this module stays boundary-clean: the browser/Node client has
 * no push transport, and the edge function has its own Deno `pushDispatch` (supabase/functions/
 * _shared/pushDispatch.ts) — each side wires the seam without importing the other.
 *
 * v1: in-app is the only live channel. Push delivery flips on when VAPID op-secrets are configured
 * (the edge `dispatchPush` reports `no-vapid` until then). Fan-out never throws on a push failure —
 * a delivered inbox row must not be lost because push was unavailable.
 */

export interface NotificationRow {
  /** Omit for a self-notification — the DB default (current_person_id) + RLS pin it to the caller.
   *  Cross-owner delivery does NOT use this path; it goes through mos.create_notification (definer). */
  owner_id?: string
  severity?: 'info' | 'warning' | 'critical'
  title: string
  body?: string | null
  metadata?: Record<string, unknown>
}

export interface PushResult {
  ok: boolean
  reason?: string
}

/** The minimal insert surface fan-out needs from a caller-JWT supabase client. */
export interface NotificationSink {
  schema(name: 'mos'): {
    from(table: 'notifications'): {
      insert(row: NotificationRow): Promise<{ error: { message: string } | null }>
    }
  }
}

export interface FanOutDeps {
  sb: NotificationSink
  /** Injected push transport; omitted on surfaces with no push channel (the in-app write still lands). */
  dispatchPush?: (row: NotificationRow) => Promise<PushResult>
}

export interface FanOutResult {
  inApp: boolean
  push: PushResult
}

/**
 * Write the in-app row, then fan out to push (if a transport is wired). The in-app write is the
 * durable channel; a push failure is swallowed into the result, never thrown.
 */
export async function fanOut(deps: FanOutDeps, row: NotificationRow): Promise<FanOutResult> {
  const { error } = await deps.sb.schema('mos').from('notifications').insert(row)
  if (error) throw new Error(`notification in-app write failed: ${error.message}`)

  if (!deps.dispatchPush) return { inApp: true, push: { ok: false, reason: 'no-transport' } }
  const push = await deps.dispatchPush(row).catch((e) => ({
    ok: false,
    reason: e instanceof Error ? e.message : 'push-error',
  }))
  return { inApp: true, push }
}
