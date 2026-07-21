import { matchPath, useLocation } from 'react-router-dom'
import { jobKeyForPath } from './job-sentences'
import { PAGE_FAMILY_FRAME_ROUTES } from './page-family-migration'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'

/**
 * R-OWNER-1 (provisional): a route is "migrated" when it renders on a PageFamilyFrame whose
 * region-3 page head already emits the job sentence. On those routes the shell ContextRow must
 * NOT emit the sentence a second time. Unmigrated routes carry no region-3 sentence, so ContextRow
 * stays their sole job sentence. The migration registry (ISSUE_3_REPRESENTATIVE_ROUTES) is the
 * authority for which routes are on PageFamilyFrame — the route handle alone cannot tell migrated
 * (`v3Page` + PageFamilyFrame) from deferred (`v3Page`, no region-3 sentence) apart.
 */
function pageOwnsJobSentence(pathname: string): boolean {
  return PAGE_FAMILY_FRAME_ROUTES.some(({ path }) => matchPath(path, pathname) !== null)
}

function resolveViewerScope(roleName: string | undefined, accessRoles: readonly string[]): string {
  const role = roleName?.toLowerCase() ?? ''
  if (role.includes('barista') || role.includes('cafe')) return 'Café'
  if (role.includes('roast')) return 'Roastery'
  if (role.includes('ecom')) return 'Ecommerce'
  if (role.includes('finance')) return 'Finance'
  if (accessRoles.includes('admin')) return 'Admin'
  return 'Team'
}

/**
 * ContextRow — Region 2 of the anatomy (D-PLN-5, NEW per spec §3.1). A shell-level
 * strip rendered above the content Outlet on every route: the viewer's resolved
 * scope (Person/Team/BU) + the active route's job sentence (Rule 6 / Rule 1).
 *
 * `page-head.tsx` is a per-page H1 inside region 3 — not a counterpart, so this is
 * genuinely new. Minimal on stubs. Mounted once in app-shell.tsx (no new provider).
 */
export function ContextRow() {
  const { pathname } = useLocation()
  const auth = useAuth()
  const t = useT()

  const jobKey = jobKeyForPath(pathname)
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const roleName = viewer?.roles[0]?.name
  const accessRoles = viewer?.accessRoles ?? []
  const scope = resolveViewerScope(roleName, accessRoles)

  return (
    <div
      role="region"
      aria-label="Context"
      data-anatomy="context-row"
      className="ctx-row flex items-center gap-3 px-4"
      style={{ height: 'var(--ctx-row-h, 40px)', flex: 'none' }}
    >
      {scope && <span className="ctx-scope truncate text-muted-foreground" style={{ fontSize: 13 }}>{scope}</span>}
      {/* RATIFY R-OWNER-1: provisional — ContextRow sentence suppressed on V3-family routes */}
      {!pageOwnsJobSentence(pathname) && (
        <b className="ctx-job truncate text-foreground" style={{ fontSize: 13, fontWeight: 500 }}>
          {t(jobKey)}
        </b>
      )}
    </div>
  )
}
