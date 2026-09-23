import { createHash, createHmac, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { dirname } from 'node:path'

const SHA = /^[0-9a-f]{40}$/
const SESSION_ID = /^[0-9a-f]{8}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i
const TABLE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i
const HASH = /^[0-9a-f]{64}$/
const FIXTURE = /^[A-Za-z][A-Za-z0-9_-]*$/
const REQUIRED_SENTINEL_TABLES = ['mos.tasks', 'mos.weekly_updates', 'ops.log_entries'] as const
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_AUTH_USERS = 10_000
const ROW_VERSION_COLUMN = 'audit_fixture_xmin'
const ROW_VERSION = /^[0-9]+$/

export type AuditFixtureLifecycleState = 'planned' | 'created' | 'deleted' | 'absent'

export type AuditFixtureRowGroup = {
  table: string
  ids: string[]
  fixture: string
  lifecycle: AuditFixtureLifecycleState[]
  primaryKey?: string
}

export type AuditFixtureOwnedRowGroup = AuditFixtureRowGroup & {
  /** Exact signed values used to prove each row still belongs to this run. */
  ownership: Record<string, unknown>[]
  /** Postgres xmin captured by INSERT ... RETURNING and used for atomic cleanup. */
  versions: Array<string | null>
}

export type AuditFixtureCleanupRow = {
  table: string
  deleted: number
  /** Planned writes proven never to have committed. */
  absent?: number
  remaining: number
}

export type AuditFixtureSentinel = {
  table: string
  id: string
  beforeHash: string
  afterHash: string
  beforePresent?: boolean
  afterPresent?: boolean
  primaryKey?: string
  query?: string
}

export type AuditFixtureAuthUser = {
  id: string
  email: string
  userMetadata?: Record<string, unknown>
}

export type AuditFixtureAuthOwnership = {
  fixture: string
  email: string
  /** The ID is intentionally optional until createUser has returned it. */
  id?: string
  /** Random signed token stored in auth user metadata for unambiguous recovery. */
  ownershipToken: string
  lifecycle: AuditFixtureLifecycleState
}

/**
 * Receipt emitted by the audit fixture boundary. The first six fields are the
 * stable public contract; the optional fields carry the evidence needed to
 * validate a completed write run and to finish cleanup in a separate process.
 */
export type AuditFixtureReceipt = {
  candidateSha: string
  sessionId: string
  namespace: `design-audit-${string}`
  created: AuditFixtureRowGroup[]
  cleanup: AuditFixtureCleanupRow[]
  unrelatedSentinelsPreserved: boolean
  /** HMAC over the immutable ownership/sentinel ledger; verified with an external session secret. */
  binding: string
  sentinels: AuditFixtureSentinel[]
  ownedDatabaseIds: AuditFixtureOwnedRowGroup[]
  ownedAuthUsers: AuditFixtureAuthOwnership[]
  /** Compatibility evidence derived from ownedAuthUsers; never an independent ledger. */
  ownedAuthUserIds: string[]
  remainingAuthUserIds: string[]
  cleanupOnFailure: { attempted: boolean; completed: boolean; error?: string }
}

export type AuditFixtureIdentityDefinition = {
  /** The manifest fixture name that receives these credentials. */
  fixture: string
  email: string
  password: string
}

export type AuditFixtureRecordDefinition = {
  /** The manifest fixture that owns this record and may authorize its writes. */
  fixture: string
  table: string
  /** Generated-column records receive an ID when omitted. */
  id?: string
  primaryKey?: string
  /** The caller must repeat the run namespace in every owned definition. */
  namespace: string
  /** Column/value definitions keep the inserted primary key inspectable. */
  columns?: Record<string, unknown>
  /** Parent tables are inserted first and removed last. */
  dependsOn?: string[]
}

export type AuditFixtureSentinelDefinition = {
  table: string
  id: string
  primaryKey?: string
  /** Use a named read query for compound or non-UUID keys. */
  query?: string
}

export type AuditFixtureDefinitions = {
  identities?: AuditFixtureIdentityDefinition[]
  records?: AuditFixtureRecordDefinition[]
  sentinels?: AuditFixtureSentinelDefinition[]
}

export type AuditFixtureSentinelIntent = {
  table: string
  id: string
  ownership: Record<string, unknown>
  /** Postgres xmin captured from the sentinel INSERT, or recovered after interruption. */
  version: string | null
}

export type AuditFixtureSentinelLedger = {
  candidateSha: string
  sessionId: string
  namespace: `design-audit-${string}`
  intents: AuditFixtureSentinelIntent[]
  /** HMAC over candidate/session/namespace/intents, keyed by the external secret. */
  binding: string
}

export type AuditFixtureSqlClient = {
  execute(query: string): Promise<unknown>
  query(query: string): Promise<unknown[]>
}

export type AuditFixtureAuthClient = {
  createUser(input: { email: string; password: string; email_confirm: boolean; user_metadata: Record<string, unknown> }): Promise<{
    data?: { user?: { id?: string } }
    error?: { message?: string } | null
  }>
  deleteUser(id: string): Promise<{ error?: { message?: string; status?: number } | null }>
  listUsers?(): Promise<AuditFixtureAuthUser[]>
}

export type AuditProvisionerOptions = {
  candidateSha: string
  sessionId: string
  definitions?: AuditFixtureDefinitions
  /** Kept outside the editable receipt and required for any owned write cleanup. */
  bindingSecret?: string
  sql: AuditFixtureSqlClient
  auth?: AuditFixtureAuthClient
  onReceipt?: (receipt: AuditFixtureReceipt) => Promise<void> | void
  /** Bounded delay before a planned write may be classified as absent. */
  reconciliationWaitMs?: number
  /** Injectable delay for focused tests and deterministic interruption simulation. */
  wait?: (milliseconds: number) => Promise<void>
}

export type AuditReceiptValidation = { ok: boolean; errors: string[] }

export type AuditFixtureReceiptPhase = 'provisioned' | 'cleaned'

type CreatedRecord = {
  table: string
  id: string
  primaryKey: string
  fixture: string
  order: number
  ownership: Record<string, unknown>
  version: string | null
  lifecycle: AuditFixtureLifecycleState
}

type Snapshot = {
  definition: AuditFixtureSentinelDefinition
  hash: string
  present: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertMetadata(candidateSha: string, sessionId: string): void {
  if (!SHA.test(candidateSha)) throw new Error('audit fixture candidateSha must be a 40-character lowercase git SHA')
  if (!SESSION_ID.test(sessionId)) throw new Error('audit fixture sessionId must be an 8-character lowercase hex id')
}

function assertFixtureName(fixture: string, label: string): void {
  if (typeof fixture !== 'string' || !FIXTURE.test(fixture)) throw new Error(`audit fixture ${label} must be a named fixture`)
}

function assertBindingSecret(secret: string | undefined, required: boolean): void {
  if (required && (!secret || secret.length < 16)) {
    throw new Error('audit fixture ownership requires an external session binding secret')
  }
}

export function auditFixtureNamespace(sessionId: string): `design-audit-${string}` {
  if (!SESSION_ID.test(sessionId)) throw new Error('audit fixture sessionId must be an 8-character lowercase hex id')
  return `design-audit-${sessionId}`
}

function isSessionBoundPrimaryKey(id: string, namespace: string): boolean {
  if (UUID.test(id)) return id.slice(0, 8).toLowerCase() === namespace.slice('design-audit-'.length).toLowerCase()
  return id.toLowerCase().startsWith(`${namespace.toLowerCase()}-`)
}

function assertSessionBoundPrimaryKey(id: string, namespace: string, label: string): void {
  if (!isSessionBoundPrimaryKey(id, namespace)) {
    throw new Error(`${label} ${id} is outside the ${namespace} session ownership boundary`)
  }
}

function generatedAuditPrimaryKey(namespace: string): string {
  const sessionId = namespace.slice('design-audit-'.length)
  return `${sessionId}${randomUUID().slice(8)}`
}

function localAuditEndpoint(url: string, kind: 'database' | 'auth service'): URL {
  let parsed: URL
  try { parsed = new URL(url) }
  catch { throw new Error(`audit fixtures require a local ${kind}`) }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
    || parsed.username || parsed.password) {
    throw new Error(`audit fixtures require a local ${kind}`)
  }
  return parsed
}

function assertTable(table: string): void {
  if (!TABLE.test(table)) throw new Error(`audit fixture table is not a safe qualified identifier: ${table}`)
}

function assertIdentifier(identifier: string, label: string): void {
  if (!IDENTIFIER.test(identifier)) throw new Error(`audit fixture ${label} is not a safe identifier: ${identifier}`)
}

function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('audit fixture values must be finite numbers')
    return String(value)
  }
  if (typeof value === 'string') return quote(value)
  if (Array.isArray(value)) return `ARRAY[${value.map(sqlValue).join(', ')}]`
  return quote(JSON.stringify(canonical(value)))
}

function isRowVersion(value: unknown): value is string {
  return typeof value === 'string' && ROW_VERSION.test(value)
}

function assertRowVersion(value: unknown, label: string): asserts value is string {
  if (!isRowVersion(value)) throw new Error(`${label} must be a Postgres xmin value`)
}

function isJsonRowVersion(value: unknown): value is string | null {
  return value === null || isRowVersion(value)
}

function structuralEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => structuralEqual(value, right[index]))
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false
    const leftKeys = Object.keys(left).sort()
    const rightKeys = Object.keys(right).sort()
    if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false
    return leftKeys.every((key) => structuralEqual(left[key], right[key]))
  }
  return false
}

/** Compare JSON-shaped ownership values independent of object key insertion order. */
export function auditFixtureValuesEqual(left: unknown, right: unknown): boolean {
  return structuralEqual(canonical(left), canonical(right))
}

function containsNamespace(value: unknown, namespace: string): boolean {
  if (typeof value === 'string') return value.toLowerCase().includes(namespace.toLowerCase())
  if (Array.isArray(value)) return value.some((entry) => containsNamespace(entry, namespace))
  if (isRecord(value)) return Object.values(value).some((entry) => containsNamespace(entry, namespace))
  return false
}

export function assertAuditOwnedIdentity(email: string, namespace: string): void {
  const escapedNamespace = namespace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const exactPattern = new RegExp(`^${escapedNamespace}\\.[a-z0-9][a-z0-9._%+-]*@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$`, 'i')
  if (!email.trim() || !exactPattern.test(email)) {
    throw new Error(`audit identity ${email || '<empty>'} is outside the ${namespace} namespace`)
  }
}

