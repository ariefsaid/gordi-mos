/** The seven authority controls the admin surface is allowed to edit. */
export const AUTHORITY_ACTIONS = [
  'workline.manage',
  'objective.manage',
  'signal.post',
  'signal.tag',
  'signal.retract',
  'process.start',
  'process.close',
] as const

export type AuthorityAction = typeof AUTHORITY_ACTIONS[number]

/** Existing access roles plus the derived Team-lead and BU-head categories. */
export const AUTHORITY_ROLES = [
  'member',
  'team_lead',
  'bu_head',
  'ops_lead',
  'admin',
  'finance',
  'manager',
  'supervisor',
] as const
export type AuthorityRole = typeof AUTHORITY_ROLES[number]

export const AUTHORITY_SCOPES = ['none', 'org', 'own_bu', 'own_team', 'own'] as const
export type AuthorityScope = typeof AUTHORITY_SCOPES[number]

export interface RoleAuthorityRow {
  action: AuthorityAction
  role: AuthorityRole
  scope: AuthorityScope
}

export interface TeamLeadAssignment {
  team_id: string
  team_name: string
  business_unit_id: string | null
  lead_person_id: string | null
  lead_name: string | null
}

export interface TeamLeadCandidate {
  person_id: string
  full_name: string
}

const ALLOWED_SCOPES_BY_ACTION: Record<AuthorityAction, readonly AuthorityScope[]> = {
  'workline.manage': ['none', 'own_bu', 'org'],
  'objective.manage': ['none', 'own_bu', 'org'],
  'signal.post': ['none', 'org'],
  'signal.tag': ['none', 'org'],
  'signal.retract': ['none', 'own', 'own_team', 'own_bu', 'org'],
  'process.start': ['none', 'own_team', 'org'],
  'process.close': ['none', 'own', 'own_team', 'org'],
}

export function getAllowedScopes(action: AuthorityAction): readonly AuthorityScope[] {
  return ALLOWED_SCOPES_BY_ACTION[action]
}

function isAuthorityAction(value: string): value is AuthorityAction {
  return (AUTHORITY_ACTIONS as readonly string[]).includes(value)
}

function isAuthorityRole(value: string): value is AuthorityRole {
  return (AUTHORITY_ROLES as readonly string[]).includes(value)
}

function isAuthorityScope(value: string): value is AuthorityScope {
  return (AUTHORITY_SCOPES as readonly string[]).includes(value)
}

/**
 * Validate the complete authority matrix returned by the settings RPC and return it in the
 * stable UI order. Missing or duplicate rows are a load failure, not an invitation to invent a
 * safe-looking `none` grant: defaulting here could silently wipe real authority on save.
 */
export function normalizeAuthorityRows(rows: RoleAuthorityRow[]): RoleAuthorityRow[] {
  const byKey = new Map<string, AuthorityScope>()
  const expectedLength = AUTHORITY_ACTIONS.length * AUTHORITY_ROLES.length
  if (rows.length !== expectedLength) {
    throw new Error('Incomplete role authority matrix')
  }

  for (const row of rows) {
    if (!isAuthorityAction(row.action) || !isAuthorityRole(row.role) || !isAuthorityScope(row.scope)) {
      throw new Error('Invalid role authority row')
    }
    if (!getAllowedScopes(row.action).includes(row.scope)) {
      throw new Error('Invalid role authority scope')
    }
    if (row.role === 'admin' && row.scope !== 'org') {
      throw new Error('Admin authority must remain organization-wide')
    }
    const key = `${row.action}:${row.role}`
    if (byKey.has(key)) {
      throw new Error('Duplicate role authority row')
    }
    byKey.set(key, row.scope)
  }

  const normalized = AUTHORITY_ACTIONS.flatMap((action) => AUTHORITY_ROLES.map((role) => {
    const scope = byKey.get(`${action}:${role}`)
    if (!scope) throw new Error('Missing role authority row')
    return { action, role, scope }
  }))

  if (normalized.length !== expectedLength) {
    throw new Error('Incomplete role authority matrix')
  }
  return normalized
}
