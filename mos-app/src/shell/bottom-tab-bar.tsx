import type React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { destinationForPath, phoneModuleForViewer } from './module-registry'
import { isShipGated } from '@/lib/ship-gate'
import { HomeIcon, WorkIcon, MoreIcon } from './icons'
import { useIsNarrow } from './use-is-narrow'
import { useAuth } from '@/auth/use-auth'
import { useModuleAvailability } from '@/lib/module-availability'
import type { MessageKey } from '@/i18n/messages'
import { useT } from '@/i18n/use-t'
import './bottom-tab-bar.css'
import { ActionFab } from './action-fab'

type PrimaryTab = {
  id: string
  labelKey: MessageKey
  href: string
  /** widens the active match to a whole section (Work + the role module) */
  sectionPrefix?: string
  Icon: React.FC
}

// The full profile's fixed phone primary tabs. Money is NOT a bottom-nav tab — it lives in the
// More drawer (gated). Work → /work/tasks; `sectionPrefix` widens the active match to the whole
// /work section so the tab carries aria-current="page" for EVERY /work/* child, mirroring the
// desktop rail's `to="/work"` NavLink semantics (Rule 5/9, F-B/OD-64). Profile-gated roots are
// filtered before render; the 3rd slot is the role-scoped module resolved per viewer below.
const HOME: PrimaryTab = { id: 'home', labelKey: 'dest.home', href: '/', Icon: HomeIcon }
const WORK: PrimaryTab = { id: 'work', labelKey: 'dest.work', href: '/work/tasks', sectionPrefix: '/work', Icon: WorkIcon }

// One rule for the quick-create button: it is on every phone page, except where it yields the thumb zone on capture surfaces —
// the Café root and its dedicated production/transfer/waste/Count/Receive/Request/plan/stock/review screens — where
// the surface's own control is the primary action. Match route roots exactly: a `/cafe` prefix
// also swallowed item settings and push history, which are support surfaces where quick capture
// should remain available (and remain after the launcher closes).
const CAPTURE_SURFACE_PATHS = [
  '/cafe', '/cafe/production', '/cafe/transfer', '/cafe/waste', '/cafe/count', '/cafe/receive', '/cafe/request',
  '/cafe/plan', '/cafe/stock', '/cafe/review',
]

// A decision the person must make in one place: no tabs to wander off to, no "+" beside Allow.
const FOCUSED_DECISION_PATHS = ['/oauth/consent']

function isCaptureSurface(pathname: string): boolean {
  return CAPTURE_SURFACE_PATHS.includes(pathname.replace(/\/+$/, '') || '/')
}

function shouldShowActionDock(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/'
  return !isCaptureSurface(path) && path !== '/cafe/records' && !/^\/profile(?:\/|$)/.test(path)
}

type BottomTabBarProps = {
  /** Opens the More menu (the mobile drawer) — its sole opener (v4 shell rebuild, Task 1). */
  onOpenMore?: () => void
  /** Opens the shared Action Launcher/command registry. */
  onOpenActionLauncher?: () => void
  /** Registers the More button as the focus return target for the mobile drawer. */
  onRegisterMoreFocus?: (focus: () => void) => void
  /** Whether the More drawer is currently open (aria-expanded on the More tab, Task 5). */
  moreOpen?: boolean
}

/**
 * BottomTabBar — v4 shell rebuild. Phone bottom-nav = Home · Work · [viewer's module] ·
 * More (destinations only, Task 5). The first up-to-three are primary destinations; More opens
 * the two-zone nav drawer of every OTHER destination. Exactly-one aria-current="page": the
 * active primary tab carries it; when a non-primary destination is active, the breadcrumb LEAF
 * carries it instead (I7 — "rail owns it; breadcrumb leaf when the viewer has no rail entry" —
 * see breadcrumb.tsx), never the More button (Task 3 — More is a door, not a location). The 3rd
 * primary slot is role-scoped (OD-REDESIGN-68): the viewer's module, or omitted for an org-wide
 * role.
 */
