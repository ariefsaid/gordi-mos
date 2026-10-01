import { describe, expect, it } from 'vitest'
import { getTaskDefaultView } from './task-default-view'

describe('getTaskDefaultView (OD-WAY-94 default scope)', () => {
  it.each([
    [['member'], false, false, 'my-work'],
    [['ops_lead'], false, false, 'team-work'],
    [['supervisor'], false, false, 'team-work'],
    [['manager'], false, false, 'team-work'],
    [['member'], true, false, 'team-work'],
    [['member'], false, true, 'all'],
    [['admin'], true, false, 'all'],
    [['admin', 'member'], true, false, 'all'],
  ] as const)('selects %s / hasReport=%s / isOwnerDirector=%s as %s', (accessRoles, hasReport, isOwnerDirector, expected) => {
    expect(getTaskDefaultView({ accessRoles, hasReport, isOwnerDirector })).toBe(expected)
  })
})
