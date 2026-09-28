import { describe, expect, it } from 'vitest'
import { AUTHORITY_ACTIONS, AUTHORITY_ROLES, type RoleAuthorityRow } from '@/lib/db/admin-access.types'
import { heldAuthorityRoles, personAuthority } from './person-authority'

function table(grants: Record<string, RoleAuthorityRow['scope']>): RoleAuthorityRow[] {
  return AUTHORITY_ACTIONS.flatMap((action) => AUTHORITY_ROLES.map((role) => ({
    action, role, scope: role === 'admin' ? 'org' : grants[`${action}:${role}`] ?? 'none',
  })))
}

describe('personAuthority', () => {
  it('everyone holds Member; access roles and Team leadership add to it; BU head is never assumed', () => {
    expect(heldAuthorityRoles([], false)).toEqual(['member'])
    expect(heldAuthorityRoles(['ops_lead', 'finance', 'unknown'], true)).toEqual(['member', 'ops_lead', 'finance', 'team_lead'])
    expect(heldAuthorityRoles(['admin'], false)).not.toContain('bu_head')
  })

  it('takes the widest scope and names every held role that grants exactly it', () => {
    const rows = table({ 'signal.retract:member': 'own', 'signal.retract:ops_lead': 'own_bu', 'signal.retract:supervisor': 'own_bu' })
    const retract = personAuthority(rows, ['member', 'ops_lead', 'supervisor']).find((g) => g.action === 'signal.retract')!
    expect(retract).toEqual({ action: 'signal.retract', scope: 'own_bu', sources: ['ops_lead', 'supervisor'] })
  })

  it('an action nobody held grants reads none, with no source', () => {
    const post = personAuthority(table({}), ['member']).find((g) => g.action === 'signal.post')!
    expect(post).toEqual({ action: 'signal.post', scope: 'none', sources: [] })
  })

  it('Admin is organization-wide on every action', () => {
    for (const grant of personAuthority(table({}), ['member', 'admin'])) {
      expect(grant.scope).toBe('org')
      expect(grant.sources).toEqual(['admin'])
    }
  })
})
