import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
import { can } from '@/lib/capabilities'
import { isShipGated } from '@/lib/ship-gate'
import {
  HomeIcon, TasksIcon, SignalsIcon, WorkLineIcon, ObjectiveIcon,
  MoneyIcon, PendingBillIcon, InboxIcon, CafeIcon, EcommerceIcon, RoasteryIcon,
  ProfileIcon, PeopleIcon, ShieldIcon,
  TodayIcon, RecordsIcon, LogIcon, TransferIcon, WasteIcon, PlanIcon, StockIcon, ItemsIcon, RecipesIcon, ReviewIcon, DispatchIcon, CountIcon, ReceiveIcon, RequestIcon, LocationIcon, StockComparisonIcon,
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
  /** Café's shared grouped navigation metadata. */
  group?: MessageKey
  /** Secondary route nested beneath its parent destination on Café navigation. */
  parentPath?: string
}

/** Money leaves. Their role and feature gates mirror router.tsx; route admission is unchanged. */
export const MONEY_SECTIONS: Section[] = [
  { path: '/money', label: 'Overview', labelKey: 'money.pages.overview', Icon: MoneyIcon, anyOf: ['finance', 'manager', 'supervisor'] },
  { path: '/money/pending-bills', label: 'Pending bills', labelKey: 'nav.money.pendingBills', Icon: PendingBillIcon, anyOf: ['finance'] },
  { path: '/money/budget', label: 'Budget creation', labelKey: 'money.pages.budget', Icon: PlanIcon, anyOf: ['finance', 'admin'] },
  { path: '/money/pricing', label: 'Pricing pre-flight', labelKey: 'money.pages.pricing', Icon: PlanIcon, anyOf: ['finance', 'admin'] },
  { path: '/money/follow-ups', label: 'AR Follow-up queue', labelKey: 'money.pages.followUps', Icon: MoneyIcon, anyOf: ['finance', 'admin'] },
]

/** Backward-compatible named leaf used by existing navigation code. */
const PENDING_BILLS_SECTION = MONEY_SECTIONS[1]

/**
 * SECTIONS — the flat leaf registry used by the breadcrumb as a fallback for
 * destination-owned roots (Redesign Step 2). Retired `/updates` + `/ops` entries
 * are dropped (those routes redirect to successors — spec §7).
 */
