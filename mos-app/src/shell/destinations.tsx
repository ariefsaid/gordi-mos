import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
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
 *  - `DESTINATIONS` — the 5 workspace roots (Home · Work · Events · Money · Inbox).
 *    Used by the rail Workspace zone + the phone bottom-nav primary tabs.
 *  - `MODULES`     — 2 BU groups (Retail Ops [Café, Ecommerce], B2B Ops [Roastery]).
 *  - `UTILITY`     — 2 entries (Admin Settings [gated admin], Personal Profile).
 *
 * Work owns exactly 4 always-expanded children (Signals · Tasks · Projects &
 * Processes · Objectives) with 0 family headings (Rule 3 caps). Money is
 * anyOf-gated (finance/admin); Admin is anyOf-gated (admin) — absent, not
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
  /** optional access gate applied to ALL links (rail/bottom-bar hide when unsatisfied) */
  anyOf?: string[]
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
      { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.work.objectives', Icon: ObjectiveIcon, capability: 'objective.manage' },
    ],
  },
  {
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
    anyOf: ['finance', 'admin'],
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
 * (Managing Director, admin, finance) the rail is exactly the sketch: Home · Work(4) · Events ·
 * Money · Inbox + utility. A module renders only for a viewer whose JOB ROLE belongs to that
 * BU (the e7 Ayu pattern: a barista sees Café, flat, no BU heading). Everyone still reaches
 * module routes via ⌘K / Home links / direct URL — this scopes the RAIL, not authorization.
 * ponytail: name-keyword affiliation (role name → BU), same ceiling as RATIFY-7F name-based
 * resolution; upgrade to team.business_unit when the viewer payload carries it.
 */
export function modulesForRoles(roleNames: string[], accessRoles: string[]): Destination[] {
  const joined = roleNames.join(' ')
  return MODULES.flatMap((g) => g.items).filter(
    (m) => isLive(m, accessRoles) && m.workMatch != null && m.workMatch.test(joined),
  )
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
