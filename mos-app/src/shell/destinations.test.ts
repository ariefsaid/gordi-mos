/**
 * DESTINATIONS model tests (plan §4.1, AC-D01).
 * DESTINATIONS is the single source of truth consumed by both the desktop
 * rail and the phone bottom-tab bar (plan §1.5).
 */
import { describe, it, expect } from 'vitest'
import { DESTINATIONS, isLive, destinationForPath } from './destinations'
import { KITCHEN_SECTIONS } from './sections'

describe('AC-D01: DESTINATIONS + isLive', () => {
  it('exports exactly the five destination ids in order: home, work, operate, plan, inbox', () => {
    expect(DESTINATIONS.map((d) => d.id)).toEqual(['home', 'work', 'operate', 'plan', 'inbox'])
  })

  it('home has a single link to "/" and is always live (no anyOf gate)', () => {
    const home = DESTINATIONS.find((d) => d.id === 'home')!
    expect(home.links).toEqual([{ path: '/', label: 'Home', Icon: home.links[0].Icon }])
    expect(isLive(home, [])).toBe(true)
  })

  it('AC-304: work has Tasks + Cascade links and is live for any viewer', () => {
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    expect(work.links).toHaveLength(2)
    expect(work.links.map((link) => link.path)).toEqual(['/tasks', '/work/cascade'])
    expect(work.links[1].labelKey).toBe('cascade.link')
    expect(isLive(work, [])).toBe(true)
  })

  it('operate reuses KITCHEN_SECTIONS verbatim and is live for any viewer', () => {
    const operate = DESTINATIONS.find((d) => d.id === 'operate')!
    expect(operate.links).toBe(KITCHEN_SECTIONS)
    expect(isLive(operate, [])).toBe(true)
  })

  it('AC-D01: plan and inbox have zero links and are NOT live for any role set', () => {
    const plan = DESTINATIONS.find((d) => d.id === 'plan')!
    const inbox = DESTINATIONS.find((d) => d.id === 'inbox')!
    expect(plan.links).toEqual([])
    expect(inbox.links).toEqual([])
    expect(isLive(plan, ['admin'])).toBe(false)
    expect(isLive(inbox, ['admin'])).toBe(false)
  })

  it('isLive gates on anyOf when present — unsatisfied role set is not live even with links', () => {
    const gated = { id: 'plan' as const, labelKey: 'dest.plan' as const, Icon: () => null,
      links: [{ path: '/x', label: 'X', Icon: () => null }], anyOf: ['finance', 'admin'] }
    expect(isLive(gated, [])).toBe(false)
    expect(isLive(gated, ['member'])).toBe(false)
    expect(isLive(gated, ['finance'])).toBe(true)
    expect(isLive(gated, ['admin'])).toBe(true)
  })

  it('every destination has a labelKey, Icon, and links array', () => {
    DESTINATIONS.forEach((d) => {
      expect(d.labelKey).toBeTruthy()
      expect(typeof d.Icon).toBe('function')
      expect(Array.isArray(d.links)).toBe(true)
    })
  })
})

// Breadcrumb resolution (plan §1.5/§4.1, spec home-v1 FR-S03): "/kitchen/log" reads
// "Operate › Log", "/tasks/123" reads "Work › Tasks" — the SECTION crumb is the
// owning destination's labelKey, the LEAF crumb is the specific link's own label.
describe('destinationForPath — breadcrumb resolution (FR-S03)', () => {
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

  it('returns null for a path owned by no destination (e.g. /admin/people, /sales)', () => {
    expect(destinationForPath('/admin/people')).toBeNull()
    expect(destinationForPath('/sales')).toBeNull()
    expect(destinationForPath('/unknown-xyz')).toBeNull()
  })
})
