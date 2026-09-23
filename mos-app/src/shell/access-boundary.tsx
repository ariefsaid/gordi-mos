import { Link, Navigate, matchPath, useLocation } from 'react-router-dom'
import { PageFamilyFrame } from './page-family-frame'
import { PAGE_FAMILY_FRAME_ROUTES } from './page-family-migration'
import { areaTitleKeyForPath, destinationForPath, linkTitleKeyForPath, viewerAdmittedToRoute } from './destinations'
import { useSetBoundaryLabel } from './breadcrumb-title'
import { EmptyState } from '@/components/ui/state-kit'
import { isShipGated } from '@/lib/ship-gate'
import { useT } from '@/i18n/use-t'
import { useAuth } from '@/auth/use-auth'
import './access-boundary.css'

/**
 * AccessBoundary — what a typed or shared URL meets when the router admits the viewer to a route
 * and their access does not (OD-WAY-98 (8)).
 *
 * It renders INSIDE the shell frame — page head, sentence, one quiet dashed panel — instead of a
 * silent `<Navigate to="/">`. A redirect answers a question the viewer never asked and reads as a
 * broken link; this names the area and the one person who can change the answer.
 *
 * It exposes no data: only a nav LABEL, which every viewer's message catalog already holds.
 *
 * Navigation is untouched (OD-WAY-51): the rail, the More drawer, the tab bar and ⌘K still render
 * admitted routes only. This is the floor under a URL that arrives from outside the nav — never a
 * second, weaker way to advertise a surface.
 *
 * The fact is said once, in the panel. The page head carries the area's name and no sentence of its
 * own: a head sentence beside the panel title would state the same denial twice.
 *
 * The one control leads back to somewhere the viewer can work. When a single link inside an
 * admitted destination was denied, that is the destination itself (Café Review → Café); when the
 * whole destination was denied, it is Home.
 *
 * `scope` is the ALTITUDE the denial happened at, and only the denying guard knows it: a gate that
 * closes a whole destination names the destination, a capability gate that closes one link inside
 * an admitted destination names the link. Defaulting to `area` keeps the destination-level guards
 * (`RequireAccessRole`, `AdminRoute`) reading as they did.
 */
export type AccessBoundaryProps = {
  /** `area` — the whole destination was denied. `link` — one link inside an admitted destination. */
  scope?: 'area' | 'link'
}

export function AccessBoundary({ scope = 'area' }: AccessBoundaryProps = {}) {
  const { pathname } = useLocation()
  const t = useT()
  const auth = useAuth()
  const accessRoles = auth.status === 'authenticated' ? auth.viewer.accessRoles : []

  // The SHIP GATE wins before the boundary speaks (lib/ship-gate.ts). A gated area is closed to
  // everyone regardless of role — it does not exist yet for anyone — so there is no denial to
  // narrate, and naming it would tell the lowest-privilege viewer that a pre-switch-day area is
  // there. The router swaps the gated LEAF for a forward, but a guard sits ABOVE that leaf and
  // renders in its place, so the leaf never mounts to do the forwarding; asking here is asking in
  // all three guards at once, since all three render this one component.
  const gated = isShipGated(pathname)

  const titleKey =
    (scope === 'link' ? linkTitleKeyForPath(pathname) : null) ?? areaTitleKeyForPath(pathname)
  const area = titleKey ? t(titleKey) : t('access.areaFallback')

  // The shell chrome says the same word the panel does, or nothing (breadcrumb-title.tsx).
  useSetBoundaryLabel(gated ? null : area)

  const family =
    PAGE_FAMILY_FRAME_ROUTES.find(({ path }) => matchPath(path, pathname) !== null)?.family ??
    'workspace'

  if (gated) return <Navigate to="/" replace />

  // The way back: the owning destination when only a link inside it was denied and the viewer is
  // admitted to that destination's own landing route; otherwise Home.
  const owner = scope === 'link' ? destinationForPath(pathname) : null
  const ownerPath = owner?.primaryPath ?? owner?.links[0]?.path ?? null
  const backToOwner =
    owner !== null && ownerPath !== null && ownerPath !== pathname &&
    viewerAdmittedToRoute(ownerPath, accessRoles)

  return (
    <PageFamilyFrame family={family} state="permission" title={area}>
      <EmptyState
        variant="blank"
        icon={<LockGlyph />}
        headingLevel={2}
        className="access-boundary"
        title={t('access.outside', { area })}
        copy={t('access.askAdmin')}
      >
        {/* A real link, not a button: going back is navigation, so it keeps middle-click,
            open-in-new-tab and a hoverable target — the affordances a viewer who just hit a wall
            is most likely to reach for. */}
        {backToOwner ? (
          <Link to={ownerPath} className="btn btn-outline">
            {t('access.backTo', { area: t(owner.labelKey) })}
          </Link>
        ) : (
          <Link to="/" className="btn btn-outline">
            {t('access.backToHome')}
          </Link>
        )}
      </EmptyState>
    </PageFamilyFrame>
  )
}

/** A closed padlock: this state is a restriction, not an empty list. Decorative — the text says it. */
function LockGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  )
}
