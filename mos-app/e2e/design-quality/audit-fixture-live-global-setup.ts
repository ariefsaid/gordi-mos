import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import defaultGlobalSetup from '../global-setup'
import { TASKS } from '../fixtures/tasks'
import { VIEWER } from '../fixtures/users'
import {
  auditFixtureNamespace,
  auditFixtureValuesEqual,
  createLocalAuditSqlClient,
  writeAuditFixtureSentinelLedger,
  type AuditFixtureSentinelIntent,
  type AuditFixtureSentinelLedger,
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

export function quoteLiveFixtureValue(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function liveFixtureUuid(sessionId: string, suffix: string): string {
  return `${sessionId}-0000-4000-8000-${suffix}`
}

export async function exactLiveFixtureRows(
  sql: AuditFixtureSqlClient,
  table: string,
  id: string,
): Promise<unknown[]> {
  return sql.query(`SELECT *, xmin::text AS audit_fixture_xmin FROM ${table} WHERE id = ${quoteLiveFixtureValue(id)};`)
}

export function matchesLiveFixtureOwnership(value: unknown, ownership: Record<string, unknown>): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.entries(ownership).every(([column, expected]) =>
      auditFixtureValuesEqual((value as Record<string, unknown>)[column], expected))
}

function resultRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'object' && value !== null && !Array.isArray(value)
    && Array.isArray((value as { rows?: unknown }).rows)) return (value as { rows: unknown[] }).rows
  return []
}

async function insertSentinel(
  sql: AuditFixtureSqlClient,
  ledgerPath: string,
  bindingSecret: string,
  ledger: AuditFixtureSentinelLedger,
  table: string,
  id: string,
  statement: string,
  ownership: Record<string, unknown>,
): Promise<void> {
  assert.deepEqual(await exactLiveFixtureRows(sql, table, id), [], `sentinel ID must be absent before insert for ${table}`)
  const intent: AuditFixtureSentinelIntent = { table, id, ownership, version: null }
  ledger.intents.push(intent)
  await writeAuditFixtureSentinelLedger(ledgerPath, ledger, bindingSecret)
  const returned = resultRows(await sql.execute(statement))
  const row = returned.length === 1 && typeof returned[0] === 'object' && returned[0] !== null
    ? returned[0] as Record<string, unknown>
    : undefined
  const version = row?.audit_fixture_xmin
  assert.equal(returned.length, 1, `sentinel INSERT must return one row for ${table}`)
  assert.ok(row && auditFixtureValuesEqual(row.id, id), `sentinel INSERT must return its exact ID for ${table}`)
  assert.equal(typeof version === 'string' && /^[0-9]+$/.test(version), true, `sentinel INSERT must return its row version for ${table}`)
  intent.version = version as string
  await writeAuditFixtureSentinelLedger(ledgerPath, ledger, bindingSecret)
}

