/**
 * Fixture boundary for the audit project.
 *
 * Seeded personas are read-only evidence. A receiving-only journey must use a
 * caller-provisioned audit-owned identity whose email is namespaced to this
 * session; this module never creates, deletes, or relinks a shared user.
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
  writes: boolean
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
  const namespace = `design-audit-${sessionId}`
  if (!email.toLowerCase().includes(namespace)) {
    throw new Error(`audit-owned fixture ${email} is outside the ${namespace} namespace`)
  }
}

/**
 * Seeded personas are read-only. A manifest cell that exercises a write state
 * must opt into the per-run audit-owned identity and the caller must prove that
 * its setup/cleanup ran under the database lock.
 */
export function assertAuditFixtureWritePolicy(policy: AuditFixtureWritePolicy): void {
  if (!policy.writes) return
  void policy
  throw new Error(
    'write-state design audit cells are disabled until a database-verified per-run provisioner and cleanup receipt exist',
  )
}
