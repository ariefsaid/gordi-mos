import { Link, useLocation } from 'react-router-dom'
import { DESTINATIONS, isLive, type Destination } from './destinations'
import { useIsNarrow } from './use-is-narrow'
import { useAuth } from '@/auth/use-auth'
import { useT } from '@/i18n/use-t'
import './bottom-tab-bar.css'

/**
 * A destination's tab is active when the current path matches ANY of its
 * links (not just the primary one) — e.g. Operate stays active across all
 * 5 kitchen routes, not just /kitchen/log. Mirrors sectionForPath's
 * exact-or-prefix match.
 */
function isDestinationActive(d: Destination, pathname: string): boolean {
  return d.links.some((link) => {
    if (link.path === '/') return pathname === '/'
    return pathname === link.path || pathname.startsWith(link.path + '/')
  })
}

/**
 * BottomTabBar — the phone-first primary nav (plan §4.3, ADR-0019 D8).
 * Renders iff narrow; one tab per LIVE destination in DESTINATIONS. The
 * hamburger drawer stays the "more" surface (Admin, locale, secondary
 * routes) — this bar is the primary phone nav, not a replacement for it.
 */
export function BottomTabBar() {
  const isNarrow = useIsNarrow()
  const auth = useAuth()
  const t = useT()
  const { pathname } = useLocation()

  const accessRoles: string[] = auth.status === 'authenticated' ? auth.viewer.accessRoles : []

  if (!isNarrow) return null

  const live = DESTINATIONS.filter((d) => isLive(d, accessRoles))

  return (
    <nav aria-label="Primary" className="bottom-tab-bar" style={{ gridArea: 'tabbar' }}>
      {live.map((d) => {
        const to = d.primaryPath ?? d.links[0].path
        const active = isDestinationActive(d, pathname)
        return (
          <Link
            key={d.id}
            to={to}
            aria-label={t(d.labelKey)}
            aria-current={active ? 'page' : undefined}
            className={`bottom-tab${active ? ' bottom-tab--active' : ''}`}
          >
            <span className="bottom-tab-icon">
              <d.Icon />
            </span>
            <span className="bottom-tab-label">{t(d.labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
