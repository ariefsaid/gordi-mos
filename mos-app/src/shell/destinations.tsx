import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
import { REVENUE_VIEW_ROLES } from '@/lib/capabilities'
import type { Section } from './sections'
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
 *  - `DESTINATIONS` — the 5 workspace roots (Home · Work · Signals · Money · Inbox).
 *    Used by the rail Workspace zone + the phone bottom-nav primary tabs.
 *  - `MODULES`     — 2 BU groups (Retail Ops [Café, Ecommerce], B2B Ops [Roastery]).
 *  - `UTILITY`     — 2 entries (Admin Settings [gated admin], Personal Profile).
 *
 * Work owns exactly 4 always-expanded children (Signals · Tasks · Projects &
 * Processes · Objectives) with 0 family headings (Rule 3 caps). Money is
 * anyOf-gated on REVENUE_VIEW_ROLES; Admin is anyOf-gated (admin) — absent, not
 * disabled, when unauthorized (Rule 9 parity, SALVAGE #8). `isLive` and
 * `destinationForPath` resolve across all three zones so the breadcrumb and
 * aria-current logic see one owner per route.
 */
export type DestinationId =
  | 'home' | 'work' | 'events' | 'money' | 'inbox'
  | 'cafe' | 'ecommerce' | 'roastery'
  | 'admin' | 'profile'

export type DestinationZone = 'workspace' | 'modules' | 'utility'

export interface Destination {
  id: DestinationId
  labelKey: MessageKey
  Icon: React.FC
  /** live links under this destination; [] = destination not yet rolled in */
  links: Section[]
  /** Work's always-expanded switcher (4, flat); undefined for non-Work destinations */
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
    // Always-expanded 4 children, 0 family headings (Rule 3). Projects & Processes
    // + Objectives are capability-gated (FR-424): rendered in the rail only for a
    // holder of the named capability; RequireCapability is the real route gate.
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
    ],
  },
  {
    // OD-V4-2 ("Signals everywhere", owner-ratified 2026-07-27, docs/v4-inheritance.md INC-2):
    // the noun "Events" is retired from the UI. This root's rendered label is now "Signals" (the
    // live company-wide feed) via dest.events/nav.events in messages.ts — the Work child at
    // /work/signals is the archive of the same Signal records, labeled "Signals Archive" so the
    // two rail entries are never visually identical. The `id: 'events'`, `labelKey: 'dest.events'`,
    // `EventsIcon`, and the `/events` PATH are all left as legacy internal identifiers on purpose —
    // renaming them is a route/deep-link/test-touching change out of this fix's scope. Only the
    // rendered i18n string changed; do not confuse the legacy internal name with the shown label.
    id: 'events',
    zone: 'workspace',
    labelKey: 'dest.events',
    Icon: EventsIcon,
    primaryPath: '/events',
    links: [{ path: '/events', label: 'Events', labelKey: 'nav.events', Icon: EventsIcon }],
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
      { id: 'cafe', zone: 'modules', labelKey: 'dest.cafe', Icon: CafeIcon, primaryPath: '/cafe',
        workMatch: /caf[eé]|kitchen|\bbar\b|barista/i,
        links: [{ path: '/cafe', label: 'Café', labelKey: 'nav.cafe', Icon: CafeIcon }] },
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
 * OD-REDESIGN-68 (owner sketch 2026-07-14, confirmed 2026-07-18): the rail shows YOUR work,
 * not the org chart. The owner's frame sketch has no module blocks — for org-wide roles
 * (Managing Director, admin, finance) the rail is exactly the sketch: Home · Work(4) · Signals ·
 * Money · Inbox + utility. A module renders only for a viewer whose JOB ROLE belongs to that
 * BU (the e7 Ayu pattern: a barista sees Café, flat, no BU heading). Everyone still reaches
 * module routes via ⌘K / Home links / direct URL — this scopes the RAIL, not authorization.
 * ponytail: name-keyword affiliation (role name → BU), same ceiling as RATIFY-7F name-based
 * resolution; upgrade to team.business_unit when the viewer payload carries it.
 */
export function modulesForRoles(roleNames: string[], accessRoles: string[]): Destination[] {
  return modulesByBUForRoles(roleNames, accessRoles).flatMap((g) => g.items)
}

/**
 * Same viewer-scoped module filter as `modulesForRoles`, grouped by the owning BU
 * (OD-REDESIGN-1: "Modules grouped by Business Unit"; DESIGN.md Navigation/Rail: "Grouped
 * items under Overline group labels"). Only groups with >=1 live, role-matched item are
 * returned — the desktop rail (F2 fix) renders one Overline per group; mobile surfaces
 * (bottom-tab-bar, mobile-drawer) keep using the flat `modulesForRoles` and are unaffected.
 */
export function modulesByBUForRoles(
  roleNames: string[],
  accessRoles: string[],
): { bu: MessageKey; items: Destination[] }[] {
  const joined = roleNames.join(' ')
  return MODULES.map((g) => ({
    bu: g.bu,
    items: g.items.filter((m) => isLive(m, accessRoles) && m.workMatch != null && m.workMatch.test(joined)),
  })).filter((g) => g.items.length > 0)
}

/**
 * OD-REDESIGN-68: the single module promoted to the phone bottom-nav's role-scoped slot
 * (and thus excluded from the More menu) — the viewer's FIRST affiliated module, or null
 * for an org-wide role that has no module. Shared by the bottom tab bar + the More drawer
 * so exactly one surface owns the module (never both). Any additional modules stay in More.
 */
export function primaryModuleForViewer(roleNames: string[], accessRoles: string[]): Destination | null {
  return modulesForRoles(roleNames, accessRoles)[0] ?? null
}

/**
 * SEC-1 route hygiene (FLAG-B / G2): whether the viewer should see cafe/kitchen work surfaces —
 * the Café rail entry (already scoped by the `cafe` module's `workMatch`) and Home's failed-checks
 * deep-link (which routes to `/cafe/log`). True for a viewer affiliated with the Café module by job
 * role (same honest ceiling as the rail's `workMatch`), OR ops_lead/admin who own the review queue
 * org-wide. Fail-closed: a finance/HR/etc. persona with no cafe affiliation gets no cafe deep-link.
 * ponytail: role-name affiliation, same ceiling as `modulesForRoles`; upgrade to a team-membership
 * check when the viewer payload carries team.business_unit (the deferred RequireTeamInBU seam).
 */
export function viewerSeesCafe(roleNames: string[], accessRoles: string[]): boolean {
  if (accessRoles.includes('ops_lead') || accessRoles.includes('admin')) return true
  return modulesForRoles(roleNames, accessRoles).some((m) => m.id === 'cafe')
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

/** All destinations across the three zones, in rail order (for resolution scans). */
const ALL_DESTINATIONS: Destination[] = [
  ...DESTINATIONS,
  ...MODULES.flatMap((g) => g.items),
  ...UTILITY,
]

/**
 * A destination renders (rail group / bottom tab) iff it has >=1 live link
 * AND (no anyOf gate, or the viewer holds one of the gated roles).
 */
export function isLive(d: Destination, accessRoles: string[]): boolean {
  if (d.anyOf && !d.anyOf.some((r) => accessRoles.includes(r))) return false
  return d.links.length > 0
}

/**
 * Returns the Destination that owns the given pathname (by matching one of its
 * links or Work children, exact-or-prefix — mirrors sectionForPath), scanning
 * all three zones. A record route `/work/tasks/:taskId` resolves to `work`
 * (the Tasks child). Returns null for a truly unknown path. Consumed by the
 * breadcrumb + aria-current logic to see one owner per route.
 */
export function destinationForPath(pathname: string): Destination | null {
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
