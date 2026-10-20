import type React from 'react'
import type { MessageKey } from '@/i18n/messages'
import { SHOW_FOLLOWUPS, SHOW_PLAN_BUDGET } from '@/config/features'
import { isShipGated } from '@/lib/ship-gate'
import type { ModuleId } from '@/lib/db/module-settings'
import type { ModuleAccessCheck } from '@/lib/module-availability'
import { reviewQueuePath, reviewQueuesFor } from '@/lib/cafe-review-queues'
import { ADMIN_SECTIONS, CAFE_ROUTE_SECTIONS, CAFE_SECTIONS, MONEY_SECTIONS, sectionForPath, visibleSections, type Section, type ViewerNavFacts } from './sections'
import {
  HomeIcon, TasksIcon, InboxIcon, WorkLineIcon, ObjectiveIcon,
  WorkIcon, SignalsIcon, MoneyIcon, CafeIcon, EcommerceIcon, RoasteryIcon,
  ProfileIcon, ShieldIcon,
} from './icons'

/**
 * THE MODULE REGISTRY — the one list every navigation surface reads.
 *
 * Desktop sidebar and rail, the collapsed rail's flyouts, the pages panel, ⌘K "Go to", the phone tab bar
 * and the More drawer all draw from the three zones below; nothing keeps a parallel list of its own.
 *
 *  - `WORKSPACE`       — Home, Work and Inbox route owners. `globalNavigationDestinations` merges Home and Work
 *                        with admitted modules in the shared shell order; Inbox has no menu row (it is the top-bar bell).
 *  - `MODULE_REGISTRY` — the modules, in registry order (Money, Café, then future Shift, Events, then
 *                        Roastery, Ecommerce). Each entry carries what a module owns: its ship gate (the
 *                        landing path asked of `lib/ship-gate.ts`), admission roles (`anyOf`, Money resolves
 *                        its per-page roles in `moneySectionsForViewer`), canonical landing (`primaryPath`),
 *                        icon, EN/ID names (`labelKey` into the catalog) and order. Each PAGE keeps its own
 *                        anyOf/capability/feature gate (`sections.ts`); this organises existing rules, it is
 *                        not a runtime on/off switch.
 *  - `UTILITY`         — Admin settings, pinned at the foot, and Personal profile, in the account menu.
 *
 * Work declares its children in the owner-ruled order (OD-REDESIGN-57(ii), P-13): Signals · Tasks ·
 * Projects & Processes · Objectives · Events. Events is ship-gated (#348), so four of the five render.
 * Admin is anyOf-gated (admin): absent, not disabled, when unauthorized.
 *
 * Adaptive shell: one available page-bearing area gets the single labelled sidebar; two or more get the
 * module rail plus the pages panel (`navModeFor`). Work counts when its route and module are available; Home and footer utilities do not.
 */
export type DestinationId =
  | 'home' | 'work' | 'money' | 'inbox'
  | 'cafe' | 'ecommerce' | 'roastery'
  | 'admin' | 'profile'

type DestinationZone = 'workspace' | 'modules' | 'utility'

export interface Destination {
  id: DestinationId
  labelKey: MessageKey
  /** The rail label; defaults to `labelKey`. */
  railLabelKey?: MessageKey
  Icon: React.FC
  /** live links under this destination; [] = destination not yet rolled in */
  links: Section[]
  /** Distinct sub-links rendered beneath the entry; undefined when its root is the whole surface. */
  children?: Section[]
  /** optional access gate applied to ALL links (rail/bottom-bar hide when unsatisfied).
   *  `readonly` so the shared role constants (REVENUE_VIEW_ROLES) can be assigned directly. */
  anyOf?: readonly string[]
  /** the canonical landing a tab / row / rail item opens (defaults to links[0].path) */
  primaryPath?: string
  zone: DestinationZone
  /** Registry order across modules (Money, Café, Shift, Events, Roastery, Ecommerce); gaps are left for future modules. */
  order?: number
}

