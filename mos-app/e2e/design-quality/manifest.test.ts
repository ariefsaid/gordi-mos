import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DESIGN_QUALITY_MANIFEST,
  manifestForArtifact,
  REQUIRED_DIMENSIONS,
  REQUIRED_RULE_FIELDS,
  validateManifest,
  validateManifestReadiness,
} from './manifest.ts'
import {
  REQUIRED_ARTIFACTS,
  ReportWriter,
  meaningfulCsv,
  validateMockupStatus,
  validateArtifactSet,
} from './report.ts'
import { MUTATION_FIXTURES, evaluateMutationFixture, parseCssColor } from './measurements.ts'
import {
  assertAuditFixtureWritePolicy,
  type AuditFixtureReceipt,
} from './audit-fixtures.ts'
import {
  AuditProvisioner,
  assertAuditOwnedCleanupSql,
  auditFixtureReceiptBinding,
  cleanupAuditFixtureReceipt,
  createLocalAuditAuthClient,
  createLocalAuditSqlClient,
  emptyAuditFixtureReceipt,
  validateAuditFixtureReceipt,
  validateAuditFixtureProvisionedReceipt,
} from './audit-provisioner.ts'
import { resetAuditScroll } from './scroll.ts'

const testBindingSecret = 'fixture-binding-secret-for-manifest-tests'

test('the design manifest covers every required dimension and declares complete rules', () => {
  const result = validateManifest(DESIGN_QUALITY_MANIFEST)

  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(Object.keys(DESIGN_QUALITY_MANIFEST.dimensions), REQUIRED_DIMENSIONS)
  for (const rule of DESIGN_QUALITY_MANIFEST.rules) {
    for (const field of REQUIRED_RULE_FIELDS) {
      assert.ok(rule[field], `${rule.id} is missing ${field}`)
    }
  }
})

test('a required blocked or untested cell fails readiness while authority-backed not-applicable passes', () => {
  const baseline = structuredClone(DESIGN_QUALITY_MANIFEST)
  baseline.cells = baseline.cells.map((cell) => ({
    ...cell,
    status: 'not-applicable',
    authority: 'DD-MVP-12',
  }))

  const blocked = structuredClone(baseline)
  blocked.cells[0]!.status = 'blocked'
  blocked.cells[0]!.note = 'fixture intentionally unavailable'
  const blockedResult = validateManifestReadiness(blocked)
  assert.equal(blockedResult.ok, false)
  assert.match(blockedResult.errors.join('\n'), /blocked/i)

  const untested = structuredClone(baseline)
  untested.cells[0]!.status = 'untested'
  untested.cells[0]!.note = 'state setup intentionally absent'
  const untestedResult = validateManifestReadiness(untested)
  assert.equal(untestedResult.ok, false)
  assert.match(untestedResult.errors.join('\n'), /untested/i)

  const notApplicableResult = validateManifestReadiness(baseline)
  assert.equal(notApplicableResult.ok, true, notApplicableResult.errors.join('\n'))
})

test('the report writer emits stable, candidate-bound JSON and CSV artifacts', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-design-quality-'))
  const writer = new ReportWriter({
    outputDir,
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
  })

  await writer.writeJson('manifest.json', { cells: [] })
  await writer.writeCsv('geometry.csv', [
    { route: '/mos/work/tasks', width: '390', overflow: '0' },
  ])
  const validation = await validateArtifactSet(outputDir, {
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
  })

  assert.equal(validation.ok, false)
  assert.ok(REQUIRED_ARTIFACTS.some((name) => validation.missing.includes(name)))

  const manifest = JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8')) as Record<string, unknown>
  assert.equal(manifest.candidateSha, 'a'.repeat(40))
  assert.equal(manifest.sessionId, 'a1b2c3d4')
  assert.match(await readFile(path.join(outputDir, 'geometry.csv'), 'utf8'), /^# candidate_sha=a{40}\n# session_id=a1b2c3d4\n/)
})

test('gate log status updates preserve scanner evidence and replace pending values', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-design-quality-gate-'))
  const writer = new ReportWriter({
    outputDir,
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
  })

  await writer.writeGateLog([
    'browser_status=pending',
    'fixture_status=pending',
    'chain_status=pending',
    'axe_version=4.10.3',
    'axe_findings=0',
  ])
  await writer.writeGateLog(['browser_status=0', 'fixture_status=0', 'chain_status=not-run'])

  const log = await readFile(path.join(outputDir, 'gate-log.txt'), 'utf8')
  assert.match(log, /^# candidate_sha=a{40}\n# session_id=a1b2c3d4\n/)
  assert.match(log, /^axe_version=4\.10\.3$/m)
  assert.match(log, /^axe_findings=0$/m)
  assert.match(log, /^browser_status=0$/m)
  assert.match(log, /^fixture_status=0$/m)
  assert.match(log, /^chain_status=not-run$/m)
  assert.doesNotMatch(log, /pending/)
})

test('CSV evidence accepts product copy containing pending or placeholder', () => {
  const csv = [
    `# candidate_sha=${'a'.repeat(40)}`,
    '# session_id=a1b2c3d4',
    'route,copy',
    '/mos/cafe,Pending review on Submit',
    '/mos/work/tasks,Placeholder shown in training copy',
  ].join('\n')

  assert.deepEqual(meaningfulCsv('copy-census.csv', csv), { ok: true })
})

