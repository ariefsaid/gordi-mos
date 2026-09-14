import { describe, expect, it } from 'vitest'
import {
  AUTHORITY_ACTIONS,
  AUTHORITY_ROLES,
  getAllowedScopes,
  normalizeAuthorityRows,
  type RoleAuthorityRow,
} from './admin-access.types'

describe('admin access authority metadata', () => {
  it('keeps the editable matrix limited to the approved seven actions and eight role categories', () => {
    expect(AUTHORITY_ACTIONS).toEqual([
      'workline.manage',
      'objective.manage',
      'signal.post',
      'signal.tag',
      'signal.retract',
      'process.start',
      'process.close',
    ])
    expect(AUTHORITY_ROLES).toEqual([
      'member', 'team_lead', 'bu_head', 'ops_lead', 'admin', 'finance', 'manager', 'supervisor',
    ])
  })

  it('offers only runtime-enforceable scopes for each action', () => {
    expect(getAllowedScopes('workline.manage')).toEqual(['none', 'own_bu', 'org'])
    expect(getAllowedScopes('objective.manage')).toEqual(['none', 'own_bu', 'org'])
    expect(getAllowedScopes('signal.post')).toEqual(['none', 'org'])
    expect(getAllowedScopes('signal.tag')).toEqual(['none', 'org'])
    expect(getAllowedScopes('signal.retract')).toEqual(['none', 'own', 'own_team', 'own_bu', 'org'])
    expect(getAllowedScopes('process.start')).toEqual(['none', 'own_team', 'org'])
    expect(getAllowedScopes('process.close')).toEqual(['none', 'own', 'own_team', 'org'])
  })

  it('normalizes a complete response into one stable row per approved action and role', () => {
    const rows = AUTHORITY_ACTIONS.flatMap((action) => AUTHORITY_ROLES.map((role) => ({
      action,
      role,
      scope: role === 'admin' ? 'org' : role === 'member' && action === 'signal.post' ? 'org' : 'none',
    }))) satisfies RoleAuthorityRow[]

    const normalized = normalizeAuthorityRows(rows)

    expect(normalized).toHaveLength(AUTHORITY_ACTIONS.length * AUTHORITY_ROLES.length)
    expect(normalized).toContainEqual({ action: 'signal.post', role: 'member', scope: 'org' })
    expect(normalized).toContainEqual({ action: 'process.close', role: 'team_lead', scope: 'none' })
    expect(normalized).toContainEqual({ action: 'signal.post', role: 'admin', scope: 'org' })
  })

  it('rejects incomplete, duplicate, invalid, and non-fixed admin rows instead of defaulting them', () => {
    const rows: RoleAuthorityRow[] = [
      { action: 'signal.post', role: 'member', scope: 'org' },
      { action: 'process.close', role: 'team_lead', scope: 'own_team' },
    ]

    expect(() => normalizeAuthorityRows(rows)).toThrow(/incomplete/i)

    const complete = AUTHORITY_ACTIONS.flatMap((action) => AUTHORITY_ROLES.map((role) => ({
      action,
      role,
      scope: role === 'admin' ? 'org' : 'none',
    }))) satisfies RoleAuthorityRow[]
    expect(() => normalizeAuthorityRows([...complete, complete[0]!])).toThrow(/incomplete|duplicate/i)
    expect(() => normalizeAuthorityRows(complete.map((row, index) => index === 0 ? { ...row, scope: 'own' } : row))).toThrow(/scope/i)
    expect(() => normalizeAuthorityRows(complete.map((row) => row.role === 'admin' ? { ...row, scope: 'none' } : row))).toThrow(/admin/i)
  })
})
