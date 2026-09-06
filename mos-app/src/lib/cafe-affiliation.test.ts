import { describe, expect, it } from 'vitest'
import { canCaptureCafe, type ViewerAffiliation } from './cafe-affiliation'

describe('AC-006 Café affiliation selector', () => {
  it('admits an affiliated viewer or an ops lead/admin, but not an ordinary reader', () => {
    expect(canCaptureCafe({ affiliated: ['cafe'], accessRoles: ['member'] })).toBe(true)
    expect(canCaptureCafe({ affiliated: [], accessRoles: ['ops_lead'] })).toBe(true)
    expect(canCaptureCafe({ affiliated: [], accessRoles: ['admin'] })).toBe(true)
    expect(canCaptureCafe({ affiliated: [], accessRoles: ['member'] })).toBe(false)
  })

  // #744 review: the selector fails CLOSED. A payload from before the field existed (stale
  // session) must answer unaffiliated, never inherit the old permissive default.
  it('fails closed when affiliated is empty or absent', () => {
    expect(canCaptureCafe({ affiliated: [], accessRoles: ['member'] })).toBe(false)
    const stale = { accessRoles: ['member'] } as unknown as ViewerAffiliation
    expect(canCaptureCafe(stale)).toBe(false)
  })
})