test('change-gate mockup gaps accept measured mismatches but reject blocked comparisons', () => {
  assert.equal(validateMockupStatus({
    status: 'assessed-with-gaps',
    comparisons: [{ status: 'fail', score: 0.7, build: '/tmp/render.png', missingRegions: [], contradictedRegions: [] }],
  }, true).ok, true)

  const blocked = validateMockupStatus({
    status: 'assessed-with-gaps',
    comparisons: [{ status: 'blocked', score: null, build: '', missingRegions: [], contradictedRegions: [] }],
  }, true)
  assert.equal(blocked.ok, false)
  assert.match(blocked.reason ?? '', /blocked|completed/i)

  const allPass = validateMockupStatus({
    status: 'assessed-with-gaps',
    comparisons: [{ status: 'pass', score: 0.92, build: '/tmp/render.png', missingRegions: [], contradictedRegions: [] }],
  }, true)
  assert.equal(allPass.ok, false)
  assert.match(allPass.reason ?? '', /below the 0\.75 threshold/i)

  const regionOnlyFailure = validateMockupStatus({
    status: 'assessed-with-gaps',
    comparisons: [{ status: 'fail', score: 0.92, build: '/tmp/render.png', missingRegions: ['toolbar'], contradictedRegions: [] }],
  }, true)
  assert.equal(regionOnlyFailure.ok, false)
  assert.match(regionOnlyFailure.reason ?? '', /below the 0\.75 threshold/i)

  const mixedFalsePass = validateMockupStatus({
    status: 'assessed-with-gaps',
    comparisons: [
      { status: 'fail', score: 0.7, build: '/tmp/render-a.png', missingRegions: [], contradictedRegions: [] },
      { status: 'pass', score: 0.1, build: '/tmp/render-b.png', missingRegions: [], contradictedRegions: [] },
    ],
  }, true)
  assert.equal(mixedFalsePass.ok, false)
  assert.match(mixedFalsePass.reason ?? '', /every pass comparison must meet the 0\.75 score and region contract/i)

  const falsePass = validateMockupStatus({
    status: 'pass',
    comparisons: [{ status: 'pass', score: 0.7, build: '/tmp/render.png', missingRegions: [], contradictedRegions: [] }],
  }, false)
  assert.equal(falsePass.ok, false)
  assert.match(falsePass.reason ?? '', /0\.75 score and region contract/i)
})

test('manifestForArtifact binds the shared manifest to the runner metadata', () => {
  const artifact = manifestForArtifact('a'.repeat(40), 'a1b2c3d4')
  assert.equal(artifact.candidateSha, 'a'.repeat(40))
  assert.equal(artifact.sessionId, 'a1b2c3d4')
  assert.equal(artifact.cells.length, DESIGN_QUALITY_MANIFEST.cells.length)
})

test('each planted fixture defect makes its owning rule fail with the expected rule id', () => {
  const expectedRules = [
    'contrast.body',
    'touch.phone-target',
    'geometry.horizontal-fit',
    'actions.primary',
    'structure.nested-cards',
    'structure.heading-outline',
    'a11y.accessible-name',
  ]
  assert.deepEqual(MUTATION_FIXTURES.map((fixture) => fixture.ruleId), expectedRules)
  for (const fixture of MUTATION_FIXTURES) {
    const result = evaluateMutationFixture(fixture)
    assert.equal(result.ruleId, fixture.ruleId)
    assert.equal(result.passed, false, `${fixture.ruleId} mutation was not detected`)
  }
})

test('computed CSS colors include modern sRGB and Display-P3 syntax', () => {
  assert.deepEqual(parseCssColor('color(srgb 0.2 0.4 0.6)'), [51, 102, 153])
  const displayP3 = parseCssColor('color(display-p3 0.145 0.141 0.133)')
  assert.ok(displayP3)
  assert.ok(displayP3.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255))
})

test('write-state audit cells require a provisioned receipt bound to the candidate and session', () => {
  const candidateSha = 'a'.repeat(40)
  const receipt: AuditFixtureReceipt = {
    candidateSha,
    sessionId: 'a1b2c3d4',
    namespace: 'design-audit-a1b2c3d4',
    created: [{ table: 'mos.tasks', ids: ['a1b2c3d4-0000-0000-0000-000000000001'], fixture: 'AUDIT_RECEIVING_ONLY', lifecycle: ['created'] }],
    cleanup: [],
    unrelatedSentinelsPreserved: true,
    binding: '',
    sentinels: [
      { table: 'mos.tasks', id: 'sentinel-task', beforeHash: 'a'.repeat(64), afterHash: 'a'.repeat(64), beforePresent: true, afterPresent: true },
      { table: 'mos.weekly_updates', id: 'sentinel-update', beforeHash: 'b'.repeat(64), afterHash: 'b'.repeat(64), beforePresent: true, afterPresent: true },
      { table: 'ops.log_entries', id: 'sentinel-log', beforeHash: 'c'.repeat(64), afterHash: 'c'.repeat(64), beforePresent: true, afterPresent: true },
    ],
    ownedDatabaseIds: [{ table: 'mos.tasks', ids: ['a1b2c3d4-0000-0000-0000-000000000001'], fixture: 'AUDIT_RECEIVING_ONLY', lifecycle: ['created'] }],
    ownedAuthUsers: [],
    ownedAuthUserIds: [],
    remainingAuthUserIds: [],
    cleanupOnFailure: { attempted: false, completed: false },
  }
  receipt.binding = auditFixtureReceiptBinding(receipt, testBindingSecret)

  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha,
    writes: true,
  }), /receipt/i)
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha: 'b'.repeat(40),
    bindingSecret: testBindingSecret,
    receipt,
    writes: true,
  }), /candidate SHA/i)
  assert.doesNotThrow(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha,
    bindingSecret: testBindingSecret,
    receipt,
    writes: true,
  }))
  assert.equal(validateAuditFixtureProvisionedReceipt(receipt, { candidateSha, sessionId: 'a1b2c3d4' }).ok, true)
  assert.equal(validateAuditFixtureReceipt(receipt, { candidateSha, sessionId: 'a1b2c3d4' }).ok, false)
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha,
    bindingSecret: testBindingSecret,
    receipt: { ...receipt, sentinels: [] },
    writes: true,
  }), /sentinel/i)
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha,
    bindingSecret: testBindingSecret,
    receipt: { ...receipt, cleanup: [{ table: 'mos.tasks', deleted: 1, remaining: 0 }], cleanupOnFailure: { attempted: false, completed: true } },
    writes: true,
  }), /live|cleaned|provisioned/i)
})

