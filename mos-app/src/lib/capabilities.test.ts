import { describe, it, expect } from 'vitest'
import { can, canViewRevenue, canViewMargin, REVENUE_VIEW_ROLES, MARGIN_VIEW_ROLES } from './capabilities'

describe('can', () => {
  it('grants admin both manage capabilities', () => {
    expect(can(['admin'], 'objective.manage')).toBe(true)
    expect(can(['admin'], 'workline.manage')).toBe(true)
  })

  // OD-V4-1 (supabase/migrations/20260805000006_mos_access_control.sql): ops_lead's
  // shared.role_capabilities seed already grants objective.manage — write at lead level, not
  // admin-only. This client mirror was stale relative to that DB-authoritative seed; the old
  // "ops_lead only workline.manage" assertion pinned the STALE mirror, not the shipped contract.
  it('grants ops_lead workline.manage and objective.manage (OD-V4-1)', () => {
    expect(can(['ops_lead'], 'workline.manage')).toBe(true)
    expect(can(['ops_lead'], 'objective.manage')).toBe(true)
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

  // Ported for #192 (Tasks): the due-runs banner gates "Start" on process.start. The seed
  // (20260805000006_mos_access_control.sql) grants it to member/ops_lead/admin — member's grant is
  // deliberately broad here (OD-REDESIGN-71iii); the server's can_start_process_for_team() pairs it
  // with a Team-membership check, so a member can only start their OWN team's run. process.adopt
  // stays admin-only.
  it('grants process.start to member/ops_lead/admin, process.adopt to admin only', () => {
    expect(can(['member'], 'process.start')).toBe(true)
    expect(can(['ops_lead'], 'process.start')).toBe(true)
    expect(can(['admin'], 'process.start')).toBe(true)
    expect(can(['finance'], 'process.start')).toBe(false)
    expect(can(['admin'], 'process.adopt')).toBe(true)
    expect(can(['ops_lead'], 'process.adopt')).toBe(false)
    expect(can(['member'], 'process.adopt')).toBe(false)
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
