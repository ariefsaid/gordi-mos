import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
import { REVENUE_VIEW_ROLES } from '@/lib/capabilities'
import { isShipGated } from '@/lib/ship-gate'
import { CAFE_SECTIONS, CAFE_MODULE_SECTIONS, sectionForPath, visibleSections, type Section } from './sections'
import {
  HomeIcon, TasksIcon, InboxIcon, WorkLineIcon, ObjectiveIcon,
  WorkIcon, EventsIcon, SignalsIcon, MoneyIcon,
  CafeIcon, EcommerceIcon, RoasteryIcon,
  ProfileIcon, ShieldIcon, PeopleIcon,
} from './icons'

/**
 * DESTINATIONS — Redesign Step 2 (D-PLN-4). Three registries map 1:1 to the
 * convergence rail's three zones (Workspace / Modules / Utility):
 *
 *  - `DESTINATIONS` — the 4 workspace roots (Home · Work · Money · Inbox).
 *    Used by the rail Workspace zone + the phone bottom-nav primary tabs.
 *    Signals is declared as a CHILD of Work below, not as a root. Whether it
 *    should be promoted to a root is open (issue 483) — this line states what
 *    the array declares today, and settles nothing.
 *  - `MODULES`     — 2 BU groups (Retail Ops [Café, Ecommerce], B2B Ops [Roastery]).
 *  - `UTILITY`     — 2 entries (Admin Settings [gated admin], Personal Profile). Nav
 *    surfaces draw `navUtility()` (Admin only); Personal Profile lives in the UserChip menu.
 *
 * Work declares 5 always-expanded children, in this order — Signals · Tasks · Projects &
 * Processes · Objectives · Events (OD-REDESIGN-57(ii), oracle P-13 — owner-ruled; #544) — with
 * 0 family headings (Rule 3 caps). Events is ship-gated (#348), so 4 of the 5 render today. Money is
 * anyOf-gated on REVENUE_VIEW_ROLES; Admin is anyOf-gated (admin) — absent, not
 * disabled, when unauthorized (Rule 9 parity, SALVAGE #8). `isLive` and
 * `destinationForPath` resolve across all three zones so the breadcrumb and
 * aria-current logic see one owner per route.
 */
export type DestinationId =
  | 'home' | 'work' | 'money' | 'inbox'
  | 'cafe' | 'ecommerce' | 'roastery'
  | 'admin' | 'profile'

export type DestinationZone = 'workspace' | 'modules' | 'utility'

