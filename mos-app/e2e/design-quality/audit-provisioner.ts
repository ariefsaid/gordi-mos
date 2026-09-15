import { createHash, randomUUID } from 'node:crypto'

const SHA = /^[0-9a-f]{40}$/
const SESSION_ID = /^[0-9a-f]{8}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i
const TABLE = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i
const HASH = /^[0-9a-f]{64}$/
const REQUIRED_SENTINEL_TABLES = ['mos.tasks', 'mos.weekly_updates', 'ops.log_entries'] as const

export type AuditFixtureRowGroup = { table: string; ids: string[] }

export type AuditFixtureCleanupRow = {
  table: string
  deleted: number
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
}

export type AuditFixtureAuthOwnership = {
  email: string
  /** The ID is intentionally optional until createUser has returned it. */
  id?: string
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
  sentinels: AuditFixtureSentinel[]
  ownedDatabaseIds: Array<{ table: string; ids: string[]; primaryKey?: string }>
  ownedAuthUsers: AuditFixtureAuthOwnership[]
  /** Compatibility evidence derived from ownedAuthUsers; never an independent ledger. */
  ownedAuthUserIds: string[]
  remainingAuthUserIds: string[]
  cleanupOnFailure: { attempted: boolean; completed: boolean; error?: string }
}

export type AuditFixtureIdentityDefinition = {
  /** The manifest fixture name that receives these credentials. */
  fixture?: string
  email: string
  password: string
}

export type AuditFixtureRecordDefinition = {
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

export type AuditFixtureSqlClient = {
  execute(query: string): Promise<unknown>
  query(query: string): Promise<unknown[]>
}

export type AuditFixtureAuthClient = {
  createUser(input: { email: string; password: string; email_confirm: boolean }): Promise<{
    data?: { user?: { id?: string } }
    error?: { message?: string } | null
  }>
  deleteUser(id: string): Promise<{ error?: { message?: string } | null }>
  listUsers?(): Promise<AuditFixtureAuthUser[]>
}

export type AuditProvisionerOptions = {
  candidateSha: string
  sessionId: string
  definitions?: AuditFixtureDefinitions
  sql: AuditFixtureSqlClient
  auth?: AuditFixtureAuthClient
  onReceipt?: (receipt: AuditFixtureReceipt) => Promise<void> | void
}

export type AuditReceiptValidation = { ok: boolean; errors: string[] }

export type AuditFixtureReceiptPhase = 'provisioned' | 'cleaned'

type CreatedRecord = {
  table: string
  id: string
  primaryKey: string
  order: number
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
  return quote(JSON.stringify(value))
}

function containsNamespace(value: unknown, namespace: string): boolean {
  if (typeof value === 'string') return value.toLowerCase().includes(namespace.toLowerCase())
  if (Array.isArray(value)) return value.some((entry) => containsNamespace(entry, namespace))
  if (isRecord(value)) return Object.values(value).some((entry) => containsNamespace(entry, namespace))
  return false
}

export function assertAuditOwnedIdentity(email: string, namespace: string): void {
  if (!email.trim() || !email.toLowerCase().includes(namespace.toLowerCase())) {
    throw new Error(`audit identity ${email || '<empty>'} is outside the ${namespace} namespace`)
  }
}

export function assertAuditOwnedRecord(definition: AuditFixtureRecordDefinition, namespace: string): void {
  assertTable(definition.table)
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

function assertReadOnlySentinelQuery(query: string): void {
  const statement = query.trim().replace(/\s+/g, ' ')
  const withoutTerminator = statement.endsWith(';') ? statement.slice(0, -1).trimEnd() : statement
  const sqlCode = withoutTerminator.replace(/'(?:''|[^'])*'/g, "''")
  if (!/^(?:select|with)\b/i.test(withoutTerminator)
    || /\b(?:insert|update|delete|truncate|drop|alter|create|do|call|execute|prepare|grant|revoke|copy|vacuum|analyze|refresh|into)\b/i.test(sqlCode)
    || /\bfor\s+(?:update|no\s+key\s+update|share|key\s+share)\b/i.test(sqlCode)
    || withoutTerminator.includes(';')) {
    throw new Error('audit sentinel queries must be read-only SELECT statements')
  }
}

type OwnedRecordInsert = {
  id: string
  sql: string
  primaryKey: string
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
    sql: `INSERT INTO ${definition.table} (${names.join(', ')}) VALUES (${names.map((name) => sqlValue(columns[name])).join(', ')}) RETURNING ${primaryKey};`,
    primaryKey,
  }
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
  return `SELECT ${primaryKey} FROM ${table} WHERE ${primaryKey} IN (${ids.map(quote).join(', ')});`
}

