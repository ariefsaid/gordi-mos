import { describe, expect, it } from 'vitest'
import { canReviewCafeFailedChecks, homePersona, holdsHomeCockpitScope } from './home-composition'

const member = {
  roles: [],
  isManager: false,
  accessRoles: ['member'],
  affiliated: [],
}

describe('Home composition authority', () => {
  it('limits Failed checks to Café affiliation or admin', () => {
    expect(canReviewCafeFailedChecks({ affiliated: ['cafe'], accessRoles: ['member'] })).toBe(true)
    expect(canReviewCafeFailedChecks({ affiliated: [], accessRoles: ['admin'] })).toBe(true)
    expect(canReviewCafeFailedChecks({ affiliated: [], accessRoles: ['finance'] })).toBe(false)
    expect(canReviewCafeFailedChecks({ affiliated: [], accessRoles: ['ops_lead'] })).toBe(false)
  })

  it('makes a reporting-line manager a cockpit viewer even without a stored manage grant', () => {
    const viewer = { ...member, isManager: true }
    expect(holdsHomeCockpitScope(viewer, [])).toBe(true)
    expect(homePersona(viewer, [])).toBe('cockpit')
  })

  it('keeps an ordinary Café member on the member composition', () => {
    const viewer = { ...member, affiliated: ['cafe'] }
    expect(holdsHomeCockpitScope(viewer, [])).toBe(false)
    expect(homePersona(viewer, [])).toBe('member')
  })

  it('recognizes objective/work-line capability as a cockpit permission', () => {
    expect(homePersona({ ...member, accessRoles: ['ops_lead'] }, [])).toBe('cockpit')
  })
})