test('every write-state fixture must prove at least one audit-owned identity or record', () => {
  const receipt = emptyAuditFixtureReceipt('a'.repeat(40), 'a1b2c3d4')
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha: 'a'.repeat(40),
    bindingSecret: testBindingSecret,
    receipt,
    writes: true,
  }), /audit-owned records|ownership/i)
})

test('audit write receipts reject created identities or records outside the session namespace', () => {
  const receipt: AuditFixtureReceipt = {
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    namespace: 'design-audit-another-run',
    created: [{ table: 'mos.tasks', ids: ['a1b2c3d4-0000-0000-0000-000000000001'], fixture: 'AUDIT_RECEIVING_ONLY', lifecycle: ['created'] }],
    cleanup: [{ table: 'mos.tasks', deleted: 1, remaining: 0 }],
    unrelatedSentinelsPreserved: true,
    binding: '',
    sentinels: [],
    ownedDatabaseIds: [{ table: 'mos.tasks', ids: ['a1b2c3d4-0000-0000-0000-000000000001'], fixture: 'AUDIT_RECEIVING_ONLY', lifecycle: ['created'] }],
    ownedAuthUsers: [],
    ownedAuthUserIds: [],
    remainingAuthUserIds: [],
    cleanupOnFailure: { attempted: false, completed: true },
  }
  receipt.binding = auditFixtureReceiptBinding(receipt, testBindingSecret)

  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha: 'a'.repeat(40),
    bindingSecret: testBindingSecret,
    receipt,
    writes: true,
}), /namespace/i)
})

test('audit fixture records require inspectable namespaced columns and keep sentinels read-only', () => {
  const namespace = 'design-audit-a1b2c3d4'
  const sql = { execute: async () => [], query: async () => [] }
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    definitions: {
      records: [{
        fixture: 'AUDIT_RECEIVING_ONLY',
        table: 'mos.tasks',
        id: 'a1b2c3d4-0000-0000-0000-000000000005',
        namespace,
      }],
    },
  }), /columns/i)
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    definitions: {
      sentinels: [{
        table: 'mos.tasks',
        id: 'sentinel',
        query: "DELETE FROM mos.tasks WHERE id IN ('sentinel');",
      }],
    },
  }), /read-only/i)
})

test('audit fixture ownership is session-bound and generated IDs carry the session prefix', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const sharedId = 'a1000000-0000-0000-0000-000000000007'
  const sentinels = [
    { table: 'mos.tasks', id: 'sentinel-task' },
    { table: 'mos.weekly_updates', id: 'sentinel-update' },
    { table: 'ops.log_entries', id: 'sentinel-log' },
  ]
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: { execute: async () => [], query: async () => [{ id: 'sentinel' }] },
    definitions: {
      records: [{ fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: sharedId, namespace, columns: { id: sharedId, title: `${namespace} owned` } }],
      sentinels,
    },
  }), /session|namespace/i)
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: { execute: async () => [], query: async () => [{ id: 'sentinel' }] },
    definitions: {
      records: [{
        fixture: 'AUDIT_RECEIVING_ONLY',
        table: 'mos.tasks',
        id: 'shared-design-audit-a1b2c3d4-owned',
        namespace,
        columns: { id: 'shared-design-audit-a1b2c3d4-owned', title: `${namespace} owned` },
      }],
      sentinels: [{ table: 'mos.tasks', id: 'sentinel' }],
    },
  }), /session|namespace/i)

  const executed: string[] = []
  const provisioner = new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: {
      execute: async (query) => {
        executed.push(query)
        return /^INSERT\s/i.test(query)
          ? [{ id: [...query.matchAll(/'((?:''|[^'])*)'/g)].at(-1)?.[1]?.replace(/''/g, "'") }]
          : []
      },
      query: async () => [{ id: 'sentinel' }],
    },
    definitions: {
      records: [{ fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', namespace, columns: { title: `${namespace} generated` } }],
      sentinels,
    },
  })
  await provisioner.provision()
  assert.match(executed[0] ?? '', /a1b2c3d4-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
})

