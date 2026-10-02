import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
import { can } from '@/lib/capabilities'
import { isShipGated } from '@/lib/ship-gate'
import {
  HomeIcon, TasksIcon, SignalsIcon, WorkLineIcon, ObjectiveIcon,
  MoneyIcon, InboxIcon, CafeIcon, EcommerceIcon, RoasteryIcon,
  ProfileIcon, PeopleIcon, ShieldIcon,
  TodayIcon, LogIcon, TransferIcon, PlanIcon, StockIcon, ItemsIcon, ReviewIcon, DispatchIcon,
} from './icons'

export interface Section {
  path: string
  label: string
  labelKey?: MessageKey
  Icon: React.FC
  /**
   * Optional legacy capability gate for a navigation entry. Current Work catalog entries are
   * org-readable and leave this unset; their write scope is resolved by the catalog surfaces.
   */
  capability?: string
  /**
   * Access-role gate, the `RequireAccessRole` counterpart of `capability` above. A link carrying
   * one renders only for a viewer holding one of the named roles. Café's Review and Pushes need
   * this rather than `capability` because the ROUTE gates them on access roles
   * (`ops_lead | admin`), and a nav gate that does not match its route gate is how a link ends up
   * pointing at a bounce — or a surface ends up with no link at all.
   */
  anyOf?: readonly string[]
}

/**
 * SECTIONS — the flat leaf registry used by the breadcrumb as a fallback for
 * destination-owned roots (Redesign Step 2). Retired `/updates` + `/ops` entries
 * are dropped (those routes redirect to successors — spec §7).
 */
