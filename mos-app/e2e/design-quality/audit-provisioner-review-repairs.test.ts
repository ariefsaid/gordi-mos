import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import test from 'node:test'
import os from 'node:os'
import path from 'node:path'

import {
  assertAuditFixtureWritePolicy,
  auditOwnedReceivingFixture,
  type AuditFixtureReceipt,
} from './audit-fixtures.ts'
import {
  AuditProvisioner,
  assertAuditOwnedIdentity,
  auditFixtureSentinelLedgerBinding,
  cleanupAuditFixtureReceipt,
  cleanupAuditFixtureSentinelLedger,
  createLocalAuditAuthClient,
  createLocalAuditSqlClient,
  auditFixtureValuesEqual,
  writeAuditFixtureSentinelLedger,
  type AuditFixtureAuthClient,
  type AuditFixtureSentinelLedger,
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
  const versions = new Map<string, Map<string, string>>([
    ['mos.tasks', new Map()],
    ['mos.weekly_updates', new Map()],
    ['ops.log_entries', new Map()],
  ])
  let nextVersion = 100
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
        const selected = selectedId ? { [selectedId]: row[selectedId] } : { ...row }
        return query.includes('audit_fixture_xmin')
          ? [{ ...selected, audit_fixture_xmin: versions.get(tableName!)?.get(id) }]
          : [selected]
      })
    },
    async execute(query: string): Promise<unknown> {
      const insert = /insert\s+into\s+([a-z_]+\.[a-z_]+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/i.exec(query)
      if (insert) {
        const table = tables.get(insert[1]!)
        const columns = insert[2]!.split(',').map((value) => value.trim())
        const values = [...insert[3]!.matchAll(/'((?:''|[^'])*)'/g)].map((match) => match[1]!.replace(/''/g, "'"))
        const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]))
        const version = String(nextVersion++)
        if (table && typeof row.id === 'string') {
          table.set(row.id, row)
          versions.get(insert[1]!)?.set(row.id, version)
        }
        return [{ id: row.id, audit_fixture_xmin: version }]
      }
      const deletion = /delete\s+from\s+([a-z_]+\.[a-z_]+)\s+where\s+([\s\S]*?);?$/i.exec(query.trim())
      if (deletion) {
        const tableName = deletion[1]!
        const table = tables.get(tableName)
        const versionMatch = /xmin::text\s*=\s*'((?:''|[^'])*)'/i.exec(deletion[2]!)
        const predicates = [...deletion[2]!.matchAll(/\b([a-z_][a-z0-9_]*)\s*=\s*'((?:''|[^'])*)'/gi)]
          .filter((match) => !deletion[2]!.slice(0, match.index).match(/xmin::$/i))
          .map((match) => [match[1]!, match[2]!.replace(/''/g, "'")] as const)
        for (const [id, row] of table ?? []) {
          const sameVersion = !versionMatch || versions.get(tableName)?.get(id) === versionMatch[1]!.replace(/''/g, "'")
          const sameOwnership = predicates.every(([column, value]) => String(row[column]) === value)
          if (sameVersion && sameOwnership) {
            table?.delete(id)
            versions.get(tableName)?.delete(id)
          }
        }
      }
      return []
    },
  }
  const authUsers = new Map<string, { id: string; email: string; userMetadata?: Record<string, unknown> }>()
  let nextId = 2
  const auth: AuditFixtureAuthClient = {
    async createUser(input: { email: string; password: string; email_confirm: boolean; user_metadata: Record<string, unknown> }) {
      if ([...authUsers.values()].some((user) => user.email.toLowerCase() === input.email.toLowerCase())) {
        return { error: { message: 'user already exists' } }
      }
      const id = `${sessionId}-0000-0000-0000-00000000000${nextId++}`
      authUsers.set(id, { id, email: input.email, userMetadata: input.user_metadata })
      return { data: { user: { id } } }
    },
    async deleteUser(id: string) {
      authUsers.delete(id)
      return {}
    },
    async listUsers() { return [...authUsers.values()] },
  }
  return { tables, versions, authUsers, sql, auth }
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

