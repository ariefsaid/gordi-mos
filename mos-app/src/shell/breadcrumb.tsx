import { useLocation } from 'react-router-dom'
import { sectionForPath } from './sections'

// Shell breadcrumb — wayfinding only, no brand prefix (ADR-0013 D1, AC-S04).
// Brand lockup lives in TopBar; breadcrumb starts at the section level.
// Format: `Section` or `Section › Leaf` — current crumb ellipsizes (truncate + title) per AC-S03.
function leafForPath(pathname: string): string | null {
  if (pathname === '/ops/new') return 'Add log entry'
  if (/^\/ops\/[^/]+\/edit$/.test(pathname)) return 'Edit log entry'
  if (pathname === '/tasks/new') return 'New task'
  // /tasks/:id — task title lives in the drawer pinned header, not the breadcrumb
  return null
}

export function Breadcrumb() {
  const { pathname } = useLocation()
  const section = sectionForPath(pathname)
  const leaf = leafForPath(pathname)

  // No section → nothing to show (unknown/404 path)
  if (!section) return null

  return (
    <span style={{ fontSize: 13 }}>
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
