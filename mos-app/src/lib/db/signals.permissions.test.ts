import { describe, expect, it } from 'vitest'
import { canPostTo, canRetract } from './signals.permissions'

describe('Signal permissions (AC-008)', () => {
  const viewer = { personId: 'cahya', accessRoles: ['ops_lead'] as string[], teamIds: ['cikal'], businessUnitIds: ['retail'] }
  it('allows the author, an owning-team lead, or signal.retract and denies peers', () => {
    expect(canRetract({ ...viewer, personId: 'author' }, { authorId: 'author', owningTeamId: 'cikal', leadTeamIds: [] })).toBe(true)
    expect(canRetract({ ...viewer, accessRoles: ['member'], teamIds: [] }, { authorId: 'author', owningTeamId: 'cikal', leadTeamIds: ['cikal'] })).toBe(true)
    expect(canRetract({ ...viewer, accessRoles: ['member'] }, { authorId: 'author', owningTeamId: 'cikal', leadTeamIds: [] })).toBe(false)
  })
  it('mirrors member, lead-unit, and capability post scope', () => {
    expect(canPostTo({ personId: 'member', accessRoles: ['member'], teamIds: ['cikal'], businessUnitIds: [] }, { id: 'hq', businessUnitId: 'retail' })).toBe(false)
    expect(canPostTo({ ...viewer, accessRoles: ['ops_lead'] }, { id: 'hq', businessUnitId: 'retail' })).toBe(true)
    expect(canPostTo({ ...viewer, accessRoles: ['supervisor'], teamIds: ['cikal'], businessUnitIds: ['retail'] }, { id: 'b2b', businessUnitId: 'b2b' })).toBe(false)
  })
})