/**
 * The audit cleanup path is allowed to delete a captured primary-key list only.
 * Organization predicates are deliberately insufficient ownership evidence.
 */
export function assertAuditOwnedCleanupSql(query: string): void {
  const normalized = query.trim().replace(/\s+/g, ' ')
  if (/\b(?:truncate|drop|execute|prepare|call|do)\b/i.test(normalized)) {
    throw new Error('audit fixture cleanup cannot use destructive or procedural SQL')
  }
  if (!/^delete\s+from\s+[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\s+where\s+[a-z_][a-z0-9_]*\s+in\s*\(\s*'(?:[^']|'')+'(?:\s*,\s*'(?:[^']|'')+')*\s*\)\s*;?$/i.test(normalized)) {
    throw new Error('audit fixture cleanup must delete an explicit captured primary-key list')
  }
}

function emptyReceipt(candidateSha: string, sessionId: string): AuditFixtureReceipt {
  return {
    candidateSha,
    sessionId,
    namespace: auditFixtureNamespace(sessionId),
    created: [],
    cleanup: [],
    unrelatedSentinelsPreserved: true,
    sentinels: [],
    ownedDatabaseIds: [],
    ownedAuthUsers: [],
    ownedAuthUserIds: [],
    remainingAuthUserIds: [],
    cleanupOnFailure: { attempted: false, completed: true },
  }
}

