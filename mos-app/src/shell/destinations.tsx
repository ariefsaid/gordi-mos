import type React from 'react'
import type { Section } from './sections'
import { KITCHEN_SECTIONS } from './sections'
import { HomeIcon, TasksIcon, KitchenIcon, PlanIcon, InboxIcon, UpdatesIcon, OpsIcon, ObjectiveIcon } from './icons'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG, SHOW_INBOX } from '@/config/features'

/**
 * DESTINATIONS — the single source of truth for both chromes (plan §1.5).
 * The desktop rail and the phone bottom-tab bar both render from this list
 * so the grouping never drifts between the two surfaces (ADR-0019 D2/D8).
 */
export type DestinationId = 'home' | 'work' | 'operate' | 'plan' | 'inbox'

export interface Destination {
  id: DestinationId
  labelKey: 'dest.home' | 'dest.work' | 'dest.operate' | 'dest.plan' | 'dest.inbox'
  Icon: React.FC
  /** live links under this destination; [] = destination not yet rolled in */
  links: Section[]
  /** optional access gate applied to ALL links (rail/bottom-bar hide when unsatisfied) */
  anyOf?: string[]
  /** primary route a bottom-tab taps (defaults to links[0].path) */
  primaryPath?: string
}

export const DESTINATIONS: Destination[] = [
  {
    id: 'home',
    labelKey: 'dest.home',
    Icon: HomeIcon,
    links: [{ path: '/', label: 'Home', Icon: HomeIcon }],
    primaryPath: '/',
  },
  {
    id: 'work',
    labelKey: 'dest.work',
    Icon: TasksIcon,
    // Work owns tasks + updates + the daily log (ADR-0019 D2); the flag-gated
    // routes must reappear here when their flags flip on (they left SECTIONS-driven
    // rendering when the rail moved to DESTINATIONS).
    links: [
      { path: '/tasks', label: 'Tasks', Icon: TasksIcon },
      { path: '/work/cascade', label: 'Cascade', labelKey: 'cascade.link', Icon: ObjectiveIcon },
      ...(SHOW_WEEKLY_UPDATES ? [{ path: '/updates', label: 'Weekly Updates', Icon: UpdatesIcon }] : []),
      ...(SHOW_DAILY_LOG ? [{ path: '/ops', label: 'Daily Log', Icon: OpsIcon }] : []),
    ],
  },
  {
    id: 'operate',
    labelKey: 'dest.operate',
    Icon: KitchenIcon,
    links: KITCHEN_SECTIONS,
  },
  {
    id: 'plan',
    labelKey: 'dest.plan',
    Icon: PlanIcon,
    links: [],
  },
  {
    id: 'inbox',
    labelKey: 'dest.inbox',
    Icon: InboxIcon,
    // Live only when the notifications feature is on (ADR-0019 D9 / ADR-0044). Hide-first.
    links: SHOW_INBOX ? [{ path: '/inbox', label: 'Inbox', Icon: InboxIcon }] : [],
  },
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
 * links, exact-or-prefix — mirrors sectionForPath), or null if no destination
 * owns it (e.g. /admin/*, /sales, /objectives — regrouped elsewhere or drill-only).
 * Consumed by Breadcrumb to resolve the SECTION crumb to the destination label
 * (spec home-v1 FR-S03: "/tasks/123" reads "Work › Tasks").
 */
export function destinationForPath(pathname: string): Destination | null {
  for (const d of DESTINATIONS) {
    for (const link of d.links) {
      if (link.path === '/') {
        if (pathname === '/') return d
      } else if (pathname === link.path || pathname.startsWith(link.path + '/')) {
        return d
      }
    }
  }
  return null
}
