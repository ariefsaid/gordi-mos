#!/usr/bin/env node
// Deletes attendance selfies and doctor's-note photos that the retention job queued, through the Storage API (never SQL),
// then confirms each deletion so it is not retried. Run on a schedule with the service key in the
// environment: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Safe to run any number of times.
export async function purgePhotos({ url, key, fetchImpl = fetch, limit = 100 }) {
  const rest = (name, body) => fetchImpl(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Profile': 'ops', 'Accept-Profile': 'ops' },
    body: JSON.stringify(body),
  })
  const claimed = await rest('claim_attendance_selfie_purge', { p_limit: limit })
  if (!claimed.ok) throw new Error(`claim failed: ${claimed.status}`)
  const rows = await claimed.json()
  if (rows.length === 0) return { deleted: 0 }
  const byBucket = Map.groupBy(rows, (row) => row.bucket)
  for (const [bucket, group] of byBucket) {
    const paths = group.map((row) => row.path)
    const removed = await fetchImpl(`${url}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: paths }),
    })
    if (!removed.ok) throw new Error(`storage delete failed: ${removed.status}`)
    const confirmed = await rest('confirm_attendance_selfie_purged', { p_paths: paths })
    if (!confirmed.ok) throw new Error(`confirm failed: ${confirmed.status}`)
  }
  return { deleted: rows.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(2) }
  purgePhotos({ url, key }).then((result) => console.log(JSON.stringify(result)), (error) => { console.error(error.message); process.exit(1) })
}
