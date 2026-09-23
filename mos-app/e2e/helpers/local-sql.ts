import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertFixtureSqlSafe } from '../fixtures/cleanup'

/** Local fixture setup only; refuses remote hosts before sending a service credential. */
export async function localSql(query: string): Promise<void> {
  assertFixtureSqlSafe(query)
  const env: Record<string, string> = {}
  try {
    for (const line of readFileSync(fileURLToPath(new URL('../../.env.e2e', import.meta.url)), 'utf8').split('\n')) {
      const value = line.trim()
      const split = value.indexOf('=')
      if (split > 0 && !value.startsWith('#')) env[value.slice(0, split)] = value.slice(split + 1).trim()
    }
  } catch { /* CI supplies its environment directly. */ }
  const url = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Fixture SQL requires local Supabase')
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Local fixture service credential is unavailable')
  const response = await fetch(`${url}/pg/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Local fixture SQL failed (${response.status})`)
}
