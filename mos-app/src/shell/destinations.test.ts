/**
 * DESTINATIONS model tests — Redesign Step 2 (T4). Three-registry model (D-PLN-4):
 * DESTINATIONS (5 workspace roots) + MODULES (2 BU groups) + UTILITY (admin/profile).
 * Work has exactly 4 always-expanded children, 0 family headings. Money is anyOf-gated.
 * FR-001..005, FR-020/021, AC-011/012 prep.
 */
import { SHIP_GATED_PATHS } from '@/lib/ship-gate'
import { describe, it, expect } from 'vitest'
import {
  DESTINATIONS, MODULES, UTILITY, isLive, destinationForPath, viewerAdmittedToRoute,
  type Destination,
} from './destinations'
import { CAFE_SECTIONS, visibleSections } from './sections'
import { REVENUE_VIEW_ROLES } from '@/lib/capabilities'
import { isShipGated } from '@/lib/ship-gate'
import { routeConfig } from '@/router'
import { allRoutes } from '@/test/route-table'

describe('AC-011/012 prep (T4): DESTINATIONS — the five workspace roots', () => {
  it('exports workspace roots without a retired Events destination', () => {
    expect(DESTINATIONS.map((d) => d.id)).toEqual(['home', 'work', 'money', 'inbox'])
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

  // #446: the ORDER below is the assertion, not incidental. This array is now the single declared
  // nav order for Work's children — the E7 family sequence (Execution → Work systems → Direction →
  // Cadence) flattened, after DD-WAY-33 (#439) deleted the family eyebrows that were the only
  // rendered trace of the nesting. The desktop rail used to re-sort into this order locally while
  // the phone drawer rendered the array as declared, so the two surfaces listed the same five items
  // two ways. Both now render declaration order; `work-child-order.test.tsx` guards that they agree.
  it('Work has five children in ONE declared order, 0 family headings', () => {
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    expect(work.children).toBeDefined()
    expect(work.children!.map((c) => c.path)).toEqual([
      '/work/tasks',
      '/work/projects',
      '/work/objectives',
      '/work/signals',
      '/work/events',
    ])
    expect(work.primaryPath).toBe('/work/tasks')
    expect(isLive(work, [])).toBe(true)
  })

  // UPDATED, not relaxed. This case used to require `objective.manage` on the Objectives child
  // too. `OD-V4-1` (owner-ratified 2026-07-27) rules that Objectives are visible to everyone: the
  // SELECT policy on the objectives table carries only the org_id tenancy seam and no role check,
  // so every authenticated org member can already read what the server serves, and the rail gate
  // was hiding a screen the database already permits. Write stays behind `can('objective.manage')`
  // inside the page's own mutations — that capability is a WRITE gate, not a read one. The
  // authorizing ruling is cited in destinations.tsx beside the entry. Projects & Processes keeps
  // its gate, so the assertion below still proves the gate mechanism is live rather than removed.
  it('Work children: Projects & Processes is capability-gated (workline.manage); Objectives is NOT (OD-V4-1 — visible to everyone)', () => {
    const work = DESTINATIONS.find((d) => d.id === 'work')!
    const projects = work.children!.find((c) => c.path === '/work/projects')!
    const objectives = work.children!.find((c) => c.path === '/work/objectives')!
    expect(projects.capability).toBe('workline.manage')
    expect(objectives.capability).toBeUndefined()
  })

  it('AC-012: Money is anyOf REVENUE_VIEW_ROLES and isLive false for a plain member', () => {
    const money = DESTINATIONS.find((d) => d.id === 'money')!
    // Two distinct claims, deliberately not one. `toBe` against the constant alone is a tautology —
    // it passes even if someone edits the constant, which is exactly the drift these cases exist to
    // catch. So: the POLICY is pinned with a literal, and the fact that the rail CONSUMES the same
    // constant the /money route gate reads is pinned separately.
    expect(money.anyOf).toEqual(['finance', 'admin', 'manager', 'supervisor']) // the POLICY
    expect(money.anyOf).toBe(REVENUE_VIEW_ROLES) // consumes the CONSTANT
    expect(isLive(money, [])).toBe(false)
    expect(isLive(money, ['member'])).toBe(false)
    // …and since #444 the SHIP GATE closes Money above the role gate, so the two role-holders
    // below are false too. The `anyOf` assertions above are what keep this an act of hiding
    // rather than of deletion: the policy is intact and comes back the moment `/money` leaves
    // SHIP_GATED_PATHS. Asserted here rather than deleted, so nobody reads a bare `false` as
    // "finance lost financial visibility".
    expect(isShipGated('/money')).toBe(true)
    expect(isLive(money, ['finance'])).toBe(false)
    expect(isLive(money, ['admin'])).toBe(false)
  })

  // AC-128 / AC-327 carried across from `dev`'s Plan destination, which Money succeeds. They are
  // separate cases rather than two more lines in AC-012 because each pins one owner ruling on its
  // own: folding them in would let a future edit drop a tier without any case named after it going
  // red. The port narrowed this gate to the literal ['finance','admin'] and deleted both cases —
  // an assertion bent to the app on shipped, owner-locked visibility.
  // Both tiers are held on the REGISTRY rather than through `isLive`, because #444's ship gate
  // now closes Money for everyone — including them — and an `isLive` assertion could only say
  // "false", which is the same answer a deleted gate would give. The membership claim is the one
  // that still distinguishes the two, and it is what switch day restores.
  it('AC-128: manager holds financial VIEW visibility on the Money destination (ADR-0050 D8)', () => {
    const money = DESTINATIONS.find((d) => d.id === 'money')!
    expect(money.anyOf).toContain('manager')
  })

  it('AC-327: supervisor holds revenue-only VIEW visibility on the Money destination (ADR-0051)', () => {
    const money = DESTINATIONS.find((d) => d.id === 'money')!
    expect(money.anyOf).toContain('supervisor')
  })

  // The rail and the route must admit the same set, or Money is reachable by URL and invisible in
  // the nav (or the reverse — a rail entry that bounces). Both read the same constant; this asserts
  // the identity rather than trusting the two comments to stay in step.
  it('the Money rail gate and the /money route gate admit exactly the same roles', () => {
    const money = DESTINATIONS.find((d) => d.id === 'money')!
    const routeGate = allRoutes(routeConfig).find(
      (r) => Array.isArray(r.children) && r.children.some((c) => c.path === 'money'),
    )!
    const routeAnyOf = (routeGate.element as React.ReactElement<{ anyOf: readonly string[] }>).props.anyOf
    expect(money.anyOf).toBe(routeAnyOf)
  })

  it('inbox is always live (no anyOf gate)', () => {
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

  it('modules are zone:modules and ungated (reachable by everyone the ship gate leaves open)', () => {
    MODULES.flatMap((g) => g.items).forEach((m) => {
      expect(m.zone).toBe('modules')
      expect(m.anyOf).toBeUndefined()
      // No ROLE gate on any module — that is the claim. Whether it renders is then the ship
      // gate's answer alone (#444: Ecommerce and Roastery are post-MVP, Café ships), which is
      // exactly the separation the gate is for: above roles, never beside them.
      expect(isLive(m, [])).toBe(!isShipGated(m.primaryPath ?? m.links[0].path))
    })
    // The line above would pass on an empty list of modules, or on a list where every module
    // happened to be gated. Café is the module that ships.
    const cafe = MODULES.flatMap((g) => g.items).find((m) => m.id === 'cafe')!
    expect(isLive(cafe, [])).toBe(true)
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

// The Café module carries its five working screens as `children`, with Review + Pushes gated on
// the SAME access roles their routes enforce. The port shipped this module with one link and left
// CAFE_SECTIONS — all six paths, correctly labelled — imported by nothing but a breadcrumb lookup.
describe('Café module — the five screens are in the nav, gated as their routes are', () => {
  const cafe = MODULES.flatMap((g) => g.items).find((m) => m.id === 'cafe')!

  it('carries all five working screens as children, derived from CAFE_SECTIONS', () => {
    expect(cafe.children?.map((c) => c.path)).toEqual([
      '/cafe/log',
      '/cafe/plan',
      '/cafe/stock',
      '/cafe/review',
      '/cafe/pushes',
    ])
    // Derived, not re-listed: CAFE_SECTIONS minus the module home. Re-listing is how the two drift.
    expect(cafe.children).toEqual(CAFE_SECTIONS.filter((s) => s.path !== '/cafe'))
  })

  it('a plain kitchen member sees Log, Plan and Stock — and not Review or Pushes', () => {
    const visible = visibleSections(cafe.children ?? [], ['member']).map((c) => c.path)
    expect(visible).toEqual(['/cafe/log', '/cafe/plan', '/cafe/stock'])
  })

  it('ops_lead and admin also see Review and Pushes', () => {
    for (const role of ['ops_lead', 'admin']) {
      const visible = visibleSections(cafe.children ?? [], [role]).map((c) => c.path)
      expect(visible, role).toEqual([
        '/cafe/log',
        '/cafe/plan',
        '/cafe/stock',
        '/cafe/review',
        '/cafe/pushes',
      ])
    }
  })

  // #236 (FR-040) made the stream SUPERVISOR a reviewer — on the server and in the page — and
  // #238's cross-stack journey found that neither this rail nor the route had been told, so the
  // one person the slice exists for saw no link and was bounced off the URL. Pushes is untouched:
  // it is the dispatch surface, and opening review per stream opened nothing about posting.
  it('a stream supervisor sees Review — and still not Pushes (#236 FR-040)', () => {
    const visible = visibleSections(cafe.children ?? [], ['supervisor']).map((c) => c.path)
    expect(visible).toEqual(['/cafe/log', '/cafe/plan', '/cafe/stock', '/cafe/review'])
  })

  it("each gated nav entry carries the same role list as the route gate that OWNS it", () => {
    // Per-path, not per-pair: Review and Pushes now sit behind different gates, and an invariant
    // that assumed one shared gate would have had to be weakened to admit that. This form is
    // stronger — it would catch either link drifting from its own route.
    for (const [navPath, routePath] of [
      ['/cafe/review', 'cafe/review'],
      ['/cafe/pushes', 'cafe/pushes'],
    ] as const) {
      const routeGate = allRoutes(routeConfig).find(
        (r) => Array.isArray(r.children) && r.children.some((c) => c.path === routePath),
      )!
      const routeRoles = [
        ...(routeGate.element as React.ReactElement<{ anyOf: readonly string[] }>).props.anyOf,
      ].sort()
      const nav = cafe.children!.find((c) => c.path === navPath)!
      expect([...(nav.anyOf ?? [])].sort(), navPath).toEqual(routeRoles)
    }
  })
})

// viewerAdmittedToRoute — the ONE route-admission question (#246). OD-WAY-51: navigation mirrors
// what the route admits, and job-role NAMES decide nothing. Any surface that has to ask "should
// this viewer see the door to X" asks THIS, so a second visibility model cannot grow beside the
// rail's — which is exactly how `viewerSeesCafe` reintroduced the regex the ruling had removed.
describe('viewerAdmittedToRoute — one admission authority, shared with the rail (OD-WAY-51)', () => {
  it('agrees with the rail for EVERY Café screen, at every role — one answer, not two', () => {
    // The rule, not a hand-listed expectation: whatever `visibleSections` (the rail's own gate)
    // says about a Café screen, route admission says the same. A second model drifting from the
    // rail's fails here regardless of which roles or paths are involved.
    const cafe = MODULES.flatMap((g) => g.items).find((m) => m.id === 'cafe')!
    for (const roles of [[], ['member'], ['supervisor'], ['ops_lead'], ['admin'], ['finance']]) {
      const railSees = new Set(visibleSections(cafe.children ?? [], roles).map((s) => s.path))
      for (const section of cafe.children ?? []) {
        expect(viewerAdmittedToRoute(section.path, roles), `${section.path} @ [${roles}]`)
          .toBe(railSees.has(section.path))
      }
    }
  })

  it('an ungated route admits every authenticated viewer — including one with no access role at all', () => {
    // The failed-checks band's destination. `/cafe/log` carries no access-role gate and
    // ops.kitchen_logs is org-readable by policy, so admission is universal and the ruling's
    // consequence is accepted rather than papered over with a hidden second gate.
    expect(viewerAdmittedToRoute('/cafe/log', [])).toBe(true)
    expect(viewerAdmittedToRoute('/cafe/log', ['finance'])).toBe(true)
  })

  it('a gated route still narrows — admission is the ROUTE\'s answer, not a blanket yes', () => {
    // Without this, "admitted" would be indistinguishable from "always true" and the helper would
    // prove nothing. Review is supervisor/ops_lead/admin; Pushes is ops_lead/admin.
    expect(viewerAdmittedToRoute('/cafe/review', ['member'])).toBe(false)
    expect(viewerAdmittedToRoute('/cafe/review', ['supervisor'])).toBe(true)
    expect(viewerAdmittedToRoute('/cafe/pushes', ['supervisor'])).toBe(false)
    expect(viewerAdmittedToRoute('/cafe/pushes', ['ops_lead'])).toBe(true)
  })

  it('honours the DESTINATION-level gate too, not only the section gate', () => {
    expect(viewerAdmittedToRoute('/admin/people', ['member'])).toBe(false)
    expect(viewerAdmittedToRoute('/admin/people', ['admin'])).toBe(true)
    // Money was this case's second example until #444 gated it; `/money` is now closed to every
    // role, which proves nothing about the DESTINATION-level gate. `/admin/people` above still
    // does, and the ship gate's own effect on admission is asserted right below.
    for (const role of REVENUE_VIEW_ROLES) expect(viewerAdmittedToRoute('/money', [role]), role).toBe(false)
    expect(viewerAdmittedToRoute('/money', ['member'])).toBe(false)
  })

  it('issue 444: a ship-gated route admits nobody — the gate sits above every role', () => {
    // The strictest viewer there is: every access role the app knows. If the gate held only for
    // a plain member it would be a role gate wearing a different name.
    const everything = ['admin', 'finance', 'manager', 'supervisor', 'ops_lead', 'member']
    for (const path of SHIP_GATED_PATHS) {
      expect(viewerAdmittedToRoute(path, everything), path).toBe(false)
    }
    // …and an ungated route still admits them, so this is not passing on a broken helper.
    expect(viewerAdmittedToRoute('/work/tasks', everything)).toBe(true)
  })

  it('an unknown path is NOT admitted (fail closed, never a permissive default)', () => {
    expect(viewerAdmittedToRoute('/nope/nowhere', ['admin'])).toBe(false)
  })

  it('takes access roles ONLY — a job-role name cannot reach the decision (the OD-WAY-51 fix)', () => {
    // Structural, and deliberately so: the parameter that carried job-role NAMES is gone from the
    // signature, so no caller can reintroduce regex matching without changing this contract. The
    // roster measurement behind the ruling was that 5 of 10 real job roles matched no module regex.
    expect(viewerAdmittedToRoute.length).toBe(2)
    expect(String(viewerAdmittedToRoute)).not.toMatch(/workMatch/)
  })
})

// destinationForPath — resolves a route to its owning destination across all three zones
// (FR-S03 / AC-011). A record route /work/tasks/:id resolves to Work.
describe('destinationForPath — resolution across all three zones', () => {
  it('resolves /work/tasks/:taskId to work (record route → owning collection)', () => {
    expect(destinationForPath('/work/tasks/123')?.id).toBe('work')
  })

  it('resolves /work/signals and /work/tasks to work', () => {
    expect(destinationForPath('/work/signals')?.id).toBe('work')
    expect(destinationForPath('/work/tasks')?.id).toBe('work')
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

  it('resolves the live workspace roots', () => {
    expect(destinationForPath('/')?.id).toBe('home')
    expect(destinationForPath('/events')).toBeNull()
    expect(destinationForPath('/inbox')?.id).toBe('inbox')
  })

  // #444 — resolution closes with the gate. Each of these resolved to its owning destination
  // ('work' / 'money' / 'ecommerce' / 'roastery') until the ship gate hid the surface; a resolver
  // that still named it would let the breadcrumb print a page the viewer was forwarded away from.
  // Same answer an unknown path gets, for the same reason: nothing routes there.
  it.each([...SHIP_GATED_PATHS, '/money/detail'])(
    'the ship-gated %s has no owning destination',
    (path) => {
      expect(destinationForPath(path)).toBeNull()
    },
  )

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