function validationErrors(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string },
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
  const created = Array.isArray(receipt.created) ? receipt.created : []
  const cleanup = Array.isArray(receipt.cleanup) ? receipt.cleanup : []
  const createdCounts = new Map<string, number>()
  const seenIds = new Set<string>()
  for (const group of created) {
    if (!isRecord(group) || typeof group.table !== 'string' || !TABLE.test(group.table) || !Array.isArray(group.ids)) {
      errors.push('fixture receipt created contains an invalid table/ID group')
      continue
    }
    if (group.ids.length === 0) errors.push(`fixture receipt ${group.table} contains an empty owned ID group`)
    for (const id of group.ids) {
      if (typeof id !== 'string' || !id.trim()) errors.push(`fixture receipt ${group.table} contains an empty owned ID`)
      else {
        if (!isSessionBoundPrimaryKey(id, namespace)) {
          errors.push(`fixture receipt owned ID ${group.table}:${id} is outside the ${namespace} session boundary`)
        }
        if (seenIds.has(`${group.table}:${id}`)) errors.push(`fixture receipt duplicates owned ID ${group.table}:${id}`)
        else seenIds.add(`${group.table}:${id}`)
      }
    }
    createdCounts.set(group.table, (createdCounts.get(group.table) ?? 0) + group.ids.length)
  }
  const cleanupCounts = new Map<string, { deleted: number; remaining: number }>()
  for (const entry of cleanup) {
    if (!isRecord(entry) || typeof entry.table !== 'string' || !TABLE.test(entry.table)
      || !Number.isInteger(entry.deleted) || !Number.isInteger(entry.remaining)
      || Number(entry.deleted) < 0 || Number(entry.remaining) < 0) {
      errors.push('fixture receipt cleanup contains an invalid count')
      continue
    }
    if (cleanupCounts.has(entry.table)) errors.push(`fixture receipt has duplicate cleanup table ${entry.table}`)
    cleanupCounts.set(entry.table, { deleted: Number(entry.deleted), remaining: Number(entry.remaining) })
  }
  for (const [table] of cleanupCounts) {
    if (!createdCounts.has(table)) errors.push(`fixture receipt reports cleanup for an unowned table ${table}`)
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
        if (cleanupStatus?.attempted === true) {
          if (cleanupEntry.deleted > count) errors.push(`fixture receipt cleanup deleted more rows than intended for ${table}`)
        } else if (cleanupEntry.deleted + cleanupEntry.remaining !== count) {
          errors.push(`fixture receipt cleanup count is inconsistent for ${table}`)
        }
      }
    }
    for (const [table, entry] of cleanupCounts) {
      if (entry.remaining !== 0) errors.push(`fixture receipt leaves owned rows in ${table}`)
    }
  }
  const authOwners = Array.isArray(receipt.ownedAuthUsers) ? receipt.ownedAuthUsers : []
  const authIds = Array.isArray(receipt.ownedAuthUserIds) ? receipt.ownedAuthUserIds : []
  const remainingAuth = Array.isArray(receipt.remainingAuthUserIds) ? receipt.remainingAuthUserIds : []
  const ownerIds: string[] = []
  const ownerEmails = new Set<string>()
  for (const owner of authOwners) {
    if (!isRecord(owner) || typeof owner.email !== 'string' || !owner.email.trim()) {
      errors.push('fixture receipt contains an invalid owned auth user email')
      continue
    }
    try { assertAuditOwnedIdentity(owner.email, namespace) }
    catch { errors.push(`fixture receipt auth user ${owner.email} is outside the ${namespace} namespace`) }
    const emailKey = owner.email.toLowerCase()
    if (ownerEmails.has(emailKey)) errors.push(`fixture receipt duplicates owned auth user email ${owner.email}`)
    ownerEmails.add(emailKey)
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
        if (typeof sentinel.query !== 'string') errors.push(`fixture sentinel ${sentinel.table}:${sentinel.id} has an invalid query`)
        else {
          try { assertReadOnlySentinelQuery(sentinel.query) }
          catch { errors.push(`fixture sentinel ${sentinel.table}:${sentinel.id} query is not read-only`) }
        }
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
      if (!isRecord(group) || typeof group.table !== 'string' || !TABLE.test(group.table) || !Array.isArray(group.ids)) {
        errors.push('fixture receipt ownedDatabaseIds contains an invalid table/ID group')
        continue
      }
      if (group.ids.length === 0) errors.push(`fixture receipt ${group.table} contains an empty owned database ID group`)
      if (group.primaryKey !== undefined && (typeof group.primaryKey !== 'string' || !IDENTIFIER.test(group.primaryKey))) {
        errors.push(`fixture receipt ${group.table} contains an invalid primary key`)
      }
      for (const id of group.ids) {
        if (typeof id !== 'string' || !id.trim()) errors.push(`fixture receipt ${group.table} contains an empty owned database ID`)
        else {
          if (!isSessionBoundPrimaryKey(id, namespace)) {
            errors.push(`fixture receipt owned database ID ${group.table}:${id} is outside the ${namespace} session boundary`)
          }
          if (declared.has(`${group.table}:${id}`)) errors.push(`fixture receipt duplicates owned database ID ${group.table}:${id}`)
          else declared.add(`${group.table}:${id}`)
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
  expected: { candidateSha: string; sessionId: string },
): AuditReceiptValidation {
  const errors = validationErrors(receipt, expected, 'cleaned')
  return { ok: errors.length === 0, errors }
}

/** Validate the ownership ledger while fixtures are provisioned and before cleanup runs. */
export function validateAuditFixtureProvisionedReceipt(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string },
): AuditReceiptValidation {
  const errors = validationErrors(receipt, expected, 'provisioned')
  return { ok: errors.length === 0, errors }
}

export function assertAuditFixtureReceipt(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string },
): asserts receipt is AuditFixtureReceipt {
  const validation = validateAuditFixtureReceipt(receipt, expected)
  if (!validation.ok) throw new Error(`invalid audit fixture receipt: ${validation.errors.join('; ')}`)
}

