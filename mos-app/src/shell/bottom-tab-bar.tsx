import { Link, useLocation } from 'react-router-dom'
import { destinationForPath } from './destinations'
import { HomeIcon, WorkIcon, CafeIcon, InboxIcon, MoreIcon } from './icons'
import { useIsNarrow } from './use-is-narrow'
import { useT } from '@/i18n/use-t'
import './bottom-tab-bar.css'

// The 5 fixed primary tabs (convergence mobileNav). Money is NOT a bottom-nav tab —
// it lives in the More menu (gated). Work → /work/tasks; Café → /cafe (redirects to /cafe/log).
// `sectionPrefix` (Work only) widens the active match to the whole /work section so the
// tab carries aria-current="page" for EVERY /work/* child (signals/projects/objectives),
// mirroring the desktop rail's `to="/work"` NavLink semantics (Rule 5/9, F-B/OD-64).
const PRIMARY = [
  { id: 'home', labelKey: 'dest.home', href: '/', Icon: HomeIcon, end: true },
  { id: 'work', labelKey: 'dest.work', href: '/work/tasks', sectionPrefix: '/work', Icon: WorkIcon, end: false },
  { id: 'cafe', labelKey: 'dest.cafe', href: '/cafe', Icon: CafeIcon, end: false },
  { id: 'inbox', labelKey: 'dest.inbox', href: '/inbox', Icon: InboxIcon, end: false },
] as const

const PRIMARY_IDS = new Set(['home', 'work', 'cafe', 'inbox'])

type BottomTabBarProps = {
  /** Opens the More menu (the mobile drawer). */
  onOpenMore?: () => void
  /** Opens the shared Action Launcher/command registry. */
  onOpenActionLauncher?: () => void
}

/**
 * BottomTabBar — Redesign Step 2 (AC-021/022). Phone bottom-nav = Home · Work ·
 * Café · Inbox · More. The first four are primary destinations; More opens the
 * More menu of every authorized non-primary destination. Exactly-one
 * aria-current="page": the active primary tab carries it, OR — when a non-primary
 * destination is active (Events/Money/Ecommerce/Roastery/Admin/Profile) — the
 * More button carries it (Rule 5 / Rule 9).
 */
export function BottomTabBar({ onOpenMore, onOpenActionLauncher }: BottomTabBarProps) {
  const isNarrow = useIsNarrow()
  const t = useT()
  const { pathname } = useLocation()

  if (!isNarrow) return null

  const dest = destinationForPath(pathname)
  const moreActive = !!dest && !PRIMARY_IDS.has(dest.id)

  return (
    <nav aria-label="Primary" className="bottom-tab-bar" style={{ gridArea: 'tabbar' }}>
      {PRIMARY.map((tab) => {
        // Work (sectionPrefix) matches the whole /work section; other tabs match their href.
        // Home ('/') matches exactly. This keeps exactly one aria-current="page" on every
        // phone route, including /work/signals | /work/projects | /work/objectives (F-B).
        const section = 'sectionPrefix' in tab ? tab.sectionPrefix : tab.href
        const active =
          tab.href === '/' ? pathname === '/' : pathname === section || pathname.startsWith(section + '/')
        return (
          <Link
            key={tab.id}
            to={tab.href}
            aria-label={t(tab.labelKey)}
            aria-current={active ? 'page' : undefined}
            className={`bottom-tab${active ? ' bottom-tab--active' : ''}`}
          >
            <span className="bottom-tab-icon">
              <tab.Icon />
            </span>
            <span className="bottom-tab-label">{t(tab.labelKey)}</span>
          </Link>
        )
      })}
      <button
        type="button"
        aria-label={t('nav.more')}
        aria-current={moreActive ? 'page' : undefined}
        className={`bottom-tab${moreActive ? ' bottom-tab--active' : ''}`}
        onClick={onOpenMore}
      >
        <span className="bottom-tab-icon">
          <MoreIcon />
        </span>
        <span className="bottom-tab-label">{t('nav.more')}</span>
      </button>
      {/* OD-61 / OD-REDESIGN-46: the plus only opens the shared command registry;
          it never guesses a default action. */}
      <button
        type="button"
        className="mobile-action-launcher"
        aria-label={t('actionLauncher.open')}
        aria-haspopup="dialog"
        onClick={onOpenActionLauncher}
      >
        <span aria-hidden="true">+</span>
      </button>
    </nav>
  )
}
