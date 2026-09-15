import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertAuditFixtureWritePolicy,
  auditOwnedReceivingFixture,
  type AuditFixtureReceipt,
} from './audit-fixtures.ts'
import {
  AuditProvisioner,
  assertAuditOwnedIdentity,
  createLocalAuditAuthClient,
  createLocalAuditSqlClient,
  type AuditProvisionerOptions,
  validateAuditFixtureReceipt,
} from './audit-provisioner.ts'

const candidateSha = 'a'.repeat(40)
const sessionId = 'a1b2c3d4'
const namespace = `design-audit-${sessionId}`
const bindingSecret = 'fixture-binding-secret-for-tests'

function definitions() {
  return {
    identities: [{
      fixture: 'AUDIT_RECEIVING_ONLY',
      email: `${namespace}.writer@example.test`,
      password: 'test-password',
    }],
    records: [{
      fixture: 'AUDIT_RECEIVING_ONLY',
      table: 'mos.tasks',
      id: `${sessionId}-0000-0000-0000-000000000001`,
      namespace,
      columns: {
        id: `${sessionId}-0000-0000-0000-000000000001`,
        title: `${namespace} owned`,
      },
    }],
    sentinels: [
      { table: 'mos.tasks', id: 'sentinel-task' },
      { table: 'mos.weekly_updates', id: 'sentinel-update' },
      { table: 'ops.log_entries', id: 'sentinel-log' },
    ],
  }
}

function store() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>([
    ['mos.tasks', new Map([['sentinel-task', { id: 'sentinel-task', title: 'keep task', body: 'full row' }]])],
    ['mos.weekly_updates', new Map([['sentinel-update', { id: 'sentinel-update', body: 'keep update', week: '2026-W37' }]])],
    ['ops.log_entries', new Map([['sentinel-log', { id: 'sentinel-log', detail: 'keep log', actor: 'audit-test' }]])],
  ])
  const sql = {
    async query(query: string): Promise<unknown[]> {
      const tableName = /from\s+([a-z_]+\.[a-z_]+)/i.exec(query)?.[1]
      const table = tableName ? tables.get(tableName) : undefined
      if (!table) return []
      const ids = query.match(/'[^']*'/g)?.map((value) => value.slice(1, -1)) ?? []
      const selectedId = /^select\s+([a-z_][a-z0-9_]*)\s+from/i.exec(query)?.[1]
      return ids.flatMap((id) => {
        const row = table.get(id)
        if (!row) return []
        return [selectedId ? { [selectedId]: row[selectedId] } : { ...row }]
      })
    },
    async execute(query: string): Promise<unknown> {
      const insert = /insert\s+into\s+([a-z_]+\.[a-z_]+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i.exec(query)
      if (insert) {
        const table = tables.get(insert[1]!)
        const columns = insert[2]!.split(',').map((value) => value.trim())
        const values = [...insert[3]!.matchAll(/'((?:''|[^'])*)'/g)].map((match) => match[1]!.replace(/''/g, "'"))
        const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]))
        if (table && typeof row.id === 'string') table.set(row.id, row)
        return [{ id: row.id }]
      }
      const deletion = /delete\s+from\s+([a-z_]+\.[a-z_]+)\s+where\s+[a-z_][a-z0-9_]*\s+in\s*\(([^)]+)\)/i.exec(query)
      if (deletion) {
        const table = tables.get(deletion[1]!)
        for (const value of deletion[2]!.match(/'[^']*'/g) ?? []) table?.delete(value.slice(1, -1))
      }
      return []
    },
  }
  const authUsers = new Map<string, { id: string; email: string }>()
  let nextId = 2
  const auth = {
    async createUser(input: { email: string; password: string; email_confirm: boolean }) {
      if ([...authUsers.values()].some((user) => user.email.toLowerCase() === input.email.toLowerCase())) {
        return { error: { message: 'user already exists' } }
      }
      const id = `${sessionId}-0000-0000-0000-00000000000${nextId++}`
      authUsers.set(id, { id, email: input.email })
      return { data: { user: { id } } }
    },
    async deleteUser(id: string) {
      authUsers.delete(id)
      return {}
    },
    async listUsers() { return [...authUsers.values()] },
  }
  return { tables, authUsers, sql, auth }
}

