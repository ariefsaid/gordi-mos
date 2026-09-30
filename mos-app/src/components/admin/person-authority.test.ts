import { describe, expect, it } from 'vitest'
import { AUTHORITY_ACTIONS, AUTHORITY_ROLES, type RoleAuthorityRow } from '@/lib/db/admin-access.types'
import { headedBusinessUnits, heldAuthorityRoles, personAuthority } from './person-authority'

function table(grants: Record<string, RoleAuthorityRow['scope']>): RoleAuthorityRow[] {
  return AUTHORITY_ACTIONS.flatMap((action) => AUTHORITY_ROLES.map((role) => ({
    action, role, scope: role === 'admin' ? 'org' : grants[`${action}:${role}`] ?? 'none',
  })))
}

describe('personAuthority', () => {
  it('everyone holds Member; access roles, Team leadership and heading a Business Unit add to it', () => {
    expect(heldAuthorityRoles([], false, false)).toEqual(['member'])
    expect(heldAuthorityRoles(['ops_lead', 'finance', 'unknown'], true, false)).toEqual(['member', 'ops_lead', 'finance', 'team_lead'])
    expect(heldAuthorityRoles(['admin'], false, false)).not.toContain('bu_head')
    expect(heldAuthorityRoles([], false, true)).toEqual(['member', 'bu_head'])
  })

  it('heads the active Business Units whose top Position they hold, and no other', () => {
    const tree = [
      { id: 'r-top', business_unit_id: 'bu-a', reports_to_role_id: null },
      { id: 'r-under', business_unit_id: 'bu-a', reports_to_role_id: 'r-top' },
      { id: 'r-cross', business_unit_id: 'bu-b', reports_to_role_id: 'r-top' },
    ]
    const units = [{ id: 'bu-a', name: 'Alpha' }, { id: 'bu-b', name: 'Beta' }]
    const held = (...ids: string[]) => ids.map((role_id) => ({ role_id, role_name: role_id }))
    expect(headedBusinessUnits(held('r-top'), tree, units)).toEqual(['Alpha'])
    expect(headedBusinessUnits(held('r-under'), tree, units)).toEqual([])
    // A Position under a parent in another unit is that unit's top.
    expect(headedBusinessUnits(held('r-cross'), tree, units)).toEqual(['Beta'])
    // An archived unit is not in the active list, so it has no head.
    expect(headedBusinessUnits(held('r-top', 'r-cross'), tree, [units[1]])).toEqual(['Beta'])
    expect(headedBusinessUnits([], tree, units)).toEqual([])
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
