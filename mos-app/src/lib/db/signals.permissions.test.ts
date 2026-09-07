import { describe, expect, it } from 'vitest'
import { canPostTo, canRetract } from './signals.permissions'

describe('Signal permissions (AC-008)', () => {
  it.each([
    ['author', { personId: 'author', accessRoles: ['member'], leadsTeamIds: [] }, true],
    ['owning-team lead', { personId: 'cahya', accessRoles: ['member'], leadsTeamIds: ['cikal'] }, true],
    ['capability holder', { personId: 'cahya', accessRoles: ['ops_lead'], leadsTeamIds: [] }, true],
    ['peer', { personId: 'peer', accessRoles: ['member'], leadsTeamIds: [] }, false],
  ])('%s follows the database lead fact and capability gate', (_persona, viewer, expected) => {
    expect(canRetract(viewer, { authorId: 'author', owningTeamId: 'cikal' })).toBe(expected)
  })

  // canPostTo is a thin check over the DB destination allow-list (listReadableAuthorTeams). It
  // must not re-derive the server rule (DD-WAY-54): a Team on the list is postable, off it is not.
  it('canPostTo returns true for a Team on the eligible authoring list', () => {
    expect(canPostTo({ authoringTeamIds: ['cikal', 'radiant'] }, { id: 'cikal' })).toBe(true)
  })
  it('canPostTo returns false for a Team absent from the eligible authoring list', () => {
    expect(canPostTo({ authoringTeamIds: ['cikal', 'radiant'] }, { id: 'gordi_hq' })).toBe(false)
  })
})
