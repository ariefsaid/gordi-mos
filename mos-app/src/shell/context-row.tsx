import { matchPath, useLocation } from 'react-router-dom'
import { jobKeyForPath } from './job-sentences'
import { PAGE_FAMILY_FRAME_ROUTES } from './page-family-migration'
import { primaryModuleForViewer } from './destinations'
import { useAuth } from '@/auth/use-auth'
import { useT, type Translate } from '@/i18n/use-t'

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

function resolveViewerScope(roleNames: string[], accessRoles: string[], t: Translate): string {
  // Resolve scope from the BU/Module DATA MODEL, not a free-text role-name string match: the
  // module registry's `workMatch` is the ONE authority for role→BU affiliation — the same map
  // that the phone's promoted tab uses (destinations.tsx `primaryModuleForViewer`). It no longer
  // gates the rail — OD-WAY-51 made module VISIBILITY route-driven; `workMatch` is emphasis only,
  // and naming the viewer's scope is exactly that. A Kitchen or Bar *Area* role
  // resolves to its owning Café *Module* (CONTEXT.md: "Kitchen and Bar are Areas inside the Café
  // Module"), so a Kitchen Lead shows "Café" on every route, never a less-specific "Team" /
  // role-name fallback (F1). The prior hand-rolled substring list ('barista'/'cafe'/'roast'/…)
  // had no branch for 'kitchen' and silently drifted from the rail's authoritative regex.
  const module = primaryModuleForViewer(roleNames, accessRoles)
  if (module) return t(module.labelKey)
  // No module affiliation (org-wide roles: Managing Director, admin, Sales Lead) — fall back to
  // the viewer's own role name so the scope signal is always real, never a generic placeholder
  // (F3/P1). Ceiling: name-keyword affiliation; upgrade when the viewer payload carries team.BU.
  return roleNames[0] ?? 'Team'
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
  const roleNames = viewer?.roles.map((r) => r.name) ?? []
  const scope = resolveViewerScope(roleNames, viewer?.accessRoles ?? [], t)

  // owner-eyes item 8: on a route whose region-3 page head already carries the job sentence
  // (a PageFamilyFrame family route — the same suppression registry that already silences the
  // sentence here), the ContextRow would render only a lone scope crumb ("Café") floating above
  // the page title — an orphan that duplicates context the head + the topbar breadcrumb already
  // provide. So on those routes the WHOLE strip goes silent: no scope, no sentence, and the region
  // collapses to zero height (the anatomy landmark stays present for the shell contract, but adds
  // no visual gap). Unmigrated routes keep the scope + sentence — there the ContextRow is the sole
  // context signal.
  const headOwnsContext = pageOwnsJobSentence(pathname)

  return (
    <div
      role="region"
      aria-label="Context"
      data-anatomy="context-row"
      className="ctx-row flex items-center gap-3 px-4"
      style={{ height: headOwnsContext ? 0 : 'var(--ctx-row-h, 40px)', flex: 'none', overflow: 'hidden' }}
    >
      {/* money-1: the scope crumb is a flex-none block with a maxWidth ceiling — its shrink
          factor is 0 so it never gives up width to the job sentence (was: a bare flex child
          whose overflow:hidden implicitly zeroed its flex-basis min, so both children shrank
          proportionally and "Admin" collapsed to "Ad…" on phone width). The maxWidth ceiling
          is only a safety net for an unusually long real-role scope (F3/P1) — ordinary scope
          values ("Café", "Admin") always render in full. */}
      {!headOwnsContext && scope && (
        <span
          className="ctx-scope truncate text-muted-foreground"
          style={{ fontSize: 13, flex: 'none', maxWidth: '60%' }}
        >
          {scope}
        </span>
      )}
      {!headOwnsContext && (
        <b
          className="ctx-job truncate text-foreground"
          style={{ fontSize: 13, fontWeight: 500, flex: '1 1 auto', minWidth: 0 }}
        >
          {t(jobKey)}
        </b>
      )}
    </div>
  )
}