export function assertAuditOwnedRecord(definition: AuditFixtureRecordDefinition, namespace: string): void {
  assertTable(definition.table)
  assertFixtureName(definition.fixture, 'record fixture')
  const primaryKey = definition.primaryKey ?? 'id'
  assertIdentifier(primaryKey, 'record primary key')
  if (definition.namespace !== namespace) {
    throw new Error(`audit record ${definition.table} is outside the ${namespace} namespace`)
  }
  if (definition.id !== undefined && !String(definition.id).trim()) {
    throw new Error(`audit record ${definition.table} has an empty primary key`)
  }
  if (!definition.columns) {
    throw new Error(`audit record ${definition.table} must provide inspectable columns`)
  }
  if (definition.columns && !containsNamespace(definition.columns, namespace)) {
    throw new Error(`audit record ${definition.table} columns must carry the ${namespace} namespace`)
  }
  if (definition.id !== undefined) {
    assertSessionBoundPrimaryKey(String(definition.id), namespace, `audit record ${definition.table} primary key`)
  }
  const declaredColumnId = definition.columns[primaryKey]
  if (declaredColumnId !== undefined) {
    if (typeof declaredColumnId !== 'string' || !declaredColumnId.trim()) {
      throw new Error(`audit record ${definition.table} primary key column must be a non-empty string`)
    }
    if (definition.id !== undefined && declaredColumnId !== definition.id) {
      throw new Error(`audit record ${definition.table} primary key column does not match its declared ID`)
    }
    assertSessionBoundPrimaryKey(declaredColumnId, namespace, `audit record ${definition.table} primary key`)
  }
}

type OwnedRecordInsert = {
  id: string
  sql: string
  primaryKey: string
  ownership: Record<string, unknown>
}

function ownedRecordInsert(definition: AuditFixtureRecordDefinition, namespace: string): OwnedRecordInsert {
  assertAuditOwnedRecord(definition, namespace)
  const primaryKey = definition.primaryKey ?? 'id'
  const id = definition.id ?? (typeof definition.columns?.[primaryKey] === 'string'
    ? definition.columns[primaryKey] as string
    : generatedAuditPrimaryKey(namespace))
  const columns = { ...(definition.columns ?? {}) }
  if (columns[primaryKey] === undefined) columns[primaryKey] = id
  const names = Object.keys(columns)
  if (names.length === 0) throw new Error(`audit record ${definition.table} has no columns`)
  for (const name of names) assertIdentifier(name, 'record column')
  return {
    id: String(columns[primaryKey]),
    sql: `INSERT INTO ${definition.table} (${names.join(', ')}) VALUES (${names.map((name) => sqlValue(columns[name])).join(', ')}) RETURNING ${primaryKey}, xmin::text AS ${ROW_VERSION_COLUMN};`,
    primaryKey,
    ownership: columns,
  }
}

function exactOwnedDelete(record: CreatedRecord): string {
  assertTable(record.table)
  assertIdentifier(record.primaryKey, 'record primary key')
  assertRowVersion(record.version, `audit fixture record ${record.fixture} row version`)
  const columns = Object.entries(record.ownership)
  if (columns.length === 0 || !auditFixtureValuesEqual(record.ownership[record.primaryKey], record.id)) {
    throw new Error(`audit fixture record ${record.fixture} has incomplete cleanup ownership`)
  }
  const predicates = [
    `xmin::text = ${quote(record.version)}`,
    ...columns.map(([column, value]) => {
    assertIdentifier(column, 'record column')
    return value === null || value === undefined
      ? `${column} IS NULL`
      : `${column} = ${sqlValue(value)}`
    }),
  ]
  return `DELETE FROM ${record.table} WHERE ${predicates.join(' AND ')};`
}

function rows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows
  return []
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}

