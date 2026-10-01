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
    [['manager'], true, true, 'all'],
  ] as const)('selects %s / hasReport=%s / orgWide=%s as %s', (accessRoles, hasReport, orgWide, expected) => {
    expect(getTaskDefaultView({ accessRoles, hasReport, orgWide })).toBe(expected)
  })
})
