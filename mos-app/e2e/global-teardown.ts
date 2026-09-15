// Global teardown removes only the fixed fixtures seeded by global setup.
import { readFileSync } from 'fs'
import { assertFixtureSqlSafe, assertLocalFixtureDatabase, fixtureCleanupSql } from './fixtures/cleanup'

function loadEnvFile(): Record<string, string> {
  try {
    const content = readFileSync(process.env.AUDIT_FIXTURE_ENV_FILE ?? new URL('../.env.e2e', import.meta.url), 'utf8')
    return Object.fromEntries(content.split('\n').flatMap((line) => {
      const trimmed = line.trim()
      const eq = trimmed.indexOf('=')
      return !trimmed || trimmed.startsWith('#') || eq === -1
        ? [] : [[trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim()]]
    }))
  } catch {
    return {}
  }
}

export default async function globalTeardown() {
  const env = loadEnvFile()
  const url = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
  const key = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  assertLocalFixtureDatabase(url)
  if (!key) throw new Error('[global-teardown] service key missing; cannot clean owned fixtures')

  assertFixtureSqlSafe(fixtureCleanupSql)
  const response = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ query: fixtureCleanupSql }),
  })
  if (!response.ok) throw new Error(`[global-teardown] fixture cleanup failed: ${response.status}`)
  console.log('[global-teardown] cleared owned fixture IDs')
}
