import { useLocation } from 'react-router-dom'
import { sectionForPath } from './sections'
import { destinationForPath, allModules, primaryModuleForViewer } from './destinations'
import { useBreadcrumbTitle, useCollectionLeaf } from './breadcrumb-title'
import { useIsNarrow } from './use-is-narrow'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'

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
  const t = useT()
  const collectionLeaf = useCollectionLeaf()

  const destination = destinationForPath(pathname)
  // No destination → nothing to show (unknown/404 path — FIX-4 preserved).
  if (!destination) return null

  // Rule 5 (I7 — "rail owns it; breadcrumb leaf when the viewer has no rail entry"): whichever
  // location-owning nav surface is on screen for this width takes precedence; the breadcrumb
  // leaf carries aria-current="page" ONLY for a destination that surface doesn't cover, so
  // exactly one element carries it on every route, both widths (v4 shell rebuild, Task 3).
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  let leafCarriesCurrent: boolean
  if (isNarrow) {
    // Phone: the bottom-tab-bar is the location-owning surface, and it covers only Home · Work
    // (+ every /work/* child) · the viewer's promoted module · Inbox. The More button is a
    // door, not a location — it no longer claims aria-current (that was the Rule-5 defect this
    // rebuild fixes). Every other live destination (Signals, Money, Admin, Profile, a
    // non-promoted module) has no tab, so the breadcrumb leaf owns it.
    const promoted = viewer ? primaryModuleForViewer(viewer.roles.map((r) => r.name), viewer.accessRoles) : null
    const tabIds = new Set(['home', 'work', 'inbox', ...(promoted ? [promoted.id] : [])])
    leafCarriesCurrent = !tabIds.has(destination.id)
  } else {
    // Desktop: the rail renders every live workspace/utility destination plus the viewer's
    // affiliated modules (OD-REDESIGN-68) — the only gap is a modules-zone route the viewer
    // has no rail entry for (e.g. an admin visiting /cafe directly).
    leafCarriesCurrent =
      destination.zone === 'modules' &&
      viewer != null &&
      !allModules(viewer.accessRoles).some((m) => m.id === destination.id)
  }

  const destLabel = t(destination.labelKey)
  const crumbs: string[] = [destLabel]

  if (destination.id === 'work') {
    // Work child label (Signals/Tasks/Projects & Processes/Objectives) — record routes
    // resolve to their owning child (e.g. /work/tasks/123 → Tasks).
    const child = sectionForPath(pathname)
    const childLabel = child ? (child.labelKey ? t(child.labelKey) : child.label) : t('nav.tasks')
    crumbs.push(childLabel)
    if (pathname === '/work/tasks/new') {
      crumbs.push(t('tasks.create.new')) // OD-71i verb family
    } else if (dynamicTitle) {
      crumbs.push(dynamicTitle)
    } else {
      if (pathname.startsWith('/work/tasks') && collectionLeaf?.hasNonDefaultView) crumbs.push(collectionLeaf.label)
    }
  } else if (destination.id === 'money') {
    if (pathname === '/money/detail') crumbs.push(t('breadcrumb.detail'))
  } else if (destination.id === 'cafe') {
    // /cafe and /cafe/log are the module default → bare "Café"; other sub-routes get a leaf.
    if (pathname !== '/cafe' && pathname !== '/cafe/log') {
      const sec = sectionForPath(pathname)
      if (sec) crumbs.push(sec.labelKey ? t(sec.labelKey) : sec.label)
    }
  } else if (destination.id === 'admin') {
    const sec = sectionForPath(pathname)
    if (sec) crumbs.push(sec.labelKey ? t(sec.labelKey) : sec.label)
  }
  // home / events (Signals) / inbox / profile / ecommerce / roastery → bare destLabel.

  return (
    <span style={{ fontSize: 'var(--font-size-body-lg)' }}>
      {crumbs.length === 1 ? (
        <b className="truncate text-foreground font-semibold" title={crumbs[0]} aria-current={leafCarriesCurrent ? 'page' : undefined}>
          {crumbs[0]}
        </b>
      ) : (
        <>
          {crumbs.slice(0, -1).map((label) => (
            <span key={label}>
              <span className="text-muted-foreground">{label}</span>
              <span className="mx-[7px]" aria-hidden="true">·</span>
            </span>
          ))}
          <b className="truncate text-foreground font-semibold" title={crumbs[crumbs.length - 1]} aria-current={leafCarriesCurrent ? 'page' : undefined}>
            {crumbs[crumbs.length - 1]}
          </b>
        </>
      )}
    </span>
  )
}
