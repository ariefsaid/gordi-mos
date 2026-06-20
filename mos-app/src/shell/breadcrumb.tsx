import { useLocation } from 'react-router-dom'
import { sectionForPath } from './sections'
import { useBreadcrumbTitle } from './breadcrumb-title'

// Shell breadcrumb — wayfinding only, no brand prefix (ADR-0013 D1, AC-S04).
// Brand lockup lives in TopBar; breadcrumb starts at the section level.
// Format: `Section` or `Section › Leaf` — current crumb ellipsizes (truncate + title) per AC-S03.
// Dynamic leaf: on /tasks/:id the resolved task title is pushed via BreadcrumbTitleProvider
// (ADR-0013 D1 / OD-P4-9, AC-S04b). While loading (title === null) falls back to section only.
function leafForPath(pathname: string, dynamicTitle: string | null): string | null {
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
  const section = sectionForPath(pathname)
  const leaf = leafForPath(pathname, dynamicTitle)

  // No section → nothing to show (unknown/404 path)
  if (!section) return null

  return (
    <span style={{ fontSize: 15 }}>
      {leaf ? (
        // Sub-page: section is muted intermediate, leaf is the bold current
        <>
          <span className="text-muted-foreground">{section.label}</span>
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
          title={section.label}
        >
          {section.label}
        </b>
      )}
    </span>
  )
}