function hashRows(value: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function selectByIds(table: string, primaryKey: string, ids: readonly string[]): string {
  assertTable(table)
  assertIdentifier(primaryKey, 'primary key')
  return `SELECT * FROM ${table} WHERE ${primaryKey} IN (${ids.map(quote).join(', ')});`
}

function selectOwnedRows(table: string, primaryKey: string, ids: readonly string[]): string {
  assertTable(table)
  assertIdentifier(primaryKey, 'primary key')
  return `SELECT *, xmin::text AS ${ROW_VERSION_COLUMN} FROM ${table} WHERE ${primaryKey} IN (${ids.map(quote).join(', ')});`
}

function bindingPayload(receipt: Pick<AuditFixtureReceipt,
  'candidateSha' | 'sessionId' | 'namespace' | 'created' | 'ownedDatabaseIds' | 'ownedAuthUsers' | 'sentinels' | 'unrelatedSentinelsPreserved'>): string {
  return JSON.stringify(canonical({
    candidateSha: receipt.candidateSha,
    sessionId: receipt.sessionId,
    namespace: receipt.namespace,
    created: receipt.created,
    ownedDatabaseIds: receipt.ownedDatabaseIds,
    ownedAuthUsers: receipt.ownedAuthUsers,
    sentinels: receipt.sentinels,
    unrelatedSentinelsPreserved: receipt.unrelatedSentinelsPreserved,
  }))
}

function signReceipt(receipt: Pick<AuditFixtureReceipt,
  'candidateSha' | 'sessionId' | 'namespace' | 'created' | 'ownedDatabaseIds' | 'ownedAuthUsers' | 'sentinels' | 'unrelatedSentinelsPreserved'>, secret: string): string {
  return createHmac('sha256', secret).update(bindingPayload(receipt)).digest('hex')
}

function sentinelLedgerPayload(ledger: Pick<AuditFixtureSentinelLedger,
  'candidateSha' | 'sessionId' | 'namespace' | 'intents'>): string {
  return JSON.stringify(canonical({
    candidateSha: ledger.candidateSha,
    sessionId: ledger.sessionId,
    namespace: ledger.namespace,
    intents: ledger.intents,
  }))
}

function assertSentinelLedgerShape(value: unknown): asserts value is AuditFixtureSentinelLedger {
  if (!isRecord(value) || typeof value.candidateSha !== 'string' || typeof value.sessionId !== 'string'
    || typeof value.namespace !== 'string' || !Array.isArray(value.intents)
    || typeof value.binding !== 'string' || !HASH.test(value.binding)) {
    throw new Error('audit fixture sentinel ledger is invalid')
  }
  assertMetadata(value.candidateSha, value.sessionId)
  if (value.namespace !== auditFixtureNamespace(value.sessionId)) {
    throw new Error('audit fixture sentinel ledger namespace does not match its session')
  }
  for (const intent of value.intents) {
    if (!isRecord(intent) || typeof intent.table !== 'string' || !TABLE.test(intent.table)
      || typeof intent.id !== 'string' || !intent.id.trim() || !isRecord(intent.ownership)
      || !auditFixtureValuesEqual(intent.ownership.id, intent.id)
      || !isJsonRowVersion(intent.version)) {
      throw new Error('audit fixture sentinel ledger contains an invalid intent')
    }
    assertSessionBoundPrimaryKey(intent.id, value.namespace, `audit fixture sentinel ${intent.table} primary key`)
    if (!containsNamespace(intent.ownership, value.namespace)) {
      throw new Error(`audit fixture sentinel ${intent.table}:${intent.id} is outside the session namespace`)
    }
    for (const column of Object.keys(intent.ownership)) assertIdentifier(column, 'sentinel ownership column')
  }
}

export function auditFixtureSentinelLedgerBinding(
  ledger: Pick<AuditFixtureSentinelLedger, 'candidateSha' | 'sessionId' | 'namespace' | 'intents'>,
  bindingSecret: string,
): string {
  assertBindingSecret(bindingSecret, true)
  return createHmac('sha256', bindingSecret).update(sentinelLedgerPayload(ledger)).digest('hex')
}

export async function writeAuditFixtureSentinelLedger(
  ledgerPath: string,
  ledger: AuditFixtureSentinelLedger,
  bindingSecret: string,
): Promise<void> {
  assertBindingSecret(bindingSecret, true)
  const candidate = structuredClone(ledger)
  candidate.binding = auditFixtureSentinelLedgerBinding(candidate, bindingSecret)
  assertSentinelLedgerShape(candidate)
  const temporary = `${ledgerPath}.${process.pid}.${randomUUID()}.tmp`
  await mkdir(dirname(ledgerPath), { recursive: true })
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, ledgerPath)
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function readAuditFixtureSentinelLedger(
  ledgerPath: string,
  bindingSecret: string,
): Promise<AuditFixtureSentinelLedger> {
  const parsed = JSON.parse(await readFile(ledgerPath, 'utf8')) as unknown
  assertSentinelLedgerShape(parsed)
  if (parsed.binding !== auditFixtureSentinelLedgerBinding(parsed, bindingSecret)) {
    throw new Error('audit fixture sentinel ledger binding is invalid')
  }
  return parsed
}

function exactSentinelDelete(intent: AuditFixtureSentinelIntent, namespace: string): string {
  assertTable(intent.table)
  assertSessionBoundPrimaryKey(intent.id, namespace, `audit fixture sentinel ${intent.table} primary key`)
  if (!isRecord(intent.ownership) || !auditFixtureValuesEqual(intent.ownership.id, intent.id)) {
    throw new Error(`audit fixture sentinel ${intent.table}:${intent.id} has incomplete cleanup ownership`)
  }
  assertRowVersion(intent.version, `audit fixture sentinel ${intent.table}:${intent.id} row version`)
  const predicates = [
    `xmin::text = ${quote(intent.version)}`,
    ...Object.entries(intent.ownership).map(([column, value]) => {
      assertIdentifier(column, 'sentinel ownership column')
      return value === null || value === undefined
        ? `${column} IS NULL`
        : `${column} = ${sqlValue(value)}`
    }),
  ]
  return `DELETE FROM ${intent.table} WHERE ${predicates.join(' AND ')};`
}

export async function cleanupAuditFixtureSentinelLedger(
  ledgerPath: string,
  options: {
    candidateSha: string
    sessionId: string
    bindingSecret: string
    sql: AuditFixtureSqlClient
    reconciliationWaitMs?: number
    wait?: (milliseconds: number) => Promise<void>
  },
): Promise<void> {
  const ledger = await readAuditFixtureSentinelLedger(ledgerPath, options.bindingSecret)
  if (ledger.candidateSha !== options.candidateSha || ledger.sessionId !== options.sessionId) {
    throw new Error('audit fixture sentinel ledger metadata does not match the cleanup run')
  }
  const reconciliationWaitMs = options.reconciliationWaitMs ?? REQUEST_TIMEOUT_MS
  if (!Number.isInteger(reconciliationWaitMs) || reconciliationWaitMs < 0 || reconciliationWaitMs > REQUEST_TIMEOUT_MS) {
    throw new Error(`audit fixture sentinel reconciliation wait must be an integer between 0 and ${REQUEST_TIMEOUT_MS} milliseconds`)
  }
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const unresolved: AuditFixtureSentinelIntent[] = []
  const failures: unknown[] = []

  const readCurrent = async (intent: AuditFixtureSentinelIntent): Promise<unknown[]> =>
    rows(await options.sql.query(selectOwnedRows(intent.table, 'id', [intent.id])))
  const readWithReconciliation = async (intent: AuditFixtureSentinelIntent): Promise<unknown[]> => {
    let current = await readCurrent(intent)
    if (current.length === 0) {
      await wait(reconciliationWaitMs)
      current = await readCurrent(intent)
    }
    return current
  }

  for (const intent of [...ledger.intents].reverse()) {
    try {
      const current = await readWithReconciliation(intent)
      if (current.length === 0) continue
      if (current.length > 1 || !isRecord(current[0])) {
        throw new Error(`audit fixture sentinel cleanup found duplicate ownership for ${intent.table}:${intent.id}`)
      }
      for (const [column, expected] of Object.entries(intent.ownership)) {
        if (!auditFixtureValuesEqual(current[0][column], expected)) {
          throw new Error(`audit fixture sentinel cleanup ownership mismatch for ${intent.table}:${intent.id}`)
        }
      }
      const currentVersion = current[0][ROW_VERSION_COLUMN]
      assertRowVersion(currentVersion, `audit fixture sentinel ${intent.table}:${intent.id} row version`)
      if (intent.version !== null && intent.version !== currentVersion) {
        throw new Error(`audit fixture sentinel ${intent.table}:${intent.id} row version changed before cleanup`)
      }
      intent.version = currentVersion
      const deletion = exactSentinelDelete(intent, ledger.namespace)
      assertAuditOwnedCleanupSql(deletion, 'id')
      await writeAuditFixtureSentinelLedger(ledgerPath, ledger, options.bindingSecret)
      try {
        await options.sql.execute(deletion)
      } catch (error) {
        // A successful DELETE can lose its response. Reconcile, then retry the
        // same exact conditional DELETE only when the row is still unchanged.
        const reconciled = await readWithReconciliation(intent)
        if (reconciled.length === 0) continue
        if (reconciled.length > 1 || !isRecord(reconciled[0])) {
          throw new AggregateError([error], `audit fixture sentinel cleanup found duplicate ownership for ${intent.table}:${intent.id}`)
        }
        const reconciledRow = reconciled[0]
        const reconciledVersion = reconciledRow[ROW_VERSION_COLUMN]
        if (!auditFixtureValuesEqual(reconciledRow.id, intent.id)
          || !Object.entries(intent.ownership).every(([column, expected]) => auditFixtureValuesEqual(reconciledRow[column], expected))
          || reconciledVersion !== intent.version) {
          throw new AggregateError([error], `audit fixture sentinel cleanup ownership or version changed for ${intent.table}:${intent.id}`)
        }
        try {
          await options.sql.execute(deletion)
        } catch (retryError) {
          const afterRetry = await readWithReconciliation(intent)
          if (afterRetry.length === 0) continue
          throw new AggregateError([error, retryError], `audit fixture sentinel cleanup failed for ${intent.table}:${intent.id}`)
        }
      }
      const remaining = await readCurrent(intent)
      if (remaining.length > 0) throw new Error(`audit fixture sentinel cleanup left ${intent.table}:${intent.id}`)
    } catch (error) {
      unresolved.push(intent)
      failures.push(error)
    }
  }

  const unresolvedInOrder = unresolved.reverse()
  if (unresolvedInOrder.length > 0) {
    try {
      ledger.intents = unresolvedInOrder
      await writeAuditFixtureSentinelLedger(ledgerPath, ledger, options.bindingSecret)
    } catch (error) {
      failures.push(error)
    }
  } else {
    try {
      await rm(ledgerPath, { force: true })
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length > 0) {
    const detail = failures.map((error) => String(error)).join('; ')
    throw new AggregateError(failures, `audit fixture sentinel cleanup did not complete: ${detail}`)
  }
}

/** Create the durable ledger signature with the session secret kept outside the receipt. */
export function auditFixtureReceiptBinding(receipt: AuditFixtureReceipt, bindingSecret: string): string {
  assertBindingSecret(bindingSecret, true)
  return signReceipt(receipt, bindingSecret)
}

function receiptHasOwnedEntries(receipt: Record<string, unknown>): boolean {
  const created = Array.isArray(receipt.created) && receipt.created.some((group) =>
    isRecord(group) && Array.isArray(group.ids) && group.ids.length > 0)
  const identities = Array.isArray(receipt.ownedAuthUsers) && receipt.ownedAuthUsers.length > 0
  return created || identities
}

function assertReceiptBinding(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string; bindingSecret?: string },
): void {
  if (!isRecord(receipt) || typeof receipt.binding !== 'string' || !HASH.test(receipt.binding)) {
    throw new Error('audit fixture receipt is missing its ownership binding')
  }
  if (receiptHasOwnedEntries(receipt) && (!expected.bindingSecret || expected.bindingSecret.length < 16)) {
    throw new Error('audit fixture cleanup requires the external session binding secret')
  }
  if (expected.bindingSecret && receipt.binding !== signReceipt(receipt as AuditFixtureReceipt, expected.bindingSecret)) {
    throw new Error('audit fixture receipt ownership binding is invalid')
  }
}

function splitSqlList(value: string, delimiter: ',' | 'and'): string[] | undefined {
  const result: string[] = []
  let start = 0
  let quoteOpen = false
  let bracketDepth = 0
  let parenDepth = 0
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (quoteOpen) {
      if (character === "'" && value[index + 1] === "'") {
        index += 1
      } else if (character === "'") {
        quoteOpen = false
      }
      continue
    }
    if (character === "'") {
      quoteOpen = true
      continue
    }
    if (character === '[') bracketDepth += 1
    else if (character === ']') {
      bracketDepth -= 1
      if (bracketDepth < 0) return undefined
    } else if (character === '(') parenDepth += 1
    else if (character === ')') {
      parenDepth -= 1
      if (parenDepth < 0) return undefined
    }
    if (quoteOpen || bracketDepth !== 0 || parenDepth !== 0) continue
    const isDelimiter = delimiter === ','
      ? character === ','
      : value.slice(index, index + 5).toLowerCase() === ' and '
    if (isDelimiter) {
      result.push(value.slice(start, index).trim())
      start = index + (delimiter === ',' ? 1 : 5)
      if (delimiter === 'and') index += 4
    }
  }
  if (quoteOpen || bracketDepth !== 0 || parenDepth !== 0) return undefined
  result.push(value.slice(start).trim())
  return result
}

function isSafeSqlLiteral(value: string): boolean {
  if (/^'(?:[^']|'')*'$/.test(value)) return true
  if (/^(?:TRUE|FALSE)$/i.test(value)) return true
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return true
  if (!/^ARRAY\[[\s\S]*\]$/i.test(value)) return false
  const elements = splitSqlList(value.slice(value.indexOf('[') + 1, -1), ',')
  return elements !== undefined && (elements.length === 1 && elements[0] === '' || elements.every(isSafeSqlLiteral))
}

/**
 * The audit cleanup path is allowed to delete captured ownership rows only.
 * Organization predicates are deliberately insufficient ownership evidence.
 */
