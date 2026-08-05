import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
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
   * Used by the Work catalog manage children (Projects & Processes / Objectives).
   */
  capability?: string
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
  { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.work.objectives', Icon: ObjectiveIcon, capability: 'objective.manage' },
  { path: '/events', label: 'Events', labelKey: 'nav.events', Icon: EventsIcon },
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
 * (Review + Pushes: ops_lead/admin only) is enforced in the rail; all 6 are in this list for
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
  { path: '/cafe/review', label: 'Review', labelKey: 'nav.cafe.review', Icon: CafeIcon },
  { path: '/cafe/pushes', label: 'Pushes', labelKey: 'nav.cafe.pushes', Icon: CafeIcon },
]

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
