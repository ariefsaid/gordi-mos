/**
 * attendance-photo-purge — deletes attendance selfies and doctor's-note photos that the retention
 * job queued, through the Storage API (never SQL), then confirms each deletion so it is not retried.
 * Called hourly by ops.dispatch_attendance_photo_purge() with a dedicated bearer secret. Safe to run
 * any number of times. Pure of Deno globals so it is testable with an injected fetch.
 */

const BUCKETS = ['attendance-selfies', 'staff-notes']

interface PurgeDeps {
  url: string
  key: string
  fetchImpl?: typeof fetch
  limit?: number
}

const digest = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

/** Constant-time over SHA-256 digests: fixed length, no early exit. */
export async function bearerMatches(header: string, secret: string): Promise<boolean> {
  if (!secret) return false
  const [a, b] = await Promise.all([digest(header), digest(`Bearer ${secret}`)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export async function purgePhotos({ url, key, fetchImpl = fetch, limit = 100 }: PurgeDeps): Promise<{ deleted: number }> {
  const rest = (name: string, body: unknown) =>
    fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Profile': 'ops', 'Accept-Profile': 'ops' },
      body: JSON.stringify(body),
    })
  const claimed = await rest('claim_attendance_selfie_purge', { p_limit: limit })
  if (!claimed.ok) throw new Error(`claim failed: ${claimed.status}`)
  const rows = ((await claimed.json()) as { bucket: string; path: string }[]).filter((row) => BUCKETS.includes(row.bucket))
  if (rows.length === 0) return { deleted: 0 }
  const byBucket = new Map<string, string[]>()
  for (const row of rows) byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path])
  for (const [bucket, paths] of byBucket) {
    const removed = await fetchImpl(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    })
    if (!removed.ok) throw new Error(`storage delete failed: ${removed.status}`)
    const confirmed = await rest('confirm_attendance_selfie_purged', { p_bucket: bucket, p_paths: paths })
    if (!confirmed.ok) throw new Error(`confirm failed: ${confirmed.status}`)
  }
  return { deleted: rows.length }
}

export async function handle(req: Request, env: { url: string; key: string; secret: string }, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  if (!(await bearerMatches(req.headers.get('Authorization') ?? '', env.secret))) return json({ error: 'UNAUTHORIZED' }, 401)
  try {
    return json(await purgePhotos({ url: env.url, key: env.key, fetchImpl }), 200)
  } catch (error) {
    console.error(JSON.stringify({ fn: 'attendance-photo-purge', errorCode: (error as Error).message }))
    return json({ error: 'PURGE_FAILED' }, 500)
  }
}
