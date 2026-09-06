import { describe, expect, it } from 'vitest'
import { canRetract } from './signals.permissions'

describe('Signal permissions (AC-008)', () => {
  it.each([
    ['author', { personId: 'author', accessRoles: ['member'], leadsTeamIds: [] }, true],
    ['owning-team lead', { personId: 'cahya', accessRoles: ['member'], leadsTeamIds: ['cikal'] }, true],
    ['capability holder', { personId: 'cahya', accessRoles: ['ops_lead'], leadsTeamIds: [] }, true],
    ['peer', { personId: 'peer', accessRoles: ['member'], leadsTeamIds: [] }, false],
  ])('%s follows the database lead fact and capability gate', (_persona, viewer, expected) => {
    expect(canRetract(viewer, { authorId: 'author', owningTeamId: 'cikal' })).toBe(expected)
  })
})
