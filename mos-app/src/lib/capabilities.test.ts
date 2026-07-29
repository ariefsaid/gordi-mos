import { describe, it, expect } from 'vitest'
import { can, canViewFinance } from './capabilities'

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

// ADR-0050 D8 — dedupes the finance-view predicate previously duplicated inline
// in home-page.tsx and stacked-union-home.tsx.
describe('canViewFinance (ADR-0050 D8)', () => {
  it('AC-128: grants finance, admin, and manager', () => {
    expect(canViewFinance(['finance'])).toBe(true)
    expect(canViewFinance(['admin'])).toBe(true)
    expect(canViewFinance(['manager'])).toBe(true)
  })

  it('denies member and empty role sets', () => {
    expect(canViewFinance(['member'])).toBe(false)
    expect(canViewFinance([])).toBe(false)
  })
})