test('a missing auth create ID never adopts a same-email user without the random ownership token', async () => {
  const fixtureStore = store()
  const concurrentId = `${sessionId}-0000-0000-0000-000000000099`
  fixtureStore.auth.createUser = async (input) => {
    fixtureStore.authUsers.set(concurrentId, { id: concurrentId, email: input.email })
    return { data: { user: {} } }
  }
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: definitions(),
    sql: fixtureStore.sql,
    auth: fixtureStore.auth,
  })

  await assert.rejects(() => provisioner.provision(), /ownership token|cleanup failed/i)
  assert.equal(fixtureStore.authUsers.has(concurrentId), true)
})

test('a planned row receipt is reconciled after an interrupted write commits', async () => {
  const fixtureStore = store()
  const recordDefinitions = { records: definitions().records, sentinels: definitions().sentinels }
  let plannedReceipt: AuditFixtureReceipt | undefined
  const first = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: recordDefinitions,
    sql: fixtureStore.sql,
    onReceipt: (receipt) => {
      if (receipt.created.some((group) => group.lifecycle.includes('planned'))) {
        plannedReceipt = structuredClone(receipt)
        throw new Error('simulate process interruption before response')
      }
    },
  })
  await assert.rejects(() => first.provision(), /interruption/)
  assert.ok(plannedReceipt)
  const owned = recordDefinitions.records[0]!
  fixtureStore.tables.get(owned.table)!.set(owned.id!, { ...owned.columns })
  fixtureStore.versions.get(owned.table)!.set(owned.id!, '776')

  const cleaned = await cleanupAuditFixtureReceipt(plannedReceipt, {
    candidateSha,
    sessionId,
    bindingSecret,
    sql: fixtureStore.sql,
    onFailure: true,
  })
  assert.equal(fixtureStore.tables.get(owned.table)!.has(owned.id!), false)
  assert.equal(validateAuditFixtureReceipt(cleaned, { candidateSha, sessionId, bindingSecret }).ok, true)
})

test('a planned write proven absent is not reported as a deletion', async () => {
  const fixtureStore = store()
  const receipts: AuditFixtureReceipt[] = []
  let interrupted = false
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: { records: definitions().records, sentinels: definitions().sentinels },
    sql: fixtureStore.sql,
    onReceipt: (receipt) => {
      receipts.push(structuredClone(receipt))
      if (!interrupted && receipt.created.some((group) => group.lifecycle.includes('planned'))) {
        interrupted = true
        throw new Error('stop before INSERT')
      }
    },
  })

  await assert.rejects(() => provisioner.provision(), /stop before INSERT/)
  const cleaned = receipts.at(-1)
  assert.ok(cleaned)
  assert.deepEqual(cleaned.created[0]?.lifecycle, ['absent'])
  assert.deepEqual(cleaned.cleanup, [{ table: 'mos.tasks', deleted: 0, absent: 1, remaining: 0 }])
  assert.equal(validateAuditFixtureReceipt(cleaned, { candidateSha, sessionId, bindingSecret }).ok, true)
})

test('a planned database write waits for late commit reconciliation before declaring absence', async () => {
  const fixtureStore = store()
  const owned = definitions().records[0]!
  const waits: number[] = []
  let interrupted = false
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: { records: definitions().records, sentinels: definitions().sentinels },
    sql: fixtureStore.sql,
    reconciliationWaitMs: 5,
    wait: async (milliseconds) => {
      waits.push(milliseconds)
      fixtureStore.tables.get(owned.table)!.set(owned.id!, { ...owned.columns })
      fixtureStore.versions.get(owned.table)!.set(owned.id!, '777')
    },
    onReceipt: (receipt) => {
      if (!interrupted && receipt.created.some((group) => group.lifecycle.includes('planned'))) {
        interrupted = true
        throw new Error('stop before late commit')
      }
    },
  })

  await assert.rejects(() => provisioner.provision(), /stop before late commit/)
  assert.deepEqual(waits, [5])
  assert.equal(fixtureStore.tables.get(owned.table)!.has(owned.id!), false)
})