export const SECTIONS: Section[] = [
  { path: '/', label: 'Home', labelKey: 'nav.home', Icon: HomeIcon },
  { path: '/work/signals', label: 'Signals', labelKey: 'nav.work.signals', Icon: SignalsIcon },
  { path: '/work/tasks', label: 'Tasks', labelKey: 'nav.work.tasks', Icon: TasksIcon },
  { path: '/work/projects', label: 'Projects & Processes', labelKey: 'nav.work.projects', Icon: WorkLineIcon },
  // No `capability` here: OD-V4-1 removed the objective.manage READ gate everywhere — the rail
  // entry (destinations.tsx), the route (router.tsx) and now this registry. It was inert while
  // only `Destination.children` was filtered on capability, but it read as live and would have
  // become live the moment anyone filtered SECTIONS.
  { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.work.objectives', Icon: ObjectiveIcon },
  { path: '/money', label: 'Money', labelKey: 'nav.money', Icon: MoneyIcon },
  { path: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', Icon: InboxIcon },
  { path: '/cafe', label: 'Café', labelKey: 'nav.cafe', Icon: CafeIcon },
  { path: '/ecommerce', label: 'Ecommerce', labelKey: 'nav.ecommerce', Icon: EcommerceIcon },
  { path: '/roastery', label: 'Roastery', labelKey: 'nav.roastery', Icon: RoasteryIcon },
  { path: '/profile', label: 'Personal Profile', labelKey: 'nav.profile', Icon: ProfileIcon },
]

/**
 * Café Module sections — the Today/capture root, production and transfer capture routes, Plan,
 * Stock, Items, Review and Pushes. Review/Pushes visibility is enforced in the rail; every label
 * flows through the i18n catalog via its labelKey. All entries remain available for breadcrumb
 * resolution regardless of role. sectionForPath prefers exact and longest-prefix Café matches.
 */
export const CAFE_SECTIONS: Section[] = [
  { path: '/cafe', label: 'Today', labelKey: 'nav.cafe.today', Icon: TodayIcon },
  { path: '/cafe/production', label: 'Log production', labelKey: 'nav.cafe.production', Icon: LogIcon },
  { path: '/cafe/transfer', label: 'Log transfer', labelKey: 'nav.cafe.transfer', Icon: TransferIcon },
  { path: '/cafe/plan', label: 'Plan', labelKey: 'nav.cafe.plan', Icon: PlanIcon },
  { path: '/cafe/stock', label: 'Stock', labelKey: 'nav.cafe.stock', Icon: StockIcon },
  { path: '/cafe/items', label: 'Items', labelKey: 'nav.cafe.items', Icon: ItemsIcon },
  // `anyOf` matches each one's OWN route gate exactly (router.tsx: two RequireAccessRole
  // branches). Same list in both places or the rail offers a link that bounces — or, as #236
  // shipped it, withholds a link to a surface the person is entitled to.
  // Review admits the stream supervisor (#236's FR-040 reviewer, wired through by #238);
  // Pushes is the dispatch surface and stays ops_lead/admin.
  { path: '/cafe/review', label: 'Review', labelKey: 'nav.cafe.review', Icon: ReviewIcon, anyOf: ['ops_lead', 'admin', 'supervisor'] },
  { path: '/cafe/pushes', label: 'Pushes', labelKey: 'nav.cafe.pushes', Icon: DispatchIcon, anyOf: ['ops_lead', 'admin'] },
]


// A section with a deeper sibling needs `end` so its NavLink stops prefix-matching.
export function sectionHasPrefixChild(section: Section, sections: readonly Section[]): boolean {
  return sections.some((sibling) => sibling !== section && sibling.path.startsWith(section.path + '/'))
}

/**
 * The links a viewer may actually see: the ship gate first, then capability gates resolved through
 * `can()`, then access-role gates through the viewer's roles. One helper so the rail and the phone
 * drawer cannot disagree about who sees what.
 *
 * The ship gate (#444) takes no roles because it asks a different question. Capability and
 * access-role gates ask "may THIS viewer reach it"; the ship gate asks "is this surface in the MVP
 * payload at all", and a No there is a No for everyone. That is why it sits above the other two
 * rather than beside them — and why the same array closes the route in `router.tsx`, so a link can
 * never survive a path that stopped routing.
 */
export function visibleSections(sections: readonly Section[], accessRoles: readonly string[]): Section[] {
  return sections.filter(
    (s) =>
      !isShipGated(s.path) &&
      (!s.capability || can(accessRoles, s.capability)) &&
      (!s.anyOf || s.anyOf.some((r) => accessRoles.includes(r))),
  )
}

/** Admin module sections — admin-only; rendered conditionally in the rail. */
export const ADMIN_SECTIONS: Section[] = [
  { path: '/admin/people', label: 'People', labelKey: 'nav.admin.people', Icon: PeopleIcon },
  { path: '/admin/teams', label: 'Teams', labelKey: 'nav.admin.teams', Icon: PeopleIcon },
  { path: '/admin/access', label: 'Roles & permissions', labelKey: 'nav.admin.roles', Icon: ShieldIcon },
  { path: '/admin/agents', label: 'Connected agents', labelKey: 'admin.settings.nav.agents', Icon: ShieldIcon },
]

/**
 * Returns the Section whose path matches the given pathname, or null.
 * Scans the most-specific registries first (CAFE_SECTIONS, ADMIN_SECTIONS) so an
 * exact sub-route like `/cafe/production` wins over the `/cafe` prefix in SECTIONS.
 * '/' matches exactly; other paths match exactly or by prefix.
 *
 * Order-independent by construction: an EXACT match wins outright; failing that, the MOST SPECIFIC
 * (longest-path) prefix match wins, so the Café root never shadows a capture or plan route.
 */
export function sectionForPath(pathname: string): Section | null {
  // #444: a ship-gated path resolves to NO section. The router forwards it home, so the breadcrumb
  // should never be asked — but a resolver that still names a hidden surface is a second source of
  // truth waiting to leak one ("Money · Detail" over a page that is not Money). Fail closed here
  // and the breadcrumb, `viewerAdmittedToRoute` and every other reader inherit the same answer.
  if (isShipGated(pathname)) return null
  const allSections = [...CAFE_SECTIONS, ...ADMIN_SECTIONS, ...SECTIONS]
  const exact = allSections.find((section) =>
    section.path === '/' ? pathname === '/' : pathname === section.path,
  )
  if (exact) return exact
  let best: Section | null = null
  for (const section of allSections) {
    if (section.path === '/') continue
    if (pathname.startsWith(section.path + '/') && (!best || section.path.length > best.path.length)) {
      best = section
    }
  }
  return best
}
