import { describe, expect, it } from 'vitest'
import { canCaptureCafe } from './cafe-affiliation'

describe('AC-006 Café affiliation selector', () => {
  it('admits an affiliated viewer or an ops lead/admin, but not an ordinary reader', () => {
    expect(canCaptureCafe({ affiliated: ['cafe'], accessRoles: ['member'] })).toBe(true)
    expect(canCaptureCafe({ affiliated: [], accessRoles: ['ops_lead'] })).toBe(true)
    expect(canCaptureCafe({ affiliated: [], accessRoles: ['admin'] })).toBe(true)
    expect(canCaptureCafe({ affiliated: [], accessRoles: ['member'] })).toBe(false)
  })
})
