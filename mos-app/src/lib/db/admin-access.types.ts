// The authority controls the admin surface is allowed to edit. Objective structure is NOT among
// them: since the OD-OBJ-1 policy switch, Objective writes read the objective.manage capability
// grant (admin's, migration-owned) and not the tenant matrix, so a saved objective.manage scope
// would do nothing — the control is retired rather than left as a lever that moves nothing.
export const AUTHORITY_ACTIONS = [
  'workline.manage',
  'signal.post',
  'signal.tag',
  'signal.retract',
  'process.start',
  'process.close',
  'agent.connect',
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
  'signal.post': ['none', 'org'],
  'signal.tag': ['none', 'org'],
  'signal.retract': ['none', 'own', 'own_team', 'own_bu', 'org'],
  'process.start': ['none', 'own_team', 'org'],
  'process.close': ['none', 'own', 'own_team', 'org'],
  'agent.connect': ['none', 'org'],
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
 * Validate the authority matrix returned by the settings RPC and return it in the stable UI
 * order. The RPC still returns the retired objective.manage row (its grant is migration-owned
 * now); it is dropped here before the completeness check, so the edit surface only ever sees
 * actions it can actually save. Missing or duplicate rows are a load failure, not an invitation
 * to invent a safe-looking `none` grant: defaulting here could silently wipe real authority on
 * save.
 */
export function normalizeAuthorityRows(rows: RoleAuthorityRow[]): RoleAuthorityRow[] {
  const byKey = new Map<string, AuthorityScope>()
  const retired = rows.filter((row) => (row.action as string) === 'objective.manage')
  const active = rows.filter((row) => (row.action as string) !== 'objective.manage')
  const expectedLength = AUTHORITY_ACTIONS.length * AUTHORITY_ROLES.length
  if (retired.length > AUTHORITY_ROLES.length) {
    throw new Error('Invalid role authority row')
  }
  if (active.length !== expectedLength) {
    throw new Error('Incomplete role authority matrix')
  }

  for (const row of active) {
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
