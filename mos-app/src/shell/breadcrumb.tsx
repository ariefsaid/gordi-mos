import { useLocation } from 'react-router-dom'
import { sectionForPath } from './sections'
import { destinationForPath, admittedModules, pageCount, pageGroupsFor, phoneModuleForViewer } from './module-registry'
import { useNavLayout } from './use-nav'
import { useBreadcrumbTitle, useCollectionLeaf, useBoundaryLabel } from './breadcrumb-title'
import { useIsNarrow } from './use-is-narrow'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import type { ModuleId } from '@/lib/db/module-settings'

// Shell breadcrumb — Redesign Step 2 (§9). `·` separator, last segment bold, no brand
// prefix (brand lives in TopBar — OD-P4-11 dedup). Resolves the new destinations +
// Work children + the `?view=` saved-view leaf; a record route pushes the resolved
// task title via BreadcrumbTitleProvider (AC-019). Unknown/404 routes render nothing.
// §Task-11 (Issue-8 gate): no `team` leaf — the Team-work view was removed until Issue 8 lands the
// real Task team_id contract.
export function Breadcrumb() {
  const { pathname } = useLocation()
  const dynamicTitle = useBreadcrumbTitle()
  const auth = useAuth()
  const isNarrow = useIsNarrow()
  const layout = useNavLayout()
  const t = useT()
  const collectionLeaf = useCollectionLeaf()
  const boundaryLabel = useBoundaryLabel()

  const destination = destinationForPath(pathname)
  // No destination: nothing to show, unless the page names itself (the not-found page does, so the top
  // bar still says where you are on an unknown path).
  if (!destination) {
    if (!boundaryLabel) return null
    return (
      <span className="top-bar__breadcrumb-content">
        <b className="truncate top-bar__breadcrumb-leaf text-foreground font-semibold" title={boundaryLabel} aria-current="page">{boundaryLabel}</b>
      </span>
    )
  }

  // Rule 5 (I7 — "rail owns it; breadcrumb leaf when the viewer has no rail entry"): whichever
  // location-owning nav surface is on screen for this width takes precedence; the breadcrumb
  // leaf carries aria-current="page" ONLY for a destination that surface doesn't cover, so
  // exactly one element carries it on every route, both widths (v4 shell rebuild, Task 3).
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  let leafCarriesCurrent: boolean
  if (isNarrow) {
    // Phone: the bottom-tab-bar is the location-owning surface, and it covers only Home · Work
    // (+ every /work/* child) · the viewer's promoted module. The More button is a
    // door, not a location — it no longer claims aria-current (that was the Rule-5 defect this
    // rebuild fixes). Every other live destination (Signals, Money, Admin, Profile, a
    // non-promoted module) has no tab, so the breadcrumb leaf owns it.
    const promoted = viewer ? phoneModuleForViewer(viewer.affiliated, viewer.accessRoles, pathname, layout.isOn) : null
    const tabIds = new Set(['home', ...(layout.isOn('work') ? ['work'] : []), ...(promoted ? [promoted.id] : [])])
    leafCarriesCurrent = !tabIds.has(destination.id)
  } else {
    // Desktop: the nav marks the current PAGE with aria-current="page" wherever it lists that page, Inbox
    // included. The breadcrumb leaf takes it for what the nav does not list: a module the viewer is not
    // admitted to, and — in the folded 64px rail, where pages sit behind a closed flyout — any area that has pages.
    const roles = viewer?.accessRoles ?? []
    const landing = destination.primaryPath ?? destination.links[0].path
    const hasPages = pageCount(pageGroupsFor(destination, roles, layout.isOn, { canReadCafePushes: layout.canReadCafePushes })) >= 2 || destination.id === 'work'
    // The area's own row is the page when its landing is open; any deeper route has no row of its own to hold "page".
    leafCarriesCurrent =
      (destination.id === 'profile' && pathname !== landing) ||
      (destination.id === 'work' && !layout.isOn('work')) ||
      (destination.zone === 'modules' && !layout.isOn(destination.id as ModuleId)) ||
      (destination.zone === 'modules' && viewer != null && !admittedModules(roles, layout.isOn).some((m) => m.id === destination.id)) ||
      (layout.compact && hasPages && pathname !== landing)
  }

  // A self-named page under a known section that is not itself a section page (an unknown /work/xyz)
  // has no nav row to hold "page", so the leaf does.
  if (boundaryLabel && sectionForPath(pathname) === null) leafCarriesCurrent = true

  // A denied deep link is named ONCE, by the panel, and the trail says the same word: the crumb
  // must not print the screen the boundary withholds (`People` over an `Admin Settings` panel) nor
  // add ancestors the panel does not claim (breadcrumb-title.tsx, useSetBoundaryLabel).
  const crumbs: string[] = boundaryLabel ? [boundaryLabel] : [t(destination.labelKey)]
  let collectionLeafShown = false

  if (boundaryLabel) {
    // The label is the whole trail. No child leaf, no record title, no saved view: none of them
    // is on screen behind the panel.
  } else if (destination.id === 'work') {
    // Work child label (Signals/Tasks/Projects & Processes/Objectives) — record routes
    // resolve to their owning child (e.g. /work/tasks/123 → Tasks).
    const child = sectionForPath(pathname)
    if (child) crumbs.push(child.labelKey ? t(child.labelKey) : child.label)
    if (pathname === '/work/tasks/new') {
      crumbs.push(t('tasks.create.new')) // OD-71i verb family
    } else if (dynamicTitle) {
      crumbs.push(dynamicTitle)
    } else {
      if (pathname.startsWith('/work/tasks') && collectionLeaf?.hasNonDefaultView) {
        crumbs.push(collectionLeaf.label)
        collectionLeafShown = true
      }
    }
  } else if (destination.id === 'cafe') {
    // /cafe and /cafe/log are the module default → bare "Café"; job-tab routes retain their
    // parent job in the trail so the selected view has a clear context and return path.
    if (pathname !== '/cafe' && pathname !== '/cafe/log') {
      const parentPath = pathname.startsWith('/cafe/receive/') ? '/cafe/receive'
        : pathname.startsWith('/cafe/request/') ? '/cafe/request'
          : null
      if (parentPath) {
        const parent = sectionForPath(parentPath)
        if (parent) crumbs.push(parent.labelKey ? t(parent.labelKey) : parent.label)
      }
      const sec = sectionForPath(pathname)
      if (sec) crumbs.push(sec.labelKey ? t(sec.labelKey) : sec.label)
      // A Café page that titles itself with its own job name (Receive, Count, ...) must not repeat it.
      if (dynamicTitle && dynamicTitle !== crumbs[crumbs.length - 1]) crumbs.push(dynamicTitle)
    }
  } else if (destination.id === 'money' && pathname.startsWith('/money/branch/') && dynamicTitle) {
    crumbs.push(dynamicTitle)
  } else if (destination.id === 'money' && pathname.startsWith('/money/') && !pathname.startsWith('/money/branch/')) {
    // A Money leaf page (Pending bills, ...) names itself after Money, as a branch page does.
    const sec = sectionForPath(pathname)
    if (sec && sec.path !== '/money') crumbs.push(sec.labelKey ? t(sec.labelKey) : sec.label)
  } else if (destination.id === 'admin') {
    const sec = sectionForPath(pathname)
    if (sec) crumbs.push(sec.labelKey ? t(sec.labelKey) : sec.label)
    if (dynamicTitle) crumbs.push(dynamicTitle) // an open person
  } else if (destination.id === 'profile' && pathname.startsWith('/profile/connected-agents')) {
    crumbs.push(t('agentConnections.self.title'))
  }
  // home / events (Signals) / inbox / profile / ecommerce / roastery → bare destLabel.

  // A-3 (#755, FR-020): below rail-collapse the header is the LEAF title only — no ancestor
  // crumbs, no separators. The trail names places the viewer navigated PAST, which a phone
  // header has no room to narrate; the leaf is never empty (a record page falls back to its
  // collection leaf until the title resolves, so the header never goes blank mid-load).
  // A saved view is a scope inside the page, never its name (#1032): on phone the header keeps the
  // page H1 ("Tasks"), so the collection leaf is dropped from the one-title header.
  const leaf = isNarrow && collectionLeafShown ? crumbs[crumbs.length - 2] : crumbs[crumbs.length - 1]
  if (isNarrow || crumbs.length === 1) {
    return (
      <span className="top-bar__breadcrumb-content">
        <b className="truncate top-bar__breadcrumb-leaf text-foreground font-semibold" title={leaf} aria-current={leafCarriesCurrent ? 'page' : undefined}>
          {leaf}
        </b>
      </span>
    )
  }

  return (
    <span className="top-bar__breadcrumb-content">
      {crumbs.slice(0, -1).map((label) => (
        <span key={label} className="top-bar__breadcrumb-fixed">
          <span className="text-muted-foreground">{label}</span>
          <span className="mx-[7px]" aria-hidden="true">·</span>
        </span>
      ))}
      <b className="truncate top-bar__breadcrumb-leaf text-foreground font-semibold" title={crumbs[crumbs.length - 1]} aria-current={leafCarriesCurrent ? 'page' : undefined}>
        {crumbs[crumbs.length - 1]}
      </b>
    </span>
  )
}
