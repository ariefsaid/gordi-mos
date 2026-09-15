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
} from './audit-provisioner'
import { liveFixtureUuid, quoteLiveFixtureValue } from './audit-fixture-live-global-setup'
import { ReportWriter } from './report'

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
  const bindingSecretPath = process.env.AUDIT_FIXTURE_BINDING_SECRET_FILE ?? ''
  assert.ok(bindingSecretPath, 'live fixture proof requires a durable sentinel binding secret file')
  const bindingSecret = readFileSync(bindingSecretPath, 'utf8').trim()
  assert.ok(bindingSecret.length >= 16, 'live fixture proof requires a durable sentinel binding secret')
  const receiptOutputDir = process.env.AUDIT_FIXTURE_RECEIPT_OUTPUT_DIR ?? ''
  assert.ok(receiptOutputDir, 'live fixture proof requires a durable receipt output directory')
  const receiptWriter = new ReportWriter({ outputDir: receiptOutputDir, candidateSha, sessionId })
  const ownedTaskId = liveFixtureUuid(sessionId, '000000000001')
  const sentinelTaskId = liveFixtureUuid(sessionId, '000000000101')
  const sentinelUpdateId = liveFixtureUuid(sessionId, '000000000201')
  const sentinelLogId = liveFixtureUuid(sessionId, '000000000301')
  const title = `${namespace} browser-visible task`
  const authEmail = `${namespace}.live@example.test`
  let provisioner: AuditProvisioner | undefined
  const cleanupErrors: unknown[] = []

  try {
    const requiredSeedRows = await sql.query(`
      SELECT p.id, tm.team_id
      FROM shared.people p
      JOIN shared.orgs o ON o.id = ${quoteLiveFixtureValue(TASKS.VIEWER_ACCOUNTABLE.orgId)}
      JOIN shared.business_units b ON b.id = ${quoteLiveFixtureValue(TASKS.VIEWER_ACCOUNTABLE.businessUnitId)}
      JOIN shared.team_memberships tm ON tm.person_id = p.id
        AND tm.org_id = o.id AND tm.is_primary AND tm.effective_to IS NULL
      JOIN shared.teams t ON t.id = tm.team_id AND t.business_unit_id = b.id AND t.archived_at IS NULL
      WHERE p.id = ${quoteLiveFixtureValue(VIEWER.personId)};
    `)
    assert.equal(requiredSeedRows.length, 1, 'demo seeds must exist before the live fixture proof runs')
    const seedRow = requiredSeedRows[0]
    assert.ok(seedRow && typeof seedRow === 'object' && !Array.isArray(seedRow))
    const primaryTeamId = (seedRow as Record<string, unknown>).team_id
    if (typeof primaryTeamId !== 'string') throw new Error('the demo profile must have one live primary team')

    provisioner = new AuditProvisioner({
      candidateSha,
      sessionId,
      bindingSecret,
      sql,
      auth,
      onReceipt: async (receipt) => { await receiptWriter.writeFixtureReceipt(receipt) },
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
    assert.deepEqual(await sql.query(`SELECT * FROM mos.tasks WHERE id = ${quoteLiveFixtureValue(ownedTaskId)};`), [])
    assert.equal((await auth.listUsers?.())?.some((user) => user.email.toLowerCase() === authEmail), false)
  } catch (error) {
    cleanupErrors.push(error)
  }
  if (provisioner) {
    try { await provisioner.cleanup({ onFailure: true }) }
    catch (error) { cleanupErrors.push(error) }
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'audit fixture run or teardown did not complete')
})