/** Home · Work · Inbox. */
const WORKSPACE: Destination[] = [
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
    primaryPath: '/work',
    links: [{ path: '/work', label: 'Work', labelKey: 'dest.work', Icon: WorkIcon }],
    // Work catalog children are org-readable; their write scope is resolved by the catalog page/record
    // surfaces. This array's ORDER is the canonical nav order, the only one (#446). Objectives carry no
    // capability gate on READ (OD-V4-1): RLS already permits it, write stays behind objective.manage.
    children: [
      { path: '/work/signals', label: 'Signals', labelKey: 'nav.work.signals', Icon: SignalsIcon },
      { path: '/work/tasks', label: 'Tasks', labelKey: 'nav.work.tasks', Icon: TasksIcon },
      { path: '/work/projects', label: 'Projects & Processes', labelKey: 'nav.work.projects', Icon: WorkLineIcon },
      { path: '/work/objectives', label: 'Objectives', labelKey: 'nav.work.objectives', Icon: ObjectiveIcon },
    ],
  },
  {
    id: 'inbox',
    zone: 'workspace',
    labelKey: 'nav.inbox',
    Icon: InboxIcon,
    primaryPath: '/inbox',
    links: [{ path: '/inbox', label: 'Inbox', labelKey: 'nav.inbox', Icon: InboxIcon }],
  },
]

const CAFE_CHILD_SECTIONS = CAFE_SECTIONS.filter(({ path }) => path !== '/cafe')

/** The modules, in registry order. */
export const MODULE_REGISTRY: readonly Destination[] = [
  {
    id: 'money', zone: 'modules', order: 10, labelKey: 'dest.money', Icon: MoneyIcon,
    // Money's root route and each page have different admission. `moneySectionsForViewer` mirrors the route
    // gates without widening `/money` to admin-only viewers; the landing is the Overview, else the first admitted page.
    primaryPath: '/money',
    links: [{ path: '/money', label: 'Money', labelKey: 'nav.money', Icon: MoneyIcon }],
    children: MONEY_SECTIONS,
  },
  {
    id: 'cafe', zone: 'modules', order: 20, labelKey: 'dest.cafe', Icon: CafeIcon, primaryPath: '/cafe',
    links: CAFE_ROUTE_SECTIONS,
    children: CAFE_CHILD_SECTIONS,
  },
  {
    id: 'roastery', zone: 'modules', order: 50, labelKey: 'dest.roastery', Icon: RoasteryIcon, primaryPath: '/roastery',
    links: [{ path: '/roastery', label: 'Roastery', labelKey: 'nav.roastery', Icon: RoasteryIcon }],
  },
  {
    id: 'ecommerce', zone: 'modules', order: 60, labelKey: 'dest.ecommerce', Icon: EcommerceIcon, primaryPath: '/ecommerce',
    links: [{ path: '/ecommerce', label: 'Ecommerce', labelKey: 'nav.ecommerce', Icon: EcommerceIcon }],
  },
]

/**
 * OD-WAY-51 (owner ruling): **navigation mirrors what the route admits.** If a route admits a
 * viewer, that viewer gets a rendered way in, at every viewport. The navigation is never narrower
 * than the authorization.
 *
 * So a module renders for whoever its ROUTE admits — `isLive` resolves the destination's own
 * access-role gate and nothing else. Affiliation (#744) survives, but ONLY as emphasis: which
 * module gets promoted to the phone's bottom-tab slot and which one the context row names. It
 * never decides whether a link exists.
 *
 * What the name regex used to do, and why the ruling exists: OD-REDESIGN-68 scoped modules to the
 * viewer's own work by matching their JOB-ROLE NAME against a regex (`workMatch`, retired by
 * #744). A substantial share of the roles actually
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
export function moneySectionsForViewer(
  accessRoles: string[],
  isOn: ModuleAccessCheck,
): Section[] {
  return visibleSections(MONEY_SECTIONS.filter((section) => {
    if (section.path === '/money') return true
    if (section.path === '/money/pending-bills') return true
    if (section.path === '/money/budget' || section.path === '/money/pricing') return SHOW_PLAN_BUDGET
    if (section.path === '/money/follow-ups') return SHOW_FOLLOWUPS
    return false
  }), accessRoles, isOn)
}

export function moneyDestinationForViewer(
  accessRoles: string[],
  isOn: ModuleAccessCheck,
): Destination | null {
  const sections = moneySectionsForViewer(accessRoles, isOn)
  if (!sections.length) return null
  const primary = sections.find((section) => section.path === '/money') ?? sections[0]
  const money = MODULE_REGISTRY.find((destination) => destination.id === 'money')!
  return { ...money, primaryPath: primary.path, children: sections }
}

/** A module as THIS viewer meets it: ship gate, then admission; Money resolves its landing and pages per role. */
function admit(module: Destination, accessRoles: string[], isOn: ModuleAccessCheck): Destination | null {
  if (!isOn(module.id as ModuleId)) return null
  if (module.id === 'money') return moneyDestinationForViewer(accessRoles, isOn)
  return isLive(module, accessRoles, isOn) ? module : null
}

