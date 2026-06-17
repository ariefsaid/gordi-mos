import { useLocation } from 'react-router-dom'
import { sectionForPath } from './sections'

/**
 * IA-2 (PR-2): the shell breadcrumb is the single wayfinding home. It renders
 * `Gordi MOS › Section` and EXTENDS to the leaf on sub-pages
 * (`Daily Log › Add log entry`, `Tasks › New task`). One `›` separator throughout
 * (DESIGN.md top-bar). When a leaf is present the section is muted and the leaf is
 * the bold "current"; otherwise the section is the bold current. The redundant
 * in-page `/`-separated crumbs were removed so no page shows two breadcrumbs.
 */
function leafForPath(pathname: string): string | null {
  if (pathname === '/ops/new') return 'Add log entry'
  if (/^\/ops\/[^/]+\/edit$/.test(pathname)) return 'Edit log entry'
  if (pathname === '/tasks/new') return 'New task'
  // /tasks/:id (an open task drawer) keeps the section as current — the task title
  // lives in the drawer's pinned header, not the breadcrumb.
  return null
}

export default function Breadcrumb() {
  const { pathname } = useLocation()
  const section = sectionForPath(pathname)
  const leaf = leafForPath(pathname)

  return (
    <span style={{ fontSize: 13 }}>
      <span className="text-muted-foreground">Gordi MOS</span>
      {section && (
        <>
          <span className="mx-[7px]" aria-hidden="true">›</span>
          {leaf ? (
            // Leaf present → section is a muted intermediate (not the current page)
            <span className="text-muted-foreground">{section.label}</span>
          ) : (
            // No leaf → section is the bold current
            <b className="text-foreground font-semibold">{section.label}</b>
          )}
        </>
      )}
      {leaf && (
        <>
          <span className="mx-[7px]" aria-hidden="true">›</span>
          <b className="text-foreground font-semibold">{leaf}</b>
        </>
      )}
    </span>
  )
}
