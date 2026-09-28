// What one person can do, read off the role authority table the Roles & permissions tab edits.
// Pure and client-side: it explains the table, it grants nothing. The database stays the only
// enforcement point.

import type { MessageKey } from '@/i18n/messages'
import type { Translate } from '@/i18n/use-t'
import { localizedRoleMeta } from '@/lib/db/admin-users.types'
import {
  AUTHORITY_ACTIONS,
  type AuthorityAction,
  type AuthorityRole,
  type AuthorityScope,
  type RoleAuthorityRow,
} from '@/lib/db/admin-access.types'

const SCOPE_RANK: Record<AuthorityScope, number> = { none: 0, own: 1, own_team: 2, own_bu: 3, org: 4 }

export interface PersonAuthority {
  action: AuthorityAction
  /** The widest scope any of the person's roles grants for this action. */
  scope: AuthorityScope
  /** Every held role granting exactly that scope, in table order. Empty when scope is `none`. */
  sources: AuthorityRole[]
}

/**
 * Roles this person holds in the authority table's vocabulary: Member always (everyone receives
 * it), their access roles, and Team lead when they lead at least one Team. BU head is left out on
 * purpose — it comes from a Position at the top of a Business Unit, which this screen cannot see.
 */
export function heldAuthorityRoles(accessRoles: readonly string[], leadsATeam: boolean): AuthorityRole[] {
  const held = new Set<AuthorityRole>(['member'])
  for (const role of ['ops_lead', 'admin', 'finance', 'manager', 'supervisor'] as const) {
    if (accessRoles.includes(role)) held.add(role)
  }
  if (leadsATeam) held.add('team_lead')
  return [...held]
}

export function personAuthority(rows: readonly RoleAuthorityRow[], held: readonly AuthorityRole[]): PersonAuthority[] {
  return AUTHORITY_ACTIONS.map((action) => {
    const granted = rows.filter((row) => row.action === action && held.includes(row.role))
    const scope = granted.reduce<AuthorityScope>(
      (widest, row) => (SCOPE_RANK[row.scope] > SCOPE_RANK[widest] ? row.scope : widest),
      'none',
    )
    const sources = scope === 'none' ? [] : granted.filter((row) => row.scope === scope).map((row) => row.role)
    return { action, scope, sources }
  })
}

export const AUTHORITY_ACTION_LABEL_KEYS: Record<AuthorityAction, MessageKey> = {
  'workline.manage': 'admin.access.action.workline.manage',
  'objective.manage': 'admin.access.action.objective.manage',
  'signal.post': 'admin.access.action.signal.post',
  'signal.tag': 'admin.access.action.signal.tag',
  'signal.retract': 'admin.access.action.signal.retract',
  'process.start': 'admin.access.action.process.start',
  'process.close': 'admin.access.action.process.close',
}

export const AUTHORITY_SCOPE_LABEL_KEYS: Record<AuthorityScope, MessageKey> = {
  none: 'admin.access.noAccess',
  org: 'admin.access.scope.org',
  own_bu: 'admin.access.scope.own_bu',
  own_team: 'admin.access.scope.own_team',
  own: 'admin.access.scope.own',
}

/** One name per role on every Admin Settings screen: access roles use the same labels as the
 *  person's Access section; the two derived roles keep their own. */
export function authorityRoleLabel(role: AuthorityRole, t: Translate): string {
  if (role === 'team_lead') return t('admin.access.role.team_lead')
  if (role === 'bu_head') return t('admin.access.role.bu_head')
  return localizedRoleMeta(role, t).label
}
