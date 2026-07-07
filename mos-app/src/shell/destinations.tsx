import type React from 'react'
import type { Section } from './sections'
import { KITCHEN_SECTIONS } from './sections'
import { HomeIcon, TasksIcon, KitchenIcon, PlanIcon, InboxIcon, UpdatesIcon, OpsIcon, ObjectiveIcon, WorkLineIcon, SalesIcon, BudgetIcon, PricingIcon } from './icons'
import { SHOW_WEEKLY_UPDATES, SHOW_DAILY_LOG, SHOW_INBOX, SHOW_FOLLOWUPS, SHOW_PLAN_BUDGET } from '@/config/features'

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
    links: [{ path: '/', label: 'Home', labelKey: 'nav.home', Icon: HomeIcon }],
    primaryPath: '/',
  },
  {
    id: 'work',
    labelKey: 'dest.work',
    Icon: TasksIcon,
    // Work owns Tasks + the Cascade everyone-view + Weekly Updates (ADR-0019 D2 / jtbd §2).
    // Daily Log moved to Operate; Follow-up queues are a documented future link (not rendered).
    // The two catalog manage routes (Objectives / Projects & Processes) render as capability-gated
    // rail items (FR-424, owner decision 2026-07-07 superseding FR-420): a holder of
    // objective.manage / workline.manage sees them; a non-holder does not. The cascade's Manage
    // affordance stays too (belt + suspenders). RequireCapability is the real route gate.
    links: [
      { path: '/tasks', label: 'Tasks', labelKey: 'nav.tasks', Icon: TasksIcon },
      { path: '/work/cascade', label: 'Cascade', labelKey: 'cascade.link', Icon: ObjectiveIcon },
      ...(SHOW_WEEKLY_UPDATES ? [{ path: '/updates', label: 'Weekly Updates', labelKey: 'nav.updates' as const, Icon: UpdatesIcon }] : []),
      ...(SHOW_FOLLOWUPS ? [{ path: '/work/follow-ups', label: 'Follow-ups', labelKey: 'nav.followUps' as const, Icon: SalesIcon }] : []),
      { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.objectives', Icon: ObjectiveIcon, capability: 'objective.manage' },
      { path: '/work/projects-processes', label: 'Projects & Processes', labelKey: 'nav.projectsProcesses', Icon: WorkLineIcon, capability: 'workline.manage' },
    ],
  },
  {
    id: 'operate',
    labelKey: 'dest.operate',
    Icon: KitchenIcon,
    // Operate owns the Daily Log (moved here from Work — the cross-Activity chronological feed,
    // most general, first) + the Kitchen module (ADR-0019 D2 / jtbd §2).
    links: [
      ...(SHOW_DAILY_LOG ? [{ path: '/ops', label: 'Daily Log', labelKey: 'nav.dailyLog' as const, Icon: OpsIcon }] : []),
      ...KITCHEN_SECTIONS,
    ],
  },
  {
    id: 'plan',
    labelKey: 'dest.plan',
    Icon: PlanIcon,
    // Plan = the reference/money-lens destination (ADR-0019 D2). Sales is its first content
    // (finance/admin-gated); budget/COGS workbenches are a documented future link (not rendered).
    // anyOf hides the whole destination for a role with no Plan children (no dead-end — FR-410).
    anyOf: ['finance', 'admin'],
    links: [
      { path: '/sales', label: 'Sales', labelKey: 'nav.sales', Icon: SalesIcon },
      ...(SHOW_PLAN_BUDGET ? [
        { path: '/plan/budget', label: 'Budget', labelKey: 'nav.planBudget' as const, Icon: BudgetIcon },
        { path: '/plan/pricing', label: 'Pricing pre-flight', labelKey: 'nav.planPricing' as const, Icon: PricingIcon },
      ] : []),
    ],
  },
  {
    id: 'inbox',
    labelKey: 'dest.inbox',
    Icon: InboxIcon,
    // Live only when the notifications feature is on (ADR-0019 D9 / ADR-0044). Hide-first.
    links: SHOW_INBOX ? [{ path: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', Icon: InboxIcon }] : [],
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
 * owns it (e.g. /admin/* — regrouped elsewhere). Consumed by Breadcrumb to resolve
 * the SECTION crumb to the destination label (spec home-v1 FR-S03: "/tasks/123"
 * reads "Work › Tasks"; "/work/objectives" reads "Work › Objectives" — FR-424).
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
