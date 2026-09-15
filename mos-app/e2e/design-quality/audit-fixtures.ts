import {
  assertAuditFixtureProvisionedReceipt,
  assertAuditOwnedIdentity,
  auditFixtureNamespace,
  type AuditFixtureDefinitions,
  type AuditFixtureIdentityDefinition,
  type AuditFixtureReceipt,
  validateAuditFixtureReceipt,
} from './audit-provisioner.ts'

export type {
  AuditFixtureDefinitions,
  AuditFixtureIdentityDefinition,
  AuditFixtureRecordDefinition,
  AuditFixtureSentinelDefinition,
  AuditFixtureAuthOwnership,
  AuditFixtureAuthUser,
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
  bindingSecret?: string
  writes: boolean
  receipt?: unknown
}

export function auditOwnedReceivingFixture(
  sessionId: string,
  identity?: AuditFixtureIdentityDefinition,
): AuditFixtureCredentials {
  if (!identity || identity.fixture !== AUDIT_RECEIVING_ONLY) {
    throw new Error(`${AUDIT_RECEIVING_ONLY} requires a provisioned named identity in the fixture definitions`)
  }
  assertAuditFixtureNamespace(identity.email, sessionId)
  if (!identity.password) throw new Error(`${AUDIT_RECEIVING_ONLY} provisioned identity has no password`)
  return { email: identity.email, password: identity.password, owned: true }
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
  if (!policy.bindingSecret || policy.bindingSecret.length < 16) {
    throw new Error('write-state design audit cells require the external session binding secret')
  }
  assertAuditFixtureProvisionedReceipt(policy.receipt, {
    candidateSha: policy.candidateSha,
    sessionId: policy.sessionId,
    bindingSecret: policy.bindingSecret,
  })
  const receipt = policy.receipt as AuditFixtureReceipt
  const namespace = auditFixtureNamespace(policy.sessionId)
  if (receipt.namespace !== namespace) throw new Error(`write-state fixture is outside the ${namespace} namespace`)
  const fixtureOwnsRecord = receipt.created.some((group) => group.fixture === policy.fixture
    && group.ids.some((_, index) => group.lifecycle[index] === 'created'))
  const fixtureOwnsIdentity = receipt.ownedAuthUsers?.some((owner) => owner.fixture === policy.fixture
    && owner.lifecycle === 'created' && Boolean(owner.id)) ?? false
  if (!fixtureOwnsRecord && !fixtureOwnsIdentity) {
    throw new Error(`write-state fixture ${policy.fixture} has no audit-owned records in the ${namespace} namespace`)
  }
  if (receipt.cleanup.length > 0 || receipt.cleanupOnFailure.attempted || receipt.cleanupOnFailure.completed) {
    throw new Error(`write-state fixture ${policy.fixture} does not represent a live provisioned receipt`)
  }
}

export function validateAuditWriteReceipt(
  receipt: unknown,
  candidateSha: string,
  sessionId: string,
): ReturnType<typeof validateAuditFixtureReceipt> {
  return validateAuditFixtureReceipt(receipt, { candidateSha, sessionId })
}