export function BottomTabBar({ onOpenMore, onOpenActionLauncher, onRegisterMoreFocus, moreOpen = false }: BottomTabBarProps) {
  const isNarrow = useIsNarrow()
  const t = useT()
  const { pathname } = useLocation()
  const auth = useAuth()
  const viewer = auth.status === 'authenticated' ? auth.viewer : null
  const { isOn } = useModuleAvailability()

  // The third slot names the module in play: the module whose page is open wins; elsewhere the last module the
  // viewer opened, then their affiliation default; with none of the three the slot is omitted rather than made up.
  // This is EMPHASIS only (OD-WAY-51) — every module the viewer's routes admit is listed in the More drawer
  // regardless, so nothing is hidden by not being promoted.
  const moduleDest = viewer ? phoneModuleForViewer(viewer.affiliated, viewer.accessRoles, pathname, isOn) : null
  const moduleTab: PrimaryTab | null = moduleDest
    ? {
        id: moduleDest.id,
        labelKey: moduleDest.labelKey,
        href: moduleDest.primaryPath ?? moduleDest.links[0].path,
        sectionPrefix: `/${(moduleDest.primaryPath ?? moduleDest.links[0].path).split('/')[1]}`,
        Icon: moduleDest.Icon,
      }
    : null

  const primaryTabs: PrimaryTab[] = [HOME, WORK, ...(moduleTab ? [moduleTab] : [])]
    .filter((tab) => !isShipGated(tab.href) && (tab.id !== 'work' || isOn('work')))

  if (!isNarrow || FOCUSED_DECISION_PATHS.includes(pathname)) return null

  const showLauncher = shouldShowActionDock(pathname)
  // More is a door, but on a page no tab covers it is also where the viewer stands: mark it (the
  // breadcrumb leaf still owns aria-current).
  const onPrimaryTab = primaryTabs.some((tab) => {
    const section = tab.sectionPrefix ?? tab.href
    return tab.href === '/' ? pathname === '/' : pathname === section || pathname.startsWith(section + '/')
  })
  const moreIsHere = !onPrimaryTab && destinationForPath(pathname) !== null

  return (
    // Four destinations (Home · Work · the viewer's module · More). Inbox lives on the top-bar bell
    // and in More. Quick create is the floating button, not a tab.
    <div className="bottom-tab-shell" style={{ gridArea: 'tabbar' }}>
      <nav
        aria-label={t('nav.primary')}
        data-overlay-edge="bottom"
        className="bottom-tab-bar"

      >
        <ul className="bottom-tab-list">
            {primaryTabs.map((tab) => {
              // Work (sectionPrefix) matches the whole /work section; other tabs match their href.
              // Home ('/') matches exactly. This keeps exactly one aria-current="page" on every
              // phone route, including /work/signals | /work/projects | /work/objectives (F-B).
              const section = tab.sectionPrefix ?? tab.href
              const active =
                tab.href === '/' ? pathname === '/' : pathname === section || pathname.startsWith(section + '/')
              const label = t(tab.labelKey)
              return (
                <li key={tab.id}>
                  <Link
                    to={tab.href}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    className={`bottom-tab${active ? ' bottom-tab--active' : ''}`}
                  >
                    <span className="bottom-tab-icon" style={{ position: 'relative' }}>
                      <tab.Icon />
                    </span>
                    <span className="bottom-tab-label">{label}</span>
                  </Link>
                </li>
              )
            })}
            <li>
              {/* Task 3/5: More is a door to the two-zone nav drawer, never a location — it carries
                  aria-haspopup/aria-expanded (dialog-disclosure semantics), never aria-current. */}
              <button
                type="button"
                ref={(node) => {
                  if (node) onRegisterMoreFocus?.(() => node.focus())
                }}
                aria-label={t('nav.more')}
                aria-haspopup="dialog"
                aria-expanded={moreOpen}
                className={moreIsHere ? 'bottom-tab bottom-tab--active' : 'bottom-tab'}
                onClick={onOpenMore}
              >
                <span className="bottom-tab-icon">
                  <MoreIcon />
                </span>
                <span className="bottom-tab-label">{t('nav.more')}</span>
              </button>
            </li>
        </ul>
      </nav>
      {showLauncher && <ActionFab onOpen={onOpenActionLauncher} />}
    </div>
  )
}