async function provision(overrides: Partial<AuditProvisionerOptions> = {}) {
  const fixtureStore = store()
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: definitions(),
    sql: fixtureStore.sql,
    auth: fixtureStore.auth,
    ...overrides,
  })
  return { fixtureStore, provisioner, receipt: await provisioner.provision() }
}

test('write policy requires ownership declared for the named fixture', async () => {
  const { receipt } = await provision()

  assert.doesNotThrow(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId,
    candidateSha,
    bindingSecret,
    receipt,
    writes: true,
  }))
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'BAR_MEMBER',
    sessionId,
    candidateSha,
    bindingSecret,
    receipt,
    writes: true,
  }), /fixture|ownership/i)
})

test('identity names must start with the exact session namespace', () => {
  assert.doesNotThrow(() => assertAuditOwnedIdentity(`${namespace}.writer@example.test`, namespace))
  assert.throws(() => assertAuditOwnedIdentity(`shared-${namespace}.writer@example.test`, namespace), /namespace|identity/i)
  assert.throws(() => assertAuditOwnedIdentity(`writer.${namespace}@example.test`, namespace), /namespace|identity/i)
})

test('the receiving-only login resolves only its provisioned named identity', () => {
  assert.deepEqual(auditOwnedReceivingFixture(sessionId, definitions().identities[0]), {
    email: `${namespace}.writer@example.test`,
    password: 'test-password',
    owned: true,
  })
  assert.throws(() => auditOwnedReceivingFixture(sessionId), /provisioned named identity/)
  assert.throws(() => auditOwnedReceivingFixture(sessionId, {
    fixture: 'BAR_MEMBER',
    email: `${namespace}.other@example.test`,
    password: 'test-password',
  }), /provisioned named identity/)
})

test('pre-existing database IDs and auth emails are never adopted for cleanup', async () => {
  const fixtureStore = store()
  const taskId = `${sessionId}-0000-0000-0000-000000000001`
  fixtureStore.tables.get('mos.tasks')!.set(taskId, { id: taskId, title: 'pre-existing' })
  const existingEmail = `${namespace}.writer@example.test`
  const existingId = `${sessionId}-0000-0000-0000-000000000099`
  fixtureStore.authUsers.set(existingId, { id: existingId, email: existingEmail })
  let createCalls = 0
  fixtureStore.auth.createUser = async () => {
    createCalls += 1
    return { error: { message: 'user already exists' } }
  }

  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: definitions(),
    sql: fixtureStore.sql,
    auth: fixtureStore.auth,
  })
  await assert.rejects(() => provisioner.provision(), /already present|collision|absence/i)
  assert.equal(createCalls, 0)
  assert.equal(fixtureStore.tables.get('mos.tasks')!.has(taskId), true)
  assert.equal(fixtureStore.authUsers.has(existingId), true)
})

test('an auth create error never adopts or deletes a concurrently-created same-email user', async () => {
  const fixtureStore = store()
  const concurrentId = `${sessionId}-0000-0000-0000-000000000099`
  fixtureStore.auth.createUser = async (input) => {
    fixtureStore.authUsers.set(concurrentId, { id: concurrentId, email: input.email })
    return { error: { message: 'user already exists' } }
  }
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: definitions(),
    sql: fixtureStore.sql,
    auth: fixtureStore.auth,
  })

  await assert.rejects(() => provisioner.provision(), /user already exists/)
  assert.equal(fixtureStore.authUsers.has(concurrentId), true)
})

test('INSERT RETURNING must contain the exact intended primary key', async () => {
  const fixtureStore = store()
  const sql = {
    ...fixtureStore.sql,
    execute: async (query: string) => /^insert\s/i.test(query)
      ? [{ id: `${sessionId}-0000-0000-0000-000000000099` }]
      : fixtureStore.sql.execute(query),
  }
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: definitions(),
    sql,
    auth: fixtureStore.auth,
  })
  await assert.rejects(() => provisioner.provision(), /RETURNING|primary key|mismatch/i)
  assert.equal(fixtureStore.tables.get('mos.tasks')!.has(`${sessionId}-0000-0000-0000-000000000001`), false)
})

