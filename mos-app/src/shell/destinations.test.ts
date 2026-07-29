/**
 * DESTINATIONS model tests — the five-destination IA regroup (nav-five-destinations AC-400..408).
 * DESTINATIONS is the single source of truth consumed by both the desktop rail and the phone
 * bottom-tab bar (plan §1.5). Work = Tasks/Cascade/Updates(+catalog manage routes, capability-gated);
 * Operate = Daily Log + Kitchen; Plan = Sales (finance/admin-gated).
 */
import { describe, it, expect } from 'vitest'
import { DESTINATIONS, isLive, destinationForPath } from './destinations'
import { KITCHEN_SECTIONS } from './sections'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG, SHOW_PLAN_BUDGET } from '@/config/features'

describe('AC-400: DESTINATIONS — the five-destination regroup', () => {
  it('exports exactly the five destination ids in order: home, work, operate, plan, inbox', () => {
    expect(DESTINATIONS.map((d) => d.id)).toEqual(['home', 'work', 'operate', 'plan', 'inbox'])
  })

  it('home has a single link to "/" and is always live (no anyOf gate)', () => {
    const home = DESTINATIONS.find((d) => d.id === 'home')!
    expect(home.links.map((l) => l.path)).toEqual(['/'])
    expect(home.primaryPath).toBe('/')
    expect(isLive(home, [])).toBe(true)
  })

  it('AC-400: Work links = Tasks, Cascade, Updates(flag) ungated; NO Daily Log; catalog routes capability-gated', () => {
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    // Ungated links (no capability) show for everyone.
    const ungated = work.links.filter((l) => !l.capability).map((l) => l.path)
    expect(ungated).toEqual(['/tasks', '/work/cascade', ...(SHOW_WEEKLY_UPDATES ? ['/updates'] : [])])
    // Daily Log moved to Operate — must NOT appear under Work.
    expect(work.links.some((l) => l.path === '/ops')).toBe(false)
    // The two catalog manage routes carry a capability gate (FR-424, owner decision 2026-07-07):
    // rendered in the rail only for a holder of the named capability.
    const gated = work.links.filter((l) => l.capability).map((l) => [l.path, l.capability])
    expect(gated).toEqual([
      ['/work/objectives', 'objective.manage'],
      ['/work/projects-processes', 'workline.manage'],
    ])
    expect(isLive(work, [])).toBe(true)
  })

  it('AC-400/401: Operate owns Daily Log (first) + the Kitchen module; reuses KITCHEN_SECTIONS', () => {
    const operate = DESTINATIONS.find((d) => d.id === 'operate')!
    const paths = operate.links.map((l) => l.path)
    // Daily Log is first when its flag is on (jtbd §2 — most general, cross-Activity feed).
    expect(paths[0]).toBe(SHOW_DAILY_LOG ? '/ops' : '/kitchen/log')
    // The Kitchen module sections follow, verbatim (same Section objects — reused, not rebuilt).
    const kitchenSlice = operate.links.slice(SHOW_DAILY_LOG ? 1 : 0)
    expect(kitchenSlice).toEqual(KITCHEN_SECTIONS)
    expect(isLive(operate, [])).toBe(true)
  })

  it('AC-402: Plan = [Dashboard] gated finance/admin/manager; hidden (not live) for a member (no dead-end)', () => {
    const plan = DESTINATIONS.find((d) => d.id === 'plan')!
    expect(plan.anyOf).toEqual(['finance', 'admin', 'manager'])
    // Dashboard is always present; the ADR-0022 budget/pricing links are flag-gated (SHOW_PLAN_BUDGET).
    expect(plan.links.map((l) => l.path)).toEqual(
      SHOW_PLAN_BUDGET
        ? ['/dashboard', '/plan/budget', '/plan/pricing']
        : ['/dashboard'],
    )
    expect(isLive(plan, ['member'])).toBe(false)
    expect(isLive(plan, ['finance'])).toBe(true)
    expect(isLive(plan, ['admin'])).toBe(true)
  })

  it('AC-128: manager admits to the Plan destination (financial VIEW visibility, ADR-0050 D8)', () => {
    const plan = DESTINATIONS.find((d) => d.id === 'plan')!
    expect(isLive(plan, ['manager'])).toBe(true)
  })

  it('ADR-0022: budget/pricing Plan links carry i18n labelKeys (nav.planBudget / nav.planPricing) when the flag is on', () => {
    const plan = DESTINATIONS.find((d) => d.id === 'plan')!
    const budget = plan.links.find((l) => l.path === '/plan/budget')
    const pricing = plan.links.find((l) => l.path === '/plan/pricing')
    if (SHOW_PLAN_BUDGET) {
      expect(budget?.labelKey).toBe('nav.planBudget')
      expect(pricing?.labelKey).toBe('nav.planPricing')
    } else {
      expect(budget).toBeUndefined()
      expect(pricing).toBeUndefined()
    }
  })

  it('AC-400: Inbox is live when its flag is on; Home is always live', () => {
    const inbox = DESTINATIONS.find((d) => d.id === 'inbox')!
    expect(inbox.links.map((l) => l.path)).toEqual(['/inbox'])
    expect(isLive(inbox, [])).toBe(true)
  })

  it('isLive gates on anyOf when present — unsatisfied role set is not live even with links', () => {
    const gated = { id: 'plan' as const, labelKey: 'dest.plan' as const, Icon: () => null,
      links: [{ path: '/x', label: 'X', Icon: () => null }], anyOf: ['finance', 'admin'] }
    expect(isLive(gated, [])).toBe(false)
    expect(isLive(gated, ['member'])).toBe(false)
    expect(isLive(gated, ['finance'])).toBe(true)
  })

  it('every destination has a labelKey, Icon, and links array', () => {
    DESTINATIONS.forEach((d) => {
      expect(d.labelKey).toBeTruthy()
      expect(typeof d.Icon).toBe('function')
      expect(Array.isArray(d.links)).toBe(true)
    })
  })
})

