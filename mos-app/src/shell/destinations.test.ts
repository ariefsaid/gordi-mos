/**
 * DESTINATIONS model tests — Redesign Step 2 (T4). Three-registry model (D-PLN-4):
 * DESTINATIONS (5 workspace roots) + MODULES (2 BU groups) + UTILITY (admin/profile).
 * Work has exactly 4 always-expanded children, 0 family headings. Money is anyOf-gated.
 * FR-001..005, FR-020/021, AC-011/012 prep.
 */
import { describe, it, expect } from 'vitest'
import { DESTINATIONS, MODULES, UTILITY, isLive, destinationForPath, viewerSeesCafe, type Destination } from './destinations'

describe('AC-011/012 prep (T4): DESTINATIONS — the five workspace roots', () => {
  it('exports exactly the five workspace ids in order: home, work, events, money, inbox', () => {
    expect(DESTINATIONS.map((d) => d.id)).toEqual(['home', 'work', 'events', 'money', 'inbox'])
  })

  it('every workspace destination is zone:workspace', () => {
    DESTINATIONS.forEach((d) => expect(d.zone).toBe('workspace'))
  })

  it('home has a single link to "/" and primaryPath "/" — always live', () => {
    const home = DESTINATIONS.find((d) => d.id === 'home')!
    expect(home.links.map((l) => l.path)).toEqual(['/'])
    expect(home.primaryPath).toBe('/')
    expect(isLive(home, [])).toBe(true)
  })

  it('AC-004/011: Work has exactly 4 children (signals · tasks · projects · objectives), 0 family headings', () => {
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    expect(work.children).toBeDefined()
    expect(work.children!.map((c) => c.path)).toEqual([
      '/work/signals',
      '/work/tasks',
      '/work/projects',
      '/work/objectives',
    ])
    expect(work.primaryPath).toBe('/work/tasks')
    expect(isLive(work, [])).toBe(true)
  })

  it('Work children projects/objectives carry capability gates (workline.manage / objective.manage)', () => {
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    const projects = work.children!.find((c) => c.path === '/work/projects')!
    const objectives = work.children!.find((c) => c.path === '/work/objectives')!
    expect(projects.capability).toBe('workline.manage')
    expect(objectives.capability).toBe('objective.manage')
  })

  it('AC-012: Money is anyOf finance/admin and isLive false for a plain member', () => {
    const money = DESTINATIONS.find((d) => d.id === 'money')!
    expect(money.anyOf).toEqual(['finance', 'admin'])
    expect(isLive(money, [])).toBe(false)
    expect(isLive(money, ['member'])).toBe(false)
    expect(isLive(money, ['finance'])).toBe(true)
    expect(isLive(money, ['admin'])).toBe(true)
  })

  it('events + inbox are always live (no anyOf gate)', () => {
    expect(isLive(DESTINATIONS.find((d) => d.id === 'events')!, [])).toBe(true)
    expect(isLive(DESTINATIONS.find((d) => d.id === 'inbox')!, [])).toBe(true)
  })

  it('every destination has a labelKey, Icon, links, and zone', () => {
    ;[...DESTINATIONS, ...UTILITY].forEach((d) => {
      expect(d.labelKey).toBeTruthy()
      expect(typeof d.Icon).toBe('function')
      expect(Array.isArray(d.links)).toBe(true)
      expect(d.zone).toBeTruthy()
    })
  })
})

describe('AC-011 prep (T4): MODULES — 2 BU groups, 3 module roots', () => {
  it('has exactly 2 BU groups (Retail Ops, B2B Ops) in order', () => {
    expect(MODULES.map((g) => g.bu)).toEqual(['rail.retailOps', 'rail.b2bOps'])
  })

  it('Retail Ops = [Café, Ecommerce]; B2B Ops = [Roastery]', () => {
    expect(MODULES[0].items.map((m) => m.id)).toEqual(['cafe', 'ecommerce'])
    expect(MODULES[1].items.map((m) => m.id)).toEqual(['roastery'])
  })

  it('module roots point at /cafe, /ecommerce, /roastery', () => {
    expect(MODULES[0].items[0].primaryPath).toBe('/cafe')
    expect(MODULES[0].items[1].primaryPath).toBe('/ecommerce')
    expect(MODULES[1].items[0].primaryPath).toBe('/roastery')
  })

  it('modules are zone:modules and ungated (reachable by everyone)', () => {
    MODULES.flatMap((g) => g.items).forEach((m) => {
      expect(m.zone).toBe('modules')
      expect(m.anyOf).toBeUndefined()
      expect(isLive(m, [])).toBe(true)
    })
  })
})