export function assertAuditFixtureProvisionedReceipt(
  receipt: unknown,
  expected: { candidateSha: string; sessionId: string },
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
  private readonly onReceipt?: (receipt: AuditFixtureReceipt) => Promise<void> | void
  private readonly createdRecords: CreatedRecord[] = []
  private readonly ownedAuthUsers: AuditFixtureAuthOwnership[] = []
  private readonly beforeSentinels: Snapshot[] = []
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
    this.onReceipt = options.onReceipt
    this.lastReceipt = emptyReceipt(this.candidateSha, this.sessionId)
    for (const identity of this.definitions.identities ?? []) {
      assertAuditOwnedIdentity(identity.email, this.namespace)
      if (!identity.password) throw new Error(`audit identity ${identity.email} has no password`)
    }
    for (const record of this.definitions.records ?? []) assertAuditOwnedRecord(record, this.namespace)
    for (const sentinel of this.definitions.sentinels ?? []) {
      assertTable(sentinel.table)
      assertIdentifier(sentinel.primaryKey ?? 'id', 'sentinel primary key')
      if (!sentinel.id.trim()) throw new Error(`audit sentinel ${sentinel.table} has an empty ID`)
      if (sentinel.query !== undefined) assertReadOnlySentinelQuery(sentinel.query)
    }
    const hasOwnedWrites = (this.definitions.identities?.length ?? 0) > 0
      || (this.definitions.records?.length ?? 0) > 0
    if (hasOwnedWrites) {
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
    const query = definition.query ?? selectByIds(definition.table, definition.primaryKey ?? 'id', [definition.id])
    if (definition.query !== undefined) assertReadOnlySentinelQuery(query)
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
      result.push({ id: user.id, email: user.email })
    }
    return result
  }

  /** Resolve pending email intents against an exact, fully paginated user listing. */
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
        if (exact && exact.email.toLowerCase() !== owner.email.toLowerCase()) {
          throw new Error(`audit fixture auth user ${owner.id} does not match its captured email`)
        }
        if (!exact && emailMatches.length > 0) {
          throw new Error(`audit fixture auth user ${owner.email} exists with an unexpected ID`)
        }
        if (exact) {
          if (resolved.has(exact.id)) throw new Error(`audit fixture auth ownership reuses user ID ${exact.id}`)
          resolved.add(exact.id)
        }
      } else {
        if (emailMatches.length > 1) {
          throw new Error(`audit fixture auth user email ${owner.email} is not unique`)
        }
        const match = emailMatches[0]
        if (match) {
          if (resolved.has(match.id)) throw new Error(`audit fixture auth ownership reuses user ID ${match.id}`)
          owner.id = match.id
          resolved.add(match.id)
        }
      }
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
        query: before.definition.query,
        beforeHash: before.hash,
        afterHash: after.hash,
        beforePresent: before.present,
        afterPresent: after.present,
      })
    }
    const grouped = new Map<string, { table: string; ids: string[]; primaryKey?: string }>()
    for (const record of this.createdRecords) {
      const key = `${record.table}:${record.primaryKey}`
      const group = grouped.get(key) ?? { table: record.table, ids: [], primaryKey: record.primaryKey }
      group.ids.push(record.id)
      grouped.set(key, group)
    }
    const created = [...grouped.values()].map(({ table, ids }) => ({ table, ids }))
    const ownedDatabaseIds = [...grouped.values()]
    const allAuthUsers = this.ownedAuthUsers.length > 0 ? await this.listAuthUsers() : []
    this.resolveAuthOwners(allAuthUsers)
    const ownedAuthUserIds = this.ownedAuthUsers.flatMap(({ id }) => id ? [id] : [])
    const ownedAuthEmails = new Set(this.ownedAuthUsers.map(({ email }) => email.toLowerCase()))
    const ownedAuthIds = new Set(ownedAuthUserIds)
    const remainingAuthUserIds = allAuthUsers
      .filter((user) => ownedAuthIds.has(user.id) || ownedAuthEmails.has(user.email.toLowerCase()))
      .map(({ id }) => id)
    const receipt: AuditFixtureReceipt = {
      candidateSha: this.candidateSha,
      sessionId: this.sessionId,
      namespace: this.namespace,
      created,
      cleanup,
      unrelatedSentinelsPreserved: preserved,
      sentinels: afterSentinels,
      ownedDatabaseIds,
      ownedAuthUsers: this.ownedAuthUsers.map((owner) => ({ ...owner })),
      ownedAuthUserIds,
      remainingAuthUserIds,
      cleanupOnFailure: onFailure,
    }
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
        this.ownedAuthUsers.push({ email: identity.email })
        await this.emit(await this.receipt([], { attempted: false, completed: false }))
        const owner = this.ownedAuthUsers.at(-1)!
        const result = await this.auth!.createUser({ email: identity.email, password: identity.password, email_confirm: true })
        if (result.error) throw new Error(`audit fixture auth user creation failed: ${result.error.message ?? 'unknown error'}`)
        const userId = result.data?.user?.id
        if (!userId) throw new Error(`audit fixture auth user ${identity.email} returned no ID`)
        if (!UUID.test(userId)) throw new Error(`audit fixture auth user ${identity.email} returned an invalid ID`)
        owner.id = userId
        await this.emit(await this.receipt([], { attempted: false, completed: false }))
      }
      for (const [order, definition] of recordOrder(this.definitions.records ?? []).entries()) {
        const owned = ownedRecordInsert(definition, this.namespace)
        this.createdRecords.push({ table: definition.table, id: owned.id, primaryKey: owned.primaryKey, order })
        await this.emit(await this.receipt([], { attempted: false, completed: false }))
        await this.sql.execute(owned.sql)
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
    const cleanup: AuditFixtureCleanupRow[] = []
    const groups = new Map<string, { table: string; primaryKey: string; ids: string[] }>()
    for (const record of this.createdRecords) {
      const key = `${record.table}:${record.primaryKey}`
      const group = groups.get(key) ?? { table: record.table, primaryKey: record.primaryKey, ids: [] }
      group.ids.push(record.id)
      groups.set(key, group)
    }
    const orderedGroups = [...groups.values()].sort((left, right) => {
      const leftOrder = Math.max(...this.createdRecords.filter((record) => record.table === left.table && record.primaryKey === left.primaryKey).map((record) => record.order))
      const rightOrder = Math.max(...this.createdRecords.filter((record) => record.table === right.table && record.primaryKey === right.primaryKey).map((record) => record.order))
      return rightOrder - leftOrder
    })
    try {
      for (const group of orderedGroups) {
        const statement = `DELETE FROM ${group.table} WHERE ${group.primaryKey} IN (${group.ids.map(quote).join(', ')});`
        assertAuditOwnedCleanupSql(statement)
        const before = rows(await this.sql.query(selectByIds(group.table, group.primaryKey, group.ids))).length
        await this.sql.execute(statement)
        const remaining = rows(await this.sql.query(selectByIds(group.table, group.primaryKey, group.ids))).length
        cleanup.push({ table: group.table, deleted: Math.max(before - remaining, 0), remaining })
      }
      if (this.ownedAuthUsers.length > 0) {
        if (!this.auth) throw new Error('audit fixture auth cleanup requires an auth admin client')
        const existingAuthUsers = await this.listAuthUsers()
        this.resolveAuthOwners(existingAuthUsers)
        const ids = this.ownedAuthUsers.flatMap(({ id }) => id ? [id] : [])
        for (const id of [...new Set(ids)].reverse()) {
          const result = await this.auth.deleteUser(id)
          if (result?.error) throw new Error(`audit fixture auth cleanup failed for ${id}: ${result.error.message ?? 'unknown error'}`)
        }
        const remainingAuthUsers = await this.listAuthUsers()
        const ownedEmails = new Set(this.ownedAuthUsers.map(({ email }) => email.toLowerCase()))
        const ownedIds = new Set(this.ownedAuthUsers.flatMap(({ id }) => id ? [id] : []))
        if (remainingAuthUsers.some((user) => ownedIds.has(user.id) || ownedEmails.has(user.email.toLowerCase()))) {
          throw new Error('audit fixture auth cleanup left an owned user behind')
        }
      }
      const cleanupByTable = new Map<string, AuditFixtureCleanupRow>()
      for (const entry of cleanup) {
        const existing = cleanupByTable.get(entry.table)
        cleanupByTable.set(entry.table, existing
          ? { table: entry.table, deleted: existing.deleted + entry.deleted, remaining: existing.remaining + entry.remaining }
          : entry)
      }
      const receipt = await this.receipt([...cleanupByTable.values()], { attempted: options.onFailure === true, completed: true })
      this.cleaned = true
      await this.emit(receipt)
      return receipt
    } catch (error) {
      const receipt = await this.receipt(cleanup, { attempted: options.onFailure === true, completed: false, error: String(error) })
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
    const primaryKeys = new Map<string, string>()
    for (const group of receipt.ownedDatabaseIds) {
      const primaryKey = group.primaryKey ?? 'id'
      for (const id of group.ids) primaryKeys.set(`${group.table}:${id}`, primaryKey)
    }
    this.createdRecords.length = 0
    for (const [order, group] of receipt.created.entries()) {
      const primaryKeyForGroup = group.ids.map((id) => primaryKeys.get(`${group.table}:${id}`) ?? 'id')
      const primaryKey = primaryKeyForGroup[0] ?? 'id'
      if (primaryKeyForGroup.some((value) => value !== primaryKey)) {
        throw new Error(`audit fixture receipt has inconsistent primary keys for ${group.table}`)
      }
      for (const id of group.ids) this.createdRecords.push({ table: group.table, id, primaryKey, order })
    }
    this.ownedAuthUsers.length = 0
    this.ownedAuthUsers.push(...receipt.ownedAuthUsers.map((owner) => ({ ...owner })))
    this.beforeSentinels.length = 0
    for (const sentinel of receipt.sentinels) {
      this.beforeSentinels.push({
        definition: {
          table: sentinel.table,
          id: sentinel.id,
          primaryKey: sentinel.primaryKey,
          query: sentinel.query,
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
  options: Omit<AuditProvisionerOptions, 'definitions' | 'onReceipt'> & { onFailure?: boolean },
): Promise<AuditFixtureReceipt> {
  const finalValidation = validateAuditFixtureReceipt(receipt, {
    candidateSha: options.candidateSha,
    sessionId: options.sessionId,
  })
  const provisionedValidation = validateAuditFixtureProvisionedReceipt(receipt, {
    candidateSha: options.candidateSha,
    sessionId: options.sessionId,
  })
  if (!finalValidation.ok && !provisionedValidation.ok) {
    throw new Error(`invalid audit fixture receipt for cleanup: ${[...new Set([...finalValidation.errors, ...provisionedValidation.errors])].join('; ')}`)
  }
  if (finalValidation.ok) return receipt
  const primaryKeys = new Map<string, string>()
  for (const group of receipt.ownedDatabaseIds) {
    const primaryKey = group.primaryKey ?? 'id'
    for (const id of group.ids) primaryKeys.set(`${group.table}:${id}`, primaryKey)
  }
  const provisioner = new AuditProvisioner({ ...options, definitions: {
    records: receipt.created.flatMap((group) => group.ids.map((id) => ({
      table: group.table,
      id,
      primaryKey: primaryKeys.get(`${group.table}:${id}`) ?? 'id',
      namespace: receipt.namespace,
      columns: {
        [primaryKeys.get(`${group.table}:${id}`) ?? 'id']: id,
        namespace: receipt.namespace,
      },
    }))),
    sentinels: receipt.sentinels.map((sentinel) => ({
      table: sentinel.table,
      id: sentinel.id,
      primaryKey: sentinel.primaryKey,
      query: sentinel.query,
    })),
  } })
  provisioner.seedReceipt(receipt)
  return provisioner.cleanup({ onFailure: options.onFailure })
}

export function createLocalAuditSqlClient(url: string, serviceKey: string): AuditFixtureSqlClient {
  localAuditEndpoint(url, 'database')
  const request = async (query: string): Promise<unknown> => {
    const response = await fetch(`${url}/pg/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: serviceKey },
      body: JSON.stringify({ query }),
    })
    let body: unknown
    try { body = await response.json() }
    catch { throw new Error('audit fixture SQL returned invalid JSON') }
    if (!response.ok) {
      const detail = isRecord(body)
        ? (typeof body.message === 'string' ? body.message : typeof body.msg === 'string' ? body.msg : '')
        : ''
      throw new Error(`audit fixture SQL failed (${response.status})${detail ? `: ${detail}` : ''}`)
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
    const response = await fetch(`${url}${pathname}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
    let body: unknown = null
    try { body = await response.json() } catch { /* empty auth responses are valid */ }
    return { response, body }
  }
  return {
    createUser: async (input) => {
      const { response, body } = await request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify(input) })
      if (!response.ok) return { error: { message: isRecord(body) && typeof body.msg === 'string' ? body.msg : `HTTP ${response.status}` } }
      const id = isRecord(body)
        ? (typeof body.id === 'string' ? body.id : isRecord(body.user) && typeof body.user.id === 'string' ? body.user.id : undefined)
        : undefined
      return { data: { user: { id } } }
    },
    deleteUser: async (id) => {
      const { response, body } = await request(`/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
      return response.ok ? {} : { error: { message: isRecord(body) && typeof body.msg === 'string' ? body.msg : `HTTP ${response.status}` } }
    },
    listUsers: async () => {
      const perPage = 1000
      const users: AuditFixtureAuthUser[] = []
      for (let page = 1; page <= 10_000; page += 1) {
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
          users.push({ id: user.id, email: user.email })
        }
        const total = body.total
        if (typeof total === 'number' && Number.isInteger(total) && total >= 0) {
          if (users.length >= total) break
        } else if (body.users.length < perPage || body.users.length === 0) {
          break
        }
        if (body.users.length === 0) break
      }
      if (users.length >= 10_000 * perPage) throw new Error('audit fixture auth user listing exceeded pagination limit')
      const ids = new Set<string>()
      for (const user of users) {
        if (ids.has(user.id)) throw new Error(`audit fixture auth user listing returned duplicate ID ${user.id}`)
        ids.add(user.id)
      }
      return users
    },
  }
}

export function emptyAuditFixtureReceipt(candidateSha: string, sessionId: string): AuditFixtureReceipt {
  assertMetadata(candidateSha, sessionId)
  return emptyReceipt(candidateSha, sessionId)
}
