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
import { VIEWER, ORPHAN, RECOVERY_VIEWER, MANAGER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

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

  // ── RECOVERY_VIEWER (e2e.recovery@example.test → linked to Sari Sales person row) ──
  // Dedicated fixture for AC-005 recovery journey — password rotation in that test will NOT
  // affect VIEWER, keeping auth-password-login and auth-signout-back stable.
  await deleteUserByEmail(adminClient, RECOVERY_VIEWER.email)
  const { data: recoveryData, error: recoveryErr } = await adminClient.auth.admin.createUser({
    email: RECOVERY_VIEWER.email,
    password: RECOVERY_VIEWER.password,
    email_confirm: true,
  })
  if (recoveryErr) throw new Error(`[global-setup] createUser RECOVERY_VIEWER failed: ${recoveryErr.message}`)
  const recoveryUid = recoveryData.user.id
  console.log(`[global-setup] created RECOVERY_VIEWER user: ${RECOVERY_VIEWER.email} (uid=${recoveryUid})`)

  await execSql(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    `UPDATE shared.people SET user_id = '${recoveryUid}' WHERE id = '${RECOVERY_VIEWER.personId}'`,
  )
  console.log(`[global-setup] linked RECOVERY_VIEWER uid to person ${RECOVERY_VIEWER.personId}`)

  // ── MANAGER (e2e.manager@example.test → linked to Dewi Director person row) ──
  // Dewi Director holds the Managing Director role; Cahya (VIEWER) holds roles that report to it.
  // Ensures MANAGER resolves isManager=true for the team-module e2e assertion.
  // Idempotent: delete-then-create.
  await deleteUserByEmail(adminClient, MANAGER.email)
  const { data: managerData, error: managerErr } = await adminClient.auth.admin.createUser({
    email: MANAGER.email,
    password: MANAGER.password,
    email_confirm: true,
  })
  if (managerErr) throw new Error(`[global-setup] createUser MANAGER failed: ${managerErr.message}`)
  const managerUid = managerData.user.id
  console.log(`[global-setup] created MANAGER user: ${MANAGER.email} (uid=${managerUid})`)

  await execSql(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    `UPDATE shared.people SET user_id = '${managerUid}' WHERE id = '${MANAGER.personId}'`,
  )
  console.log(`[global-setup] linked MANAGER uid to person ${MANAGER.personId}`)

  // Ensure VIEWER's person (Cahya Cafe) holds their roles so Dewi's isManager resolves correctly.
  // The person_roles rows are seeded by supabase/seed.sql; this is an idempotent guard to ensure
  // the junction rows exist even if seed ran before person rows had UUIDs set.
  await execSql(
    SUPABASE_URL,
    SERVICE_ROLE_KEY,
    `INSERT INTO shared.person_roles (org_id, person_id, role_id)
     VALUES
       ('10000000-0000-0000-0000-000000000001','${MANAGER.personId}','30000000-0000-0000-0000-000000000000'),
       ('10000000-0000-0000-0000-000000000001','${VIEWER.personId}','30000000-0000-0000-0000-000000000001'),
       ('10000000-0000-0000-0000-000000000001','${VIEWER.personId}','30000000-0000-0000-0000-000000000004')
     ON CONFLICT (person_id, role_id) DO NOTHING`,
  )
  console.log('[global-setup] ensured MANAGER and VIEWER person_roles rows exist (idempotent)')

  // ── Seed mos.tasks for P2-1c e2e journeys ──────────────────────────────────
  // Deterministic: delete all mos.tasks for the Gordi e2e org, then seed fixed rows.
  // (service_role bypasses RLS via postgres; the org_id is fixed in seed.sql.)
  const orgId = TASKS.VIEWER_ACCOUNTABLE.orgId

  await execSql(SUPABASE_URL, SERVICE_ROLE_KEY, `
    DELETE FROM mos.task_events         WHERE org_id = '${orgId}';
    DELETE FROM mos.task_checklist_items WHERE org_id = '${orgId}';
    DELETE FROM mos.tasks               WHERE org_id = '${orgId}';
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