export interface Destination {
  id: DestinationId
  labelKey: MessageKey
  Icon: React.FC
  /** live links under this destination; [] = destination not yet rolled in */
  links: Section[]
  /** Always-expanded sub-links rendered beneath the entry (Work's 5; Café's 5). Undefined for a
   *  destination whose root IS the whole surface. */
  children?: Section[]
  /** optional access gate applied to ALL links (rail/bottom-bar hide when unsatisfied).
   *  `readonly` so the shared role constants (REVENUE_VIEW_ROLES) can be assigned directly —
   *  narrowing this to `string[]` is what forced a re-typed literal here in the first place. */
  anyOf?: readonly string[]
  /** primary route a bottom-tab / Work-parent taps (defaults to links[0].path) */
  primaryPath?: string
  zone: DestinationZone
  /** modules only: renders in the rail iff a viewer JOB ROLE name matches (OD-REDESIGN-68) */
  workMatch?: RegExp
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'home',
    zone: 'workspace',
    labelKey: 'dest.home',
    Icon: HomeIcon,
    primaryPath: '/',
    links: [{ path: '/', label: 'Home', labelKey: 'nav.home', Icon: HomeIcon }],
  },
  {
    id: 'work',
    zone: 'workspace',
    labelKey: 'dest.work',
    Icon: WorkIcon,
    primaryPath: '/work/tasks',
    links: [{ path: '/work/tasks', label: 'Tasks', labelKey: 'nav.work.tasks', Icon: TasksIcon }],
    // Always-expanded children, 0 family headings (Rule 3). Projects & Processes
    // is capability-gated (FR-424): rendered in the rail only for a holder of the named
    // capability; RequireCapability is the real route gate.
    //
    // **This array's ORDER is the canonical nav order — the only one (#446).** The order's
    // authority is the owner frame sketch (OD-REDESIGN-57(ii), oracle row P-13 — owner-word):
    // Signals · Tasks · Projects & Processes · Objectives · Events. E7 has no vote on the frame
    // (SALVAGE-INVENTORY explicit override #3). OD-REDESIGN-1 fixes WHICH children exist; DD-WAY-33
    // (#439) deleted the family EYEBROWS, which left the nesting a pure re-sort with no rendered
    // trace. Holding that re-sort in `rail-nav.tsx` (`WORK_SUBSECTION_ORDER`) made the desktop rail
    // a second source of order, and the phone drawer — which renders this array as declared — a
    // third surface disagreeing with it: a person who learned the list on a laptop had to relearn
    // it on their phone. The re-sort is gone; every surface renders declaration order (#476). The
    // order this replaced — Tasks · Projects & Processes · Objectives · Signals · Events — came
    // from #458's deleted desktop re-sort, which #476 unified onto: the wrong one of the two.
    children: [
      { path: '/work/signals', label: 'Signals', labelKey: 'nav.work.signals', Icon: SignalsIcon },
      { path: '/work/tasks', label: 'Tasks', labelKey: 'nav.work.tasks', Icon: TasksIcon },
      { path: '/work/projects', label: 'Projects & Processes', labelKey: 'nav.work.projects', Icon: WorkLineIcon, capability: 'workline.manage' },
      // OD-V4-1 (owner-ratified 2026-07-27, docs/v4-inheritance.md INC-1): "Objectives are visible
      // to everyone" — NO capability gate on this rail entry. mos.objectives SELECT RLS
      // (objectives_select_org, …0624000001_mos_cascade_lookups.sql) has no role check, only the
      // org_id tenancy seam, so every authenticated org member can already read the data the
      // server serves; the `capability: 'objective.manage'` gate here was hiding a screen RLS
      // already permitted (the defect this fixes). Write stays behind `can('objective.manage')`
      // inside ObjectivesPage's own mutations — that capability is a WRITE gate, not a read one.
      { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.work.objectives', Icon: ObjectiveIcon },
      { path: '/work/events', label: 'Events', labelKey: 'nav.work.events', Icon: EventsIcon },
    ],
  },
  {
    id: 'money',
    zone: 'workspace',
    labelKey: 'dest.money',
    Icon: MoneyIcon,
    // Money is the successor of `dev`'s Plan destination, and it inherits Plan's gate rather than
    // v4's narrower one. `dev` grants a financial VIEW tier to manager (ADR-0050 D8, AC-128) and a
    // revenue-only VIEW tier to supervisor (ADR-0051, AC-327) — owner-locked visibility that exists
    // on this line and nowhere else. v4-redesign predates both and gates all of Money on
    // finance|admin; carrying that literal across takes Money out of the rail AND the phone drawer
    // for two whole tiers while the ROUTE still admits them, leaving the surface reachable only by
    // typing a URL.
    //
    // The CONSTANT, not a re-typed literal: `/money`'s route gate reads the same one (router.tsx),
    // so rail and route cannot drift apart — `destinations.test.ts` asserts that identity. Planning
    // (budget/pricing) is a different question and stays finance|admin at the route: a VIEW tier is
    // not a planning tier (FR-112, FR-315).
    anyOf: REVENUE_VIEW_ROLES,
    primaryPath: '/money',
    links: [{ path: '/money', label: 'Money', labelKey: 'nav.money', Icon: MoneyIcon }],
  },
  {
    id: 'inbox',
    zone: 'workspace',
    labelKey: 'dest.inbox',
    Icon: InboxIcon,
    primaryPath: '/inbox',
    links: [{ path: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', Icon: InboxIcon }],
  },
]

export const MODULES: { bu: MessageKey; items: Destination[] }[] = [
  {
    bu: 'rail.retailOps',
    items: [
      // Café carries its five working screens, not just its root. The port shipped this module
      // with a single `/cafe` link while CAFE_SECTIONS held all six paths, correctly labelled and
      // imported by nothing but a breadcrumb lookup — so Log, Plan, Stock, Review and Pushes, the
      // one module with live kitchen staff on it, became reachable only by typing a URL.
      //
      // `children` (not just `links`) is what actually renders them: every nav surface draws ONE
      // link per module at `primaryPath ?? links[0].path`, and the expanded child list is the
      // mechanism Work already uses. Review and Pushes carry the same `ops_lead|admin` gate their
      // ROUTE carries, so the rail never offers a link that bounces.
      { id: 'cafe', zone: 'modules', labelKey: 'dest.cafe', Icon: CafeIcon, primaryPath: '/cafe',
        workMatch: /caf[eé]|kitchen|\bbar\b|barista/i,
        links: CAFE_SECTIONS,
        children: CAFE_MODULE_SECTIONS },
      { id: 'ecommerce', zone: 'modules', labelKey: 'dest.ecommerce', Icon: EcommerceIcon, primaryPath: '/ecommerce',
        workMatch: /ecommerce/i, // NOT sales|crm — Sales is the b2b_sales BU (seed), no module yet (audit F6)
        links: [{ path: '/ecommerce', label: 'Ecommerce', labelKey: 'nav.ecommerce', Icon: EcommerceIcon }] },
    ],
  },
  {
    bu: 'rail.b2bOps',
    items: [
      { id: 'roastery', zone: 'modules', labelKey: 'dest.roastery', Icon: RoasteryIcon, primaryPath: '/roastery',
        workMatch: /roast/i,
        links: [{ path: '/roastery', label: 'Roastery', labelKey: 'nav.roastery', Icon: RoasteryIcon }] },
    ],
  },
]

/**
 * OD-WAY-51 (owner ruling): **navigation mirrors what the route admits.** If a route admits a
 * viewer, that viewer gets a rendered way in, at every viewport. The navigation is never narrower
 * than the authorization.
 *
 * So a module renders for whoever its ROUTE admits — `isLive` resolves the destination's own
 * access-role gate and nothing else. `workMatch` survives, but ONLY as emphasis: which module gets
 * promoted to the phone's bottom-tab slot and which one the context row names. It no longer
 * decides whether a link exists.
 *
 * What it used to do, and why the ruling exists: OD-REDESIGN-68 scoped modules to the viewer's own
 * work by matching their JOB-ROLE NAME against a regex. A substantial share of the roles actually
 * in use match none of those regexes, so Café's Log, Plan and Stock had no entry on any surface
 * for those viewers while the route admitted every authenticated viewer. (The roster itself is
 * deliberately untracked — see the public-repo rule in CLAUDE.md — so it is not enumerated here.)
 * Two comments justified the scoping by claiming "everyone
 * still reaches module routes via ⌘K"; the palette held seven hardcoded entries, none of them
 * Café. The justification was false, and it is gone rather than replaced.
 *
 * The ruling accepts the consequence: a Finance viewer now sees Café in their nav and may find it
 * clutter. If a surface's audience really should be narrower, the fix is to narrow the ROUTE —
 * never to hide the link while leaving the route open.
 */
export function allModules(accessRoles: string[]): Destination[] {
  return modulesByBU(accessRoles).flatMap((g) => g.items)
}

/**
 * Every module the viewer's ROUTES admit, grouped by the owning BU (OD-REDESIGN-1: "Modules
 * grouped by Business Unit"). Groups with no admitted item are dropped so the rail never renders
 * an empty overline.
 *
 * Takes access roles only. It used to take job-role NAMES too and filter on `workMatch`;
 * OD-WAY-51 removed that — see `allModules` above.
 */
export function modulesByBU(accessRoles: string[]): { bu: MessageKey; items: Destination[] }[] {
  return MODULES.map((g) => ({
    bu: g.bu,
    items: g.items.filter((m) => isLive(m, accessRoles)),
  })).filter((g) => g.items.length > 0)
}

/**
 * The module promoted to the phone bottom-nav's third slot — EMPHASIS, not visibility
 * (OD-WAY-51). `workMatch` still picks it: a barista's phone leads with Café, a roaster's with
 * Roastery. A viewer whose job-role name matches no module simply gets no promoted slot, and
 * reaches every module they are admitted to through the More drawer, which lists them all.
 *
 * Returns null rather than falling back to an arbitrary module: promoting one nobody asked for
 * would be a guess presented as a preference.
 */
export function primaryModuleForViewer(roleNames: string[], accessRoles: string[]): Destination | null {
  const joined = roleNames.join(' ')
  return (
    allModules(accessRoles).find((m) => m.workMatch != null && m.workMatch.test(joined)) ?? null
  )
}

/**
 * Whether the viewer is admitted to `path` — the ONE route-admission question, answered by the
 * SAME authority the rail uses and nothing else: the owning destination's `anyOf` gate (`isLive`)
 * plus the section's own `anyOf`/`capability` gate (`visibleSections`), which are kept identical to
 * the router's `RequireAccessRole` / `RequireCapability` branches.
 *
 * This exists for the one decision the rail structurally cannot make, because it is not navigation:
 * Home's failed-checks band, which links to `/cafe/log`. `OD-WAY-51` (owner, 2026-08-05) ruled that
 * **navigation mirrors what the route admits** and removed job-role-NAME regex matching as a
 * visibility model — measured against the real roster, `workMatch` left 5 of 10 job roles matching
 * no module at all, so viewers the route fully admitted were shown nothing. `viewerSeesCafe`
 * (#191) had reintroduced that same regex in this new spot; it is gone, and Home now asks the
 * question the rail asks. `workMatch` survives only as EMPHASIS (`primaryModuleForViewer`).
 *
 * A path with no owning destination is NOT admitted — an unknown route is a fail-closed answer,
 * not a permissive one.
 *
 * The ruling's consequence is accepted here as it is on the rail: `/cafe/log` carries no
 * access-role gate and `ops.kitchen_logs` is org-readable by policy, so every authenticated viewer
 * is admitted and every viewer's Home carries the band — empty when there is nothing rejected. If
 * that audience should be narrower, the fix is to narrow the ROUTE, never to hide the surface while
 * leaving the route open.
 */
export function viewerAdmittedToRoute(path: string, accessRoles: string[]): boolean {
  const destination = destinationForPath(path)
  if (!destination || !isLive(destination, accessRoles)) return false
  const section = sectionForPath(path)
  // No section entry means the destination's own gate is the whole answer (e.g. `/`).
  return section == null || visibleSections([section], accessRoles).length === 1
}

export const UTILITY: Destination[] = [
  {
    id: 'admin',
    zone: 'utility',
    labelKey: 'dest.admin',
    Icon: ShieldIcon,
    anyOf: ['admin'],
    primaryPath: '/admin/people',
    links: [{ path: '/admin/people', label: 'People', labelKey: 'nav.admin.people', Icon: PeopleIcon }],
  },
  {
    id: 'profile',
    zone: 'utility',
    labelKey: 'dest.profile',
    Icon: ProfileIcon,
    primaryPath: '/profile',
    links: [{ path: '/profile', label: 'Personal Profile', labelKey: 'nav.profile', Icon: ProfileIcon }],
  },
]

/**
 * The Utility entries a NAV SURFACE draws for this viewer — Admin Settings when their roles admit
 * it, and nothing else.
 *
 * Personal Profile is deliberately absent: it moved into the UserChip menu (owner, 2026-08-26),
 * which renders on every viewport — the rail footer on desktop, the top of the More drawer on
 * phone — so `/profile` keeps a rendered, one-click way in without spending a rail row on it.
 *
 * `UTILITY` itself keeps the profile entry, because it is also the RESOLUTION registry:
 * `destinationForPath('/profile')` and the breadcrumb both read it, and dropping the row there
 * would leave the route with no owner. Nav surfaces call this; resolution reads UTILITY.
 *
 * The reachability guard (`nav-reachability.test.tsx`) opens the chip menu and counts its links,
 * so "moved into a menu" cannot quietly become "no way in" — the defect that file exists to catch.
 *
 * A function because it takes the viewer's roles, like every other filtered view this file exposes
 * — `allModules`, `modulesByBU`, `visibleSections`.
 */
export function navUtility(accessRoles: string[]): Destination[] {
  return UTILITY.filter((u) => u.id !== 'profile' && isLive(u, accessRoles))
}

/** All destinations across the three zones, in rail order (for resolution scans). */
const ALL_DESTINATIONS: Destination[] = [
  ...DESTINATIONS,
  ...MODULES.flatMap((g) => g.items),
  ...UTILITY,
]

/**
 * A destination renders (rail group / bottom tab) iff the ship gate leaves it visible, it has
 * >=1 live link, AND (no anyOf gate, or the viewer holds one of the gated roles).
 *
 * The ship gate (#444) is asked FIRST and asked for everyone. It is not another role gate sitting
 * beside `anyOf` — it is above it: a gated surface is outside the MVP payload, so it is closed to
 * every viewer regardless of what they hold, and the router closes the same path from the same
 * array. Money keeps its REVENUE_VIEW_ROLES gate untouched underneath, so switch day restores the
 * owner-locked VIEW tiers (ADR-0050 D8 / ADR-0051) by deleting one line from SHIP_GATED_PATHS.
 */
export function isLive(d: Destination, accessRoles: string[]): boolean {
  const entry = d.primaryPath ?? d.links[0]?.path
  if (entry !== undefined && isShipGated(entry)) return false
  if (d.anyOf && !d.anyOf.some((r) => accessRoles.includes(r))) return false
  return d.links.some((l) => !isShipGated(l.path))
}

/**
 * Returns the Destination that owns the given pathname (by matching one of its
 * links or Work children, exact-or-prefix — mirrors sectionForPath), scanning
 * all three zones. A record route `/work/tasks/:taskId` resolves to `work`
 * (the Tasks child). Returns null for a truly unknown path. Consumed by the
 * breadcrumb + aria-current logic to see one owner per route.
 */
export function destinationForPath(pathname: string): Destination | null {
  // #444: a ship-gated path has no owning destination — the same answer an unknown path gets, and
  // for the same reason (nothing routes there). Without this the breadcrumb would resolve
  // `/work/projects` to the Work destination and, with `sectionForPath` already closed, print
  // "Work · Tasks" over a surface that is neither.
  if (isShipGated(pathname)) return null
  for (const d of ALL_DESTINATIONS) {
    const candidates = [...d.links, ...(d.children ?? [])]
    for (const link of candidates) {
      if (link.path === '/') {
        if (pathname === '/') return d
      } else if (pathname === link.path || pathname.startsWith(link.path + '/')) {
        return d
      }
    }
  }
  return null
}