test('a planned auth write waits for late commit reconciliation before declaring absence', async () => {
  const fixtureStore = store()
  const identity = definitions().identities[0]!
  const waits: number[] = []
  let interrupted = false
  let plannedOwner: AuditFixtureReceipt['ownedAuthUsers'][number] | undefined
  const lateUserId = `${sessionId}-0000-0000-0000-000000000099`
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: { identities: definitions().identities, sentinels: definitions().sentinels },
    sql: fixtureStore.sql,
    auth: fixtureStore.auth,
    reconciliationWaitMs: 5,
    wait: async (milliseconds) => {
      waits.push(milliseconds)
      assert.ok(plannedOwner)
      fixtureStore.authUsers.set(lateUserId, {
        id: lateUserId,
        email: identity.email,
        userMetadata: {
          audit_fixture_namespace: namespace,
          audit_fixture_token: plannedOwner!.ownershipToken,
        },
      })
    },
    onReceipt: (receipt) => {
      const owner = receipt.ownedAuthUsers.find((entry) => entry.lifecycle === 'planned')
      if (!interrupted && owner) {
        interrupted = true
        plannedOwner = structuredClone(owner)
        throw new Error('stop before late auth commit')
      }
    },
  })

  await assert.rejects(() => provisioner.provision(), /stop before late auth commit/)
  assert.deepEqual(waits, [5])
  assert.equal(fixtureStore.authUsers.has(lateUserId), false)
})

test('ownership equality compares nested values canonically', () => {
  const left = {
    id: `${sessionId}-0000-0000-0000-000000000001`,
    metadata: { z: [{ b: 2, a: 1 }], a: true },
    labels: ['one', 'two'],
  }
  const same = {
    labels: ['one', 'two'],
    metadata: { a: true, z: [{ a: 1, b: 2 }] },
    id: `${sessionId}-0000-0000-0000-000000000001`,
  }
  const changed = {
    ...same,
    metadata: { ...same.metadata, z: [{ a: 1, b: 3 }] },
  }

  assert.equal(auditFixtureValuesEqual(left, same), true)
  assert.equal(auditFixtureValuesEqual(left, changed), false)
})

test('cleanup rejects a same-value replacement with a new row version', async () => {
  const fixtureStore = store()
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: { records: definitions().records, sentinels: definitions().sentinels },
    sql: fixtureStore.sql,
  })
  await provisioner.provision()
  const owned = definitions().records[0]!
  fixtureStore.tables.get(owned.table)!.set(owned.id!, { ...owned.columns })
  fixtureStore.versions.get(owned.table)!.set(owned.id!, '999')

  await assert.rejects(() => provisioner.cleanup(), /version|ownership/i)
  assert.deepEqual(fixtureStore.tables.get(owned.table)!.get(owned.id!), owned.columns)
})