export function assertAuditOwnedCleanupSql(query: string, primaryKey = 'id'): void {
  assertIdentifier(primaryKey, 'cleanup primary key')
  const normalized = query.trim().replace(/\s+/g, ' ')
  if (/\b(?:truncate|drop|execute|prepare|call|do)\b/i.test(normalized)) {
    throw new Error('audit fixture cleanup cannot use destructive or procedural SQL')
  }
  const withoutTerminator = normalized.endsWith(';') ? normalized.slice(0, -1).trimEnd() : normalized
  const match = /^delete\s+from\s+[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\s+where\s+(.+)$/i.exec(withoutTerminator)
  const predicates = match ? splitSqlList(match[1]!, 'and') : undefined
  const validVersion = predicates?.length && /^xmin::text\s*=\s*'[0-9]+'$/i.test(predicates[0]!)
  const validOwnership = predicates && predicates.length > 1 && predicates.slice(1).every((predicate) => {
    if (/^[a-z_][a-z0-9_]*\s+is\s+null$/i.test(predicate)) return true
    const equality = /^([a-z_][a-z0-9_]*)\s*=\s*(.+)$/i.exec(predicate)
    return equality !== null && isSafeSqlLiteral(equality[2]!.trim())
  })
  const validPrimaryKey = predicates?.slice(1).some((predicate) => {
    const equality = /^([a-z_][a-z0-9_]*)\s*=\s*(.+)$/i.exec(predicate)
    return equality !== null && equality[1]!.toLowerCase() === primaryKey.toLowerCase()
      && isSafeSqlLiteral(equality[2]!.trim())
  })
  if (!validVersion || !validOwnership || !validPrimaryKey) {
    throw new Error('audit fixture cleanup must use an explicit captured primary-key list, captured row version, and exact ownership predicates')
  }
}

function emptyReceipt(candidateSha: string, sessionId: string, bindingSecret?: string): AuditFixtureReceipt {
  const receipt = {
    candidateSha,
    sessionId,
    namespace: auditFixtureNamespace(sessionId),
    created: [],
    cleanup: [],
    unrelatedSentinelsPreserved: true,
    binding: '',
    sentinels: [],
    ownedDatabaseIds: [],
    ownedAuthUsers: [],
    ownedAuthUserIds: [],
    remainingAuthUserIds: [],
    cleanupOnFailure: { attempted: false, completed: true },
  }
  receipt.binding = signReceipt(receipt, bindingSecret ?? '')
  return receipt
}

function validationErrors(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string; bindingSecret?: string },
  phase: AuditFixtureReceiptPhase,
): string[] {
  const errors: string[] = []
  if (!isRecord(receipt)) return ['fixture receipt must be a JSON object']
  const namespace = `design-audit-${expected.sessionId}`
  if (receipt.candidateSha !== expected.candidateSha) errors.push('fixture receipt candidate SHA does not match the run')
  if (receipt.sessionId !== expected.sessionId) errors.push('fixture receipt session ID does not match the run')
  if (receipt.namespace !== namespace) errors.push(`fixture receipt namespace must be ${namespace}`)
  if (!Array.isArray(receipt.created)) errors.push('fixture receipt created must be an array')
  if (!Array.isArray(receipt.cleanup)) errors.push('fixture receipt cleanup must be an array')
  if (!Array.isArray(receipt.sentinels)) errors.push('fixture receipt sentinels must be an array')
  if (!Array.isArray(receipt.ownedAuthUsers)) errors.push('fixture receipt ownedAuthUsers must be an array')
  if (!Array.isArray(receipt.ownedAuthUserIds)) errors.push('fixture receipt ownedAuthUserIds must be an array')
  if (!Array.isArray(receipt.remainingAuthUserIds)) errors.push('fixture receipt remainingAuthUserIds must be an array')
  if (typeof receipt.binding !== 'string' || !HASH.test(receipt.binding)) {
    errors.push('fixture receipt is missing its ownership binding')
  } else if (expected.bindingSecret && receipt.binding !== signReceipt(receipt as AuditFixtureReceipt, expected.bindingSecret)) {
    errors.push('fixture receipt ownership binding is invalid')
  }
  const created = Array.isArray(receipt.created) ? receipt.created : []
  const cleanup = Array.isArray(receipt.cleanup) ? receipt.cleanup : []
  const createdCounts = new Map<string, number>()
  const seenIds = new Set<string>()
  const lifecycleByRecord = new Map<string, AuditFixtureLifecycleState>()
  for (const group of created) {
    if (!isRecord(group) || typeof group.table !== 'string' || !TABLE.test(group.table)
      || !Array.isArray(group.ids) || typeof group.fixture !== 'string' || !FIXTURE.test(group.fixture)
      || !Array.isArray(group.lifecycle) || group.lifecycle.length !== group.ids.length) {
      errors.push('fixture receipt created contains an invalid table/ID group')
      continue
    }
    if (group.primaryKey !== undefined && (typeof group.primaryKey !== 'string' || !IDENTIFIER.test(group.primaryKey))) {
      errors.push(`fixture receipt ${group.table} contains an invalid primary key`)
    }
    if (group.ids.length === 0) errors.push(`fixture receipt ${group.table} contains an empty owned ID group`)
    for (const [index, id] of group.ids.entries()) {
      const lifecycle = group.lifecycle[index]
      if (typeof id !== 'string' || !id.trim()) errors.push(`fixture receipt ${group.table} contains an empty owned ID`)
      else {
        if (!isSessionBoundPrimaryKey(id, namespace)) {
          errors.push(`fixture receipt owned ID ${group.table}:${id} is outside the ${namespace} session boundary`)
        }
        const recordKey = `${group.table}:${group.fixture}:${id}`
        if (seenIds.has(recordKey)) errors.push(`fixture receipt duplicates owned ID ${group.table}:${id}`)
        else seenIds.add(recordKey)
        if (!['planned', 'created', 'deleted', 'absent'].includes(lifecycle)) {
          errors.push(`fixture receipt ${group.table}:${id} has an invalid lifecycle state`)
        } else lifecycleByRecord.set(recordKey, lifecycle)
        if (lifecycle === 'created' || lifecycle === 'deleted') {
          createdCounts.set(group.table, (createdCounts.get(group.table) ?? 0) + 1)
        }
      }
    }
  }
  const absentCounts = new Map<string, number>()
  for (const group of created) {
    if (!isRecord(group) || typeof group.table !== 'string' || !Array.isArray(group.lifecycle)) continue
    for (const lifecycle of group.lifecycle) {
      if (lifecycle === 'absent') absentCounts.set(group.table, (absentCounts.get(group.table) ?? 0) + 1)
    }
  }
  const cleanupCounts = new Map<string, { deleted: number; absent: number; remaining: number }>()
  for (const entry of cleanup) {
    if (!isRecord(entry) || typeof entry.table !== 'string' || !TABLE.test(entry.table)
      || !Number.isInteger(entry.deleted) || !Number.isInteger(entry.remaining)
      || (entry.absent !== undefined && !Number.isInteger(entry.absent))
      || Number(entry.deleted) < 0 || Number(entry.absent ?? 0) < 0 || Number(entry.remaining) < 0) {
      errors.push('fixture receipt cleanup contains an invalid count')
      continue
    }
    if (cleanupCounts.has(entry.table)) errors.push(`fixture receipt has duplicate cleanup table ${entry.table}`)
    cleanupCounts.set(entry.table, { deleted: Number(entry.deleted), absent: Number(entry.absent ?? 0), remaining: Number(entry.remaining) })
  }
  for (const [table, entry] of cleanupCounts) {
    if (!createdCounts.has(table) && !absentCounts.has(table)) {
      errors.push(`fixture receipt reports cleanup for a table with no confirmed insertion ${table}`)
    } else if (entry.deleted === 0 && entry.absent === 0 && entry.remaining === 0
      && !created.some((group) => isRecord(group) && group.table === table
        && Array.isArray(group.lifecycle) && group.lifecycle.some((state) => state === 'deleted'))) {
      errors.push(`fixture receipt reports zero cleanup for an inserted record in ${table}`)
    }
  }

  const cleanupStatus = isRecord(receipt.cleanupOnFailure)
    && typeof receipt.cleanupOnFailure.attempted === 'boolean'
    && typeof receipt.cleanupOnFailure.completed === 'boolean'
    ? receipt.cleanupOnFailure as { attempted: boolean; completed: boolean; error?: string }
    : null
  if (!cleanupStatus) errors.push('fixture receipt is missing cleanup-on-failure status')

  if (phase === 'cleaned') {
    for (const [table, count] of createdCounts) {
      const cleanupEntry = cleanupCounts.get(table)
      if (!cleanupEntry) errors.push(`fixture receipt has no cleanup result for ${table}`)
      else {
        if (cleanupEntry.remaining !== 0) errors.push(`fixture receipt leaves owned rows in ${table}`)
        if (cleanupEntry.deleted > count) errors.push(`fixture receipt cleanup deleted more rows than intended for ${table}`)
        if (cleanupEntry.deleted !== count) errors.push(`fixture receipt cleanup count is inconsistent with insertion lifecycle for ${table}`)
      }
    }
    for (const [table, count] of absentCounts) {
      const cleanupEntry = cleanupCounts.get(table)
      if (!cleanupEntry) errors.push(`fixture receipt has no absence result for ${table}`)
      else if (cleanupEntry.absent !== count) errors.push(`fixture receipt absence count is inconsistent with planned-write lifecycle for ${table}`)
    }
    for (const [table, entry] of cleanupCounts) {
      if (entry.remaining !== 0) errors.push(`fixture receipt leaves owned rows in ${table}`)
    }
    for (const [record, lifecycle] of lifecycleByRecord) {
      if (lifecycle !== 'deleted' && lifecycle !== 'absent') errors.push(`fixture receipt leaves an owned record unresolved: ${record}`)
    }
  }
  const authOwners = Array.isArray(receipt.ownedAuthUsers) ? receipt.ownedAuthUsers : []
  const authIds = Array.isArray(receipt.ownedAuthUserIds) ? receipt.ownedAuthUserIds : []
  const remainingAuth = Array.isArray(receipt.remainingAuthUserIds) ? receipt.remainingAuthUserIds : []
  const ownerIds: string[] = []
  const ownerEmails = new Set<string>()
  for (const owner of authOwners) {
    if (!isRecord(owner) || typeof owner.fixture !== 'string' || !FIXTURE.test(owner.fixture)
      || typeof owner.email !== 'string' || !owner.email.trim()
      || typeof owner.ownershipToken !== 'string' || !UUID.test(owner.ownershipToken)
      || !['planned', 'created', 'deleted', 'absent'].includes(String(owner.lifecycle))) {
      errors.push('fixture receipt contains an invalid owned auth user email')
      continue
    }
    try { assertAuditOwnedIdentity(owner.email, namespace) }
    catch { errors.push(`fixture receipt auth user ${owner.email} is outside the ${namespace} namespace`) }
    const emailKey = owner.email.toLowerCase()
    if (ownerEmails.has(emailKey)) errors.push(`fixture receipt duplicates owned auth user email ${owner.email}`)
    ownerEmails.add(emailKey)
    if (owner.lifecycle === 'planned' && owner.id !== undefined) {
      errors.push(`fixture receipt planned auth user ${owner.email} cannot carry an ID`)
    }
    if (owner.lifecycle === 'absent' && owner.id !== undefined) {
      errors.push(`fixture receipt absent auth user ${owner.email} cannot carry an ID`)
    }
    if (owner.lifecycle === 'created' && owner.id === undefined) {
      errors.push(`fixture receipt ${owner.email} is missing its confirmed auth user ID`)
    }
    if (owner.id !== undefined) {
      if (typeof owner.id !== 'string' || !UUID.test(owner.id)) {
        errors.push('fixture receipt contains an invalid owned auth user ID')
      } else {
        if (ownerIds.includes(owner.id)) errors.push(`fixture receipt duplicates an owned auth user ID ${owner.id}`)
        ownerIds.push(owner.id)
      }
    }
  }
  for (const id of authIds) if (typeof id !== 'string' || !UUID.test(id)) errors.push('fixture receipt contains an invalid owned auth user ID')
  for (const id of remainingAuth) if (typeof id !== 'string' || !UUID.test(id)) errors.push('fixture receipt contains an invalid remaining auth user ID')
  if (new Set(authIds).size !== authIds.length) errors.push('fixture receipt duplicates an owned auth user ID')
  if (new Set(remainingAuth).size !== remainingAuth.length) errors.push('fixture receipt duplicates a remaining auth user ID')
  if ([...new Set(ownerIds)].sort().join('|') !== [...new Set(authIds)].sort().join('|')) {
    errors.push('fixture receipt ownedAuthUserIds do not match the owned auth ownership ledger')
  }
  if (phase === 'cleaned' && remainingAuth.length > 0) errors.push('fixture receipt leaves owned auth users behind')
  if (phase === 'provisioned' && remainingAuth.some((id) => !ownerIds.includes(id))) {
    errors.push('fixture receipt remaining auth users do not belong to the owned auth ledger')
  }

  if (phase === 'cleaned') {
    for (const owner of authOwners) {
      if (isRecord(owner) && owner.lifecycle !== 'deleted' && owner.lifecycle !== 'absent') {
        errors.push(`fixture receipt leaves auth user ${String(owner.email)} unresolved`)
      }
    }
  }
  const hasWriteIntent = seenIds.size > 0 || authOwners.length > 0
  if (phase === 'provisioned' && hasWriteIntent && cleanupStatus?.completed === true) {
    errors.push('fixture receipt represents completed cleanup; write cells require a live provisioned receipt')
  }
  if (receipt.unrelatedSentinelsPreserved !== true) errors.push('fixture receipt does not prove unrelated sentinels were preserved')
  const sentinels = Array.isArray(receipt.sentinels) ? receipt.sentinels : []
  if (hasWriteIntent) {
    const sentinelTables = new Set(sentinels.flatMap((sentinel) =>
      isRecord(sentinel) && typeof sentinel.table === 'string' ? [sentinel.table] : []))
    const missing = REQUIRED_SENTINEL_TABLES.filter((table) => !sentinelTables.has(table))
    if (missing.length > 0) {
      errors.push(`fixture receipt with owned data is missing sentinel evidence for: ${missing.join(', ')}`)
    }
  }
  for (const sentinel of sentinels) {
    if (!isRecord(sentinel) || typeof sentinel.table !== 'string' || !TABLE.test(sentinel.table)
      || typeof sentinel.id !== 'string' || !sentinel.id.trim()
      || !HASH.test(String(sentinel.beforeHash)) || !HASH.test(String(sentinel.afterHash))) {
      errors.push('fixture receipt contains an invalid sentinel hash record')
    } else {
      if (sentinel.beforePresent !== undefined && typeof sentinel.beforePresent !== 'boolean') {
        errors.push(`fixture sentinel ${sentinel.table}:${sentinel.id} has an invalid before-presence record`)
      }
      if (sentinel.afterPresent !== undefined && typeof sentinel.afterPresent !== 'boolean') {
        errors.push(`fixture sentinel ${sentinel.table}:${sentinel.id} has an invalid after-presence record`)
      }
      if (hasWriteIntent && (sentinel.beforePresent !== true || sentinel.afterPresent !== true)) {
        errors.push(`fixture sentinel ${sentinel.table}:${sentinel.id} does not prove presence before and after the audit`)
      }
      if (sentinel.primaryKey !== undefined && (typeof sentinel.primaryKey !== 'string' || !IDENTIFIER.test(sentinel.primaryKey))) {
        errors.push(`fixture sentinel ${sentinel.table}:${sentinel.id} contains an invalid primary key`)
      }
      if (sentinel.query !== undefined) {
        errors.push(`fixture sentinel ${sentinel.table}:${sentinel.id} cannot carry a custom query`)
      }
      if (sentinel.beforeHash !== sentinel.afterHash) {
        errors.push(`fixture sentinel ${sentinel.table}:${sentinel.id} changed during the audit`)
      }
    }
  }
  if (phase === 'cleaned' && cleanupStatus?.completed !== true) {
    errors.push('fixture cleanup did not complete')
  }
  if (!Array.isArray(receipt.ownedDatabaseIds)) {
    errors.push('fixture receipt ownedDatabaseIds must be an array')
  } else {
    const declared = new Set<string>()
    for (const group of receipt.ownedDatabaseIds) {
      if (!isRecord(group) || typeof group.table !== 'string' || !TABLE.test(group.table)
        || typeof group.fixture !== 'string' || !FIXTURE.test(group.fixture)
        || !Array.isArray(group.ids) || !Array.isArray(group.lifecycle) || group.lifecycle.length !== group.ids.length
        || !Array.isArray(group.ownership) || group.ownership.length !== group.ids.length
        || !Array.isArray(group.versions) || group.versions.length !== group.ids.length) {
        errors.push('fixture receipt ownedDatabaseIds contains an invalid table/ID group')
        continue
      }
      if (group.ids.length === 0) errors.push(`fixture receipt ${group.table} contains an empty owned database ID group`)
      if (group.primaryKey !== undefined && (typeof group.primaryKey !== 'string' || !IDENTIFIER.test(group.primaryKey))) {
        errors.push(`fixture receipt ${group.table} contains an invalid primary key`)
      }
      for (const [index, id] of group.ids.entries()) {
        if (typeof id !== 'string' || !id.trim()) errors.push(`fixture receipt ${group.table} contains an empty owned database ID`)
        else {
          if (!isSessionBoundPrimaryKey(id, namespace)) {
            errors.push(`fixture receipt owned database ID ${group.table}:${id} is outside the ${namespace} session boundary`)
          }
          const key = `${group.table}:${group.fixture}:${id}`
          if (declared.has(key)) errors.push(`fixture receipt duplicates owned database ID ${group.table}:${id}`)
          else declared.add(key)
          if (group.lifecycle[index] !== lifecycleByRecord.get(key)) {
            errors.push(`fixture receipt lifecycle does not match the created ledger for ${group.table}:${id}`)
          }
          const ownership = group.ownership[index]
          const version = group.versions[index]
          const primaryKey = typeof group.primaryKey === 'string' ? group.primaryKey : 'id'
          if (!isRecord(ownership) || !auditFixtureValuesEqual(ownership[primaryKey], id) || !containsNamespace(ownership, namespace)) {
            errors.push(`fixture receipt ownership marker is invalid for ${group.table}:${id}`)
          } else {
            for (const column of Object.keys(ownership)) {
              if (!IDENTIFIER.test(column)) errors.push(`fixture receipt ownership marker has an invalid column for ${group.table}:${id}`)
            }
          }
          if (!isJsonRowVersion(version)) {
            errors.push(`fixture receipt ${group.table}:${id} has a non-JSON-safe row version`)
          }
          if ((group.lifecycle[index] === 'created' || group.lifecycle[index] === 'deleted') && !isRowVersion(version)) {
            errors.push(`fixture receipt ${group.table}:${id} is missing its captured row version`)
          }
          if ((group.lifecycle[index] === 'planned' || group.lifecycle[index] === 'absent') && version !== null) {
            errors.push(`fixture receipt ${group.table}:${id} has a row version before insertion was confirmed`)
          }
        }
      }
    }
    if ([...declared].sort().join('|') !== [...seenIds].sort().join('|')) {
      errors.push('fixture receipt owned database IDs do not match created IDs')
    }
  }
  return errors
}

