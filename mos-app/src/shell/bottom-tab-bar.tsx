import type React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { destinationForPath, primaryModuleForViewer } from './destinations'
import { HomeIcon, WorkIcon, InboxIcon, MoreIcon } from './icons'
import { useIsNarrow } from './use-is-narrow'
import { useAuth } from '@/auth/use-auth'
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import './bottom-tab-bar.css'

type PrimaryTab = {
  id: string
  labelKey: MessageKey
  href: string
  /** widens the active match to a whole section (Work + the role module) */
  sectionPrefix?: string
  Icon: React.FC
}

// The fixed phone primary tabs. Money is NOT a bottom-nav tab — it lives in the More menu
// (gated). Work → /work/tasks; `sectionPrefix` widens the active match to the whole /work
// section so the tab carries aria-current="page" for EVERY /work/* child, mirroring the
// desktop rail's `to="/work"` NavLink semantics (Rule 5/9, F-B/OD-64). The 3rd slot is the
// role-scoped module (OD-REDESIGN-68) — resolved per viewer below.
const HOME: PrimaryTab = { id: 'home', labelKey: 'dest.home', href: '/', Icon: HomeIcon }
const WORK: PrimaryTab = { id: 'work', labelKey: 'dest.work', href: '/work/tasks', sectionPrefix: '/work', Icon: WorkIcon }
const INBOX: PrimaryTab = { id: 'inbox', labelKey: 'dest.inbox', href: '/inbox', Icon: InboxIcon }

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
 * More button carries it (Rule 5 / Rule 9). The 3rd primary slot is role-scoped
 * (OD-REDESIGN-68): the viewer's module, or omitted for an org-wide role.
 */
export function BottomTabBar({ onOpenMore, onOpenActionLauncher }: BottomTabBarProps) {
  const isNarrow = useIsNarrow()
  const t = useT()
  const { pathname } = useLocation()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null

  // OD-REDESIGN-68: the module tab is the viewer's own work, not a hardcoded Café for
  // everyone. A barista sees Café, a roaster sees Roastery; an org-wide role sees no
  // module slot (the rail's rule, applied to the phone bottom-nav). Module routes stay
  // reachable via ⌘K / direct URL — this scopes the NAV, not authorization.
  const moduleDest = viewer ? primaryModuleForViewer(viewer.roles.map((r) => r.name), viewer.accessRoles) : null
  const moduleTab: PrimaryTab | null = moduleDest
    ? {
        id: moduleDest.id,
        labelKey: moduleDest.labelKey,
        href: moduleDest.primaryPath ?? moduleDest.links[0].path,
        sectionPrefix: moduleDest.primaryPath,
        Icon: moduleDest.Icon,
      }
    : null

  const primaryTabs: PrimaryTab[] = moduleTab ? [HOME, WORK, moduleTab, INBOX] : [HOME, WORK, INBOX]
  const primaryIds = new Set(primaryTabs.map((tab) => tab.id))

  if (!isNarrow) return null

  const dest = destinationForPath(pathname)
  const moreActive = !!dest && !primaryIds.has(dest.id)

  return (
    <nav aria-label="Primary" className="bottom-tab-bar" style={{ gridArea: 'tabbar' }}>
      {primaryTabs.map((tab) => {
        // Work (sectionPrefix) matches the whole /work section; other tabs match their href.
        // Home ('/') matches exactly. This keeps exactly one aria-current="page" on every
        // phone route, including /work/signals | /work/projects | /work/objectives (F-B).
        const section = tab.sectionPrefix ?? tab.href
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