test('durable sentinel ledger recovers a version and deletes only its exact row', async () => {
  const fixtureStore = store()
  const id = `${sessionId}-0000-0000-0000-000000000101`
  const ownership = { id, title: `${namespace} durable sentinel` }
  fixtureStore.tables.get('mos.tasks')!.set(id, { ...ownership, metadata: { source: 'audit' } })
  fixtureStore.versions.get('mos.tasks')!.set(id, '701')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mos-audit-sentinel-ledger-'))
  const ledgerPath = path.join(directory, 'sentinel-ledger.json')
  const ledger: AuditFixtureSentinelLedger = {
    candidateSha,
    sessionId,
    namespace,
    intents: [{ table: 'mos.tasks', id, ownership }],
    binding: '',
  }
  const deleteQueries: string[] = []
  const sql = {
    ...fixtureStore.sql,
    async execute(query: string) {
      if (/^DELETE\s/i.test(query)) deleteQueries.push(query)
      return fixtureStore.sql.execute(query)
    },
  }

  try {
    await writeAuditFixtureSentinelLedger(ledgerPath, ledger, bindingSecret)
    const stored = JSON.parse(await readFile(ledgerPath, 'utf8')) as AuditFixtureSentinelLedger
    assert.equal(stored.binding, auditFixtureSentinelLedgerBinding(stored, bindingSecret))

    await assert.rejects(() => cleanupAuditFixtureSentinelLedger(ledgerPath, {
      candidateSha,
      sessionId,
      bindingSecret: 'wrong-binding-secret',
      sql,
    }), /binding/i)
    assert.equal(fixtureStore.tables.get('mos.tasks')!.has(id), true)

    await cleanupAuditFixtureSentinelLedger(ledgerPath, {
      candidateSha,
      sessionId,
      bindingSecret,
      sql,
    })
    assert.equal(fixtureStore.tables.get('mos.tasks')!.has(id), false)
    assert.match(deleteQueries.join('\n'), /xmin::text\s*=\s*'701'/i)
    await assert.rejects(() => readFile(ledgerPath, 'utf8'), /ENOENT/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('durable sentinel cleanup resumes all intents after a lost DELETE response', async () => {
  const fixtureStore = store()
  const firstId = `${sessionId}-0000-0000-0000-000000000102`
  const secondId = `${sessionId}-0000-0000-0000-000000000103`
  const firstOwnership = { id: firstId, title: `${namespace} first durable sentinel` }
  const secondOwnership = { id: secondId, title: `${namespace} second durable sentinel` }
  fixtureStore.tables.get('mos.tasks')!.set(firstId, firstOwnership)
  fixtureStore.tables.get('mos.tasks')!.set(secondId, secondOwnership)
  fixtureStore.versions.get('mos.tasks')!.set(firstId, '702')
  fixtureStore.versions.get('mos.tasks')!.set(secondId, '703')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mos-audit-sentinel-ledger-retry-'))
  const ledgerPath = path.join(directory, 'sentinel-ledger.json')
  const ledger: AuditFixtureSentinelLedger = {
    candidateSha,
    sessionId,
    namespace,
    intents: [
      { table: 'mos.tasks', id: firstId, ownership: firstOwnership, version: '702' },
      { table: 'mos.tasks', id: secondId, ownership: secondOwnership, version: '703' },
    ],
    binding: '',
  }
  let loseResponse = true
  const sql = {
    ...fixtureStore.sql,
    async execute(query: string) {
      const result = await fixtureStore.sql.execute(query)
      if (loseResponse && /^DELETE\s/i.test(query)) {
        loseResponse = false
        throw new Error('lost committed sentinel DELETE response')
      }
      return result
    },
  }

  try {
    await writeAuditFixtureSentinelLedger(ledgerPath, ledger, bindingSecret)
    await assert.rejects(() => cleanupAuditFixtureSentinelLedger(ledgerPath, {
      candidateSha,
      sessionId,
      bindingSecret,
      sql,
    }), /lost committed sentinel DELETE response/)
    assert.equal(fixtureStore.tables.get('mos.tasks')!.has(secondId), false)
    assert.equal(fixtureStore.tables.get('mos.tasks')!.has(firstId), true)

    await cleanupAuditFixtureSentinelLedger(ledgerPath, {
      candidateSha,
      sessionId,
      bindingSecret,
      sql,
    })
    assert.equal(fixtureStore.tables.get('mos.tasks')!.has(firstId), false)
    assert.equal(fixtureStore.tables.get('mos.tasks')!.has(secondId), false)
    await assert.rejects(() => readFile(ledgerPath, 'utf8'), /ENOENT/)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('cleanup fails closed when a captured ID now belongs to a different row', async () => {
  const fixtureStore = store()
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: { records: definitions().records, sentinels: definitions().sentinels },
    sql: fixtureStore.sql,
  })
  await provisioner.provision()
  const owned = definitions().records[0]!
  fixtureStore.tables.get(owned.table)!.set(owned.id!, { id: owned.id, title: 'replacement row' })

  await assert.rejects(() => provisioner.cleanup(), /ownership mismatch/i)
  assert.equal(fixtureStore.tables.get(owned.table)!.get(owned.id!)?.title, 'replacement row')
})

test('cleanup retry converges after a DELETE commits but its response is lost', async () => {
  const fixtureStore = store()
  let loseDeleteResponse = true
  const sql = {
    ...fixtureStore.sql,
    async execute(query: string) {
      const result = await fixtureStore.sql.execute(query)
      if (/^DELETE\s/i.test(query) && loseDeleteResponse) {
        loseDeleteResponse = false
        throw new Error('lost committed DELETE response')
      }
      return result
    },
  }
  let persisted: AuditFixtureReceipt | undefined
  const provisioner = new AuditProvisioner({
    candidateSha,
    sessionId,
    bindingSecret,
    definitions: { records: definitions().records, sentinels: definitions().sentinels },
    sql,
    onReceipt: (receipt) => { persisted = structuredClone(receipt) },
  })
  await provisioner.provision()
  await assert.rejects(() => provisioner.cleanup(), /lost committed DELETE response/)
  assert.ok(persisted)

  const cleaned = await cleanupAuditFixtureReceipt(persisted, {
    candidateSha,
    sessionId,
    bindingSecret,
    sql,
    onFailure: true,
  })
  assert.equal(validateAuditFixtureReceipt(cleaned, { candidateSha, sessionId, bindingSecret }).ok, true)
  assert.deepEqual(cleaned.cleanup, [{ table: 'mos.tasks', deleted: 1, remaining: 0 }])
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
