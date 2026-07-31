import { describe, it, expect } from 'vitest'
import { can, canViewRevenue, canViewMargin, REVENUE_VIEW_ROLES, MARGIN_VIEW_ROLES } from './capabilities'

describe('can', () => {
  it('grants admin both manage capabilities', () => {
    expect(can(['admin'], 'objective.manage')).toBe(true)
    expect(can(['admin'], 'workline.manage')).toBe(true)
  })

  it('grants ops_lead only workline.manage', () => {
    expect(can(['ops_lead'], 'workline.manage')).toBe(true)
    expect(can(['ops_lead'], 'objective.manage')).toBe(false)
  })

  it('denies member capabilities by default', () => {
    expect(can(['member'], 'objective.manage')).toBe(false)
    expect(can(['member'], 'workline.manage')).toBe(false)
  })

  it('denies empty and unknown role sets', () => {
    expect(can([], 'objective.manage')).toBe(false)
    expect(can(['unknown-role'], 'workline.manage')).toBe(false)
  })

  it('uses union semantics across multiple roles', () => {
    expect(can(['ops_lead', 'admin'], 'objective.manage')).toBe(true)
    expect(can(['ops_lead', 'admin'], 'workline.manage')).toBe(true)
  })
})

describe('canViewRevenue / canViewMargin (ADR-0051 D4)', () => {
  // Deliberately LITERAL, not looped over REVENUE_VIEW_ROLES / MARGIN_VIEW_ROLES. These functions
  // are IMPLEMENTED from those constants, so `for (r of REVENUE_VIEW_ROLES) expect(canViewRevenue([r]))`
  // cannot fail — it restates the implementation instead of pinning the policy. An AC has to be
  // falsifiable independently of the code it governs: if someone adds a role to the constant, THIS
  // test must go red and force a deliberate decision, which the loop form silently rubber-stamps.
  it('AC-320: canViewRevenue admits finance/admin/manager/supervisor', () => {
    for (const r of ['finance', 'admin', 'manager', 'supervisor']) {
      expect(canViewRevenue([r])).toBe(true)
    }
    expect(REVENUE_VIEW_ROLES).toEqual(['finance', 'admin', 'manager', 'supervisor'])
  })
  it('AC-320: canViewMargin admits finance/admin/manager but NOT supervisor', () => {
    for (const r of ['finance', 'admin', 'manager']) expect(canViewMargin([r])).toBe(true)
    expect(canViewMargin(['supervisor'])).toBe(false)
    expect(MARGIN_VIEW_ROLES).toEqual(['finance', 'admin', 'manager'])
  })
  it('AC-320: neither admits member/empty', () => {
    expect(canViewRevenue(['member'])).toBe(false)
    expect(canViewRevenue([])).toBe(false)
    expect(canViewMargin(['member'])).toBe(false)
  })

  it('I-2: REVENUE_VIEW_ROLES and MARGIN_VIEW_ROLES are exported for router/destinations consistency', () => {
    // The VALUES are pinned by the two AC-320 tests above. What this one adds is that the two
    // constants are actually exported for router/destinations to consume — the drift I-2 targets.
    expect(REVENUE_VIEW_ROLES).toEqual(['finance', 'admin', 'manager', 'supervisor'])
    expect(MARGIN_VIEW_ROLES).toEqual(['finance', 'admin', 'manager'])
  })
})
