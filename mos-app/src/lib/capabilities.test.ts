import { describe, it, expect } from 'vitest'
import { can } from './capabilities'

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

// Step 4 (ADR-0050 D7 / A2 seed): signal.create_for_team / signal.mention_bu / signal.retract are
// default-deny, granted to ops_lead/finance/admin (signal.create_for_team is finance-excluded per
// the A2 seed — finance never posts on behalf of another Team). member holds only signal.create
// (implicit — every authenticated viewer can post; no client gate needed for it).
describe('can — Signal capabilities (Step 4)', () => {
  it('grants ops_lead and admin signal.create_for_team; denies finance and member', () => {
    expect(can(['ops_lead'], 'signal.create_for_team')).toBe(true)
    expect(can(['admin'], 'signal.create_for_team')).toBe(true)
    expect(can(['finance'], 'signal.create_for_team')).toBe(false)
    expect(can(['member'], 'signal.create_for_team')).toBe(false)
  })

  it('grants ops_lead, finance, and admin signal.mention_bu; denies member', () => {
    expect(can(['ops_lead'], 'signal.mention_bu')).toBe(true)
    expect(can(['finance'], 'signal.mention_bu')).toBe(true)
    expect(can(['admin'], 'signal.mention_bu')).toBe(true)
    expect(can(['member'], 'signal.mention_bu')).toBe(false)
  })

  it('grants ops_lead, finance, and admin signal.retract; denies member', () => {
    expect(can(['ops_lead'], 'signal.retract')).toBe(true)
    expect(can(['finance'], 'signal.retract')).toBe(true)
    expect(can(['admin'], 'signal.retract')).toBe(true)
    expect(can(['member'], 'signal.retract')).toBe(false)
  })
})

// OD-REDESIGN-71iii (2026-07-19, reverses RATIFY-5): process.start now includes member (barista
// starts their own café opening — server double-gates on Team membership). Finance still denied.
describe('can — process.start (Step 6 + OD-71iii)', () => {
  it('grants ops_lead, admin, AND member process.start; denies finance', () => {
    expect(can(['ops_lead'], 'process.start')).toBe(true)
    expect(can(['admin'], 'process.start')).toBe(true)
    expect(can(['member'], 'process.start')).toBe(true)
    expect(can(['finance'], 'process.start')).toBe(false)
  })
})
