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
  it('AC-320: canViewRevenue admits finance/admin/manager/supervisor', () => {
    for (const r of REVENUE_VIEW_ROLES) {
      expect(canViewRevenue([r])).toBe(true)
    }
  })
  it('AC-320: canViewMargin admits finance/admin/manager but NOT supervisor', () => {
    for (const r of MARGIN_VIEW_ROLES) expect(canViewMargin([r])).toBe(true)
    expect(canViewMargin(['supervisor'])).toBe(false)
  })
  it('AC-320: neither admits member/empty', () => {
    expect(canViewRevenue(['member'])).toBe(false)
    expect(canViewRevenue([])).toBe(false)
    expect(canViewMargin(['member'])).toBe(false)
  })

  it('I-2: REVENUE_VIEW_ROLES and MARGIN_VIEW_ROLES are exported for router/destinations consistency', () => {
    // Verify the constant values match what the functions accept
    expect(REVENUE_VIEW_ROLES).toEqual(['finance', 'admin', 'manager', 'supervisor'])
    expect(MARGIN_VIEW_ROLES).toEqual(['finance', 'admin', 'manager'])
    // Verify the functions actually use these constants (no drift)
    expect(canViewRevenue(['manager'])).toBe(true)
    expect(canViewRevenue(['supervisor'])).toBe(true)
    expect(canViewMargin(['manager'])).toBe(true)
    expect(canViewMargin(['supervisor'])).toBe(false)
  })
})