export function validateAuditFixtureReceipt(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string; bindingSecret?: string },
): AuditReceiptValidation {
  const errors = validationErrors(receipt, expected, 'cleaned')
  return { ok: errors.length === 0, errors }
}

/** Validate the ownership ledger while fixtures are provisioned and before cleanup runs. */
export function validateAuditFixtureProvisionedReceipt(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string; bindingSecret?: string },
): AuditReceiptValidation {
  const errors = validationErrors(receipt, expected, 'provisioned')
  return { ok: errors.length === 0, errors }
}

export function assertAuditFixtureReceipt(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string; bindingSecret?: string },
): asserts receipt is AuditFixtureReceipt {
  const validation = validateAuditFixtureReceipt(receipt, expected)
  if (!validation.ok) throw new Error(`invalid audit fixture receipt: ${validation.errors.join('; ')}`)
}

export function assertAuditFixtureProvisionedReceipt(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string; bindingSecret?: string },
): asserts receipt is AuditFixtureReceipt {
  const validation = validateAuditFixtureProvisionedReceipt(receipt, expected)
  if (!validation.ok) throw new Error(`invalid provisioned audit fixture receipt: ${validation.errors.join('; ')}`)
}

function recordOrder(definitions: AuditFixtureRecordDefinition[]): AuditFixtureRecordDefinition[] {
  const pending = [...definitions]
  const ordered: AuditFixtureRecordDefinition[] = []
  const available = new Set<string>()
  while (pending.length > 0) {
    const index = pending.findIndex((definition) => (definition.dependsOn ?? []).every((dependency) => available.has(dependency)))
    if (index === -1) throw new Error('audit fixture record dependencies contain a cycle or an unknown parent')
    const [definition] = pending.splice(index, 1)
    ordered.push(definition)
    available.add(definition.table)
  }
  return ordered
}

export class AuditProvisioner {
  readonly candidateSha: string
  readonly sessionId: string
  readonly namespace: `design-audit-${string}`

  private readonly definitions: AuditFixtureDefinitions
  private readonly sql: AuditFixtureSqlClient
  private readonly auth?: AuditFixtureAuthClient
  private readonly bindingSecret?: string
  private readonly onReceipt?: (receipt: AuditFixtureReceipt) => Promise<void> | void
  private readonly reconciliationWaitMs: number
  private readonly wait: (milliseconds: number) => Promise<void>
  private readonly createdRecords: CreatedRecord[] = []
  private readonly ownedAuthUsers: AuditFixtureAuthOwnership[] = []
  private readonly beforeSentinels: Snapshot[] = []
  private readonly cleanupCounts = new Map<string, AuditFixtureCleanupRow>()
  private provisioned = false
  private cleaned = false
  private lastReceipt: AuditFixtureReceipt

  constructor(options: AuditProvisionerOptions) {
    assertMetadata(options.candidateSha, options.sessionId)
    this.candidateSha = options.candidateSha
    this.sessionId = options.sessionId
    this.namespace = auditFixtureNamespace(options.sessionId)
    this.definitions = options.definitions ?? {}
    this.sql = options.sql
    this.auth = options.auth
    this.bindingSecret = options.bindingSecret
    this.onReceipt = options.onReceipt
    this.reconciliationWaitMs = options.reconciliationWaitMs ?? REQUEST_TIMEOUT_MS
    if (!Number.isInteger(this.reconciliationWaitMs)
      || this.reconciliationWaitMs < 0 || this.reconciliationWaitMs > REQUEST_TIMEOUT_MS) {
      throw new Error(`audit fixture reconciliation wait must be an integer between 0 and ${REQUEST_TIMEOUT_MS} milliseconds`)
    }
    this.wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
    this.lastReceipt = emptyReceipt(this.candidateSha, this.sessionId, this.bindingSecret)
    for (const identity of this.definitions.identities ?? []) {
      assertFixtureName(identity.fixture, 'identity fixture')
      assertAuditOwnedIdentity(identity.email, this.namespace)
      if (!identity.password) throw new Error(`audit identity ${identity.email} has no password`)
    }
    for (const record of this.definitions.records ?? []) assertAuditOwnedRecord(record, this.namespace)
    for (const sentinel of this.definitions.sentinels ?? []) {
      assertTable(sentinel.table)
      assertIdentifier(sentinel.primaryKey ?? 'id', 'sentinel primary key')
      if (!sentinel.id.trim()) throw new Error(`audit sentinel ${sentinel.table} has an empty ID`)
      if (sentinel.query !== undefined) {
        throw new Error('custom sentinel queries are not supported; sentinel snapshots always select the full row by exact ID')
      }
    }
    const hasOwnedWrites = (this.definitions.identities?.length ?? 0) > 0
      || (this.definitions.records?.length ?? 0) > 0
    if (hasOwnedWrites) {
      assertBindingSecret(this.bindingSecret, true)
      const sentinelTables = new Set((this.definitions.sentinels ?? []).map(({ table }) => table))
      const missing = REQUIRED_SENTINEL_TABLES.filter((table) => !sentinelTables.has(table))
      if (missing.length > 0) {
        throw new Error(`audit-owned writes require unrelated sentinels for: ${missing.join(', ')}`)
      }
    }
  }

