import {
  assertAuditFixtureProvisionedReceipt,
  assertAuditOwnedIdentity,
  auditFixtureNamespace,
  type AuditFixtureDefinitions,
  type AuditFixtureReceipt,
  validateAuditFixtureReceipt,
} from './audit-provisioner.ts'

export type {
  AuditFixtureDefinitions,
  AuditFixtureIdentityDefinition,
  AuditFixtureRecordDefinition,
  AuditFixtureSentinelDefinition,
  AuditFixtureReceipt,
} from './audit-provisioner.ts'

/**
 * Fixture boundary for the audit project.
 *
 * Seeded personas are read-only evidence. A receiving-only journey must use a
 * per-run audit-owned identity and records whose ownership is captured in a
 * candidate-bound receipt; this module never creates, deletes, or relinks a
 * shared user.
 */
export const AUDIT_RECEIVING_ONLY = 'AUDIT_RECEIVING_ONLY' as const

export type AuditFixtureCredentials = {
  email: string
  password: string
  owned: boolean
}

export type AuditFixtureWritePolicy = {
  fixture: string
  sessionId: string
  candidateSha?: string
  writes: boolean
  receipt?: unknown
}

export function auditOwnedReceivingFixture(sessionId: string): AuditFixtureCredentials {
  const email = process.env.DESIGN_AUDIT_RECEIVING_EMAIL?.trim() ?? ''
  const password = process.env.DESIGN_AUDIT_RECEIVING_PASSWORD ?? ''
  const namespace = `design-audit-${sessionId}`
  if (!email || !password || !email.toLowerCase().includes(namespace)) {
    throw new Error(
      `${AUDIT_RECEIVING_ONLY} requires DESIGN_AUDIT_RECEIVING_EMAIL containing ${namespace} ` +
      'and DESIGN_AUDIT_RECEIVING_PASSWORD; the audit will not borrow a shared fixture',
    )
  }
  return { email, password, owned: true }
}

export function assertAuditFixtureNamespace(email: string, sessionId: string): void {
  assertAuditOwnedIdentity(email, auditFixtureNamespace(sessionId))
}

let definitionsProvider: (sessionId: string) => AuditFixtureDefinitions = () => ({})

/** Feature tickets register their own state definitions without changing the generic boundary. */
export function registerAuditFixtureDefinitions(
  provider: (sessionId: string) => AuditFixtureDefinitions,
): void {
  definitionsProvider = provider
}

export function auditFixtureDefinitions(sessionId: string): AuditFixtureDefinitions {
  return definitionsProvider(sessionId)
}

/** Validate the write receipt before a manifest cell is allowed to use its fixture. */
export function assertAuditFixtureWritePolicy(policy: AuditFixtureWritePolicy): void {
  if (!policy.writes) return
  if (!policy.candidateSha || !policy.receipt) {
    throw new Error('write-state design audit cells require a database-verified per-run provisioner receipt')
  }
  assertAuditFixtureProvisionedReceipt(policy.receipt, {
    candidateSha: policy.candidateSha,
    sessionId: policy.sessionId,
  })
  const receipt = policy.receipt as AuditFixtureReceipt
  const namespace = auditFixtureNamespace(policy.sessionId)
  if (receipt.namespace !== namespace) throw new Error(`write-state fixture is outside the ${namespace} namespace`)
  const ownedRecordCount = receipt.created.reduce((count, group) => count + group.ids.length, 0)
  if (ownedRecordCount === 0 && (receipt.ownedAuthUserIds?.length ?? 0) === 0) {
    throw new Error(`write-state fixture ${policy.fixture} has no audit-owned records in the ${namespace} namespace`)
  }
}

export function validateAuditWriteReceipt(
  receipt: unknown,
  candidateSha: string,
  sessionId: string,
): ReturnType<typeof validateAuditFixtureReceipt> {
  return validateAuditFixtureReceipt(receipt, { candidateSha, sessionId })
}
