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
  const section = sectionForPath(pathname)

  // No section → nothing to show (unknown/404 path)
  if (!section) return null

  // FR-S03 (spec home-v1): a route owned by a destination (Home/Work/Operate) reads its
  // destination label as the SECTION crumb. For Work/Operate the route's own section
  // label is promoted to the leaf (e.g. "Work › Tasks", "Operate › Log") — or the
  // explicit/dynamic leaf ("New task", a resolved task title) when one applies. Home has
  // nothing to promote to a leaf — it renders bare ("Home", no "Home › Home"). A route
  // owned by no destination (Admin, cascade catalog, Sales) keeps its own section label,
  // unaffected by the regroup.
  const promotesDestinationLabel = !!destination && destination.id !== 'home'
  const explicitLeaf = explicitLeafForPath(pathname, dynamicTitle)
  const leaf = explicitLeaf ?? (promotesDestinationLabel ? section.label : null)
  const sectionLabel = destination ? t(destination.labelKey) : section.label

  return (
    <span style={{ fontSize: 15 }}>
      {leaf ? (
        // Sub-page: section is muted intermediate, leaf is the bold current
        <>
          <span className="text-muted-foreground">{sectionLabel}</span>
          <span className="mx-[7px]" aria-hidden="true">›</span>
          <b
            className="truncate text-foreground font-semibold"
            title={leaf}
          >
            {leaf}
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