  private async emit(receipt: AuditFixtureReceipt): Promise<void> {
    this.lastReceipt = receipt
    await this.onReceipt?.(receipt)
  }

  private async readSentinel(definition: AuditFixtureSentinelDefinition): Promise<Snapshot> {
    const query = selectByIds(definition.table, definition.primaryKey ?? 'id', [definition.id])
    const result = rows(await this.sql.query(query))
    return { definition, hash: hashRows(result), present: result.length > 0 }
  }

  private async captureBeforeSentinels(): Promise<void> {
    this.beforeSentinels.length = 0
    for (const definition of this.definitions.sentinels ?? []) this.beforeSentinels.push(await this.readSentinel(definition))
  }

  private async listAuthUsers(): Promise<AuditFixtureAuthUser[]> {
    if (!this.auth?.listUsers) {
      throw new Error('audit fixture auth cleanup requires user listing for cleanup verification')
    }
    const users = await this.auth.listUsers()
    if (!Array.isArray(users)) throw new Error('audit fixture auth user listing returned an invalid response')
    const ids = new Set<string>()
    const result: AuditFixtureAuthUser[] = []
    for (const user of users as unknown[]) {
      if (!isRecord(user) || typeof user.id !== 'string' || !UUID.test(user.id)
        || typeof user.email !== 'string' || !user.email.trim()) {
        throw new Error('audit fixture auth user listing returned an invalid user')
      }
      if (ids.has(user.id)) throw new Error(`audit fixture auth user listing returned duplicate ID ${user.id}`)
      ids.add(user.id)
      result.push({
        id: user.id,
        email: user.email,
        ...(isRecord(user.userMetadata) ? { userMetadata: user.userMetadata } : {}),
      })
    }
    return result
  }

  private authUserMatchesOwner(user: AuditFixtureAuthUser, owner: AuditFixtureAuthOwnership): boolean {
    return user.email.toLowerCase() === owner.email.toLowerCase()
      && user.userMetadata?.audit_fixture_namespace === this.namespace
      && user.userMetadata?.audit_fixture_token === owner.ownershipToken
  }

  /** Validate only IDs or signed metadata tokens confirmed by this run. */
  private resolveAuthOwners(users: AuditFixtureAuthUser[]): void {
    const byId = new Map(users.map((user) => [user.id, user]))
    const byEmail = new Map<string, AuditFixtureAuthUser[]>()
    for (const user of users) {
      const key = user.email.toLowerCase()
      const matches = byEmail.get(key) ?? []
      matches.push(user)
      byEmail.set(key, matches)
    }
    const resolved = new Set<string>()
    for (const owner of this.ownedAuthUsers) {
      const emailMatches = byEmail.get(owner.email.toLowerCase()) ?? []
      if (owner.id) {
        const exact = byId.get(owner.id)
        if (exact && !this.authUserMatchesOwner(exact, owner)) {
          throw new Error(`audit fixture auth user ${owner.id} does not match its ownership token`)
        }
        if (emailMatches.some((user) => user.id !== owner.id)) {
          throw new Error(`audit fixture auth user ${owner.email} exists with an unexpected ID`)
        }
        if (exact) {
          if (resolved.has(exact.id)) throw new Error(`audit fixture auth ownership reuses user ID ${exact.id}`)
          resolved.add(exact.id)
        }
      } else {
        const tokenMatches = users.filter((user) => this.authUserMatchesOwner(user, owner))
        if (tokenMatches.length > 1) throw new Error(`audit fixture auth token for ${owner.email} is not unique`)
        if (emailMatches.some((user) => !this.authUserMatchesOwner(user, owner))) {
          throw new Error(`audit fixture auth user ${owner.email} exists without this run's ownership token`)
        }
      }
    }
  }

  private async exactRecordRows(record: CreatedRecord): Promise<unknown[]> {
    return rows(await this.sql.query(selectOwnedRows(record.table, record.primaryKey, [record.id])))
  }

  private recordMatchesOwnedDefinition(record: CreatedRecord, definition: AuditFixtureRecordDefinition, value: unknown): boolean {
    if (!isRecord(value) || !auditFixtureValuesEqual(value[record.primaryKey], record.id)) return false
    if (!containsNamespace(value, this.namespace)) return false
    for (const [column, expected] of Object.entries(definition.columns ?? {})) {
      if (!auditFixtureValuesEqual(value[column], expected)) return false
    }
    return true
  }

  /** Recover an ambiguous post-commit insert only from the exact session-owned row marker. */
  private async recoverRecord(record: CreatedRecord, definition: AuditFixtureRecordDefinition): Promise<void> {
    const matches = await this.exactRecordRows(record)
    const version = matches.length === 1 && isRecord(matches[0]) ? matches[0][ROW_VERSION_COLUMN] : undefined
    if (matches.length === 1 && this.recordMatchesOwnedDefinition(record, definition, matches[0])) {
      // The session-random primary key plus the complete namespaced ownership marker
      // is the per-insert marker when an INSERT response omits xmin. Cleanup captures
      // the current xmin before its conditional DELETE when it is available.
      record.version = isRowVersion(version) ? version : null
      record.lifecycle = isRowVersion(version) ? 'created' : 'planned'
    }
  }

  /** Recover an auth create whose response was lost using its random metadata token. */
  private async recoverAuthOwner(owner: AuditFixtureAuthOwnership): Promise<void> {
    const users = await this.listAuthUsers()
    const emailMatches = users.filter((user) => user.email.toLowerCase() === owner.email.toLowerCase())
    const matches = users.filter((user) => this.authUserMatchesOwner(user, owner))
    if (matches.length > 1) throw new Error(`audit fixture auth token for ${owner.email} is not unique`)
    if (emailMatches.some((user) => !this.authUserMatchesOwner(user, owner))) {
      throw new Error(`audit fixture auth user ${owner.email} exists without this run's ownership token`)
    }
    const match = matches[0]
    if (match) {
      assertAuditOwnedIdentity(match.email, this.namespace)
      owner.id = match.id
      owner.lifecycle = 'created'
    }
  }

  private async receipt(cleanup: AuditFixtureCleanupRow[], onFailure: { attempted: boolean; completed: boolean; error?: string }): Promise<AuditFixtureReceipt> {
    const afterSentinels: AuditFixtureSentinel[] = []
    let preserved = true
    for (const before of this.beforeSentinels) {
      const after = await this.readSentinel(before.definition)
      if (!before.present || !after.present || before.hash !== after.hash) preserved = false
      afterSentinels.push({
        table: before.definition.table,
        id: before.definition.id,
        primaryKey: before.definition.primaryKey,
        beforeHash: before.hash,
        afterHash: after.hash,
        beforePresent: before.present,
        afterPresent: after.present,
      })
    }
    const grouped = new Map<string, { table: string; ids: string[]; fixture: string; primaryKey?: string; lifecycle: AuditFixtureLifecycleState[]; ownership: Record<string, unknown>[]; versions: Array<string | null> }>()
    for (const record of this.createdRecords) {
      const key = `${record.table}:${record.fixture}:${record.primaryKey}`
      const group = grouped.get(key) ?? {
        table: record.table,
        ids: [],
        fixture: record.fixture,
        primaryKey: record.primaryKey,
        lifecycle: [],
        ownership: [],
        versions: [],
      }
      group.ids.push(record.id)
      group.lifecycle.push(record.lifecycle)
      group.ownership.push(record.ownership)
      group.versions.push(record.version)
      grouped.set(key, group)
    }
    const created = [...grouped.values()].map(({ table, ids, fixture, primaryKey, lifecycle }) => ({
      table,
      ids,
      fixture,
      primaryKey,
      lifecycle,
    }))
    const ownedDatabaseIds = [...grouped.values()].map((group) => ({
      ...group,
      ownership: group.ownership.map((row) => ({ ...row })),
      versions: [...group.versions],
    }))
    const allAuthUsers = this.ownedAuthUsers.length > 0 ? await this.listAuthUsers() : []
    this.resolveAuthOwners(allAuthUsers)
    const ownedAuthUserIds = this.ownedAuthUsers.flatMap(({ id }) => id ? [id] : [])
    const ownedAuthIds = new Set(ownedAuthUserIds)
    const remainingAuthUserIds = allAuthUsers
      .filter((user) => ownedAuthIds.has(user.id)
        || this.ownedAuthUsers.some((owner) => this.authUserMatchesOwner(user, owner)))
      .map(({ id }) => id)
    const receipt: AuditFixtureReceipt = {
      candidateSha: this.candidateSha,
      sessionId: this.sessionId,
      namespace: this.namespace,
      created,
      cleanup,
      unrelatedSentinelsPreserved: preserved,
      binding: '',
      sentinels: afterSentinels,
      ownedDatabaseIds,
      ownedAuthUsers: this.ownedAuthUsers.map((owner) => ({ ...owner })),
      ownedAuthUserIds,
      remainingAuthUserIds,
      cleanupOnFailure: onFailure,
    }
    receipt.binding = signReceipt(receipt, this.bindingSecret ?? '')
    return receipt
  }

