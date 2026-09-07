import { Link, matchPath, useLocation } from 'react-router-dom'
import { PageFamilyFrame } from './page-family-frame'
import { PAGE_FAMILY_FRAME_ROUTES } from './page-family-migration'
import { areaTitleKeyForPath } from './destinations'
import { EmptyState } from '@/components/ui/state-kit'
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
 * It exposes no data: only the AREA's label, which every viewer's message catalog already holds.
 *
 * Navigation is untouched (OD-WAY-51): the rail, the More drawer, the tab bar and ⌘K still render
 * admitted routes only. This is the floor under a URL that arrives from outside the nav — never a
 * second, weaker way to advertise a surface.
 *
 * The sentence rides the page head's job-sentence slot rather than a second context strip: the
 * shell ContextRow already goes silent on every route with a page-family head (context-row.tsx),
 * so the head is region 2's sentence on exactly these routes. Two strips would be two sentences.
 */
export function AccessBoundary() {
  const { pathname } = useLocation()
  const t = useT()

  const areaKey = areaTitleKeyForPath(pathname)
  const area = areaKey ? t(areaKey) : t('access.areaFallback')
  const family =
    PAGE_FAMILY_FRAME_ROUTES.find(({ path }) => matchPath(path, pathname) !== null)?.family ??
    'workspace'

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
