import { useLocation } from 'react-router-dom'
import { sectionForPath } from './sections'
import { destinationForPath } from './destinations'
import { useBreadcrumbTitle } from './breadcrumb-title'
import { useT } from '@/i18n/use-t'

// Shell breadcrumb — wayfinding only, no brand prefix (ADR-0013 D1, AC-S04).
// Brand lockup lives in TopBar; breadcrumb starts at the section level.
// Format: `Section` or `Section › Leaf` — current crumb ellipsizes (truncate + title) per AC-S03.
// Dynamic leaf: on /tasks/:id the resolved task title is pushed via BreadcrumbTitleProvider
// (ADR-0013 D1 / OD-P4-9, AC-S04b). While loading (title === null) falls back to section only.
function explicitLeafForPath(pathname: string, dynamicTitle: string | null): string | null {
  if (pathname === '/ops/new') return 'Add log entry'
  if (/^\/ops\/[^/]+\/edit$/.test(pathname)) return 'Edit log entry'
  if (pathname === '/tasks/new') return 'New task'
  // /tasks/:id — use the resolved task title from context (null = loading, render section only)
  if (/^\/tasks\/[^/]+$/.test(pathname) && dynamicTitle) return dynamicTitle
  return null
}

export function Breadcrumb() {
  const { pathname } = useLocation()
  const dynamicTitle = useBreadcrumbTitle()
  const t = useT()
  const destination = destinationForPath(pathname)

  // Resolve the leaf Section: prefer the destination's own matching link (so the Work manage
  // routes /work/objectives + /work/projects-processes, the Plan /sales link, and the Operate
  // /ops link all resolve with their labelKey — FR-424), then fall back to the flat section
  // registry for routes owned by no destination (Admin). '/' matches exactly; others prefix.
  const destLink = destination?.links.find((l) =>
    l.path === '/' ? pathname === '/' : pathname === l.path || pathname.startsWith(l.path + '/'),
  ) ?? null
  const section = destLink ?? sectionForPath(pathname)

  // No section → nothing to show (unknown/404 path)
  if (!section) return null

  // FR-S03 (spec home-v1) + FR-424: a route owned by a destination (Home/Work/Operate/Plan/Inbox)
  // reads its destination label as the SECTION crumb. For non-Home destinations the route's own
  // label is promoted to the leaf (e.g. "Work › Tasks", "Operate › Log", "Work › Objectives",
  // "Plan › Sales", "Operate › Daily Log") — or the explicit/dynamic leaf ("New task", a resolved
  // task title) when one applies. Home renders bare ("Home", no "Home › Home"). Labels resolve
  // through the i18n catalog when a labelKey is present (FR-440).
  const promotesDestinationLabel = !!destination && destination.id !== 'home'
  const explicitLeaf = explicitLeafForPath(pathname, dynamicTitle)
  const sectionLabel = destination ? t(destination.labelKey) : (section.labelKey ? t(section.labelKey) : section.label)
  const promotedLeaf = promotesDestinationLabel ? (section.labelKey ? t(section.labelKey) : section.label) : null
  // Collapse a self-crumb: a single-link destination whose promoted leaf equals its own
  // destination label would read "Inbox › Inbox" (UI-coherence audit C3) — render bare instead,
  // mirroring how Home renders "Home" not "Home › Home".
  const leafLabel = explicitLeaf ?? (promotedLeaf && promotedLeaf !== sectionLabel ? promotedLeaf : null)

  return (
    <span style={{ fontSize: 15 }}>
      {leafLabel ? (
        // Sub-page: section is muted intermediate, leaf is the bold current
        <>
          <span className="text-muted-foreground">{sectionLabel}</span>
          <span className="mx-[7px]" aria-hidden="true">›</span>
          <b
            className="truncate text-foreground font-semibold"
            title={leafLabel}
          >
            {leafLabel}
          </b>
        </>
      ) : (
        // Section is the current page — bold, truncated
        <b
          className="truncate text-foreground font-semibold"
          title={sectionLabel}
        >
          {sectionLabel}
        </b>
      )}
    </span>
  )
}