  async provision(): Promise<AuditFixtureReceipt> {
    if (this.provisioned) return this.lastReceipt
    await this.captureBeforeSentinels()
    try {
      if ((this.definitions.identities ?? []).length > 0 && !this.auth) {
        throw new Error('audit fixture identities require an auth admin client')
      }
      if ((this.definitions.identities ?? []).length > 0 && !this.auth?.listUsers) {
        throw new Error('audit fixture identities require an auth client that can list users for cleanup verification')
      }
      for (const identity of this.definitions.identities ?? []) {
        assertAuditOwnedIdentity(identity.email, this.namespace)
        const existingUsers = await this.listAuthUsers()
        if (existingUsers.some((user) => user.email.toLowerCase() === identity.email.toLowerCase())) {
          throw new Error(`audit fixture auth identity ${identity.fixture} is already present`)
        }
        const owner: AuditFixtureAuthOwnership = {
          fixture: identity.fixture,
          email: identity.email,
          ownershipToken: randomUUID(),
          lifecycle: 'planned',
        }
        this.ownedAuthUsers.push(owner)
        await this.emit(await this.receipt([], { attempted: false, completed: false }))
        const result = await this.auth!.createUser({
          email: identity.email,
          password: identity.password,
          email_confirm: true,
          user_metadata: {
            audit_fixture_namespace: this.namespace,
            audit_fixture_token: owner.ownershipToken,
          },
        })
        if (result.error) {
          throw new Error(`audit fixture auth user creation failed: ${result.error.message ?? 'unknown error'}`)
        }
        const userId = result.data?.user?.id
        if (!userId) {
          await this.recoverAuthOwner(owner)
          throw new Error(`audit fixture auth user ${identity.fixture} returned no ID`)
        }
        if (!UUID.test(userId)) throw new Error(`audit fixture auth user ${identity.fixture} returned an invalid ID`)
        owner.id = userId
        owner.lifecycle = 'created'
        await this.emit(await this.receipt([], { attempted: false, completed: false }))
      }
      for (const [order, definition] of recordOrder(this.definitions.records ?? []).entries()) {
        const owned = ownedRecordInsert(definition, this.namespace)
        const record: CreatedRecord = {
          table: definition.table,
          id: owned.id,
          primaryKey: owned.primaryKey,
          fixture: definition.fixture,
          order,
          ownership: owned.ownership,
          version: null,
          lifecycle: 'planned',
        }
        const existingRows = await this.exactRecordRows(record)
        if (existingRows.some((value) => isRecord(value) && value[owned.primaryKey] === owned.id)) {
          throw new Error(`audit fixture record ${definition.fixture}:${definition.table} is already present`)
        }
        this.createdRecords.push(record)
        await this.emit(await this.receipt([], { attempted: false, completed: false }))
        let result: unknown
        try {
          result = await this.sql.execute(owned.sql)
        } catch (error) {
          await this.recoverRecord(record, definition)
          throw error
        }
        const returned = rows(result)
        const returnedId = returned.length === 1 && isRecord(returned[0])
          ? returned[0][owned.primaryKey]
          : undefined
        const returnedVersion = returned.length === 1 && isRecord(returned[0])
          ? returned[0][ROW_VERSION_COLUMN]
          : undefined
        if (returned.length !== 1 || !auditFixtureValuesEqual(returnedId, owned.id) || !isRowVersion(returnedVersion)) {
          // A missing response can follow a committed INSERT. Promote only when
          // a full-row read proves the exact session marker, declared values, and row version.
          await this.recoverRecord(record, definition)
          throw new Error(`audit fixture INSERT RETURNING did not return the intended primary key and row version for ${definition.fixture}`)
        }
        record.version = returnedVersion
        record.lifecycle = 'created'
        await this.emit(await this.receipt([], { attempted: false, completed: false }))
      }
      this.provisioned = true
      const receipt = await this.receipt([], { attempted: false, completed: false })
      await this.emit(receipt)
      return receipt
    } catch (error) {
      try {
        await this.cleanup({ onFailure: true })
      } catch (cleanupError) {
        throw new Error(`audit fixture provisioning failed: ${String(error)}; cleanup failed: ${String(cleanupError)}`)
      }
      throw error
    }
  }

  async cleanup(options: { onFailure?: boolean } = {}): Promise<AuditFixtureReceipt> {
    if (this.cleaned) return this.lastReceipt
    const pendingRecords = this.createdRecords
      .filter((record) => record.lifecycle !== 'deleted' && record.lifecycle !== 'absent')
      .sort((left, right) => right.order - left.order)
    try {
      for (const record of pendingRecords) {
        const previouslyCreated = record.lifecycle === 'created'
        let before = await this.exactRecordRows(record)
        if (before.length === 0 && !previouslyCreated) {
          // A planned INSERT may have committed after its response/receipt was interrupted.
          // Keep the intent planned until the bounded request-timeout reconciliation window ends.
          await this.wait(this.reconciliationWaitMs)
          before = await this.exactRecordRows(record)
        }
        if (before.length > 1) throw new Error(`audit fixture cleanup found duplicate ownership for ${record.fixture}`)
        if (before.length === 1) {
          const definition: AuditFixtureRecordDefinition = {
            fixture: record.fixture,
            table: record.table,
            id: record.id,
            primaryKey: record.primaryKey,
            namespace: this.namespace,
            columns: record.ownership,
          }
          if (!this.recordMatchesOwnedDefinition(record, definition, before[0])) {
            throw new Error(`audit fixture cleanup ownership mismatch for ${record.fixture}:${record.table}:${record.id}`)
          }
          const currentVersion = isRecord(before[0]) ? before[0][ROW_VERSION_COLUMN] : undefined
          assertRowVersion(currentVersion, `audit fixture record ${record.fixture} row version`)
          if (previouslyCreated) {
            if (record.version !== currentVersion) {
              throw new Error(`audit fixture cleanup row version changed for ${record.fixture}:${record.table}:${record.id}`)
            }
          } else {
            record.version = currentVersion
          }
          record.lifecycle = 'created'
          const deletion = exactOwnedDelete(record)
          assertAuditOwnedCleanupSql(deletion, record.primaryKey)
          await this.sql.execute(deletion)
        }
        const remaining = await this.exactRecordRows(record)
        if (remaining.length > 0) throw new Error(`audit fixture cleanup left owned rows in ${record.table}`)
        record.lifecycle = previouslyCreated || before.length === 1 ? 'deleted' : 'absent'
        const previous = this.cleanupCounts.get(record.table)
        const absent = (previous?.absent ?? 0) + (record.lifecycle === 'absent' ? 1 : 0)
        this.cleanupCounts.set(record.table, {
          table: record.table,
          deleted: (previous?.deleted ?? 0) + (record.lifecycle === 'deleted' ? 1 : 0),
          ...(absent > 0 ? { absent } : {}),
          remaining: 0,
        })
      }
      if (this.ownedAuthUsers.length > 0) {
        if (!this.auth) throw new Error('audit fixture auth cleanup requires an auth admin client')
        const existingAuthUsers = await this.listAuthUsers()
        this.resolveAuthOwners(existingAuthUsers)
        for (const owner of [...this.ownedAuthUsers].reverse()) {
          if (owner.lifecycle === 'deleted' || owner.lifecycle === 'absent') continue
          const previouslyCreated = owner.lifecycle === 'created'
          let current = await this.listAuthUsers()
          let exact: AuditFixtureAuthUser | undefined
          for (let attempt = 0; attempt < 2; attempt += 1) {
            const ownedMatches = current.filter((user) => this.authUserMatchesOwner(user, owner))
            const emailMatches = current.filter((user) => user.email.toLowerCase() === owner.email.toLowerCase())
            if (ownedMatches.length > 1 || emailMatches.some((user) => !this.authUserMatchesOwner(user, owner))) {
              throw new Error(`audit fixture auth owner ${owner.fixture} does not match the live ownership token`)
            }
            exact = owner.id
              ? current.find((user) => user.id === owner.id)
              : ownedMatches[0]
            if (exact || previouslyCreated || attempt === 1) break
            // A planned createUser may have committed after its response/receipt was interrupted.
            await this.wait(this.reconciliationWaitMs)
            current = await this.listAuthUsers()
          }
          if (owner.id && exact && !this.authUserMatchesOwner(exact, owner)) {
            throw new Error(`audit fixture auth owner ${owner.fixture} does not match the live ownership token`)
          }
          if (!owner.id && exact) owner.id = exact.id
          if (!exact) {
            owner.lifecycle = previouslyCreated ? 'deleted' : 'absent'
            continue
          }
          const result = await this.auth.deleteUser(exact.id)
          if (result?.error && result.error.status !== 404 && !/\b404\b/.test(result.error.message ?? '')) {
            throw new Error(`audit fixture auth cleanup failed for ${owner.fixture}`)
          }
          const afterDelete = await this.listAuthUsers()
          if (afterDelete.some((user) => this.authUserMatchesOwner(user, owner))) {
            throw new Error(`audit fixture auth cleanup left an owned user behind for ${owner.fixture}`)
          }
          owner.lifecycle = 'deleted'
        }
        const remainingAuthUsers = await this.listAuthUsers()
        const ownedIds = new Set(this.ownedAuthUsers
          .flatMap(({ id }) => id ? [id] : []))
        if (remainingAuthUsers.some((user) => ownedIds.has(user.id)
          || this.ownedAuthUsers.some((owner) => user.email.toLowerCase() === owner.email.toLowerCase()
            || this.authUserMatchesOwner(user, owner)))) {
          throw new Error('audit fixture auth cleanup left an owned user behind')
        }
      }
      const receipt = await this.receipt([...this.cleanupCounts.values()], { attempted: options.onFailure === true, completed: true })
      this.cleaned = true
      await this.emit(receipt)
      return receipt
    } catch (error) {
      const receipt = await this.receipt([...this.cleanupCounts.values()], { attempted: options.onFailure === true, completed: false, error: String(error) })
      await this.emit(receipt)
      throw error
    }
  }

