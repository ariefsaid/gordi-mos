import { describe, it, expect } from 'vitest'
import { can, canViewRevenue, canViewMargin } from './capabilities'

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
    for (const r of ['finance', 'admin', 'manager', 'supervisor']) {
      expect(canViewRevenue([r])).toBe(true)
    }
  })
  it('AC-320: canViewMargin admits finance/admin/manager but NOT supervisor', () => {
    for (const r of ['finance', 'admin', 'manager']) expect(canViewMargin([r])).toBe(true)
    expect(canViewMargin(['supervisor'])).toBe(false)
  })
  it('AC-320: neither admits member/empty', () => {
    expect(canViewRevenue(['member'])).toBe(false)
    expect(canViewRevenue([])).toBe(false)
    expect(canViewMargin(['member'])).toBe(false)
  })
})