/**
 * Every module the viewer's ROUTES admit and module settings enable, in registry order. The list feeds the sidebar,
 * rail, flyouts, ⌘K, phone tab and More; `navModeFor` also counts the fixed Work area when it is live and enabled.
 */
export function admittedModules(accessRoles: string[], isOn: ModuleAccessCheck): Destination[] {
  return MODULE_REGISTRY
    .map((module) => admit(module, accessRoles, isOn))
    .filter((module): module is Destination => module !== null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** The one ordered root list shared by desktop, More and ⌘K; admission still comes from this registry. */
export function globalNavigationDestinations(accessRoles: string[], isOn: ModuleAccessCheck): Destination[] {
  const home = WORKSPACE.find((destination) => destination.id === 'home')!
  const work = WORKSPACE.find((destination) => destination.id === 'work')!
  const modules = admittedModules(accessRoles, isOn)
  const live = (destination: Destination) => isLive(destination, accessRoles, isOn)
  return [
    ...(live(home) ? [home] : []),
    ...(live(work) ? [work] : []),
    ...modules.filter((destination) => destination.id === 'money'),
    ...modules.filter((destination) => destination.id === 'cafe'),
    ...modules.filter((destination) => destination.id !== 'money' && destination.id !== 'cafe'),
  ]
}

/**
 * The shell by available page-bearing areas, never by role: one → the single labelled sidebar,
 * two or more → the module rail with the selected area's pages panel beside it. Work counts only when live and enabled; Home and utilities do not.
 */
export type NavMode = 'sidebar' | 'panel'
export function navModeFor(accessRoles: string[], isOn: ModuleAccessCheck): NavMode {
  const work = WORKSPACE.find((destination) => destination.id === 'work')!
  const availableAreas = admittedModules(accessRoles, isOn).length + Number(isOn('work') && isLive(work, accessRoles, isOn))
  return availableAreas >= 2 ? 'panel' : 'sidebar'
}

/**
 * The module promoted when no module page is open — EMPHASIS, not visibility (OD-WAY-51). Derived from the
 * registry over the viewer's affiliation payload (#744): the first admitted module whose id the payload
 * names. Returns null rather than guessing: promoting a module nobody asked for is a guess presented as a preference.
 */
export function primaryModuleForViewer(affiliated: string[], accessRoles: string[], isOn: ModuleAccessCheck): Destination | null {
  return admittedModules(accessRoles, isOn).find((m) => affiliated.includes(m.id)) ?? null
}

const LAST_MODULE_KEY = 'mos.nav.lastModule'

/** The module the viewer last opened a page of; a device preference, kept in the browser only. */
export function rememberModule(id: DestinationId): void {
  try { window.localStorage.setItem(LAST_MODULE_KEY, id) } catch { /* storage disabled: the slot falls back to affiliation */ }
}

function lastModuleId(): string | null {
  try { return window.localStorage.getItem(LAST_MODULE_KEY) } catch { return null }
}

/**
 * The phone bar's module slot. The module whose page is open wins; elsewhere the last module the viewer
 * explicitly visited; then the affiliation default. With none of the three the slot is omitted, never made up.
 */
export function phoneModuleForViewer(affiliated: string[], accessRoles: string[], pathname: string, isOn: ModuleAccessCheck): Destination | null {
  const modules = admittedModules(accessRoles, isOn)
  const current = destinationForPath(pathname)
  return (
    modules.find((m) => m.id === current?.id) ??
    modules.find((m) => m.id === lastModuleId()) ??
    primaryModuleForViewer(affiliated, accessRoles, isOn)
  )
}

/** A heading with the pages under it. The Café home row is the one group with no heading. */
export interface PageGroup {
  key: string
  headingKey?: MessageKey
  items: Section[]
}

const CAFE_GROUPS = ['cafe.nav.today', 'cafe.nav.stock', 'cafe.nav.close', 'cafe.nav.setup'] as const

/**
 * The pages of one destination as THIS viewer may open them, grouped. ONE function behind the sidebar's
 * branch, the pages panel, the flyouts and the phone drawer, so "identical panel content" holds by construction.
 * Café: its home row, then Today / Stock / Close / Setup, empty groups omitted, a nested page (Receipt issues
 * under Receive) directly after its parent.
 */
export function pageGroupsFor(
  destination: Destination,
  accessRoles: string[],
  isOn: ModuleAccessCheck,
  viewerFacts: ViewerNavFacts = {},
): PageGroup[] {
  if ((destination.id === 'work' || destination.zone === 'modules') && !isOn(destination.id as ModuleId)) return []
  if (destination.id === 'money') return [{ key: 'money', items: moneySectionsForViewer(accessRoles, isOn) }]
  if (destination.id === 'cafe') {
    const visible = visibleSections(destination.children ?? [], accessRoles, isOn, viewerFacts)
    const home: Section = { path: '/cafe', label: 'Café home', labelKey: 'nav.cafe.today', Icon: destination.Icon }
    const groups: PageGroup[] = [{ key: 'home', items: [home] }]
    for (const group of CAFE_GROUPS) {
      const entries = visible.filter((item) => item.group === group && !item.parentPath)
      if (!entries.length) continue
      groups.push({
        key: group,
        headingKey: group,
        items: entries.flatMap((entry) => [entry, ...visible.filter((item) => item.parentPath === entry.path)]),
      })
    }
    return groups
  }
  if (destination.id === 'admin') return [{ key: 'admin', items: visibleSections(ADMIN_SECTIONS, accessRoles, isOn) }]
  const items = visibleSections(destination.children ?? [], accessRoles, isOn)
  return items.length ? [{ key: destination.id, items }] : []
}

export function pageCount(groups: readonly PageGroup[]): number {
  return groups.reduce((total, group) => total + group.items.length, 0)
}

/** The longest page path that holds `pathname`: the one page that is current (aria-current="page"). */
export function currentPagePath(groups: readonly PageGroup[], pathname: string): string | undefined {
  let best: string | undefined
  for (const { path } of groups.flatMap((group) => group.items)) {
    if ((pathname === path || pathname.startsWith(`${path}/`)) && (!best || path.length > best.length)) best = path
  }
  return best
}

/**
 * Whether the viewer is admitted to `path` — the ONE route-admission question, answered by the
 * SAME authority the rail uses and nothing else: the owning destination's `anyOf` gate (`isLive`)
 * plus the section's own `anyOf`/legacy `capability` gate (`visibleSections`), which are kept
 * identical to any corresponding router branches. Current Work catalog read access is open to
 * the org; write scope is resolved by the catalog surfaces themselves.
 *
 * This exists for the one decision the rail structurally cannot make, because it is not navigation:
 * Home's failed-checks band, which links to `/cafe/log`. `OD-WAY-51` (owner, 2026-08-05) ruled that
 * **navigation mirrors what the route admits** and removed job-role-NAME regex matching as a
 * visibility model — measured against the real roster, `workMatch` left 5 of 10 job roles matching
 * no module at all, so viewers the route fully admitted were shown nothing. `viewerSeesCafe`
 * (#191) had reintroduced that same regex in this new spot; it is gone, and Home now asks the
 * question the rail asks. The name regex is gone entirely since #744: EMPHASIS reads the viewer's
 * affiliation payload (`primaryModuleForViewer`), so the ONE fact — works a café line or not —
 * is the only module emphasis input left.
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
export function viewerAdmittedToRoute(
  path: string,
  accessRoles: string[],
  isOn: ModuleAccessCheck,
  viewerFacts: ViewerNavFacts = {},
): boolean {
  const destination = destinationForPath(path)
  if (!destination || !isLive(destination, accessRoles, isOn)) return false
  const section = sectionForPath(path)
  return section == null || visibleSections([section], accessRoles, isOn, viewerFacts).length === 1
}

const UTILITY: Destination[] = [
  {
    id: 'admin',
    zone: 'utility',
    labelKey: 'dest.admin',
    railLabelKey: 'rail.short.admin',
    Icon: ShieldIcon,
    anyOf: ['admin'],
    primaryPath: '/admin/people',
    // All three Admin Settings tabs, so each resolves to Admin Settings for the rail's active
    // state and the breadcrumb. Nav surfaces still draw one entry, at `primaryPath`.
    links: ADMIN_SECTIONS,
  },
  {
    id: 'profile',
    zone: 'utility',
    labelKey: 'dest.profile',
    railLabelKey: 'rail.short.profile',
    Icon: ProfileIcon,
    primaryPath: '/profile',
    links: [{ path: '/profile', label: 'Personal Profile', labelKey: 'nav.profile', Icon: ProfileIcon }],
  },
]

/** The Utility entries pinned at the foot of a nav surface: Admin settings when the viewer's roles admit it. */
export function footerAreas(accessRoles: string[]): Destination[] {
  return UTILITY.filter((u) => u.id !== 'profile' && isLive(u, accessRoles, () => true))
}

/** Personal profile, opened from the account menu, unless the release ships without it. */
export function profileArea(): Destination | undefined {
  return UTILITY.find((u) => u.id === 'profile' && isLive(u, [], () => true))
}

/** All destinations across the zones, in registry order (for resolution scans). */
const ALL_DESTINATIONS: Destination[] = [
  ...WORKSPACE,
  ...MODULE_REGISTRY,
  ...UTILITY,
]

/** Home and Work workspace destinations; Work visibility also follows its org switch. */
export const FIXED_AREAS: readonly Destination[] = WORKSPACE.filter((d) => d.id === 'home' || d.id === 'work')

/** One row of ⌘K "Go to": an area, a page of it, or a Review queue, with the trail that names where it lives. */
export interface GoToEntry {
  id: string
  labelKey: MessageKey
  Icon: React.FC
  path: string
  /** Module › Group names above this row, root first; empty for a root. */
  trail: MessageKey[]
  /** Set on pages and queues: the id of the root row they hang under. */
  parentId?: string
}

/**
 * Every root, page and queue the viewer can open, from the same registry the menus read. The same
 * questions as the menus ask, nothing else: the ship gate and admission for the area, `visibleSections`
 * for its pages, the viewer's roles for Review's queues. Search is acceleration, never the only way in.
 */
export function goToEntries(
  accessRoles: string[],
  isOn: ModuleAccessCheck,
  viewerFacts: ViewerNavFacts = {},
): GoToEntry[] {
  const roots: Destination[] = [
    ...globalNavigationDestinations(accessRoles, isOn),
    ...WORKSPACE.filter((d) => d.id === 'inbox' && isLive(d, accessRoles, isOn)),
    ...UTILITY.filter((d) => isLive(d, accessRoles, isOn)),
  ]
  const queues = reviewQueuesFor(accessRoles)
  return roots.flatMap((destination) => {
    const rootId = `n-${destination.id}`
    const root: GoToEntry = { id: rootId, labelKey: destination.labelKey, Icon: destination.Icon, path: destination.primaryPath ?? destination.links[0].path, trail: [] }
    const pages = destination.id === 'inbox' || destination.id === 'profile' || destination.id === 'home' ? [] : pageGroupsFor(destination, accessRoles, isOn, viewerFacts)
    const rows = pages.flatMap((group) => group.items.flatMap<GoToEntry>((item) => {
      const trail: MessageKey[] = [destination.labelKey, ...(group.headingKey ? [group.headingKey] : [])]
      const row: GoToEntry = { id: `n-child${item.path.replace(/\//g, '-')}`, labelKey: item.labelKey ?? 'nav.home', Icon: item.Icon, path: item.path, trail, parentId: rootId }
      if (item.path !== '/cafe/review') return [row]
      return [row, ...queues.map<GoToEntry>((queue) => ({
        id: `n-queue-${queue.id}`, labelKey: queue.labelKey, Icon: item.Icon, path: reviewQueuePath(queue.id),
        trail: [...trail, item.labelKey ?? 'nav.cafe.review'], parentId: rootId,
      }))]
    }))
    // A module that lists only its landing page has one row: the root.
    return [root, ...rows.filter((row) => row.path !== root.path)]
  })
}

/**
 * A destination renders (rail group / bottom tab) iff the ship gate leaves it visible, it has
 * >=1 live link, AND (no anyOf gate, or the viewer holds one of the gated roles).
 *
 * The ship gate (#444) is asked FIRST and asked for everyone. It is not another role gate sitting
 * beside `anyOf` — it is above it: a gated surface is outside the MVP payload, so it is closed to
 * every viewer regardless of what they hold, and the router closes the same path from the same
 * array. Money is not ship-gated; its `REVENUE_VIEW_ROLES` gate controls its visibility.
 */
function isLive(d: Destination, accessRoles: string[], isOn: ModuleAccessCheck): boolean {
  const entry = d.primaryPath ?? d.links[0]?.path
  if (entry !== undefined && isShipGated(entry)) return false
  if (d.links.every((link) => isShipGated(link.path))) return false
  if (d.id === 'money') return moneyDestinationForViewer(accessRoles, isOn) !== null
  const roleAdmitted = !d.anyOf || d.anyOf.some((role) => accessRoles.includes(role))
  if (d.id === 'work') return isOn('work', roleAdmitted)
  if (d.zone === 'modules') return isOn(d.id as ModuleId, roleAdmitted)
  return roleAdmitted
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
  // for the same reason (nothing routes there). Without this the breadcrumb could resolve
  // `/work/events` to Work and print
  // "Work · Tasks" over a surface that is neither.
  if (isShipGated(pathname)) return null
  return destinationOwning(pathname)
}

/** The owner scan itself, with no gate asked. Shared by the callers below. */
function ownerOf(pathname: string): { destination: Destination; link: Section } | null {
  let best: { destination: Destination; link: Section } | null = null
  for (const destination of ALL_DESTINATIONS) {
    const candidates = [...destination.links, ...(destination.children ?? [])]
    for (const link of candidates) {
      if (link.path === '/') {
        if (pathname === '/' && !best) best = { destination, link }
      } else if (pathname === link.path || pathname.startsWith(link.path + '/')) {
        if (!best || link.path.length > best.link.path.length) best = { destination, link }
      }
    }
  }
  return best
}

function destinationOwning(pathname: string): Destination | null {
  return ownerOf(pathname)?.destination ?? null
}

const LEGACY_MONEY_AREA_ALIASES = new Set([
  '/sales', '/dashboard', '/dashboard/detail', '/plan/budget', '/plan/pricing',
])

/**
 * The AREA a path belongs to, named for a viewer standing outside it (`access-boundary.tsx`).
 *
 * Destination-level, not link-level: `/admin/people` is "Admin Settings", the area an admin would
 * grant, not "People", a screen the viewer has never seen named.
 *
 * It asks no gate — neither the ship gate nor the destination's own `anyOf`. Both are exactly the
 * conditions under which a boundary renders, so `destinationForPath`'s fail-closed `null` would
 * leave the panel unable to name what the viewer just hit. Naming an area is not exposing it: the
 * area's label is already in the catalog every viewer downloads.
 */
export function areaTitleKeyForPath(pathname: string): MessageKey | null {
  const normalizedPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname
  if (LEGACY_MONEY_AREA_ALIASES.has(normalizedPath)) {
    return destinationOwning('/money')?.labelKey ?? null
  }
  return destinationOwning(pathname)?.labelKey ?? null
}

/**
 * The LINK a path IS, named for a viewer standing outside it — the altitude a CAPABILITY gate
 * denies at (`access-boundary.tsx`).
 *
 * A capability gate closes one link inside a destination the viewer holds. At `/work/projects` the
 * rail beside the panel lists Work, expanded and marked active, so "Work is outside your access"
 * contradicts the screen it is printed on. The denied thing is Projects & Processes.
 *
 * Null when no link owns the path; the caller falls back to `areaTitleKeyForPath`, which is the
 * right altitude for a gate that closes a whole destination.
 */
export function linkTitleKeyForPath(pathname: string): MessageKey | null {
  return ownerOf(pathname)?.link.labelKey ?? null
}

/** How an area row relates to the route: the page itself, or the place that holds it. */
export type RowState = 'page' | 'location' | undefined

/** Does the route sit inside `base`? `/` holds only itself. */
function holds(pathname: string, base: string): boolean {
  return base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)
}

/**
 * The state of an area row. An area that holds the current route is a LOCATION when a page inside it is the
 * current page (that page carries aria-current="page"); with no page inside it the row is itself the page.
 */
export function rowState(pathname: string, landing: string, root: string, pageCurrent: string | undefined): RowState {
  if (!holds(pathname, root)) return undefined
  if (pageCurrent !== undefined) return 'location'
  return pathname === landing ? 'page' : 'location'
}

