#!/usr/bin/env node
// Deletes attendance selfies that the retention job queued, through the Storage API (never SQL),
// then confirms each deletion so it is not retried. Run on a schedule with the service key in the
// environment: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Safe to run any number of times.
const BUCKET = 'attendance-selfies'

export async function purgeSelfies({ url, key, fetchImpl = fetch, limit = 100 }) {
  const rest = (name, body) => fetchImpl(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Profile': 'ops', 'Accept-Profile': 'ops' },
    body: JSON.stringify(body),
  })
  const claimed = await rest('claim_attendance_selfie_purge', { p_limit: limit })
  if (!claimed.ok) throw new Error(`claim failed: ${claimed.status}`)
  const paths = (await claimed.json()).map((row) => row.path)
  if (paths.length === 0) return { deleted: 0 }
  const removed = await fetchImpl(`${url}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths }),
  })
  if (!removed.ok) throw new Error(`storage delete failed: ${removed.status}`)
  const confirmed = await rest('confirm_attendance_selfie_purged', { p_paths: paths })
  if (!confirmed.ok) throw new Error(`confirm failed: ${confirmed.status}`)
  return { deleted: paths.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(2) }
  purgeSelfies({ url, key }).then((result) => console.log(JSON.stringify(result)), (error) => { console.error(error.message); process.exit(1) })
}