const SECTIONS: Section[] = [
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
  PENDING_BILLS_SECTION,
  { path: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', Icon: InboxIcon },
  { path: '/cafe', label: 'Café', labelKey: 'nav.cafe', Icon: CafeIcon },
  { path: '/ecommerce', label: 'Ecommerce', labelKey: 'nav.ecommerce', Icon: EcommerceIcon },
  { path: '/roastery', label: 'Roastery', labelKey: 'nav.roastery', Icon: RoasteryIcon },
  { path: '/profile', label: 'Personal profile', labelKey: 'nav.profile', Icon: ProfileIcon },
]

/**
 * Café Module sections — the Café home root, Records, the Today capture routes, Count, Receive (Receipt issues
 * nests under it by `parentPath`), Request, Available to transfer, the ONE Review page (its queues are `cafe-review-queues.ts`;
 * the old Receipt review / Request review paths redirect into it), Sent to ESB, Items and Recipes. Review and Sent to
 * ESB visibility is enforced by `anyOf`; every label flows through the i18n catalog via its labelKey. All entries
 * remain available for breadcrumb resolution regardless of role. sectionForPath prefers exact and longest-prefix Café matches.
 */
export const CAFE_SECTIONS: Section[] = [
  { path: '/cafe', label: 'Café home', labelKey: 'nav.cafe.today', Icon: TodayIcon, group: 'cafe.nav.today' },
  { path: '/cafe/records', label: 'Records', labelKey: 'nav.cafe.records', Icon: RecordsIcon, group: 'cafe.nav.today' },
  { path: '/cafe/plan', label: 'Plan', labelKey: 'nav.cafe.plan', Icon: PlanIcon, group: 'cafe.nav.today' },
  { path: '/cafe/production', label: 'Production', labelKey: 'nav.cafe.production', Icon: LogIcon, group: 'cafe.nav.today' },
  { path: '/cafe/transfer', label: 'Transfer', labelKey: 'nav.cafe.transfer', Icon: TransferIcon, group: 'cafe.nav.today' },
  { path: '/cafe/waste', label: 'Waste', labelKey: 'nav.cafe.waste', Icon: WasteIcon, group: 'cafe.nav.today' },
  { path: '/cafe/count', label: 'Stock count', labelKey: 'nav.cafe.count', Icon: CountIcon, group: 'cafe.nav.stock' },
  // Preview ship state (lib/ship-gate.ts): `visibleSections` drops it unless the dev launch opted in. Count reviewers only (the Review page's own gate); the page limits a stream reviewer to their streams.
  { path: '/cafe/stock-comparison', label: 'Stock comparison', labelKey: 'nav.cafe.stockComparison', Icon: StockComparisonIcon, group: 'cafe.nav.stock', anyOf: ['ops_lead', 'admin', 'supervisor'] },
  { path: '/cafe/receive', label: 'Receive', labelKey: 'nav.cafe.receive', Icon: ReceiveIcon, group: 'cafe.nav.stock' },
  { path: '/cafe/receive/issues', label: 'Receipt issues', labelKey: 'cafe.pageTitle.receiptIssues', Icon: ReceiveIcon, group: 'cafe.nav.stock', parentPath: '/cafe/receive' },
  { path: '/cafe/request', label: 'Request', labelKey: 'cafe.request.title', Icon: RequestIcon, group: 'cafe.nav.stock' },
  { path: '/cafe/stock', label: 'Available to transfer', labelKey: 'nav.cafe.stock', Icon: StockIcon, group: 'cafe.nav.stock' },
  { path: '/cafe/review', label: 'Review', labelKey: 'nav.cafe.review', Icon: ReviewIcon, group: 'cafe.nav.close', anyOf: ['ops_lead', 'admin', 'supervisor'] },
  { path: '/cafe/pushes', label: 'Pushes', labelKey: 'nav.cafe.pushes', Icon: DispatchIcon, group: 'cafe.nav.close', anyOf: ['ops_lead', 'admin'] },
  { path: '/cafe/items', label: 'Items', labelKey: 'nav.cafe.items', Icon: ItemsIcon, group: 'cafe.nav.setup' },
  { path: '/cafe/recipes', label: 'Recipes', labelKey: 'nav.cafe.recipes', Icon: RecipesIcon, group: 'cafe.nav.setup' },
  // Preview ship state (lib/ship-gate.ts): `visibleSections` drops it unless the dev launch opted in.
  { path: '/cafe/transfer-routes', label: 'Transfer routes', labelKey: 'nav.cafe.transferRoutes', Icon: TransferIcon, group: 'cafe.nav.setup' },
  // Preview ship state (lib/ship-gate.ts): `visibleSections` drops it unless the dev launch opted in. Café-admitted viewers read; admin manages in the page.
  { path: '/cafe/locations', label: 'Locations', labelKey: 'nav.cafe.locations', Icon: LocationIcon, group: 'cafe.nav.setup' },
]

export const CAFE_ROUTE_SECTIONS: Section[] = CAFE_SECTIONS

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
  { path: '/admin/access', label: 'Access levels', labelKey: 'nav.admin.roles', Icon: ShieldIcon },
  { path: '/admin/modules', label: 'Modules', labelKey: 'nav.admin.modules', Icon: ItemsIcon },
  { path: '/admin/agents', label: 'Agent apps', labelKey: 'admin.settings.nav.agents', Icon: ShieldIcon },
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
  const allSections = [...CAFE_ROUTE_SECTIONS, ...ADMIN_SECTIONS, ...SECTIONS]
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