test('provision receipts durably record database IDs and auth emails before side effects', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const taskId = 'a1b2c3d4-0000-0000-0000-000000000008'
  const email = `${namespace}.writer@example.test`
  const events: string[] = []
  const receipts: AuditFixtureReceipt[] = []
  const provisioner = new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: {
      execute: async (query) => {
        if (/^INSERT\s/i.test(query)) {
          events.push('insert')
          throw new Error('planted insert failure')
        }
        events.push('delete')
        return []
      },
      query: async () => [{ id: 'sentinel' }],
    },
    auth: {
      createUser: async () => {
        events.push('create-user')
        return { data: { user: { id: 'a1b2c3d4-0000-0000-0000-000000000009' } } }
      },
      deleteUser: async () => { events.push('delete-user'); return {} },
      listUsers: async () => [],
    },
    definitions: {
      identities: [{ fixture: 'AUDIT_RECEIVING_ONLY', email, password: 'test-password' }],
      records: [{ fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: taskId, namespace, columns: { id: taskId, title: `${namespace} owned` } }],
      sentinels: [
        { table: 'mos.tasks', id: 'sentinel-task' },
        { table: 'mos.weekly_updates', id: 'sentinel-update' },
        { table: 'ops.log_entries', id: 'sentinel-log' },
      ],
    },
    onReceipt: (receipt) => { events.push('receipt'); receipts.push(receipt) },
  })

  await assert.rejects(() => provisioner.provision(), /planted insert failure/)
  const pendingAuth = receipts.find((receipt) => {
    const owners = (receipt as unknown as { ownedAuthUsers?: Array<{ email?: string; id?: string }> }).ownedAuthUsers ?? []
    return owners.some((owner) => owner.email === email && !owner.id)
  })
  assert.ok(pendingAuth, 'auth email intent was not emitted before createUser')
  assert.ok(receipts.some((receipt) => receipt.created.some((group) => group.ids.includes(taskId))), 'database ID intent was not emitted before INSERT')
  assert.ok(events.indexOf('create-user') > 0)
  assert.ok(events.indexOf('insert') > events.indexOf('create-user'))
})

test('audit-owned writes require all three unrelated sentinel tables before provisioning can begin', () => {
  const namespace = 'design-audit-a1b2c3d4'
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: { execute: async () => [], query: async () => [] },
    definitions: {
      records: [{
        fixture: 'AUDIT_RECEIVING_ONLY',
        table: 'mos.tasks',
        id: 'a1b2c3d4-0000-0000-0000-000000000006',
        namespace,
        columns: { id: 'a1b2c3d4-0000-0000-0000-000000000006', title: `${namespace} owned` },
      }],
    },
  }), /mos\.tasks.*mos\.weekly_updates.*ops\.log_entries/i)
})

test('audit-owned provisioning cleans captured rows and users when a later insert fails', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const ownedTask = 'a1b2c3d4-0000-0000-0000-000000000006'
  const authUser = 'a1b2c3d4-0000-0000-0000-000000000007'
  const rows = new Set<string>(['sentinel-task', 'sentinel-update', 'sentinel-log'])
  const users = new Map<string, { id: string; email: string }>()
  const sql = {
    async query(query: string): Promise<unknown[]> {
      const ids = query.match(/'[^']*'/g)?.map((value) => value.slice(1, -1)) ?? []
      return ids.flatMap((id) => rows.has(id) ? [{ id }] : [])
    },
    async execute(query: string): Promise<unknown> {
      if (query.includes('second-owned-row')) throw new Error('planted insert failure')
      const inserted = /values\s*\(\s*'([^']+)'/i.exec(query)?.[1]
      if (inserted) rows.add(inserted)
      const deleted = query.match(/'[^']*'/g)?.map((value) => value.slice(1, -1)) ?? []
      if (/^DELETE/i.test(query)) for (const id of deleted) rows.delete(id)
      return /^INSERT\s/i.test(query) ? [{ id: inserted }] : []
    },
  }
  const auth = {
    async createUser(input: { email: string }) {
      users.set(authUser, { id: authUser, email: input.email })
      return { data: { user: { id: authUser } } }
    },
    async deleteUser(id: string) { users.delete(id); return {} },
    async listUsers() { return [...users.values()] },
  }
  const receipts: AuditFixtureReceipt[] = []
  const provisioner = new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    auth,
    onReceipt: (receipt) => { receipts.push(receipt) },
    definitions: {
      identities: [{ fixture: 'AUDIT_RECEIVING_ONLY', email: `${namespace}.writer@example.test`, password: 'test-password' }],
      records: [
        { fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: ownedTask, namespace, columns: { id: ownedTask, title: `${namespace} first-owned-row` } },
        { fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', namespace, columns: { title: `${namespace} second-owned-row` } },
      ],
      sentinels: [
        { table: 'mos.tasks', id: 'sentinel-task' },
        { table: 'mos.weekly_updates', id: 'sentinel-update' },
        { table: 'ops.log_entries', id: 'sentinel-log' },
      ],
    },
  })

  await assert.rejects(provisioner.provision(), /planted insert failure/)
  assert.equal(rows.has(ownedTask), false)
  assert.deepEqual([...users], [])
  const finalReceipt = receipts.at(-1)
  assert.ok(finalReceipt)
  assert.deepEqual(finalReceipt.cleanupOnFailure, { attempted: true, completed: true })
  assert.equal(finalReceipt.cleanup.every(({ remaining }) => remaining === 0), true)
  assert.equal(finalReceipt.unrelatedSentinelsPreserved, true)
})

