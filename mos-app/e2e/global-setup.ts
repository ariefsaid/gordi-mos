// E2E global setup — creates test users via Admin API (ADR-0002 D3).
// Avoids GoTrue seed fragility (playbook §9): idempotent delete-then-create via service_role.
// Runs once before all Playwright tests; stack must be up (`supabase start`).
//
// Note on shared.people UPDATE: service_role has no explicit UPDATE grant on shared.people
// (only SELECT is granted to authenticated; postgres owns the table). We use the local
// Supabase /pg/query endpoint (runs as postgres) to perform the user_id link UPDATE.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { VIEWER, ORPHAN } from './fixtures/users'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

function loadEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim()
      vars[key] = val
    }
    return vars
  } catch {
    return {}
  }
}

// Load .env.e2e (preferred) then fall back to process.env
const envFile = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL = envFile.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321'
const SERVICE_ROLE_KEY = envFile.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteUserByEmail(adminClient: SupabaseClient<any, any, any, any, any>, email: string) {
  const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  if (error) {
    console.warn(`[global-setup] listUsers error: ${error.message}`)
    return
  }
  const existing = data.users.find((u) => u.email === email)
  if (existing) {
    const { error: delErr } = await adminClient.auth.admin.deleteUser(existing.id)
    if (delErr) {
      console.warn(`[global-setup] deleteUser(${email}) error: ${delErr.message}`)
    } else {
      console.log(`[global-setup] deleted existing user: ${email}`)
    }
  }
}

/**
 * Execute a SQL statement via the local Supabase /pg/query endpoint (runs as postgres role).
 * Used to UPDATE shared.people.user_id since service_role lacks the write grant on custom schemas.
 * This endpoint is only exposed by the local dev stack — not available in production.
 */
async function execSql(url: string, serviceKey: string, query: string): Promise<void> {
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
    },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[global-setup] SQL exec failed: ${res.status} ${body} — query: ${query}`)
  }
}

export default async function globalSetup() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error('[global-setup] SUPABASE_SERVICE_ROLE_KEY not set — ensure .env.e2e exists or stack is up')
  }

  // Admin client — service_role for Auth Admin API (user create/delete)
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── VIEWER (e2e.viewer@example.test → linked to Cahya Cafe person row) ──────
  await deleteUserByEmail(adminClient, VIEWER.email)
  const { data: viewerData, error: viewerErr } = await adminClient.auth.admin.createUser({
    email: VIEWER.email,
    password: VIEWER.password,
    email_confirm: true,
  })
  if (viewerErr) throw new Error(`[global-setup] createUser VIEWER failed: ${viewerErr.message}`)
  const viewerUid = viewerData.user.id
  console.log(`[global-setup] created VIEWER user: ${VIEWER.email} (uid=${viewerUid})`)

  // Link VIEWER auth user to the Cahya Cafe people row via /pg/query (postgres role, bypasses grants)
  await execSql(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    `UPDATE shared.people SET user_id = '${viewerUid}' WHERE id = '${VIEWER.personId}'`,
  )
  console.log(`[global-setup] linked VIEWER uid to person ${VIEWER.personId}`)

  // ── ORPHAN (e2e.orphan@example.test → no people link, user_id stays NULL) ───
  await deleteUserByEmail(adminClient, ORPHAN.email)
  const { error: orphanErr } = await adminClient.auth.admin.createUser({
    email: ORPHAN.email,
    password: ORPHAN.password,
    email_confirm: true,
  })
  if (orphanErr) throw new Error(`[global-setup] createUser ORPHAN failed: ${orphanErr.message}`)
  console.log(`[global-setup] created ORPHAN user: ${ORPHAN.email} (no people link)`)
}
