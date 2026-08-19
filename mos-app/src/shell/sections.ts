import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
import { can } from '@/lib/capabilities'
import {
  HomeIcon, TasksIcon, SignalsIcon, WorkLineIcon, ObjectiveIcon,
  EventsIcon, MoneyIcon, InboxIcon, CafeIcon, EcommerceIcon, RoasteryIcon,
  ProfileIcon, PeopleIcon,
} from './icons'

export interface Section {
  path: string
  label: string
  labelKey?: MessageKey
  Icon: React.FC
  /**
   * FR-424: a capability-gated link renders in the rail ONLY for a viewer whose
   * access-roles grant the named capability (via `can()`); filtered out otherwise.
   * Used by the Work catalog manage child (Projects & Processes).
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
  { path: '/work/projects', label: 'Projects & Processes', labelKey: 'nav.work.projects', Icon: WorkLineIcon, capability: 'workline.manage' },
  // No `capability` here: OD-V4-1 removed the objective.manage READ gate everywhere — the rail
  // entry (destinations.tsx), the route (router.tsx) and now this registry. It was inert while
  // only `Destination.children` was filtered on capability, but it read as live and would have
  // become live the moment anyone filtered SECTIONS.
  { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.work.objectives', Icon: ObjectiveIcon },
  { path: '/work/events', label: 'Events', labelKey: 'nav.work.events', Icon: EventsIcon },
  { path: '/money', label: 'Money', labelKey: 'nav.money', Icon: MoneyIcon },
  { path: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', Icon: InboxIcon },
  { path: '/cafe', label: 'Café', labelKey: 'nav.cafe', Icon: CafeIcon },
  { path: '/ecommerce', label: 'Ecommerce', labelKey: 'nav.ecommerce', Icon: EcommerceIcon },
  { path: '/roastery', label: 'Roastery', labelKey: 'nav.roastery', Icon: RoasteryIcon },
  { path: '/profile', label: 'Personal Profile', labelKey: 'nav.profile', Icon: ProfileIcon },
]

/**
 * Café Module sections — Opening (Step 7, RATIFY-7D — the "Start today's opening" home at the
 * exact /cafe path) + 5 screens re-homed from /kitchen/* to /cafe/* (OD-15). Role visibility
 * (Review: ops_lead/admin/supervisor · Pushes: ops_lead/admin) is enforced in the rail; all 6 are in this list for
 * breadcrumb resolution regardless of role. Every label flows through the i18n catalog (FR-440)
 * via its labelKey. sectionForPath resolves the exact /cafe path to Opening (not the generic
 * SECTIONS "Café" root entry — CAFE_SECTIONS is scanned first) and picks the most specific
 * (longest) prefix match for any /cafe/* sub-route, so Opening never shadows Log/Plan/etc.
 */
export const CAFE_SECTIONS: Section[] = [
  { path: '/cafe', label: 'Opening', labelKey: 'nav.cafe.opening', Icon: CafeIcon },
  { path: '/cafe/log', label: 'Log', labelKey: 'nav.cafe.log', Icon: CafeIcon },
  { path: '/cafe/plan', label: 'Plan', labelKey: 'nav.cafe.plan', Icon: CafeIcon },
  { path: '/cafe/stock', label: 'Stock', labelKey: 'nav.cafe.stock', Icon: CafeIcon },
  // `anyOf` matches each one's OWN route gate exactly (router.tsx: two RequireAccessRole
  // branches). Same list in both places or the rail offers a link that bounces — or, as #236
  // shipped it, withholds a link to a surface the person is entitled to.
  // Review admits the stream supervisor (#236's FR-040 reviewer, wired through by #238);
  // Pushes is the dispatch surface and stays ops_lead/admin.
  { path: '/cafe/review', label: 'Review', labelKey: 'nav.cafe.review', Icon: CafeIcon, anyOf: ['ops_lead', 'admin', 'supervisor'] },
  { path: '/cafe/pushes', label: 'Pushes', labelKey: 'nav.cafe.pushes', Icon: CafeIcon, anyOf: ['ops_lead', 'admin'] },
]

/**
 * The Café module's NAV children — the five working screens, derived from CAFE_SECTIONS rather
 * than re-listed, so the two can never drift.
 *
 * `/cafe` itself is excluded: it is the module's home, which the rail already links via
 * `primaryPath`, and until the opening surface ports it forwards to the Log. Listing it as a
 * sixth child would show a viewer "Opening" pointing at a screen that is not the opening.
 *
 * This list exists because the port shipped the Café module with ONE link (`/cafe`) while
 * CAFE_SECTIONS held all six and was imported by nothing but a breadcrumb lookup — dead data, and
 * five working screens with no way to reach them but a typed URL.
 */
export const CAFE_MODULE_SECTIONS: Section[] = CAFE_SECTIONS.filter((s) => s.path !== '/cafe')

/**
 * The links a viewer may actually see: capability gates resolved through `can()`, access-role
 * gates through the viewer's roles. One helper so the rail and the phone drawer cannot disagree
 * about who sees what.
 */
export function visibleSections(sections: readonly Section[], accessRoles: readonly string[]): Section[] {
  return sections.filter(
    (s) =>
      (!s.capability || can(accessRoles, s.capability)) &&
      (!s.anyOf || s.anyOf.some((r) => accessRoles.includes(r))),
  )
}

/** Admin module sections — admin-only; rendered conditionally in the rail. */
export const ADMIN_SECTIONS: Section[] = [
  { path: '/admin/people', label: 'People', labelKey: 'nav.admin.people', Icon: PeopleIcon },
]

/**
 * Returns the Section whose path matches the given pathname, or null.
 * Scans the most-specific registries first (CAFE_SECTIONS, ADMIN_SECTIONS) so an
 * exact sub-route like `/cafe/review` wins over the `/cafe` prefix in SECTIONS.
 * '/' matches exactly; other paths match exactly or by prefix.
 *
 * Order-independent by construction (Step 7, RATIFY-7D): an EXACT match always wins outright
 * (so CAFE_SECTIONS' `/cafe` "Opening" leaf can sit anywhere in its own array without a more
 * specific `/cafe/log`-style entry accidentally losing to it); failing that, the MOST SPECIFIC
 * (longest-path) prefix match wins, so `/cafe` never shadows `/cafe/plan/anything` regardless of
 * array position.
 */
export function sectionForPath(pathname: string): Section | null {
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