test('sentinel snapshots hash full default rows and reject projection-only custom queries', async () => {
  const fixtureStore = store()
  const first = await provision({ sql: fixtureStore.sql, auth: fixtureStore.auth })
  fixtureStore.tables.get('mos.tasks')!.get('sentinel-task')!.title = 'changed after snapshot'
  const after = await first.provisioner.cleanup()
  assert.equal(after.unrelatedSentinelsPreserved, false)

  assert.throws(() => new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    sql: fixtureStore.sql,
    definitions: { sentinels: [{ table: 'mos.tasks', id: 'sentinel-task', query: "SELECT id FROM mos.tasks WHERE id IN ('sentinel-task');" }] },
  }), /full row|SELECT \*/i)
})

test('auth delete treats an absent user and HTTP 404 as idempotent success', async () => {
  const fixtureStore = store()
  let deleteCalls = 0
  fixtureStore.auth.deleteUser = async (id: string) => {
    deleteCalls += 1
    fixtureStore.authUsers.delete(id)
    return { error: { status: 404, message: 'HTTP 404' } }
  }
  const { provisioner } = await provision({ sql: fixtureStore.sql, auth: fixtureStore.auth })
  const receipt = await provisioner.cleanup()
  assert.equal(deleteCalls, 1)
  assert.equal(receipt.cleanupOnFailure.completed, true)
})

test('a locally edited ownership ledger cannot redirect auth deletion', async () => {
  const fixtureStore = store()
  const first = await provision({ sql: fixtureStore.sql, auth: fixtureStore.auth })
  const targetId = `${sessionId}-0000-0000-0000-000000000098`
  const targetEmail = `${namespace}.target@example.test`
  fixtureStore.authUsers.set(targetId, { id: targetId, email: targetEmail })
  const tampered = structuredClone(first.receipt) as AuditFixtureReceipt
  tampered.ownedAuthUsers[0] = { ...tampered.ownedAuthUsers[0]!, id: targetId, email: targetEmail }
  tampered.ownedAuthUserIds = [targetId]
  assert.throws(() => new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    sql: fixtureStore.sql,
    auth: fixtureStore.auth,
  }).seedReceipt(tampered), /binding|signature|integrity/i)
  assert.equal(fixtureStore.authUsers.has(targetId), true)
})

test('cleaned receipt counts cannot claim zero deletion for an inserted record', async () => {
  const { receipt } = await provision()
  const impossible = {
    ...receipt,
    ownedAuthUsers: [],
    ownedAuthUserIds: [],
    remainingAuthUserIds: [],
    cleanup: [{ table: 'mos.tasks', deleted: 0, remaining: 0 }],
    cleanupOnFailure: { attempted: true, completed: true },
  }
  const validation = validateAuditFixtureReceipt(impossible, { candidateSha, sessionId })
  assert.equal(validation.ok, false)
  assert.match(validation.errors.join('\n'), /insertion|cleanup count|lifecycle/i)
})

test('local SQL and auth requests reject oversized response bodies and redact response details', async () => {
  const previousFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'password=do-not-leak' }), {
      status: 500,
      headers: { 'content-length': '100000000' },
    })
    await assert.rejects(createLocalAuditSqlClient('http://127.0.0.1:44321', 'test-key').query('SELECT 1'), /response|body|SQL failed/i)
    await assert.rejects(createLocalAuditAuthClient('http://127.0.0.1:44321', 'test-key').listUsers!(), /response|body|listing/i)
    await assert.rejects(createLocalAuditSqlClient('http://127.0.0.1:44321', 'test-key').query('SELECT password'), (error: Error) => {
      assert.doesNotMatch(error.message, /do-not-leak|password=/i)
      return true
    })
  } finally {
    globalThis.fetch = previousFetch
  }
})
