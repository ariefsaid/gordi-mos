import { expect, test } from '@playwright/test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TASKS } from '../fixtures/tasks'
import { VIEWER } from '../fixtures/users'
import { loginAs } from '../helpers/login'
import {
  AuditProvisioner,
  auditFixtureNamespace,
  createLocalAuditAuthClient,
  createLocalAuditSqlClient,
  validateAuditFixtureReceipt,
  type AuditFixtureSqlClient,
} from './audit-provisioner'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function loadFixtureEnv(): Record<string, string> {
  try {
    const envPath = process.env.AUDIT_FIXTURE_ENV_FILE ?? resolve(appDir, '.env.e2e')
    return Object.fromEntries(readFileSync(envPath, 'utf8').split('\n').flatMap((line) => {
      const value = line.trim()
      const split = value.indexOf('=')
      return split > 0 && !value.startsWith('#')
        ? [[value.slice(0, split).trim(), value.slice(split + 1).trim()]]
        : []
    }))
  } catch {
    return {}
  }
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function uuid(sessionId: string, suffix: string): string {
  return `${sessionId}-0000-4000-8000-${suffix}`
}

async function exactDelete(sql: AuditFixtureSqlClient, table: string, id: string): Promise<void> {
  await sql.execute(`DELETE FROM ${table} WHERE id = ${quote(id)};`)
}

async function insertSentinel(
  sql: AuditFixtureSqlClient,
  table: string,
  id: string,
  statement: string,
  inserted: Array<readonly [string, string]>,
): Promise<void> {
  const result = await sql.execute(statement)
  const rows = Array.isArray(result) ? result : []
  assert.equal(rows.length, 1, `sentinel INSERT must return one row for ${table}`)
  assert.deepEqual(rows[0], { id }, `sentinel INSERT must return its exact ID for ${table}`)
  inserted.push([table, id])
}

test('live fixture lifecycle preserves unrelated rows and removes every audit-owned row and auth user', async ({ page }) => {
  assert.equal(process.env.MOS_DB_LOCK_HELD, '1', 'live fixture proof must run under scripts/with-db-lock.sh')
  const candidateSha = process.env.AUDIT_FIXTURE_CANDIDATE_SHA ?? ''
  const sessionId = process.env.AUDIT_FIXTURE_SESSION_ID ?? ''
  assert.match(candidateSha, /^[0-9a-f]{40}$/)
  assert.match(sessionId, /^[0-9a-f]{8}$/)

  const env = loadFixtureEnv()
  const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  assert.ok(serviceKey, 'live fixture proof requires the local service credential')
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname), 'live fixture proof refuses a non-local database')

  const sql = createLocalAuditSqlClient(url, serviceKey)
  const auth = createLocalAuditAuthClient(url, serviceKey)
  const namespace = auditFixtureNamespace(sessionId)
  const bindingSecret = randomBytes(32).toString('hex')
  const ownedTaskId = uuid(sessionId, '000000000001')
  const sentinelTaskId = uuid(sessionId, '000000000101')
  const sentinelUpdateId = uuid(sessionId, '000000000201')
  const sentinelLogId = uuid(sessionId, '000000000301')
  const title = `${namespace} browser-visible task`
  const weekOffset = Number.parseInt(sessionId, 16) % 3650
  const weekStart = new Date(Date.UTC(2090, 0, 1 + weekOffset)).toISOString().slice(0, 10)
  const authEmail = `${namespace}.live@example.test`
  let provisioner: AuditProvisioner | undefined
  const insertedSentinels: Array<readonly [string, string]> = []

  try {
    const requiredSeedRows = await sql.query(`
      SELECT p.id, tm.team_id
      FROM shared.people p
      JOIN shared.orgs o ON o.id = ${quote(TASKS.VIEWER_ACCOUNTABLE.orgId)}
      JOIN shared.business_units b ON b.id = ${quote(TASKS.VIEWER_ACCOUNTABLE.businessUnitId)}
      JOIN shared.team_memberships tm ON tm.person_id = p.id
        AND tm.org_id = o.id AND tm.is_primary AND tm.effective_to IS NULL
      JOIN shared.teams t ON t.id = tm.team_id AND t.business_unit_id = b.id AND t.archived_at IS NULL
      WHERE p.id = ${quote(VIEWER.personId)};
    `)
    assert.equal(requiredSeedRows.length, 1, 'demo seeds must exist before the live fixture proof runs')
    const seedRow = requiredSeedRows[0]
    assert.ok(seedRow && typeof seedRow === 'object' && !Array.isArray(seedRow))
    const primaryTeamId = (seedRow as Record<string, unknown>).team_id
    if (typeof primaryTeamId !== 'string') throw new Error('the demo profile must have one live primary team')

    await insertSentinel(sql, 'mos.tasks', sentinelTaskId, `
      INSERT INTO mos.tasks
        (id, org_id, title, business_unit_id, team_id, status, responsible_person_id, accountable_person_id, created_by)
      VALUES
        (${quote(sentinelTaskId)}, ${quote(TASKS.VIEWER_ACCOUNTABLE.orgId)}, ${quote(`${namespace} sentinel task`)},
         ${quote(TASKS.VIEWER_ACCOUNTABLE.businessUnitId)}, ${quote(primaryTeamId)}, 'Open', ${quote(VIEWER.personId)},
         ${quote(VIEWER.personId)}, ${quote(VIEWER.personId)})
      RETURNING id;
    `, insertedSentinels)
    await insertSentinel(sql, 'mos.weekly_updates', sentinelUpdateId, `
      INSERT INTO mos.weekly_updates (id, org_id, person_id, week_start, summary, status, created_by)
      VALUES (${quote(sentinelUpdateId)}, ${quote(TASKS.VIEWER_ACCOUNTABLE.orgId)}, ${quote(VIEWER.personId)},
        ${quote(weekStart)}, ${quote(`${namespace} sentinel weekly update`)}, 'draft', ${quote(VIEWER.personId)})
      RETURNING id;
    `, insertedSentinels)
    await insertSentinel(sql, 'ops.log_entries', sentinelLogId, `
      INSERT INTO ops.log_entries (id, org_id, business_unit_id, origin, event_type, title, detail, created_by)
      VALUES (${quote(sentinelLogId)}, ${quote(TASKS.VIEWER_ACCOUNTABLE.orgId)},
        ${quote(TASKS.VIEWER_ACCOUNTABLE.businessUnitId)}, 'manual', 'other',
        ${quote(`${namespace} sentinel log`)}, ${quote('full-row sentinel detail')}, ${quote(VIEWER.personId)})
      RETURNING id;
    `, insertedSentinels)

    provisioner = new AuditProvisioner({
      candidateSha,
      sessionId,
      bindingSecret,
      sql,
      auth,
      definitions: {
        identities: [{ fixture: 'AUDIT_LIVE_AUTH', email: authEmail, password: randomBytes(18).toString('base64url') }],
        records: [{
          fixture: 'AUDIT_LIVE_TASK',
          table: 'mos.tasks',
          id: ownedTaskId,
          namespace,
          columns: {
            org_id: TASKS.VIEWER_ACCOUNTABLE.orgId,
            title,
            business_unit_id: TASKS.VIEWER_ACCOUNTABLE.businessUnitId,
            team_id: primaryTeamId,
            status: 'Open',
            responsible_person_id: VIEWER.personId,
            accountable_person_id: VIEWER.personId,
            created_by: VIEWER.personId,
          },
        }],
        sentinels: [
          { table: 'mos.tasks', id: sentinelTaskId },
          { table: 'mos.weekly_updates', id: sentinelUpdateId },
          { table: 'ops.log_entries', id: sentinelLogId },
        ],
      },
    })

    await provisioner.provision()
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('work/tasks')
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible()

    const cleaned = await provisioner.cleanup()
    const validation = validateAuditFixtureReceipt(cleaned, { candidateSha, sessionId, bindingSecret })
    assert.deepEqual(validation.errors, [])
    assert.equal(validation.ok, true)
    assert.equal(cleaned.unrelatedSentinelsPreserved, true)
    assert.equal(cleaned.sentinels.length, 3)
    assert.ok(cleaned.sentinels.every((sentinel) => sentinel.beforePresent && sentinel.afterPresent
      && sentinel.beforeHash === sentinel.afterHash))
    assert.ok(cleaned.cleanup.every((row) => row.remaining === 0))
    assert.deepEqual(await sql.query(`SELECT * FROM mos.tasks WHERE id = ${quote(ownedTaskId)};`), [])
    assert.equal((await auth.listUsers?.())?.some((user) => user.email.toLowerCase() === authEmail), false)
  } finally {
    if (provisioner) await provisioner.cleanup({ onFailure: true })
    for (const [table, id] of [...insertedSentinels].reverse()) await exactDelete(sql, table, id)
    for (const [table, id] of insertedSentinels) {
      assert.deepEqual(await sql.query(`SELECT * FROM ${table} WHERE id = ${quote(id)};`), [])
    }
  }
})
