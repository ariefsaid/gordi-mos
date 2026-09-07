import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  can,
  canViewRevenue,
  canViewMargin,
  REVENUE_VIEW_ROLES,
  MARGIN_VIEW_ROLES,
  MONEY_READ_POLICY_MIGRATION,
} from './capabilities'

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
  it('AC-320: canViewRevenue admits finance/manager/supervisor', () => {
    for (const r of ['finance', 'manager', 'supervisor']) {
      expect(canViewRevenue([r])).toBe(true)
    }
    expect(REVENUE_VIEW_ROLES).toEqual(['finance', 'manager', 'supervisor'])
  })
  it('AC-320: canViewMargin admits finance/manager but NOT supervisor', () => {
    for (const r of ['finance', 'manager']) expect(canViewMargin([r])).toBe(true)
    expect(canViewMargin(['supervisor'])).toBe(false)
    expect(MARGIN_VIEW_ROLES).toEqual(['finance', 'manager'])
  })
  it('AC-320: neither admits member/empty', () => {
    expect(canViewRevenue(['member'])).toBe(false)
    expect(canViewRevenue([])).toBe(false)
    expect(canViewMargin(['member'])).toBe(false)
  })

  // #797 / OD-WAY-98 (1): admin is the users-and-settings role. It reads no money by itself; the
  // Director reads Money by holding manager beside admin (the dev seed grants both).
  it('AC-004 (#797): admin alone reads no money; admin + manager does', () => {
    expect(canViewRevenue(['admin'])).toBe(false)
    expect(canViewMargin(['admin'])).toBe(false)
    expect(canViewRevenue(['admin', 'manager'])).toBe(true)
    expect(canViewMargin(['admin', 'manager'])).toBe(true)
    expect(REVENUE_VIEW_ROLES).not.toContain('admin')
    expect(MARGIN_VIEW_ROLES).not.toContain('admin')
  })

  it('I-2: REVENUE_VIEW_ROLES and MARGIN_VIEW_ROLES are exported for router/destinations consistency', () => {
    // The VALUES are pinned by the two AC-320 tests above. What this one adds is that the two
    // constants are actually exported for router/destinations to consume — the drift I-2 targets.
    expect(REVENUE_VIEW_ROLES).toEqual(['finance', 'manager', 'supervisor'])
    expect(MARGIN_VIEW_ROLES).toEqual(['finance', 'manager'])
  })
})

// ── One source: the UI sets equal the role arms of the database SELECT policies ──────────────
// The mirror comment at the top of capabilities.ts is a promise; this reads the migration that
// owns the two policies and holds the promise. The DOWN block in the header is commented out and
// still names admin, so comment lines are dropped before the policies are read — a fixture that
// parsed the whole file would pass on the rollback text.
describe('AC-004 (#797): UI role sets equal the reporting SELECT policy arms', () => {
  const sql = readFileSync(
    join(__dirname, '..', '..', '..', 'supabase', 'migrations', MONEY_READ_POLICY_MIGRATION),
    'utf8',
  )
  const live = sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

  /** The access roles named in `create policy <name> ...` up to the next statement's `;`. */
  function policyRoles(name: string): string[] {
    const start = live.indexOf(`create policy ${name} `)
    expect(start, `${name} is created in ${MONEY_READ_POLICY_MIGRATION}`).toBeGreaterThan(-1)
    const body = live.slice(start, live.indexOf(';', start))
    return [...body.matchAll(/has_access_role\('([a-z_]+)'\)/g)].map((m) => m[1])
  }

  it('sales_daily_revenue_select names exactly REVENUE_VIEW_ROLES', () => {
    expect(policyRoles('sales_daily_revenue_select').sort()).toEqual([...REVENUE_VIEW_ROLES].sort())
  })
  it('sales_margin_daily_select names exactly MARGIN_VIEW_ROLES', () => {
    expect(policyRoles('sales_margin_daily_select').sort()).toEqual([...MARGIN_VIEW_ROLES].sort())
  })
  it('the fixture can fail: the commented DOWN block still names admin, and is excluded', () => {
    expect(sql).toMatch(/^--.*has_access_role\('admin'\)/m)
    expect(live).not.toMatch(/has_access_role\('admin'\)/)
  })
})