export function liveFixtureRuntime() {
  const candidateSha = process.env.AUDIT_FIXTURE_CANDIDATE_SHA ?? ''
  const sessionId = process.env.AUDIT_FIXTURE_SESSION_ID ?? ''
  const ledgerPath = process.env.AUDIT_FIXTURE_LEDGER_PATH ?? ''
  const secretPath = process.env.AUDIT_FIXTURE_BINDING_SECRET_FILE ?? ''
  assert.match(candidateSha, /^[0-9a-f]{40}$/)
  assert.match(sessionId, /^[0-9a-f]{8}$/)
  assert.ok(ledgerPath, 'live fixture proof requires a durable sentinel ledger path')
  assert.ok(secretPath, 'live fixture proof requires a durable sentinel binding secret file')
  const bindingSecret = readFileSync(secretPath, 'utf8').trim()
  assert.ok(bindingSecret.length >= 16, 'live fixture proof requires a durable sentinel binding secret')
  const env = loadFixtureEnv()
  const url = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  assert.ok(serviceKey, 'live fixture proof requires the local service credential')
  assert.ok(['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname), 'live fixture proof refuses a non-local database')
  return {
    candidateSha,
    sessionId,
    ledgerPath,
    bindingSecret,
    sql: createLocalAuditSqlClient(url, serviceKey),
  }
}

export default async function auditFixtureLiveGlobalSetup(): Promise<void> {
  assert.equal(process.env.MOS_DB_LOCK_HELD, '1', 'live fixture proof must run under scripts/with-db-lock.sh')
  const runtime = liveFixtureRuntime()
  const namespace = auditFixtureNamespace(runtime.sessionId)
  const requiredSeedRows = await runtime.sql.query(`
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

  const taskId = liveFixtureUuid(runtime.sessionId, '000000000101')
  const updateId = liveFixtureUuid(runtime.sessionId, '000000000201')
  const logId = liveFixtureUuid(runtime.sessionId, '000000000301')
  const weekOffset = Number.parseInt(runtime.sessionId, 16) % 3650
  const weekStart = new Date(Date.UTC(2090, 0, 1 + weekOffset)).toISOString().slice(0, 10)
  const ledger: AuditFixtureSentinelLedger = {
    candidateSha: runtime.candidateSha,
    sessionId: runtime.sessionId,
    namespace,
    intents: [],
    binding: '',
  }
  await writeAuditFixtureSentinelLedger(runtime.ledgerPath, ledger, runtime.bindingSecret)

  await insertSentinel(runtime.sql, runtime.ledgerPath, runtime.bindingSecret, ledger, 'mos.tasks', taskId, `
    INSERT INTO mos.tasks
      (id, org_id, title, business_unit_id, team_id, status, responsible_person_id, accountable_person_id, created_by)
    VALUES
      (${quoteLiveFixtureValue(taskId)}, ${quoteLiveFixtureValue(TASKS.VIEWER_ACCOUNTABLE.orgId)},
       ${quoteLiveFixtureValue(`${namespace} sentinel task`)}, ${quoteLiveFixtureValue(TASKS.VIEWER_ACCOUNTABLE.businessUnitId)},
       ${quoteLiveFixtureValue(primaryTeamId)}, 'Open', ${quoteLiveFixtureValue(VIEWER.personId)},
       ${quoteLiveFixtureValue(VIEWER.personId)}, ${quoteLiveFixtureValue(VIEWER.personId)})
    RETURNING id, xmin::text AS audit_fixture_xmin;
  `, {
    id: taskId,
    org_id: TASKS.VIEWER_ACCOUNTABLE.orgId,
    title: `${namespace} sentinel task`,
    business_unit_id: TASKS.VIEWER_ACCOUNTABLE.businessUnitId,
    team_id: primaryTeamId,
    status: 'Open',
    responsible_person_id: VIEWER.personId,
    accountable_person_id: VIEWER.personId,
    created_by: VIEWER.personId,
  })
  await insertSentinel(runtime.sql, runtime.ledgerPath, runtime.bindingSecret, ledger, 'mos.weekly_updates', updateId, `
    INSERT INTO mos.weekly_updates (id, org_id, person_id, week_start, summary, status, created_by)
    VALUES (${quoteLiveFixtureValue(updateId)}, ${quoteLiveFixtureValue(TASKS.VIEWER_ACCOUNTABLE.orgId)},
      ${quoteLiveFixtureValue(VIEWER.personId)}, ${quoteLiveFixtureValue(weekStart)},
      ${quoteLiveFixtureValue(`${namespace} sentinel weekly update`)}, 'draft', ${quoteLiveFixtureValue(VIEWER.personId)})
    RETURNING id, xmin::text AS audit_fixture_xmin;
  `, {
    id: updateId,
    org_id: TASKS.VIEWER_ACCOUNTABLE.orgId,
    person_id: VIEWER.personId,
    week_start: weekStart,
    summary: `${namespace} sentinel weekly update`,
    status: 'draft',
    created_by: VIEWER.personId,
  })
  await insertSentinel(runtime.sql, runtime.ledgerPath, runtime.bindingSecret, ledger, 'ops.log_entries', logId, `
    INSERT INTO ops.log_entries (id, org_id, business_unit_id, origin, event_type, title, detail, created_by)
    VALUES (${quoteLiveFixtureValue(logId)}, ${quoteLiveFixtureValue(TASKS.VIEWER_ACCOUNTABLE.orgId)},
      ${quoteLiveFixtureValue(TASKS.VIEWER_ACCOUNTABLE.businessUnitId)}, 'manual', 'other',
      ${quoteLiveFixtureValue(`${namespace} sentinel log`)}, 'full-row sentinel detail', ${quoteLiveFixtureValue(VIEWER.personId)})
    RETURNING id, xmin::text AS audit_fixture_xmin;
  `, {
    id: logId,
    org_id: TASKS.VIEWER_ACCOUNTABLE.orgId,
    business_unit_id: TASKS.VIEWER_ACCOUNTABLE.businessUnitId,
    origin: 'manual',
    event_type: 'other',
    title: `${namespace} sentinel log`,
    detail: 'full-row sentinel detail',
    created_by: VIEWER.personId,
  })

  await defaultGlobalSetup()
}
