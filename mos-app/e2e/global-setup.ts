// E2E global setup — PMO-aligned auth model (ADR-0002 D3 + 2026-06-21 dev/e2e isolation fix).
//
// OLD flakiness root cause: the previous setup created SEPARATE e2e auth users and then re-pointed
// the SHARED dev person rows (Dewi 4000…0, Cahya 4000…1, Sari 4000…4) at them on EVERY run —
// orphaning the *.dev@example.test demo personas, so the owner's one-click dev login broke after any
// `npx playwright test`. PMO never had this: it logs e2e in as the seeded demo users and never
// re-links per run. We now do the same on MOS's single local stack.
//
// This setup is ADDITIVE / idempotent toward dev:
//   • ensures every *.dev@example.test persona has an auth user (CREATE-IF-MISSING, never delete)
//     and is linked to its shared.people row → running e2e now HEALS dev login instead of breaking it;
//   • e2e specs log in AS the dev personas (VIEWER = cahya.dev, MANAGER = dewi.dev);
//   • only the dedicated, e2e-OWNED users (ORPHAN, RECOVERY) are delete-then-create — they touch NO
//     dev person row, so the destructive AC-005 password rotation can't affect any dev login.
//
// shared.people writes go via the local /pg/query endpoint (postgres role): service_role has only
// SELECT on shared.people. This endpoint is local-only — never available in production.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { ORPHAN, RECOVERY_VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

const ORG = '10000000-0000-0000-0000-000000000001'

// The seeded dev personas e2e logs in as / heals. Mirrors supabase/seed.sql + DemoLogin.tsx.
const DEV_PASSWORD = 'Passw0rd!dev'
const DEV_PERSONAS = [
  'dewi.dev@example.test',
  'cahya.dev@example.test',
  'krishna.dev@example.test',
  'rama.dev@example.test',
  'sari.dev@example.test',
  'fitri.dev@example.test',
]

function loadEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return vars
  } catch {
    return {}
  }
}

// Load .env.e2e (preferred) then fall back to process.env
const envFile = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL = envFile.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_ROLE_KEY = envFile.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any, any, any>

async function deleteUserByEmail(adminClient: Admin, email: string) {
  const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  if (error) {
    console.warn(`[global-setup] listUsers error: ${error.message}`)
    return
  }
  const existing = data.users.find((u) => u.email === email)
  if (existing) {
    const { error: delErr } = await adminClient.auth.admin.deleteUser(existing.id)
    if (delErr) console.warn(`[global-setup] deleteUser(${email}) error: ${delErr.message}`)
    else console.log(`[global-setup] deleted existing user: ${email}`)
  }
}