describe('AC-011/013 prep (T4): UTILITY — admin (gated) + profile', () => {
  it('has admin (anyOf admin) + profile (ungated) in order', () => {
    expect(UTILITY.map((u) => u.id)).toEqual(['admin', 'profile'])
  })

  it('AC-012: admin is absent (not live) for a non-admin', () => {
    const admin = UTILITY.find((u) => u.id === 'admin')!
    expect(admin.anyOf).toEqual(['admin'])
    expect(isLive(admin, [])).toBe(false)
    expect(isLive(admin, ['ops_lead'])).toBe(false)
    expect(isLive(admin, ['admin'])).toBe(true)
  })

  it('AC-013: profile is always live and links /profile', () => {
    const profile = UTILITY.find((u) => u.id === 'profile')!
    expect(isLive(profile, [])).toBe(true)
    expect(profile.primaryPath).toBe('/profile')
  })
})

// viewerSeesCafe — SEC-1 route hygiene: who may see cafe/kitchen surfaces (rail entry + Home
// failed-checks /cafe/log deep-link). Same honest role ceiling as the Café module's workMatch,
// PLUS ops_lead/admin who own the review queue org-wide. Fail-closed for unaffiliated personas.
describe('viewerSeesCafe (SEC-1 route hygiene, FLAG-B/G2)', () => {
  it('true for a viewer whose job role name matches the Café module (kitchen / cafe / bar / barista)', () => {
    expect(viewerSeesCafe(['Kitchen Lead'], ['member'])).toBe(true)
    expect(viewerSeesCafe(['Cafe Ops Lead'], ['member'])).toBe(true)
    expect(viewerSeesCafe(['Head Barista'], [])).toBe(true)
    expect(viewerSeesCafe(['Bar Supervisor'], [])).toBe(true)
  })

  it('true for ops_lead or admin regardless of job role (they own the review queue org-wide)', () => {
    expect(viewerSeesCafe([], ['ops_lead'])).toBe(true)
    expect(viewerSeesCafe([], ['admin'])).toBe(true)
    expect(viewerSeesCafe(['Finance Lead'], ['admin'])).toBe(true)
  })

  it('false (fail-closed) for a non-cafe persona: finance/HR/roastery job role, no ops_lead/admin', () => {
    expect(viewerSeesCafe(['Finance Lead'], ['finance'])).toBe(false)
    expect(viewerSeesCafe(['HR Manager'], ['member'])).toBe(false)
    expect(viewerSeesCafe(['Roastery Lead'], ['member'])).toBe(false)
    expect(viewerSeesCafe([], [])).toBe(false)
  })
})

// destinationForPath — resolves a route to its owning destination across all three zones
// (FR-S03 / AC-011). A record route /work/tasks/:id resolves to Work.
describe('destinationForPath — resolution across all three zones', () => {
  it('resolves /work/tasks/:taskId to work (record route → owning collection)', () => {
    expect(destinationForPath('/work/tasks/123')?.id).toBe('work')
  })

  it('resolves /work/signals, /work/projects, /work/objectives to work', () => {
    expect(destinationForPath('/work/signals')?.id).toBe('work')
    expect(destinationForPath('/work/projects')?.id).toBe('work')
    expect(destinationForPath('/work/objectives')?.id).toBe('work')
  })

  it('resolves /cafe/log (and /cafe) to the café module', () => {
    expect(destinationForPath('/cafe/log')?.id).toBe('cafe')
    expect(destinationForPath('/cafe')?.id).toBe('cafe')
    expect(destinationForPath('/cafe/review')?.id).toBe('cafe')
  })

  it('resolves /admin/people to admin (utility)', () => {
    expect(destinationForPath('/admin/people')?.id).toBe('admin')
  })

  it('resolves /profile to profile (utility)', () => {
    expect(destinationForPath('/profile')?.id).toBe('profile')
  })

  it('resolves /, /events, /money, /inbox to their workspace roots', () => {
    expect(destinationForPath('/')?.id).toBe('home')
    expect(destinationForPath('/events')?.id).toBe('events')
    expect(destinationForPath('/money')?.id).toBe('money')
    expect(destinationForPath('/inbox')?.id).toBe('inbox')
  })

  it('resolves /ecommerce, /roastery to their module roots', () => {
    expect(destinationForPath('/ecommerce')?.id).toBe('ecommerce')
    expect(destinationForPath('/roastery')?.id).toBe('roastery')
  })

  it('returns null for a truly unknown path', () => {
    expect(destinationForPath('/unknown-xyz')).toBeNull()
  })
})

// isLive gates on anyOf when present — independent of the real destinations.
describe('isLive — anyOf gate', () => {
  it('unsatisfied role set is not live even with links', () => {
    const gated: Destination = {
      id: 'inbox', zone: 'workspace', labelKey: 'dest.money', Icon: () => null,
      links: [{ path: '/x', label: 'X', Icon: () => null }], anyOf: ['finance', 'admin'],
    }
    expect(isLive(gated, [])).toBe(false)
    expect(isLive(gated, ['member'])).toBe(false)
    expect(isLive(gated, ['finance'])).toBe(true)
  })
})