// Breadcrumb / bottom-tab resolution (FR-S03 + FR-424): a route resolves to its owning
// destination via exact-or-prefix match on the destination's links (capability-gated links included —
// so the Work tab stays active on /work/objectives and the breadcrumb reads "Work › Objectives").
describe('destinationForPath — resolution (FR-S03 / FR-424)', () => {
  it('AC-408: /work/objectives + /work/projects-processes resolve to Work; /dashboard to Plan', () => {
    expect(destinationForPath('/work/objectives')?.id).toBe('work')
    expect(destinationForPath('/work/projects-processes')?.id).toBe('work')
    expect(destinationForPath('/dashboard')?.id).toBe('plan')
  })

  it('AC-401: /ops resolves to Operate (moved out of Work)', () => {
    expect(destinationForPath('/ops')?.id).toBe('operate')
    expect(destinationForPath('/ops/new')?.id).toBe('operate')
  })

  it('returns the "work" destination for /tasks, /work/cascade, and /tasks/some-id (prefix match)', () => {
    expect(destinationForPath('/tasks')?.id).toBe('work')
    expect(destinationForPath('/work/cascade')?.id).toBe('work')
    expect(destinationForPath('/tasks/some-id')?.id).toBe('work')
  })

  it('returns the "operate" destination for every /kitchen/* route', () => {
    expect(destinationForPath('/kitchen/log')?.id).toBe('operate')
    expect(destinationForPath('/kitchen/plan')?.id).toBe('operate')
    expect(destinationForPath('/kitchen/review')?.id).toBe('operate')
  })

  it('returns the "home" destination for /', () => {
    expect(destinationForPath('/')?.id).toBe('home')
  })

  it('returns null for a path owned by no destination (e.g. /admin/people, /unknown)', () => {
    expect(destinationForPath('/admin/people')).toBeNull()
    expect(destinationForPath('/unknown-xyz')).toBeNull()
  })
})
