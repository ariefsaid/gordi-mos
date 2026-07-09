/**
 * pushDispatch — the edge-side push transport for notification fan-out (ADR-0019 D9 channel seam).
 * INERT until VAPID op-secrets are set: absent `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` it reports
 * `no-vapid` and does nothing, so P3a ships the seam without blocking on op-secret setup or a
 * `mos.push_subscriptions` backlog. When VAPID lands, this is where the web-push lookup + send go
 * (deferred to the VAPID-enablement slice). Never throws — a push failure must not lose the inbox row.
 */

export interface PushRow {
  owner_id?: string
  title: string
  body?: string | null
  metadata?: Record<string, unknown>
}

export interface PushResult {
  ok: boolean
  reason?: string
}

export async function dispatchPush(_row: PushRow): Promise<PushResult> {
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!pub || !priv) {
    // No VAPID configured — the in-app channel is the only live delivery. Seam is real, delivery off.
    return { ok: false, reason: 'no-vapid' }
  }
  // TODO(VAPID-enablement): load mos.push_subscriptions for row.owner_id + web-push send here.
  return { ok: false, reason: 'not-implemented' }
}