/** Create the auth user only if it doesn't already exist (idempotent; never deletes/rotates). */
async function ensureUser(
  adminClient: Admin,
  existing: { id: string; email?: string }[],
  email: string,
  password: string,
): Promise<string> {
  const found = existing.find((u) => u.email === email)
  if (found) return found.id
  const { data, error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw new Error(`[global-setup] createUser ${email} failed: ${error.message}`)
  console.log(`[global-setup] created missing user: ${email}`)
  return data.user.id
}

/**
 * Execute SQL via the local Supabase /pg/query endpoint (runs as postgres). Used for shared.people
 * writes since service_role lacks the grant on custom schemas. Local-only — not available in prod.
 */
async function execSql(url: string, serviceKey: string, query: string): Promise<void> {
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey },
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

  const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw new Error(`[global-setup] listUsers failed: ${listErr.message}`)
  const existingUsers = list.users

  // ── 1. Ensure the dev personas exist + are linked (SELF-HEALING; never deletes) ───────────────
  // e2e logs in as these; ensuring them here also repairs the owner's dev login on every run.
  for (const email of DEV_PERSONAS) {
    await ensureUser(adminClient, existingUsers, email, DEV_PASSWORD)
  }
  await execSql(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    `UPDATE shared.people p SET user_id = u.id
       FROM auth.users u
      WHERE u.email = p.email AND p.email LIKE '%.dev@example.test'`,
  )
  console.log('[global-setup] ensured + linked all *.dev personas (dev login self-healed)')

  // ── 2. ORPHAN (dedicated e2e user, NO people link → orphan screen) ─────────────────────────────
  await deleteUserByEmail(adminClient, ORPHAN.email)
  const { error: orphanErr } = await adminClient.auth.admin.createUser({
    email: ORPHAN.email,
    password: ORPHAN.password,
    email_confirm: true,
  })
  if (orphanErr) throw new Error(`[global-setup] createUser ORPHAN failed: ${orphanErr.message}`)
  console.log(`[global-setup] created ORPHAN user: ${ORPHAN.email} (no people link)`)

  // ── 3. RECOVERY (dedicated e2e user + dedicated e2e person row) ────────────────────────────────
  // AC-005 rotates this password — isolated from the dev canon so it can't break any dev login.
  // delete-then-create resets the password drift from the previous run.
  await execSql(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    `INSERT INTO shared.people (id, org_id, full_name, email)
     VALUES ('${RECOVERY_VIEWER.personId}', '${ORG}', '${RECOVERY_VIEWER.displayName}', '${RECOVERY_VIEWER.email}')
     ON CONFLICT (id) DO NOTHING`,
  )
  await deleteUserByEmail(adminClient, RECOVERY_VIEWER.email)
  const { data: recoveryData, error: recoveryErr } = await adminClient.auth.admin.createUser({
    email: RECOVERY_VIEWER.email,
    password: RECOVERY_VIEWER.password,
    email_confirm: true,
  })
  if (recoveryErr) throw new Error(`[global-setup] createUser RECOVERY failed: ${recoveryErr.message}`)
  await execSql(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    `UPDATE shared.people SET user_id = '${recoveryData.user.id}' WHERE id = '${RECOVERY_VIEWER.personId}'`,
  )
  console.log(`[global-setup] created + linked RECOVERY user → dedicated person ${RECOVERY_VIEWER.personId}`)

  // ── 4. Clear mos.weekly_updates for P2-2 e2e journeys (idempotent clean slate) ─────────────────
  await execSql(SUPABASE_URL, SERVICE_ROLE_KEY, `
    DELETE FROM mos.weekly_update_items WHERE org_id = '${ORG}';
    DELETE FROM mos.weekly_updates      WHERE org_id = '${ORG}';
  `)
  console.log('[global-setup] cleared mos.weekly_updates for e2e org')

  // ── 5. Clear ops.log_entries for P2-3 e2e journeys (idempotent clean slate) ────────────────────
  await execSql(SUPABASE_URL, SERVICE_ROLE_KEY, `
    DELETE FROM ops.log_entries WHERE org_id = '${ORG}';
  `)
  console.log('[global-setup] cleared ops.log_entries for e2e org')

  // ── 6. Seed mos.tasks for P2-1c e2e journeys (deterministic clean slate) ───────────────────────
  const orgId = TASKS.VIEWER_ACCOUNTABLE.orgId
  await execSql(SUPABASE_URL, SERVICE_ROLE_KEY, `
    DELETE FROM mos.task_events          WHERE org_id = '${orgId}';
    DELETE FROM mos.task_checklist_items WHERE org_id = '${orgId}';
    DELETE FROM mos.tasks                WHERE org_id = '${orgId}';
  `)
  console.log('[global-setup] cleared mos.tasks for e2e org')

  const t = TASKS.VIEWER_ACCOUNTABLE
  await execSql(SUPABASE_URL, SERVICE_ROLE_KEY, `
    INSERT INTO mos.tasks (
      id, org_id, title, business_unit_id, status,
      responsible_person_id, accountable_person_id,
      consulted_person_ids, informed_person_ids,
      description, due_date, created_by
    ) VALUES (
      '${t.id}', '${t.orgId}', '${t.title}', '${t.businessUnitId}', 'Open',
      '${t.responsiblePersonId}', '${t.accountablePersonId}',
      '{}', '{}',
      'Seeded for e2e archive journey (AC-091).', NULL, '${t.responsiblePersonId}'
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO mos.task_events (org_id, task_id, actor_person_id, event_type)
    VALUES (
      '${t.orgId}', '${t.id}', '${t.responsiblePersonId}', 'created'
    );
  `)
  console.log(`[global-setup] seeded VIEWER_ACCOUNTABLE task (id=${t.id})`)
}