  /** Seed the in-memory ownership ledger when cleanup continues in the shell process. */
  seedReceipt(receipt: AuditFixtureReceipt): void {
    if (receipt.candidateSha !== this.candidateSha || receipt.sessionId !== this.sessionId
      || receipt.namespace !== this.namespace) {
      throw new Error('audit fixture receipt metadata does not match the cleanup run')
    }
    if (!Array.isArray(receipt.created) || !Array.isArray(receipt.ownedDatabaseIds)
      || !Array.isArray(receipt.ownedAuthUsers)) {
      throw new Error('audit fixture receipt ownership ledger is incomplete')
    }
    assertReceiptBinding(receipt, {
      candidateSha: this.candidateSha,
      sessionId: this.sessionId,
      bindingSecret: this.bindingSecret,
    })
    const primaryKeys = new Map<string, string>()
    const ownership = new Map<string, Record<string, unknown>>()
    const versions = new Map<string, string | null>()
    for (const group of receipt.ownedDatabaseIds) {
      const primaryKey = group.primaryKey ?? 'id'
      for (const [index, id] of group.ids.entries()) {
        const key = `${group.table}:${group.fixture}:${id}`
        primaryKeys.set(key, primaryKey)
        const marker = group.ownership[index]
        if (!isRecord(marker)) throw new Error(`audit fixture receipt has no ownership marker for ${group.table}:${id}`)
        ownership.set(key, marker)
        // JSON receipts use null for an unresolved planned/absent version. Normalize
        // an in-memory undefined from an older caller before seeding the ledger.
        versions.set(key, group.versions[index] ?? null)
      }
    }
    this.createdRecords.length = 0
    for (const [order, group] of receipt.created.entries()) {
      const primaryKeyForGroup = group.ids.map((id) => primaryKeys.get(`${group.table}:${group.fixture}:${id}`) ?? 'id')
      const primaryKey = primaryKeyForGroup[0] ?? 'id'
      if (primaryKeyForGroup.some((value) => value !== primaryKey)) {
        throw new Error(`audit fixture receipt has inconsistent primary keys for ${group.table}`)
      }
      for (const [index, id] of group.ids.entries()) {
        const key = `${group.table}:${group.fixture}:${id}`
        this.createdRecords.push({
          table: group.table,
          id,
          primaryKey,
          fixture: group.fixture,
          order,
          ownership: ownership.get(key) ?? {},
          version: versions.get(key) ?? null,
          lifecycle: group.lifecycle[index]!,
        })
      }
    }
    this.ownedAuthUsers.length = 0
    this.ownedAuthUsers.push(...receipt.ownedAuthUsers.map((owner) => ({ ...owner })))
    this.cleanupCounts.clear()
    for (const entry of receipt.cleanup) this.cleanupCounts.set(entry.table, { ...entry })
    this.beforeSentinels.length = 0
    for (const sentinel of receipt.sentinels) {
      this.beforeSentinels.push({
        definition: {
          table: sentinel.table,
          id: sentinel.id,
          primaryKey: sentinel.primaryKey,
        },
        hash: sentinel.beforeHash,
        present: sentinel.beforePresent ?? true,
      })
    }
    this.provisioned = true
    this.lastReceipt = receipt
  }
}

export async function cleanupAuditFixtureReceipt(
  receipt: AuditFixtureReceipt,
  options: Omit<AuditProvisionerOptions, 'definitions' | 'bindingSecret'> & {
    bindingSecret: string
    onFailure?: boolean
  },
): Promise<AuditFixtureReceipt> {
  assertBindingSecret(options.bindingSecret, true)
  const finalValidation = validateAuditFixtureReceipt(receipt, {
    candidateSha: options.candidateSha,
    sessionId: options.sessionId,
  })
  const provisionedValidation = validateAuditFixtureProvisionedReceipt(receipt, {
    candidateSha: options.candidateSha,
    sessionId: options.sessionId,
  })
  const bindingValidation = (finalValidation.ok ? validateAuditFixtureReceipt : validateAuditFixtureProvisionedReceipt)(receipt, {
    candidateSha: options.candidateSha,
    sessionId: options.sessionId,
    bindingSecret: options.bindingSecret,
  })
  if (!finalValidation.ok && !provisionedValidation.ok) {
    throw new Error(`invalid audit fixture receipt for cleanup: ${[...new Set([...finalValidation.errors, ...provisionedValidation.errors])].join('; ')}`)
  }
  if (!bindingValidation.ok) {
    throw new Error(`invalid audit fixture receipt ownership binding: ${bindingValidation.errors.join('; ')}`)
  }
  if (finalValidation.ok) return receipt
  const primaryKeys = new Map<string, string>()
  const ownership = new Map<string, Record<string, unknown>>()
  for (const group of receipt.ownedDatabaseIds) {
    const primaryKey = group.primaryKey ?? 'id'
    for (const [index, id] of group.ids.entries()) {
      const key = `${group.table}:${group.fixture}:${id}`
      primaryKeys.set(key, primaryKey)
      ownership.set(key, group.ownership[index] ?? {})
    }
  }
  const provisioner = new AuditProvisioner({ ...options, definitions: {
    records: receipt.created.flatMap((group) => group.ids.map((id) => ({
      table: group.table,
      id,
      primaryKey: primaryKeys.get(`${group.table}:${group.fixture}:${id}`) ?? 'id',
      fixture: group.fixture,
      namespace: receipt.namespace,
      columns: ownership.get(`${group.table}:${group.fixture}:${id}`) ?? {},
    }))),
    sentinels: receipt.sentinels.map((sentinel) => ({
      table: sentinel.table,
      id: sentinel.id,
      primaryKey: sentinel.primaryKey,
    })),
  }, bindingSecret: options.bindingSecret })
  provisioner.seedReceipt(receipt)
  return provisioner.cleanup({ onFailure: options.onFailure })
}

async function boundedJson(response: Response, kind: 'SQL' | 'auth'): Promise<unknown> {
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null && /^\d+$/.test(contentLength.trim())
    && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error(`audit fixture ${kind} response body exceeded the local limit`)
  }
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      const chunk = next.value
      total += chunk.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        throw new Error(`audit fixture ${kind} response body exceeded the local limit`)
      }
      chunks.push(chunk)
    }
  } finally {
    reader.releaseLock()
  }
  const content = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    content.set(chunk, offset)
    offset += chunk.byteLength
  }
  const text = new TextDecoder().decode(content)
  if (!text.trim()) return null
  try { return JSON.parse(text) as unknown }
  catch { throw new Error(`audit fixture ${kind} returned invalid JSON`) }
}

async function boundedRequest(
  url: string,
  kind: 'SQL' | 'auth',
  init: RequestInit,
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return { response, body: await boundedJson(response, kind) }
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`audit fixture ${kind} request timed out`)
    if (error instanceof Error && error.message.startsWith(`audit fixture ${kind} `)) throw error
    throw new Error(`audit fixture ${kind} request failed`)
  } finally {
    clearTimeout(timeout)
  }
}

export function createLocalAuditSqlClient(url: string, serviceKey: string): AuditFixtureSqlClient {
  localAuditEndpoint(url, 'database')
  const request = async (query: string): Promise<unknown> => {
    const { response, body } = await boundedRequest(`${url}/pg/query`, 'SQL', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey },
      body: JSON.stringify({ query }),
    })
    if (!response.ok) {
      throw new Error(`audit fixture SQL failed (${response.status})`)
    }
    return body
  }
  return {
    execute: request,
    query: async (query) => {
      const body = await request(query)
      if (Array.isArray(body)) return body
      if (isRecord(body) && Array.isArray(body.rows)) return body.rows
      throw new Error('audit fixture SQL returned an invalid query response')
    },
  }
}

export function createLocalAuditAuthClient(url: string, serviceKey: string): AuditFixtureAuthClient {
  localAuditEndpoint(url, 'auth service')
  const headers = { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const request = async (pathname: string, init: RequestInit = {}): Promise<{ response: Response; body: unknown }> => {
    return boundedRequest(`${url}${pathname}`, 'auth', { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  }
  return {
    createUser: async (input) => {
      const { response, body } = await request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify(input) })
      if (!response.ok) return { error: { message: `HTTP ${response.status}`, status: response.status } }
      const id = isRecord(body)
        ? (typeof body.id === 'string' ? body.id : isRecord(body.user) && typeof body.user.id === 'string' ? body.user.id : undefined)
        : undefined
      return { data: { user: { id } } }
    },
    deleteUser: async (id) => {
      const { response } = await request(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return response.ok ? {} : { error: { message: `HTTP ${response.status}`, status: response.status } }
    },
    listUsers: async () => {
      const perPage = 1000
      const users: AuditFixtureAuthUser[] = []
      let reachedTerminalPage = false
      const maxPages = Math.ceil(MAX_AUTH_USERS / perPage) + 1
      for (let page = 1; page <= maxPages; page += 1) {
        const { response, body } = await request(`/auth/v1/admin/users?page=${page}&per_page=${perPage}`)
        if (!response.ok) throw new Error(`audit fixture auth user listing failed (${response.status})`)
        if (!isRecord(body) || !Array.isArray(body.users)) {
          throw new Error('audit fixture auth user listing returned an invalid response')
        }
        for (const user of body.users as unknown[]) {
          if (!isRecord(user) || typeof user.id !== 'string' || !UUID.test(user.id)
            || typeof user.email !== 'string' || !user.email.trim()) {
            throw new Error('audit fixture auth user listing returned an invalid user')
          }
          users.push({
            id: user.id,
            email: user.email,
            ...(isRecord(user.user_metadata) ? { userMetadata: user.user_metadata } : {}),
          })
          if (users.length > MAX_AUTH_USERS) {
            throw new Error('audit fixture auth user listing exceeded the local population limit')
          }
        }
        const headerTotalValue = response.headers.get('x-total-count')
        let headerTotal: number | undefined
        if (headerTotalValue !== null) {
          const normalized = headerTotalValue.trim()
          if (!/^\d+$/.test(normalized)) {
            throw new Error('audit fixture auth user listing returned an invalid x-total-count header')
          }
          headerTotal = Number(normalized)
          if (!Number.isSafeInteger(headerTotal)) {
            throw new Error('audit fixture auth user listing returned an invalid x-total-count header')
          }
        }
        const bodyTotal = typeof body.total === 'number' && Number.isSafeInteger(body.total) && body.total >= 0
          ? body.total
          : undefined
        const total = headerTotal ?? bodyTotal
        if (total !== undefined) {
          if (users.length > total) {
            throw new Error('audit fixture auth user listing exceeded the reported total')
          }
          if (users.length === total) {
            reachedTerminalPage = true
            break
          }
        } else if (body.users.length === 0) {
          reachedTerminalPage = true
          break
        }
      }
      if (!reachedTerminalPage) throw new Error('audit fixture auth user listing exceeded the local pagination limit')
      const ids = new Set<string>()
      for (const user of users) {
        if (ids.has(user.id)) throw new Error(`audit fixture auth user listing returned duplicate ID ${user.id}`)
        ids.add(user.id)
      }
      return users
    },
  }
}

export function emptyAuditFixtureReceipt(candidateSha: string, sessionId: string, bindingSecret?: string): AuditFixtureReceipt {
  assertMetadata(candidateSha, sessionId)
  return emptyReceipt(candidateSha, sessionId, bindingSecret)
}
