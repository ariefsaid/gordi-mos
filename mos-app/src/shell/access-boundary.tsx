import { Link, Navigate, matchPath, useLocation } from 'react-router-dom'
import { PageFamilyFrame } from './page-family-frame'
import { PAGE_FAMILY_FRAME_ROUTES } from './page-family-migration'
import { areaTitleKeyForPath, linkTitleKeyForPath } from './destinations'
import { useSetBoundaryLabel } from './breadcrumb-title'
import { EmptyState } from '@/components/ui/state-kit'
import { isShipGated } from '@/lib/ship-gate'
import { useT } from '@/i18n/use-t'
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
 * The sentence rides the page head's job-sentence slot rather than a second context strip: the
 * shell ContextRow already goes silent on every route with a page-family head (context-row.tsx),
 * so the head is region 2's sentence on exactly these routes. Two strips would be two sentences.
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

  return (
    <PageFamilyFrame
      family={family}
      state="permission"
      title={area}
      jobSentence={t('access.required')}
    >
      <EmptyState
        variant="blank"
        headingLevel={2}
        className="access-boundary"
        title={t('access.outside', { area })}
        copy={t('access.askAdmin')}
      >
        {/* A real link, not a button: Back to Home is navigation, so it keeps middle-click,
            open-in-new-tab and a hoverable target — the affordances a viewer who just hit a wall
            is most likely to reach for. */}
        <Link to="/" className="btn btn-outline">
          {t('access.backToHome')}
        </Link>
      </EmptyState>
    </PageFamilyFrame>
  )
}