test('local fixture clients fail closed on malformed database and auth responses', async () => {
  for (const url of [
    'https://example.test',
    'http://localhost.example.test',
    'ftp://127.0.0.1:44321',
    'http://user:secret@127.0.0.1:44321',
  ]) {
    assert.throws(() => createLocalAuditSqlClient(url, 'test-key'), /local database/)
    assert.throws(() => createLocalAuditAuthClient(url, 'test-key'), /local auth service/)
  }
  const previousFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('not-json', { status: 200 })
    await assert.rejects(
      createLocalAuditSqlClient('http://127.0.0.1:44321', 'test-key').query('SELECT 1'),
      /invalid JSON/,
    )

    globalThis.fetch = async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    await assert.rejects(
      createLocalAuditAuthClient('http://127.0.0.1:44321', 'test-key').listUsers!(),
      /invalid response/,
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('local auth cleanup paginates short pages until an empty page when totals are absent', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const unrelatedId = 'b1b2c3d4-0000-0000-0000-000000000001'
  const unrelatedLaterId = 'b1b2c3d4-0000-0000-0000-000000000002'
  const ownedId = 'a1b2c3d4-0000-0000-0000-000000000001'
  const users = new Map<string, { id: string; email: string }>([
    [unrelatedId, { id: unrelatedId, email: 'unrelated@example.test' }],
    [ownedId, { id: ownedId, email: `${namespace}.later@example.test` }],
    [unrelatedLaterId, { id: unrelatedLaterId, email: 'unrelated-later@example.test' }],
  ])
  const requestedPages: number[] = []
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    response.setHeader('Content-Type', 'application/json')
    if (requestUrl.pathname === '/auth/v1/admin/users' && request.method === 'GET') {
      const page = Number(requestUrl.searchParams.get('page') ?? '1')
      requestedPages.push(page)
      const pageUsers = [...users.values()].slice(page - 1, page)
      response.end(JSON.stringify({ users: pageUsers }))
      return
    }
    const deleteMatch = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(requestUrl.pathname)
    if (deleteMatch && request.method === 'DELETE') {
      users.delete(decodeURIComponent(deleteMatch[1]!))
      response.end(JSON.stringify({}))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ message: 'not found' }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    const auth = createLocalAuditAuthClient(`http://127.0.0.1:${address.port}`, 'test-key')
    const discovered = await auth.listUsers!()
    const owned = discovered.find((user) => user.id === ownedId)
    assert.ok(owned, 'the namespaced account on the later page was not discovered')
    const deletion = await auth.deleteUser(owned.id)
    assert.equal(deletion.error, undefined)

    const afterCleanup = await auth.listUsers!()
    assert.equal(afterCleanup.some((user) => user.id === ownedId), false)
    assert.ok(requestedPages.filter((page) => page === 3).length >= 2,
      `pagination did not reach the empty page for cleanup verification: ${requestedPages.join(',')}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('local auth pagination honors the Supabase x-total-count header', async () => {
  const users = [
    { id: 'b1b2c3d4-0000-0000-0000-000000000001', email: 'first@example.test' },
    { id: 'b1b2c3d4-0000-0000-0000-000000000002', email: 'second@example.test' },
  ]
  const requestedPages: number[] = []
  const previousFetch = globalThis.fetch
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input))
      const page = Number(url.searchParams.get('page') ?? '1')
      requestedPages.push(page)
      assert.equal(page, 1, 'the reported total should terminate pagination without another request')
      return new Response(JSON.stringify({ users }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-total-count': String(users.length) },
      })
    }
    const listed = await createLocalAuditAuthClient('http://127.0.0.1:44321', 'test-key').listUsers!()
    assert.deepEqual(listed, users)
    assert.deepEqual(requestedPages, [1])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('local HTTP fixture clients recover a failed provision across separate instances', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const firstTask = 'a1b2c3d4-0000-0000-0000-000000000010'
  const secondTask = 'a1b2c3d4-0000-0000-0000-000000000011'
  const authUsers = new Map<string, { id: string; email: string }>()
  const tables = new Map<string, Map<string, Record<string, unknown>>>([
    ['mos.tasks', new Map([['sentinel-task', { id: 'sentinel-task', title: 'keep task' }]])],
    ['mos.weekly_updates', new Map([['sentinel-update', { id: 'sentinel-update', body: 'keep update' }]])],
    ['ops.log_entries', new Map([['sentinel-log', { id: 'sentinel-log', detail: 'keep log' }]])],
  ])
  const sqlRequests: string[] = []
  const authListPages: number[] = []
  let failSecondInsert = true
  let failFirstDelete = true
  let nextAuthId = 20

  const server = createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      const respond = (status: number, body: unknown) => {
        response.statusCode = status
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(body))
      }
      try {
        if (requestUrl.pathname === '/pg/query' && request.method === 'POST') {
          const body = JSON.parse(await new Promise<string>((resolve, reject) => {
            let content = ''
            request.setEncoding('utf8')
            request.on('data', (chunk) => { content += chunk })
            request.on('end', () => resolve(content))
            request.on('error', reject)
          })) as { query?: string }
          const query = body.query ?? ''
          sqlRequests.push(query)
          if (failSecondInsert && /^INSERT\s/i.test(query) && query.includes('second-owned-row')) {
            failSecondInsert = false
            respond(500, { message: 'planted insert failure' })
            return
          }
          if (failFirstDelete && /^DELETE\s/i.test(query)) {
            failFirstDelete = false
            respond(500, { message: 'planted cleanup failure' })
            return
          }
          const table = /(?:FROM|INTO)\s+([a-z_]+\.[a-z_]+)/i.exec(query)?.[1]
          const ids = query.match(/'[^']*'/g)?.map((value) => value.slice(1, -1)) ?? []
          if (/^INSERT\s/i.test(query) && table) {
            const id = /VALUES\s*\(\s*'([^']+)'/i.exec(query)?.[1]
            if (id) tables.get(table)?.set(id, { id, title: `${namespace} owned` })
            respond(200, id ? [{ id }] : [])
            return
          }
          if (/^DELETE\s/i.test(query) && table) {
            for (const id of ids) tables.get(table)?.delete(id)
            respond(200, [])
            return
          }
          if (/^(?:SELECT|WITH)\s/i.test(query) && table) {
            const rows = [...(tables.get(table)?.entries() ?? [])]
              .filter(([id]) => ids.includes(id))
              .map(([, row]) => row)
            respond(200, rows)
            return
          }
          respond(200, [])
          return
        }
        if (requestUrl.pathname === '/auth/v1/admin/users' && request.method === 'POST') {
          const body = JSON.parse(await new Promise<string>((resolve, reject) => {
            let content = ''
            request.setEncoding('utf8')
            request.on('data', (chunk) => { content += chunk })
            request.on('end', () => resolve(content))
            request.on('error', reject)
          })) as { email?: string }
          const id = `a1b2c3d4-0000-0000-0000-0000000000${nextAuthId++}`
          const user = { id, email: body.email ?? '' }
          authUsers.set(id, user)
          respond(200, user)
          return
        }
        const deleteMatch = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(requestUrl.pathname)
        if (deleteMatch && request.method === 'DELETE') {
          authUsers.delete(decodeURIComponent(deleteMatch[1]!))
          respond(200, {})
          return
        }
        if (requestUrl.pathname === '/auth/v1/admin/users' && request.method === 'GET') {
          const page = Number(requestUrl.searchParams.get('page') ?? '1')
          authListPages.push(page)
          const users = [...authUsers.values()]
          const pageSize = 1
          respond(200, { users: users.slice((page - 1) * pageSize, page * pageSize), total: users.length })
          return
        }
        respond(404, { message: 'not found' })
      } catch (error) {
        respond(500, { message: String(error) })
      }
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const definitions = {
    identities: [
      { fixture: 'AUDIT_RECEIVING_ONLY', email: `${namespace}.one@example.test`, password: 'test-password' },
      { fixture: 'AUDIT_RECEIVING_ONLY', email: `${namespace}.two@example.test`, password: 'test-password' },
    ],
    records: [
      { fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: firstTask, namespace, columns: { id: firstTask, title: `${namespace} first-owned-row` } },
      { fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: secondTask, namespace, columns: { id: secondTask, title: `${namespace} second-owned-row` } },
    ],
    sentinels: [
      { table: 'mos.tasks', id: 'sentinel-task', query: "SELECT * FROM mos.tasks WHERE id IN ('sentinel-task');" },
      { table: 'mos.weekly_updates', id: 'sentinel-update', query: "SELECT * FROM mos.weekly_updates WHERE id IN ('sentinel-update');" },
      { table: 'ops.log_entries', id: 'sentinel-log', query: "SELECT * FROM ops.log_entries WHERE id IN ('sentinel-log');" },
    ],
  }
  let persisted: AuditFixtureReceipt | undefined
  try {
    const first = new AuditProvisioner({
      candidateSha: 'a'.repeat(40),
      sessionId: 'a1b2c3d4',
      bindingSecret: testBindingSecret,
      definitions,
      sql: createLocalAuditSqlClient(baseUrl, 'test-key'),
      auth: createLocalAuditAuthClient(baseUrl, 'test-key'),
      onReceipt: (receipt) => { persisted = receipt },
    })
    await assert.rejects(() => first.provision(), /audit fixture SQL failed \(500\)/)
    assert.ok(persisted)
    assert.ok(persisted.created.some((group) => group.ids.includes(secondTask)), 'failed INSERT intent was not persisted')
    assert.ok((persisted as unknown as { ownedAuthUsers?: unknown[] }).ownedAuthUsers?.length === 2, 'auth email intents were not persisted')
    assert.equal(persisted.cleanupOnFailure.completed, false)

    const recovered = await cleanupAuditFixtureReceipt(persisted, {
      candidateSha: 'a'.repeat(40),
      sessionId: 'a1b2c3d4',
      bindingSecret: testBindingSecret,
      sql: createLocalAuditSqlClient(baseUrl, 'test-key'),
      auth: createLocalAuditAuthClient(baseUrl, 'test-key'),
      onFailure: true,
    })
    assert.equal(validateAuditFixtureReceipt(recovered, { candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' }).ok, true)
    for (const original of persisted.sentinels) {
      const cleaned = recovered.sentinels.find((sentinel) => sentinel.table === original.table && sentinel.id === original.id)
      assert.ok(cleaned, `missing cleaned sentinel evidence for ${original.table}:${original.id}`)
      assert.equal(cleaned.beforeHash, original.beforeHash)
      assert.equal(cleaned.beforePresent, true)
      assert.equal(cleaned.afterPresent, true)
      assert.equal(cleaned.afterHash, original.beforeHash)
    }
    assert.equal(tables.get('mos.tasks')?.has(firstTask), false)
    assert.equal(tables.get('mos.tasks')?.has(secondTask), false)
    assert.equal(tables.get('mos.tasks')?.has('sentinel-task'), true)
    assert.equal(tables.get('mos.weekly_updates')?.has('sentinel-update'), true)
    assert.equal(tables.get('ops.log_entries')?.has('sentinel-log'), true)
    assert.equal(authUsers.size, 0)
    assert.ok(authListPages.includes(2), `auth cleanup did not paginate: ${authListPages.join(',')}`)
    assert.ok(sqlRequests.some((query) => /^INSERT\s/i.test(query)))
    assert.ok(sqlRequests.some((query) => /^DELETE\s/i.test(query)))
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('audit cleanup permits captured IDs and rejects broad business-data deletion', () => {
  assert.doesNotThrow(() => assertAuditOwnedCleanupSql(
    "DELETE FROM mos.tasks WHERE id IN ('a1000000-0000-0000-0000-000000000005');",
  ))
  assert.throws(() => assertAuditOwnedCleanupSql(
    "DELETE FROM mos.tasks WHERE org_id = 'shared-org';",
  ), /explicit captured primary-key list/i)
})

test('audit-owned setup and cleanup preserve task, weekly-update, and operations-log sentinels', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const ownedTask = 'a1b2c3d4-0000-0000-0000-000000000001'
  const authUser = 'a1b2c3d4-0000-0000-0000-000000000002'
  const tables = new Map<string, Map<string, Record<string, unknown>>>([
    ['mos.tasks', new Map([['sentinel-task', { id: 'sentinel-task', title: 'Owner task' }]])],
    ['mos.weekly_updates', new Map([['sentinel-update', { id: 'sentinel-update', body: 'Owner update' }]])],
    ['ops.log_entries', new Map([['sentinel-log', { id: 'sentinel-log', detail: 'Owner log' }]])],
  ])
  const users = new Map<string, { id: string; email: string }>()
  const sql = {
    async query(query: string): Promise<unknown[]> {
      const match = /from\s+([a-z_]+\.[a-z_]+)[\s\S]*?in\s*\(([^)]+)\)/i.exec(query)
      if (!match) return []
      const table = tables.get(match[1]!)
      if (!table) return []
      const ids = match[2]!.match(/'[^']*'/g)?.map((id) => id.slice(1, -1)) ?? []
      return ids.flatMap((id) => table.has(id) ? [table.get(id)] : [])
    },
    async execute(query: string): Promise<unknown> {
      const insert = /insert\s+into\s+([a-z_]+\.[a-z_]+)\s*\([^)]*\)\s*values\s*\(\s*'([^']+)'/i.exec(query)
      if (insert) tables.get(insert[1]!)?.set(insert[2]!, { id: insert[2]!, title: `${namespace} owned` })
      const deletion = /delete\s+from\s+([a-z_]+\.[a-z_]+)\s+where\s+\w+\s+in\s*\(([^)]+)\)/i.exec(query)
      if (deletion) {
        const table = tables.get(deletion[1]!)
        for (const id of deletion[2]!.match(/'[^']*'/g)?.map((value) => value.slice(1, -1)) ?? []) table?.delete(id)
      }
      return /^INSERT\s/i.test(query)
        ? [{ id: /values\s*\(\s*'([^']+)'/i.exec(query)?.[1] }]
        : []
    },
  }
  const auth = {
    async createUser(input: { email: string }) {
      users.set(authUser, { id: authUser, email: input.email })
      return { data: { user: { id: authUser } } }
    },
    async deleteUser(id: string) { users.delete(id); return {} },
    async listUsers() { return [...users.values()] },
  }
  const provisioner = new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    auth,
    definitions: {
      identities: [{ fixture: 'AUDIT_RECEIVING_ONLY', email: `${namespace}.writer@example.test`, password: 'test-password' }],
      records: [{ fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: ownedTask, namespace, columns: { id: ownedTask, title: `${namespace} owned` } }],
      sentinels: [
        { table: 'mos.tasks', id: 'sentinel-task', query: "SELECT * FROM mos.tasks WHERE id IN ('sentinel-task');" },
        { table: 'mos.weekly_updates', id: 'sentinel-update', query: "SELECT * FROM mos.weekly_updates WHERE id IN ('sentinel-update');" },
        { table: 'ops.log_entries', id: 'sentinel-log', query: "SELECT * FROM ops.log_entries WHERE id IN ('sentinel-log');" },
      ],
    },
  })

  const provisioned = await provisioner.provision()
  assert.doesNotThrow(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha: 'a'.repeat(40),
    bindingSecret: testBindingSecret,
    receipt: provisioned,
    writes: true,
  }))
  const receipt = await cleanupAuditFixtureReceipt(provisioned, {
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    auth,
  })
  assert.equal(tables.get('mos.tasks')?.has(ownedTask), false)
  assert.equal(tables.get('mos.tasks')?.has('sentinel-task'), true)
  assert.equal(tables.get('mos.weekly_updates')?.has('sentinel-update'), true)
  assert.equal(tables.get('ops.log_entries')?.has('sentinel-log'), true)
  assert.deepEqual([...users], [])
  assert.equal(receipt.unrelatedSentinelsPreserved, true)
  assert.equal(receipt.sentinels?.length, 3)
  assert.deepEqual(receipt.cleanup, [{ table: 'mos.tasks', deleted: 1, remaining: 0 }])
  assert.equal(validateAuditFixtureReceipt(receipt, { candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' }).ok, true)
  const repeated = await cleanupAuditFixtureReceipt(receipt, {
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    auth,
  })
  assert.equal(validateAuditFixtureReceipt(repeated, { candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' }).ok, true)
  assert.deepEqual(repeated.cleanup, [{ table: 'mos.tasks', deleted: 1, remaining: 0 }])
})

test('artifact validation fails closed for an incomplete or changed fixture receipt', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-design-quality-receipt-'))
  const writer = new ReportWriter({ outputDir, candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' })
  await writer.writeFixtureReceipt({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    namespace: 'design-audit-a1b2c3d4',
    created: [{
      table: 'mos.tasks',
      ids: ['a1b2c3d4-0000-0000-0000-000000000003'],
      fixture: 'AUDIT_RECEIVING_ONLY',
      lifecycle: ['created'],
    }],
    cleanup: [{ table: 'mos.tasks', deleted: 0, remaining: 1 }],
    unrelatedSentinelsPreserved: false,
    binding: '0'.repeat(64),
    sentinels: [{ table: 'mos.tasks', id: 'sentinel', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) }],
    ownedDatabaseIds: [{
      table: 'mos.tasks',
      ids: ['a1b2c3d4-0000-0000-0000-000000000003'],
      fixture: 'AUDIT_RECEIVING_ONLY',
      lifecycle: ['created'],
    }],
    ownedAuthUsers: [{
      fixture: 'AUDIT_RECEIVING_ONLY',
      email: 'design-audit-a1b2c3d4.writer@example.test',
      id: 'a1b2c3d4-0000-0000-0000-000000000004',
      lifecycle: 'created',
    }],
    ownedAuthUserIds: ['a1b2c3d4-0000-0000-0000-000000000004'],
    remainingAuthUserIds: ['a1b2c3d4-0000-0000-0000-000000000004'],
    cleanupOnFailure: { attempted: true, completed: false },
  })
  const validation = await validateArtifactSet(outputDir, { candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' })
  assert.equal(validation.ok, false)
  assert.ok(validation.invalid.includes('fixture-receipt.json'))
  assert.match(validation.errors.join('\n'), /leaves owned rows|sentinel|auth user|cleanup did not complete/i)
})

test('fixture receipt replacement is atomic and leaves no partial file beside the artifact', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-design-quality-atomic-receipt-'))
  const writer = new ReportWriter({ outputDir, candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' })
  const receipt = emptyAuditFixtureReceipt('a'.repeat(40), 'a1b2c3d4')
  await writer.writeFixtureReceipt(receipt)
  await writer.writeFixtureReceipt({ ...receipt, cleanupOnFailure: { attempted: true, completed: true } })

  const stored = JSON.parse(await readFile(path.join(outputDir, 'fixture-receipt.json'), 'utf8')) as AuditFixtureReceipt
  assert.deepEqual(stored.cleanupOnFailure, { attempted: true, completed: true })
  assert.deepEqual((await readdir(outputDir)).filter((name) => name.includes('.tmp')), [])
})

test('audit captures reset the browser and app-owned scroll regions to the origin', () => {
  const windowTarget = { scrollTop: 96, scrollLeft: 17 }
  const mainTarget = { scrollTop: 240, scrollLeft: 12 }
  const dataTarget = { scrollTop: 180, scrollLeft: 8 }
  const taskTarget = { scrollTop: 120, scrollLeft: 32 }
  const viewTarget = { scrollTop: 4, scrollLeft: 88 }
  const recordPanelTarget = { scrollTop: 200, scrollLeft: 0 }
  const scrollCalls: unknown[][] = []
  const fakeDocument = {
    scrollingElement: windowTarget,
    documentElement: windowTarget,
    body: windowTarget,
    querySelectorAll: (selector: string) => {
      if (selector === '*') return [mainTarget, dataTarget, taskTarget, viewTarget, recordPanelTarget]
      return []
    },
  }
  const fakeWindow = { scrollTo: (...args: unknown[]) => scrollCalls.push(args) }
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow })
  try {
    resetAuditScroll()
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else delete (globalThis as Record<string, unknown>).document
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete (globalThis as Record<string, unknown>).window
  }

  assert.deepEqual(scrollCalls, [[0, 0]])
  for (const target of [windowTarget, mainTarget, dataTarget, taskTarget, viewTarget, recordPanelTarget]) {
    assert.equal(target.scrollTop, 0)
    assert.equal(target.scrollLeft, 0)
  }
})
