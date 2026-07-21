import { useLocation } from 'react-router-dom'
import { sectionForPath } from './sections'
import { destinationForPath, modulesForRoles } from './destinations'
import { useBreadcrumbTitle } from './breadcrumb-title'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'

// Shell breadcrumb — Redesign Step 2 (§9). `·` separator, last segment bold, no brand
// prefix (brand lives in TopBar — OD-P4-11 dedup). Resolves the new destinations +
// Work children + the `?view=` saved-view leaf; a record route pushes the resolved
// task title via BreadcrumbTitleProvider (AC-019). Unknown/404 routes render nothing.
// §Task-11 (Issue-8 gate): no `team` leaf — the Team-work view was removed until Issue 8 lands the
// real Task team_id contract.
const VIEW_LEAF: Record<string, string> = {
  mine: 'My work',
  overdue: 'Overdue',
  followups: 'Follow-ups',
}

function viewLeaf(search: string): string | null {
  const params = new URLSearchParams(search)
  const v = params.get('view')
  if (!v || v === 'all') return null
  return VIEW_LEAF[v] ?? null
}

export function Breadcrumb() {
  const { pathname, search } = useLocation()
  const dynamicTitle = useBreadcrumbTitle()
  const auth = useAuth()
  const t = useT()

  const destination = destinationForPath(pathname)
  // No destination → nothing to show (unknown/404 path — FIX-4 preserved).
  if (!destination) return null

  // Rule 5 under OD-REDESIGN-68: on a module route the viewer has NO rail entry for (an admin
  // visiting /cafe), nothing in the rail can carry aria-current="page" — the breadcrumb leaf
  // takes over so every route still renders exactly one. (Second-pass audit: e2e AC-007 caught
  // the count dropping to zero on those routes.)
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const leafCarriesCurrent =
    destination.zone === 'modules' &&
    viewer != null &&
    !modulesForRoles(viewer.roles.map((r) => r.name), viewer.accessRoles).some((m) => m.id === destination.id)

  const destLabel = t(destination.labelKey)
  const crumbs: string[] = [destLabel]

  if (destination.id === 'work') {
    // Work child label (Signals/Tasks/Projects & Processes/Objectives) — record routes
    // resolve to their owning child (e.g. /work/tasks/123 → Tasks).
    const child = sectionForPath(pathname)
    const childLabel = child ? (child.labelKey ? t(child.labelKey) : child.label) : 'Tasks'
    crumbs.push(childLabel)
    if (pathname === '/work/tasks/new') {
      crumbs.push('Create task') // OD-71i verb family
    } else if (dynamicTitle) {
      crumbs.push(dynamicTitle)
    } else {
      const v = viewLeaf(search)
      if (v) crumbs.push(v)
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
  // home / events / inbox / profile / ecommerce / roastery → bare destLabel.

  return (
    <span style={{ fontSize: 15 }}>
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
