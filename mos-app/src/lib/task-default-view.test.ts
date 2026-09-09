import { describe, expect, it } from 'vitest'
import { getTaskDefaultView } from './task-default-view'

describe('getTaskDefaultView (AC-013)', () => {
  it.each([
    [['member'], false, 'my-work'],
    [['ops_lead'], false, 'team-work'],
    [['supervisor'], false, 'team-work'],
    [['manager'], false, 'team-work'],
    [['member'], true, 'team-work'],
    [['admin'], true, 'all'],
  ] as const)('roles [%s], hasReport %s → %s', (accessRoles, hasReport, expected) => {
    expect(getTaskDefaultView({ accessRoles, hasReport })).toBe(expected)
  })
})
